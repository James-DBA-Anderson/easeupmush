# OSM Terrain Build

Pipeline that fetches **SRTM elevation data** and **OpenStreetMap building/water data** for Portsea Island, Portsmouth, and exports a **Three.js-loadable `.gltf`**.

No external tooling required (no GDAL, JVM, Docker). Pure TypeScript + Node.js using:

- `geotiff` — reads the SRTM GeoTIFF tile directly
- `@xmldom/xmldom` — parses OSM XML
- `three` + custom glTF JSON serializer — builds the mesh and exports a self-contained `.gltf` with embedded base64 buffer

## Data sources

- **Elevation:** SRTM GL1 30m from OpenTopography S3 mirror (tile `N50W001`)
- **OSM features:** Overpass API query for buildings, water areas, and coastline within the Portsea Island bounding box

## Run

From this directory:

```bash
npm run terrain   # download data + build mesh
```

Or step by step:

```bash
npm run fetch       # pull SRTM + OSM (skip if data/ already has them)
npm run build       # run TypeScript pipeline to generate .gltf
```

Output lands in `data/portsmouth-terrain.gltf` and is automatically copied into `apps/simpompey/public/models/`.

## The output

The `.gltf` contains:

- **Terrain** — triangulated SRTM grid for the Portsea Island bbox, green material
- **~22k buildings** — extruded from OSM `building:levels` / `height` tags, grey-blue material
- **Water areas** — flattened polygons at sea level, semi-transparent blue material

Load it in Three.js with `GLTFLoader`:

```ts
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/portsmouth-terrain.gltf');
scene.add(gltf.scene);
```
