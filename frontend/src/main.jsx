// AlertMind — main.jsx
import React    from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "./index.css";

// Apply persisted/system theme before first paint to avoid a flash.
document.documentElement.dataset.theme =
  localStorage.getItem("am_theme") ||
  (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--white)",
            color: "var(--ink)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            fontSize: "13px",
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "var(--shadow-md)",
          },
          success: { iconTheme: { primary: "#0f7a55", secondary: "#fff" } },
          error  : { iconTheme: { primary: "#DC2626", secondary: "#fff" } },
        }}
      />
    </BrowserRouter>
  </QueryClientProvider>
);
