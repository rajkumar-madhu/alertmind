// AlertMind — Incidents Page
import { useState }    from "react";
import { useNavigate } from "react-router-dom";
import { useTickets, useDeleteTicket } from "../hooks/index.js";
import { useAuthStore } from "../lib/store.js";
import { hasWriteRole } from "../lib/auth.js";

const SEV = { P1:{c:"var(--redFg)",bg:"var(--redL)",b:"var(--redL)"}, P2:{c:"var(--orangeFg)",bg:"var(--orangeL)",b:"var(--orangeL)"}, P3:{c:"var(--amberFg)",bg:"var(--amberL)",b:"var(--amberL)"}, P4:{c:"var(--greenFg)",bg:"var(--greenL)",b:"var(--greenL)"} };
const STA  = { "open":{c:"var(--redFg)",l:"Open"}, "in-progress":{c:"var(--orangeFg)",l:"In Progress"}, "resolved":{c:"var(--greenFg)",l:"Resolved"} };

export default function Incidents() {
  const navigate = useNavigate();
  const canWrite = hasWriteRole(useAuthStore((s) => s.user));
  const [filters, setFilters] = useState({ status:"", severity:"", search:"" });
  const { data, isLoading } = useTickets(Object.fromEntries(Object.entries(filters).filter(([,v])=>v)));
  const deleteMut = useDeleteTicket();

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"18px" }}>
        <div>
          <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)" }}>Incidents</h1>
          <p style={{ fontSize:"12px", color:"var(--ink3)", marginTop:"2px" }}>{data?.count||0} total tickets</p>
        </div>
        {canWrite && <button onClick={()=>navigate("/app/incidents/new")} className="btn btn-primary">+ New Ticket</button>}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:"10px", marginBottom:"14px", flexWrap:"wrap" }}>
        <input className="input" style={{ width:"220px", flex:"none" }} placeholder="Search tickets..." value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} />
        {["","open","in-progress","resolved"].map(s => (
          <button key={s} onClick={()=>setFilters(f=>({...f,status:s}))} className={`btn btn-sm ${filters.status===s?"btn-primary":"btn-secondary"}`}>
            {s || "All Status"}
          </button>
        ))}
        {["","P1","P2","P3","P4"].map(sv => (
          <button key={sv} onClick={()=>setFilters(f=>({...f,severity:sv}))} className={`btn btn-sm ${filters.severity===sv?"btn-primary":"btn-secondary"}`}>
            {sv || "All Severity"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 120px 120px 100px", gap:"12px", padding:"10px 18px", background:"var(--paper2)", borderBottom:"1px solid var(--border)", fontSize:"10px", fontWeight:"700", color:"var(--ink2)", textTransform:"uppercase", letterSpacing:".5px" }}>
          <span>Severity</span><span>Title</span><span>Category</span><span>Assignee</span><span>SLA</span><span>Status</span>
        </div>
        {isLoading && (
          <div style={{ padding:"40px", textAlign:"center" }}><div className="spinner" style={{ margin:"0 auto" }} /></div>
        )}
        {(data?.data || []).map((t,i,arr) => {
          const s = SEV[t.severity]||SEV.P3;
          return (
            <div key={t.id} onClick={()=>navigate(`/app/incidents/${t.id}`)}
                 style={{ display:"grid", gridTemplateColumns:"90px 1fr 120px 120px 120px 100px", gap:"12px", padding:"12px 18px", borderBottom:i<arr.length-1?"1px solid var(--border)":"none", cursor:"pointer", alignItems:"center", transition:"background .15s" }}
                 onMouseEnter={e=>e.currentTarget.style.background="var(--paper)"}
                 onMouseLeave={e=>e.currentTarget.style.background=""}>
              <span className={`badge badge-${t.severity.toLowerCase()}`}>{t.severity}</span>
              <div>
                <p style={{ fontSize:"13px", fontWeight:"500", color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</p>
                <p style={{ fontSize:"11px", color:"var(--ink3)" }}>{t.id} · {t.affected_ci}</p>
              </div>
              <span style={{ fontSize:"12px", color:"var(--ink2)" }}>{t.category}</span>
              <span style={{ fontSize:"12px", color:"var(--ink2)" }}>{t.assignee?.name || "—"}</span>
              <span style={{ fontSize:"12px", color:t.sla_breached?"#DC2626":t.severity==="P1"?"#D97706":"var(--ink2)", fontWeight:t.sla_breached?"700":"400" }}>
                {t.sla_breached ? "⚠ Breached" : t.sla_due_at ? new Date(t.sla_due_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}
              </span>
              <span className={`badge badge-${t.status}`}>{STA[t.status]?.l||t.status}</span>
            </div>
          );
        })}
        {!isLoading && !data?.data?.length && (
          <div style={{ padding:"48px", textAlign:"center", color:"var(--ink3)", fontSize:"14px" }}>
            <div style={{ fontSize:"32px", marginBottom:"8px" }}>🎉</div>
            No incidents found
          </div>
        )}
      </div>
    </div>
  );
}
