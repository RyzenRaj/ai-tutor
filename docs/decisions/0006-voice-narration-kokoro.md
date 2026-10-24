# ADR 0006 — Voice narration: provider interface, browser voice by default, Kokoro self-hosted

**Status:** accepted for the interface and defaults; **in-browser Kokoro needs an owner decision** · 2026-10-24

## Context

Learners want the tutor to read each step aloud, for free. Kokoro-82M is the preferred open-weight voice. Facts checked on 2026-10-24:

- **Kokoro-82M** model weights and the `hexgrad/kokoro` inference code are Apache-2.0 (GitHub README / Hugging Face model card). English voices (US + UK, 28 in the ONNX release); the Python package also supports es, fr, hi, it, ja, pt-BR, zh via extra G2P packages. Output 24 kHz.
- **Kokoro-FastAPI** (wrapper exposing an OpenAI-compatible `POST /v1/audio/speech`, formats incl. wav/mp3) is Apache-2.0; CPU image `ghcr.io/remsky/kokoro-fastapi-cpu` on port 8880 with models bundled.
- **kokoro-js** (Apache-2.0) runs Kokoro in the browser via Transformers.js (WebGPU or WASM). The ONNX model is 86–326 MB depending on quantization (q8 ≈ 92 MB) and is downloaded from Hugging Face at runtime. It depends on the npm package **`phonemizer`**, which declares Apache-2.0 but **bundles eSpeak NG compiled to WebAssembly** (`espeak-ng-data`, verified by inspecting the 1.2.1 tarball). eSpeak NG itself is **GPL-3.0**. Shipping that bundle to users' browsers is distribution, so the licence question must be settled by the owner before adopting it.
- **Vercel Functions:** 250 MB bundle limit (5 GB "large functions" beta), 2 GB / 1 vCPU on Hobby, 300 s max duration, 4.5 MB response body, billed by active CPU on Pro. CPU inference per request plus model load on cold starts is a poor fit and could cost money; not adopted.

## Decision

1. `TextToSpeechProvider` interface (`src/lib/voice/types.ts`) and a `NarrationController` that ties narration to the active step: off until the learner enables it (autoplay rules), cancels and ignores stale requests, stops on navigation, pause/resume/replay/stop/mute, error and unavailable states. Autoplay waits for narration to finish; a hidden tab pauses both.
2. Providers:
   - **Browser voice** (Web Speech API): default, free, no download, no licence issue; quality depends on the OS voices.
   - **Kokoro (server)**: our `/api/tts` route proxies to a **self-hosted** OpenAI-compatible Kokoro endpoint set by `KOKORO_TTS_URL` (e.g. Kokoro-FastAPI in Docker on the developer's machine or a separately hosted box). The URL/key stay server-side; text is capped at 1,000 characters; responses capped at 4 MB, no caching, nothing stored; 30 requests/min per client.
   - **Mock**: deterministic, for tests.
3. **Not adopted yet:** kokoro-js in the browser (licence question above, ~90 MB first download, runtime fetch from Hugging Face) and Kokoro inside Vercel Functions (limits/cost).

## Options for the owner

| Option | Cost | Quality | Effort / risk |
|---|---|---|---|
| A. Browser voice only (current default) | free | varies by OS | none |
| B. Kokoro-FastAPI on your PC (`docker run -p 8880:8880 …`) with `KOKORO_TTS_URL=http://localhost:8880` | free | Kokoro | local dev only |
| C. Kokoro-FastAPI on a small always-on VM / container host | from a few $/month (approval needed) | Kokoro | needs auth in front of it; CPU-bound latency |
| D. kokoro-js in the browser | free per request; ~90 MB per new visitor | Kokoro | **GPL-3.0 eSpeak NG in the bundle**: get legal sign-off first |

## Verification status

- Unit: controller (stale responses, abort, navigation, mute, errors, availability), providers, `/api/tts` (config policy, proxying, validation, upstream errors, timeouts, rate limit).
- E2E (headless Chromium): with `/api/tts` mocked, a real WAV is fetched, decoded and played to its `ended` event; navigation mid-request, autoplay waiting, error and unavailable states, hidden tab.
- **Not verified:** a real Kokoro server. This build environment cannot reach Hugging Face or run Docker, so live Kokoro audio has not been tested end to end. Do that with option B before calling Kokoro "working".
