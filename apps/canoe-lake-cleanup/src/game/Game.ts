import * as THREE from 'three';
import { Player } from './Player';
import { Swan } from './entities/Swan';
import { Dropping } from './entities/Dropping';

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private player: Player;
  private swans: Swan[] = [];
  private droppings: Dropping[] = [];
  
  private clock: THREE.Clock;
  private cleanliness: number = 100;
  private score: number = 0;
  
  private cleanlinessElement: HTMLElement;
  private cleanlinessBar: HTMLElement;
  private scoreElement: HTMLElement;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
    
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.7, 5);
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    const container = document.getElementById('game-container');
    if (container) {
      container.appendChild(this.renderer.domElement);
    }
    
    this.clock = new THREE.Clock();
    this.player = new Player(this.camera, this.renderer.domElement, this);
    
    this.cleanlinessElement = document.getElementById('cleanliness-value')!;
    this.cleanlinessBar = document.getElementById('cleanliness-fill')!;
    this.scoreElement = document.getElementById('score-value')!;
    
    this.setupScene();
    this.setupLights();
    this.spawnSwans();
    
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private setupScene(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ 
        color: 0x4a7c4e,
        roughness: 0.8,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    const pathGeometry = new THREE.PlaneGeometry(60, 3);
    const pathMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xa0a0a0,
      roughness: 0.9,
    });
    
    const path1 = new THREE.Mesh(pathGeometry, pathMaterial);
    path1.rotation.x = -Math.PI / 2;
    path1.position.set(0, 0.01, 0);
    path1.receiveShadow = true;
    this.scene.add(path1);
    
    const path2 = new THREE.Mesh(pathGeometry, pathMaterial);
    path2.rotation.x = -Math.PI / 2;
    path2.rotation.z = Math.PI / 2;
    path2.position.set(0, 0.01, 0);
    path2.receiveShadow = true;
    this.scene.add(path2);
    
    const lakeGeometry = new THREE.CircleGeometry(12, 32);
    const lakeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4a90a0,
      roughness: 0.3,
      metalness: 0.2,
    });
    const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, 0.005, 0);
    this.scene.add(lake);
    
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const treeGeometry = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
      const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3520 });
      const trunk = new THREE.Mesh(treeGeometry, treeMaterial);
      trunk.position.set(x, 2, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      
      const foliageGeometry = new THREE.SphereGeometry(2.5, 8, 8);
      const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5016 });
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(x, 5, z);
      foliage.castShadow = true;
      this.scene.add(foliage);
    }
    
    const fortWallGeometry = new THREE.BoxGeometry(20, 3, 1);
    const fortWallMaterial = new THREE.MeshStandardMaterial({ color: 0x7a7568 });
    const fortWall = new THREE.Mesh(fortWallGeometry, fortWallMaterial);
    fortWall.position.set(18, 1.5, 0);
    fortWall.castShadow = true;
    fortWall.receiveShadow = true;
    this.scene.add(fortWall);
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 30, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  private spawnSwans(): void {
    const swanCount = 5;
    for (let i = 0; i < swanCount; i++) {
      const angle = (i / swanCount) * Math.PI * 2;
      const radius = 8 + Math.random() * 5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const swan = new Swan(new THREE.Vector3(x, 0, z), this.scene);
      this.swans.push(swan);
    }
  }

  public addDropping(position: THREE.Vector3): void {
    const dropping = new Dropping(position, this.scene);
    this.droppings.push(dropping);
  }

  public tryCleanDropping(raycaster: THREE.Raycaster): boolean {
    for (let i = this.droppings.length - 1; i >= 0; i--) {
      const dropping = this.droppings[i];
      const intersects = raycaster.intersectObject(dropping.getMesh());
      
      if (intersects.length > 0 && intersects[0].distance < 10) {
        dropping.clean();
        if (dropping.isCleaned()) {
          this.scene.remove(dropping.getMesh());
          this.droppings.splice(i, 1);
          this.score += 10;
          this.updateHUD();
          return true;
        }
      }
    }
    return false;
  }

  private updateCleanliness(delta: number): void {
    const droppingCount = this.droppings.length;
    const maxDroppings = 30;
    const targetCleanliness = Math.max(0, 100 - (droppingCount / maxDroppings) * 100);
    
    const changeRate = 20 * delta;
    if (this.cleanliness > targetCleanliness) {
      this.cleanliness = Math.max(targetCleanliness, this.cleanliness - changeRate);
    } else {
      this.cleanliness = Math.min(targetCleanliness, this.cleanliness + changeRate);
    }
    
    this.updateHUD();
  }

  private updateHUD(): void {
    this.cleanlinessElement.textContent = Math.round(this.cleanliness).toString();
    this.cleanlinessBar.style.width = `${this.cleanliness}%`;
    
    this.cleanlinessBar.classList.remove('warning', 'danger');
    if (this.cleanliness < 30) {
      this.cleanlinessBar.classList.add('danger');
    } else if (this.cleanliness < 60) {
      this.cleanlinessBar.classList.add('warning');
    }
    
    this.scoreElement.textContent = this.score.toString();
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    
    const delta = this.clock.getDelta();
    
    this.player.update(delta);
    
    this.swans.forEach(swan => {
      swan.update(delta);
      if (swan.shouldDrop()) {
        this.addDropping(swan.getPosition().clone());
      }
    });
    
    this.updateCleanliness(delta);
    
    this.renderer.render(this.scene, this.camera);
  };

  public start(): void {
    this.animate();
  }
}
