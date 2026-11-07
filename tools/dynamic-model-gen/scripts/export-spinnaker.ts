import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { assembleKit } from "../src/lib/kit.ts";
import { buildSpinnakerMesh } from "../src/lib/spinnakerMesh.ts";

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
const GAME_GLB = path.resolve(ROOT, "../../apps/simpompey/public/models/spinnaker-tower.glb");

const spec = assembleKit(
  {
    description: "Spinnaker Tower Portsmouth observation tower",
    kind: "prop",
    style: "low-poly",
    pose: "standing",
    palette: "mono",
    density: "fine",
  },
  1,
);

mkdirSync(GENERATED, { recursive: true });
writeFileSync(path.join(GENERATED, "spinnaker-tower.json"), JSON.stringify(spec, null, 2));

const group = buildSpinnakerMesh();
group.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(group);
const height = box.max.y - box.min.y;
const scale = 170 / height;
group.scale.setScalar(scale);
group.position.y = -box.min.y * scale;
group.updateMatrixWorld(true);

await new Promise<void>((resolve, reject) => {
  new GLTFExporter().parse(
    group,
    (result) => {
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Expected a binary GLB"));
        return;
      }
      const bytes = Buffer.from(result);
      writeFileSync(path.join(GENERATED, "spinnaker-tower.glb"), bytes);
      writeFileSync(GAME_GLB, bytes);
      const sized = new THREE.Box3().setFromObject(group);
      console.log(
        `Wrote Spinnaker GLB (${(bytes.length / 1024).toFixed(1)} KB), height ${(sized.max.y - sized.min.y).toFixed(1)} m`,
      );
      resolve();
    },
    (err) => reject(err),
    { binary: true },
  );
});
