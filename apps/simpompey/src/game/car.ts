import * as THREE from "three";

const WHEEL_R = 0.32;
const BODY_LEN = 3.55;
const MAX_SPEED = 26;
const BOOST_SPEED = 38;
const ACCEL = 16;
const BRAKE = 32;
const DRAG = 1.15;
const STEER = 2.05;

export type DriveInput = {
  throttle: number;
  steer: number;
  brake: boolean;
  boost: boolean;
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

  constructor() {
    this.group = createMotor();
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
    this.group.position.set(x, y, z);
    this.group.rotation.y = heading;
  }

  integrate(dt: number, input: DriveInput, blocked: number) {
    const max = input.boost ? BOOST_SPEED : MAX_SPEED;
    const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
    if (input.brake) {
      this.speed += -Math.sign(this.speed) * Math.min(Math.abs(this.speed), BRAKE * dt);
    } else {
      this.speed += throttle * ACCEL * dt;
    }
    const drag = DRAG + (input.boost ? 0 : 0.35);
    this.speed *= Math.exp(-drag * dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -max * 0.45, max);
    if (blocked > 0 && this.speed > 0) this.speed = Math.min(this.speed, 0.4);
    if (blocked < 0 && this.speed < 0) this.speed = Math.max(this.speed, -0.4);

    const grip = THREE.MathUtils.clamp(Math.abs(this.speed) / 5, 0.15, 1);
    const reverse = this.speed < -0.4 ? -1 : 1;
    this.heading += input.steer * reverse * STEER * grip * dt;

    this.spin += (this.speed / WHEEL_R) * dt;
    const turn = input.steer * 0.38;
    for (const wheel of this.wheels) wheel.rotation.x = this.spin;
    for (const wheel of this.frontWheels) wheel.rotation.y = turn;

    this.group.rotation.y = this.heading;
    return this.speed * dt;
  }

  mph() {
    return Math.abs(this.speed) * 2.237;
  }
}
