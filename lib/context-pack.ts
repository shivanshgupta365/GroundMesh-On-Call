import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { checkoutFor, diagnostics, paths, readConfig } from "@/lib/demo";
import type { ContextSource, IncidentContextPack } from "@/lib/contracts";

const execFileAsync = promisify(execFile);

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function redact(value: string) {
  return value
    .replace(/(sk|pk|token|secret|password)[_A-Za-z0-9-]*\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]")
    .slice(0, 280);
}

function source(input: Omit<ContextSource, "observedAt" | "fingerprint" | "excerpt"> & { raw: string }): ContextSource {
  return {
    id: input.id,
    label: input.label,
    type: input.type,
    freshness: input.freshness,
    authority: input.authority,
    observedAt: new Date().toISOString(),
    fingerprint: fingerprint(input.raw),
    excerpt: redact(input.raw),
  };
}

async function gitExcerpt() {
  try {
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%h %s"], { cwd: process.cwd() });
    return stdout.trim() || "No commits yet";
  } catch {
    return "Git metadata unavailable";
  }
}

export async function buildContextPack(incidentId: string): Promise<IncidentContextPack> {
  const [productionResult, diagnostic, code, production, preview, runbook, git] = await Promise.all([
    checkoutFor("production"),
    diagnostics(),
    readFile(paths.checkout, "utf8"),
    readConfig("production"),
    readConfig("preview"),
    readFile(paths.runbook, "utf8"),
    gitExcerpt(),
  ]);
  const sources: ContextSource[] = [
    source({ id: "runtime", label: "Production HTTP observation", type: "runtime", freshness: "current", authority: 0.98, raw: `POST /production/checkout -> ${productionResult.status}; ${productionResult.ok ? "ok" : productionResult.error}` }),
    source({ id: "diagnostics", label: "Sanitized diagnostics", type: "diagnostic", freshness: "current", authority: 0.9, raw: JSON.stringify(diagnostic) }),
    source({ id: "code", label: "Current checkout code", type: "code", freshness: "current", authority: 0.99, raw: code }),
    source({ id: "production-config", label: "Production configuration", type: "config", freshness: "current", authority: 0.97, raw: JSON.stringify(production) }),
    source({ id: "preview-config", label: "Preview configuration", type: "config", freshness: "current", authority: 0.92, raw: JSON.stringify(preview) }),
    source({ id: "runbook", label: "Checkout recovery runbook", type: "runbook", freshness: "stale", authority: 0.36, raw: runbook }),
    source({ id: "git", label: "Git metadata", type: "git", freshness: "unknown", authority: 0.7, raw: git }),
  ];
  return {
    incidentId,
    createdAt: new Date().toISOString(),
    sources,
    claims: [{ id: "root-cause", claim: "Current checkout code requires PAYMENTS_API_URL while active configuration and runbook use PAYMENT_API_URL.", sourceIds: ["runtime", "code", "production-config", "runbook"], confidence: 0.95 }],
    conflicts: [{ id: "payments-key-conflict", title: "Configuration key conflict", sourceIds: ["code", "production-config", "preview-config", "runbook"], currentValue: "PAYMENTS_API_URL", staleValue: "PAYMENT_API_URL", resolution: "Trust current code; update preview configuration only." }],
  };
}
