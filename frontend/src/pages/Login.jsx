import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import archonLogo from "../assets/archon_logo.png";

export default function Login({ onOpenLanding }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    setIsSubmitting(true);

    const result = await login(email.trim(), password);

    if (result.success) {
      navigate("/");
    } else {
      setLocalError(result.error || "Failed to log in");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-6 bg-white text-zinc-900">
      <div className="w-full max-w-md border border-zinc-200 rounded-xl bg-white p-8 shadow-sm relative">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 border border-zinc-200 bg-zinc-50/50 rounded-xl flex items-center justify-center p-2.5 mx-auto mb-4 shadow-2xs cursor-pointer hover:border-zinc-400 transition-colors"
            onClick={onOpenLanding}
            title="View Archon Intro"
          >
            <img src={archonLogo} alt="Archon Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wider text-zinc-900">
            ARCHON Governance
          </h1>
          <p className="text-xs font-mono text-zinc-400 mt-1.5">
            Sign in to access the governance console
          </p>
        </div>

        {localError && (
          <div
            className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs"
            role="alert"
          >
            {localError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block font-mono text-xs uppercase text-zinc-700 font-medium mb-2"
            >
              Operator / Approver
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@archon.internal"
              disabled={isSubmitting}
              className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-mono text-xs uppercase text-zinc-700 font-medium mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={isSubmitting}
              className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-zinc-900 text-white rounded-lg font-mono text-xs uppercase font-medium py-3.5 hover:bg-zinc-800 transition-all tracking-wider shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Authenticating Session..." : "Authenticate Session"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-zinc-100 text-center">
          <span className="font-mono text-[10px] text-zinc-400">
          </span>
        </div>
      </div>
    </div>
  );
}
