import React, { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Gift } from "lucide-react";
import { toast } from "sonner";
import { formatNaira } from "@/lib/format";

export default function Coupons() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/coupons/redeem", { code });
      toast.success(`Coupon credited: ${formatNaira(data.amount)}`);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not redeem coupon");
    } finally { setBusy(false); }
  };

  return (
    <UserLayout>
      <div className="text-label">Bonuses</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Coupons</h1>
      <p className="text-sm text-[#4A5D54] mt-1">Redeem a promo code to credit your wallet instantly.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6" data-testid="coupon-form">
          <div className="flex items-center gap-2 text-label"><Ticket className="w-3.5 h-3.5" /> Redeem code</div>
          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Coupon code</label>
          <input value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} required
            data-testid="coupon-input"
            placeholder="e.g. NAIJA2026"
            className="w-full mt-2 px-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] uppercase font-mono" />
          <button type="submit" disabled={busy} data-testid="redeem-btn"
            className="mt-5 w-full bg-[#0F4C3A] hover:bg-[#0A3629] text-white py-3 rounded-lg font-semibold disabled:opacity-60">
            {busy ? "Redeeming…" : "Redeem coupon"}
          </button>
        </form>
        <div className="card-soft p-6 bg-gradient-to-br from-[#F3F5F1] to-white">
          <Gift className="w-8 h-8 text-[#D4AF37]" />
          <div className="mt-3 font-display text-xl font-semibold">Earn more, easily</div>
          <p className="text-sm text-[#4A5D54] mt-2">Codes are released during promotions on our social channels. Each coupon can be redeemed once per account.</p>
          <div className="mt-4 text-sm">Current wallet: <span className="font-semibold">{formatNaira(user?.wallet_balance)}</span></div>
        </div>
      </div>
    </UserLayout>
  );
}
