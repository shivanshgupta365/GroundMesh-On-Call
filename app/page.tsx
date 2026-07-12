"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, ArrowUpRight, GitBranch, GitPullRequest, RefreshCw } from "lucide-react";

type Source = { id: string; label: string; type: string; freshness: "current" | "stale" | "unknown"; authority: number; excerpt: string; fingerprint: string };
type Event = { id: string; at: string; kind: string; label: string; detail: string; role?: string };
type Agent = { role: string; status: string; runId?: string; error?: string };
type Incident = {
  id: string; status: "idle" | "running" | "ready" | "blocked" | "failed"; startedAt?: string; events: Event[]; agents: Agent[];
  context?: { sources: Source[]; conflicts: { sourceIds: string[]; title: string; resolution: string }[] };
  policy?: { passed: boolean; reasons: string[] }; diff?: string;
  final?: { status: string; productionStatus?: number; previewStatus?: number; checksPassed: number; checksFailed: number; changedFiles: string[]; pullRequestUrl?: string; reason?: string };
};
type GitHubPull = { number: number; title: string; url: string; updatedAt: string; draft: boolean; head: string; base: string; author: string; outcome: string };
type GitHubSummary = {
  available: boolean;
  syncedAt?: string;
  error?: string;
  repository?: { name: string; url: string; defaultBranch: string; stars: number; forks: number; openItems: number; pushedAt: string };
  counts?: Record<string, number>;
  pullRequests?: GitHubPull[];
};

const emptyIncident: Incident = { id: "—", status: "idle", events: [], agents: [] };

function StatusDot({ active }: { active: boolean }) { return <span className={`status-dot ${active ? "active" : ""}`} aria-hidden="true" />; }

