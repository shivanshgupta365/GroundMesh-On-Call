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

const agentResultKeys = new Set([
  "failureReproduced", "observedStatus", "rootCause", "confidence", "sourceIds", "conflicts", "recommendedAction",
  "changedFiles", "productionChanged", "branch", "summary",
  "status", "productionStatus", "previewStatus", "checksPassed", "checksFailed", "pullRequestUrl",
]);

function balancedObjects(text: string) {
  const objects: Record<string, unknown>[] = [];
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
          if (result && typeof result === "object" && !Array.isArray(result)) objects.push(result as Record<string, unknown>);
        } catch { /* keep searching for a valid object */ }
        break;
      }
    }
  }
  return objects;
}

function extractJson(value: unknown): Record<string, unknown> | undefined {
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const visit = (current: unknown, depth = 0) => {
    if (depth > 8 || current === null || current === undefined) return;
    if (typeof current === "string") {
      const text = current.trim();
      if (!text) return;
      try { visit(JSON.parse(text), depth + 1); } catch { /* it may be a transcript, not a JSON document */ }
      for (const fenced of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) visit(fenced[1], depth + 1);
      for (const object of balancedObjects(text)) visit(object, depth + 1);
      return;
    }
    if (typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
      return;
    }
    const object = current as Record<string, unknown>;
    candidates.push(object);
    for (const item of Object.values(object)) visit(item, depth + 1);
  };

  visit(value);
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: Object.keys(candidate).filter((key) => agentResultKeys.has(key)).length,
    }))
    // Prefer a complete agent result embedded in a Runs API envelope, but keep
    // the original object as a fallback for future result schemas.
    .sort((left, right) => right.score - left.score || right.index - left.index)[0]?.candidate;
}

function describeOutput(value: unknown) {
  if (typeof value === "string") return `text response (${value.trim().length} characters)`;
  if (Array.isArray(value)) return `array response (${value.length} items)`;
  if (value && typeof value === "object") return `object response (keys: ${Object.keys(value as Record<string, unknown>).slice(0, 8).join(", ") || "none"})`;
  return `${typeof value} response`;
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
      const result = status.output ?? status.result;
      const output = extractJson(result);
      if (!output) throw new Error(`Hermes completed without a parseable JSON object in its ${describeOutput(result)}.`);
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
    if (!output) throw new Error(`Local Hermes completed without a parseable JSON object in its ${describeOutput(stdout)}.`);
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
