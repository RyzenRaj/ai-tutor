import { MAX_TTS_CHARS, type Playback, type TextToSpeechProvider, type VoiceState } from "./types";

/**
 * Keeps narration tied to the active lesson step.
 * - Off until the learner enables it from a click (browser autoplay rules).
 * - Every request carries a token; a response for a step that is no longer current is
 *   stopped and dropped, so stale audio never plays (even if a provider ignores abort).
 * - Navigation stops the current narration before requesting the next one.
 */
export class NarrationController {
  private provider: TextToSpeechProvider;
  private state: VoiceState;
  private listeners = new Set<() => void>();
  private enabled = false;
  private available = true;
  private current: { key: string; text: string } | null = null;
  private token = 0;
  private abort: AbortController | null = null;
  private playback: Playback | null = null;

  constructor(provider: TextToSpeechProvider, private voice?: string) {
    this.provider = provider;
    this.state = { status: "off", muted: false, providerId: provider.id, stepKey: null, finishedStepKey: null };
  }

  getState = (): VoiceState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async refreshAvailability() {
    try {
      this.available = await this.provider.isAvailable();
    } catch {
      this.available = false;
    }
    if (this.enabled && !this.available) {
      this.halt();
      this.set({ status: "unavailable" });
    }
    return this.available;
  }

  async setProvider(provider: TextToSpeechProvider) {
    this.halt();
    this.provider = provider;
    this.set({ providerId: provider.id, error: undefined });
    await this.refreshAvailability();
    if (!this.enabled || !this.available) return;
    if (this.current) this.start();
    else this.set({ status: "idle" });
  }

  /** Call from a user gesture. */
  enable() {
    this.enabled = true;
    if (!this.available) return this.set({ status: "unavailable" });
    if (this.current) this.start();
    else this.set({ status: "idle" });
  }

  disable() {
    this.enabled = false;
    this.halt();
    this.set({ status: "off", error: undefined });
  }

  /** The active step changed (or its text did). */
  narrate(stepKey: string, text: string) {
    this.current = { key: stepKey, text: text.slice(0, MAX_TTS_CHARS) };
    if (!this.enabled || !this.available) return;
    this.start();
  }

  replay() {
    if (this.enabled && this.available && this.current) this.start();
  }

  pause() {
    if (this.state.status !== "playing" || !this.playback) return;
    this.playback.pause();
    this.set({ status: "paused" });
  }

  resume() {
    if (this.state.status !== "paused" || !this.playback) return;
    this.playback.resume();
    this.set({ status: "playing" });
  }

  stop() {
    this.halt();
    if (this.enabled) this.set({ status: this.available ? "idle" : "unavailable" });
  }

  setMuted(muted: boolean) {
    this.playback?.setMuted(muted);
    this.set({ muted });
  }

  dispose() {
    this.halt();
    this.listeners.clear();
  }

  /** Cancel the pending request and stop the current playback. */
  private halt() {
    this.token++;
    this.abort?.abort();
    this.abort = null;
    this.playback?.stop();
    this.playback = null;
  }

  private start() {
    const target = this.current!;
    this.halt();
    const token = this.token;
    const abort = new AbortController();
    this.abort = abort;
    this.set({ status: "loading", stepKey: target.key, error: undefined });
    this.provider.synthesize(target.text, { signal: abort.signal, voice: this.voice }).then(
      (playback) => {
        if (token !== this.token) {
          playback.stop(); // stale: the learner has moved on
          return;
        }
        this.playback = playback;
        playback.setMuted(this.state.muted);
        playback.onEnded(() => {
          if (token !== this.token) return;
          this.playback = null;
          this.set({ status: "idle", finishedStepKey: target.key });
        });
        playback.onError((e) => {
          if (token !== this.token) return;
          this.playback = null;
          this.set({ status: "error", error: e.message || "Narration failed" });
        });
        playback.play();
        this.set({ status: "playing" });
      },
      (err: unknown) => {
        if (token !== this.token || abort.signal.aborted) return;
        this.set({ status: "error", error: err instanceof Error ? err.message : "Narration failed" });
      },
    );
  }
}
