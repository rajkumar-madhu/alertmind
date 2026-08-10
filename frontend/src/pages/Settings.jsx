// AlertMind — Settings Page
import { useState } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "../lib/store.js";

const SECTIONS = [
  { title:"AI Model", items:[
    { k:"LLM Model",          v:"llama3.3:70b-instruct-q4_K_M", type:"text", env:"LLM_MODEL" },
    { k:"Ollama Server",      v:"http://173.249.2.23:11434",     type:"text", env:"OLLAMA_BASE_URL" },
    { k:"Embedding Model",    v:"nomic-embed-text",              type:"text", env:"EMBED_MODEL" },
    { k:"Temperature",        v:"0.2",                           type:"text", env:"LLM_TEMP" },
    { k:"Context Window",     v:"8192",                          type:"text", env:"LLM_CTX" },
    { k:"RAG Top-K Results",  v:"5",                             type:"text", env:"RAG_TOP_K" },
  ]},
  { title:"Database", items:[
    { k:"Supabase URL",        v:"http://173.249.2.23:8000", type:"text" },
    { k:"Vector Table",        v:"alertmind_documents",      type:"text" },
    { k:"Chunk Size",          v:"1000",                     type:"text" },
    { k:"Chunk Overlap",       v:"200",                      type:"text" },
  ]},
  { title:"SLA Configuration", items:[
    { k:"P1 SLA (minutes)", v:"15",   type:"text" },
    { k:"P2 SLA (hours)",   v:"2",    type:"text" },
    { k:"P3 SLA (hours)",   v:"8",    type:"text" },
    { k:"P4 SLA (hours)",   v:"24",   type:"text" },
  ]},
  { title:"Notifications", items:[
    { k:"Slack Webhook URL",  v:"https://hooks.slack.com/...", type:"text" },
    { k:"Email (SMTP Host)",  v:"smtp.gmail.com",              type:"text" },
    { k:"P1 Auto-escalate",   v:true,                          type:"toggle" },
    { k:"SLA Breach Alert",   v:true,                          type:"toggle" },
  ]},
];

export default function Settings() {
  // Platform configuration is admin-only; everyone else sees it read-only.
  const isAdmin = useAuthStore((s) => s.user?.role) === "admin";
  return (
    <div style={{ maxWidth:"700px" }}>
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)", marginBottom:"4px" }}>Settings</h1>
      <p style={{ fontSize:"12px", color:"var(--ink3)", marginBottom:"22px" }}>AlertMind ITSM configuration{!isAdmin && " · read-only (admin-managed)"}</p>

      <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
        {SECTIONS.map((sec,si) => (
          <div key={si} className="card" style={{ overflow:"hidden" }}>
            <div style={{ padding:"13px 18px", borderBottom:"1px solid var(--border)", fontSize:"13px", fontWeight:"700", color:"var(--ink)" }}>{sec.title}</div>
            {sec.items.map((item,ii) => (
              <div key={ii} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderBottom:ii<sec.items.length-1?"1px solid var(--border)":"none" }}>
                <div>
                  <span style={{ fontSize:"13px", color:"var(--ink)" }}>{item.k}</span>
                  {item.env && <span style={{ fontSize:"10px", color:"var(--ink3)", marginLeft:"8px", fontFamily:"var(--mono)" }}>.env: {item.env}</span>}
                </div>
                {item.type==="toggle" ? (
                  <div style={{ width:"40px",height:"22px",borderRadius:"11px",background:item.v?"var(--amber)":"var(--border)",cursor:"pointer",position:"relative",transition:"background .2s" }}>
                    <div style={{ width:"18px",height:"18px",borderRadius:"50%",background:"var(--white)",position:"absolute",top:"2px",left:item.v?"20px":"2px",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
                  </div>
                ) : (
                  <input defaultValue={item.v} disabled={!isAdmin} className="input" style={{ width:"240px",textAlign:"right",fontSize:"12px",fontFamily:item.env?"var(--mono)":"var(--sans)",opacity:isAdmin?1:0.6 }}/>
                )}
              </div>
            ))}
          </div>
        ))}

        {isAdmin && (
          <button onClick={()=>toast.success("Settings saved")} className="btn btn-primary btn-lg" style={{ alignSelf:"flex-start" }}>
            Save Settings
          </button>
        )}
      </div>
    </div>
  );
}
