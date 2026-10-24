import type { Playback, TextToSpeechProvider } from "../types";

type Deps = { synth?: SpeechSynthesis; Utterance?: typeof SpeechSynthesisUtterance };

/**
 * The browser's built-in voices (Web Speech API): free, offline-capable, no download.
 * Quality depends on the operating system's installed voices.
 */
export class BrowserSpeechProvider implements TextToSpeechProvider {
  readonly id = "browser" as const;
  readonly label = "Browser voice";
  private deps: Deps;
  constructor(deps?: Deps) {
    this.deps = deps ?? (typeof window !== "undefined" ? { synth: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance } : {});
  }

  async isAvailable() {
    return Boolean(this.deps.synth && this.deps.Utterance);
  }

  // No network: synthesis happens when play() is called, so there is nothing to abort.
  async synthesize(text: string, _opts?: { signal: AbortSignal; voice?: string }): Promise<Playback> {
    void _opts;
    const synth = this.deps.synth!;
    const Utterance = this.deps.Utterance!;
    let utterance: SpeechSynthesisUtterance | null = null;
    let muted = false;
    let active = false;
    const ended: (() => void)[] = [];
    const errored: ((e: Error) => void)[] = [];
    const stop = () => {
      if (!active) return;
      active = false;
      if (utterance) utterance.onend = utterance.onerror = null;
      synth.cancel();
    };
    return {
      play: () => {
        synth.cancel(); // never overlap with anything already queued
        utterance = new Utterance(text);
        utterance.volume = muted ? 0 : 1;
        utterance.onend = () => {
          active = false;
          ended.forEach((cb) => cb());
        };
        utterance.onerror = (e) => {
          active = false;
          if ((e as SpeechSynthesisErrorEvent).error !== "canceled" && (e as SpeechSynthesisErrorEvent).error !== "interrupted")
            errored.forEach((cb) => cb(new Error("The browser voice could not speak this step.")));
        };
        active = true;
        synth.speak(utterance);
      },
      pause: () => synth.pause(),
      resume: () => synth.resume(),
      stop,
      // Browser voices cannot change volume mid-sentence; muting stops this utterance.
      setMuted: (m) => {
        muted = m;
        if (m) stop();
      },
      onEnded: (cb) => ended.push(cb),
      onError: (cb) => errored.push(cb),
    };
  }
}
