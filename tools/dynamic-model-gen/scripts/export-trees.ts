import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assembleKit } from "../src/lib/kit.ts";
import {
  buildBroadleafGeometry,
  buildPineGeometry,
  treeMaterial,
} from "../src/lib/treeMesh.ts";

class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onload: ((ev: { target: NodeFileReader }) => void) | null = null;
  onloadend: ((ev: { target: NodeFileReader }) => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      const ev = { target: this };
      this.onload?.(ev);
      this.onloadend?.(ev);
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString("base64")}`;
      const ev = { target: this };
      this.onload?.(ev);
      this.onloadend?.(ev);
    });
  }
}
;(globalThis as { FileReader: typeof NodeFileReader }).FileReader = NodeFileReader;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = path.join(ROOT, "generated");
const GAME_DIR = path.resolve(ROOT, "../../apps/simpompey/public/models");

function exportGlb(mesh: THREE.Mesh, file: string) {
  return new Promise<void>((resolve, reject) => {
    new GLTFExporter().parse(
      mesh,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("Expected a binary GLB"));
          return;
        }
        const bytes = Buffer.from(result);
        writeFileSync(path.join(GENERATED, file), bytes);
        writeFileSync(path.join(GAME_DIR, file), bytes);
        const box = new THREE.Box3().setFromObject(mesh);
        console.log(
          `Wrote ${file} (${(bytes.length / 1024).toFixed(1)} KB), height ${(box.max.y - box.min.y).toFixed(1)} m`,
        );
        resolve();
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

mkdirSync(GENERATED, { recursive: true });
mkdirSync(GAME_DIR, { recursive: true });

writeFileSync(
  path.join(GENERATED, "tree-broadleaf.json"),
  JSON.stringify(assembleKit({ description: "broadleaf oak tree", kind: "prop", style: "low-poly", pose: "standing", palette: "earth", density: "fine" }, 1), null, 2),
);
writeFileSync(
  path.join(GENERATED, "tree-pine.json"),
  JSON.stringify(assembleKit({ description: "pine conifer tree", kind: "prop", style: "low-poly", pose: "standing", palette: "earth", density: "fine" }, 2), null, 2),
);

const mat = treeMaterial();
await exportGlb(new THREE.Mesh(buildBroadleafGeometry(), mat), "tree-broadleaf.glb");
await exportGlb(new THREE.Mesh(buildPineGeometry(), mat.clone()), "tree-pine.glb");
