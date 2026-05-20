import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { User, Phone, Lock, Gift, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [sp] = useSearchParams();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ref = sp.get("ref");
    if (ref) setReferralCode(ref);
  }, [sp]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { phone, name, password, referral_code: referralCode || null };
      const { data } = await api.post("/auth/register", payload);
      setSession(data.token, data.user);
      toast.success("Welcome! ₦750 welcome bonus credited 🎉");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#F9FAF8]">
      <div className="hidden lg:flex w-1/2 bg-[#0A1C16] text-white relative overflow-hidden grain-overlay">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="font-display text-3xl font-extrabold">Naija<span className="text-[#00D084]">Invest</span></div>
          <div>
            <div className="text-label text-white/70">Get started</div>
            <h2 className="font-display text-5xl font-black tracking-tight mt-3 leading-[1.05]">
              Earn while<br/>you sleep.
            </h2>
            <p className="mt-4 max-w-md text-white/70 leading-relaxed">
              Join thousands of Nigerians earning daily passive income. Get a <span className="text-[#00D084] font-semibold">₦750 welcome bonus</span> just for signing up.
            </p>
          </div>
          <div className="text-xs text-white/50">3-Generation Referral · Daily Payouts · Naira-native</div>
        </div>
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-md animate-fade-up" data-testid="register-form">
          <div className="text-label">Create account</div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight mt-2">Get started</h1>

          <label className="block mt-7 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Full name</label>
          <div className="relative mt-2">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Adaeze Okafor"
              data-testid="register-name-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]" />
          </div>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Phone number</label>
          <div className="relative mt-2">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input type="tel" required value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="0801 234 5678"
              data-testid="register-phone-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]" />
          </div>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Password</label>
          <div className="relative mt-2">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input type="password" required minLength={4} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="At least 4 characters"
              data-testid="register-password-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]" />
          </div>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Referral code <span className="lowercase text-[#8A9C93]">(optional)</span></label>
          <div className="relative mt-2">
            <Gift className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9C93]" />
            <input value={referralCode} onChange={(e)=>setReferralCode(e.target.value.toUpperCase())} placeholder="e.g. NAIJA01"
              data-testid="register-referral-input"
              className="w-full pl-10 pr-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] uppercase" />
          </div>

          <button type="submit" disabled={loading}
            data-testid="register-submit-btn"
            className="mt-7 w-full flex items-center justify-center gap-2 bg-[#0F4C3A] hover:bg-[#0A3629] text-white py-3.5 rounded-lg font-semibold transition-colors disabled:opacity-60">
            {loading ? "Creating…" : (<>Create account <ArrowRight className="w-4 h-4" /></>)}
          </button>

          <p className="text-sm text-[#4A5D54] mt-6 text-center">
            Already have an account?{" "}
            <Link to="/login" data-testid="go-login-link" className="text-[#0F4C3A] font-semibold underline underline-offset-2">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
