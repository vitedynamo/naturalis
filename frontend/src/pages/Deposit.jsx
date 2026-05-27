import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowDownToLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Deposit() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
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
      if (data.type === "bank_transfer") {
        // Marasoft dynamic account — navigate to dedicated transfer page
        navigate(`/deposit/transfer/${data.reference}`);
        return;
      }
      if (data.mode === "live" && data.authorization_url) {
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

  // Quickly resume a still-pending bank transfer
  const pendingBankTransfer = history.find((d) => d.status === "pending" && d.method === "marasoft" && d.account_number);

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Deposit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Top up your wallet. Minimum: <span className="font-semibold">{formatNaira(settings.min_deposit)}</span></p>

      {pendingBankTransfer && (
        <button onClick={() => navigate(`/deposit/transfer/${pendingBankTransfer.reference}`)}
          data-testid="deposit-resume-pending"
          className="mt-4 w-full text-left card-soft p-4 border-l-4 border-[color:var(--warning)] hover:bg-[color:var(--surface-alt)] transition-colors">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--warning)]">Pending transfer</div>
          <div className="mt-1 text-sm text-[color:var(--text-primary)]">
            You have a pending bank transfer for <span className="font-bold">{formatNaira(pendingBankTransfer.amount)}</span>. Tap to view bank details and complete the payment.
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <form onSubmit={submit} className="card-soft p-6 lg:col-span-2" data-testid="deposit-form">
          <div className="flex items-center gap-2 pill pill-neutral w-fit">
            <ShieldCheck className="w-3.5 h-3.5" /> {settings.payment_mode === "live" ? "Secure checkout" : "Test / Mock mode"}
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
            <p className="mt-3 text-xs text-[color:var(--text-tertiary)]">Mock mode: deposits are credited instantly for testing.</p>
          )}
        </form>

        <div className="card-soft p-6">
          <div className="text-label">How it works</div>
          <ol className="mt-3 text-sm text-[color:var(--text-secondary)] space-y-3">
            <li>1. Enter the amount you want to deposit.</li>
            <li>2. You'll get a unique bank account to transfer to on the next page.</li>
            <li>3. Your wallet is credited automatically once payment is confirmed.</li>
          </ol>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold text-[color:var(--text-primary)]">Recent deposits</h2>
          {history.length > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">{history.length} total</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="deposit-history-list">
          {history.map((d) => {
            const tone = d.status === "success" ? "success" : d.status === "failed" ? "error" : "warn";
            return (
              <div key={d.id} className="card-soft p-4 relative overflow-hidden" data-testid={`dep-${d.id}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                  tone === "success" ? "bg-[color:var(--success)]"
                  : tone === "error" ? "bg-[color:var(--error)]"
                  : "bg-[color:var(--warning)]"
                }`} />
                <div className="pl-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Amount</div>
                      <div className="font-display font-bold text-2xl text-[color:var(--text-primary)] leading-tight mt-0.5">{formatNaira(d.amount)}</div>
                    </div>
                    <span className={`pill ${tone === "success" ? "pill-success" : tone === "error" ? "pill-error" : "pill-warn"}`}>{d.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-[color:var(--text-tertiary)] truncate" title={d.reference}>{d.reference}</span>
                    <span className="shrink-0 text-[color:var(--text-secondary)]">{formatDate(d.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {history.length === 0 && (
            <div className="col-span-full card-soft p-8 text-center text-[color:var(--text-tertiary)]">No deposits yet. Your top-ups will appear here.</div>
          )}
        </div>
      </div>
    </UserLayout>
  );
}
