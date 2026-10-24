import type { Playback, TextToSpeechProvider } from "../types";

/** Deterministic provider for tests and demos. Records every request and playback. */
export class MockPlayback implements Playback {
  played = false;
  paused = false;
  stopped = false;
  muted = false;
  private ended: (() => void)[] = [];
  private errored: ((e: Error) => void)[] = [];
  constructor(readonly text: string) {}
  play() {
    this.played = true;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  stop() {
    this.stopped = true;
  }
  setMuted(m: boolean) {
    this.muted = m;
  }
  onEnded(cb: () => void) {
    this.ended.push(cb);
  }
  onError(cb: (e: Error) => void) {
    this.errored.push(cb);
  }
  finish() {
    this.ended.forEach((cb) => cb());
  }
  fail(e: Error) {
    this.errored.forEach((cb) => cb(e));
  }
}

export class MockSpeechProvider implements TextToSpeechProvider {
  readonly id = "mock" as const;
  readonly label = "Test voice";
  available = true;
  ignoreAbort = false;
  failNext: Error | null = null;
  requests: { text: string; signal: AbortSignal }[] = [];
  playbacks: MockPlayback[] = [];
  constructor(private opts: { delayMs?: number } = {}) {}

  async isAvailable() {
    return this.available;
  }

  synthesize(text: string, { signal }: { signal: AbortSignal }): Promise<Playback> {
    this.requests.push({ text, signal });
    const fail = this.failNext;
    this.failNext = null;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (fail) return reject(fail);
        const p = new MockPlayback(text);
        this.playbacks.push(p);
        resolve(p);
      }, this.opts.delayMs ?? 0);
      if (!this.ignoreAbort)
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("aborted", "AbortError"));
        });
    });
  }
}
