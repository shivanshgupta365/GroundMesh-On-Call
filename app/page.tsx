"use client";

import { useEffect, useState } from "react";

type Source = { id: string; label: string; type: string; freshness: "current" | "stale" | "unknown"; authority: number; excerpt: string; fingerprint: string };
type Event = { id: string; at: string; kind: string; label: string; detail: string; role?: string };
type Agent = { role: string; status: string; runId?: string; error?: string };
type Incident = {
  id: string; status: "idle" | "running" | "ready" | "blocked" | "failed"; startedAt?: string; events: Event[]; agents: Agent[];
  context?: { sources: Source[]; conflicts: { sourceIds: string[]; title: string; resolution: string }[] };
  policy?: { passed: boolean; reasons: string[] }; diff?: string;
  final?: { status: string; productionStatus?: number; previewStatus?: number; checksPassed: number; checksFailed: number; changedFiles: string[]; pullRequestUrl?: string; reason?: string };
};

const emptyIncident: Incident = { id: "—", status: "idle", events: [], agents: [] };

function StatusDot({ active }: { active: boolean }) { return <span className={`status-dot ${active ? "active" : ""}`} aria-hidden="true" />; }

function formatTime(value?: string) {
  if (!value) return "00:00";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [incident, setIncident] = useState<Incident>(emptyIncident);
  const [production, setProduction] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [hermes, setHermes] = useState<{ available: boolean; mode?: string }>({ available: false });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [trayOpen, setTrayOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [requestError, setRequestError] = useState("");

  async function refresh() {
    const [incidentResult, productionResult, previewResult, hermesResult] = await Promise.allSettled([
      fetch("/api/incidents/current", { cache: "no-store" }),
      fetch("/api/demo/production/checkout", { method: "POST", cache: "no-store" }),
      fetch("/api/demo/preview/checkout", { method: "POST", cache: "no-store" }),
      fetch("/api/hermes/health", { cache: "no-store" }),
    ]);
    const failedRequests = [incidentResult, productionResult, previewResult, hermesResult].some((result) => result.status === "rejected");
    setRequestError(failedRequests ? "Live service observation is temporarily unavailable. Retrying automatically." : "");
    if (incidentResult.status === "fulfilled" && incidentResult.value.ok) {
      try { setIncident(await incidentResult.value.json()); }
      catch { setRequestError("Incident state returned an unreadable response. Retrying automatically."); }
    }
    setProduction(productionResult.status === "fulfilled" ? productionResult.value.status : null);
    setPreview(previewResult.status === "fulfilled" ? previewResult.value.status : null);
    if (hermesResult.status === "fulfilled" && hermesResult.value.ok) {
      try { setHermes(await hermesResult.value.json()); }
      catch { setRequestError("Hermes health returned an unreadable response. Retrying automatically."); }
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 700);
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(formatTime(incident.startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [incident.startedAt]);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/incidents/start", { method: "POST" });
      if (!response.ok) setRequestError("The incident could not start. Review the server response and try again.");
      await refresh();
    } catch { setRequestError("The incident could not start because the server is unreachable."); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try {
      const response = await fetch("/api/incidents/reset", { method: "POST" });
      if (!response.ok) setRequestError("Reset is blocked while unrelated work or an active incident is present.");
      await refresh();
    } catch { setRequestError("Reset could not reach the server."); }
    finally { setBusy(false); }
  }
  const ready = incident.status === "ready";
  const conflict = incident.context?.conflicts[0];
  const conflictIds = conflict?.sourceIds ?? [];

  return <main className="war-room">
    <header className="command-strip">
      <a className="wordmark" href="#top"><span className="mesh-mark" aria-hidden="true"><i /><i /><i /><i /></span>GroundMesh <b>On-Call</b></a>
      <div className="command-meta">
        <span><StatusDot active={hermes.available} /> HERMES {hermes.available ? (hermes.mode === "runs-api" ? "RUNS API" : "LOCAL") : "OFFLINE"}</span>
        <span>INCIDENT <strong>{incident.id}</strong></span>
        <span>ELAPSED <strong>{elapsed}</strong></span>
      </div>
      <div className="command-actions">
        <button className="button reset" onClick={reset} disabled={busy || incident.status === "running"}>Reset</button>
        <button className="button start" onClick={start} disabled={busy || incident.status === "running"}>{busy || incident.status === "running" ? "Running incident" : "Start incident"}</button>
      </div>
    </header>

    <section className="masthead" id="top">
      <div><p className="eyebrow">Tier-1 failed-deployment response agency</p><h1>Verified context.<br /><em>Safe recovery.</em></h1></div>
      <p className="masthead-copy">A bounded, source-backed response for one broken checkout deployment. Production never changes without human approval.</p>
      <div className={`decision ${incident.status}`}><span>DECISION</span><strong>{ready ? "READY FOR APPROVAL" : incident.status === "idle" ? "AWAITING ALERT" : incident.status.toUpperCase()}</strong></div>
    </section>

    <section className="main-grid" aria-label="Incident command center">
      <aside className="service-pulse" aria-label="Service pulse" aria-live="polite">
        <div className="section-label">01 — SERVICE PULSE</div>
        <div className="service-row production"><span>Production checkout</span><strong>{production ?? "—"}</strong><small>{production === null ? "observing live service" : "must remain failed"}</small><div className="pulse-line"><i /></div></div>
        <div className={`service-row preview ${preview === 200 ? "recovered" : ""}`}><span>Preview checkout</span><strong>{preview ?? "—"}</strong><small>{preview === null ? "observing live service" : preview === 200 ? "verified recovery" : "awaiting bounded fix"}</small><div className="pulse-line"><i /></div></div>
        <p className="service-note">No production deploy.<br />No production merge.</p>
      </aside>

      <section className="incident-story" aria-label="Real event timeline">
        <div className="section-label">02 — INCIDENT STORY <span>{incident.events.length} REAL EVENTS</span></div>
        <div className="timeline" aria-live="polite" aria-atomic="false">
          {incident.events.length === 0 ? <div className="empty-state"><span>NO ACTIVE INCIDENT</span><p>Start the drill to gather fresh evidence from the broken checkout service.</p></div> : incident.events.map((event) => <article className={`timeline-event ${event.kind}`} key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div><h2>{event.label}</h2><p>{event.detail}</p>{event.role && <small>HERMES / {event.role}</small>}</div></article>)}
        </div>
        {ready && <div className="approval-stamp">READY FOR<br />APPROVAL</div>}
      </section>

      <aside className="context-pack" aria-label="Context Pack">
        <div className="section-label">03 — CONTEXT PACK <span>{incident.context?.sources.length ?? 0} SOURCES</span></div>
        {conflict && <button className="conflict-callout" onClick={() => setSelectedSources(conflictIds)}><span>CONFLICT FOUND</span><strong>{conflict.title}</strong><small>{conflict.resolution}</small></button>}
        <div className="source-stack">
          {(incident.context?.sources ?? []).map((source, index) => <button key={source.id} onClick={() => setSelectedSources([source.id])} className={`source-sheet ${source.freshness} ${selectedSources.includes(source.id) ? "selected" : ""}`} style={{ "--sheet": index } as React.CSSProperties}>
            <span>{source.type} · {source.freshness}</span><strong>{source.label}</strong><code>{source.excerpt}</code><small>AUTHORITY {Math.round(source.authority * 100)}% · #{source.fingerprint}</small>
          </button>)}
          {!incident.context && <p className="context-empty">Sources appear here only after they are observed.</p>}
        </div>
      </aside>
    </section>

    {requestError && <p className="request-error" role="status">{requestError}</p>}

    <section className={`review-tray ${trayOpen ? "open" : ""}`}>
      <button className="tray-toggle" onClick={() => setTrayOpen(!trayOpen)} aria-expanded={trayOpen}><span>04 — DIFF / POLICY / VERIFICATION / PR</span><b>{trayOpen ? "−" : "+"}</b></button>
      {trayOpen && <div className="tray-grid">
        <article><h2>One-file diff</h2><pre>{incident.diff || "No remediation diff yet."}</pre></article>
        <article><h2>Deterministic policy</h2><div className={`policy ${incident.policy?.passed ? "pass" : "pending"}`}><strong>{incident.policy ? (incident.policy.passed ? "PASS" : "BLOCKED") : "PENDING"}</strong><p>{incident.policy?.passed ? "Exactly one allowed preview file changed. Production remains unchanged." : incident.policy?.reasons.join(" ") || "Waiting for evidence and the bounded remediation."}</p></div></article>
        <article><h2>Preview checks</h2><div className="checks">{Array.from({ length: 10 }, (_, index) => <span className={index < (incident.final?.checksPassed ?? 0) ? "pass" : ""} key={index}>{index < (incident.final?.checksPassed ?? 0) ? "200" : "—"}</span>)}</div><p>{incident.final ? `${incident.final.checksPassed}/10 real HTTP checks passed` : "Ten live checks run after policy passes."}</p></article>
        <article><h2>Review handoff</h2>{incident.final?.pullRequestUrl ? <a className="pr-link" href={incident.final.pullRequestUrl} target="_blank" rel="noreferrer">Open real GitHub PR ↗</a> : <p>{incident.final?.reason || "A PR URL appears only after the verifier creates one."}</p>}<small>HUMAN APPROVAL REQUIRED BEFORE MERGE</small></article>
      </div>}
    </section>
  </main>;
}
