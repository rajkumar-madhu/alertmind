// AlertMind — CMDB Page
import { useState }  from "react";
import { useCMDB }   from "../hooks/index.js";
import { cmdbAPI }   from "../lib/api.js";
import { useAuthStore } from "../lib/store.js";
import toast from "react-hot-toast";

const TYPE_ICON = { server:"🖥", database:"🗄", network:"🌐", service:"⚙", application:"📱" };

export default function CMDB() {
  const { data: items = [], isLoading, refetch } = useCMDB();
  // Viewers are read-only; the backend (OPA) 403s their writes, so hide the action.
  const canWrite = useAuthStore((s) => s.user?.role) !== "viewer";
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name:"", type:"server", environment:"production", ip_address:"", hostname:"", team:"" });

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await cmdbAPI.create(form);
      toast.success("CI added"); refetch(); setShowForm(false);
    } catch { toast.error("Failed to add CI"); }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"18px" }}>
        <div>
          <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)" }}>CMDB</h1>
          <p style={{ fontSize:"12px", color:"var(--ink3)" }}>Configuration Management Database · {items.length} items</p>
        </div>
        {canWrite && <button onClick={()=>setShowForm(!showForm)} className="btn btn-primary">+ Add CI</button>}
      </div>

      {showForm && (
        <div className="card" style={{ padding:"20px", marginBottom:"16px" }}>
          <h3 style={{ fontSize:"14px", fontWeight:"600", color:"var(--ink)", marginBottom:"14px" }}>New Configuration Item</h3>
          <form onSubmit={handleCreate} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
            {[["name","Name *","text"],["hostname","Hostname","text"],["ip_address","IP Address","text"],["team","Team","text"]].map(([k,l,t]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" type={t} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} required={k==="name"} />
              </div>
            ))}
            <div>
              <label className="label">Type</label>
              <select className="input select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {["server","database","network","service","application"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Environment</label>
              <select className="input select" value={form.environment} onChange={e=>setForm(f=>({...f,environment:e.target.value}))}>
                {["production","staging","development","testing"].map(e=><option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:"1/-1", display:"flex", gap:"10px" }}>
              <button type="submit" className="btn btn-primary">Add CI</button>
              <button type="button" onClick={()=>setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"40px 1fr 100px 140px 120px 100px", gap:"12px", padding:"10px 16px", background:"var(--paper2)", borderBottom:"1px solid var(--border)", fontSize:"10px", fontWeight:"700", color:"var(--ink2)", textTransform:"uppercase", letterSpacing:".5px" }}>
          <span></span><span>Name</span><span>Type</span><span>Hostname/IP</span><span>Environment</span><span>Team</span>
        </div>
        {isLoading && <div style={{ padding:"32px", textAlign:"center" }}><div className="spinner" style={{ margin:"0 auto" }}/></div>}
        {items.map((item,i,arr) => (
          <div key={item.id} style={{ display:"grid", gridTemplateColumns:"40px 1fr 100px 140px 120px 100px", gap:"12px", padding:"12px 16px", borderBottom:i<arr.length-1?"1px solid var(--border)":"none", alignItems:"center" }}>
            <span style={{ fontSize:"18px", textAlign:"center" }}>{TYPE_ICON[item.type]||"⚙"}</span>
            <div>
              <p style={{ fontSize:"13px", fontWeight:"600", color:"var(--ink)" }}>{item.name}</p>
              <p style={{ fontSize:"11px", color:"var(--ink3)" }}>{item.id.slice(0,8)}...</p>
            </div>
            <span style={{ fontSize:"12px", color:"var(--ink2)", textTransform:"capitalize" }}>{item.type}</span>
            <span style={{ fontSize:"12px", color:"var(--ink2)", fontFamily:"var(--mono)" }}>{item.hostname||item.ip_address||"—"}</span>
            <span style={{ fontSize:"11px", background:item.environment==="production"?"var(--redL)":"var(--greenL)", color:item.environment==="production"?"var(--redFg)":"var(--greenFg)", padding:"2px 8px", borderRadius:"4px", fontWeight:"600", textTransform:"capitalize" }}>
              {item.environment}
            </span>
            <span style={{ fontSize:"12px", color:"var(--ink2)" }}>{item.team||"—"}</span>
          </div>
        ))}
        {!isLoading && !items.length && (
          <div style={{ padding:"40px", textAlign:"center", color:"var(--ink3)" }}>No items in CMDB yet</div>
        )}
      </div>
    </div>
  );
}
