import { askJim, initialChat, type ChatState } from "./chat";
import { createJim, drawJim, SRC_H, SRC_W, type JimAnim } from "./jim";
import { MAX_USER_CHARS } from "./prompt";

function el<T extends HTMLElement>(id: string, kind: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`Missing #${id}`);
  return node;
}

const stage = el("stage", HTMLElement);
const canvas = el("jim", HTMLCanvasElement);
const form = el("talk", HTMLFormElement);
const input = el("say", HTMLInputElement);
const bubble = el("bubble", HTMLElement);
const you = el("you", HTMLElement);
const line = el("line", HTMLElement);

const src = createJim();
const gfx = canvas.getContext("2d");
if (!gfx) throw new Error("No 2d context");
const ctx: CanvasRenderingContext2D = gfx;

let state: ChatState = initialChat();
let talkUntil = performance.now() / 1000 + 2.4;
let busy = false;
let start = performance.now();

input.maxLength = MAX_USER_CHARS;
paintText(state);
resize();
requestAnimationFrame(frame);
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
input.focus();

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = input.value.replace(/\s+/g, " ").trim();
  if (!text || busy) return;
  void send(text);
});

async function send(text: string): Promise<void> {
  busy = true;
  input.value = "";
  input.disabled = true;
  state = { ...state, lastUser: text, mood: "think" };
  paintText(state);
  try {
    state = await askJim(state, text);
  } catch {
    state = {
      ...state,
      lastJim: "Hang on mush, line's gone. Say it again.",
      mood: "copped",
    };
  }
  talkUntil = performance.now() / 1000 + Math.min(4.5, 1.2 + state.lastJim.length / 28);
  paintText(state);
  busy = false;
  input.disabled = false;
  input.focus();
}

function paintText(s: ChatState): void {
  you.textContent = s.lastUser ? `You: ${s.lastUser}` : "";
  you.hidden = !s.lastUser;
  if (s.mood === "think" && busy) {
    line.textContent = "…";
  } else {
    line.textContent = s.lastJim;
  }
  bubble.dataset.mood = s.mood;
}

function frame(now: number): void {
  const t = (now - start) / 1000;
  const talking = t < talkUntil && !busy;
  const anim: JimAnim = {
    mood: busy ? "think" : state.mood,
    talking,
    thinking: busy,
  };
  drawJim(src, t, anim);
  blit();
  requestAnimationFrame(frame);
}

function resize(): void {
  const app = document.getElementById("app");
  const vv = window.visualViewport;
  if (app && vv) app.style.height = `${Math.floor(vv.height)}px`;
  const w = Math.max(1, Math.floor(stage.clientWidth));
  const h = Math.max(1, Math.floor(stage.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

function blit(): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.imageSmoothingEnabled = false;
  const scale = Math.max(w / SRC_W, h / SRC_H);
  const dw = SRC_W * scale;
  const dh = SRC_H * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, dx, dy, dw, dh);
}
