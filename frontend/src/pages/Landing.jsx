// AlertMind — Landing Page
import { useEffect, useRef, useState } from "react";
import { useNavigate }  from "react-router-dom";
import { useAuthStore } from "../lib/store.js";
import { useUIStore }   from "../lib/store.js";

// Sibling wecrew product — agent operations command plane.
const WECREW_OPS_URL = "https://sovereign.ops.wecrew.in/";

const FEATURES = [
  { icon:"🧠", title:"Local LLM triage", body:"llama3.3 reads each alert, searches your runbooks, and returns root cause + exact fix — on your own hardware, no data leaves the box." },
  { icon:"📚", title:"Living knowledge base", body:"Every resolved incident is embedded back into pgvector, so the next lookup is sharper than the last. The system compounds." },
  { icon:"⚡", title:"SLA on autopilot", body:"P1→P4 timers, breach detection, and Slack escalation run on a beat — so the clock is watched even when you aren't." },
];

const STATS = [
  { n:"15", u:"min", l:"P1 target SLA" },
  { n:"768", u:"dim", l:"pgvector embeddings" },
  { n:"100", u:"%", l:"self-hosted" },
  { n:"4", u:"tiers", l:"severity routing" },
];

// Tech the platform runs on — shown as a trust strip.
const STACK = ["Django", "DRF", "Celery", "Postgres · pgvector", "Redis", "Keycloak", "OPA", "Ollama"];

// Alternating deep-dive rows. `visual` renders a small on-brand illustration.
const DEEP_DIVES = [
  {
    kicker: "Retrieval-augmented triage",
    title: "Root cause and a runbook — in seconds",
    body: "Each incoming alert becomes a query. AlertMind embeds it, runs a cosine search over your runbooks and resolved incidents in pgvector, then asks a local LLM for a structured answer grounded only in what it retrieved.",
    points: [
      "Semantic search over your own runbooks + past incidents",
      "Structured output: root cause, numbered fix steps, prevention",
      "Confidence score derived from retrieval similarity",
    ],
    visual: "analysis",
  },
  {
    kicker: "A knowledge base that compounds",
    title: "Every resolution makes the next one faster",
    body: "When a ticket is resolved, its root cause and fix are embedded straight back into the vector store. The next similar alert retrieves it automatically — your operational memory grows with every incident.",
    points: [
      "Resolved incidents re-ingested into pgvector",
      "Runbooks ingested on create",
      "No model fine-tuning or data egress required",
    ],
    visual: "vectors",
  },
  {
    kicker: "SLA on autopilot",
    title: "The clock is watched even when you aren't",
    body: "P1→P4 timers start the moment a ticket is created. A Celery beat scans for breaches every minute and escalates to Slack — routing and severity are derived automatically from the alert.",
    points: [
      "Severity mapping: critical→P1, warning→P2, info→P3",
      "Per-minute breach scan with Slack escalation",
      "Deep links to Grafana / ops console per affected CI",
    ],
    visual: "sla",
  },
  {
    kicker: "Secure & self-hosted",
    title: "Your infrastructure. Your keys. Your data.",
    body: "Authentication is Keycloak (OIDC/SSO); authorization is policy-based via OPA. Everything runs in your environment — the LLM, the vectors, the tickets — so nothing sensitive leaves the box.",
    points: [
      "Keycloak OIDC with admin / engineer / viewer roles",
      "OPA policy-based access control on every request",
      "Runs on your own hardware — air-gap friendly",
    ],
    visual: "security",
  },
];

// Real SLA tiers from the backend (minutes): P1=15, P2=120, P3=480, P4=1440.
const TIERS = [
  { tier:"P1", cls:"badge-p1", label:"Critical", sla:"15 min", desc:"Service down / major customer impact. Immediate action.", ex:"Checkout API saturated" },
  { tier:"P2", cls:"badge-p2", label:"High",     sla:"2 hrs",  desc:"Degraded service or high risk of escalation.",        ex:"DB pool exhaustion" },
  { tier:"P3", cls:"badge-p3", label:"Moderate", sla:"8 hrs",  desc:"Limited impact, workaround available.",               ex:"Elevated latency" },
  { tier:"P4", cls:"badge-p4", label:"Low",      sla:"24 hrs", desc:"Minor / informational, no active impact.",           ex:"Cert expiring soon" },
];

