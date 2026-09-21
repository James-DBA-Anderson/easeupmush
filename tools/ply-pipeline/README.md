# PLY Pipeline

A comprehensive tool for processing PLY files (3D point clouds and meshes) for Three.js browser games.

**Location:** `tools/ply-pipeline/`

## Features

- ✅ Parse PLY files (both ASCII and binary formats)
- ✅ Support traditional mesh PLY files (from Scaniverse, Polycam, etc.)
- ✅ Support Gaussian splat PLY files (scale, rotation, opacity, spherical harmonics)
- ✅ Extract metadata and compute bounding boxes
- ✅ Optimize for Three.js (convert to Float32Array colors)
- ✅ Decimate point clouds to reduce vertex count
- ✅ Center and scale models for consistent sizing
- ✅ Generate detailed statistics

## Installation

The pipeline is available in the tools directory:

```javascript
// In your Three.js app
import { parsePly, optimizeForThreeJs } from '../../tools/ply-pipeline/src/parser.mjs';

// Or use the Three.js loader helpers
import { PlyPointCloudLoader } from '../../tools/ply-pipeline/examples/three-loader.mjs';
```

## CLI Tool

Quick analysis and processing from the command line:

```bash
# Show file statistics
node tools/ply-pipeline/cli.mjs info scan.ply

# Decimate to 25% of original vertices
node tools/ply-pipeline/cli.mjs decimate 0.25 scan.ply

# Center and scale to size 10
node tools/ply-pipeline/cli.mjs center 10 scan.ply

# Optimize for Three.js (outputs JSON)
node tools/ply-pipeline/cli.mjs optimize scan.ply > optimized.json
```

## JavaScript API

### Basic Usage

```javascript
import { readFileSync } from 'fs';
import { parsePly, generateStats } from './tools/ply-pipeline/src/parser.mjs';

// Load and parse
const buffer = readFileSync('scan.ply').buffer;
const plyData = await parsePly(buffer);

// Get statistics
console.log(generateStats(plyData));
```

### Three.js Integration

```javascript
import * as THREE from 'three';
import { parsePly, optimizeForThreeJs, centerAndScale } from './tools/ply-pipeline/src/parser.mjs';

async function loadPlyAsPoints(url) {
  // Fetch the PLY file
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  // Parse and optimize
  let plyData = await parsePly(buffer);
  plyData = centerAndScale(plyData, 10); // Scale to size 10
  const optimized = optimizeForThreeJs(plyData);
  
  // Create Three.js geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(optimized.positions, 3));
  
  if (optimized.colors) {
    geometry.setAttribute('color', new THREE.BufferAttribute(optimized.colors, 3));
  }
  
  if (optimized.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(optimized.normals, 3));
  }
  
  // Create point cloud material
  const material = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: optimized.colors ? true : false,
    sizeAttenuation: true,
  });
  
  // Create and return the mesh
  const points = new THREE.Points(geometry, material);
  return points;
}

// Usage in your scene
const pointCloud = await loadPlyAsPoints('/assets/scan.ply');
scene.add(pointCloud);
```

### Decimation for Web Performance

```javascript
import { parsePly, decimatePly, optimizeForThreeJs } from './tools/ply-pipeline/src/parser.mjs';

async function loadOptimizedPly(url, decimationFactor = 0.5) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  let plyData = await parsePly(buffer);
  
  // Reduce vertex count for better web performance
  plyData = decimatePly(plyData, decimationFactor);
  
  const optimized = optimizeForThreeJs(plyData);
  
  console.log(`Loaded ${optimized.metadata.vertexCount} vertices`);
  
  return optimized;
}
```

## API Reference

### `parsePly(buffer: ArrayBuffer): Promise<PlyData>`

Parse a PLY file buffer and extract all data.

**Returns:** `PlyData` object containing:
- `header`: Format, version, comments, element definitions
- `metadata`: Vertex count, capabilities, bounding box
- `vertices`: Position, color, normal, and Gaussian splat data

### `generateStats(plyData: PlyData): string`

Generate a human-readable statistics summary.

### `optimizeForThreeJs(plyData: PlyData): OptimizedPlyData`

Convert colors from Uint8Array (0-255) to Float32Array (0-1) for Three.js.

### `decimatePly(plyData: PlyData, factor: number): PlyData`

Reduce vertex count by the given factor (0.0-1.0).

**Example:** `decimatePly(data, 0.5)` keeps 50% of vertices.

### `centerAndScale(plyData: PlyData, targetSize?: number): PlyData`

Center the model at origin and scale to fit within the target size (default: 10).

### `toJSON(plyData: PlyData): string`

Export to JSON (warning: only use for small models, very large output).

## File Format Support

### Traditional Mesh PLY (✓ Supported)
```
ply
format binary_little_endian 1.0
element vertex 104289
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
```

### Gaussian Splat PLY (✓ Supported)
```
ply
format binary_little_endian 1.0
element vertex 50000
property float x
property float y
property float z
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
property float opacity
property float f_dc_0
property float f_dc_1
property float f_dc_2
...
end_header
```

## Example: Canoe Lake Integration

Add scanned assets to your Canoe Lake game:

```javascript
// In world/scannedAssets.ts
import { parsePly, optimizeForThreeJs, centerAndScale } from '../../tools/ply-pipeline/src/parser.mjs';

export async function loadScannedBench() {
  const response = await fetch('/assets/scans/bench-victorian.ply');
  const buffer = await response.arrayBuffer();
  
  let plyData = await parsePly(buffer);
  plyData = centerAndScale(plyData, 2); // 2m wide bench
  const optimized = optimizeForThreeJs(plyData);
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(optimized.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(optimized.colors, 3));
  
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  
  return mesh;
}
```

## Performance Tips

1. **Decimate for web**: Start with 0.25-0.5 for initial loading
2. **Use binary format**: 2-3x smaller than ASCII
3. **Compress with gzip**: PLY files compress extremely well
4. **Consider LOD**: Use multiple decimation levels for distance-based quality

## Export Recommendations

When exporting PLY files for this pipeline:

- **Format**: PLY binary (little endian)
- **Include**: Vertex colors for realistic appearance
- **Coordinate system**: Y-up, right-handed (Three.js convention)
- **Scale**: Real-world meters work best

## Test Results

Tested with your uploaded Scaniverse file:

```
=== PLY File Statistics ===

Vertices: 104,289
Format: binary_little_endian
Has Colors: Yes
Has Normals: No
Gaussian Splat: No

Bounding Box:
  Min: [-0.464, -0.182, -0.279]
  Max: [0.286, 0.748, 0.411]
  Center: [-0.089, 0.283, 0.066]
  Size: [0.750, 0.929, 0.690]

File Size: 2,503,173 bytes (estimated)

Source: Created with Scaniverse - https://scaniverse.com
```

✅ Successfully parsed and processed!

## Contributing

The pipeline is in `tools/ply-pipeline/`:
- `src/parser.mjs` - Main parser implementation (JavaScript)
- `src/parser.ts` - TypeScript version with full types
- `src/parser.d.ts` - Type definitions
- `cli.mjs` - Command-line interface
- `examples/three-loader.mjs` - Three.js integration examples

## License

Part of the Ease Up Mush project.
