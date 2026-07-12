import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scenarioRoot = path.join(process.cwd(), "scenarios", "cases");
const outcomes = new Set([
  "READY_FOR_APPROVAL",
  "BLOCKED_BY_POLICY",
  "VERIFICATION_FAILED",
  "INSUFFICIENT_EVIDENCE",
  "REQUIRES_HUMAN_APPROVAL",
]);

describe("scenario matrix contracts", () => {
  it("keeps every checked-in scenario explicit, safe, and reviewable", async () => {
    let files: string[] = [];
    try { files = (await readdir(scenarioRoot)).filter((file) => file.endsWith(".json")); }
    catch { return; }
    for (const file of files) {
      const scenario = JSON.parse(await readFile(path.join(scenarioRoot, file), "utf8")) as Record<string, unknown>;
      expect(typeof scenario.id).toBe("string");
      expect(typeof scenario.title).toBe("string");
      expect(outcomes.has(String(scenario.expectedOutcome))).toBe(true);
      expect(scenario.productionAction).toBe("NONE");
      expect(Array.isArray(scenario.evidence)).toBe(true);
      expect(Array.isArray(scenario.safetyRules)).toBe(true);
    }
  });
});
