import { moveToUci } from "../fairyStockfishEngine";
import type { Move } from "../types";

export type EngineScore = { kind: "cp" | "mate"; value: number };
export type EngineLine = { bestMove: string; depth: number; score: EngineScore; pv: string[] };
export type EngineStatus = "loading" | "ready" | "unavailable";

type WorkerMessage = {
  type: "ready" | "unavailable" | "result" | "cancelled";
  id?: number;
  reason?: string;
  bestMove?: string;
  info?: { depth: number; score: EngineScore; pv: string[] } | null;
};

export class CoachEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, (line: EngineLine | null) => void>();
  private readyWaiters: Array<(ready: boolean) => void> = [];
  private nextId = 1;
  private initTimer = 0;
  private status: EngineStatus = "loading";

  constructor(private readonly onStatus: (status: EngineStatus, reason?: string) => void) {}

  init(): void {
    if (this.worker) return;
    if (typeof Worker === "undefined" || typeof SharedArrayBuffer === "undefined") {
      this.setStatus("unavailable", "Engine requires cross-origin isolation in this browser.");
      return;
    }
    try {
      this.worker = new Worker(`${import.meta.env.BASE_URL}engine/fairy-stockfish/coach-worker.js`);
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.onMessage(event.data);
      this.worker.onerror = (event) => this.setStatus("unavailable", event.message || "Engine worker failed.");
      this.worker.postMessage({ type: "init" });
      this.initTimer = window.setTimeout(() => {
        if (this.status === "loading") {
          this.worker?.terminate();
          this.worker = null;
          this.setStatus("unavailable", "Engine initialization timed out.");
        }
      }, 12000);
    } catch (error) {
      this.setStatus("unavailable", String(error));
    }
  }

  isReady(): boolean { return this.status === "ready"; }

  async analyze(history: Move[], ms = 900): Promise<EngineLine | null> {
    if (this.status === "loading") {
      const ready = await this.waitReady();
      if (!ready) return null;
    }
    if (!this.worker || this.status !== "ready") return null;
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        this.worker?.postMessage({ type: "cancel" });
        resolve(null);
      }, ms + 4500);
      this.pending.set(id, (line) => { window.clearTimeout(timer); resolve(line); });
      this.worker?.postMessage({ type: "analyze", id, moves: history.map(moveToUci), ms });
    });
  }

  cancel(): void {
    this.worker?.postMessage({ type: "cancel" });
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  dispose(): void {
    window.clearTimeout(this.initTimer);
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
    this.setStatus("unavailable");
  }

  private onMessage(message: WorkerMessage): void {
    if (message.type === "ready") { if (this.worker) this.setStatus("ready"); return; }
    if (message.type === "unavailable") { this.setStatus("unavailable", message.reason); return; }
    if (message.id === undefined) return;
    const resolve = this.pending.get(message.id);
    if (!resolve) return;
    this.pending.delete(message.id);
    const info = message.info;
    resolve(message.type === "result" && info && message.bestMove && message.bestMove !== "(none)"
      ? { bestMove: message.bestMove, depth: info.depth, score: info.score, pv: info.pv }
      : null);
  }

  private setStatus(status: EngineStatus, reason?: string): void {
    this.status = status;
    if (status !== "loading") window.clearTimeout(this.initTimer);
    this.onStatus(status, reason);
    if (status !== "loading") {
      this.readyWaiters.splice(0).forEach((done) => done(status === "ready"));
      if (status === "unavailable") this.cancel();
    }
  }

  private waitReady(): Promise<boolean> {
    if (this.status !== "loading") return Promise.resolve(this.status === "ready");
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), 8000);
      this.readyWaiters.push((ready) => { window.clearTimeout(timer); resolve(ready); });
    });
  }
}
