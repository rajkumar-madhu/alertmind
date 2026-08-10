// AlertMind — Dashboard Page
import { useNavigate }  from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip,
         ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useDashboardStats, useDashboardTrend, useSLASummary, useTickets } from "../hooks/index.js";

// Sovereign chart palette (chart-1…5): blue, green, coral, red, violet.
const PIE_COLORS = ["#2b4cff","#0f7a55","#ff5b2e","#dc2626","#7c3aed"];
const SEV = { P1:{c:"var(--redFg)",bg:"var(--redL)",b:"var(--redL)"}, P2:{c:"var(--orangeFg)",bg:"var(--orangeL)",b:"var(--orangeL)"}, P3:{c:"var(--amberFg)",bg:"var(--amberL)",b:"var(--amberL)"}, P4:{c:"var(--greenFg)",bg:"var(--greenL)",b:"var(--greenL)"} };
const STA = { "open":{c:"var(--redFg)",l:"Open"}, "in-progress":{c:"var(--orangeFg)",l:"In Progress"}, "resolved":{c:"var(--greenFg)",l:"Resolved"} };
const TICK = "#94A3B8"; // legible on light + dark

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useDashboardStats();
  const { data: trend  } = useDashboardTrend();
  const { data: sla    } = useSLASummary();
  const { data: recent } = useTickets({ limit: 5 });

  const trendData = trend || [
    {day:"Mon",incidents:8,resolved:6},{day:"Tue",incidents:12,resolved:10},
    {day:"Wed",incidents:6,resolved:6},{day:"Thu",incidents:15,resolved:11},
    {day:"Fri",incidents:9,resolved:8},{day:"Sat",incidents:4,resolved:4},{day:"Sun",incidents:7,resolved:5},
  ];
  const catData = [
    { name:"Infra", value:35 }, { name:"DB", value:22 },
    { name:"Network", value:18 }, { name:"App", value:15 }, { name:"Security", value:10 },
  ];

  const statCards = [
    { label:"Open incidents", value:stats?.open??0,           accent:"#DC2626", icon:"🔔" },
    { label:"P1 critical",    value:stats?.p1_active??0,      accent:"#DC2626", icon:"🚨" },
    { label:"Resolved today", value:stats?.resolved_today??0, accent:"#0f7a55", icon:"✅" },
    { label:"AI resolve rate",value:`${stats?.ai_rate??0}%`,  accent:"#ff5b2e", icon:"🧠" },
    { label:"SLA breached",   value:stats?.sla_breached??0,   accent:"#D97706", icon:"⚠️" },
  ];

  const cardStyle = { background:"var(--white)", border:"1px solid var(--border)", borderRadius:"var(--radius)", boxShadow:"var(--shadow)" };
  const chartTip = { background:"var(--white)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px", color:"var(--ink)", boxShadow:"var(--shadow-md)" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"18px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:"16px", flexWrap:"wrap" }}>
        <div>
          <div className="kicker" style={{ marginBottom:"8px" }}>Operations overview</div>
          <h1 style={{ fontFamily:"var(--serif)", fontWeight:"600", fontSize:"30px", letterSpacing:"-.5px", color:"var(--ink)" }}>Command center</h1>
        </div>
        <div className="chip"><span className="live" /><span style={{ color:"var(--ink2)" }}>Live · auto-refresh 30s</span></div>
      </div>

      {/* Stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(168px,1fr))", gap:"12px" }}>
        {statCards.map((s,i) => (
          <div key={i} className="reveal" style={{ ...cardStyle, padding:"18px", position:"relative", overflow:"hidden", animationDelay:`${i*.06}s`, transition:"transform .2s, box-shadow .2s", cursor:"default" }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="var(--shadow-md)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="var(--shadow)";}}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", background:s.accent }} />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <p style={{ fontFamily:"var(--mono)", fontSize:"10.5px", color:"var(--ink3)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:"10px" }}>{s.label}</p>
                <p style={{ fontSize:"38px", fontWeight:"600", color:"var(--ink)", lineHeight:.9, fontFamily:"var(--serif)" }}>{s.value}</p>
              </div>
              <div style={{ fontSize:"17px", background:"var(--paper)", border:"1px solid var(--border)", width:"34px", height:"34px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"4px" }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SLA gauges */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px" }}>
        {[
          { l:"SLA breached", v:sla?.breached??0, c:"#DC2626" },
          { l:"At risk",      v:sla?.at_risk??0,  c:"#D97706" },
          { l:"On track",     v:sla?.ok??0,       c:"#0f7a55" },
        ].map((s,i) => (
          <div key={i} style={{ ...cardStyle, padding:"16px", display:"flex", alignItems:"center", gap:"12px" }}>
            <span style={{ width:"10px", height:"10px", borderRadius:"50%", background:s.c, boxShadow:`0 0 0 4px ${s.c}22`, flexShrink:0 }} />
            <div>
              <p style={{ fontSize:"11px", color:"var(--ink3)", marginBottom:"2px", textTransform:"uppercase", letterSpacing:".06em" }}>{s.l}</p>
              <p style={{ fontSize:"24px", fontWeight:"600", color:"var(--ink)", fontFamily:"var(--serif)", lineHeight:1 }}>{s.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:"14px" }}>
        <div style={{ ...cardStyle, padding:"20px" }}>
          <p style={{ fontSize:"13px", fontWeight:"700", color:"var(--ink)", marginBottom:"2px" }}>Incident trend</p>
          <p style={{ fontSize:"11px", color:"var(--ink3)", marginBottom:"16px", fontFamily:"var(--mono)" }}>last 7 days · incidents vs resolved</p>
          <ResponsiveContainer width="100%" height={158}>
            <BarChart data={trendData} barSize={10} barGap={3}>
              <XAxis dataKey="day" tick={{fontSize:10,fill:TICK}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize:10,fill:TICK}} axisLine={false} tickLine={false} width={20} />
              <Tooltip cursor={{fill:"rgba(148,163,184,0.1)"}} contentStyle={chartTip} />
              <Bar dataKey="incidents" fill="#ff5b2e" radius={[3,3,0,0]} name="Incidents" opacity={0.85} />
              <Bar dataKey="resolved"  fill="#0f7a55" radius={[3,3,0,0]} name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...cardStyle, padding:"20px" }}>
          <p style={{ fontSize:"13px", fontWeight:"700", color:"var(--ink)", marginBottom:"12px" }}>By category</p>
          <ResponsiveContainer width="100%" height={96}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" innerRadius={26} outerRadius={44} dataKey="value" paddingAngle={2} stroke="none">
                {catData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={chartTip} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ marginTop:"8px" }}>
            {catData.map((c,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:"11.5px", padding:"3px 0" }}>
                <span style={{ display:"flex", alignItems:"center", gap:"6px", color:"var(--ink2)" }}>
                  <span style={{ width:"8px", height:"8px", borderRadius:"2px", background:PIE_COLORS[i%5], display:"inline-block" }} />{c.name}
                </span>
                <span style={{ fontWeight:"700", color:"var(--ink)", fontFamily:"var(--mono)" }}>{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent tickets */}
      <div style={{ ...cardStyle, overflow:"hidden" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <p style={{ fontSize:"13px", fontWeight:"700", color:"var(--ink)" }}>Recent incidents</p>
          <button onClick={()=>navigate("/app/incidents")} className="btn btn-ghost btn-sm">View all →</button>
        </div>
        {(recent?.data || []).slice(0,5).map((t,i,arr) => {
          const s = SEV[t.severity]||SEV.P3;
          return (
            <div key={t.id} onClick={()=>navigate(`/app/incidents/${t.id}`)} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"13px 18px", borderBottom:i<arr.length-1?"1px solid var(--border)":"none", cursor:"pointer", transition:"background .15s" }}
                 onMouseEnter={e=>e.currentTarget.style.background="var(--paper)"}
                 onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{ fontSize:"9px", fontWeight:"800", background:s.bg, color:s.c, border:`1px solid ${s.b}`, padding:"2px 8px", borderRadius:"4px", flexShrink:0, fontFamily:"var(--mono)" }}>{t.severity}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:"13px", color:"var(--ink)", fontWeight:"500", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</p>
                <p style={{ fontSize:"11px", color:"var(--ink3)" }}>{t.category} · {t.assignee?.name || "Unassigned"}</p>
              </div>
              <span style={{ fontSize:"11px", background:(STA[t.status]?.c||"#888")+"1F", color:STA[t.status]?.c, padding:"3px 10px", borderRadius:"10px", fontWeight:"600", flexShrink:0 }}>
                {STA[t.status]?.l}
              </span>
            </div>
          );
        })}
        {!recent?.data?.length && (
          <div style={{ padding:"36px", textAlign:"center", color:"var(--ink3)", fontSize:"13px" }}>No incidents yet</div>
        )}
      </div>
    </div>
  );
}
