// AlertMind — RunbookDetail Page
import { useParams, useNavigate } from "react-router-dom";
import { useRunbook } from "../hooks/index.js";

export default function RunbookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: rb, isLoading } = useRunbook(id);

  if (isLoading) return <div style={{ padding:"40px",textAlign:"center" }}><div className="spinner" style={{ margin:"0 auto" }}/></div>;
  if (!rb) return <div style={{ padding:"20px",color:"var(--ink3)" }}>Runbook not found</div>;

  return (
    <div style={{ maxWidth:"800px" }}>
      <button onClick={()=>navigate("/app/runbooks")} className="btn btn-ghost btn-sm" style={{ marginBottom:"14px" }}>← Runbooks</button>
      <div className="card" style={{ padding:"24px" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"16px" }}>
          <div>
            <span style={{ fontSize:"11px",background:"var(--blueL)",color:"#2b4cff",border:"1px solid #BFDBFE",padding:"2px 8px",borderRadius:"4px",fontWeight:"600",display:"inline-block",marginBottom:"10px" }}>{rb.category}</span>
            <h1 style={{ fontSize:"20px",fontWeight:"700",color:"var(--ink)",lineHeight:"1.3" }}>{rb.title}</h1>
            <p style={{ fontSize:"12px",color:"var(--ink3)",marginTop:"6px" }}>👁 {rb.use_count||0} uses · Updated {rb.updated_at ? new Date(rb.updated_at).toLocaleDateString("en-IN") : "—"}</p>
          </div>
          <button className="btn btn-secondary btn-sm">Edit</button>
        </div>
        <hr className="divider"/>
        <div style={{ fontSize:"14px",color:"var(--ink2)",lineHeight:"1.75",whiteSpace:"pre-wrap" }}>{rb.content}</div>
        {rb.tags?.length > 0 && (
          <div style={{ marginTop:"20px",display:"flex",gap:"6px",flexWrap:"wrap" }}>
            {rb.tags.map((t,i) => (
              <span key={i} style={{ fontSize:"11px",background:"var(--paper2)",border:"1px solid var(--border)",color:"var(--ink2)",padding:"2px 10px",borderRadius:"20px" }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
