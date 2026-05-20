import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowDownToLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Deposit() {
  const { refresh } = useAuth();
  const [amount, setAmount] = useState("3000");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ min_deposit: 3000, payment_mode: "mock" });

  const load = async () => {
    const [{ data: h }, { data: s }] = await Promise.all([
      api.get("/deposits"),
      api.get("/settings/public"),
    ]);
    setHistory(h);
    setSettings(s);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const callback_url = `${window.location.origin}/payment/callback`;
      const { data } = await api.post("/deposit/initialize", { amount: Number(amount), callback_url });
      if (data.mode === "live") {
        window.location.href = data.authorization_url;
        return;
      }
      // Mock: verify immediately
      const { data: v } = await api.get(`/deposit/verify/${data.reference}`);
      if (v.status === "success") {
        toast.success(`Deposit of ${formatNaira(amount)} successful`);
        await refresh();
        await load();
      } else {
        toast.error("Deposit failed");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Deposit error");
    } finally { setBusy(false); }
  };

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Deposit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Top up your wallet. Minimum: <span className="font-semibold">{formatNaira(settings.min_deposit)}</span></p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6 lg:col-span-2" data-testid="deposit-form">
          <div className="flex items-center gap-2 pill pill-neutral w-fit">
            <ShieldCheck className="w-3.5 h-3.5" /> {settings.payment_mode === "live" ? "Paystack secure checkout" : "Test / Mock mode"}
          </div>
          <label className="block mt-5 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Amount (₦)</label>
          <input
            type="number" min={settings.min_deposit} value={amount} onChange={(e)=>setAmount(e.target.value)} required
            data-testid="deposit-amount-input"
            className="w-full mt-2 px-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]"
          />
          <div className="flex gap-2 mt-3 flex-wrap">
            {[3000, 5000, 10000, 20000, 50000].map(v => (
              <button type="button" key={v} onClick={() => setAmount(String(v))}
                data-testid={`quick-amount-${v}`}
                className="px-3 py-1.5 rounded-full text-sm border border-[color:var(--border-default)] hover:bg-[color:var(--surface-alt)]">
                {formatNaira(v, { compact: true })}
              </button>
            ))}
          </div>
          <button type="submit" disabled={busy}
            data-testid="deposit-submit-btn"
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white py-3.5 rounded-lg font-semibold disabled:opacity-60">
            <ArrowDownToLine className="w-4 h-4" /> {busy ? "Processing…" : "Proceed to pay"}
          </button>
          {settings.payment_mode !== "live" && (
            <p className="mt-3 text-xs text-[color:var(--text-tertiary)]">Mock mode: deposits are credited instantly for testing. Configure Paystack keys in admin → settings.</p>
          )}
        </form>

        <div className="card-soft p-6">
          <div className="text-label">How it works</div>
          <ol className="mt-3 text-sm text-[color:var(--text-secondary)] space-y-3">
            <li>1. Enter the amount you want to deposit.</li>
            <li>2. Get redirected to Paystack to pay securely with card, bank or USSD.</li>
            <li>3. Your wallet is credited automatically once payment is confirmed.</li>
          </ol>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold mb-3">Recent deposits</h2>
        <div className="card-soft overflow-hidden">
          <table className="w-full text-sm" data-testid="deposit-history-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3 font-mono text-xs text-[color:var(--text-primary)]">{d.reference}</td>
                  <td className="p-3 font-semibold">{formatNaira(d.amount)}</td>
                  <td className="p-3">
                    <span className={`pill ${d.status === "success" ? "pill-success" : d.status === "failed" ? "pill-error" : "pill-warn"}`}>{d.status}</span>
                  </td>
                  <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(d.created_at)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-[color:var(--text-tertiary)]">No deposits yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </UserLayout>
  );
}
