// AlertMind — Custom Hooks (src/hooks/index.js)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketAPI, runbookAPI, dashboardAPI, ragAPI, cmdbAPI } from "../lib/api.js";
import { useAIStore } from "../lib/store.js";
import toast from "react-hot-toast";

// ── Tickets ───────────────────────────────────────────────
export function useTickets(filters = {}) {
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn : () => ticketAPI.list(filters),
    refetchInterval: 30000,
  });
}

export function useTicket(id) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn : () => ticketAPI.get(id),
    enabled : !!id,
    refetchInterval: 15000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ticketAPI.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(`Ticket ${data.id} created`);
    },
    onError: (e) => toast.error(e.error || "Failed to create ticket"),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => ticketAPI.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ticket", vars.id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Ticket updated");
    },
    onError: (e) => toast.error(e.error || "Update failed"),
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ticketAPI.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket deleted");
    },
  });
}

// ── AI Analysis ───────────────────────────────────────────
export function useAnalyzeTicket() {
  const { start, setResult, setError, reset } = useAIStore();
  const qc = useQueryClient();

  return async (ticket) => {
    reset();
    start(ticket.id);

    try {
      const result = await ragAPI.analyze({
        ticket_id  : ticket.id,
        title      : ticket.title,
        description: ticket.description,
        severity   : ticket.severity,
        category   : ticket.category,
        affected_ci: ticket.affected_ci || "",
      });
      setResult(result);
      qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      toast.success(`AI analysis complete — ${result.confidence}% confidence`);
      return result;
    } catch(e) {
      setError();
      toast.error("AI analysis failed. Check Ollama connection.");
      return null;
    }
  };
}

// ── Runbooks ──────────────────────────────────────────────
export function useRunbooks(params = {}) {
  return useQuery({
    queryKey: ["runbooks", params],
    queryFn : () => runbookAPI.list(params),
  });
}

export function useRunbook(id) {
  return useQuery({
    queryKey: ["runbook", id],
    queryFn : () => runbookAPI.get(id),
    enabled : !!id,
  });
}

export function useCreateRunbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runbookAPI.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["runbooks"] });
      toast.success(`Runbook "${data.title}" created`);
    },
    onError: (e) => toast.error(e.error || "Failed to create runbook"),
  });
}

// ── Dashboard ─────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn : dashboardAPI.stats,
    refetchInterval: 30000,
  });
}

export function useDashboardTrend() {
  return useQuery({
    queryKey: ["dashboard-trend"],
    queryFn : dashboardAPI.trend,
    refetchInterval: 60000,
  });
}

export function useSLASummary() {
  return useQuery({
    queryKey: ["sla-summary"],
    queryFn : dashboardAPI.sla,
    refetchInterval: 30000,
  });
}

// ── CMDB ──────────────────────────────────────────────────
export function useCMDB() {
  return useQuery({
    queryKey: ["cmdb"],
    queryFn : cmdbAPI.list,
  });
}

// ── Debounce helper ───────────────────────────────────────
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

import { useState, useEffect } from "react";
