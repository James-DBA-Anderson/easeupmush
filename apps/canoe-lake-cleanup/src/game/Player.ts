import * as THREE from 'three';
import type { Game } from './Game';
import { MobileControls } from './MobileControls';

export class Player {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private game: Game;
  private mobileControls: MobileControls;
  
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private isSpraying = false;
  
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private locked = false;
  
  private raycaster = new THREE.Raycaster();
  private sprayIndicator: HTMLElement;
  
  private moveSpeed = 5.0;
  private mouseSensitivity = 0.002;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, game: Game) {
    this.camera = camera;
    this.domElement = domElement;
    this.game = game;
    
    this.sprayIndicator = document.getElementById('spray-indicator')!;
    this.mobileControls = new MobileControls();
    
    this.setupPointerLock();
    this.setupEventListeners();
  }

  private setupPointerLock(): void {
    this.domElement.addEventListener('click', () => {
      if (!this.locked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('pointerlockerror', () => {
      console.error('Pointer lock error');
    });
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keyup', (event) => this.onKeyUp(event));
    document.addEventListener('mousedown', (event) => this.onMouseDown(event));
    document.addEventListener('mouseup', (event) => this.onMouseUp(event));
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Escape':
        if (this.locked) {
          document.exitPointerLock();
        }
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0 && this.locked) {
      this.isSpraying = true;
      this.sprayIndicator.classList.add('spraying');
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      this.isSpraying = false;
      this.sprayIndicator.classList.remove('spraying');
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.locked || this.mobileControls.isEnabled()) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= movementX * this.mouseSensitivity;
    this.euler.x -= movementY * this.mouseSensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  public update(delta: number): void {
    const usingMobile = this.mobileControls.isEnabled();
    
    if (!this.locked && !usingMobile) return;

    if (usingMobile) {
      const lookDelta = this.mobileControls.getLookDelta();
      if (lookDelta.x !== 0 || lookDelta.y !== 0) {
        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= lookDelta.x;
        this.euler.x -= lookDelta.y;
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
        this.camera.quaternion.setFromEuler(this.euler);
      }
    }

    const damping = 10.0;
    this.velocity.x -= this.velocity.x * damping * delta;
    this.velocity.z -= this.velocity.z * damping * delta;

    if (usingMobile) {
      const mobileInput = this.mobileControls.getMoveInput();
      this.direction.x = mobileInput.x;
      this.direction.z = mobileInput.y;
      
      const length = this.direction.length();
      if (length > 0) {
        this.direction.normalize();
        this.velocity.x -= this.direction.x * this.moveSpeed * delta;
        this.velocity.z -= this.direction.z * this.moveSpeed * delta;
      }
      
      if (this.mobileControls.getIsSpraying()) {
        this.isSpraying = true;
        this.sprayIndicator.classList.add('spraying');
      } else {
        this.isSpraying = false;
        this.sprayIndicator.classList.remove('spraying');
      }
    } else {
      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      if (this.moveForward || this.moveBackward) {
        this.velocity.z -= this.direction.z * this.moveSpeed * delta;
      }
      if (this.moveLeft || this.moveRight) {
        this.velocity.x -= this.direction.x * this.moveSpeed * delta;
      }
    }

    const moveVector = new THREE.Vector3();
    moveVector.copy(this.velocity).multiplyScalar(delta);
    moveVector.applyQuaternion(this.camera.quaternion);
    
    this.camera.position.add(moveVector);
    this.camera.position.y = 1.7;
    
    const maxDistance = 40;
    if (this.camera.position.length() > maxDistance) {
      this.camera.position.setLength(maxDistance);
    }

    if (this.isSpraying) {
      this.spray();
    }
  }

  private spray(): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.game.tryCleanDropping(this.raycaster);
  }
}