const COMPARE = [
  { label:"SLA target",        vals:["15 min", "2 hrs", "8 hrs", "24 hrs"] },
  { label:"AI auto-triage",    vals:["yes", "yes", "yes", "yes"] },
  { label:"Slack escalation",  vals:["yes", "yes", "on breach", "on breach"] },
  { label:"Breach scan",       vals:["1 min", "1 min", "1 min", "1 min"] },
  { label:"Routing",           vals:["On-call now", "On-call", "Queue", "Backlog"] },
];

const FAQS = [
  { q:"Where does my data go?", a:"Nowhere. AlertMind is self-hosted end to end — the LLM, the pgvector store, and every ticket live in your environment. With the local Ollama model, no alert content ever leaves your infrastructure." },
  { q:"Which LLM can I use?", a:"A local Ollama model (llama3.3) by default. You can also point AlertMind at any OpenAI-compatible endpoint — xAI (Grok), OpenAI, Groq, Together, or a self-hosted vLLM — by setting LLM_API_KEY / LLM_API_BASE / LLM_API_MODEL." },
  { q:"How does the AI find the right fix?", a:"It embeds each alert and runs a cosine similarity search over your runbooks and resolved incidents in Postgres pgvector, then prompts the LLM to answer using only that retrieved context. Confidence is scaled from the retrieval similarity." },
  { q:"How do users sign in?", a:"Keycloak (OIDC/SSO). Realm roles map to admin, engineer, and viewer, and every API request is checked against an Open Policy Agent policy for fine-grained, ownership-aware access control." },
  { q:"What creates an incident?", a:"Prometheus / Alertmanager webhooks, the REST API, or a manual ticket. Analysis is triggered automatically on creation, and resolving a ticket feeds it back into the knowledge base." },
  { q:"Does it fit our monitoring stack?", a:"Yes. It ingests native Alertmanager payloads, escalates to Slack, and renders Grafana / ops-console deep links for the affected CI — no changes to your existing receivers required." },
];

// Animated "incident radar" — concentric sweep with alert nodes resolving to green.
function Radar() {
  return (
    <svg viewBox="0 0 320 320" width="100%" style={{ maxWidth:"440px", overflow:"visible" }} role="img" aria-label="Incident radar visualization">
      <defs>
        <radialGradient id="rg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="var(--amber)" stopOpacity="0.18" />
          <stop offset="70%" stopColor="var(--amber)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="var(--amber)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="url(#rg)" />
      {[150,112,74,36].map(r => (
        <circle key={r} cx="160" cy="160" r={r} fill="none" stroke="var(--border2)" strokeWidth="1" strokeDasharray="2 5" opacity="0.7" />
      ))}
      <line x1="10" y1="160" x2="310" y2="160" stroke="var(--border2)" strokeWidth="1" opacity="0.4" />
      <line x1="160" y1="10" x2="160" y2="310" stroke="var(--border2)" strokeWidth="1" opacity="0.4" />
      {/* rotating sweep */}
      <g style={{ transformOrigin:"160px 160px", animation:"sweep 6s linear infinite" }}>
        <path d="M160 160 L160 12 A148 148 0 0 1 300 160 Z" fill="url(#sweep)" opacity="0.5" />
        <line x1="160" y1="160" x2="160" y2="12" stroke="var(--amber)" strokeWidth="1.5" />
      </g>
      {/* alert nodes */}
      {[
        { x:118, y:96,  c:"var(--red)",   d:"0s"   },
        { x:228, y:128, c:"var(--orange)",d:"0.6s" },
        { x:96,  y:208, c:"var(--green)", d:"1.1s" },
        { x:214, y:224, c:"var(--green)", d:"1.6s" },
        { x:160, y:160, c:"var(--amber)", d:"0s", core:true },
      ].map((p,i) => (
        <g key={i}>
          {!p.core && <circle cx={p.x} cy={p.y} r="11" fill={p.c} opacity="0.14" style={{ transformOrigin:`${p.x}px ${p.y}px`, animation:`ring 2.4s ease-out ${p.d} infinite` }} />}
          <circle cx={p.x} cy={p.y} r={p.core?"9":"4.5"} fill={p.c} />
          {p.core && <circle cx={p.x} cy={p.y} r="9" fill="none" stroke="var(--amber)" strokeWidth="2" opacity="0.35" style={{ transformOrigin:"160px 160px", animation:"ring 2.4s ease-out infinite" }} />}
        </g>
      ))}
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();
  return (
    <button className="theme-toggle" onClick={toggleTheme} title={theme==="dark"?"Switch to light":"Switch to dark"} aria-label="Toggle theme">
      {theme==="dark" ? "☀" : "☾"}
    </button>
  );
}

// Scroll-reveal wrapper. Falls back to visible if IntersectionObserver is absent,
// so content is never hidden if animations don't run.
function Reveal({ children, delay = 0, style, as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { setShown(true); io.disconnect(); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? "none" : "translateY(18px)",
      transition: `opacity .6s ease ${delay}s, transform .6s cubic-bezier(.22,.68,.32,1) ${delay}s`,
      ...style,
    }} {...rest}>{children}</Tag>
  );
}

