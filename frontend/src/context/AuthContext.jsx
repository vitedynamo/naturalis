import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("ni_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((token, u) => {
    if (token) localStorage.setItem("ni_token", token);
    if (u) {
      localStorage.setItem("ni_user", JSON.stringify(u));
      setUser(u);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ni_token");
    localStorage.removeItem("ni_user");
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("ni_token");
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      localStorage.setItem("ni_user", JSON.stringify(data));
      setUser(data);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, setSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
