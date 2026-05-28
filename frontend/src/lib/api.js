import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

// Tokens are stored in EITHER sessionStorage (per-tab, used for admin "Login as user"
// impersonation tabs) OR localStorage (persistent, the normal case). sessionStorage
// wins so an impersonation tab can never accidentally use the admin's localStorage token.
export const getStoredToken = () =>
  sessionStorage.getItem("ni_token") || localStorage.getItem("ni_token");

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // Only clear the user's stored token when the 401 came from an endpoint they
      // *should* have access to. A logged-in regular user hitting an /admin/* endpoint
      // legitimately gets 401 — that must NOT log them out of their user session.
      const url = err?.config?.url || "";
      const isAdminEndpoint = url.startsWith("/admin") || url.includes("/api/admin");
      if (!isAdminEndpoint) {
        sessionStorage.removeItem("ni_token");
        sessionStorage.removeItem("ni_user");
        localStorage.removeItem("ni_token");
        localStorage.removeItem("ni_user");
      }
    }
    return Promise.reject(err);
  },
);
