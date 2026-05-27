import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowDownToLine, ShieldCheck, Copy, CheckCircle2, RefreshCw, Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

function CopyLine({ label, value, big, testid }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <button onClick={copy} data-testid={testid}
      className="w-full text-left p-4 rounded-xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--brand-soft)] transition-colors group">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className={`font-mono ${big ? "font-display font-extrabold text-2xl tabular-nums" : "font-semibold text-sm"} text-[color:var(--text-primary)] truncate`}>{value || "—"}</div>
        {copied ? <CheckCircle2 className="w-4 h-4 text-[color:var(--success)] shrink-0" /> : <Copy className="w-4 h-4 text-[color:var(--text-tertiary)] group-hover:text-[color:var(--brand)] shrink-0" />}
      </div>
    </button>
  );
}

export default function Deposit() {
  const { refresh } = useAuth();
  const [amount, setAmount] = useState("3000");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ min_deposit: 3000, payment_mode: "mock" });
  const [pending, setPending] = useState(null); // active bank-transfer instructions
  const [verifying, setVerifying] = useState(false);

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
        // Marasoft reserved account — show transfer instructions inline
        setPending(data);
        toast.info("Bank transfer details ready");
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

  const verifyNow = async () => {
    if (!pending) return;
    setVerifying(true);
    try {
      const { data } = await api.get(`/deposit/verify/${pending.reference}`);
      if (data.status === "success") {
        toast.success(`Deposit of ${formatNaira(pending.amount)} credited!`);
        setPending(null);
        await refresh();
        await load();
      } else {
        toast.info("Payment not yet received. Try again in a moment after you transfer.");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Verification failed");
    } finally { setVerifying(false); }
  };

  const cancelPending = () => { setPending(null); };

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Deposit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Top up your wallet. Minimum: <span className="font-semibold">{formatNaira(settings.min_deposit)}</span></p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {pending ? (
          <div className="card-soft p-6 lg:col-span-2 relative" data-testid="deposit-bank-instructions">
            <button onClick={cancelPending} data-testid="deposit-cancel-pending"
              className="absolute top-4 right-4 inline-flex items-center gap-1 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]">
              <ArrowLeft className="w-3 h-3" /> Start over
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent-main)] text-white flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-label">Bank transfer</div>
                <div className="font-display font-bold text-lg text-[color:var(--text-primary)]">Send exactly {formatNaira(pending.amount)}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <CopyLine label="Bank" value={pending.bank_name} testid="dep-bank" />
              <CopyLine label="Account name" value={pending.account_name} testid="dep-acct-name" />
              <CopyLine label="Account number" value={pending.account_number} big testid="dep-acct-no" />
              <CopyLine label="Amount" value={formatNaira(pending.amount)} big testid="dep-amount" />
            </div>
            <div className="mt-5 p-4 rounded-xl bg-[color:var(--gold-soft)] text-[color:var(--warning)] text-xs">
              <div className="font-bold mb-1">Important</div>
              <ul className="space-y-1 list-disc pl-4">
                <li>Use your banking app or USSD to send the <span className="font-bold">exact</span> amount above.</li>
                <li>This account is unique to this deposit — do not reuse it later.</li>
                <li>Funds typically reflect in 1–3 minutes after your transfer is successful.</li>
              </ul>
            </div>
            <button onClick={verifyNow} disabled={verifying}
              data-testid="deposit-verify-btn"
              className="mt-5 w-full flex items-center justify-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white py-3.5 rounded-lg font-semibold disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${verifying ? "animate-spin" : ""}`} /> {verifying ? "Checking…" : "I have paid — check status"}
            </button>
            <p className="mt-3 text-xs text-[color:var(--text-tertiary)] text-center">Your wallet credits automatically — but you can also click above to check now.</p>
          </div>
        ) : (
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
        )}

        <div className="card-soft p-6">
          <div className="text-label">How it works</div>
          <ol className="mt-3 text-sm text-[color:var(--text-secondary)] space-y-3">
            <li>1. Enter the amount you want to deposit.</li>
            <li>2. Copy the bank transfer details and pay from your banking app.</li>
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
