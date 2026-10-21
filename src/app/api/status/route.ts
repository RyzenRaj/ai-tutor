import { connection } from "next/server";
import { readOpenRouterConfig } from "@/lib/ai/openrouter";

/** Tells the UI whether live AI is configured. Never returns the key. */
export async function GET() {
  await connection(); // evaluate env at request time, not at build time
  let config = null;
  let configError: string | undefined;
  try {
    config = readOpenRouterConfig();
  } catch (err) {
    configError = err instanceof Error ? err.message : "Invalid configuration";
  }
  return Response.json(
    config ? { mode: "live", provider: "openrouter", model: config.model } : { mode: "mock", configError },
    { headers: { "Cache-Control": "no-store" } },
  );
}
