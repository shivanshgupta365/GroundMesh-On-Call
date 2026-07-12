export type CheckoutResult =
  | { ok: true; status: 200; receipt: string }
  | { ok: false; status: 500; error: string };

/** The currently deployed checkout code reads this exact key. */
export function checkout(config: Record<string, unknown>): CheckoutResult {
  const paymentsUrl = config.PAYMENTS_API_URL;
  if (typeof paymentsUrl !== "string" || !paymentsUrl.startsWith("https://")) {
    return {
      ok: false,
      status: 500,
      error: "Checkout unavailable: PAYMENTS_API_URL is not configured.",
    };
  }
  return { ok: true, status: 200, receipt: "chk_preview_verified" };
}
