"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { NarrationController } from "@/lib/voice/controller";
import { BrowserSpeechProvider } from "@/lib/voice/providers/browser";
import { KokoroHttpProvider } from "@/lib/voice/providers/kokoro-http";
import type { TextToSpeechProvider, VoiceState } from "@/lib/voice/types";

export type NarrationApi = {
  state: VoiceState;
  controller: NarrationController;
  providers: TextToSpeechProvider[];
  stepKey: string;
};

const SERVER_STATE: VoiceState = { status: "off", muted: false, providerId: "browser", stepKey: null, finishedStepKey: null };

/**
 * Narration for the active step. Prefers the server's Kokoro voice when it is configured,
 * otherwise the browser's built-in voice; off until the learner turns it on.
 */
export function useNarration(stepKey: string, text: string, opts: { serverVoice?: boolean } = {}): NarrationApi {
  const serverVoice = opts.serverVoice !== false;
  const kokoro = useMemo(() => new KokoroHttpProvider(), []);
  const browser = useMemo(() => new BrowserSpeechProvider(), []);
  const controller = useMemo(() => new NarrationController(browser), [browser]);
  const [providers, setProviders] = useState<TextToSpeechProvider[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [k, b] = await Promise.all([serverVoice ? kokoro.isAvailable() : Promise.resolve(false), browser.isAvailable()]);
      if (cancelled) return;
      const list = [...(k ? [kokoro] : []), ...(b ? [browser] : [])];
      setProviders(list);
      await controller.setProvider(list[0] ?? browser);
    })();
    return () => {
      cancelled = true;
    };
  }, [controller, kokoro, browser, serverVoice]);

  useEffect(() => () => controller.dispose(), [controller]);

  // Keep narration tied to the active step; the controller drops stale requests.
  useEffect(() => {
    controller.narrate(stepKey, text);
  }, [controller, stepKey, text]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState, () => SERVER_STATE);
  return { state, controller, providers, stepKey };
}
