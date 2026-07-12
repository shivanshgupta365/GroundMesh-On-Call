import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HermesRun = {
  id?: string;
  output: Record<string, unknown>;
  events?: unknown;
  mode: "runs-api" | "local-cli";
};

function extractJson(text: string): Record<string, unknown> | undefined {
  const candidates = [text.trim(), ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1])];
  for (const candidate of candidates) {
    try {
      const result = JSON.parse(candidate);
      if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
    } catch { /* malformed output is handled by caller */ }
  }

  // Agent transcripts can include tool logs before/after their required JSON.
  // Parse balanced object candidates rather than relying on a greedy regex.
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const character = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") quoted = false;
        continue;
      }
      if (character === "\"") quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          const result = JSON.parse(text.slice(start, end + 1));
          if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
        } catch { /* keep searching for a valid object */ }
        break;
      }
    }
  }
  return undefined;
}

type HermesApiConfig = { base: string; headers: HeadersInit };

function getApiConfig(): HermesApiConfig | undefined {
  const baseUrl = process.env.HERMES_API_BASE_URL;
  const apiKey = process.env.HERMES_API_KEY;
  if (!baseUrl && !apiKey) return undefined;
  if (!baseUrl || !apiKey) throw new Error("Hermes Runs API configuration is incomplete.");
  return {
    base: baseUrl.replace(/\/$/, ""),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  };
}

function asJsonText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value ?? {});
}

export async function startHermesRun(input: string) {
  const config = getApiConfig();
  if (!config) throw new Error("The local Hermes CLI does not expose a Runs API start endpoint.");
  const response = await fetch(`${config.base}/v1/runs`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({ input }),
  });
  if (!response.ok) throw new Error(`Hermes run start failed: ${response.status}`);
  const started = await response.json() as { id?: string };
  if (!started.id) throw new Error("Hermes run did not return an id.");
  return started;
}

async function runViaApi(prompt: string): Promise<HermesRun> {
  const config = getApiConfig();
  if (!config) throw new Error("Hermes Runs API is not configured.");
  const started = await startHermesRun(prompt);
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await fetch(`${config.base}/v1/runs/${started.id}`, { headers: config.headers });
    if (!statusResponse.ok) throw new Error(`Hermes run status failed: ${statusResponse.status}`);
    const status = await statusResponse.json() as { status?: string; output?: unknown; result?: unknown; error?: string };
    if (status.status === "completed") {
      // Event retrieval is part of the Runs API contract. Read it before
      // accepting a terminal result so the workflow records real run activity.
      const eventsResponse = await fetch(`${config.base}/v1/runs/${started.id}/events`, { headers: config.headers });
      if (!eventsResponse.ok) throw new Error(`Hermes events failed: ${eventsResponse.status}`);
      const events = await eventsResponse.json();
      const raw = asJsonText(status.output ?? status.result);
      const output = extractJson(raw);
      if (!output) throw new Error("Hermes returned malformed or missing JSON.");
      return { id: started.id, output, events, mode: "runs-api" };
    }
    if (status.status === "failed" || status.status === "cancelled") throw new Error(status.error || `Hermes run ${status.status}.`);
  }
  throw new Error("Hermes run timed out.");
}

async function runViaLocalCli(prompt: string): Promise<HermesRun> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "groundmesh-hermes-"));
  const usageFile = path.join(tempDir, "usage.json");
  try {
    // This is a real, server-only Hermes invocation for local buildathon mode.
    const { stdout } = await execFileAsync("hermes", ["-z", prompt, "--usage-file", usageFile], {
      cwd: process.cwd(),
      timeout: 360_000,
      maxBuffer: 2_000_000,
    });
    const output = extractJson(stdout);
    if (!output) throw new Error("Local Hermes returned malformed or missing JSON.");
    return { output, mode: "local-cli" };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runHermes(prompt: string): Promise<HermesRun> {
  return getApiConfig() ? runViaApi(prompt) : runViaLocalCli(prompt);
}

export async function hermesHealth() {
  try {
    const config = getApiConfig();
    if (config) {
      const response = await fetch(`${config.base}/health`, { headers: config.headers });
      return { available: response.ok, mode: "runs-api" as const };
    }
  } catch {
    return { available: false, mode: "runs-api" as const };
  }
  try {
    await execFileAsync("hermes", ["--version"], { timeout: 10_000 });
    return { available: true, mode: "local-cli" as const };
  } catch {
    return { available: false, mode: "local-cli" as const };
  }
}

export async function hermesCapabilities() {
  const config = getApiConfig();
  if (config) {
    const response = await fetch(`${config.base}/v1/capabilities`, { headers: config.headers });
    if (!response.ok) throw new Error(`Hermes capabilities failed: ${response.status}`);
    return response.json();
  }
  return { mode: "local-cli", tools: ["terminal", "filesystem", "git"], note: "Local Hermes CLI fallback is active." };
}

export async function hermesRunEvents(runId: string) {
  const config = getApiConfig();
  if (!config) return { events: [], note: "Local CLI does not expose a Runs event stream." };
  const response = await fetch(`${config.base}/v1/runs/${runId}/events`, { headers: config.headers });
  if (!response.ok) throw new Error(`Hermes events failed: ${response.status}`);
  return response.json();
}

export async function stopHermesRun(runId: string) {
  const config = getApiConfig();
  if (!config) return { stopped: false, note: "Local CLI runs cannot be stopped through the Runs API." };
  const response = await fetch(`${config.base}/v1/runs/${runId}/stop`, { method: "POST", headers: config.headers });
  if (!response.ok) throw new Error(`Hermes stop failed: ${response.status}`);
  return response.json();
}
