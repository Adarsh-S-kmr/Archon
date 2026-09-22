import React, { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    entity_type: "",
    actor: "",
  });

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filters.entity_type) params.set("entity_type", filters.entity_type);
      if (filters.actor) params.set("actor", filters.actor);

      const data = await apiFetch(`/api/audit-logs?${params.toString()}`);
      setLogs(data.audit_logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    loadLogs();
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-200 gap-4">
        <div>
          <span className="font-mono text-xs uppercase text-zinc-400 block mb-1">
            Compliance &amp; Traceability
          </span>
          <h2 className="serif-title text-4xl font-normal text-zinc-900">
            Audit Ledger
          </h2>
        </div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <select
            value={filters.entity_type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, entity_type: e.target.value }))
            }
            className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none font-medium shadow-2xs"
          >
            <option value="">Entity: All</option>
            <option value="task">Entity: Task</option>
            <option value="action">Entity: Action</option>
          </select>
          <select
            value={filters.actor}
            onChange={(e) =>
              setFilters((f) => ({ ...f, actor: e.target.value }))
            }
            className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none font-medium shadow-2xs"
          >
            <option value="">Actor: All Agents &amp; Users</option>
            <option value="user">Actor: User</option>
            <option value="planner_agent">Actor: Planner Agent</option>
            <option value="policy_engine">Actor: Policy Engine</option>
            <option value="executor">Actor: Executor</option>
            <option value="system">Actor: System</option>
          </select>
          <button
            onClick={applyFilters}
            className="border border-zinc-200 bg-white rounded-lg px-4 py-2 font-mono text-xs uppercase hover:bg-zinc-50 transition-colors font-medium shadow-2xs cursor-pointer"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="border border-zinc-200 bg-white rounded-xl p-6 shadow-xs">
        {loading ? (
          <p className="font-mono text-xs text-zinc-400 py-6 text-center">Loading ledger records...</p>
        ) : logs.length === 0 ? (
          <p className="font-mono text-xs text-zinc-400 py-6 text-center">No audit log entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 font-medium">
                  <th className="pb-3 uppercase tracking-wider">Timestamp</th>
                  <th className="pb-3 uppercase tracking-wider">Entity Type</th>
                  <th className="pb-3 uppercase tracking-wider">Operation</th>
                  <th className="pb-3 uppercase tracking-wider">Actor</th>
                  <th className="pb-3 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 text-zinc-400 whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="py-3.5 font-bold text-zinc-900">
                      {log.entity_type}
                    </td>
                    <td className="py-3.5">
                      <span className="text-zinc-900 font-bold bg-zinc-100 px-2 py-0.5 rounded-md text-[10px]">
                        {log.operation}
                      </span>
                    </td>
                    <td className="py-3.5 text-zinc-600">{log.actor}</td>
                    <td className="py-3.5 text-zinc-500 text-xs font-mono max-w-xs truncate">
                      {log.changes?.step
                        || (typeof log.changes?.status === "string" ? log.changes.status : null)
                        || JSON.stringify(log.changes).substring(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
