/** Editor-only persistence for the reference background image + layout. */

export interface RefBackgroundState {
  image: Blob;
  x: number;
  z: number;
  width: number;
  rotDeg: number;
  imageOpacity: number;
  mapOpacity: number;
  /** When true, the photo is mirrored on X (common with some screenshots). */
  flipH?: boolean;
}

const DB_NAME = "canoe-lake-editor";
const DB_VERSION = 1;
const STORE = "refBackground";
const RECORD_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function readRefBackground(): Promise<RefBackgroundState | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onsuccess = () => {
        const v = req.result as RefBackgroundState | undefined;
        if (
          !v ||
          !(v.image instanceof Blob) ||
          typeof v.x !== "number" ||
          typeof v.z !== "number" ||
          typeof v.width !== "number"
        ) {
          resolve(null);
          return;
        }
        resolve({
          image: v.image,
          x: v.x,
          z: v.z,
          width: v.width,
          rotDeg: typeof v.rotDeg === "number" ? v.rotDeg : 0,
          imageOpacity:
            typeof v.imageOpacity === "number" ? v.imageOpacity : 0.45,
          mapOpacity: typeof v.mapOpacity === "number" ? v.mapOpacity : 0.7,
          flipH: !!v.flipH,
        });
      };
      req.onerror = () => reject(req.error ?? new Error("read failed"));
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function writeRefBackground(
  state: RefBackgroundState,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, RECORD_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("write failed"));
  });
}

export async function clearRefBackground(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
    });
  } catch {
    /* ignore */
  }
}
