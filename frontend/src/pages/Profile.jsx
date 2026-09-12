// AlertMind — Profile Page
import { useAuthStore } from "../lib/store.js";

export default function Profile() {
  const { user } = useAuthStore();

  return (
    <div style={{ maxWidth:"560px" }}>
      <h1 style={{ fontFamily:"var(--serif)", fontSize:"24px", color:"var(--ink)", marginBottom:"20px" }}>Profile</h1>
      <div className="card" style={{ padding:"24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"24px" }}>
          <div style={{ width:"56px",height:"56px",borderRadius:"50%",background:"linear-gradient(135deg,var(--amberL),var(--amberB))",border:"2px solid var(--amberB)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",fontWeight:"800",color:"var(--amberFg)" }}>
            {user?.name?.slice(0,2).toUpperCase()||"??"}
          </div>
          <div>
            <p style={{ fontSize:"16px",fontWeight:"700",color:"var(--ink)" }}>{user?.name}</p>
            <p style={{ fontSize:"12px",color:"var(--ink3)" }}>{user?.email} · {user?.role}</p>
          </div>
        </div>
        <p style={{ fontSize:"13px", color:"var(--ink2)", lineHeight:"1.6", marginBottom:"18px" }}>
          Name, email, role, and password are managed in Keycloak. Changes there sync on the next sign-in.
        </p>
        <div style={{ display:"flex",flexDirection:"column",gap:"12px" }}>
          <div><label className="label">Full Name</label><input className="input" value={user?.name||""} disabled style={{ opacity:.6 }}/></div>
          <div><label className="label">Team</label><input className="input" value={user?.team||""} disabled style={{ opacity:.6 }}/></div>
          <div><label className="label">Email</label><input className="input" value={user?.email||""} disabled style={{ opacity:.6 }}/></div>
          <div><label className="label">Role</label><input className="input" value={user?.role||""} disabled style={{ opacity:.6 }}/></div>
        </div>
      </div>
    </div>
  );
}
