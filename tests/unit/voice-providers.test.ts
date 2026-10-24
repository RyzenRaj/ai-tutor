import { describe, expect, it, vi } from "vitest";
import { KokoroHttpProvider } from "@/lib/voice/providers/kokoro-http";
import { BrowserSpeechProvider } from "@/lib/voice/providers/browser";

class FakeAudio {
  src = "";
  muted = false;
  paused = true;
  listeners: Record<string, (() => void)[]> = {};
  constructor(src: string) {
    this.src = src;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(ev: string, cb: () => void) {
    (this.listeners[ev] ??= []).push(cb);
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
  emit(ev: string) {
    this.listeners[ev]?.forEach((cb) => cb());
  }
}

describe("KokoroHttpProvider", () => {
  const deps = () => {
    const audios: FakeAudio[] = [];
    const revoked: string[] = [];
    return {
      audios,
      revoked,
      createAudio: (src: string) => {
        const a = new FakeAudio(src);
        audios.push(a);
        return a as unknown as HTMLAudioElement;
      },
      createObjectURL: () => `blob:${audios.length}`,
      revokeObjectURL: (u: string) => revoked.push(u),
    };
  };

  it("asks our server (never the TTS host) and plays the returned audio", async () => {
    const d = deps();
    const fetchImpl = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2])], { type: "audio/wav" }), { status: 200 }));
    const p = new KokoroHttpProvider({ ...d, fetch: fetchImpl as unknown as typeof fetch });
    const ac = new AbortController();
    const pb = await p.synthesize("hello", { signal: ac.signal });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tts");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hello" });
    expect(init.signal).toBe(ac.signal);
    pb.play();
    expect(d.audios[0].paused).toBe(false);
  });

  it("releases the audio when stopped or finished (no retained recordings)", async () => {
    const d = deps();
    const p = new KokoroHttpProvider({ ...d, fetch: (async () => new Response(new Blob([new Uint8Array([1])], { type: "audio/wav" }))) as unknown as typeof fetch });
    const pb = await p.synthesize("a", { signal: new AbortController().signal });
    pb.stop();
    pb.stop();
    expect(d.revoked).toEqual(["blob:0"]);
    const pb2 = await p.synthesize("b", { signal: new AbortController().signal });
    const ended = vi.fn();
    pb2.onEnded(ended);
    d.audios[1].emit("ended");
    expect(ended).toHaveBeenCalled();
    expect(d.revoked).toContain("blob:1");
  });

  it("surfaces the server's error message", async () => {
    const d = deps();
    const p = new KokoroHttpProvider({ ...d, fetch: (async () => Response.json({ error: "Voice narration is not configured on this server." }, { status: 503 })) as unknown as typeof fetch });
    await expect(p.synthesize("a", { signal: new AbortController().signal })).rejects.toThrow(/not configured/);
  });

  it("is available only when the server says so", async () => {
    const d = deps();
    const yes = new KokoroHttpProvider({ ...d, fetch: (async () => Response.json({ available: true })) as unknown as typeof fetch });
    const no = new KokoroHttpProvider({ ...d, fetch: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    expect(await yes.isAvailable()).toBe(true);
    expect(await no.isAvailable()).toBe(false);
  });
});

describe("BrowserSpeechProvider", () => {
  const fakeSynth = () => {
    const spoken: { text: string; volume: number }[] = [];
    let cancelled = 0;
    const synth = {
      speak: (u: { text: string; volume: number }) => spoken.push(u),
      cancel: () => cancelled++,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    class Utterance {
      volume = 1;
      rate = 1;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(public text: string) {}
    }
    return { synth, Utterance, spoken, cancelled: () => cancelled };
  };

  it("is unavailable without the Web Speech API", async () => {
    expect(await new BrowserSpeechProvider({ synth: undefined, Utterance: undefined }).isAvailable()).toBe(false);
  });

  it("speaks on play, cancels on stop, mutes by cancelling", async () => {
    const f = fakeSynth();
    const p = new BrowserSpeechProvider({ synth: f.synth as unknown as SpeechSynthesis, Utterance: f.Utterance as unknown as typeof SpeechSynthesisUtterance });
    expect(await p.isAvailable()).toBe(true);
    const pb = await p.synthesize("hello", { signal: new AbortController().signal });
    pb.play();
    expect(f.spoken.map((u) => u.text)).toEqual(["hello"]);
    let before = f.cancelled();
    pb.stop();
    expect(f.cancelled()).toBe(before + 1);
    pb.stop(); // idempotent
    expect(f.cancelled()).toBe(before + 1);
    pb.play();
    before = f.cancelled();
    pb.setMuted(true);
    expect(f.cancelled()).toBe(before + 1);
  });
});
