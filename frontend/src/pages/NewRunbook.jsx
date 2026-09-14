// AlertMind — NewRunbook Page
import { useState }    from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useCreateRunbook } from "../hooks/index.js";
import { useAuthStore } from "../lib/store.js";
import { hasWriteRole } from "../lib/auth.js";

const CATEGORIES = ["Infrastructure","Database","Network","K8s","Security","Storage","Application","Other"];

export default function NewRunbook() {
  const navigate  = useNavigate();
  const createMut = useCreateRunbook();
  const user      = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    title:"", category:"Infrastructure", tags:"", content:"",
  });

  // Viewers can't create runbooks (OPA 403s the POST). The entry button is
  // already hidden, but guard the route too so a direct URL doesn't dead-end
  // on a 403 after the form is filled. (Kept after all hooks — Rules of Hooks.)
  if (!hasWriteRole(user)) return <Navigate to="/app/runbooks" replace />;

  const set = (k) => (e) => setForm(f=>({...f,[k]:e.target.value}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const runbook = await createMut.mutateAsync({
      title   : form.title,
      category: form.category,
      content : form.content,
      tags    : form.tags.split(",").map(t=>t.trim()).filter(Boolean),
    });
    navigate(`/app/runbooks/${runbook.id}`);
  };

  return (
    <div style={{ maxWidth:"720px" }}>
      <button onClick={()=>navigate("/app/runbooks")} className="btn btn-ghost btn-sm" style={{ marginBottom:"16px" }}>← Back</button>
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)", marginBottom:"6px" }}>New Runbook</h1>
      <p style={{ fontSize:"12px", color:"var(--ink3)", marginBottom:"24px" }}>Document a resolution procedure — it's also ingested into the AI knowledge base</p>

      <div className="card" style={{ padding:"24px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"14px" }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label className="label">Title *</label>
              <input className="input" value={form.title} onChange={set("title")} placeholder="e.g. Resolving PostgreSQL connection pool exhaustion" required />
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input select" value={form.category} onChange={set("category")}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tags</label>
              <input className="input" value={form.tags} onChange={set("tags")} placeholder="comma-separated, e.g. postgres, db, pooling" />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label className="label">Content *</label>
              <textarea className="input" value={form.content} onChange={set("content")} placeholder="Step-by-step procedure: symptoms, diagnosis, exact commands, verification..." style={{ minHeight:"220px", resize:"vertical" }} required />
            </div>
          </div>

          <div style={{ display:"flex", gap:"10px" }}>
            <button type="submit" disabled={createMut.isPending} className="btn btn-primary btn-lg">
              {createMut.isPending ? "Creating..." : "Create Runbook →"}
            </button>
            <button type="button" onClick={()=>navigate("/app/runbooks")} className="btn btn-secondary btn-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
