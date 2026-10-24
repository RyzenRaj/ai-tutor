/**
 * Static demo entry: the same Workspace, with a local mock-only backend instead of the
 * Next.js API. Used to publish a no-server preview. It never calls a model.
 */
import { createRoot } from "react-dom/client";
import { Workspace } from "@/components/Workspace";
import { buildLesson, getCapability } from "@/lib/registry";
import { planMock } from "@/lib/ai/planner";
import type { TutorBackend } from "@/lib/client/backend";

const demoBackend: TutorBackend = {
  serverVoice: false, // no /api/tts in the static demo; browser voice only
  async status() {
    return { mode: "mock" };
  },
  async plan(prompt) {
    const r = planMock(prompt);
    return { lesson: r.lesson, meta: r.meta };
  },
};

const initial = buildLesson("binary-search", getCapability("binary-search")!.defaultParams);
createRoot(document.getElementById("root")!).render(<Workspace initialLesson={initial} backend={demoBackend} />);
