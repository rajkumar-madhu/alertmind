// AlertMind — NewTicket Page
import { useState }    from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCreateTicket } from "../hooks/index.js";
import { useAuthStore } from "../lib/store.js";

export default function NewTicket() {
  const navigate = useNavigate();
  const createMut = useCreateTicket();
  const role = useAuthStore((s) => s.user?.role);
  const [form, setForm] = useState({
    title:"", description:"", severity:"P3",
    category:"Infrastructure", affected_ci:"", team:"",
  });

  // Viewers can't create tickets (OPA 403s the POST). The entry button is
  // already hidden, but guard the route too so a direct URL doesn't dead-end
  // on a 403 after the form is filled. (Kept after all hooks — Rules of Hooks.)
  if (role === "viewer") return <Navigate to="/app/incidents" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ticket = await createMut.mutateAsync(form);
    navigate(`/app/incidents/${ticket.id}`);
  };

  const set = (k) => (e) => setForm(f=>({...f,[k]:e.target.value}));

  return (
    <div style={{ maxWidth:"720px" }}>
      <button onClick={()=>navigate("/app/incidents")} className="btn btn-ghost btn-sm" style={{ marginBottom:"16px" }}>← Back</button>
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)", marginBottom:"6px" }}>New Incident</h1>
      <p style={{ fontSize:"12px", color:"var(--ink3)", marginBottom:"24px" }}>Create a new ITSM ticket for tracking and AI resolution</p>

      <div className="card" style={{ padding:"24px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={set("title")} placeholder="Brief description of the incident" required />
            </div>
            <div>
              <label className="label">Severity *</label>
              <select className="input select" value={form.severity} onChange={set("severity")}>
                <option value="P1">P1 — Critical (15 min SLA)</option>
                <option value="P2">P2 — High (2 hr SLA)</option>
                <option value="P3">P3 — Medium (8 hr SLA)</option>
                <option value="P4">P4 — Low (24 hr SLA)</option>
              </select>
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input select" value={form.category} onChange={set("category")}>
                {["Infrastructure","Database","Network","Application","Security","Storage","K8s","Other"].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Affected CI / Hostname</label>
              <input className="input" value={form.affected_ci} onChange={set("affected_ci")} placeholder="e.g. prod-server-01" />
            </div>
            <div>
              <label className="label">Team</label>
              <input className="input" value={form.team} onChange={set("team")} placeholder="e.g. Platform" />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label className="label">Description *</label>
              <textarea className="input" value={form.description} onChange={set("description")} placeholder="Detailed description: what happened, symptoms, error messages, affected users..." style={{ minHeight:"120px", resize:"vertical" }} required />
            </div>
          </div>

          {/* P1 warning */}
          {form.severity === "P1" && (
            <div style={{ padding:"12px 14px",background:"var(--redL)",border:"1px solid #FECACA",borderRadius:"10px",marginBottom:"16px",fontSize:"13px",color:"#DC2626",fontWeight:"600" }}>
              ⚡ P1 Critical — AI will auto-analyze this ticket immediately after creation
            </div>
          )}

          <div style={{ display:"flex", gap:"10px" }}>
            <button type="submit" disabled={createMut.isPending} className="btn btn-primary btn-lg">
              {createMut.isPending ? "Creating..." : "Create Ticket →"}
            </button>
            <button type="button" onClick={()=>navigate("/app/incidents")} className="btn btn-secondary btn-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
