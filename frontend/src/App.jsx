// AlertMind — App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore }            from "./lib/store.js";
import Landing     from "./pages/Landing.jsx";

// Keep the public launch page light; authenticated tools load only when needed.
const Layout = lazy(() => import("./components/layout/Layout.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Incidents = lazy(() => import("./pages/Incidents.jsx"));
const TicketDetail = lazy(() => import("./pages/TicketDetail.jsx"));
const NewTicket = lazy(() => import("./pages/NewTicket.jsx"));
const Runbooks = lazy(() => import("./pages/Runbooks.jsx"));
const NewRunbook = lazy(() => import("./pages/NewRunbook.jsx"));
const RunbookDetail = lazy(() => import("./pages/RunbookDetail.jsx"));
const AIConsole = lazy(() => import("./pages/AIConsole.jsx"));
const CMDB = lazy(() => import("./pages/CMDB.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));

function PageLoader() {
  return <main className="page-loader" aria-label="Loading page" />;
}

function PrivateRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { loadUser, token } = useAuthStore();
  useEffect(() => { if (token) loadUser(); }, []);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route path="/"      element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/app" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index                   element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard"        element={<Dashboard />} />
        <Route path="incidents"        element={<Incidents />} />
        <Route path="incidents/new"    element={<NewTicket />} />
        <Route path="incidents/:id"    element={<TicketDetail />} />
        <Route path="runbooks"         element={<Runbooks />} />
        <Route path="runbooks/new"     element={<NewRunbook />} />
        <Route path="runbooks/:id"     element={<RunbookDetail />} />
        <Route path="ai"               element={<AIConsole />} />
        <Route path="cmdb"             element={<CMDB />} />
        <Route path="settings"         element={<Settings />} />
        <Route path="profile"          element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
