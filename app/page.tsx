"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  CircleAlert,
  GitPullRequest,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const evidence = [
  { label: "runtime logs", status: "grounded", x: 11, y: 24 },
  { label: "git diff", status: "grounded", x: 72, y: 17 },
  { label: "deploy config", status: "conflict", x: 78, y: 72 },
  { label: "runbook", status: "stale", x: 12, y: 76 },
];

const flow = [
  ["01", "Ground", "Logs, diffs, deployment config, and the runbook become one source-backed Context Pack."],
  ["02", "Investigate", "A specialist crew traces every claim to evidence and surfaces stale or conflicting instructions."],
  ["03", "Repair", "The smallest possible patch is prepared inside a tightly bounded action scope."],
  ["04", "Prove", "Tests, preview requests, and the safety gate decide whether a pull request is safe to open."],
];

function SignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const center = { x: rect.width / 2, y: rect.height / 2 };
      const points = evidence.map((item) => ({
        x: (item.x / 100) * rect.width,
        y: (item.y / 100) * rect.height,
      }));

      ctx.lineWidth = 1;
      points.forEach((point, i) => {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(center.x, center.y);
        ctx.strokeStyle = i === 2 ? "rgba(255, 104, 61, .62)" : "rgba(237, 240, 230, .28)";
        ctx.stroke();

        const t = reduced ? 0.55 : ((frame * 0.006 + i * 0.2) % 1);
        const x = point.x + (center.x - point.x) * t;
        const y = point.y + (center.y - point.y) * t;
        ctx.beginPath();
        ctx.arc(x, y, i === 2 ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 2 ? "#ff683d" : "#d9ff43";
        ctx.fill();
      });

      ctx.beginPath();
      ctx.arc(center.x, center.y, 30 + (reduced ? 0 : Math.sin(frame * 0.025) * 4), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(217,255,67,.75)";
      ctx.stroke();
      frame += 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />;
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.28], [0, reduceMotion ? 0 : 110]);

  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Request failed");
      setState("success");
    } catch {
      setState("error");
    }
  }

  return (
    <main>
      <nav className="nav-shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="GroundMesh On-Call home">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span>GroundMesh <b>On-Call</b></span>
        </a>
        <a className="nav-cta" href="#waitlist">Request early access <ArrowRight size={16} /></a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <motion.div className="hero-copy" style={{ y: heroY }}>
          <div className="eyebrow"><span className="live-dot" /> Failed deployment response agency</div>
          <h1>
            Verified context.<br />
            <span>Safe recovery.</span>
          </h1>
          <p className="hero-lede">
            GroundMesh On-Call fixes failed deployments with evidence, not guesses. It investigates the failure, prepares a bounded repair, proves it in preview, and opens the pull request.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#waitlist">Join the private beta <ArrowDownRight size={18} /></a>
            <a className="text-link" href="#proof">See the recovery proof <ArrowRight size={16} /></a>
          </div>
        </motion.div>

        <motion.div
          className="incident-stage"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95, rotate: 1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <SignalField />
          <div className="stage-head">
            <span>INC-1042 / checkout</span>
            <span className="stage-status"><CircleAlert size={14} /> investigating</span>
          </div>
          {evidence.map((item) => (
            <motion.div
              className={`evidence-node ${item.status}`}
              key={item.label}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 3.2, delay: item.x / 100, repeat: Infinity, ease: "easeInOut" }}
            >
              <i />{item.label}<small>{item.status}</small>
            </motion.div>
          ))}
          <div className="context-core">
            <ShieldCheck size={20} />
            <strong>96%</strong>
            <span>root-cause<br />confidence</span>
          </div>
          <div className="stage-outcome">
            <div><span>before</span><strong>HTTP 500</strong></div>
            <ArrowRight size={22} />
            <div><span>verified</span><strong>HTTP 200</strong></div>
          </div>
        </motion.div>

        <div className="hero-footnote">Built for SaaS teams without a full-time SRE bench.</div>
      </section>

      <section className="ticker" aria-label="GroundMesh capabilities">
        <div className="ticker-track">
          <span>SOURCE-BACKED CLAIMS</span><i />
          <span>STALE CONTEXT DETECTION</span><i />
          <span>BOUNDED AUTONOMY</span><i />
          <span>PREVIEW VERIFICATION</span><i />
          <span>HUMAN APPROVAL</span><i />
          <span aria-hidden="true">SOURCE-BACKED CLAIMS</span><i aria-hidden="true" />
          <span aria-hidden="true">STALE CONTEXT DETECTION</span><i aria-hidden="true" />
        </div>
      </section>

      <section className="proof-section" id="proof">
        <div className="section-intro">
          <span className="kicker">The proof</span>
          <h2>A recovery trail a human can actually trust.</h2>
          <p>Every conclusion points back to a source. Every action stays inside the incident. Every release waits for proof.</p>
        </div>

        <div className="proof-board">
          <div className="proof-topline">
            <div><span>INCIDENT</span><strong>INC-1042</strong></div>
            <div><span>SERVICE</span><strong>checkout-api</strong></div>
            <div><span>ELAPSED</span><strong>04:18</strong></div>
            <div className="proof-ready"><Check size={16} /> READY FOR APPROVAL</div>
          </div>
          <div className="proof-main">
            <div className="evidence-stack">
              <div className="stack-title">CONTEXT PACK <span>4 sources</span></div>
              <div className="claim current"><span>current code</span><strong>PAYMENTS_API_URL</strong><em>authority .95</em></div>
              <div className="claim conflict"><span>deploy config</span><strong>PAYMENT_API_URL</strong><em>conflict</em></div>
              <div className="claim stale"><span>runbook</span><strong>PAYMENT_API_URL</strong><em>stale</em></div>
              <div className="resolution-line"><ShieldCheck size={18} /><span>Trust current source code.<br />Mark runbook instruction stale.</span></div>
            </div>
            <div className="verification-list">
              <div className="verification-title">VERIFICATION</div>
              <div><span>Unit tests</span><strong>8 / 8</strong><Check size={16} /></div>
              <div><span>Preview deploy</span><strong>healthy</strong><Check size={16} /></div>
              <div><span>Synthetic checks</span><strong>10 / 10</strong><Check size={16} /></div>
              <div><span>Changed files</span><strong>1</strong><Check size={16} /></div>
              <div className="http-result"><span>500</span><ArrowRight size={20} /><strong>200</strong></div>
            </div>
          </div>
          <div className="proof-bottom">
            <div><GitPullRequest size={18} /><span>Remediation pull request</span><strong>#42 OPEN</strong></div>
            <div><LockKeyhole size={18} /><span>Unsafe SQL workaround</span><strong>BLOCKED</strong></div>
          </div>
        </div>
      </section>

      <section className="flow-section">
        <div className="flow-heading">
          <span className="kicker">One incident. Four disciplined moves.</span>
          <h2>The agent crew moves fast because the evidence travels with them.</h2>
        </div>
        <div className="flow-list">
          {flow.map(([number, title, copy], index) => (
            <motion.article
              key={number}
              initial={reduceMotion ? false : { opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{ duration: 0.5, delay: index * 0.06 }}
            >
              <span>{number}</span><h3>{title}</h3><p>{copy}</p><ArrowDownRight size={24} />
            </motion.article>
          ))}
        </div>
      </section>

      <section className="safety-section">
        <div className="safety-copy">
          <span className="kicker">Autonomy with a hard edge</span>
          <h2>It knows when<br /><em>not</em> to act.</h2>
          <p>The safety gate is deterministic. It blocks destructive, unsupported, or out-of-scope changes before they touch production.</p>
        </div>
        <motion.div
          className="blocked-card"
          initial={reduceMotion ? false : { rotate: -2, y: 25 }}
          whileInView={{ rotate: 1.5, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 120, damping: 16 }}
        >
          <div className="blocked-head"><CircleAlert size={18} /> ACTION SAFETY GATE</div>
          <code>DROP TABLE failed_orders;</code>
          <div className="blocked-stamp">BLOCKED</div>
          <ul>
            <li><Check size={15} /> Destructive database operation</li>
            <li><Check size={15} /> Unsupported by incident evidence</li>
            <li><Check size={15} /> Outside permitted repair scope</li>
          </ul>
        </motion.div>
      </section>

      <section className="waitlist-section" id="waitlist">
        <Sparkles className="waitlist-spark" size={26} />
        <span className="kicker">Private beta / limited design partners</span>
        <h2>Your next failed deploy<br />doesn&apos;t need to become<br /><em>your entire night.</em></h2>
        <p>Join the early-access list for GroundMesh On-Call.</p>
        {state === "success" ? (
          <div className="success-message"><Check size={20} /> You&apos;re on the list. We&apos;ll be in touch.</div>
        ) : (
          <form className="waitlist-form" onSubmit={joinWaitlist}>
            <label className="sr-only" htmlFor="email">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button type="submit" disabled={state === "loading"}>
              {state === "loading" ? "Joining..." : "Request access"}<ArrowRight size={18} />
            </button>
          </form>
        )}
        {state === "error" && <p className="form-error" role="alert">That didn&apos;t land. Please try again.</p>}
        <small>No noise. Just build updates and beta invitations.</small>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><span /><span /><span /><span /></span><span>GroundMesh <b>On-Call</b></span></div>
        <p>GroundMesh is the moat.<br />On-call recovery is the wedge.</p>
        <div><span>Verified context.</span><span>Safe recovery.</span><span>2026</span></div>
      </footer>
    </main>
  );
}
