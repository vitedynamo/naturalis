import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [amount, setAmount] = useState("1000");
  const [method, setMethod] = useState("manual");
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({ min_withdrawal: 1000 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: s }] = await Promise.all([
      api.get("/withdrawals"),
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
      await api.post("/withdrawal/request", { amount: Number(amount), method });
      toast.success("Withdrawal request submitted");
      await refresh();
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Withdrawal failed");
    } finally { setBusy(false); }
  };

  const bankReady = user?.bank_name && user?.account_number && user?.account_name;

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Withdraw</h1>
      <p className="text-sm text-[#4A5D54] mt-1">Minimum withdrawal: <span className="font-semibold">{formatNaira(settings.min_withdrawal)}</span></p>

      {!bankReady && (
        <div className="mt-4 card-soft p-4 border-l-4 border-[#D97736] flex items-center justify-between" data-testid="bank-missing-warn">
          <div className="text-sm">
            <div className="font-semibold text-[#0A1C16]">Add your bank details</div>
            <div className="text-[#4A5D54]">You need to add a bank account before you can withdraw.</div>
          </div>
          <Link to="/profile" className="bg-[#0F4C3A] hover:bg-[#0A3629] text-white px-4 py-2 rounded-lg text-sm font-semibold">Add bank</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6 lg:col-span-2" data-testid="withdraw-form">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Amount (₦)</label>
          <input
            type="number" min={settings.min_withdrawal} max={user?.wallet_balance} value={amount} onChange={(e)=>setAmount(e.target.value)} required
            data-testid="withdraw-amount-input"
            className="w-full mt-2 px-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
          />
          <div className="mt-2 text-xs text-[#8A9C93]">Available: {formatNaira(user?.wallet_balance)}</div>

          <label className="block mt-5 text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Withdrawal method</label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setMethod("manual")} data-testid="method-manual"
              className={`px-4 py-3 rounded-lg border text-left text-sm ${method === "manual" ? "border-[#0F4C3A] bg-[#F3F5F1]" : "border-[#E5E9E4]"}`}>
              <div className="font-semibold">Manual</div>
              <div className="text-xs text-[#4A5D54] mt-0.5">Admin processes payout within 24h.</div>
            </button>
            <button type="button" onClick={() => setMethod("auto")} data-testid="method-auto"
              className={`px-4 py-3 rounded-lg border text-left text-sm ${method === "auto" ? "border-[#0F4C3A] bg-[#F3F5F1]" : "border-[#E5E9E4]"}`}>
              <div className="font-semibold">Automatic</div>
              <div className="text-xs text-[#4A5D54] mt-0.5">Paystack transfer (instant when enabled).</div>
            </button>
          </div>

          <button type="submit" disabled={busy || !bankReady}
            data-testid="withdraw-submit-btn"
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[#0F4C3A] hover:bg-[#0A3629] text-white py-3.5 rounded-lg font-semibold disabled:opacity-60">
            <ArrowUpFromLine className="w-4 h-4" /> {busy ? "Processing…" : "Submit request"}
          </button>
        </form>

        <div className="card-soft p-6">
          <div className="text-label">Bank on file</div>
          {bankReady ? (
            <div className="mt-3 text-sm">
              <div className="text-[#0A1C16] font-semibold">{user.bank_name}</div>
              <div className="font-mono text-[#0A1C16]">{user.account_number}</div>
              <div className="text-[#4A5D54]">{user.account_name}</div>
              <Link to="/profile" className="mt-3 inline-block text-xs text-[#0F4C3A] underline underline-offset-2">Change</Link>
            </div>
          ) : (
            <Link to="/profile" className="mt-3 inline-block text-sm underline">Add bank details</Link>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold mb-3">Recent withdrawals</h2>
        <div className="card-soft overflow-hidden">
          <table className="w-full text-sm" data-testid="withdraw-history-table">
            <thead className="bg-[#F3F5F1] text-[#4A5D54]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Method</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((w) => (
                <tr key={w.id} className="border-t border-[#E5E9E4]">
                  <td className="p-3 font-semibold">{formatNaira(w.amount)}</td>
                  <td className="p-3 text-[#4A5D54] capitalize">{w.method}</td>
                  <td className="p-3">
                    <span className={`pill ${w.status === "paid" || w.status === "approved" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status}</span>
                  </td>
                  <td className="p-3 text-[#4A5D54]">{formatDate(w.created_at)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-[#8A9C93]">No withdrawals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </UserLayout>
  );
}
