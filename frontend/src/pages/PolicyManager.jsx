import React, { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function PolicyManager() {
  const { role } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  const isApprover = role === "approver";

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/policies");
      setPolicies(data.policies || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(policy) {
    if (!isApprover) return;
    setSaving(policy.id);
    setError(null);
    try {
      const data = await apiFetch(`/api/policies/${policy.id}`, {
        method: "PUT",
        body: { isActive: !policy.isActive },
      });
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? data.policy : p))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function updateDescription(policy, newDesc) {
    if (!isApprover) return;
    setSaving(policy.id);
    setError(null);
    try {
      const data = await apiFetch(`/api/policies/${policy.id}`, {
        method: "PUT",
        body: { description: newDesc },
      });
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? data.policy : p))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  function getEffect(policy) {
    const rules = policy.rules || [];
    return rules[0]?.effect || "-";
  }

  function getThreshold(policy) {
    const rules = policy.rules || [];
    const match = rules[0]?.match || {};
    if (match.self_reported_rows_affected?.gt) {
      return `rows_affected > ${match.self_reported_rows_affected.gt.toLocaleString()} rows`;
    }
    if (match.backup_age_hours?.gt) {
      return `backup_age_hours > ${match.backup_age_hours.gt}h`;
    }
    if (match.target?.not_in) {
      return `allowed_targets: ${match.target.not_in.join(", ")}`;
    }
    if (match.environment) {
      return `environment == '${match.environment}'`;
    }
    if (match.condition === null) {
      return "no_where_clause == true";
    }
    return "-";
  }

  if (!isApprover) {
    return (
      <div className="w-full space-y-6">
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 font-mono text-xs text-amber-900 font-medium flex items-center justify-between shadow-2xs">
          <span>// NOTICE: You are logged in as OPERATOR. Policy modifications require an APPROVER role.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-200 gap-4">
        <div>
          <span className="font-mono text-xs uppercase text-zinc-400 block mb-1">
            Deterministic Guardrails
          </span>
          <h2 className="serif-title text-4xl font-normal text-zinc-900">
            Policy Enforcement Engine
          </h2>
        </div>
      </div>

      {error && (
        <div className="p-4 font-mono text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl shadow-2xs">
          {error}
        </div>
      )}

      {/* Table Card */}
      <div className="border border-zinc-200 bg-white rounded-xl p-6 shadow-xs">
        {loading ? (
          <p className="font-mono text-xs text-zinc-400 py-6 text-center">Loading policies...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 font-medium">
                  <th className="pb-3.5 uppercase tracking-wider">Rule Identifier</th>
                  <th className="pb-3.5 uppercase tracking-wider">Effect</th>
                  <th className="pb-3.5 uppercase tracking-wider">Threshold Expression</th>
                  <th className="pb-3.5 uppercase tracking-wider">Description</th>
                  <th className="pb-3.5 uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {policies.map((p) => {
                  const effect = getEffect(p);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="py-4 font-bold font-mono text-zinc-900">
                        {p.name}
                      </td>
                      <td className="py-4">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                            effect === "BLOCK"
                              ? "text-rose-700 bg-rose-50 border-rose-200"
                              : effect === "REQUIRE_APPROVAL"
                              ? "text-amber-700 bg-amber-50 border-amber-200"
                              : "text-zinc-700 bg-zinc-100 border-zinc-200"
                          }`}
                        >
                          {effect}
                        </span>
                      </td>
                      <td className="py-4 text-zinc-600 font-mono font-medium">
                        {getThreshold(p)}
                      </td>
                      <td className="py-4">
                        <input
                          type="text"
                          defaultValue={p.description || ""}
                          onBlur={(e) => {
                            if (e.target.value !== p.description) {
                              updateDescription(p, e.target.value);
                            }
                          }}
                          className="w-full font-mono text-xs text-zinc-700 bg-transparent border-0 border-b border-transparent hover:border-zinc-300 focus:border-zinc-900 focus:outline-none px-0 py-0.5 transition-colors"
                        />
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => toggleActive(p)}
                          disabled={saving === p.id}
                          className="text-zinc-600 hover:text-zinc-900 font-semibold uppercase tracking-wider cursor-pointer"
                        >
                          {p.isActive ? (
                            <span className="text-emerald-700 font-bold">Active</span>
                          ) : (
                            <span className="text-zinc-400 font-bold">Disabled</span>
                          )}
                        </button>
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