function formatTime(value?: string) {
  if (!value) return "00:00";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function outcomeClass(value: string) {
  return value.toLowerCase().replaceAll("_", "-");
}

export default function Home() {
  const reducedMotion = useReducedMotion();
  const [incident, setIncident] = useState<Incident>(emptyIncident);
  const [production, setProduction] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [hermes, setHermes] = useState<{ available: boolean; mode?: string }>({ available: false });
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [trayOpen, setTrayOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [requestError, setRequestError] = useState("");
  const [github, setGithub] = useState<GitHubSummary>({ available: false });
  const [githubRefreshing, setGithubRefreshing] = useState(false);
  const [githubFilter, setGithubFilter] = useState("ALL");

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

  async function refreshGithub(manual = false) {
    if (manual) setGithubRefreshing(true);
    try {
      const response = await fetch("/api/github/summary", { cache: "no-store" });
      const result = await response.json() as GitHubSummary;
      setGithub(response.ok ? result : { available: false, error: result.error || "GitHub sync is unavailable." });
    } catch {
      setGithub({ available: false, error: "GitHub sync could not reach the server." });
    } finally {
      if (manual) setGithubRefreshing(false);
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 700);
    return () => { window.clearTimeout(initialRefresh); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const initialSync = window.setTimeout(() => void refreshGithub(), 50);
    const timer = window.setInterval(() => void refreshGithub(), 30_000);
    return () => { window.clearTimeout(initialSync); window.clearInterval(timer); };
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
  const pullRequests = useMemo(() => github.pullRequests ?? [], [github.pullRequests]);
  const githubOutcomes = useMemo(() => ["ALL", ...Array.from(new Set(pullRequests.map((pull) => pull.outcome)))], [pullRequests]);
  const filteredPulls = githubFilter === "ALL" ? pullRequests : pullRequests.filter((pull) => pull.outcome === githubFilter);

  return <main className="war-room">
    <header className="command-strip">
      <a className="wordmark" href="#top"><span className="mesh-mark" aria-hidden="true"><i /><i /><i /><i /></span>GroundMesh <b>On-Call</b></a>
      <div className="command-meta">
        <span><StatusDot active={hermes.available} /> HERMES {hermes.available ? (hermes.mode === "runs-api" ? "RUNS API" : "LOCAL") : "OFFLINE"}</span>
        <span><StatusDot active={github.available} /> GITHUB {github.available ? "SYNCED" : "WAITING"}</span>
        <span>INCIDENT <strong>{incident.id}</strong></span>
        <span>ELAPSED <strong>{elapsed}</strong></span>
      </div>
      <div className="command-actions">
        <button className="button reset" onClick={reset} disabled={busy || incident.status === "running"}>Reset</button>
        <button className="button start" onClick={start} disabled={busy || incident.status === "running"}>{busy || incident.status === "running" ? "Running incident" : "Start incident"}</button>
      </div>
    </header>

    <section className="masthead" id="top">
      <motion.div initial={reducedMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}><p className="eyebrow">E-commerce SaaS · revenue-critical checkout</p><h1>Verified context.<br /><em>Safe recovery.</em></h1></motion.div>
      <div className="masthead-side"><p className="masthead-copy">A source-backed incident agency with a live GitHub review trail. Every agent action stays bounded; every release waits for human approval.</p><div className="github-orbit" aria-hidden="true"><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" /><i className="orbit-node node-one" /><i className="orbit-node node-two" /><GitBranch size={28} /></div></div>
      <motion.div layout className={`decision ${incident.status}`}><span>DECISION</span><strong>{ready ? "READY FOR APPROVAL" : incident.status === "idle" ? "AWAITING ALERT" : incident.status.toUpperCase()}</strong></motion.div>
    </section>

    <section className="github-dock" aria-label="Live GitHub repository sync">
      <div className="github-identity">
        <div className="github-icon"><GitBranch size={22} /></div>
        <div><span className="dock-kicker">LIVE REPOSITORY</span>{github.repository ? <a href={github.repository.url} target="_blank" rel="noreferrer">{github.repository.name} <ArrowUpRight size={13} /></a> : <strong>Connecting to GitHub…</strong>}</div>
        <button className="sync-button" onClick={() => void refreshGithub(true)} disabled={githubRefreshing} aria-label="Refresh GitHub data"><RefreshCw size={14} className={githubRefreshing ? "spinning" : ""} /> Sync now</button>
      </div>
      <div className="github-metrics" aria-live="polite">
        <div><span>OPEN PRs</span><motion.strong key={pullRequests.length} initial={reducedMotion ? false : { scale: .72, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{pullRequests.length || "—"}</motion.strong></div>
        <div><span>READY</span><strong>{github.counts?.READY_FOR_APPROVAL ?? 0}</strong></div>
        <div><span>BLOCKED</span><strong>{github.counts?.BLOCKED_BY_POLICY ?? 0}</strong></div>
        <div><span>LAST PUSH</span><strong>{github.repository ? new Date(github.repository.pushedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div>
      </div>
      <div className="github-ledger">
        <div className="ledger-head"><span><GitPullRequest size={13} /> REVIEW LEDGER</span><small>{github.syncedAt ? `SYNCED ${new Date(github.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : github.error || "AWAITING LIVE DATA"}</small></div>
        <div className="outcome-filters" aria-label="Filter pull requests by outcome">{githubOutcomes.map((outcome) => <button key={outcome} className={githubFilter === outcome ? "active" : ""} onClick={() => setGithubFilter(outcome)}>{outcome.replaceAll("_", " ")} {outcome === "ALL" ? pullRequests.length : github.counts?.[outcome] ?? 0}</button>)}</div>
        <div className="pr-stream">
          <AnimatePresence mode="popLayout">
            {filteredPulls.map((pull, index) => <motion.a layout key={pull.number} href={pull.url} target="_blank" rel="noreferrer" className="pr-ticket" initial={reducedMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: .96 }} transition={{ delay: reducedMotion ? 0 : Math.min(index * .035, .28) }}>
              <span className="pr-number">#{pull.number}</span><strong>{pull.title}</strong><span className={`outcome-tag ${outcomeClass(pull.outcome)}`}>{pull.outcome.replaceAll("_", " ")}</span><small>{pull.head} → {pull.base}</small><ArrowUpRight size={14} />
            </motion.a>)}
          </AnimatePresence>
          {github.available && filteredPulls.length === 0 && <p className="ledger-empty">No pull requests match this outcome.</p>}
        </div>
      </div>
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
          {incident.events.length === 0 ? <div className="empty-state"><Activity size={18} /><span>NO ACTIVE INCIDENT</span><p>Start the drill to gather fresh evidence from the broken checkout service.</p></div> : <AnimatePresence initial={false}>{incident.events.map((event) => <motion.article layout initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`timeline-event ${event.kind}`} key={event.id}><time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div><h2>{event.label}</h2><p>{event.detail}</p>{event.role && <small>HERMES / {event.role}</small>}</div></motion.article>)}</AnimatePresence>}
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
