/** Debug-boot screen + log capture for bug reports. */

type LogRow = {
  t: number;
  kind: string;
  msg: string;
  data?: unknown;
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pickMime(): string {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export class DebugTape {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private logs: LogRow[] = [];
  private startedAt = 0;
  private unhook: (() => void) | null = null;
  private mime = "video/webm";

  public isOn(): boolean {
    return this.rec !== null && this.rec.state === "recording";
  }

  public note(kind: string, msg: string, data?: unknown): void {
    if (!this.isOn()) return;
    this.logs.push({
      t: Math.round((performance.now() - this.startedAt) / 10) / 100,
      kind,
      msg,
      data,
    });
  }

  public start(canvas: HTMLCanvasElement): boolean {
    if (this.isOn()) return true;
    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      return false;
    }
    this.mime = pickMime();
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 6_000_000 });
    this.chunks = [];
    this.logs = [];
    this.startedAt = performance.now();
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };
    rec.start(400);
    this.rec = rec;
    this.hookConsole();
    this.note("tape", "recording started");
    return true;
  }

  public stop(): void {
    const rec = this.rec;
    if (!rec || rec.state === "inactive") {
      this.rec = null;
      return;
    }
    this.note("tape", "recording stopped");
    this.unhook?.();
    this.unhook = null;
    const tag = stamp();
    rec.onstop = () => {
      const video = new Blob(this.chunks, { type: this.mime });
      const log = new Blob([this.formatLogs()], { type: "application/json" });
      saveBlob(video, `canoe-lake-${tag}.webm`);
      saveBlob(log, `canoe-lake-${tag}.json`);
      this.chunks = [];
      this.logs = [];
      this.rec = null;
    };
    if (rec.state === "recording") rec.requestData();
    rec.stop();
  }

  private formatLogs(): string {
    return `${JSON.stringify({ started: this.startedAt, rows: this.logs }, null, 2)}\n`;
  }

  private hookConsole(): void {
    const orig = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    const tap =
      (kind: "log" | "warn" | "error") =>
      (...args: unknown[]) => {
        orig[kind](...args);
        this.note(`console.${kind}`, args.map(String).join(" "));
      };
    console.log = tap("log");
    console.warn = tap("warn");
    console.error = tap("error");
    this.unhook = () => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
    };
  }
}
