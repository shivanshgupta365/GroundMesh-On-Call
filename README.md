# GroundMesh On-Call

Verified context. Safe recovery.

GroundMesh On-Call is a Hermes-powered failed-deployment investigation and recovery agency. It gathers logs, code changes, deployment configuration, and runbooks into a source-backed Incident Context Pack, then uses bounded agent workflows to diagnose the failure, prepare a safe fix, verify it in preview, and open a remediation pull request.

## Buildathon Scope

This repository intentionally builds a narrow wedge:

- Failed deployment investigation and recovery
- Source-backed Incident Context Pack
- Deterministic action safety gate
- Local preview verification
- Human-approved pull request delivery

It does not try to become a full organizational memory platform during the buildathon.

## Demo Proof

```text
Broken checkout endpoint
-> HTTP 500
-> grounded diagnosis
-> one-file safe patch
-> tests pass
-> preview HTTP 200
-> pull request opened
-> unsafe alternative blocked
```

## Local Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Run tests:

```bash
pytest -q
```

Start Hermes from this project directory:

```bash
source .venv/bin/activate
hermes chat --checkpoints
```

## Demo Ports

```text
Broken service:  http://127.0.0.1:8000
Preview service: http://127.0.0.1:8001
Dashboard:       http://127.0.0.1:8501
```
