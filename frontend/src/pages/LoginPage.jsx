// AlertMind — LoginPage
import React, { useState } from "react";
import { useNavigate }     from "react-router-dom";
import { useAuthStore, useUIStore } from "../lib/store.js";

const DEMO = [
  { role:"Admin",    email:"admin@alertmind.ai",    pass:"Admin@2026",    tint:"var(--amber)" },
  { role:"Engineer", email:"engineer@alertmind.ai", pass:"Engineer@2026", tint:"var(--blue)"  },
  { role:"Viewer",   email:"viewer@alertmind.ai",   pass:"Viewer@2026",   tint:"var(--green)" },
];

export function LoginPage() {
  const [email, setEmail]       = useState("admin@alertmind.ai");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuthStore();
  const { theme, toggleTheme }    = useUIStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate("/app/dashboard");
  };

  const fill = (d) => { setEmail(d.email); setPassword(d.pass); };

  return (
    <div style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"minmax(0,1.1fr) minmax(0,1fr)", fontFamily:"var(--sans)", background:"var(--paper)", color:"var(--ink)" }}>

      {/* ── Brand panel ── */}
      <aside className="atmos grain" style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"clamp(28px,4vw,52px)", background:"var(--white)", borderRight:"1px solid var(--border)", position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"11px", position:"relative", zIndex:1 }}>
          <div style={{ width:"38px", height:"38px", background:"#ff5b2e", borderRadius:"4px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"19px" }}>🧠</div>
          <span style={{ fontSize:"20px", fontWeight:"700", fontFamily:"var(--serif)" }}>AlertMind</span>
        </div>

        <div style={{ position:"relative", zIndex:1, maxWidth:"440px" }}>
          <div className="kicker reveal" style={{ animationDelay:".05s" }}>AI-Powered ITSM</div>
          <h1 className="reveal" style={{ animationDelay:".12s", fontFamily:"var(--serif)", fontWeight:"600", fontSize:"clamp(32px,4vw,52px)", lineHeight:"1.08", letterSpacing:"-.6px", margin:"16px 0 18px" }}>
            Your incidents,<br/><em style={{ color:"var(--amberFg)", fontStyle:"italic" }}>already triaged.</em>
          </h1>
          <p className="reveal" style={{ animationDelay:".2s", color:"var(--ink2)", fontSize:"15px", lineHeight:"1.7", marginBottom:"26px" }}>
            Sign in to a local-LLM control room that reads alerts, searches runbooks, and writes the fix — before the pager stops buzzing.
          </p>
          <div className="reveal" style={{ animationDelay:".28s", display:"flex", flexDirection:"column", gap:"10px" }}>
            {["Root cause + steps in seconds","Every fix re-embedded into the KB","SLA timers watched on a beat"].map((t,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", fontSize:"13.5px", color:"var(--ink2)" }}>
                <span style={{ color:"var(--amberFg)", fontWeight:"800" }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", gap:"8px" }}>
          <span className="live" />
          <span style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--ink3)" }}>Grok · alertmind.wecrew.in · wecrew</span>
        </div>
      </aside>

      {/* ── Form panel ── */}
      <main style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"clamp(24px,4vw,48px)", position:"relative" }}>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme" style={{ position:"absolute", top:"20px", right:"20px" }}>
          {theme==="dark" ? "☀" : "☾"}
        </button>

        <div className="reveal" style={{ width:"100%", maxWidth:"380px", animationDelay:".1s" }}>
          <h2 style={{ fontSize:"22px", fontWeight:"700", marginBottom:"4px", fontFamily:"var(--serif)" }}>Sign in to your workspace</h2>
          <p style={{ fontSize:"13px", color:"var(--ink3)", marginBottom:"24px" }}>Authenticated via Keycloak (OIDC).</p>

          {error && (
            <div style={{ marginBottom:"16px", padding:"11px 14px", background:"var(--redL)", border:"1px solid var(--amberB)", borderRadius:"10px", fontSize:"13px", color:"var(--redFg)" }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:"14px" }}>
              <label className="label">Email address</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div style={{ marginBottom:"22px" }}>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary btn-lg" style={{ width:"100%", justifyContent:"center" }}>
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          {/* Demo quick-fill */}
          <div style={{ marginTop:"26px", paddingTop:"20px", borderTop:"1px solid var(--border)" }}>
            <p style={{ fontSize:"11px", color:"var(--ink3)", textTransform:"uppercase", letterSpacing:".1em", marginBottom:"10px", fontFamily:"var(--mono)" }}>Demo accounts · click to fill</p>
            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
              {DEMO.map(d => (
                <button key={d.role} type="button" onClick={()=>fill(d)} className="chip" style={{ cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=d.tint}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                  <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:d.tint }} />{d.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
export default LoginPage;
