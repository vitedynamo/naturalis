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
      // Clear from whichever storage held the bad token
      sessionStorage.removeItem("ni_token");
      sessionStorage.removeItem("ni_user");
      localStorage.removeItem("ni_token");
      localStorage.removeItem("ni_user");
    }
    return Promise.reject(err);
  },
);
