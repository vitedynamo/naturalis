import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

/**
 * Storage strategy — three independent slots so admin, user, and impersonation sessions
 * can all coexist without overwriting each other:
 *
 *   localStorage   ni_admin_token / ni_admin_user   → admin session
 *   localStorage   ni_token       / ni_user         → regular user session
 *   sessionStorage ni_token       / ni_user         → impersonation tab (per-tab)
 *
 * The api.js interceptor picks the right token by URL prefix (admin endpoints use
 * ni_admin_token; everything else prefers session > user; falls back to admin token
 * so the admin can still browse user pages with their admin privileges).
 */
function readJSON(key, store) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isAdminRoute(pathname = window.location.pathname) {
  return pathname.startsWith("/admin");
}

function hydrateUser() {
  // Pick the user object that matches the current route surface.
  if (isAdminRoute()) {
    return readJSON("ni_admin_user", localStorage) || readJSON("ni_user", sessionStorage) || readJSON("ni_user", localStorage);
  }
  return readJSON("ni_user", sessionStorage) || readJSON("ni_user", localStorage) || readJSON("ni_admin_user", localStorage);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => hydrateUser());
  const [loading, setLoading] = useState(true);

  // scope: "admin"   → ni_admin_token / ni_admin_user in localStorage
  //        "session" → ni_token / ni_user in sessionStorage (impersonation)
  //        "local"   → ni_token / ni_user in localStorage (regular user, default)
  const setSession = useCallback((token, u, scope = "local") => {
    let store = localStorage, tokenKey = "ni_token", userKey = "ni_user";
    if (scope === "admin") { tokenKey = "ni_admin_token"; userKey = "ni_admin_user"; }
    else if (scope === "session") { store = sessionStorage; }
    if (token) store.setItem(tokenKey, token);
    if (u) {
      store.setItem(userKey, JSON.stringify(u));
      setUser(u);
    }
  }, []);

  const logout = useCallback(() => {
    // Clear only the session matching the current route — preserves the other session.
    if (isAdminRoute()) {
      localStorage.removeItem("ni_admin_token");
      localStorage.removeItem("ni_admin_user");
    } else {
      sessionStorage.removeItem("ni_token");
      sessionStorage.removeItem("ni_user");
      localStorage.removeItem("ni_token");
      localStorage.removeItem("ni_user");
    }
    setUser(hydrateUser());
  }, []);

  const refresh = useCallback(async () => {
    // Pick which token to validate based on the current surface.
    const onAdmin = isAdminRoute();
    const token = onAdmin
      ? (localStorage.getItem("ni_admin_token")
         || sessionStorage.getItem("ni_token")
         || localStorage.getItem("ni_token"))
      : (sessionStorage.getItem("ni_token")
         || localStorage.getItem("ni_token")
         || localStorage.getItem("ni_admin_token"));
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      const storeKey = onAdmin && data?.is_admin ? "ni_admin_user" : "ni_user";
      const store = onAdmin && data?.is_admin
        ? localStorage
        : (sessionStorage.getItem("ni_token") ? sessionStorage : localStorage);
      store.setItem(storeKey, JSON.stringify(data));
      setUser(data);
    } catch {
      // Don't auto-logout on transient 401 here — interceptor handles non-admin 401s.
      setUser(hydrateUser());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-hydrate the active user whenever the route surface flips (admin ↔ user).
  useEffect(() => {
    const onNav = () => setUser(hydrateUser());
    window.addEventListener("popstate", onNav);
    // Also re-run on every pushState (react-router uses history.pushState)
    const origPush = window.history.pushState;
    window.history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      onNav();
      return r;
    };
    return () => {
      window.removeEventListener("popstate", onNav);
      window.history.pushState = origPush;
    };
  }, []);

  // Mobile keyboard handling — hide bottom nav while an input/textarea is focused
  useEffect(() => {
    const isField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onFocus = (e) => {
      if (isField(e.target)) {
        document.body.classList.add("kb-open");
        setTimeout(() => {
          try { e.target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
        }, 80);
      }
    };
    const onBlur = (e) => {
      if (isField(e.target)) {
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
