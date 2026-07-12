import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { buildContextPack } from "@/lib/context-pack";
import type { AgentResult, FinalResult, IncidentContextPack, IncidentEvent } from "@/lib/contracts";
import { paths } from "@/lib/demo";
import { runHermes } from "@/lib/hermes";
import { evaluatePolicy, type PolicyResult } from "@/lib/policy";

const execFileAsync = promisify(execFile);
type Role = "investigator" | "remediator" | "verifier";
export type Incident = {
  id: string;
  status: "idle" | "running" | "ready" | "blocked" | "failed";
  startedAt?: string;
  context?: IncidentContextPack;
  events: IncidentEvent[];
  agents: AgentResult[];
  policy?: PolicyResult;
  final?: FinalResult;
  diff?: string;
};

type IncidentStore = { current: Incident; running: boolean };
const INCIDENT_STORE_KEY = Symbol.for("groundmesh.oncall.incident-store.v1");
const globalStore = globalThis as typeof globalThis & { [INCIDENT_STORE_KEY]?: IncidentStore };
// Symbol.for survives Next development module reloads and keeps every route in
// this Node process pointed at the same in-memory incident store.
const store: IncidentStore = globalStore[INCIDENT_STORE_KEY] ?? { current: { id: "—", status: "idle", events: [], agents: [] }, running: false };
globalStore[INCIDENT_STORE_KEY] = store;

const addEvent = (kind: IncidentEvent["kind"], label: string, detail: string, role?: Role) => {
  store.current.events.push({ id: `${Date.now()}-${store.current.events.length}`, at: new Date().toISOString(), kind, label, detail, role });
};

function prompt(role: Role, incidentId: string, context: IncidentContextPack) {
  const evidence = context.sources.map((s) => `${s.id}: ${s.label} (${s.freshness}) — ${s.excerpt}`).join("\n");
  if (role === "investigator") return `You are the GroundMesh Investigator for ${incidentId}. Read-only. Use terminal/file tools to reproduce the checkout failure and inspect sources. Do not modify any file.

Your final response must be exactly one JSON object, with no Markdown, code fence, prose, or tool transcript. Include every required key with the exact JSON types:
{"failureReproduced":true,"observedStatus":500,"rootCause":"current code requires PAYMENTS_API_URL while the active configuration uses PAYMENT_API_URL","confidence":0.95,"sourceIds":["runtime","code","production-config","runbook"],"conflicts":["current code vs stale runbook"],"recommendedAction":"PATCH_PREVIEW_CONFIG"}

Only claim observations you verified. Cite the applicable source IDs from the evidence below; do not invent sources. Evidence:\n${evidence}`;
  if (role === "remediator") return `You are the GroundMesh Remediator for ${incidentId}. Create branch groundmesh/${incidentId.toLowerCase()}. Edit only demo/config.preview.json. Replace the stale PAYMENT_API_URL key with PAYMENTS_API_URL; preserve the URL value. Modify no other file. Do not commit, push, deploy, or merge.

Your final response must be exactly one JSON object, with no Markdown, code fence, prose, or tool transcript. Include every required key and exact JSON types:
{"changedFiles":["demo/config.preview.json"],"productionChanged":false,"branch":"groundmesh/${incidentId.toLowerCase()}","summary":"Replaced the stale preview key with PAYMENTS_API_URL."}`;
  return `You are the GroundMesh Verifier for ${incidentId}. Run the tests. Confirm production checkout stays HTTP 500 and preview checkout is HTTP 200. Make ten real preview checkout requests. If and only if all pass, commit only demo/config.preview.json, push the current branch, and create a real GitHub pull request. Never merge.

Your final response must be exactly one JSON object, with no Markdown, code fence, prose, or tool transcript. Include every required key and exact JSON types. A successful result must have a genuine GitHub URL, never a placeholder:
{"status":"READY_FOR_APPROVAL","productionStatus":500,"previewStatus":200,"checksPassed":10,"checksFailed":0,"changedFiles":["demo/config.preview.json"],"pullRequestUrl":"https://github.com/owner/repo/pull/123","productionChanged":false}

If release cannot complete, return the same typed fields with status BLOCKED or FAILED and no fabricated pullRequestUrl.`;
}

