# Ease Up Mush Shared

Shared utilities for Ease Up Mush browser games.

## Packages

### `@easeupmush/shared/tool-switch`

Click-the-logo menu that opens the other local benches (level editor, Spritebench, Meshbench, Linebench) in a new tab.

### `@easeupmush/shared/dialogue`

Shared types and helpers for a game's spoken-line catalog. Each game keeps its own catalog (see Canoe Lake `src/dialogue/`) so Linebench can import it on load.

```javascript
import phraseology from '@easeupmush/shared/phraseology';
```

## Tools

### PLY Pipeline

Comprehensive PLY file processing pipeline for Three.js games has been moved to its own directory:

**Location:** `tools/ply-pipeline/`

See the [PLY Pipeline documentation](../tools/ply-pipeline/README.md) for details.

## Usage in Games

```javascript
// Import phraseology
import phraseology from '@easeupmush/shared/phraseology';

// For PLY processing, see tools/ply-pipeline/
```

## Development

This is a workspace package managed by npm workspaces.

```bash
# From repo root
npm install
```

## Contributing

Add new shared utilities to this directory with:
1. Implementation file (`.mjs` or `.ts`)
2. Type definitions (`.d.ts`)
3. Documentation (`.md`)
4. Update `package.json` exports

For larger tools with multiple files, create a separate directory under `tools/` instead.

## License

Part of the Ease Up Mush project.
