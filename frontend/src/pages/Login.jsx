import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Phone, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";

export default function Login() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Admin "Login as user" — token passed via ?_token=<JWT>
  // Strategy: store the impersonation session in sessionStorage (per-tab) so the
  // admin's localStorage (in the original tab + any other tab) is untouched.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("_token");
    if (!t) return;
    (async () => {
      try {
        // Use raw axios (bypass interceptor) to verify the token belongs to a user
        const { data } = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (data.is_admin) { toast.error("Cannot impersonate admin"); return; }
        // Scope to this tab only — DO NOT touch localStorage (admin session lives there)
        setSession(t, data, "session");
        toast.success(`Impersonating ${data.name}`);
        // Strip the token from the URL so refreshing the page is safe
        window.history.replaceState({}, "", "/dashboard");
        navigate("/dashboard", { replace: true });
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Impersonation token invalid or expired");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { phone, password });
      if (data.user.is_admin) {
        toast.error("Invalid credentials");
        setLoading(false);
        return;
      }
      setSession(data.token, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-[color:var(--app-bg)]">
      <div className="hidden lg:flex w-1/2 hero-gradient text-white relative overflow-hidden grain">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="font-display text-3xl font-extrabold">
            Naija<span className="text-white/90">Invest</span>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/80">Daily returns</div>
            <h2 className="font-display text-5xl font-black tracking-tight mt-3 leading-[1.05]">
              Grow your money,<br/>every <span className="text-white">24 hours</span>.
            </h2>
            <p className="mt-4 max-w-md text-white/85 leading-relaxed">
              Pick a plan, invest, and watch profits land in your wallet every day. Built for Nigerians, paid in Naira.
            </p>
          </div>
          <div className="text-xs text-white/70">Secure · Transparent · Naira-native</div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-md animate-fade-up" data-testid="login-form">
          <div className="flex items-center justify-between">
            <div className="text-label">Sign in</div>
            <ThemeToggle />
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2 text-[color:var(--text-primary)]">Welcome back</h1>
          <p className="text-[color:var(--text-secondary)] mt-2 text-sm">Use your phone and password to access your wallet.</p>

          <label className="block mt-8 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number (11 digits)</label>
          <div className="relative mt-2">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input
              type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
              value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="08012345678"
              data-testid="login-phone-input"
              className="w-full pl-10 pr-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)] font-mono"
            />
          </div>

          <div className="flex items-center justify-between mt-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Password</label>
            <Link to="/forgot-password" data-testid="forgot-password-link" className="text-xs font-semibold text-[color:var(--brand)] hover:underline underline-offset-2">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
            <input
              type="password" required value={password} onChange={(e)=>setPassword(e.target.value)}
              placeholder="••••••••"
              data-testid="login-password-input"
              className="w-full pl-10 pr-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]"
            />
          </div>

          <button
            type="submit" disabled={loading}
            data-testid="login-submit-btn"
            className="mt-7 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white py-3.5 rounded-xl font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? "Signing in…" : (<>Sign in <ArrowRight className="w-4 h-4" /></>)}
          </button>

          <p className="text-sm text-[color:var(--text-secondary)] mt-6 text-center">
            New here?{" "}
            <Link to="/register" data-testid="go-register-link" className="text-[color:var(--brand)] font-semibold underline underline-offset-2">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
