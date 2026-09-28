# Meshbench

Local web app for **generating and editing 3D game models**. Not shipped with the site — this is a repo tool, sibling to Spritebench.

From the monorepo root:

```bash
npm run models
```

Or from this folder:

```bash
npm run dev
```

- App: http://localhost:5174
- API: http://localhost:8788
- Shap-E worker: http://localhost:8791 (optional)

GLBs and JSON kits land in `generated/` (gitignored). Export from the editor, then drop the GLB into a game’s `public/` folder.

## Prompt builder

Kind, style, pose, palette, and detail compile into a prompt the same way Spritebench compiles sprite options. Generate asks the local model for nested primitive parts (parent groups, eye/limb recipes) like canoe-lake props, then you can orbit the mesh in the viewport.

## Edit in place

After a generate (or after dropping an OBJ/GLB on the viewport):

- **Orbit / Move / Rotate / Scale** — gizmos on the whole model
- **Cut** — click nodes along the cut (three or more). The amber plane is fitted through those nodes. Cut inserts new vertices on both pieces so the split sits on that plane. Name each new object.
- **Nodes** — click a vertex, then drag axis gizmos. Right-click to insert a vertex. Zoom in on dense scans to see more nodes.
- **Inflate / Smooth** — click-drag sculpt on the surface
- **Ground / Recenter** — sit it on the floor, centre XZ
- Click a kit part to recolour it, or **Add shape** in the inspector to drop a new cube/sphere/etc.
- **Textures** — if the import included a map (OBJ+MTL+image or GLB), toggle the file texture on or off. Off is the untextured look.
- **Timeline** — **Add frame**, mutate the mesh (move parts, sculpt, nodes), **Add frame** again. Play scrubs between poses. **Save frame** writes the live mesh into the selected key. Topology (vertex count per part) must stay the same across frames.
- **Export clip** — GLB with morph + TRS animation. Drop it in a game `public/` folder and play with Three.js:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const gltf = await new GLTFLoader().loadAsync('/models/hero-anim.glb')
scene.add(gltf.scene)
const mixer = new THREE.AnimationMixer(gltf.scene)
mixer.clipAction(gltf.animations[0]).play()
// in your loop: mixer.update(dt)
```

- **Export GLB** — downloads and saves under `generated/` (includes the clip if you added two or more frames)

## Backends

| Backend | When | What you get |
| --- | --- | --- |
| Option kit | Always | Stylised mesh from your options + seed |
| Ollama | Chat model running locally | AI builds a new primitive layout from your description |
| Shap-E | After `npm run setup:models` | Neural text-to-mesh (CPU, slow, blob-like) |

On this machine there is no GPU. Shap-E still runs on CPU if you install the venv; first generate downloads `openai/shap-e` (~1.5GB). Meshbench prefers **Ollama** for New model / Edit model (kit layouts from a chat model). Shap-E is optional.

```bash
# from repo root — starts Ollama if needed and pulls qwen2.5 (7B default)
npm run setup:ollama

# optional neural meshes
npm run setup:models
```

Force a backend with `MODEL_BACKEND=ollama|shap-e|kit`.

## Stack

- Vite + React prompt builder
- Three.js viewport (orbit, transform, sculpt)
- Express API
- Optional Diffusers Shap-E worker
