import { readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { checkoutFor, diagnostics, paths } from "@/lib/demo";
import { buildContextPack } from "@/lib/context-pack";
import { evaluatePolicy } from "@/lib/policy";

const previewOriginal = await readFile(paths.preview, "utf8");
const productionOriginal = await readFile(paths.production, "utf8");

afterEach(async () => {
  await writeFile(paths.preview, previewOriginal);
});

describe("deterministic checkout incident", () => {
  it("keeps both health endpoints healthy while the broken configs make checkout return 500", async () => {
    expect((await checkoutFor("production")).status).toBe(500);
    expect((await checkoutFor("preview")).status).toBe(500);
  });

  it("recovers preview after the plural key is corrected without changing production", async () => {
    await writeFile(paths.preview, JSON.stringify({ PAYMENTS_API_URL: "https://payments.preview.internal/v1", release: "test" }, null, 2));
    expect((await checkoutFor("preview")).status).toBe(200);
    expect(await readFile(paths.production, "utf8")).toBe(productionOriginal);
  });

  it("produces a source-backed context pack and redacts diagnostics", async () => {
    const pack = await buildContextPack("INC-TEST");
    expect(pack.sources.length).toBeGreaterThanOrEqual(5);
    expect(pack.conflicts[0]?.currentValue).toBe("PAYMENTS_API_URL");
    expect((await diagnostics()).secretValuesRedacted).toBe(true);
  });

  it("passes only the exact one-file preview remediation", () => {
    expect(evaluatePolicy({ changedFiles: ["demo/config.preview.json"], productionBefore: productionOriginal, productionAfter: productionOriginal, diff: '+  "PAYMENTS_API_URL": "https://payments.preview.internal/v1"', investigationConfidence: 0.95 }).passed).toBe(true);
    expect(evaluatePolicy({ changedFiles: ["demo/config.production.json"], productionBefore: productionOriginal, productionAfter: "changed", diff: "", investigationConfidence: 0.5 }).passed).toBe(false);
  });

  it("blocks secrets, destructive commands, and low-confidence remediation", () => {
    const base = {
      changedFiles: ["demo/config.preview.json"],
      productionBefore: productionOriginal,
      productionAfter: productionOriginal,
      investigationConfidence: 0.95,
    };
    expect(evaluatePolicy({ ...base, diff: '+ API_KEY=abcdefghijklmno' }).passed).toBe(false);
    expect(evaluatePolicy({ ...base, diff: '+ rm -rf /tmp/demo' }).passed).toBe(false);
    expect(evaluatePolicy({ ...base, diff: '', investigationConfidence: 0.84 }).passed).toBe(false);
  });
});
