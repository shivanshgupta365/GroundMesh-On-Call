# Checkout Incident Runbook

Last reviewed: 2026-05-18

## Checkout Payment Provider

The checkout service should use `PAYMENT_API_URL` to reach the payment provider.

## Known Recovery Steps

1. Confirm that checkout requests return HTTP 500.
2. Confirm that the payment provider endpoint is configured.
3. Restart the service after updating deployment configuration.

## GroundMesh Note

This runbook is intentionally stale for the buildathon demo. Current source code has higher authority than this runbook.
