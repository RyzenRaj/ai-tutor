/**
 * Provider-neutral text-to-speech (P5). Playback happens in the browser; providers only turn
 * text into something playable. Secrets never reach the browser: server-backed providers go
 * through our own /api/tts route.
 */
export interface Playback {
  play(): void;
  pause(): void;
  resume(): void;
  /** Stop and release resources (e.g. revoke object URLs). Idempotent. */
  stop(): void;
  setMuted(muted: boolean): void;
  onEnded(cb: () => void): void;
  onError(cb: (error: Error) => void): void;
}

export interface TextToSpeechProvider {
  readonly id: "browser" | "kokoro" | "mock";
  readonly label: string;
  isAvailable(): Promise<boolean>;
  /** Must honour `signal`; the controller also guards against late results. */
  synthesize(text: string, opts: { signal: AbortSignal; voice?: string }): Promise<Playback>;
}

export type VoiceStatus = "off" | "unavailable" | "idle" | "loading" | "playing" | "paused" | "error";

export type VoiceState = {
  status: VoiceStatus;
  muted: boolean;
  providerId: TextToSpeechProvider["id"];
  /** Step currently being narrated (or last requested). */
  stepKey: string | null;
  /** Step whose narration most recently played to the end. */
  finishedStepKey: string | null;
  error?: string;
};

/** Narration text is bounded so requests stay small and fast. */
export const MAX_TTS_CHARS = 1000;
