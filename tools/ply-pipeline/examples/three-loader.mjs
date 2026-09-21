/**
 * PLY Loader Example for Three.js
 * Shows how to integrate PLY files into Ease Up Mush games
 */

import * as THREE from 'three';
import { parsePly, optimizeForThreeJs, centerAndScale, decimatePly } from '../src/parser.mjs';

/**
 * Simple PLY point cloud loader
 */
export class PlyPointCloudLoader {
  /**
   * Load a PLY file as a Three.js Points object
   * @param {string} url - URL to PLY file
   * @param {object} options - Loading options
   * @returns {Promise<THREE.Points>}
   */
  static async load(url, options = {}) {
    const {
      decimation = 1.0,      // 0.0-1.0, reduce vertices
      targetSize = null,     // Auto-scale to this size
      pointSize = 0.02,      // Point size in world units
      sizeAttenuation = true // Scale points with distance
    } = options;

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load PLY: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    
    // Parse PLY
    let plyData = await parsePly(buffer);
    
    console.log(`Loaded ${plyData.metadata.vertexCount.toLocaleString()} vertices from ${url}`);
    
    // Apply decimation if requested
    if (decimation < 1.0) {
      plyData = decimatePly(plyData, decimation);
      console.log(`Decimated to ${plyData.metadata.vertexCount.toLocaleString()} vertices`);
    }
    
    // Center and scale if requested
    if (targetSize) {
      plyData = centerAndScale(plyData, targetSize);
      console.log(`Scaled to size ${targetSize}`);
    }
    
    // Optimize for Three.js
    const optimized = optimizeForThreeJs(plyData);
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(optimized.positions, 3));
    
    if (optimized.colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(optimized.colors, 3));
    }
    
    geometry.computeBoundingSphere();
    
    // Create material
    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: optimized.colors ? true : false,
      sizeAttenuation,
    });
    
    // Create and return points
    const points = new THREE.Points(geometry, material);
    points.userData.plyMetadata = optimized.metadata;
    
    return points;
  }
}

/**
 * PLY mesh loader (converts point cloud to mesh)
 */
export class PlyMeshLoader {
  /**
   * Load a PLY file as a Three.js Mesh
   * @param {string} url 
   * @param {object} options 
   * @returns {Promise<THREE.Mesh>}
   */
  static async load(url, options = {}) {
    const {
      decimation = 1.0,
      targetSize = null,
      material = null,
    } = options;

    // Fetch and parse
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    let plyData = await parsePly(buffer);
    
    // Apply transformations
    if (decimation < 1.0) {
      plyData = decimatePly(plyData, decimation);
    }
    
    if (targetSize) {
      plyData = centerAndScale(plyData, targetSize);
    }
    
    const optimized = optimizeForThreeJs(plyData);
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(optimized.positions, 3));
    
    if (optimized.colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(optimized.colors, 3));
    }
    
    // Use provided material or create default
    const meshMaterial = material || new THREE.MeshBasicMaterial({
      vertexColors: optimized.colors ? true : false,
    });
    
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.userData.plyMetadata = optimized.metadata;
    
    return mesh;
  }
}

/**
 * Example: Load scanned park asset for Canoe Lake
 */
export async function loadScannedParkAsset(assetName, scene) {
  const assetConfigs = {
    'bench-victorian': {
      url: '/assets/scans/bench-victorian.ply',
      decimation: 0.5,
      targetSize: 2.0,  // 2 meters wide
      pointSize: 0.01,
      positions: [
        { x: -50, z: 20, rotation: Math.PI * 0.5 },
        { x: 50, z: -20, rotation: Math.PI * -0.3 },
      ],
    },
    'swan-statue': {
      url: '/assets/scans/swan-statue.ply',
      decimation: 0.3,
      targetSize: 1.5,
      pointSize: 0.008,
      positions: [
        { x: 0, z: 0, rotation: 0 },
      ],
    },
    'oak-tree': {
      url: '/assets/scans/holm-oak.ply',
      decimation: 0.4,
      targetSize: 8.0,  // 8 meters tall
      pointSize: 0.02,
      positions: [
        { x: -60, z: 30, rotation: 0 },
        { x: 60, z: 30, rotation: Math.PI * 0.2 },
        { x: -60, z: -30, rotation: Math.PI * 0.4 },
      ],
    },
  };
  
  const config = assetConfigs[assetName];
  if (!config) {
    throw new Error(`Unknown asset: ${assetName}`);
  }
  
  // Load the point cloud once
  const basePoints = await PlyPointCloudLoader.load(config.url, {
    decimation: config.decimation,
    targetSize: config.targetSize,
    pointSize: config.pointSize,
  });
  
  // Clone and position multiple instances
  const instances = [];
  
  for (const pos of config.positions) {
    const instance = basePoints.clone();
    instance.position.set(pos.x, 0, pos.z);
    instance.rotation.y = pos.rotation;
    scene.add(instance);
    instances.push(instance);
  }
  
  console.log(`Added ${instances.length} instances of ${assetName}`);
  
  return instances;
}

/**
 * Example: Preload all scanned assets
 */
export async function preloadAllScannedAssets() {
  const assets = [
    'bench-victorian',
    'swan-statue',
    'oak-tree',
  ];
  
  const loaded = {};
  
  for (const assetName of assets) {
    try {
      const tempScene = new THREE.Scene();
      const instances = await loadScannedParkAsset(assetName, tempScene);
      loaded[assetName] = instances[0]; // Keep reference to first instance
      console.log(`✓ Preloaded ${assetName}`);
    } catch (error) {
      console.warn(`Failed to preload ${assetName}:`, error.message);
    }
  }
  
  return loaded;
}

/**
 * Example: Dynamic LOD based on distance
 */
export class PlyLODLoader {
  constructor(url) {
    this.url = url;
    this.lods = null;
  }
  
  /**
   * Load multiple LOD levels
   */
  async load() {
    // Fetch once
    const response = await fetch(this.url);
    const buffer = await response.arrayBuffer();
    const plyData = await parsePly(buffer);
    
    this.lods = new THREE.LOD();
    
    // High detail (close)
    const high = this.createLOD(plyData, 1.0, 0.005);
    this.lods.addLevel(high, 0);
    
    // Medium detail
    const medium = this.createLOD(plyData, 0.5, 0.01);
    this.lods.addLevel(medium, 10);
    
    // Low detail (far)
    const low = this.createLOD(plyData, 0.2, 0.02);
    this.lods.addLevel(low, 30);
    
    return this.lods;
  }
  
  /**
   * Create one LOD level
   */
  createLOD(plyData, decimation, pointSize) {
    let levelData = plyData;
    
    if (decimation < 1.0) {
      levelData = decimatePly(plyData, decimation);
    }
    
    const optimized = optimizeForThreeJs(levelData);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(optimized.positions, 3));
    
    if (optimized.colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(optimized.colors, 3));
    }
    
    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: optimized.colors ? true : false,
      sizeAttenuation: true,
    });
    
    return new THREE.Points(geometry, material);
  }
}

/**
 * Example: Integration with Canoe Lake Game.ts
 * 
 * In your Game.ts constructor:
 * 
 * ```typescript
 * import { loadScannedParkAsset } from './loaders/plyLoader';
 * 
 * // In constructor after scene setup
 * async initScannedAssets() {
 *   // Load benches
 *   await loadScannedParkAsset('bench-victorian', this.scene);
 *   
 *   // Load trees
 *   await loadScannedParkAsset('oak-tree', this.scene);
 *   
 *   console.log('✓ Scanned assets loaded');
 * }
 * ```
 */
