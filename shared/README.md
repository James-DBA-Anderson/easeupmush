# Ease Up Mush Shared

Shared utilities and pipelines for Ease Up Mush browser games.

## Packages

### `@easeupmush/shared/phraseology`

Pompey slang glossary used across the site.

```javascript
import phraseology from '@easeupmush/shared/phraseology';
```

### `@easeupmush/shared/ply-pipeline`

Comprehensive PLY file processing pipeline for Three.js games.

```javascript
import { parsePly, optimizeForThreeJs } from '@easeupmush/shared/ply-pipeline';
```

**Features:**
- Parse PLY files (ASCII and binary formats)
- Support traditional mesh and Gaussian splat formats
- Optimize for Three.js rendering
- Decimate point clouds for web performance
- Center and scale models
- Generate statistics

**Full documentation:** [PLY_PIPELINE.md](./PLY_PIPELINE.md)

**Example integration:** [ply-loader-example.mjs](./ply-loader-example.mjs)

## CLI Tools

Located in `/tools`:

### PLY CLI

```bash
# Analyze PLY file
node tools/ply-cli.mjs info scan.ply

# Decimate to 25% of vertices
node tools/ply-cli.mjs decimate 0.25 scan.ply

# Center and scale
node tools/ply-cli.mjs center 10 scan.ply
```

## Usage in Games

```javascript
// In your Vite app
import { parsePly } from '@easeupmush/shared/ply-pipeline';

// Load and render
const response = await fetch('/assets/scan.ply');
const buffer = await response.arrayBuffer();
const plyData = await parsePly(buffer);
```

## Development

This is a workspace package managed by npm workspaces.

```bash
# From repo root
npm install

# Run tests
npm test -w @easeupmush/shared
```

## File Formats

### PLY Files

PLY (Polygon File Format) is used for storing 3D scanned assets:

- **Traditional mesh PLY**: Vertex positions, colors, normals
- **Gaussian splat PLY**: Includes scale, rotation, opacity, spherical harmonics
- **Sources**: Scaniverse, Polycam, COLMAP, 3D Gaussian Splatting

**Recommended format:**
- Binary little-endian (smallest file size)
- Include vertex colors for realistic rendering
- Y-up, right-handed coordinate system (Three.js)
- Real-world scale (meters)

## Contributing

Add new shared utilities to this directory with:
1. Implementation file (`.mjs` or `.ts`)
2. Type definitions (`.d.ts`)
3. Documentation (`.md`)
4. Update `package.json` exports

## License

Part of the Ease Up Mush project.
