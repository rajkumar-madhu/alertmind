// AlertMind — Landing Page
import { useEffect }    from "react";
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

export default function Landing() {
  const navigate = useNavigate();
  const token = useAuthStore(s => s.token);

  useEffect(() => { if (token) navigate("/app/dashboard"); }, [token]);

  return (
    <div className="atmos" style={{ background:"var(--paper)", color:"var(--ink)", minHeight:"100vh", fontFamily:"var(--sans)" }}>
      {/* Nav */}
      <nav style={{ display:"flex", alignItems:"center", gap:"14px", padding:"20px clamp(20px,6vw,72px)", maxWidth:"1180px", margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"11px", marginRight:"auto" }}>
          <div style={{ width:"34px", height:"34px", background:"var(--amber)", borderRadius:"4px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"17px" }}>🧠</div>
          <span style={{ fontSize:"19px", fontWeight:"600", fontFamily:"var(--serif)", letterSpacing:"-.2px" }}>AlertMind</span>
        </div>
        <a href={WECREW_OPS_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration:"none" }}>Wecrew Ops ↗</a>
        <ThemeToggle />
        <button onClick={()=>navigate("/login")} className="btn btn-primary btn-sm">Sign in →</button>
      </nav>

      {/* Hero */}
      <header style={{ maxWidth:"1180px", margin:"0 auto", padding:"clamp(24px,5vw,56px) clamp(20px,6vw,72px) 40px", display:"grid", gridTemplateColumns:"minmax(0,1.05fr) minmax(0,.95fr)", gap:"40px", alignItems:"center" }}>
        <div>
          <div className="kicker reveal" style={{ animationDelay:".05s" }}>AI-Powered ITSM · Wecrew</div>
          <h1 className="reveal" style={{ animationDelay:".12s", fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(42px,5.6vw,76px)", lineHeight:"1.04", letterSpacing:"-1px", margin:"18px 0 18px" }}>
            Resolve incidents<br/><em style={{ color:"var(--amberFg)", fontStyle:"italic" }}>before they escalate.</em>
          </h1>
          <p className="reveal" style={{ animationDelay:".2s", fontSize:"clamp(15px,1.6vw,18px)", color:"var(--ink2)", maxWidth:"520px", lineHeight:"1.7", marginBottom:"30px" }}>
            AlertMind reads your alerts with a local LLM, searches your runbooks via pgvector, and hands back root cause and resolution steps in seconds — entirely on your own infrastructure.
          </p>
          <div className="reveal" style={{ animationDelay:".28s", display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={()=>navigate("/login")} className="btn btn-primary btn-lg">Get started →</button>
            <a href="#how" className="btn btn-secondary btn-lg">See how it works</a>
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
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:"22px clamp(20px,6vw,72px)", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"20px" }}>
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

      {/* Features */}
      <section id="how" style={{ maxWidth:"1180px", margin:"0 auto", padding:"clamp(48px,7vw,88px) clamp(20px,6vw,72px)" }}>
        <div className="kicker" style={{ marginBottom:"14px" }}>The loop that learns</div>
        <h2 style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(28px,3.6vw,44px)", letterSpacing:"-.5px", marginBottom:"40px", maxWidth:"640px", lineHeight:1.12 }}>
          From alert to answer — and every answer makes the next one faster.
        </h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"18px" }}>
          {FEATURES.map((f,i) => (
            <article key={i} className="card" style={{ padding:"26px 24px", transition:"transform .25s, box-shadow .25s" }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="var(--shadow-lg)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
              <div style={{ width:"44px", height:"44px", borderRadius:"12px", background:"var(--amberL)", border:"1px solid var(--amberB)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"21px", marginBottom:"16px" }}>{f.icon}</div>
              <h3 style={{ fontSize:"17px", fontWeight:"700", marginBottom:"8px", color:"var(--ink)" }}>{f.title}</h3>
              <p style={{ fontSize:"13.5px", color:"var(--ink2)", lineHeight:"1.65" }}>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Terminal mock */}
      <section style={{ maxWidth:"1180px", margin:"0 auto", padding:"0 clamp(20px,6vw,72px) clamp(56px,8vw,96px)" }}>
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
      </section>

      {/* CTA + footer */}
      <footer className="atmos" style={{ borderTop:"1px solid var(--border)", background:"var(--white)" }}>
        <div style={{ maxWidth:"1180px", margin:"0 auto", padding:"clamp(40px,6vw,72px) clamp(20px,6vw,72px)", textAlign:"center", position:"relative" }}>
          <h2 style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(30px,4.2vw,52px)", letterSpacing:"-.6px", marginBottom:"14px" }}>
            Put the on-call clock <em style={{ color:"var(--amberFg)", fontStyle:"italic" }}>on your side.</em>
          </h2>
          <p style={{ color:"var(--ink2)", fontSize:"16px", marginBottom:"28px" }}>Sign in and let the AI take first watch.</p>
          <button onClick={()=>navigate("/login")} className="btn btn-primary btn-lg">Open AlertMind →</button>
          <div style={{ marginTop:"40px", paddingTop:"24px", borderTop:"1px solid var(--border)", display:"flex", flexWrap:"wrap", gap:"10px", justifyContent:"space-between", alignItems:"center", fontSize:"12px", color:"var(--ink3)", fontFamily:"var(--mono)" }}>
            <span>
              🧠 AlertMind · AI-Powered ITSM · <a href={WECREW_OPS_URL} target="_blank" rel="noopener noreferrer" style={{ color:"var(--ink2)", textDecoration:"none", borderBottom:"1px solid var(--border2)" }}>Part of Wecrew Ops ↗</a>
            </span>
            <span>Self-hosted · Django · Celery · pgvector · Keycloak</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
