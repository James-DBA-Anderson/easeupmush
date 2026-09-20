"""Local image generation worker using Diffusers (Intel Mac / CPU fallback)."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import threading
from typing import Optional

import torch
import uvicorn
from diffusers import AutoPipelineForText2Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("DIFFUSERS_MODEL", "stabilityai/sd-turbo")
DEVICE = "cpu"
DTYPE = torch.float32

app = FastAPI(title="Spritebench Diffusers")
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
    width: int = Field(default=512, ge=256, le=1024)
    height: int = Field(default=512, ge=256, le=1024)
    steps: int = Field(default=4, ge=1, le=8)
    seed: Optional[int] = Field(default=None, ge=0)


def get_pipe():
    global _pipe, _load_error, _loading
    if _pipe is not None:
        return _pipe
    with _pipe_lock:
        if _pipe is not None:
            return _pipe
        _loading = True
        try:
            print(f"Loading model {MODEL_ID} on {DEVICE}…", flush=True)
            pipe = AutoPipelineForText2Image.from_pretrained(
                MODEL_ID,
                torch_dtype=DTYPE,
            )
            pipe.to(DEVICE)
            pipe.set_progress_bar_config(disable=True)
            _pipe = pipe
            _load_error = None
            print("Model ready.", flush=True)
            return _pipe
        except Exception as exc:  # noqa: BLE001
            _load_error = str(exc)
            print(f"Model load failed: {exc}", flush=True)
            raise
        finally:
            _loading = False


def run_generation(body: GenerateRequest) -> dict:
    pipe = get_pipe()
    width = body.width - (body.width % 8)
    height = body.height - (body.height % 8)
    generator = None
    if body.seed is not None:
        generator = torch.Generator(device=DEVICE).manual_seed(body.seed)

    result = pipe(
        prompt=body.prompt,
        num_inference_steps=body.steps,
        guidance_scale=0.0,
        width=width,
        height=height,
        generator=generator,
    )
    image = result.images[0]
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return {
        "type": "done",
        "image": base64.b64encode(buf.getvalue()).decode("ascii"),
        "model": MODEL_ID,
        "width": width,
        "height": height,
        "seed": body.seed,
        "prompt": body.prompt,
    }


@app.on_event("startup")
async def preload_model() -> None:
    asyncio.create_task(asyncio.to_thread(get_pipe))


@app.get("/health")
def health():
    return {
        "ok": _load_error is None,
        "ready": _pipe is not None,
        "loading": _loading,
        "model": MODEL_ID,
        "device": DEVICE,
        "error": _load_error,
        "backend": "diffusers",
    }


@app.post("/load")
async def load_model():
    try:
        await asyncio.to_thread(get_pipe)
        return {"ok": True, "model": MODEL_ID}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/generate")
async def generate(body: GenerateRequest):
    async def event_stream():
        yield _ndjson(
            {
                "type": "progress",
                "completed": 0,
                "total": body.steps,
                "phase": "loading" if _pipe is None else "generate",
            }
        )
        try:
            payload = await asyncio.to_thread(run_generation, body)
            yield _ndjson(
                {
                    "type": "progress",
                    "completed": body.steps,
                    "total": body.steps,
                    "phase": "done",
                }
            )
            yield _ndjson(payload)
        except Exception as exc:  # noqa: BLE001
            yield _ndjson({"error": str(exc)})

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


def _ndjson(payload: dict) -> str:
    return json.dumps(payload) + "\n"


if __name__ == "__main__":
    port = int(os.environ.get("DIFFUSERS_PORT", "8790"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
