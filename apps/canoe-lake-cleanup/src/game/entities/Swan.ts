import * as THREE from 'three';

export class Swan {
  private mesh: THREE.Group;
  private scene: THREE.Scene;
  private position: THREE.Vector3;
  private velocity = new THREE.Vector3();
  private targetPosition: THREE.Vector3;
  
  private moveSpeed = 1.5;
  private dropTimer = 0;
  private dropInterval = 8 + Math.random() * 4;
  private shouldDropNext = false;
  
  private changeDirectionTimer = 0;
  private changeDirectionInterval = 3 + Math.random() * 3;

  constructor(position: THREE.Vector3, scene: THREE.Scene) {
    this.scene = scene;
    this.position = position.clone();
    this.targetPosition = this.getRandomTargetPosition();
    
    this.mesh = this.createSwanMesh();
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  private createSwanMesh(): THREE.Group {
    const group = new THREE.Group();
    
    const bodyGeometry = new THREE.SphereGeometry(0.6, 8, 8);
    bodyGeometry.scale(1, 0.8, 1.4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    body.castShadow = true;
    group.add(body);
    
    const neckGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8);
    const neckMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const neck = new THREE.Mesh(neckGeometry, neckMaterial);
    neck.position.set(0, 1.0, 0.4);
    neck.rotation.x = -0.3;
    neck.castShadow = true;
    group.add(neck);
    
    const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 1.5, 0.7);
    head.castShadow = true;
    group.add(head);
    
    const beakGeometry = new THREE.ConeGeometry(0.1, 0.4, 8);
    const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const beak = new THREE.Mesh(beakGeometry, beakMaterial);
    beak.position.set(0, 1.5, 1.0);
    beak.rotation.x = Math.PI / 2;
    beak.castShadow = true;
    group.add(beak);
    
    const wingGeometry = new THREE.SphereGeometry(0.4, 6, 6);
    wingGeometry.scale(0.8, 0.6, 1.2);
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
    
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.5, 0.6, 0);
    leftWing.castShadow = true;
    group.add(leftWing);
    
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(0.5, 0.6, 0);
    rightWing.castShadow = true;
    group.add(rightWing);
    
    return group;
  }

  private getRandomTargetPosition(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 10;
    const inLake = radius < 12;
    
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      inLake ? -0.3 : 0,
      Math.sin(angle) * radius
    );
  }

  public update(delta: number): void {
    this.dropTimer += delta;
    this.changeDirectionTimer += delta;
    
    if (this.changeDirectionTimer >= this.changeDirectionInterval) {
      this.targetPosition = this.getRandomTargetPosition();
      this.changeDirectionTimer = 0;
      this.changeDirectionInterval = 3 + Math.random() * 3;
    }
    
    const direction = new THREE.Vector3()
      .subVectors(this.targetPosition, this.position)
      .normalize();
    
    this.velocity.lerp(direction.multiplyScalar(this.moveSpeed), 5 * delta);
    
    const movement = this.velocity.clone().multiplyScalar(delta);
    this.position.add(movement);
    
    this.mesh.position.copy(this.position);
    
    if (this.velocity.length() > 0.1) {
      const angle = Math.atan2(this.velocity.x, this.velocity.z);
      this.mesh.rotation.y = angle;
    }
    
    const bobAmount = Math.sin(Date.now() * 0.003) * 0.05;
    this.mesh.position.y = this.position.y + bobAmount;
    
    if (this.dropTimer >= this.dropInterval) {
      this.shouldDropNext = true;
      this.dropTimer = 0;
      this.dropInterval = 8 + Math.random() * 4;
    }
  }

  public shouldDrop(): boolean {
    if (this.shouldDropNext && this.position.y >= -0.1) {
      this.shouldDropNext = false;
      return true;
    }
    return false;
  }

  public getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  public getMesh(): THREE.Group {
    return this.mesh;
  }
}
