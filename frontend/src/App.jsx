import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import TaskConsole from "./pages/TaskConsole";
import AuditLog from "./pages/AuditLog";
import PolicyManager from "./pages/PolicyManager";
import DatabaseViewer from "./pages/DatabaseViewer";
import archonLogo from "./assets/archon_logo.png";

function LandingOverlay({ onClose }) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 150);
    const t2 = setTimeout(() => setStep(2), 450);
    const t3 = setTimeout(() => setStep(3), 750);
    const t4 = setTimeout(() => setStep(4), 1050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  function handleEnter() {
    setExiting(true);
    setTimeout(() => {
      onClose();
    }, 700);
  }

  return (
    <div
      className={`fixed inset-0 z-50 bg-white flex flex-col items-center justify-center grid-bg transition-opacity duration-700 ${exiting ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
    >
      <div className="max-w-4xl mx-auto px-6 text-center select-none">
        {/* Logo 'A' + Fading RCHON */}
        <div className="flex items-center justify-center text-7xl sm:text-9xl md:text-[11rem] font-normal tracking-tight mb-6">
          {/* First Letter 'A' using archon_logo.png */}
          <div
            className={`transition-all duration-1000 transform flex items-center justify-center -translate-y-2 sm:-translate-y-3 md:-translate-y-3.5 ${step >= 1 ? "opacity-100 -translate-y-2 sm:-translate-y-3 md:-translate-y-7" : "opacity-0 translate-y-5"
              }`}
          >
            <img
              src={archonLogo}
              alt="Archon Logo"
              className="h-[1.14em] sm:h-[1.2em] md:h-[1.25em] w-auto inline-block align-middle object-contain -mr-3 sm:-mr-5 md:-mr-8 select-none"
            />
          </div>
          {/* Remaining RCHON */}
          <span
            className={`serif-title font-light tracking-normal text-zinc-900 transition-opacity duration-1000 ${step >= 2 ? "opacity-100" : "opacity-0"
              }`}
          >
            RCHON
          </span>
        </div>

        {/* Subtitle */}
        <p
          className={`font-mono text-xs sm:text-sm uppercase tracking-[0.3em] text-zinc-400 transition-opacity duration-1000 mb-12 ${step >= 3 ? "opacity-100" : "opacity-0"
            }`}
        >
          the Agentic governor
        </p>

        {/* Enter Console Button */}
        <div
          className={`transition-opacity duration-1000 ${step >= 4 ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
        >
          <button
            onClick={handleEnter}
            className="group inline-flex items-center space-x-4 bg-zinc-900 text-white rounded-full px-8 py-4 font-mono text-xs uppercase tracking-widest font-medium hover:bg-zinc-800 transition-all shadow-sm cursor-pointer"
          >
            <span>Enter Governance Console</span>
            <svg
              className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function Layout({ children, onOpenLanding }) {
  const { logout, role } = useAuth();

  const linkClass = ({ isActive }) =>
    `px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${isActive
      ? "text-zinc-900 border-b-2 border-zinc-900 font-medium"
      : "text-zinc-500 hover:text-zinc-900 border-b-2 border-transparent"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-900 grid-bg selection:bg-zinc-900 selection:text-white">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <NavLink
              to="/"
              className="flex items-center space-x-2.5 group"
              title="Archon Governance Console"
            >
              <img
                src={archonLogo}
                alt="A"
                className="w-4 h-5 object-contain transform group-hover:scale-105 transition-transform"
              />
              <span className="font-mono tracking-wider text-xs font-bold uppercase text-zinc-900">
                ARCHON
              </span>
            </NavLink>
            <nav className="flex items-center space-x-1 font-mono text-xs uppercase tracking-wider">
              <NavLink to="/" className={linkClass} end>
                Tasks
              </NavLink>
              <NavLink to="/database" className={linkClass}>
                Database
              </NavLink>
              <NavLink to="/audit" className={linkClass}>
                Audit Log
              </NavLink>
              <NavLink to="/policies" className={linkClass}>
                Policies
              </NavLink>
            </nav>
          </div>

          {/* User Session with Top Right Logo Circle */}
          <div className="flex items-center space-x-3.5">
            <div className="flex items-center space-x-2 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-1.5 font-mono text-xs">
              <span className="text-zinc-400">Role:</span>
              <span className="text-zinc-900 uppercase font-medium">{role}</span>
            </div>

            <button
              onClick={logout}
              className="font-mono text-xs uppercase tracking-wider text-zinc-700 hover:text-zinc-900 transition-colors border border-zinc-200 px-3 py-1.5 bg-white rounded-md shadow-2xs cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-grow max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
      <footer className="border-t border-zinc-200 py-8 mt-auto bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-400 space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-900"></span>
            <span className="text-zinc-900 font-medium">ARCHON // The Agentic Governor for Infrastructure</span>
          </div>
          <div className="flex space-x-6 uppercase tracking-wider text-zinc-600 font-medium text-[11px]">
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem("archon_landing_seen");
  });

  function handleCloseLanding() {
    sessionStorage.setItem("archon_landing_seen", "true");
    setShowLanding(false);
  }

  function handleOpenLanding() {
    setShowLanding(true);
  }

  return (
    <>
      {showLanding && <LandingOverlay onClose={handleCloseLanding} />}

      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <Login onOpenLanding={handleOpenLanding} />}
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout onOpenLanding={handleOpenLanding}>
                  <TaskConsole />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/database"
            element={
              <ProtectedRoute>
                <Layout onOpenLanding={handleOpenLanding}>
                  <DatabaseViewer />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <Layout onOpenLanding={handleOpenLanding}>
                  <AuditLog />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies"
            element={
              <ProtectedRoute>
                <Layout onOpenLanding={handleOpenLanding}>
                  <PolicyManager />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
