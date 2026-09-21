import React, { createContext, useContext, useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (import.meta.env.MODE === "production" ? "" : "http://localhost:4000");

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialize user state from localStorage if available
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem("archon_token");
    const savedRole = localStorage.getItem("archon_role");
    if (savedToken && savedRole) {
      return { token: savedToken, role: savedRole };
    }
    return null;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Login function: calls backend /api/auth/login, stores JWT and role
  const login = async (email, password) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      const userData = {
        token: data.token,
        role: data.role,
      };

      // Persist to localStorage
      localStorage.setItem("archon_token", data.token);
      localStorage.setItem("archon_role", data.role);

      setUser(userData);
      return { success: true, user: userData };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Logout function: clears storage and state
  const logout = () => {
    localStorage.removeItem("archon_token");
    localStorage.removeItem("archon_role");
    setUser(null);
    setError(null);
  };

  const value = {
    user,
    role: user?.role || null,
    token: user?.token || null,
    isAuthenticated: !!user?.token,
    loading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook for consuming auth state
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
