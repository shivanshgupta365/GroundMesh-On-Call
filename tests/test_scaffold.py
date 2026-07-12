from pathlib import Path


def test_required_demo_sources_exist():
    root = Path(__file__).resolve().parents[1]

    required_paths = [
        root / "AGENTS.md",
        root / "docs" / "PRODUCT_SPEC.md",
        root / "demo" / "logs" / "checkout-runtime.log",
        root / "demo" / "deployment" / "deployment.env.example",
        root / "demo" / "runbooks" / "checkout-incident.md",
        root / "demo" / "latest-diff.patch",
    ]

    missing = [str(path.relative_to(root)) for path in required_paths if not path.exists()]
    assert missing == []


def test_seeded_incident_contains_expected_conflict():
    root = Path(__file__).resolve().parents[1]

    latest_diff = (root / "demo" / "latest-diff.patch").read_text()
    deployment = (root / "demo" / "deployment" / "deployment.env.example").read_text()
    runbook = (root / "demo" / "runbooks" / "checkout-incident.md").read_text()
    runtime_log = (root / "demo" / "logs" / "checkout-runtime.log").read_text()

    assert "PAYMENTS_API_URL" in latest_diff
    assert "PAYMENTS_API_URL is undefined" in runtime_log
    assert "PAYMENT_API_URL=" in deployment
    assert "`PAYMENT_API_URL`" in runbook
