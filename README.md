# GroundMesh On-Call

**Verified context. Safe recovery.**

GroundMesh On-Call is a Hermes-powered Tier-1 failed-deployment response agency. It gathers live runtime, code, configuration, runbook, and Git evidence into a source-backed Context Pack; three bounded Hermes specialists investigate, remediate only preview configuration, verify recovery, and prepare a human-approval pull request.

## Buildathon proof

```text
production checkout 500
→ verified Context Pack
→ Investigator / Remediator / Verifier Hermes runs
→ one-file preview-only remediation
→ deterministic policy gate
→ ten live preview checks
→ review-ready GitHub pull request
```

Production is never merged, deployed, or modified by this workflow.

## Local demo

```bash
npm install
npm run dev -- --port 3100
```

Open `http://127.0.0.1:3100`, confirm production and preview checkout are both `500`, then select **Start incident**. The UI polls the real server-side incident state and shows an honest `FAILED` or `BLOCKED` outcome if Hermes, policy, verification, or GitHub PR creation cannot meet the gate.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The retained Python files are the original repository scaffold. The buildathon vertical slice is the Next.js application under `app/`, `lib/`, `demo/`, and `runbooks/`.
