/**
 * Local text-to-mesh worker using Diffusers Shap-E (CPU).
 */
from __future__ import annotations

import os
import tempfile
import threading
from typing import Optional

import torch
import trimesh
import uvicorn
from diffusers import ShapEPipeline
from diffusers.utils import export_to_ply
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("SHAPE_E_MODEL", "openai/shap-e")
DEVICE = "cpu"
DTYPE = torch.float32
DEFAULT_STEPS = 16
MAX_STEPS = 32

app = FastAPI(title="Meshbench Shap-E")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipe = None
_pipe_lock = threading.Lock()
_load_error: Optional[str] = None
_loading = False


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    steps: int = Field(default=DEFAULT_STEPS, ge=8, le=MAX_STEPS)
    seed: Optional[int] = Field(default=None, ge=0)
    guidance_scale: float = Field(default=15.0, ge=1.0, le=30.0)
    frame_size: int = Field(default=64, ge=32, le=128)


def get_pipe():
    global _pipe, _load_error, _loading
    if _pipe is not None:
        return _pipe
    with _pipe_lock:
        if _pipe is not None:
            return _pipe
        _loading = True
        try:
            print(f"Loading {MODEL_ID} on {DEVICE}…", flush=True)
            pipe = ShapEPipeline.from_pretrained(MODEL_ID, torch_dtype=DTYPE)
            pipe.to(DEVICE)
            if hasattr(pipe, "enable_attention_slicing"):
                pipe.enable_attention_slicing()
            pipe.set_progress_bar_config(disable=True)
            _pipe = pipe
            _load_error = None
            print("Shap-E ready.", flush=True)
            return _pipe
        except Exception as exc:  # noqa: BLE001
            _load_error = str(exc)
            raise
        finally:
            _loading = False


@app.get("/health")
def health():
    return {
        "ok": _pipe is not None or _load_error is None,
        "ready": _pipe is not None,
        "loading": _loading,
        "error": _load_error,
        "device": DEVICE,
        "model": MODEL_ID,
    }


@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        pipe = get_pipe()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    generator = None
    if req.seed is not None:
        generator = torch.Generator(device="cpu").manual_seed(req.seed)

    try:
        result = pipe(
            req.prompt,
            guidance_scale=req.guidance_scale,
            num_inference_steps=req.steps,
            frame_size=req.frame_size,
            output_type="mesh",
            generator=generator,
        )
        mesh = result.images[0]
        with tempfile.TemporaryDirectory() as tmp:
            ply_path = os.path.join(tmp, "mesh.ply")
            glb_path = os.path.join(tmp, "mesh.glb")
            export_to_ply(mesh, ply_path)
            loaded = trimesh.load(ply_path, force="mesh")
            loaded.export(glb_path)
            with open(glb_path, "rb") as handle:
                data = handle.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    import base64

    return {
        "ok": True,
        "glb": base64.b64encode(data).decode("ascii"),
        "model": MODEL_ID,
        "steps": req.steps,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SHAPE_E_PORT", "8791")))
