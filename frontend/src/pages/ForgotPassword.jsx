import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Phone, Lock, ArrowRight, KeyRound, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
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
      await api.post("/auth/forgot-password", {
        phone, new_password: newPassword, reason,
      });
      toast.success("Reset request submitted. An admin will review shortly.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit request");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#F9FAF8]">
      <div className="hidden lg:flex w-1/2 bg-[#0A1C16] text-white relative overflow-hidden grain-overlay">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="font-display text-3xl font-extrabold">
            Naija<span className="text-[#00D084]">Invest</span>
          </div>
          <div>
            <div className="text-label text-white/70">Account recovery</div>
            <h2 className="font-display text-5xl font-black tracking-tight mt-3 leading-[1.05]">
              Forgot your<br/>password?
            </h2>
            <p className="mt-4 max-w-md text-white/70 leading-relaxed">
              Submit a reset request below. Our admin team will verify your identity and approve it — usually within a few hours.
            </p>
          </div>
          <div className="text-xs text-white/50">Secure · Verified · No SMS required</div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 py-8">
        <form onSubmit={submit} className="w-full max-w-md animate-fade-up" data-testid="forgot-form">
          <Link to="/login" className="text-xs text-[#4A5D54] underline underline-offset-2">← Back to sign in</Link>
          <div className="mt-3 flex items-center gap-2 text-label"><KeyRound className="w-3.5 h-3.5" /> Reset password</div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">Request a reset</h1>
          <p className="text-[#4A5D54] mt-2 text-sm">
            Enter your phone, choose a new password, and tell us why. Admin will approve and notify you.
          </p>

          <label className="block mt-6 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Phone number (11 digits)</label>
          <div className="relative mt-2">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input
              type="tel" required inputMode="numeric" pattern="\d{11}" maxLength={11}
              value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="08012345678"
              data-testid="forgot-phone-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] font-mono"
            />
          </div>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">New password</label>
          <div className="relative mt-2">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input
              type="password" required minLength={4} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)}
              placeholder="At least 4 characters"
              data-testid="forgot-newpwd-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
            />
          </div>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Reason / details <span className="lowercase text-[#8A9C93]">(optional)</span></label>
          <div className="relative mt-2">
            <MessageSquare className="w-4 h-4 absolute left-3 top-3 text-[#8A9C93]" />
            <textarea
              rows={3} value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={300}
              placeholder="Briefly describe why you need a reset…"
              data-testid="forgot-reason-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
            />
          </div>

          <button
            type="submit" disabled={loading}
            data-testid="forgot-submit-btn"
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[#0F4C3A] hover:bg-[#0A3629] text-white py-3.5 rounded-xl font-semibold disabled:opacity-60"
          >
            {loading ? "Submitting…" : (<>Submit request <ArrowRight className="w-4 h-4" /></>)}
          </button>

          <p className="text-xs text-[#8A9C93] mt-4 text-center">
            We do not send SMS. An admin will review your request and approve it manually.
          </p>
        </form>
      </div>
    </div>
  );
}
