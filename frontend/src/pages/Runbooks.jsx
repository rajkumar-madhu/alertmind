// AlertMind — Runbooks Page
import { useState }    from "react";
import { useNavigate } from "react-router-dom";
import { useRunbooks } from "../hooks/index.js";
import { useAuthStore } from "../lib/store.js";
import { hasWriteRole } from "../lib/auth.js";

const CATEGORIES = ["All","Infrastructure","Database","Network","K8s","Security","Storage","Application"];

export default function Runbooks() {
  const navigate = useNavigate();
  const canWrite = hasWriteRole(useAuthStore((s) => s.user));
  const [cat, setCat]       = useState("all");
  const [search, setSearch] = useState("");
  const { data: runbooks = [], isLoading } = useRunbooks(
    Object.fromEntries([cat!=="all"&&["category",cat], search&&["search",search]].filter(Boolean))
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"18px" }}>
        <div>
          <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)" }}>Runbooks</h1>
          <p style={{ fontSize:"12px", color:"var(--ink3)" }}>Knowledge base — {runbooks.length} runbooks</p>
        </div>
        {canWrite && <button onClick={()=>navigate("/app/runbooks/new")} className="btn btn-primary">+ Add Runbook</button>}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:"8px", marginBottom:"16px", flexWrap:"wrap" }}>
        <input className="input" style={{ width:"220px" }} placeholder="Search runbooks..." value={search} onChange={e=>setSearch(e.target.value)} />
        {CATEGORIES.map(c => (
          <button key={c} onClick={()=>setCat(c.toLowerCase())} className={`btn btn-sm ${cat===c.toLowerCase()?"btn-primary":"btn-secondary"}`}>{c}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ padding:"40px", textAlign:"center" }}><div className="spinner" style={{ margin:"0 auto" }}/></div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:"14px" }}>
          {runbooks.map(r => (
            <div key={r.id} onClick={()=>navigate(`/app/runbooks/${r.id}`)} className="card" style={{ padding:"18px", cursor:"pointer", transition:"all .2s" }}
                 onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--amberB)";e.currentTarget.style.transform="translateY(-2px)"}}
                 onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform=""}}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"10px", background:"var(--blueL)", color:"#2b4cff", border:"1px solid #BFDBFE", padding:"2px 8px", borderRadius:"4px", fontWeight:"600" }}>{r.category}</span>
                <span style={{ fontSize:"11px", color:"var(--ink3)" }}>👁 {r.use_count||0}</span>
              </div>
              <h3 style={{ fontSize:"14px", fontWeight:"600", color:"var(--ink)", lineHeight:"1.4", marginBottom:"10px" }}>{r.title}</h3>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:"11px", color:"var(--ink3)" }}>Updated {r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-IN") : "—"}</span>
                <span style={{ fontSize:"12px", color:"var(--amberFg)", fontWeight:"600" }}>Open →</span>
              </div>
            </div>
          ))}
          {!runbooks.length && (
            <div style={{ gridColumn:"1/-1", padding:"48px", textAlign:"center", color:"var(--ink3)" }}>
              <div style={{ fontSize:"32px", marginBottom:"8px" }}>📚</div>
              No runbooks found. Start by adding one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
