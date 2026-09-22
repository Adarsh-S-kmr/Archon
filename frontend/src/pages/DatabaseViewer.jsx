import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function DatabaseViewer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const [expandedTable, setExpandedTable] = useState(null);

  useEffect(() => {
    fetchEnvironment();
  }, []);

  async function fetchEnvironment() {
    try {
      setLoading(true);
      const res = await apiFetch("/api/environment");
      setData(res);
      if (res.tables && res.tables.length > 0 && !expandedTable) {
        setExpandedTable(res.tables[0].table_name);
      }
    } catch (err) {
      console.error("Failed to load environment:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset all table row counts and backups back to baseline demo state?")) {
      return;
    }
    try {
      setResetting(true);
      setResetMsg(null);
      await apiFetch("/api/environment/reset", { method: "POST" });
      setResetMsg("Target database restored to baseline demo state.");
      await fetchEnvironment();
      setTimeout(() => setResetMsg(null), 4000);
    } catch (err) {
      alert("Reset failed: " + err.message);
    } finally {
      setResetting(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center font-mono text-xs text-zinc-400">
        Loading target database metadata...
      </div>
    );
  }

  const { summary, tables = [], environment, db_type } = data || {};

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-200">
        <div>
          <span className="font-mono text-xs uppercase text-zinc-400 block mb-1">
            Cluster Inventory
          </span>
          <div className="flex items-center gap-3">
            <h2 className="serif-title text-4xl font-normal text-zinc-900">
              Database Schema
            </h2>
          </div>
          <p className="text-xs font-mono text-zinc-500 mt-1">
            {db_type} &middot; Environment: <span className="font-bold text-zinc-800 uppercase">{environment}</span> &middot; Governed by ARCHON Interceptor
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEnvironment}
            className="px-4 py-2 font-mono text-xs uppercase font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer"
          >
            Refresh Stats
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-4 py-2 font-mono text-xs uppercase font-medium text-zinc-900 bg-zinc-100 border border-zinc-200 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
          >
            {resetting ? "Resetting..." : "Reset Baseline"}
          </button>
        </div>
      </div>

      {/* Banner message */}
      {resetMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-mono text-emerald-900 flex items-center justify-between shadow-2xs">
          <span>{resetMsg}</span>
          <button onClick={() => setResetMsg(null)} className="text-emerald-700 font-bold hover:text-emerald-900 cursor-pointer">&times;</button>
        </div>
      )}

      {/* High-level Overview Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
        <div className="p-5 bg-white border border-zinc-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Managed Tables</span>
          <p className="text-2xl font-bold text-zinc-900">{summary?.total_tables ?? 0}</p>
          <span className="text-[10px] text-zinc-400">PostgreSQL public schema</span>
        </div>

        <div className="p-5 bg-white border border-zinc-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Total Live Records</span>
          <p className="text-2xl font-bold text-zinc-900">
            {Number(summary?.total_rows ?? 0).toLocaleString()}
          </p>
          <span className="text-[10px] text-zinc-400">Dynamic row tracking</span>
        </div>

        <div className="p-5 bg-white border border-zinc-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Estimated Size</span>
          <p className="text-2xl font-bold text-zinc-900">{summary?.total_size_formatted ?? "0 B"}</p>
          <span className="text-[10px] text-zinc-400">Average row weighted</span>
        </div>

        <div className="p-5 bg-white border border-zinc-200 rounded-xl shadow-2xs">
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">Backup Health</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${summary?.all_backups_healthy ? "bg-emerald-500" : "bg-amber-500"
                }`}
            />
            <p className="text-base font-bold text-zinc-900">
              {summary?.all_backups_healthy ? "100% Fresh" : "Mixed (Stale)"}
            </p>
          </div>
          <span className="text-[10px] text-zinc-400">Policy limit &lt; 24h</span>
        </div>
      </div>

      {/* Table Cards List */}
      <div className="space-y-4">
        <h2 className="font-mono text-xs font-bold text-zinc-800 uppercase tracking-wider">
          Managed Tables &amp; Schema
        </h2>

        {tables.map((tbl) => {
          const isExpanded = expandedTable === tbl.table_name;
          return (
            <div
              key={tbl.id}
              className="border border-zinc-200 rounded-xl bg-white overflow-hidden shadow-2xs transition-shadow"
            >
              {/* Table Card Header */}
              <div
                onClick={() => setExpandedTable(isExpanded ? null : tbl.table_name)}
                className="p-5 flex items-center justify-between cursor-pointer hover:bg-zinc-50/70 transition-colors"
              >
                <div className="flex items-center gap-3 font-mono">
                  <span className="font-bold text-sm text-zinc-900">
                    {tbl.table_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{tbl.description}</span>
                    {tbl.is_dropped && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-rose-50 text-rose-700 rounded border border-rose-200">
                        DROPPED (0 rows)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 font-mono">
                  {/* Row count pill */}
                  <div className="text-right">
                    <span className="text-sm font-bold text-zinc-900">
                      {Number(tbl.row_count).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-400 block uppercase">rows</span>
                  </div>

                  {/* Backup indicator */}
                  <div className="text-right hidden sm:block">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-md border ${tbl.backup_is_fresh
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                    >
                      {tbl.backup_age_hours === 0
                        ? "Just now"
                        : tbl.backup_age_hours < 24
                          ? `${tbl.backup_age_hours}h ago`
                          : `${Math.round(tbl.backup_age_hours / 24)}d ago (Stale)`}
                    </span>
                  </div>

                  {/* Expand Chevron */}
                  <span className="text-zinc-400 text-xs font-mono ml-1">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Expanded Schema & Activity Details */}
              {isExpanded && (
                <div className="border-t border-zinc-100 p-5 bg-zinc-50/50 space-y-5">
                  {/* Schema Columns Table */}
                  <div>
                    <h3 className="font-mono text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2.5">
                      Schema Columns &amp; Constraints
                    </h3>
                    <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                      <table className="min-w-full text-xs font-mono divide-y divide-zinc-200">
                        <thead className="bg-zinc-50/80">
                          <tr className="text-zinc-500 text-[11px] uppercase tracking-wider font-medium">
                            <th className="px-3.5 py-2.5 text-left font-medium">Column</th>
                            <th className="px-3.5 py-2.5 text-left font-medium">Type</th>
                            <th className="px-3.5 py-2.5 text-left font-medium">Key / Constraint</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {tbl.columns && tbl.columns.length > 0 ? (
                            tbl.columns.map((col, idx) => {
                              const isColObj = typeof col === "object";
                              const colName = isColObj ? col.name : col;
                              const colType = isColObj ? col.type : "varchar";
                              const isPk = isColObj && col.pk;
                              const isFk = isColObj && col.fk;
                              const isUnique = isColObj && col.unique;

                              return (
                                <tr key={idx} className="hover:bg-zinc-50/70">
                                  <td className="px-3.5 py-2 font-bold text-zinc-900">
                                    {colName}
                                  </td>
                                  <td className="px-3.5 py-2 text-zinc-600">{colType}</td>
                                  <td className="px-3.5 py-2 text-zinc-500 font-sans">
                                    {isPk && (
                                      <span className="inline-block px-1.5 py-0.5 bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-md text-[10px] font-mono font-bold mr-1.5">
                                        PRIMARY KEY
                                      </span>
                                    )}
                                    {isFk && (
                                      <span className="inline-block px-1.5 py-0.5 bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-md text-[10px] font-mono font-bold mr-1.5">
                                        FK &rarr; {col.fk}
                                      </span>
                                    )}
                                    {isUnique && (
                                      <span className="inline-block px-1.5 py-0.5 bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-md text-[10px] font-mono font-bold">
                                        UNIQUE
                                      </span>
                                    )}
                                    {!isPk && !isFk && !isUnique && <span className="text-zinc-400 font-mono">-</span>}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={3} className="px-3.5 py-2 text-zinc-400">
                                No columns recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recent Operations */}
                  <div>
                    <h3 className="font-mono text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2.5">
                      Recent Activity on {tbl.table_name}
                    </h3>
                    {tbl.recent_operations && tbl.recent_operations.length > 0 ? (
                      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100 bg-white font-mono shadow-2xs">
                        {tbl.recent_operations.map((op) => (
                          <div key={op.id} className="p-3 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900 px-2 py-0.5 bg-zinc-100 border border-zinc-200 rounded-md text-[10px]">
                                {op.type}
                              </span>
                              <span className="text-zinc-900 font-medium">{op.task_name}</span>
                              {op.execution_result && op.execution_result.rows_deleted !== undefined && (
                                <span className="text-rose-700 font-bold text-[11px]">
                                  (-{op.execution_result.rows_deleted} rows)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {op.decision ? (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${op.decision === "ALLOW"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : op.decision === "BLOCK"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                    }`}
                                >
                                  {op.decision}
                                </span>
                              ) : (
                                <span className="text-zinc-400 text-[11px]">{op.status}</span>
                              )}
                              <span className="text-zinc-400 text-[10px]">
                                {new Date(op.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-zinc-400 bg-white p-3.5 border border-zinc-200 rounded-lg">
                        No recent operations on this table. Run a query in the <Link to="/" className="text-zinc-900 underline font-semibold">Task Console</Link> to see live row counts update.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
