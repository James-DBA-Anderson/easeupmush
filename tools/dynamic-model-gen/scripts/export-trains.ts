import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assembleKit } from "../src/lib/kit.ts";
import { buildEmu } from "../src/lib/trainMesh.ts";

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

function exportGlb(object: THREE.Object3D, file: string) {
  return new Promise<void>((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("Expected a binary GLB"));
          return;
        }
        const bytes = Buffer.from(result);
        writeFileSync(path.join(GENERATED, file), bytes);
        writeFileSync(path.join(GAME_DIR, file), bytes);
        const box = new THREE.Box3().setFromObject(object);
        console.log(
          `Wrote ${file} (${(bytes.length / 1024).toFixed(1)} KB), length ${(box.max.z - box.min.z).toFixed(1)} m`,
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

const kits: Array<["swr" | "southern" | "gwr", string]> = [
  ["swr", "SWR class 450 electric multiple unit"],
  ["southern", "Southern class 377 electric multiple unit"],
  ["gwr", "GWR class 165 diesel multiple unit"],
];

for (const [id, desc] of kits) {
  writeFileSync(
    path.join(GENERATED, `train-${id}.json`),
    JSON.stringify(
      assembleKit(
        { description: desc, kind: "vehicle", style: "low-poly", pose: "standing", palette: "mono", density: "fine" },
        3,
      ),
      null,
      2,
    ),
  );
  await exportGlb(buildEmu(id), `train-${id}.glb`);
}
