// AlertMind — Layout Component
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, useUIStore } from "../../lib/store.js";
import { useState, useEffect }      from "react";
import { useTickets }               from "../../hooks/index.js";

const NAV_ITEMS = [
  { to:"/app/dashboard", icon:"⊞",  label:"Dashboard"  },
  { to:"/app/incidents", icon:"🔔", label:"Incidents",  badge:true },
  { to:"/app/runbooks",  icon:"📚", label:"Runbooks"   },
  { to:"/app/ai",        icon:"🧠", label:"AI Console" },
  { to:"/app/cmdb",      icon:"🖧",  label:"CMDB"       },
  { to:"/app/settings",  icon:"⚙",  label:"Settings"   },
];

export default function Layout() {
  const { user, logout }          = useAuthStore();
  // Viewers are read-only; hide the create-ticket shortcut from them.
  const canWrite = user?.role !== "viewer";
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobile, setMobile]       = useState(window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: tickets } = useTickets({ status: "open" });
  const openCount = tickets?.count || 0;

  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 1024);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const handleLogout = () => { logout(); navigate("/login"); };

  const sidebar = (
    <aside style={{
      width: "220px", flexShrink: 0,
      background: "var(--white)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      height: "100vh", position: mobile ? "fixed" : "relative",
      zIndex: 50, boxShadow: mobile ? "2px 0 20px rgba(0,0,0,0.1)" : "none",
      transform: mobile && !mobileOpen ? "translateX(-100%)" : "translateX(0)",
      transition: "transform .2s ease",
    }}>
      {/* Logo */}
      <div style={{ padding:"18px 16px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"10px" }}>
        <div style={{ width:"34px", height:"34px", background:"#ff5b2e", borderRadius:"4px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"17px", flexShrink:0 }}>🧠</div>
        <div>
          <div style={{ fontSize:"15px", fontWeight:"800", color:"var(--ink)", letterSpacing:"-0.3px", fontFamily:"var(--serif)" }}>AlertMind</div>
          <div style={{ fontSize:"10px", color:"var(--ink3)" }}>ITSM Platform</div>
        </div>
        {mobile && <button onClick={()=>setMobileOpen(false)} style={{ marginLeft:"auto", background:"none", border:"none", fontSize:"18px", cursor:"pointer", color:"var(--ink3)" }}>✕</button>}
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:"10px 10px", overflowY:"auto" }}>
        {NAV_ITEMS.map(n => (
          <NavLink key={n.to} to={n.to} onClick={()=>mobile&&setMobileOpen(false)}
            style={({ isActive }) => ({
              display:"flex", alignItems:"center", gap:"10px",
              padding:"10px 12px", borderRadius:"10px", marginBottom:"2px",
              textDecoration:"none", fontSize:"13px", fontWeight:"500",
              background: isActive ? "var(--amberL)" : "transparent",
              color: isActive ? "var(--amberFg)" : "var(--ink2)",
              transition:"all .15s",
            })}>
            <span style={{ fontSize:"16px" }}>{n.icon}</span>
            <span style={{ flex:1 }}>{n.label}</span>
            {n.badge && openCount > 0 && (
              <span style={{ fontSize:"10px", background:"#DC2626", color:"#fff", padding:"1px 7px", borderRadius:"10px", fontWeight:"700" }}>
                {openCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* AI Status */}
      <div style={{ margin:"0 10px 10px", padding:"12px 14px", background:"var(--greenL)", border:"1px solid var(--border)", borderRadius:"10px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"3px" }}>
          <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--green)", animation:"pulse 1.5s infinite" }} />
          <span style={{ fontSize:"11px", fontWeight:"700", color:"var(--greenFg)" }}>AI Online</span>
        </div>
        <div style={{ fontSize:"10px", color:"var(--greenFg)" }}>llama3.3:70b</div>
        <div style={{ fontSize:"10px", color:"var(--greenFg)", fontFamily:"var(--mono)" }}>173.249.2.23</div>
      </div>

      {/* User */}
      <div style={{ padding:"12px 14px", borderTop:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"10px" }}>
        <NavLink to="/app/profile" onClick={()=>mobile&&setMobileOpen(false)} title="Profile" style={{ display:"flex", alignItems:"center", gap:"10px", flex:1, minWidth:0, textDecoration:"none" }}>
          <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"linear-gradient(135deg,var(--blueL),var(--blueB))", border:"2px solid var(--blueB)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:"800", color:"var(--blueFg)", flexShrink:0 }}>
            {user?.name?.slice(0,2).toUpperCase() || "??"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"12px", fontWeight:"600", color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.name || "..."}</div>
            <div style={{ fontSize:"10px", color:"var(--ink3)" }}>{user?.role}</div>
          </div>
        </NavLink>
        <button onClick={handleLogout} style={{ background:"none", border:"1px solid var(--border)", color:"var(--ink3)", fontSize:"11px", padding:"4px 10px", borderRadius:"7px", cursor:"pointer", fontFamily:"var(--sans)" }}>
          Out
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:"var(--paper)", overflow:"hidden" }}>
      {sidebar}

      {/* Mobile overlay */}
      {mobile && mobileOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:40 }}
             onClick={()=>setMobileOpen(false)} />
      )}

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        {/* Top bar */}
        <header style={{ background:"var(--white)", borderBottom:"1px solid var(--border)", height:"56px", display:"flex", alignItems:"center", padding:"0 20px", gap:"12px", flexShrink:0, boxShadow:"var(--shadow)" }}>
          {mobile && (
            <button onClick={()=>setMobileOpen(true)} style={{ background:"none", border:"none", fontSize:"20px", cursor:"pointer", color:"var(--ink2)" }}>☰</button>
          )}
          <div style={{ flex:1, fontSize:"12px", color:"var(--ink3)" }}>
            {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
          </div>

          <button className="theme-toggle" onClick={toggleTheme} title={theme==="dark"?"Switch to light":"Switch to dark"} aria-label="Toggle theme">
            {theme==="dark" ? "☀" : "☾"}
          </button>


          {/* New ticket button */}
          {canWrite && (
            <NavLink to="/app/incidents/new" style={{ display:"flex", alignItems:"center", gap:"6px", background:"#ff5b2e", color:"#fff", padding:"7px 14px", borderRadius:"4px", fontSize:"12px", fontWeight:"700", textDecoration:"none" }}>
              + New Ticket
            </NavLink>
          )}
        </header>

        {/* Page */}
        <main style={{ flex:1, overflowY:"auto", padding: mobile ? "12px" : "20px 24px" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