function SectionHeading({ kicker, title, sub, id }) {
  return (
    <div id={id} style={{ scrollMarginTop:"84px", marginBottom:"38px", maxWidth:"680px" }}>
      <div className="kicker" style={{ marginBottom:"14px" }}>{kicker}</div>
      <h2 style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(28px,3.6vw,44px)", letterSpacing:"-.5px", lineHeight:1.12 }}>{title}</h2>
      {sub && <p style={{ marginTop:"14px", fontSize:"clamp(14px,1.5vw,17px)", color:"var(--ink2)", lineHeight:1.7 }}>{sub}</p>}
    </div>
  );
}

// ── Compact on-brand illustrations for the deep-dive rows ──
function DiveVisual({ kind }) {
  const wrap = { padding:"20px", minHeight:"250px", display:"flex", flexDirection:"column", justifyContent:"center", gap:"12px", overflow:"hidden" };
  if (kind === "analysis") {
    return (
      <div className="card" style={{ ...wrap, boxShadow:"var(--shadow-lg)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px", fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)" }}>
          <span className="badge badge-p1">P1</span> incident · checkout-api
        </div>
        <div style={{ fontFamily:"var(--mono)", fontSize:"12.5px", lineHeight:1.9 }}>
          <div><span style={{ color:"var(--amberFg)" }}>🧠 AI</span> matched <span style={{ color:"var(--ink)" }}>3 runbooks</span></div>
          <div style={{ color:"var(--ink)" }}>🔴 root cause <span style={{ color:"var(--ink2)" }}>stuck migration holds idle connections</span></div>
          <div style={{ color:"var(--ink)" }}>🔧 fix <span style={{ color:"var(--ink2)" }}>terminate idle backends, raise pool</span></div>
        </div>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"var(--ink3)", marginBottom:"5px", fontFamily:"var(--mono)" }}><span>confidence</span><span style={{ color:"var(--amberFg)" }}>92%</span></div>
          <div style={{ height:"7px", borderRadius:"999px", background:"var(--paper2)", overflow:"hidden" }}>
            <div style={{ width:"92%", height:"100%", background:"var(--amber)", borderRadius:"999px" }} />
          </div>
        </div>
      </div>
    );
  }
  if (kind === "vectors") {
    const rows = [{ n:"runbook · pg pool", s:94 }, { n:"incident #P1-4471", s:88 }, { n:"runbook · db restart", s:71 }, { n:"incident #P2-3390", s:64 }];
    return (
      <div className="card" style={{ ...wrap, boxShadow:"var(--shadow-lg)" }}>
        <div style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)" }}>pgvector · cosine similarity</div>
        {rows.map((r,i) => (
          <div key={i}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11.5px", color:"var(--ink2)", marginBottom:"5px", fontFamily:"var(--mono)" }}><span>{r.n}</span><span style={{ color:"var(--blueFg)" }}>{r.s}%</span></div>
            <div style={{ height:"6px", borderRadius:"999px", background:"var(--paper2)", overflow:"hidden" }}>
              <div style={{ width:`${r.s}%`, height:"100%", background:"var(--blue)", opacity:.85, borderRadius:"999px" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "sla") {
    return (
      <div className="card" style={{ ...wrap, boxShadow:"var(--shadow-lg)" }}>
        <div style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)" }}>SLA timers · live</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px" }}>
          {TIERS.map((t) => (
            <div key={t.tier} style={{ border:"1px solid var(--border)", borderRadius:"6px", padding:"12px 14px", background:"var(--paper)" }}>
              <span className={`badge ${t.cls}`}>{t.tier}</span>
              <div style={{ fontFamily:"var(--serif)", fontWeight:600, fontSize:"22px", marginTop:"8px", color:"var(--ink)" }}>{t.sla}</div>
              <div style={{ fontSize:"11px", color:"var(--ink3)", fontFamily:"var(--mono)" }}>target</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // security
  const stack = [{ t:"Keycloak · OIDC SSO", c:"var(--blue)" }, { t:"OPA · policy checks", c:"var(--amber)" }, { t:"Your infrastructure", c:"var(--green)" }];
  return (
    <div className="card" style={{ ...wrap, boxShadow:"var(--shadow-lg)", alignItems:"stretch" }}>
      <div style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)" }}>request → verified → allowed</div>
      {stack.map((s,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", border:"1px solid var(--border)", borderRadius:"6px", padding:"13px 14px", background:"var(--paper)" }}>
          <span style={{ width:"9px", height:"9px", borderRadius:"50%", background:s.c }} />
          <span style={{ fontSize:"13px", color:"var(--ink)", fontFamily:"var(--mono)" }}>{s.t}</span>
          <span style={{ marginLeft:"auto", fontSize:"14px", color:"var(--greenFg)" }}>✓</span>
        </div>
      ))}
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding:"0", overflow:"hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ width:"100%", display:"flex", alignItems:"center", gap:"14px", padding:"18px 20px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left", color:"var(--ink)", font:"inherit" }}
      >
        <span style={{ fontSize:"15px", fontWeight:600, flex:1, fontFamily:"var(--sans)" }}>{q}</span>
        <span style={{ fontFamily:"var(--mono)", fontSize:"18px", color:"var(--amberFg)", transform:open?"rotate(45deg)":"none", transition:"transform .2s" }}>+</span>
      </button>
      <div style={{ maxHeight:open?"260px":"0", opacity:open?1:0, transition:"max-height .3s ease, opacity .3s ease", overflow:"hidden" }}>
        <p style={{ padding:"0 20px 20px", color:"var(--ink2)", fontSize:"14px", lineHeight:1.7 }}>{a}</p>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const token = useAuthStore(s => s.token);

  useEffect(() => { if (token) navigate("/app/dashboard"); }, [token]);

  const go = () => navigate("/login");
  const PADX = "clamp(20px,6vw,72px)";

  return (
    <div className="atmos" style={{ background:"var(--paper)", color:"var(--ink)", minHeight:"100vh", fontFamily:"var(--sans)" }}>
      {/* Nav */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"color-mix(in srgb, var(--paper) 82%, transparent)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", borderBottom:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"14px", padding:`14px ${PADX}`, maxWidth:"1180px", margin:"0 auto" }}>
          <a href="#top" style={{ display:"flex", alignItems:"center", gap:"11px", marginRight:"auto", textDecoration:"none", color:"var(--ink)" }}>
            <div style={{ width:"34px", height:"34px", background:"var(--amber)", borderRadius:"4px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"17px" }}>🧠</div>
            <span style={{ fontSize:"19px", fontWeight:"600", fontFamily:"var(--serif)", letterSpacing:"-.2px" }}>AlertMind</span>
          </a>
          <div className="nav-links" style={{ display:"flex", alignItems:"center", gap:"22px", marginRight:"8px" }}>
            <a href="#features" style={{ fontSize:"13.5px", color:"var(--ink2)", textDecoration:"none" }}>Features</a>
            <a href="#tiers" style={{ fontSize:"13.5px", color:"var(--ink2)", textDecoration:"none" }}>Response tiers</a>
            <a href="#faq" style={{ fontSize:"13.5px", color:"var(--ink2)", textDecoration:"none" }}>FAQ</a>
          </div>
          <a href={WECREW_OPS_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>Wecrew Ops ↗</a>
          <ThemeToggle />
          <button onClick={go} className="btn btn-primary btn-sm">Sign in →</button>
        </div>
      </nav>

      {/* Hero */}
      <header id="top" style={{ maxWidth:"1180px", margin:"0 auto", padding:`clamp(24px,5vw,56px) ${PADX} 40px`, display:"grid", gridTemplateColumns:"minmax(0,1.05fr) minmax(0,.95fr)", gap:"40px", alignItems:"center" }}>
        <div>
          <div className="kicker reveal" style={{ animationDelay:".05s" }}>AI-Powered ITSM · Self-hosted</div>
          <h1 className="reveal" style={{ animationDelay:".12s", fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(42px,5.6vw,76px)", lineHeight:"1.04", letterSpacing:"-1px", margin:"18px 0 18px" }}>
            Resolve incidents<br/><em style={{ color:"var(--amberFg)", fontStyle:"italic" }}>before they escalate.</em>
          </h1>
          <p className="reveal" style={{ animationDelay:".2s", fontSize:"clamp(15px,1.6vw,18px)", color:"var(--ink2)", maxWidth:"520px", lineHeight:"1.7", marginBottom:"30px" }}>
            AlertMind reads your alerts with a local LLM, searches your runbooks via pgvector, and hands back root cause and resolution steps in seconds — entirely on your own infrastructure.
          </p>
          <div className="reveal" style={{ animationDelay:".28s", display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={go} className="btn btn-primary btn-lg">Get started →</button>
            <a href="#features" className="btn btn-secondary btn-lg">See how it works</a>
          </div>
          <div className="reveal chip" style={{ animationDelay:".36s", marginTop:"28px" }}>
            <span className="live" /> <span style={{ color:"var(--ink2)" }}>Live · llama3.3:70b on your hardware</span>
          </div>
        </div>

        <div className="reveal" style={{ animationDelay:".22s", display:"flex", justifyContent:"center", animation:"fadeUp .8s both .22s" }}>
          <div style={{ animation:"floaty 7s ease-in-out infinite" }}><Radar /></div>
        </div>
      </header>

      {/* Stats strip */}
      <section style={{ borderTop:"1px solid var(--border)", borderBottom:"1px solid var(--border)", background:"var(--white)" }}>
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:`22px ${PADX}`, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"20px" }}>
          {STATS.map((s,i) => (
            <div key={i} className="reveal" style={{ animationDelay:`${.1+i*.07}s` }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:"4px" }}>
                <span style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"34px", lineHeight:1, color:"var(--ink)" }}>{s.n}</span>
                <span style={{ fontFamily:"var(--mono)", fontSize:"12px", color:"var(--amberFg)" }}>{s.u}</span>
              </div>
              <div style={{ fontSize:"12px", color:"var(--ink3)", marginTop:"6px", textTransform:"uppercase", letterSpacing:".08em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tech trust strip */}
      <section style={{ borderBottom:"1px solid var(--border)", background:"var(--paper2)" }}>
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:`18px ${PADX}`, display:"flex", alignItems:"center", gap:"14px", flexWrap:"wrap", justifyContent:"center" }}>
          <span style={{ fontFamily:"var(--mono)", fontSize:"11px", letterSpacing:".14em", textTransform:"uppercase", color:"var(--ink3)", marginRight:"4px" }}>Runs on your stack</span>
          {STACK.map((s,i) => (
            <span key={i} style={{ fontFamily:"var(--mono)", fontSize:"12.5px", color:"var(--ink2)", padding:"5px 12px", border:"1px solid var(--border)", borderRadius:"999px", background:"var(--white)" }}>{s}</span>
          ))}
        </div>
      </section>

      {/* Feature deep-dives */}
      <section style={{ maxWidth:"1180px", margin:"0 auto", padding:`clamp(48px,7vw,88px) ${PADX} clamp(24px,4vw,40px)` }}>
        <Reveal>
          <SectionHeading
            id="features"
            kicker="The loop that learns"
            title="From alert to answer — and every answer makes the next one faster."
            sub="Four capabilities that turn raw alerts into resolved incidents, then remember how you did it."
          />
        </Reveal>

        {/* quick feature cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"18px", marginBottom:"clamp(40px,6vw,72px)" }}>
          {FEATURES.map((f,i) => (
            <Reveal key={i} delay={i*0.06}>
              <article className="card" style={{ padding:"26px 24px", height:"100%", transition:"transform .25s, box-shadow .25s" }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="var(--shadow-lg)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
                <div style={{ width:"44px", height:"44px", borderRadius:"12px", background:"var(--amberL)", border:"1px solid var(--amberB)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"21px", marginBottom:"16px" }}>{f.icon}</div>
                <h3 style={{ fontSize:"17px", fontWeight:"700", marginBottom:"8px", color:"var(--ink)" }}>{f.title}</h3>
                <p style={{ fontSize:"13.5px", color:"var(--ink2)", lineHeight:"1.65" }}>{f.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* alternating deep-dive rows */}
        <div style={{ display:"grid", gap:"clamp(36px,5vw,64px)" }}>
          {DEEP_DIVES.map((d,i) => {
            const flip = i % 2 === 1;
            return (
              <Reveal key={i}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:"clamp(24px,4vw,52px)", alignItems:"center" }}>
                  <div style={{ order: flip ? 2 : 1 }}>
                    <div className="kicker" style={{ marginBottom:"12px" }}>{d.kicker}</div>
                    <h3 style={{ fontFamily:"var(--serif)", fontWeight:600, fontSize:"clamp(22px,2.6vw,30px)", letterSpacing:"-.4px", lineHeight:1.2, marginBottom:"14px", color:"var(--ink)" }}>{d.title}</h3>
                    <p style={{ fontSize:"15px", color:"var(--ink2)", lineHeight:1.7, marginBottom:"18px" }}>{d.body}</p>
                    <ul style={{ listStyle:"none", display:"grid", gap:"10px" }}>
                      {d.points.map((p,j) => (
                        <li key={j} style={{ display:"flex", gap:"10px", alignItems:"flex-start", fontSize:"14px", color:"var(--ink)" }}>
                          <span aria-hidden style={{ color:"var(--amberFg)", fontWeight:700, lineHeight:1.5 }}>✓</span>
                          <span style={{ color:"var(--ink2)" }}>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ order: flip ? 1 : 2 }}><DiveVisual kind={d.visual} /></div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Response tiers + comparison */}
      <section style={{ background:"var(--white)", borderTop:"1px solid var(--border)", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:`clamp(48px,7vw,88px) ${PADX}` }}>
          <Reveal>
            <SectionHeading
              id="tiers"
              kicker="Severity that routes itself"
              title="Four response tiers, mapped automatically."
              sub="Every alert is classified P1–P4 on arrival, with an SLA clock and escalation path attached. No manual triage required."
            />
          </Reveal>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"16px", marginBottom:"32px" }}>
            {TIERS.map((t,i) => (
              <Reveal key={t.tier} delay={i*0.05}>
                <div className="card" style={{ padding:"22px", height:"100%" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
                    <span className={`badge ${t.cls}`}>{t.tier}</span>
                    <span style={{ fontSize:"12px", color:"var(--ink3)", fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:".06em" }}>{t.label}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:"6px", marginBottom:"10px" }}>
                    <span style={{ fontFamily:"var(--serif)", fontWeight:600, fontSize:"30px", color:"var(--ink)" }}>{t.sla}</span>
                    <span style={{ fontSize:"12px", color:"var(--ink3)", fontFamily:"var(--mono)" }}>SLA</span>
                  </div>
                  <p style={{ fontSize:"13px", color:"var(--ink2)", lineHeight:1.6, marginBottom:"12px" }}>{t.desc}</p>
                  <div style={{ fontSize:"11.5px", color:"var(--ink3)", fontFamily:"var(--mono)", borderTop:"1px solid var(--border)", paddingTop:"10px" }}>e.g. {t.ex}</div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* comparison table */}
          <Reveal>
            <div className="card" style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth:"560px", fontSize:"13.5px" }}>
                <thead>
                  <tr style={{ background:"var(--paper2)" }}>
                    <th style={{ textAlign:"left", padding:"14px 18px", color:"var(--ink2)", fontFamily:"var(--mono)", fontSize:"11px", textTransform:"uppercase", letterSpacing:".08em", fontWeight:600 }}>Capability</th>
                    {TIERS.map(t => (
                      <th key={t.tier} style={{ textAlign:"center", padding:"14px 12px" }}><span className={`badge ${t.cls}`}>{t.tier}</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row,ri) => (
                    <tr key={ri} style={{ borderTop:"1px solid var(--border)" }}>
                      <td style={{ padding:"13px 18px", color:"var(--ink)", fontWeight:500 }}>{row.label}</td>
                      {row.vals.map((v,ci) => (
                        <td key={ci} style={{ textAlign:"center", padding:"13px 12px", color: v==="yes" ? "var(--greenFg)" : "var(--ink2)", fontFamily: v==="yes" ? "var(--sans)" : "var(--mono)", fontSize: v==="yes" ? "15px" : "12.5px" }}>
                          {v==="yes" ? "✓" : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Terminal mock */}
      <section style={{ maxWidth:"1180px", margin:"0 auto", padding:`clamp(56px,8vw,96px) ${PADX}` }}>
        <Reveal>
          <div className="card" style={{ overflow:"hidden", boxShadow:"var(--shadow-lg)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"12px 16px", borderBottom:"1px solid var(--border)", background:"var(--paper)" }}>
              <span style={{ width:"11px", height:"11px", borderRadius:"50%", background:"#FF5F57" }} />
              <span style={{ width:"11px", height:"11px", borderRadius:"50%", background:"#FEBC2E" }} />
              <span style={{ width:"11px", height:"11px", borderRadius:"50%", background:"#28C840" }} />
              <span style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)", marginLeft:"8px" }}>alertmind · incident #P1-4471</span>
              <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"6px" }}><span className="live" /><span style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--greenFg)" }}>resolved</span></span>
            </div>
            <div style={{ padding:"22px 24px", fontFamily:"var(--mono)", fontSize:"13px", lineHeight:"1.9", color:"var(--ink2)" }}>
              <div><span style={{ color:"var(--redFg)" }}>▲ ALERT</span> &nbsp;PostgreSQL connection pool exhausted on <span style={{ color:"var(--ink)" }}>prod-db-01</span></div>
              <div><span style={{ color:"var(--amberFg)" }}>🧠 AI</span> &nbsp;&nbsp;&nbsp;&nbsp;matched 3 runbooks · confidence <span style={{ color:"var(--ink)" }}>92%</span></div>
              <div style={{ color:"var(--ink)" }}>🔴 root cause &nbsp;<span style={{ color:"var(--ink2)" }}>idle connections held by a stuck migration worker</span></div>
              <div style={{ color:"var(--ink)" }}>🔧 fix &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color:"var(--ink2)" }}>SELECT pg_terminate_backend(pid) WHERE state='idle'…</span></div>
              <div style={{ color:"var(--greenFg)" }}>✓ verified &nbsp;pool back to 18/100 · SLA met with 11m to spare<span style={{ display:"inline-block", width:"8px", height:"15px", background:"var(--amber)", marginLeft:"4px", verticalAlign:"-2px", animation:"caret 1.1s step-end infinite" }} /></div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ background:"var(--white)", borderTop:"1px solid var(--border)" }}>
        <div style={{ maxWidth:"860px", margin:"0 auto", padding:`clamp(48px,7vw,88px) ${PADX}` }}>
          <Reveal>
            <SectionHeading id="faq" kicker="Questions, answered" title="Everything you need to know before you sign in." />
          </Reveal>
          <div style={{ display:"grid", gap:"12px" }}>
            {FAQS.map((f,i) => (
              <Reveal key={i} delay={i*0.04}><FaqItem q={f.q} a={f.a} /></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + footer */}
      <footer className="atmos" style={{ borderTop:"1px solid var(--border)", background:"var(--white)" }}>
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:`clamp(48px,7vw,84px) ${PADX}`, textAlign:"center", position:"relative" }}>
          <Reveal>
            <h2 style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(30px,4.2vw,52px)", letterSpacing:"-.6px", marginBottom:"14px" }}>
              Put the on-call clock <em style={{ color:"var(--amberFg)", fontStyle:"italic" }}>on your side.</em>
            </h2>
            <p style={{ color:"var(--ink2)", fontSize:"16px", marginBottom:"28px" }}>Sign in and let the AI take first watch.</p>
            <div style={{ display:"flex", gap:"12px", justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={go} className="btn btn-primary btn-lg">Open AlertMind →</button>
              <a href="#features" className="btn btn-secondary btn-lg">Explore features</a>
            </div>
          </Reveal>

          {/* footer columns */}
          <div style={{ marginTop:"56px", paddingTop:"32px", borderTop:"1px solid var(--border)", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"28px", textAlign:"left" }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:"9px", marginBottom:"12px" }}>
                <div style={{ width:"28px", height:"28px", background:"var(--amber)", borderRadius:"4px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px" }}>🧠</div>
                <span style={{ fontSize:"16px", fontWeight:600, fontFamily:"var(--serif)" }}>AlertMind</span>
              </div>
              <p style={{ fontSize:"12.5px", color:"var(--ink3)", lineHeight:1.6, maxWidth:"240px" }}>Self-hosted, AI-powered ITSM. Root cause and resolution in seconds — on your own infrastructure.</p>
            </div>
            <FooterCol title="Product" links={[["Features","#features"],["Response tiers","#tiers"],["FAQ","#faq"],["Sign in","#/login"]]} onNav={go} />
            <FooterCol title="Platform" links={[["Django + DRF",null],["Celery workers",null],["Postgres · pgvector",null],["Keycloak · OPA",null]]} />
            <FooterCol title="Ecosystem" links={[["Wecrew Ops ↗",WECREW_OPS_URL]]} external />
          </div>

          <div style={{ marginTop:"28px", paddingTop:"20px", borderTop:"1px solid var(--border)", display:"flex", flexWrap:"wrap", gap:"10px", justifyContent:"space-between", alignItems:"center", fontSize:"12px", color:"var(--ink3)", fontFamily:"var(--mono)" }}>
            <span>🧠 AlertMind · AI-Powered ITSM · Part of Wecrew Ops</span>
            <span>Self-hosted · Django · Celery · pgvector · Keycloak</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links, external, onNav }) {
  const navigate = useNavigate();
  return (
    <div>
      <div style={{ fontSize:"11px", fontFamily:"var(--mono)", textTransform:"uppercase", letterSpacing:".1em", color:"var(--ink3)", marginBottom:"14px" }}>{title}</div>
      <ul style={{ listStyle:"none", display:"grid", gap:"10px" }}>
        {links.map(([label, href], i) => (
          <li key={i}>
            {href == null ? (
              <span style={{ fontSize:"13px", color:"var(--ink2)" }}>{label}</span>
            ) : href === "#/login" ? (
              <button onClick={onNav || (()=>navigate("/login"))} style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:"13px", color:"var(--ink2)", font:"inherit" }}>{label}</button>
            ) : (
              <a href={href} target={external?"_blank":undefined} rel={external?"noopener noreferrer":undefined} style={{ fontSize:"13px", color:"var(--ink2)", textDecoration:"none" }}>{label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
