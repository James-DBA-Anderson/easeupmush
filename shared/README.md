# Ease Up Mush Shared

Shared utilities for Ease Up Mush browser games.

## Packages

### `@easeupmush/shared/phraseology`

Pompey slang glossary used across the site.

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
