import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkout, type CheckoutResult } from "@/demo/checkout";

export type Target = "production" | "preview";

const root = process.cwd();

export const paths = {
  checkout: path.join(root, "demo/checkout.ts"),
  production: path.join(root, "demo/config.production.json"),
  preview: path.join(root, "demo/config.preview.json"),
  runbook: path.join(root, "runbooks/checkout.md"),
};

export async function readConfig(target: Target): Promise<Record<string, unknown>> {
  const file = target === "production" ? paths.production : paths.preview;
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

export async function checkoutFor(target: Target): Promise<CheckoutResult> {
  // Deliberately read from disk for every request: no imported JSON cache.
  return checkout(await readConfig(target));
}

export async function healthFor(target: Target) {
  const config = await readConfig(target);
  return { ok: true, target, configured: Boolean(config.PAYMENTS_API_URL) };
}

export async function diagnostics() {
  const production = await readConfig("production");
  return {
    service: "checkout-api",
    observedError: "PAYMENTS_API_URL is not configured.",
    activeConfigKeys: Object.keys(production),
    // Values intentionally omitted; diagnostics remain safe for browser display.
    secretValuesRedacted: true,
  };
}
