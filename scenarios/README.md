# GroundMesh scenario matrix

Each scenario is a deterministic, non-production contract for the same
e-commerce SaaS checkout vertical. The outcome records how GroundMesh should
respond before any release action: `READY_FOR_APPROVAL`, `BLOCKED_BY_POLICY`,
`VERIFICATION_FAILED`, `INSUFFICIENT_EVIDENCE`, or
`REQUIRES_HUMAN_APPROVAL`.

Scenario pull requests are intentionally independent and never merge or deploy
production. They provide a judge-visible review trail for the safety boundary.
