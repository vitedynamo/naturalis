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

  // Mobile keyboard handling — hide bottom nav while an input/textarea is focused
  useEffect(() => {
    const isField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onFocus = (e) => {
      if (isField(e.target)) {
        document.body.classList.add("kb-open");
        // Scroll the focused element into view above the (virtual) keyboard
        setTimeout(() => {
          try { e.target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
        }, 80);
      }
    };
    const onBlur = (e) => {
      if (isField(e.target)) {
        // Slight delay to avoid flicker when tabbing between fields
        setTimeout(() => {
          const a = document.activeElement;
          if (!isField(a)) document.body.classList.remove("kb-open");
        }, 50);
      }
    };
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", onBlur, true);
      document.body.classList.remove("kb-open");
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
