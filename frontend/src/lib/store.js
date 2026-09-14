// AlertMind — Zustand Store (src/lib/store.js)
import { create } from "zustand";
import { authAPI, clearTokens } from "./api.js";

// ── Auth Store ────────────────────────────────────────────
export const useAuthStore = create((set) => ({
  user   : null,
  token  : localStorage.getItem("am_token"),
  loading: false,
  ready  : !localStorage.getItem("am_token"),
  error  : null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await authAPI.login({ email, password });
      set({ token, user, loading: false, ready: true });
      return true;
    } catch(e) {
      set({ error: e.error || "Login failed", loading: false, ready: true });
      return false;
    }
  },

  logout: async () => {
    await authAPI.logout();
    set({ user: null, token: null, ready: true });
  },

  loadUser: async () => {
    if (!localStorage.getItem("am_token")) {
      clearTokens();
      set({ user: null, token: null, ready: true });
      return;
    }
    try {
      const user = await authAPI.me();
      set({ user, ready: true, token: localStorage.getItem("am_token") });
    } catch {
      clearTokens();
      set({ user: null, token: null, ready: true });
    }
  },
}));

// ── AI Analysis Store ─────────────────────────────────────
export const useAIStore = create((set, get) => ({
  state    : "idle",   // idle | loading | done | error
  result   : null,
  streaming: "",
  steps    : {},
  ticketId : null,

  start     : (id) => set({ state:"loading", result:null, streaming:"", steps:{}, ticketId:id }),
  setResult : (r)  => set({ state:"done",    result:r }),
  setError  : ()   => set({ state:"error" }),
  addStream : (s)  => set({ streaming: s }),
  toggleStep: (i)  => set(s => ({ steps: { ...s.steps, [i]: !s.steps[i] } })),
  reset     : ()   => set({ state:"idle", result:null, streaming:"", steps:{}, ticketId:null }),
  doneCount : ()   => {
    const { result, steps } = get();
    return result?.resolution_steps?.filter((_,i) => steps[i]).length || 0;
  },
}));

// ── UI Store ──────────────────────────────────────────────
const initialTheme =
  localStorage.getItem("am_theme") ||
  (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export const useUIStore = create((set) => ({
  sidebarOpen  : true,
  mobileNavOpen: false,
  theme        : initialTheme,

  toggleSidebar  : ()  => set(s => ({ sidebarOpen:   !s.sidebarOpen })),
  setMobileNav   : (v) => set({ mobileNavOpen: v }),
  toggleTheme    : ()  => set(s => {
    const theme = s.theme === "dark" ? "light" : "dark";
    localStorage.setItem("am_theme", theme);
    document.documentElement.dataset.theme = theme;
    return { theme };
  }),
}));
