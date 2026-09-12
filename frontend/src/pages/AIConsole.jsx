// AlertMind — AIConsole Page
import { useState, useRef, useEffect } from "react";
import { ragAPI, ingestAPI } from "../lib/api.js";
import { useAuthStore } from "../lib/store.js";
import { hasWriteRole } from "../lib/auth.js";
import toast from "react-hot-toast";

function InlineContent({ text }) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}

function StructuredAnswer({ content, error = false }) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = [];
  let listType = null;
  let code = [];
  let inCode = false;

  const flushList = () => {
    if (!list.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    blocks.push(<Tag key={`list-${blocks.length}`}>{list.map((item, i) => <li key={i}><InlineContent text={item}/></li>)}</Tag>);
    list = [];
    listType = null;
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
        code = [];
      } else flushList();
      inCode = !inCode;
      return;
    }
    if (inCode) { code.push(raw); return; }
    if (!line) { flushList(); return; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const Tag = heading[1].length <= 2 ? "h3" : "h4";
      blocks.push(<Tag key={`heading-${index}`}><InlineContent text={heading[2]}/></Tag>);
      return;
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (numbered || bullet) {
      const nextType = numbered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push((numbered || bullet)[1]);
      return;
    }

    flushList();
    const label = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (label) {
      blocks.push(<div className="ai-answer-callout" key={`label-${index}`}><strong>{label[1]}</strong>{label[2] && <span><InlineContent text={label[2]}/></span>}</div>);
      return;
    }
    blocks.push(<p key={`paragraph-${index}`}><InlineContent text={line}/></p>);
  });
  flushList();
  if (code.length) blocks.push(<pre key="code-final"><code>{code.join("\n")}</code></pre>);

  return <div className={`ai-answer-content${error ? " is-error" : ""}`}>{blocks}</div>;
}

