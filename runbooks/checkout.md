# Checkout recovery runbook

Last verified: 2024-02-14

For a checkout outage, confirm that `PAYMENT_API_URL` is present in the active
deployment configuration, then retry the checkout endpoint.

Do not change production during an active incident without human approval.
