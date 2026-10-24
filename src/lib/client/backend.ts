/**
 * How the browser talks to the tutor. The Next.js app uses the HTTP backend
 * (server keeps the API key); the static demo build plugs in a local, mock-only backend.
 */
export type TutorStatus = { mode: "live"; model: string } | { mode: "mock"; configError?: string };
export type PlanMetaDTO = { mode: "live" | "mock"; model?: string; intro: string; notices: string[] };
/** `lesson` is untrusted until the caller validates it. */
export type PlanResultDTO = { lesson: unknown; meta: PlanMetaDTO };

export interface TutorBackend {
  status(): Promise<TutorStatus>;
  plan(prompt: string, signal: AbortSignal): Promise<PlanResultDTO>;
}

export const httpBackend: TutorBackend = {
  async status() {
    const r = await fetch("/api/status");
    return (await r.json()) as TutorStatus;
  },
  async plan(prompt, signal) {
    const res = await fetch("/api/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as PlanResultDTO;
  },
};
