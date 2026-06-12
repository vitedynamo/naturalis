import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Phone, Lock, ArrowRight, KeyRound, ShieldQuestion, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import { useBranding } from "@/context/BrandingContext";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { logoUrl } = useBranding();
  const [mode, setMode] = useState("questions"); // "questions" or "admin"
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState(1);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/auth/security-questions/${phone}`);
      setQ1(data.question_1);
      setQ2(data.question_2);
      setStep(2);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Could not fetch security questions";
      toast.error(msg);
      if (msg.includes("does not have security questions")) setMode("admin");
    } finally { setLoading(false); }
  };

  const resetWithQuestions = async (e) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-with-questions", {
        phone, answer_1: a1, answer_2: a2, new_password: newPassword,
      });
      toast.success("Password reset successfully — please sign in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally { setLoading(false); }
  };

  const submitAdminReset = async (e) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone)) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { phone, new_password: newPassword, reason });
      toast.success("Reset request submitted. An admin will review shortly.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit request");
    } finally { setLoading(false); }
  };

  return (
    <div className="user-theme min-h-screen flex bg-[color:var(--app-bg)]">
      <div className="hidden lg:flex w-1/2 hero-gradient text-white relative overflow-hidden grain">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-black/30 backdrop-blur flex items-center justify-center overflow-hidden ring-1 ring-white/20">
              <img src={logoUrl} alt="Evoque-Nova" className="w-full h-full object-contain p-0.5" />
            </div>
            <div className="font-display text-3xl font-bold">Evoque<span className="text-white/90">-Nova</span></div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/80">Account recovery</div>
            <h2 className="font-display text-5xl font-semibold tracking-tight mt-3 leading-[1.05]">
              Forgot your<br/>password?
            </h2>
            <p className="mt-4 max-w-md text-white/85 leading-relaxed">
              Recover instantly by answering your security questions. No SMS, no waiting.
            </p>
          </div>
          <div className="text-xs text-white/70">Secure · Self-service · No SMS</div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-xs text-[color:var(--text-secondary)] underline underline-offset-2">← Back to sign in</Link>
            <ThemeToggle />
          </div>
          <div className="mt-3 flex items-center gap-2 text-label"><KeyRound className="w-3.5 h-3.5" /> Reset password</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2 text-[color:var(--text-primary)]">Recover account</h1>

          <div className="mt-5 grid grid-cols-2 gap-2 bg-[color:var(--surface-alt)] p-1 rounded-xl" data-testid="recovery-mode-tabs">
            <button onClick={() => { setMode("questions"); setStep(1); }} data-testid="mode-questions"
              className={`py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "questions" ? "bg-[color:var(--surface)] text-[color:var(--brand)] shadow-sm" : "text-[color:var(--text-secondary)]"}`}>
              <ShieldQuestion className="w-4 h-4 inline-block mr-1" /> Security questions
            </button>
            <button onClick={() => setMode("admin")} data-testid="mode-admin"
              className={`py-2 rounded-lg text-sm font-semibold transition-colors ${mode === "admin" ? "bg-[color:var(--surface)] text-[color:var(--brand)] shadow-sm" : "text-[color:var(--text-secondary)]"}`}>
              <MessageSquare className="w-4 h-4 inline-block mr-1" /> Admin reset
            </button>
          </div>

          {mode === "questions" ? (
            step === 1 ? (
              <form onSubmit={fetchQuestions} className="mt-5 space-y-4" data-testid="forgot-step1">
                <p className="text-sm text-[color:var(--text-secondary)]">Enter your 11-digit phone number to fetch your security questions.</p>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                  <input type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
                    value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="08012345678" data-testid="forgot-phone-input"
                    className="w-full pl-10 pr-3 py-3 input-base font-mono" />
                </div>
                <button type="submit" disabled={loading} data-testid="fetch-questions-btn"
                  className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
                  {loading ? "Looking up…" : (<>Continue <ArrowRight className="w-4 h-4" /></>)}
                </button>
              </form>
            ) : (
              <form onSubmit={resetWithQuestions} className="mt-5 space-y-3" data-testid="forgot-step2">
                <div className="p-3 rounded-lg bg-[color:var(--brand-soft)] text-xs text-[color:var(--text-primary)]">
                  Account: <span className="font-mono font-semibold">{phone}</span>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">{q1}</label>
                <input value={a1} onChange={(e)=>setA1(e.target.value)} required data-testid="answer-1-input"
                  placeholder="Your answer" className="w-full input-base" />
                <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">{q2}</label>
                <input value={a2} onChange={(e)=>setA2(e.target.value)} required data-testid="answer-2-input"
                  placeholder="Your answer" className="w-full input-base" />
                <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">New password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                  <input type="password" required minLength={4} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}
                    data-testid="forgot-newpwd-input" placeholder="At least 4 characters"
                    className="w-full pl-10 pr-3 input-base" />
                </div>
                <button type="submit" disabled={loading} data-testid="reset-questions-btn"
                  className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
                  {loading ? "Resetting…" : "Reset password"}
                </button>
                <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-[color:var(--text-tertiary)] underline underline-offset-2">
                  Use a different phone number
                </button>
              </form>
            )
          ) : (
            <form onSubmit={submitAdminReset} className="mt-5 space-y-3" data-testid="forgot-admin-form">
              <p className="text-sm text-[color:var(--text-secondary)]">
                Submit a request and an admin will verify your identity manually.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Phone number</label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <input type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
                  value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="08012345678" data-testid="forgot-admin-phone"
                  className="w-full pl-10 pr-3 py-3 input-base font-mono" />
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">New password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <input type="password" required minLength={4} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}
                  data-testid="forgot-admin-newpwd" placeholder="At least 4 characters"
                  className="w-full pl-10 pr-3 py-3 input-base" />
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reason / details (optional)</label>
              <textarea rows={3} value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={300}
                data-testid="forgot-admin-reason" placeholder="Briefly describe why you need a reset…"
                className="w-full input-base" />
              <button type="submit" disabled={loading} data-testid="forgot-admin-submit"
                className="w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
                {loading ? "Submitting…" : "Submit request"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