export default function AIConsole() {
  const ollamaLabel = "Local Ollama";
  // Chat/search are reads (allowed for all); ingest is a write the backend
  // (OPA) 403s for viewers, so hide the ingest card from them.
  const canIngest = hasWriteRole(useAuthStore((s) => s.user));
  const [messages,   setMessages  ] = useState([]);
  const [input,      setInput     ] = useState("");
  const [loading,    setLoading   ] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [collection, setCollection] = useState("kb_articles");
  const [ingesting,  setIngesting ] = useState(false);
  const [ingestStats,setIngestStats] = useState(null);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    ingestAPI.stats().then(setIngestStats).catch(()=>{});
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim(); setInput("");
    setMessages(m => [...m, { role:"user", content:q }]);
    setLoading(true);
    try {
      const res = await ragAPI.chat({ message: q });
      setMessages(m => [...m, { role:"assistant", content: res.response, sources: res.sources }]);
    } catch (e) {
      const detail =
        e?.error ||
        e?.detail ||
        e?.message ||
        "AI LLM service unavailable";
      const hint =
        detail.includes("model") && detail.includes("not found")
          ? "The configured Ollama model is not installed."
          : detail.includes("Ollama")
            ? "Check the Ollama service and model list."
            : "Check the backend chat logs.";
      setMessages(m => [...m, { role:"assistant", content:`Failed to get response: ${detail}\n\n${hint}`, error:true }]);
    } finally { setLoading(false); }
  };

  const handleIngest = async () => {
    if (!uploadFile) return;
    setIngesting(true);
    try {
      const res = await ingestAPI.file(uploadFile, collection);
      toast.success(`Ingested ${res.file} — ${res.chunks} chunks`);
      setUploadFile(null);
      const stats = await ingestAPI.stats();
      setIngestStats(stats);
    } catch(e) { toast.error("Ingest failed"); }
    finally { setIngesting(false); }
  };

  const SUGGESTIONS = [
    "What is the runbook for CPU high usage?",
    "Summarize today's P1 incidents",
    "How do I fix PostgreSQL connection pool exhaustion?",
    "What are common causes of network packet loss?",
  ];

  return (
    <div className="ai-console-layout">

      {/* Chat panel */}
      <div className="card ai-chat-panel">
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"10px" }}>
          <div className="ai-avatar" aria-hidden="true">AI</div>
          <div>
            <p style={{ fontSize:"13px",fontWeight:"700",color:"var(--ink)" }}>AlertMind AI</p>
            <p className="ai-online"><span/>Online · {ollamaLabel}</p>
          </div>
          {messages.length > 0 && (
            <button onClick={()=>setMessages([])} className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }}>Clear</button>
          )}
        </div>

        {/* Messages */}
        <div ref={chatRef} className="ai-messages">
          {messages.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 0", color:"var(--ink3)" }}>
              <div className="ai-empty-icon" aria-hidden="true">AI</div>
              <p style={{ fontSize:"14px", fontWeight:"700", color:"var(--ink)", marginBottom:"6px" }}>Start an operations investigation</p>
              <p style={{ fontSize:"12px", marginBottom:"20px" }}>Ask for likely causes, safe checks, remediation steps, and supporting runbooks.</p>
              {SUGGESTIONS.map((s,i) => (
                <button key={i} onClick={()=>setInput(s)} style={{ display:"block",width:"100%",background:"var(--paper2)",border:"1px solid var(--border)",color:"var(--ink2)",padding:"9px 14px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontFamily:"var(--sans)",marginBottom:"6px",textAlign:"left",transition:"all .15s" }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="var(--amberB)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                  "{s}"
                </button>
              ))}
            </div>
          )}

          {messages.map((msg,i) => (
            <div key={i} className={`ai-message-row ${msg.role}`}>
              <div className={`ai-message ${msg.role}${msg.error?" error":""}`}>
                {msg.role === "assistant" && (
                  <div className="ai-answer-meta">
                    <span className="ai-answer-label">AlertMind analysis</span>
                    <span className="ai-answer-mode">Local · private</span>
                  </div>
                )}
                {msg.role === "assistant" ? <StructuredAnswer content={msg.content} error={msg.error}/> : msg.content}
                {msg.sources?.length > 0 && (
                  <div className="ai-sources">
                    <p>Evidence used</p>
                    {msg.sources.slice(0,3).map((s,si) => (
                      <span key={si}>{s.file||s.collection||"Knowledge base"}{s.similarity ? ` · ${Math.round(s.similarity * 100)}% match` : ""}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display:"flex", justifyContent:"flex-start" }}>
              <div style={{ padding:"12px 16px",background:"var(--paper2)",border:"1px solid var(--border)",borderRadius:"14px 14px 14px 4px",display:"flex",alignItems:"center",gap:"8px" }}>
                <div className="spinner" style={{ width:"14px",height:"14px",borderWidth:"2px" }}/>
                <span style={{ fontSize:"12px",color:"var(--ink3)" }}>Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding:"12px 14px",borderTop:"1px solid var(--border)",display:"flex",gap:"8px" }}>
          <input className="input" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()} placeholder="Describe the incident, symptoms, and affected service..." style={{ flex:1 }}/>
          <button onClick={sendMessage} disabled={loading||!input.trim()} className="btn btn-primary ai-send" aria-label="Send query">→</button>
        </div>
      </div>

      {/* Right panel */}
      <aside className="ai-side-panel">
        {/* KB Stats */}
        {ingestStats && (
          <div className="card" style={{ padding:"16px" }}>
            <p style={{ fontSize:"12px",fontWeight:"600",color:"var(--ink)",marginBottom:"12px" }}>Knowledge Base</p>
            <p style={{ fontSize:"22px",fontWeight:"900",color:"var(--amberFg)",fontFamily:"var(--serif)",fontStyle:"italic",marginBottom:"4px" }}>{ingestStats.total?.toLocaleString()||0}</p>
            <p style={{ fontSize:"11px",color:"var(--ink3)",marginBottom:"10px" }}>Total document chunks</p>
            {Object.entries(ingestStats.collections||{}).map(([k,v]) => (
              <div key={k} style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:"12px" }}>
                <span style={{ color:"var(--ink2)" }}>{k}</span>
                <span style={{ fontWeight:"700",color:"var(--ink)" }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ingest */}
        {canIngest && (
        <div className="card" style={{ padding:"16px" }}>
          <p style={{ fontSize:"12px",fontWeight:"600",color:"var(--ink)",marginBottom:"12px" }}>Ingest Document</p>
          <select className="input select" value={collection} onChange={e=>setCollection(e.target.value)} style={{ marginBottom:"8px" }}>
            {["kb_articles","runbooks","incidents","alerts"].map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ display:"block",padding:"16px",background:"var(--paper2)",border:"2px dashed var(--border)",borderRadius:"10px",cursor:"pointer",textAlign:"center",marginBottom:"8px",transition:"border .2s" }}
                 onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="var(--amber)"}}
                 onDrop={e=>{e.preventDefault();setUploadFile(e.dataTransfer.files[0]);e.currentTarget.style.borderColor="var(--border)"}}
                 onMouseEnter={e=>e.currentTarget.style.borderColor="var(--amberB)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
            <input type="file" accept=".pdf,.txt,.md,.csv" onChange={e=>setUploadFile(e.target.files[0])} style={{ display:"none" }}/>
            <div style={{ fontSize:"20px",marginBottom:"4px" }}>📄</div>
            <p style={{ fontSize:"12px",color:uploadFile?"var(--amber)":"var(--ink3)",fontWeight:uploadFile?"600":"400" }}>{uploadFile?uploadFile.name:"PDF, TXT, MD, CSV"}</p>
          </label>
          <button onClick={handleIngest} disabled={!uploadFile||ingesting} className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }}>
            {ingesting?"Ingesting...":"Ingest →"}
          </button>
        </div>
        )}

        {/* Quick actions */}
        <div className="card" style={{ padding:"16px" }}>
          <p style={{ fontSize:"12px",fontWeight:"600",color:"var(--ink)",marginBottom:"10px" }}>Quick Queries</p>
          {["Latest P1 incidents","SLA breach status","Today's resolved count","Search: kubernetes crash"].map((q,i) => (
            <button key={i} onClick={()=>setInput(q)} style={{ display:"block",width:"100%",background:"var(--paper2)",border:"1px solid var(--border)",color:"var(--ink2)",padding:"8px 12px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontFamily:"var(--sans)",marginBottom:"6px",textAlign:"left" }}>
              {q}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
