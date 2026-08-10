// AlertMind — TicketDetail Page
import { useState }                from "react";
import { useParams, useNavigate }  from "react-router-dom";
import { useTicket, useUpdateTicket, useAnalyzeTicket } from "../hooks/index.js";
import { useAIStore, useAuthStore } from "../lib/store.js";
import { grafanaUrl, opsConsoleUrl, hasObservability } from "../lib/observability.js";

const SEV = { P1:{c:"var(--redFg)",bg:"var(--redL)",b:"var(--redL)",l:"CRITICAL"}, P2:{c:"var(--orangeFg)",bg:"var(--orangeL)",b:"var(--orangeL)",l:"HIGH"}, P3:{c:"var(--amberFg)",bg:"var(--amberL)",b:"var(--amberL)",l:"MEDIUM"}, P4:{c:"var(--greenFg)",bg:"var(--greenL)",b:"var(--greenL)",l:"LOW"} };
const STA  = { "open":{c:"var(--redFg)",l:"Open"}, "in-progress":{c:"var(--orangeFg)",l:"In Progress"}, "resolved":{c:"var(--greenFg)",l:"Resolved"} };

export default function TicketDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { data: ticket, isLoading } = useTicket(id);
  const updateMut  = useUpdateTicket();
  const analyze    = useAnalyzeTicket();
  const aiStore    = useAIStore();
  // Viewers are read-only; the backend (OPA) 403s analyze/resolve/comment writes.
  const canWrite   = useAuthStore((s) => s.user?.role) !== "viewer";
  const [tab, setTab]               = useState("details");
  const [resolution, setResolution] = useState("");
  const [comment, setComment]       = useState("");

  if (isLoading) return <div style={{ padding:"40px", textAlign:"center" }}><div className="spinner" style={{ margin:"0 auto" }} /></div>;
  if (!ticket)   return <div style={{ padding:"20px", color:"var(--ink3)" }}>Ticket not found</div>;

  const s  = SEV[ticket.severity]  || SEV.P3;
  const st = STA[ticket.status]    || STA.open;

  const handleAnalyze = () => analyze(ticket).then(()=>setTab("ai"));
  const handleResolve = () => {
    updateMut.mutate({ id, data: { status:"resolved", resolution, root_cause: aiStore.result?.root_cause || "" } });
  };

  const doneCount = aiStore.doneCount();
  const aiResult  = aiStore.result;
  const aiState   = aiStore.state;

  return (
    <div>
      {/* Back */}
      <button onClick={()=>navigate("/app/incidents")} className="btn btn-ghost btn-sm" style={{ marginBottom:"14px" }}>
        ← All Incidents
      </button>

      {/* Header card */}
      <div className="card" style={{ padding:"20px", marginBottom:"14px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:"14px", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:"280px" }}>
            <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"10px" }}>
              <span className={`badge badge-${ticket.severity.toLowerCase()}`}>{ticket.severity} · {s.l}</span>
              <span style={{ fontSize:"11px", color:"var(--ink3)", alignSelf:"center" }}>{ticket.id}</span>
              <span style={{ fontSize:"11px", background:`${st.c}15`, color:st.c, padding:"2px 10px", borderRadius:"4px", fontWeight:"600" }}>● {st.l}</span>
              <span style={{ fontSize:"11px", background:"var(--paper)", color:"var(--ink3)", padding:"2px 10px", borderRadius:"4px" }}>{ticket.category}</span>
              {ticket.ai_analyzed && <span style={{ fontSize:"11px", background:"var(--amberL)", color:"var(--amberFg)", padding:"2px 10px", borderRadius:"4px", fontWeight:"600" }}>🧠 AI Analyzed {ticket.ai_confidence}%</span>}
            </div>
            <h1 style={{ fontSize:"18px", fontWeight:"700", color:"var(--ink)", lineHeight:"1.4", marginBottom:"10px" }}>{ticket.title}</h1>
            <div style={{ display:"flex", gap:"16px", fontSize:"12px", color:"var(--ink3)", flexWrap:"wrap" }}>
              <span>🖥 {ticket.affected_ci || "—"}</span>
              <span>👤 {ticket.assignee?.name || "Unassigned"}</span>
              <span>🏷 {ticket.category}</span>
              {/* Observability deep links — only when we have a CI to scope them to. */}
              {hasObservability(ticket.affected_ci) && (
                <>
                  <a href={grafanaUrl(ticket.affected_ci)} target="_blank" rel="noopener noreferrer"
                     title={`Grafana dashboards for ${ticket.affected_ci}`}
                     style={{ color:"var(--blueFg)", textDecoration:"none", borderBottom:"1px solid var(--blueB)" }}>
                    📈 Metrics ↗
                  </a>
                  <a href={opsConsoleUrl(ticket.affected_ci)} target="_blank" rel="noopener noreferrer"
                     title={`Wecrew Ops console for ${ticket.affected_ci}`}
                     style={{ color:"var(--blueFg)", textDecoration:"none", borderBottom:"1px solid var(--blueB)" }}>
                    🛰 Ops console ↗
                  </a>
                </>
              )}
              <span>🕐 {new Date(ticket.created_at).toLocaleString("en-IN")}</span>
              {ticket.sla_due_at && (
                <span style={{ color: new Date(ticket.sla_due_at) < new Date() ? "#DC2626" : "var(--ink3)", fontWeight: ticket.sla_breached ? "700" : "400" }}>
                  ⏱ SLA: {ticket.sla_breached ? "⚠ Breached" : new Date(ticket.sla_due_at).toLocaleTimeString("en-IN")}
                </span>
              )}
            </div>
          </div>

          {/* AI Analyze button */}
          {canWrite && ticket.status !== "resolved" && (
            <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
              <button onClick={handleAnalyze} disabled={aiState==="loading"} className="btn btn-primary" style={{ whiteSpace:"nowrap" }}>
                {aiState==="idle"&&"✨ AI Analyze"}
                {aiState==="loading"&&"⟳ Analyzing..."}
                {aiState==="done"&&"✓ Re-analyze"}
                {aiState==="error"&&"↺ Retry"}
              </button>
              {ticket.status !== "resolved" && (
                <button onClick={()=>updateMut.mutate({id,data:{status:"in-progress"}})} className="btn btn-secondary" style={{ whiteSpace:"nowrap" }}>
                  Accept
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ overflow:"hidden" }}>
        {/* Tab nav */}
        <div style={{ display:"flex", borderBottom:"1px solid var(--border)", overflowX:"auto" }}>
          {[
            { id:"details",  l:"Details" },
            { id:"ai",       l: aiState==="done" ? "✓ AI Resolution" : "AI Analysis", badge: aiState==="done" },
            { id:"resolve",  l:"Resolve", show: canWrite && ticket.status!=="resolved" },
            { id:"timeline", l:"Timeline" },
            { id:"comments", l:`Comments${ticket.comments?.length?` (${ticket.comments.length})`:""}`},
          ].filter(t=>t.show!==false).map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"12px 18px", fontSize:"12px", fontWeight:tab===t.id?"700":"400", color:tab===t.id?"var(--amberFg)":"var(--ink3)", background:"none", border:"none", borderBottom:`2px solid ${tab===t.id?"#ff5b2e":"transparent"}`, cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:"5px", fontFamily:"var(--sans)" }}>
              {t.l} {t.badge && <span style={{ width:"6px",height:"6px",borderRadius:"50%",background:"#0f7a55",display:"inline-block" }} />}
            </button>
          ))}
        </div>

        <div style={{ padding:"20px" }}>

          {/* DETAILS */}
          {tab==="details" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:"20px" }}>
              <div>
                <p style={{ fontSize:"11px", fontWeight:"600", color:"var(--ink3)", textTransform:"uppercase", letterSpacing:".8px", marginBottom:"10px" }}>Description</p>
                <p style={{ fontSize:"14px", color:"var(--ink2)", lineHeight:"1.75", marginBottom:"20px" }}>{ticket.description}</p>
                {ticket.root_cause && (
                  <>
                    <p style={{ fontSize:"11px", fontWeight:"600", color:"var(--ink3)", textTransform:"uppercase", letterSpacing:".8px", marginBottom:"8px" }}>Root Cause</p>
                    <p style={{ fontSize:"13px", color:"var(--ink2)", lineHeight:"1.65", marginBottom:"20px", padding:"12px 14px", background:"var(--redL)", borderRadius:"10px", borderLeft:"3px solid #DC2626" }}>{ticket.root_cause}</p>
                  </>
                )}
                {ticket.resolution && (
                  <>
                    <p style={{ fontSize:"11px", fontWeight:"600", color:"var(--ink3)", textTransform:"uppercase", letterSpacing:".8px", marginBottom:"8px" }}>Resolution</p>
                    <p style={{ fontSize:"13px", color:"var(--ink2)", lineHeight:"1.65", padding:"12px 14px", background:"var(--greenL)", borderRadius:"10px", borderLeft:"3px solid #0f7a55" }}>{ticket.resolution}</p>
                  </>
                )}
              </div>

              {/* Info sidebar */}
              <div style={{ background:"var(--paper)", border:"1px solid var(--border)", borderRadius:"12px", overflow:"hidden", alignSelf:"start" }}>
                <p style={{ fontSize:"10px", fontWeight:"700", color:"var(--ink3)", letterSpacing:"1.5px", textTransform:"uppercase", padding:"12px 14px", borderBottom:"1px solid var(--border)" }}>Ticket Info</p>
                {[
                  { k:"Ticket ID",   v:ticket.id },
                  { k:"Severity",    v:`${ticket.severity} · ${s.l}`,   c:s.c },
                  { k:"Status",      v:st.l,                             c:st.c },
                  { k:"Category",    v:ticket.category },
                  { k:"CI",          v:ticket.affected_ci||"—" },
                  { k:"Assignee",    v:ticket.assignee?.name||"Unassigned" },
                  { k:"Team",        v:ticket.assignee?.team||"—" },
                  { k:"Source",      v:ticket.source },
                  { k:"Created",     v:new Date(ticket.created_at).toLocaleString("en-IN") },
                  ...(ticket.resolved_at ? [{ k:"Resolved", v:new Date(ticket.resolved_at).toLocaleString("en-IN"), c:"#0f7a55" }] : []),
                ].map((r,i,arr) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 14px", borderBottom:i<arr.length-1?"1px solid var(--border)":"none", fontSize:"12px" }}>
                    <span style={{ color:"var(--ink3)" }}>{r.k}</span>
                    <span style={{ color:r.c||"var(--ink)", fontWeight:"500", textAlign:"right", maxWidth:"55%" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI ANALYSIS */}
          {tab==="ai" && (
            <div style={{ maxWidth:"800px" }}>
              {aiState==="idle" && (
                <div style={{ textAlign:"center", padding:"48px 0" }}>
                  <div style={{ fontSize:"48px", marginBottom:"12px" }}>🧠</div>
                  <p style={{ fontSize:"15px", fontWeight:"600", color:"var(--ink)", marginBottom:"6px" }}>No analysis yet</p>
                  <p style={{ fontSize:"13px", color:"var(--ink3)", marginBottom:"20px" }}>Click "✨ AI Analyze" to get root cause and resolution steps</p>
                  {canWrite && <button onClick={handleAnalyze} className="btn btn-primary btn-lg">✨ Analyze with AI</button>}
                </div>
              )}

              {aiState==="loading" && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"12px 16px", background:"var(--amberL)", border:"1px solid var(--amberB)", borderRadius:"10px", marginBottom:"16px" }}>
                    <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:"#ff5b2e",animation:"pulse 1s infinite" }}/>
                    <span style={{ fontSize:"13px",color:"var(--amberFg)",fontWeight:"600" }}>AI analyzing incident against knowledge base...</span>
                  </div>
                  <div style={{ fontSize:"13px",color:"var(--ink2)",lineHeight:"1.8",padding:"16px",background:"var(--paper)",borderRadius:"10px",whiteSpace:"pre-wrap",fontFamily:"var(--mono)",minHeight:"80px" }}>
                    {aiStore.streaming || "Retrieving relevant runbooks and past incidents..."}
                    <span style={{ display:"inline-block",width:"7px",height:"14px",background:"#ff5b2e",marginLeft:"2px",animation:"blink 1s infinite" }}/>
                  </div>
                </div>
              )}

              {aiState==="error" && (
                <div style={{ padding:"16px",background:"var(--redL)",border:"1px solid #FECACA",borderRadius:"10px",color:"#DC2626",fontSize:"13px" }}>
                  ⚠️ Analysis failed. Check that Ollama is running on 173.249.2.23.
                  <button onClick={handleAnalyze} className="btn btn-danger btn-sm" style={{ marginLeft:"12px" }}>Retry</button>
                </div>
              )}

              {aiState==="done" && aiResult && (
                <div style={{ display:"flex",flexDirection:"column",gap:"14px" }}>
                  {/* Confidence */}
                  <div className="card" style={{ padding:"16px 20px",display:"flex",alignItems:"center",gap:"16px" }}>
                    <span style={{ fontSize:"12px",color:"var(--ink3)" }}>AI Confidence</span>
                    <div style={{ flex:1,height:"7px",background:"var(--paper2)",borderRadius:"4px",overflow:"hidden" }}>
                      <div style={{ width:`${aiResult.confidence||0}%`,height:"100%",background:"#ff5b2e",borderRadius:"4px",transition:"width 1s ease" }}/>
                    </div>
                    <span style={{ fontSize:"20px",fontWeight:"600",color:"var(--amberFg)",fontFamily:"var(--serif)" }}>{aiResult.confidence}%</span>
                    <span style={{ fontSize:"10px",color:"var(--ink3)" }}>{aiResult.model}</span>
                  </div>

                  {/* Root Cause */}
                  <div style={{ background:"var(--redL)",border:"1px solid #FECACA",borderLeft:"4px solid #DC2626",borderRadius:"12px",overflow:"hidden" }}>
                    <div style={{ padding:"11px 16px",fontSize:"11px",fontWeight:"700",color:"#DC2626",letterSpacing:"1px" }}>🔴 ROOT CAUSE</div>
                    <div style={{ padding:"0 16px 14px",fontSize:"14px",color:"var(--ink)",lineHeight:"1.75" }}>{aiResult.root_cause}</div>
                  </div>

                  {/* Steps */}
                  <div className="card" style={{ overflow:"hidden" }}>
                    <div style={{ padding:"13px 18px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:"13px",fontWeight:"700",color:"var(--ink)" }}>🔧 Resolution Steps</span>
                      <span style={{ fontSize:"12px",color:"var(--ink3)" }}>{doneCount}/{aiResult.resolution_steps?.length||0} done</span>
                    </div>
                    {(aiResult.resolution_steps||[]).map((step,i) => (
                      <div key={i} onClick={()=>aiStore.toggleStep(i)} style={{ display:"flex",gap:"14px",padding:"12px 18px",borderBottom:i<(aiResult.resolution_steps.length-1)?"1px solid var(--border)":"none",cursor:"pointer",background:aiStore.steps[i]?"var(--greenL)":"transparent",transition:"background .15s" }}>
                        <div style={{ width:"20px",height:"20px",borderRadius:"5px",flexShrink:0,marginTop:"2px",background:aiStore.steps[i]?"#0f7a55":"var(--white)",border:`2px solid ${aiStore.steps[i]?"#0f7a55":"var(--border2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",color:"#fff",fontWeight:"700",transition:"all .2s" }}>{aiStore.steps[i]?"✓":""}</div>
                        <div style={{ flex:1 }}>
                          <span style={{ fontSize:"10px",color:"var(--ink3)",textTransform:"uppercase",letterSpacing:".3px" }}>Step {i+1}</span>
                          <p style={{ fontSize:"13px",color:aiStore.steps[i]?"var(--ink3)":"var(--ink)",textDecoration:aiStore.steps[i]?"line-through":"none",lineHeight:"1.5",marginTop:"2px" }}>{step}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px" }}>
                    {[
                      { icon:"📋", label:"Similar Incidents", content:aiResult.similar_incidents, color:"#D97706", bg:"var(--orangeL)", border:"#FDE68A" },
                      { icon:"🛡️", label:"Prevention",        content:aiResult.prevention,        color:"#0f7a55", bg:"var(--greenL)", border:"#BBF7D0" },
                    ].map((c,i) => (
                      <div key={i} style={{ background:c.bg,border:`1px solid ${c.border}`,borderLeft:`4px solid ${c.color}`,borderRadius:"12px",overflow:"hidden" }}>
                        <div style={{ padding:"11px 14px",fontSize:"11px",fontWeight:"700",color:c.color,letterSpacing:"1px" }}>{c.icon} {c.label}</div>
                        <p style={{ padding:"0 14px 13px",fontSize:"13px",color:"var(--ink2)",lineHeight:"1.65" }}>{c.content || "None found"}</p>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex",gap:"10px",flexWrap:"wrap",paddingTop:"4px" }}>
                    {canWrite && <button onClick={()=>setTab("resolve")} className="btn btn-primary">✓ Apply to Ticket</button>}
                    <button onClick={()=>navigator.clipboard.writeText(aiResult.root_cause+"\n"+aiResult.resolution_steps?.join("\n"))} className="btn btn-secondary">📋 Copy</button>
                    {canWrite && aiResult.escalate && <button className="btn btn-danger">⬆ Escalate L2</button>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESOLVE */}
          {tab==="resolve" && ticket.status !== "resolved" && (
            <div style={{ maxWidth:"600px" }}>
              <p style={{ fontSize:"11px",fontWeight:"600",color:"var(--ink3)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:"10px" }}>Resolution Notes</p>
              <textarea
                className="input"
                value={resolution}
                onChange={e=>setResolution(e.target.value)}
                placeholder="Describe what was done to resolve this incident..."
                style={{ minHeight:"120px",resize:"vertical",marginBottom:"12px" }}
              />
              {aiResult && (
                <div style={{ padding:"12px 14px",background:"var(--amberL)",border:"1px solid var(--amberB)",borderRadius:"10px",marginBottom:"14px",fontSize:"13px",color:"var(--amberFg)" }}>
                  💡 AI suggested resolution available — <button onClick={()=>setResolution(aiResult.resolution_steps?.join("\n"))} style={{ background:"none",border:"none",color:"var(--amberFg)",cursor:"pointer",fontWeight:"700",fontFamily:"var(--sans)",textDecoration:"underline" }}>Import from AI</button>
                </div>
              )}
              <div style={{ display:"flex",gap:"10px" }}>
                <button onClick={handleResolve} disabled={!resolution.trim()||updateMut.isPending} className="btn btn-primary">
                  ✅ Mark Resolved
                </button>
                <button onClick={()=>updateMut.mutate({id,data:{status:"in-progress"}})} className="btn btn-secondary">In Progress</button>
              </div>
            </div>
          )}

          {/* TIMELINE */}
          {tab==="timeline" && (
            <div style={{ maxWidth:"560px" }}>
              {[
                { time:new Date(ticket.created_at).toLocaleString("en-IN"), event:`Ticket ${ticket.id} created`, dot:"#DC2626" },
                { time:"", event:`Assigned to ${ticket.assignee?.name||"Unassigned"}`, dot:"#ff5b2e" },
                ...(ticket.ai_analyzed_at ? [{ time:new Date(ticket.ai_analyzed_at).toLocaleString("en-IN"), event:`AI analyzed (${ticket.ai_confidence}% confidence)`, dot:"#ff5b2e" }] : []),
                ...(ticket.resolved_at ? [{ time:new Date(ticket.resolved_at).toLocaleString("en-IN"), event:"Ticket resolved", dot:"#0f7a55" }] : []),
                ...(!ticket.resolved_at ? [{ time:"Now", event:"Awaiting resolution", dot:"#CBD5E1" }] : []),
              ].map((e,i,arr) => (
                <div key={i} style={{ display:"flex",gap:"14px" }}>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:e.dot,flexShrink:0,marginTop:"4px" }}/>
                    {i<arr.length-1&&<div style={{ width:"2px",flex:1,background:"var(--paper2)",minHeight:"24px",margin:"3px 0" }}/>}
                  </div>
                  <div style={{ paddingBottom:"14px" }}>
                    <p style={{ fontSize:"10px",color:"var(--ink3)",marginBottom:"3px" }}>{e.time}</p>
                    <p style={{ fontSize:"13px",color:"var(--ink)" }}>{e.event}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* COMMENTS */}
          {tab==="comments" && (
            <div style={{ maxWidth:"620px" }}>
              <div style={{ display:"flex",flexDirection:"column",gap:"12px",marginBottom:"20px" }}>
                {(ticket.comments||[]).map((c,i) => (
                  <div key={i} style={{ display:"flex",gap:"12px" }}>
                    <div style={{ width:"30px",height:"30px",borderRadius:"50%",background:"var(--blueL)",border:"1px solid #BFDBFE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:"700",color:"#2b4cff",flexShrink:0 }}>
                      {c.user?.name?.slice(0,2).toUpperCase()||"??"}
                    </div>
                    <div style={{ flex:1,background:"var(--paper)",border:"1px solid var(--border)",borderRadius:"10px",padding:"12px 14px" }}>
                      <div style={{ display:"flex",gap:"8px",marginBottom:"6px" }}>
                        <span style={{ fontSize:"12px",fontWeight:"600",color:"var(--ink)" }}>{c.user?.name}</span>
                        <span style={{ fontSize:"11px",color:"var(--ink3)" }}>{new Date(c.created_at).toLocaleString("en-IN")}</span>
                      </div>
                      <p style={{ fontSize:"13px",color:"var(--ink2)",lineHeight:"1.6" }}>{c.content}</p>
                    </div>
                  </div>
                ))}
                {!ticket.comments?.length && <p style={{ color:"var(--ink3)",fontSize:"13px" }}>No comments yet</p>}
              </div>
              {canWrite && (
                <div style={{ display:"flex",gap:"8px" }}>
                  <textarea className="input" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment..." style={{ flex:1,minHeight:"60px",resize:"vertical" }}/>
                  <button disabled={!comment.trim()} className="btn btn-primary" style={{ alignSelf:"flex-end" }}>Post</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