async function git(args: string[]) {
  const { stdout } = await execFileAsync("git", args, { cwd: process.cwd(), maxBuffer: 1_000_000 });
  return stdout.trim();
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

function validateAgentOutput(role: Role, output: Record<string, unknown>) {
  if (role === "investigator") {
    return output.failureReproduced === true
      && output.observedStatus === 500
      && typeof output.rootCause === "string" && output.rootCause.length > 0
      && typeof output.confidence === "number" && Number.isFinite(output.confidence) && output.confidence >= 0 && output.confidence <= 1
      && isStringArray(output.sourceIds) && output.sourceIds.length > 0
      && isStringArray(output.conflicts)
      && output.recommendedAction === "PATCH_PREVIEW_CONFIG";
  }
  if (role === "remediator") {
    return isStringArray(output.changedFiles)
      && output.changedFiles.length === 1 && output.changedFiles[0] === "demo/config.preview.json"
      && output.productionChanged === false
      && typeof output.branch === "string" && output.branch === `groundmesh/${store.current.id.toLowerCase()}`
      && typeof output.summary === "string" && output.summary.length > 0;
  }
  const status = output.status;
  if (status !== "READY_FOR_APPROVAL" && status !== "BLOCKED" && status !== "FAILED") return false;
  if (typeof output.productionStatus !== "number" || typeof output.previewStatus !== "number"
    || typeof output.checksPassed !== "number" || typeof output.checksFailed !== "number"
    || !isStringArray(output.changedFiles) || typeof output.productionChanged !== "boolean") return false;
  return status !== "READY_FOR_APPROVAL" || (
    output.productionStatus === 500 && output.previewStatus === 200
    && output.checksPassed === 10 && output.checksFailed === 0
    && output.changedFiles.length === 1 && output.changedFiles[0] === "demo/config.preview.json"
    && output.productionChanged === false && isHttpUrl(output.pullRequestUrl)
  );
}

function validationError(role: Role, output: Record<string, unknown>) {
  const received = Object.keys(output).sort().join(", ") || "none";
  if (role === "investigator") return `Investigator final JSON did not meet the required evidence schema (received keys: ${received}).`;
  if (role === "remediator") return `Remediator final JSON did not meet the bounded-change schema (received keys: ${received}).`;
  return `Verifier final JSON did not meet the release-evidence schema (received keys: ${received}).`;
}

async function untrackedFileHashes() {
  const untracked = await git(["ls-files", "--others", "--exclude-standard"]);
  return new Map(await Promise.all(untracked.split("\n").filter(Boolean).map(async (file) => {
    const { stdout } = await execFileAsync("git", ["hash-object", "--", file], { cwd: process.cwd() });
    return [file, stdout.trim()] as const;
  })));
}

async function worktreeHash(file: string) {
  try {
    const { stdout } = await execFileAsync("git", ["hash-object", "--", file], { cwd: process.cwd() });
    return stdout.trim();
  } catch {
    return "<missing>";
  }
}

async function dirtyTrackedFileHashes() {
  const [unstaged, staged] = await Promise.all([
    git(["diff", "--name-only", "HEAD"]),
    git(["diff", "--cached", "--name-only"]),
  ]);
  const files = new Set([...unstaged.split("\n"), ...staged.split("\n")].filter(Boolean));
  return new Map(await Promise.all([...files].map(async (file) => [file, await worktreeHash(file)] as const)));
}

async function workingTreeSnapshot() {
  const [unstaged, staged, status, untracked] = await Promise.all([
    git(["diff", "--no-ext-diff", "--binary"]),
    git(["diff", "--cached", "--no-ext-diff", "--binary"]),
    git(["status", "--porcelain=v1"]),
    untrackedFileHashes(),
  ]);
  return `${status}\n-- unstaged --\n${unstaged}\n-- staged --\n${staged}\n-- untracked --\n${[...untracked].map(([file, hash]) => `${file}:${hash}`).join("\n")}`;
}

async function changedWorktreeFiles(baselineTracked: Map<string, string>, baselineUntracked: Map<string, string>) {
  const [currentTracked, currentUntracked] = await Promise.all([dirtyTrackedFileHashes(), untrackedFileHashes()]);
  const files = new Set<string>();
  for (const file of new Set([...baselineTracked.keys(), ...currentTracked.keys()])) {
    if (baselineTracked.get(file) !== currentTracked.get(file)) files.add(file);
  }
  for (const file of new Set([...baselineUntracked.keys(), ...currentUntracked.keys()])) {
    if (baselineUntracked.get(file) !== currentUntracked.get(file)) files.add(file);
  }
  return [...files].sort();
}

async function verifyPullRequest(url: unknown) {
  if (!isHttpUrl(url)) throw new Error("Verifier did not return a valid HTTPS pull request URL.");
  const { hostname } = new URL(url);
  if (hostname !== "github.com") throw new Error("Verifier returned a non-GitHub pull request URL.");
  const { stdout } = await execFileAsync("gh", ["pr", "view", url, "--json", "url", "--jq", ".url"], {
    cwd: process.cwd(), timeout: 30_000, maxBuffer: 32_000,
  });
  if (stdout.trim() !== url) throw new Error("GitHub could not verify the returned pull request URL.");
  return url;
}

async function runRole(role: Role, context: IncidentContextPack) {
  addEvent("agent", `${role[0].toUpperCase()}${role.slice(1)} started`, "Hermes is executing with its bounded role prompt.", role);
  const agent: AgentResult = { role, status: "running" };
  store.current.agents.push(agent);
  try {
    const run = await runHermes(prompt(role, store.current.id, context));
    if (!validateAgentOutput(role, run.output)) throw new Error(validationError(role, run.output));
    agent.runId = run.id;
    agent.status = "completed";
    agent.output = run.output;
    addEvent("agent", `${role[0].toUpperCase()}${role.slice(1)} completed`, `Real Hermes ${run.mode === "runs-api" ? "Runs API" : "local CLI"} work completed.`, role);
    return run.output;
  } catch (error) {
    agent.status = "failed";
    agent.error = error instanceof Error ? error.message : "Hermes run failed.";
    throw error;
  }
}

async function verifyOverHttp(origin: string) {
  const request = async (target: "production" | "preview") => fetch(`${origin}/api/demo/${target}/checkout`, { method: "POST", cache: "no-store" });
  const production = await request("production");
  const preview = await request("preview");
  const probes = await Promise.all(Array.from({ length: 10 }, () => request("preview")));
  return { production: production.status, preview: preview.status, passed: probes.filter((response) => response.status === 200).length };
}

async function workflow(origin: string) {
  try {
    const incidentId = `INC-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
    store.current = { id: incidentId, status: "running", startedAt: new Date().toISOString(), events: [], agents: [] };
    addEvent("alert", "Checkout alert received", "Production checkout returned HTTP 500.");
    const context = await buildContextPack(incidentId);
    store.current.context = context;
    addEvent("context", "Context Pack grounded", `${context.sources.length} current sources prepared; one stale-context conflict found.`);
    const [baselineTracked, baselineUntracked] = await Promise.all([dirtyTrackedFileHashes(), untrackedFileHashes()]);
    const beforeInvestigation = await workingTreeSnapshot();
    const investigator = await runRole("investigator", context);
    if (beforeInvestigation !== await workingTreeSnapshot()) throw new Error("Investigator changed the working tree; remediation was stopped.");
    if (investigator.failureReproduced !== true || Number(investigator.confidence) < 0.85) throw new Error("Investigation did not produce sufficient verified evidence.");
    const productionBefore = await readFile(paths.production, "utf8");
    await runRole("remediator", context);
    const productionAfter = await readFile(paths.production, "utf8");
    const expectedBranch = `groundmesh/${incidentId.toLowerCase()}`;
    if (await git(["branch", "--show-current"]) !== expectedBranch) throw new Error("Remediator did not create the required incident branch.");
    const changedFiles = await changedWorktreeFiles(baselineTracked, baselineUntracked);
    const diff = await git(["diff", "HEAD", "--", "demo/config.preview.json"]);
    const policy = evaluatePolicy({ changedFiles, productionBefore, productionAfter, diff, investigationConfidence: Number(investigator.confidence) });
    store.current.policy = policy;
    store.current.diff = diff;
    addEvent("policy", policy.passed ? "Deterministic policy passed" : "Deterministic policy blocked", policy.passed ? "Exactly one allowed preview file changed; production is untouched." : policy.reasons.join(" "));
    if (!policy.passed) {
      store.current.status = "blocked";
      store.current.final = { status: "BLOCKED", checksPassed: 0, checksFailed: 0, changedFiles, productionChanged: productionBefore !== productionAfter, reason: policy.reasons.join(" ") };
      return;
    }
    const checks = await verifyOverHttp(origin);
    addEvent("verification", "Independent HTTP verification", `Production ${checks.production}; preview ${checks.preview}; ${checks.passed}/10 preview checks passed.`);
    if (checks.production !== 500 || checks.preview !== 200 || checks.passed !== 10) throw new Error("Independent HTTP verification failed.");
    const verifier = await runRole("verifier", context);
    const verifierStatus = verifier.status === "READY_FOR_APPROVAL" ? "READY_FOR_APPROVAL" : "BLOCKED";
    const finalChecks = await verifyOverHttp(origin);
    const productionFinal = await readFile(paths.production, "utf8");
    if (productionFinal !== productionBefore || finalChecks.production !== 500 || finalChecks.preview !== 200 || finalChecks.passed !== 10) {
      throw new Error("Post-verifier independent checks failed; production or preview state is not safe.");
    }
    const pullRequestUrl = verifierStatus === "READY_FOR_APPROVAL" ? await verifyPullRequest(verifier.pullRequestUrl) : undefined;
    store.current.final = { status: verifierStatus, productionStatus: finalChecks.production, previewStatus: finalChecks.preview, checksPassed: finalChecks.passed, checksFailed: 10 - finalChecks.passed, changedFiles, pullRequestUrl, productionChanged: false, reason: verifierStatus === "BLOCKED" ? "Verifier could not create a real pull request." : undefined };
    store.current.status = verifierStatus === "READY_FOR_APPROVAL" ? "ready" : "blocked";
    addEvent("release", store.current.status === "ready" ? "READY FOR APPROVAL" : "Release blocked", store.current.status === "ready" ? "Verifier opened a review-ready pull request. Production remains HTTP 500." : "A real pull request was not returned by Hermes.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow failure.";
    store.current.status = "failed";
    store.current.final = { status: "FAILED", checksPassed: 0, checksFailed: 0, changedFiles: [], productionChanged: false, reason: message };
    addEvent("error", "Incident workflow failed", message);
  } finally {
    store.running = false;
  }
}

export function getIncident() { return store.current; }

export function startIncident(origin: string) {
  if (store.running) return store.current;
  store.running = true;
  void workflow(origin);
  return store.current;
}

export function resetIncident() {
  if (store.running) throw new Error("An incident is currently running.");
  store.current = { id: "—", status: "idle", events: [], agents: [] };
  return store.current;
}

export async function resetDemo() {
  if (store.running) throw new Error("An incident is currently running.");
  const changedFiles = (await git(["diff", "--name-only"])).split("\n").filter(Boolean);
  if (changedFiles.some((file) => file !== "demo/config.preview.json")) {
    throw new Error("Reset stopped: unrelated working changes are present.");
  }
  if (changedFiles.includes("demo/config.preview.json")) await git(["restore", "--", "demo/config.preview.json"]);
  const branch = await git(["branch", "--show-current"]);
  if (branch !== "main") await git(["checkout", "main"]);
  return resetIncident();
}
