import * as THREE from "three";

const WHEEL_R = 0.32;
const BODY_LEN = 3.55;
const WHEELBASE = 2.45;
const MAX_SPEED = 24;
const BOOST_SPEED = 34;
const ACCEL = 15;
const BRAKE = 30;
const STEER_RESP = 11;

export type DriveInput = {
  throttle: number;
  steer: number;
  brake: boolean;
  boost: boolean;
  onRoad: boolean;
  wall: THREE.Vector3 | null;
};

export function createMotor(): THREE.Group {
  const root = new THREE.Group();
  root.name = "motor";

  const paint = new THREE.MeshLambertMaterial({ color: 0xf0a23a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c262c });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x6f8ea3,
    transparent: true,
    opacity: 0.55,
  });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x121212 });
  const light = new THREE.MeshBasicMaterial({ color: 0xfff1c2 });

  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.52, BODY_LEN), paint);
  shell.position.y = 0.58;
  shell.castShadow = true;
  shell.receiveShadow = true;
  root.add(shell);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.5, 1.55), glass);
  cabin.position.set(0, 0.98, -0.18);
  cabin.castShadow = true;
  root.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.42), paint);
  roof.position.set(0, 1.24, -0.18);
  roof.castShadow = true;
  root.add(roof);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.2, 0.16), dark);
  bumperF.position.set(0, 0.4, 1.78);
  root.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -1.78;
  root.add(bumperR);

  const lampGeo = new THREE.BoxGeometry(0.28, 0.12, 0.08);
  const lampL = new THREE.Mesh(lampGeo, light);
  lampL.position.set(-0.52, 0.52, 1.84);
  const lampR = lampL.clone();
  lampR.position.x = 0.52;
  root.add(lampL, lampR);

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const frontWheels: THREE.Mesh[] = [];
  const wheels: THREE.Mesh[] = [];
  for (const [x, z, front] of [
    [0.78, 1.12, true],
    [-0.78, 1.12, true],
    [0.78, -1.18, false],
    [-0.78, -1.18, false],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, rubber);
    wheel.position.set(x, WHEEL_R, z);
    wheel.castShadow = true;
    root.add(wheel);
    wheels.push(wheel);
    if (front) frontWheels.push(wheel);
  }

  root.userData.wheels = wheels;
  root.userData.frontWheels = frontWheels;
  return root;
}

export class Motor {
  readonly group: THREE.Group;
  speed = 0;
  heading = 0;
  private wheels: THREE.Mesh[];
  private frontWheels: THREE.Mesh[];
  private spin = 0;
  private steer = 0;
  private vx = 0;
  private vz = 0;
  private roll = 0;
  private pitch = 0;

  constructor() {
    this.group = createMotor();
    this.group.rotation.order = "YXZ";
    this.wheels = this.group.userData.wheels as THREE.Mesh[];
    this.frontWheels = this.group.userData.frontWheels as THREE.Mesh[];
  }

  get position() {
    return this.group.position;
  }

  forward(out: THREE.Vector3) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  place(x: number, y: number, z: number, heading: number) {
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.vx = 0;
    this.vz = 0;
    this.roll = 0;
    this.pitch = 0;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading, 0);
  }

  integrate(dt: number, input: DriveInput) {
    const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
    const onRoad = input.onRoad;
    const top = (input.boost && onRoad ? BOOST_SPEED : MAX_SPEED) * (onRoad ? 1 : 0.72);
    const reverseTop = top * 0.42;

    if (input.brake) {
      this.speed += -Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    } else {
      const t = Math.abs(this.speed) / Math.max(1, throttle < 0 ? reverseTop : top);
      const punch = throttle >= 0 ? 1 - t * t * 0.7 : 0.58;
      this.speed += throttle * ACCEL * punch * (onRoad ? 1 : 0.72) * dt;
    }

    const coast = input.brake ? 0.2 : input.boost && onRoad ? 0.35 : onRoad ? 0.72 : 1.35;
    this.speed *= Math.exp(-coast * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -reverseTop, top);

    const wantSteer = THREE.MathUtils.clamp(input.steer, -1, 1);
    this.steer += (wantSteer - this.steer) * (1 - Math.exp(-STEER_RESP * dt));
    const slow = 1 - THREE.MathUtils.smoothstep(Math.abs(this.speed), 5, 22);
    const maxAngle = 0.16 + 0.7 * slow;
    const angle = this.steer * maxAngle;
    const slip = Math.abs(this.speed) < 0.35 ? (Math.abs(throttle) > 0.05 ? 1.1 : 0.45) : 0;
    this.heading += this.speed * Math.tan(angle) / WHEELBASE * dt;
    this.heading += this.steer * slip * dt;

    const wantX = Math.sin(this.heading) * this.speed;
    const wantZ = Math.cos(this.heading) * this.speed;
    const grip = onRoad ? (input.boost ? 12 : 9.2) : 4.6;
    const catchUp = 1 - Math.exp(-grip * dt);
    this.vx += (wantX - this.vx) * catchUp;
    this.vz += (wantZ - this.vz) * catchUp;

    const wall = input.wall;
    if (wall) {
      const into = this.vx * wall.x + this.vz * wall.z;
      if (into < 0) {
        this.vx -= into * wall.x * 1.18;
        this.vz -= into * wall.z * 1.18;
        this.speed *= 0.78;
      }
    }

    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    this.spin += (this.speed / WHEEL_R) * dt;
    const turn = angle * 0.92;
    for (const wheel of this.wheels) wheel.rotation.x = this.spin;
    for (const wheel of this.frontWheels) wheel.rotation.y = turn;

    const lean = THREE.MathUtils.clamp(Math.abs(this.speed) / 16, 0, 1);
    this.roll += (-this.steer * lean * 0.11 - this.roll) * (1 - Math.exp(-10 * dt));
    this.pitch += (-throttle * 0.035 - this.pitch) * (1 - Math.exp(-8 * dt));
    this.group.rotation.set(this.pitch, this.heading, this.roll);
  }

  mph() {
    return Math.abs(this.speed) * 2.237;
  }
}
