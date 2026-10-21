import { Workspace } from "@/components/Workspace";
import { buildLesson, getCapability } from "@/lib/registry";

export default function Home() {
  // Deterministic default lesson, prerendered at build time.
  const lesson = buildLesson("binary-search", getCapability("binary-search")!.defaultParams);
  return <Workspace initialLesson={lesson} />;
}
