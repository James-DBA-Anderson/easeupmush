import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assembleKit } from "../src/lib/kit.ts";
import {
  buildChimneyGeometry,
  buildCraneGeometry,
  buildTankGeometry,
  buildTowerGeometry,
  landmarkMaterial,
} from "../src/lib/landmarkMesh.ts";

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

const kits: Array<[string, string, () => THREE.BufferGeometry]> = [
  ["tower", "brick observation tower", buildTowerGeometry],
  ["chimney", "factory chimney stack", buildChimneyGeometry],
  ["tank", "oil storage tank", buildTankGeometry],
  ["crane", "dockyard portal crane", buildCraneGeometry],
];

const mat = landmarkMaterial();
for (const [id, desc, build] of kits) {
  writeFileSync(
    path.join(GENERATED, `landmark-${id}.json`),
    JSON.stringify(
      assembleKit(
        { description: desc, kind: "prop", style: "low-poly", pose: "standing", palette: "mono", density: "fine" },
        1,
      ),
      null,
      2,
    ),
  );
  await exportGlb(new THREE.Mesh(build(), mat.clone()), `landmark-${id}.glb`);
}
