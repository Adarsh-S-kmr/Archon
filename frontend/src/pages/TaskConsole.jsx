import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

function normalizeDecision(d) {
  if (!d) return d;
  if (d === "DENY") return "BLOCK";
  if (d === "ESCALATE") return "REQUIRE_APPROVAL";
  return d;
}

function StatusBadge({ decision }) {
  const d = normalizeDecision(decision);
  if (!d) return null;
  const map = {
    ALLOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
    BLOCK: "bg-rose-50 text-rose-700 border-rose-200",
    REQUIRE_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const label = {
    ALLOW: "ALLOW (Safe)",
    BLOCK: "BLOCKED",
    REQUIRE_APPROVAL: "REQUIRE_APPROVAL",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider rounded-md border ${map[d] || "bg-zinc-100 text-zinc-600 border-zinc-200"
        }`}
    >
      {label[d] || d}
    </span>
  );
}

function ActionTag({ type }) {
  if (!type) return <span className="text-zinc-400 font-mono text-xs">-</span>;
  return (
    <span className="inline-block px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md bg-zinc-100 text-zinc-900 border border-zinc-200">
      {type.toUpperCase()}
    </span>
  );
}

function PlannerStep({ data, isLatest }) {
  const isDirect = Boolean(data.is_direct_json);
  return (
    <div className={`border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 transition-all overflow-hidden break-words ${isLatest ? "animate-fade-in" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
          {isDirect ? " DIRECT PAYLOAD" : " PLANNER"}
        </span>
        {isDirect && (
          <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded font-medium">
            LLM Bypassed
          </span>
        )}
      </div>
      <h4 className="font-mono text-xs font-bold text-zinc-900 mb-1.5">
        {isDirect ? "Direct Structured JSON Input" : "Gemini LLM Planner"}
      </h4>
      <div className="font-mono text-xs text-zinc-700 space-y-1">
        <div className="flex items-center gap-2">
          <ActionTag type={data.action_type} />
          <span>
            on <strong className="font-bold text-zinc-900">{data.target}</strong>
          </span>
          {data.condition && (
            <span className="text-zinc-500 text-[11px]">
              WHERE {data.condition}
            </span>
          )}
        </div>
        <div className="flex gap-4 text-zinc-500 text-[10px] pt-1">
          <span>env: <strong className="text-zinc-800 uppercase">{data.environment}</strong></span>
          <span>est. rows: <strong className="text-zinc-800">{Number(data.self_reported_rows_affected || 0).toLocaleString()}</strong></span>
          <span>risk: <strong className="text-zinc-800">{data.self_reported_risk}</strong></span>
        </div>
      </div>
    </div>
  );
}

function PolicyStep({ data, isLatest }) {
  const { decisions, finalDecision, blastRadius } = data;
  return (
    <div className={`border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 transition-all overflow-hidden break-words ${isLatest ? "animate-fade-in" : ""}`}>
      <span className="font-mono text-[10px] text-zinc-400 block mb-1 uppercase tracking-wider">
        POLICY ENGINE &amp; BLAST RADIUS
      </span>
      <h4 className="font-mono text-xs font-bold text-zinc-900 mb-1.5">
        Deterministic Rules &amp; Impact Calculation
      </h4>
      <div className="font-mono text-xs text-zinc-700 space-y-2">
        {blastRadius && (
          <div className="flex gap-4 text-zinc-500 text-[10px] pb-1 border-b border-zinc-200/60">
            <span>
              actual rows: <strong className="text-zinc-800">{blastRadius.estimated_rows?.toLocaleString() ?? "-"} / {blastRadius.table_row_count?.toLocaleString() ?? "?"}</strong>
            </span>
            <span>blast: <strong className="text-zinc-800">{blastRadius.blast_percentage ?? "-"}%</strong></span>
            {blastRadius.has_backup !== undefined && (
              <span>backup: <strong className="text-zinc-800">{blastRadius.has_backup ? `verified (${blastRadius.backup_age_hours}h ago)` : "none"}</strong></span>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          {decisions.map((d, i) => {
            const dec = normalizeDecision(d.decision);
            const passed = dec === "ALLOW";
            return (
              <div key={i} className="flex items-start gap-2 text-xs font-mono">
                <span className={`mt-0.5 font-bold ${passed ? "text-emerald-600" : dec === "BLOCK" ? "text-rose-600" : "text-amber-600"}`}>
                  {passed ? "✓" : "✕"}
                </span>
                <span className="text-zinc-700">
                  <span className="font-bold text-zinc-900">{d.policy_name}</span>
                  {" — "}
                  <span className="text-zinc-500 text-[11px]">{d.reason}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="pt-2 flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Policy Verdict:</span>
          <StatusBadge decision={finalDecision} />
        </div>
      </div>
    </div>
  );
}

function ExecutorStep({ data, isLatest }) {
  const { executed, skippedReason, result } = data;
  return (
    <div className={`border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 transition-all overflow-hidden break-words ${isLatest ? "animate-fade-in" : ""}`}>
      <span className="font-mono text-[10px] text-zinc-400 block mb-1 uppercase tracking-wider">
        EXECUTOR
      </span>
      <h4 className="font-mono text-xs font-bold text-zinc-900 mb-1.5">
        Database Commit Transaction
      </h4>
      <div className="font-mono text-xs">
        {executed ? (
          <div className="space-y-2">
            <p className="text-emerald-700 font-medium">
              ✓ Database operation committed safely to target cluster.
            </p>
            {result && (
              <div className="pt-2 border-t border-zinc-200/60 font-mono text-[11px] text-zinc-600 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {result.operation && <span>op: <strong className="text-zinc-900">{result.operation}</strong></span>}
                  {result.target && <span>target: <strong className="text-zinc-900">{result.target}</strong></span>}
                  {result.rows_deleted !== undefined && <span>deleted: <strong className="text-rose-600">-{Number(result.rows_deleted).toLocaleString()}</strong></span>}
                  {result.rows_affected !== undefined && <span>affected: <strong className="text-zinc-900">{Number(result.rows_affected).toLocaleString()}</strong></span>}
                  {result.rows_before !== undefined && result.rows_after !== undefined && (
                    <span>rows: <strong className="text-zinc-800">{Number(result.rows_before).toLocaleString()} &rarr; {Number(result.rows_after).toLocaleString()}</strong></span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 break-all font-mono pt-0.5">
                  payload: {JSON.stringify(result)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-rose-700 font-medium break-words">
            ✕ Execution halted — {skippedReason}
          </p>
        )}
      </div>
    </div>
  );
}

function AuditStep({ data, isLatest }) {
  const trail = data?.trail || [];

  return (
    <div className={`border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 transition-all overflow-hidden break-words ${isLatest ? "animate-fade-in" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
          AUDIT LOG
        </span>
        <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold">
          {trail.length > 0 ? `${trail.length} ENTRIES RECORDED` : "COMMITTED"}
        </span>
      </div>
      <h4 className="font-mono text-xs font-bold text-zinc-900 mb-1.5">
        Immutable Audit Trail Recorded
      </h4>

      {trail.length > 0 ? (
        <div className="font-mono text-xs space-y-2 mt-1.5">
          <div className="divide-y divide-zinc-200/60 border border-zinc-200/80 rounded-md bg-white p-2 text-[11px] shadow-2xs">
            {trail.map((entry, idx) => {
              const stepName = entry.changes?.step || entry.operation;
              return (
                <div key={idx} className={`flex items-center justify-between py-1 ${idx > 0 ? "pt-1.5" : ""}`}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[10px] font-bold text-zinc-900 uppercase px-1 py-0.2 bg-zinc-100 border border-zinc-200 rounded">
                      {entry.actor}
                    </span>
                    <span className="text-zinc-700 truncate">
                      {stepName}
                      {entry.changes?.evaluation && (
                        <span className={`ml-1 font-semibold ${entry.changes.evaluation === "ALLOW" ? "text-emerald-700" : "text-rose-700"}`}>
                          ({entry.changes.evaluation})
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 shrink-0 ml-2">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-0.5 text-[10px] text-zinc-400">
            <span className="truncate">Action ID: {data?.actionId?.substring(0, 16)}...</span>
            <Link to="/audit" className="text-zinc-900 underline font-medium hover:text-zinc-700 shrink-0">
              View Audit Log &rarr;
            </Link>
          </div>
        </div>
      ) : (
        <div className="font-mono text-xs text-zinc-700 space-y-1">
          <p className="text-emerald-700 font-medium">✓ Plan, evaluation &amp; execution written to audit log.</p>
          <Link to="/audit" className="text-zinc-900 underline text-[11px] inline-block">
            Inspect in Audit Log &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}

function SpinnerDot() {
  return (
    <div className="border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 flex items-center gap-2">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:300ms]" />
      </div>
      <span className="font-mono text-xs text-zinc-500">Evaluating pipeline node...</span>
    </div>
  );
}


// main function
export default function TaskConsole() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [logSteps, setLogSteps] = useState([]);
  const [error, setError] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [envTables, setEnvTables] = useState([]);
  const [lastAffectedTable, setLastAffectedTable] = useState(null);
  const logRef = useRef(null);
  const abortControllerRef = useRef(null);

  function stopEvaluation() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setRunning(false);
    setLogSteps((prev) => [
      ...prev.filter((s) => s.type !== "loading"),
      { type: "stopped" },
    ]);
  }

  useEffect(() => {
    loadRecentTasks();
    loadEnvironment();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logSteps]);

  async function loadRecentTasks() {
    try {
      const data = await apiFetch("/api/tasks?limit=10");
      setRecentTasks(data.tasks || []);
    } catch {
      // silent
    }
  }

  async function loadEnvironment() {
    try {
      const data = await apiFetch("/api/environment");
      setEnvTables(data.tables || []);
    } catch {
      // silent
    }
  }

  async function runPipeline() {
    if (!input.trim() || running) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setRunning(true);
    setLogSteps([]);
    setError(null);
    // call the api/tasks
    try {
      const isDirectInput = input.trim().startsWith("{") || input.trim().startsWith("```");
      setLogSteps([{ type: "loading", label: isDirectInput ? "Direct Payload" : "Planner Agent" }]);
      const taskData = await apiFetch("/api/tasks", {
        method: "POST",
        body: { user_request: input.trim() },
        signal: controller.signal,
      });

      const actionId = taskData.action?.id;
      if (!actionId) throw new Error("No action returned from planner");

      const planData = taskData.llm_parsed || taskData.action?.payload || {};
      setLogSteps([{ type: "planner", data: planData }]);

      setLogSteps((prev) => [...prev, { type: "loading", label: "Policy Engine" }]);
      const evalData = await apiFetch(`/api/actions/${actionId}/evaluate`, {
        method: "POST",
        signal: controller.signal,
      });

      const finalDecision = evalData.final_decision || evalData.decision;
      const blastRadius = evalData.blast_radius || {};
      const decisions = evalData.decisions || [];

      setLogSteps((prev) => {
        const updated = prev.filter((s) => s.type !== "loading");
        return [...updated, { type: "policy", data: { decisions, finalDecision, blastRadius } }];
      });

      let executed = false;
      let execResult = null;
      let skippedReason = "";

      if (finalDecision === "ALLOW") {
        setLogSteps((prev) => [...prev, { type: "loading", label: "Executor" }]);
        const execData = await apiFetch(`/api/actions/${actionId}/execute`, {
          method: "POST",
          signal: controller.signal,
        });
        executed = true;
        execResult = execData.result || null;

        if (execResult && execResult.target) {
          setLastAffectedTable({
            table: execResult.target.toLowerCase(),
            diff: execResult.rows_deleted !== undefined ? `-${Number(execResult.rows_deleted).toLocaleString()}` : null,
          });
        }

        setLogSteps((prev) => {
          const updated = prev.filter((s) => s.type !== "loading");
          return [...updated, { type: "executor", data: { executed: true, result: execResult } }];
        });
      } else {
        skippedReason = finalDecision === "BLOCK"
          ? "action blocked by policy"
          : "pending human approval";

        if (finalDecision === "BLOCK") {
          setLastAffectedTable({
            table: (planData.target || "").toLowerCase(),
            protected: true,
          });
        }

        setLogSteps((prev) => [
          ...prev,
          { type: "executor", data: { executed: false, skippedReason } },
        ]);
      }

      let auditTrail = [];
      try {
        const trailRes = await apiFetch(`/api/audit-logs/${actionId}/trail`);
        auditTrail = trailRes.trail || [];
      } catch {
        // Fallback if trail not yet written
      }

      setLogSteps((prev) => [
        ...prev,
        {
          type: "audit",
          data: {
            actionId,
            trail: auditTrail,
          },
        },
      ]);

      setInput("");
      await Promise.all([loadRecentTasks(), loadEnvironment()]);
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      setError({ message: err.message, status: err.status || 0 });
      setLogSteps((prev) => prev.filter((s) => s.type !== "loading"));
    } finally {
      setRunning(false);
      abortControllerRef.current = null;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runPipeline();
    }
  }

  function getTaskDecision(t) {
    if (t.decision?.decision) return normalizeDecision(t.decision.decision);
    if (t.action?.status === "approved") return "ALLOW";
    if (t.action?.status === "denied") return "BLOCK";
    return null;
  }

  return (
    <div className="w-full space-y-6">
      {/* Target DB Environment Line */}
      <div className="border border-zinc-200 bg-zinc-50/50 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center space-x-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-600">Target Cluster:</span>
          <span className="text-zinc-900 font-bold">(PostgreSQL Production)</span>
        </div>
        <Link
          to="/database"
          className="text-zinc-900 hover:underline uppercase tracking-wider font-semibold text-left sm:text-right"
        >
          Inspect Schema &amp; Tables &rarr;
        </Link>
      </div>

      {/* Target DB Mini Cards (if tables exist) */}
      {envTables.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {envTables.map((t) => {
            const isTargeted = lastAffectedTable?.table === t.table_name.toLowerCase();
            return (
              <div
                key={t.id}
                className={`border rounded-lg p-3.5 transition-all ${isTargeted
                  ? "bg-white border-zinc-900 ring-1 ring-zinc-900 shadow-xs"
                  : "bg-white border-zinc-200 shadow-2xs"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-zinc-900">
                    {t.table_name}
                  </span>
                  {isTargeted && lastAffectedTable?.diff && (
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
                      {lastAffectedTable.diff}
                    </span>
                  )}
                  {isTargeted && lastAffectedTable?.protected && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                      Protected
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between mt-2 font-mono">
                  <span className="text-sm font-bold text-zinc-900">
                    {Number(t.row_count).toLocaleString()}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${t.backup_is_fresh ? "text-emerald-700" : "text-amber-700"
                      }`}
                  >
                    {t.backup_is_fresh ? "Backed up" : "Stale backup"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Natural Language Command Prompt */}
      <div className="border border-zinc-200 bg-white rounded-xl p-6 shadow-xs">
        <label className="block font-mono text-xs uppercase text-zinc-700 font-bold mb-3">
          Agentic Operation Prompt
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Purge test accounts created before 2024 in public.users where status is inactive..."
            disabled={running}
            className="flex-grow bg-white border border-zinc-200 rounded-lg px-4 py-3 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all disabled:opacity-50"
          />
          {running ? (
            <button
              type="button"
              onClick={stopEvaluation}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-mono text-xs uppercase font-medium px-6 py-3 transition-all tracking-wider flex items-center justify-center space-x-2 shadow-sm shrink-0 cursor-pointer"
              title="Stop evaluation"
            >
              <span className="w-2.5 h-2.5 bg-white rounded-xs inline-block" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={runPipeline}
              disabled={!input.trim()}
              className="bg-zinc-900 text-white rounded-lg font-mono text-xs uppercase font-medium px-6 py-3 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all tracking-wider flex items-center justify-center space-x-2 shadow-sm shrink-0 cursor-pointer"
            >
              <span>Execute</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        error.status === 503 ? (
          <div className="p-4 border border-amber-200 bg-amber-50 rounded-xl font-mono text-xs shadow-2xs">
            <p className="font-bold text-amber-900">Gemini API temporarily unavailable</p>
            <p className="text-amber-700 mt-1">
              Google&apos;s API is experiencing high demand. This is a rate limit on their side.
            </p>
            <button
              onClick={runPipeline}
              className="mt-3 px-3 py-1 font-mono text-xs uppercase font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="p-4 font-mono text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl shadow-2xs">
            {error.message}
          </div>
        )
      )}

      {/* Pipeline Log */}
      {logSteps.length > 0 && (
        <div className="border border-zinc-200 bg-white rounded-xl p-6 shadow-xs space-y-6" ref={logRef}>
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <span className="font-mono text-xs uppercase text-zinc-800 font-bold">
              Live Governance Pipeline
            </span>
            <span className="font-mono text-xs text-zinc-900 uppercase font-bold bg-zinc-100 px-2.5 py-1 rounded-md">
              {running ? "Evaluating..." : logSteps.some((s) => s.type === "stopped") ? "Halted" : "Completed"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {logSteps.map((step, i) => {
              const isLatest = i === logSteps.length - 1;
              switch (step.type) {
                case "planner":
                  return <PlannerStep key={i} data={step.data} isLatest={isLatest} />;
                case "policy":
                  return <PolicyStep key={i} data={step.data} isLatest={isLatest} />;
                case "executor":
                  return <ExecutorStep key={i} data={step.data} isLatest={isLatest} />;
                case "audit":
                  return <AuditStep key={i} data={step.data} isLatest={isLatest} />;
                case "stopped":
                  return (
                    <div key={i} className="border border-zinc-200 bg-zinc-50/50 rounded-lg p-3.5 flex items-center gap-2 font-mono text-xs text-zinc-500">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>Evaluation stopped by operator.</span>
                    </div>
                  );
                case "loading":
                  return <SpinnerDot key={i} />;
                default:
                  return null;
              }
            })}
          </div>
        </div>
      )}

      {/* Recent Tasks History */}
      <div className="border border-zinc-200 bg-white rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
          <span className="font-mono text-xs uppercase text-zinc-800 font-bold">
            Recent Governed Operations
          </span>
        </div>
        {recentTasks.length === 0 ? (
          <p className="font-mono text-xs text-zinc-400 py-4 text-center">No tasks recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 font-medium">
                  <th className="pb-3 uppercase tracking-wider">Action</th>
                  <th className="pb-3 uppercase tracking-wider">Target Table</th>
                  <th className="pb-3 uppercase tracking-wider">Environment</th>
                  <th className="pb-3 uppercase tracking-wider">Decision</th>
                  <th className="pb-3 uppercase tracking-wider">Task Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {recentTasks.map((t) => {
                  const decision = getTaskDecision(t);
                  return (
                    <tr key={t.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="py-3.5">
                        <ActionTag type={t.action?.type} />
                      </td>
                      <td className="py-3.5 font-semibold font-mono text-zinc-900">
                        {t.action?.target || "-"}
                      </td>
                      <td className="py-3.5 text-zinc-500">
                        {t.action?.environment || "production"}
                      </td>
                      <td className="py-3.5">
                        {decision ? (
                          <StatusBadge decision={decision} />
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-medium rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200">
                            {t.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-zinc-600 truncate max-w-xs">
                        {t.name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
