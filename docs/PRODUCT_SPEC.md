# GroundMesh On-Call Product Spec

## Decision

Track: AI as Agency

Library archetype: On-Call Autopilot

Submission name: GroundMesh On-Call

Immediate product: Failed-deployment investigation and recovery agency

Differentiator: Source-backed Context Packs and an action-safety gate

Long-term company vision: GroundMesh as the verified context layer for every enterprise agent

## Positioning

GroundMesh is the moat. On-call recovery is the wedge.

On-call wins the buildathon; GroundMesh becomes the company.

## Tagline

Verified context. Safe recovery.

## Supporting Line

A Hermes-powered on-call agency that fixes failed deployments with evidence, not guesses.

## One-Line Description

GroundMesh On-Call gathers logs, code changes, deployment history, and runbooks into a source-backed Incident Context Pack, then a Hermes agent crew investigates the failure, prepares a safe fix, verifies it in preview, and opens the remediation pull request.

## MVP Sources

- Runtime logs
- Latest Git diff
- Deployment configuration
- One runbook

## Seeded Incident

The application expects `PAYMENTS_API_URL`.

The deployment configuration defines `PAYMENT_API_URL`.

The old runbook also mentions `PAYMENT_API_URL`, making the runbook stale and apparently credible.

The runtime log reports that `PAYMENTS_API_URL` is undefined.

## Context Pack Fields

- Incident summary
- Verified facts
- Source references
- Detected conflicts
- Chosen authoritative value
- Unknowns
- Permitted actions
- Forbidden actions
- Acceptance checks

## Safety Gate Blocks

- Tests fail
- Preview remains unhealthy
- More than three files are modified
- A database-destructive command is introduced
- Authentication or billing code is changed outside scope
- The patch contradicts a higher-authority source
- Evidence is insufficient to identify the root cause

## Live Demo Screen

```text
GROUND MESH ON-CALL
Incident INC-1042

Production service             FAILING
Initial response               HTTP 500

CONTEXT
Sources grounded               4
Conflicts detected             1
Stale sources marked           1
Root-cause confidence          96%

REMEDIATION
Changed files                  1
Tests                          8/8
Preview response               HTTP 200
Synthetic checks               10/10

SAFETY
Policy decision                PASSED
Unsafe alternative             BLOCKED

DELIVERY
Pull request                   #42
Human intervention             0
Final decision                 READY FOR APPROVAL
```
