import type { Playback, TextToSpeechProvider } from "../types";

type Deps = {
  fetch: typeof fetch;
  createAudio: (src: string) => HTMLAudioElement;
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
};

const browserDeps = (): Deps => ({
  fetch: (...a) => fetch(...a),
  createAudio: (src) => new Audio(src),
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
});

/**
 * Kokoro via our own `/api/tts` route (which proxies to a self-hosted Kokoro server).
 * Audio lives in memory as an object URL and is released as soon as it ends or stops.
 */
export class KokoroHttpProvider implements TextToSpeechProvider {
  readonly id = "kokoro" as const;
  readonly label = "Kokoro voice";
  private deps: Deps;
  constructor(deps?: Partial<Deps>) {
    this.deps = { ...browserDeps(), ...deps } as Deps;
  }

  async isAvailable() {
    try {
      const r = await this.deps.fetch("/api/tts");
      return r.ok && (await r.json()).available === true;
    } catch {
      return false;
    }
  }

  async synthesize(text: string, { signal, voice }: { signal: AbortSignal; voice?: string }): Promise<Playback> {
    const res = await this.deps.fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voice ? { text, voice } : { text }),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Narration failed (${res.status})`);
    }
    const url = this.deps.createObjectURL(await res.blob());
    const audio = this.deps.createAudio(url);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      audio.pause();
      audio.removeAttribute("src");
      this.deps.revokeObjectURL(url);
    };
    const ended: (() => void)[] = [];
    const errored: ((e: Error) => void)[] = [];
    audio.addEventListener("ended", () => {
      release();
      ended.forEach((cb) => cb());
    });
    audio.addEventListener("error", () => {
      release();
      errored.forEach((cb) => cb(new Error("The narration audio could not be played.")));
    });
    return {
      play: () => {
        audio.play().catch((e: unknown) => errored.forEach((cb) => cb(e instanceof Error ? e : new Error("Playback was blocked."))));
      },
      pause: () => audio.pause(),
      resume: () => void audio.play().catch(() => {}),
      stop: release,
      setMuted: (m) => {
        audio.muted = m;
      },
      onEnded: (cb) => ended.push(cb),
      onError: (cb) => errored.push(cb),
    };
  }
}
