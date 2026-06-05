import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowUpFromLine, KeyRound, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({});
  // Mirrors Deposit.jsx — keep settings-dependent UI hidden until /settings/public
  // returns, otherwise the page flashes with a hardcoded ₦1,000 limit before the
  // admin's actual value loads.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [investmentsCount, setInvestmentsCount] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: s }, { data: inv }] = await Promise.all([
      api.get("/withdrawals"),
      api.get("/settings/public"),
      api.get("/investments"),
    ]);
    setHistory(h);
    setSettings(s);
    setInvestmentsCount(Array.isArray(inv) ? inv.filter(i => ["active","paused","completed"].includes(i.status)).length : 0);
    setSettingsLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const hasPin = !!user?.has_withdrawal_pin;
  // Treat the PIN as required only AFTER /settings/public has returned an
  // explicit `true`. While `settings` is still its empty initial value the
  // requirement evaluates to `false`, which keeps the banner hidden during
  // the load and stops the half-second flash on every page refresh.
  const pinRequired = settings.require_withdrawal_pin === true;
  const submit = async (e) => {
    e.preventDefault();
    const requirePin = pinRequired;
    if (requirePin && !/^\d{4}$/.test(pin)) { toast.error("Enter your 4-digit PIN"); return; }
    const amt = Number(amount);
    if (settings.max_withdrawal && amt > settings.max_withdrawal) {
      toast.error(`Max withdrawal is ₦${Number(settings.max_withdrawal).toLocaleString()}`);
      return;
    }
    setBusy(true);
    try {
      const body = { amount: amt, method: "manual" };
      if (requirePin) body.pin = pin;
      await api.post("/withdrawal/request", body);
      toast.success("Withdrawal request submitted");
      setAmount("");
      setPin("");
      await refresh();
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Withdrawal failed");
    } finally { setBusy(false); }
  };

  const bankReady = user?.bank_name && user?.account_number && user?.account_name && user?.bank_code;

  // Compute window state from settings (Lagos time = UTC + 1)
  const windowState = (() => {
    if (settings.withdrawals_open === false) return { open: false, reason: "Withdrawals are temporarily closed." };
    const start = settings.withdrawal_start_time || "00:00";
    const end = settings.withdrawal_end_time || "23:59";
    if (start === "00:00" && end === "23:59") return { open: true, start, end };
    const now = new Date();
    const lagos = new Date(now.getTime() + (now.getTimezoneOffset() + 60) * 60000);
    const cur = lagos.getHours() * 60 + lagos.getMinutes();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = eh * 60 + em;
    const inWindow = startM <= endM ? (cur >= startM && cur <= endM) : (cur >= startM || cur <= endM);
    return inWindow ? { open: true, start, end } : { open: false, reason: `Withdrawals open between ${start} and ${end} (Lagos).`, start, end };
  })();

  return (
    <UserLayout>
      <div className="text-label">Funds</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-[color:var(--text-primary)]">Withdraw</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">
        {settingsLoaded ? (
          <>
            Limits: <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.min_withdrawal)}</span>
            {settings.max_withdrawal ? <> – <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.max_withdrawal)}</span></> : null}
            {settings.auto_payout_max_amount > 0 && (
              <> · auto-payout up to <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(settings.auto_payout_max_amount)}</span> (larger requests need admin approval)</>
            )}
          </>
        ) : <>&nbsp;</>}
      </p>

      {!bankReady && (
        <div className="mt-4 card-soft p-5 border-l-4 border-[color:var(--warning)]" data-testid="bank-missing-warn">
          <div className="font-semibold text-[color:var(--text-primary)]">Add your bank details</div>
          <div className="text-sm text-[color:var(--text-secondary)] mt-1">You need to add a bank account before you can withdraw. Once added, every withdrawal will go to this account.</div>
          <Link to="/profile" data-testid="add-bank-btn" className="mt-4 inline-block btn-primary text-sm">
            Add bank
          </Link>
        </div>
      )}

      {pinRequired && !hasPin && (
        <div className="mt-4 card-soft p-5 border-l-4 border-[color:var(--warning)]" data-testid="no-pin-banner">
          <div className="font-semibold text-[color:var(--text-primary)] flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Set your withdrawal PIN</div>
          <div className="text-sm text-[color:var(--text-secondary)] mt-1">A 4-digit PIN is required to authorise withdrawals. Set yours once on your profile page.</div>
          <Link to="/profile" data-testid="set-pin-link" className="mt-4 inline-block btn-primary text-sm">
            Set my PIN
          </Link>
        </div>
      )}

      {bankReady && !windowState.open && (
        <div className="mt-4 card-soft p-5 border-l-4 border-[color:var(--warning)]" data-testid="withdrawals-closed-banner">
          <div className="font-semibold text-[color:var(--text-primary)] flex items-center gap-2">Withdrawals closed</div>
          <div className="text-sm text-[color:var(--text-secondary)] mt-1">{windowState.reason}</div>
        </div>
      )}

      {/* Investment gate — block users who haven't bought any package yet */}
      {investmentsCount === 0 && (
        <div className="mt-4 card-soft p-5 border-l-4 border-[color:var(--warning)]" data-testid="no-investment-banner">
          <div className="font-semibold text-[color:var(--text-primary)] flex items-center gap-2">Withdrawals unlock after your first investment</div>
          <div className="text-sm text-[color:var(--text-secondary)] mt-1">
            You need to buy at least one investment package before you can request a withdrawal. Head to the Invest tab, pick a plan, and your wallet will be ready to pay out from after purchase.
          </div>
          <Link to="/invest" data-testid="go-invest-link" className="mt-4 inline-block btn-primary text-sm">
            Browse plans
          </Link>
        </div>
      )}

      <form onSubmit={submit} className="card-soft p-6 mt-6" data-testid="withdraw-form">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Amount (₦)</label>
        <input
          type="number"
          min={settings.min_withdrawal}
          max={Math.min(user?.wallet_balance ?? Infinity, settings.max_withdrawal || Infinity)}
          value={amount} onChange={(e)=>setAmount(e.target.value)} required
          placeholder={settingsLoaded ? `Min ₦${Number(settings.min_withdrawal || 0).toLocaleString()}` : ""}
          data-testid="withdraw-amount-input"
          className="w-full mt-2 px-3 py-3 input-base"
        />

        {pinRequired && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mt-4 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" /> Withdrawal PIN
            </label>
            <input
              type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              disabled={!hasPin}
              required
              placeholder={hasPin ? "••••" : "Set PIN on Profile first"}
              data-testid="withdraw-pin-input"
              className="w-full mt-2 px-3 py-3 input-base font-mono tracking-[0.5em] text-center"
            />
          </>
        )}

        {settings.auto_payout_max_amount > 0 && Number(amount) > settings.auto_payout_max_amount && (
          <div className="mt-3 rounded-md bg-[color:var(--gold-soft)] text-[color:var(--warning)] p-2.5 text-[11px]" data-testid="manual-approval-hint">
            Amounts above {formatNaira(settings.auto_payout_max_amount)} need admin approval and may take a little longer.
          </div>
        )}

        <button type="submit" disabled={busy || !bankReady || !windowState.open || investmentsCount === 0 || (pinRequired && (!hasPin || pin.length !== 4))}
          data-testid="withdraw-submit-btn"
          title={
            !bankReady ? "Add complete bank details first"
            : (pinRequired && !hasPin) ? "Set your 4-digit withdrawal PIN first"
            : !windowState.open ? (windowState.reason || "Withdrawals closed")
            : (pinRequired && pin.length !== 4) ? "Enter your 4-digit PIN"
            : ""
          }
          className="mt-5 w-full flex items-center justify-center gap-2 btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
          <ArrowUpFromLine className="w-4 h-4" /> {busy ? "Processing…" : !bankReady ? "Add complete bank details first" : "Submit request"}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="font-display text-xl font-semibold mb-3 text-[color:var(--text-primary)]">Recent withdrawals</h2>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2" data-testid="withdraw-history-mobile">
          {history.map((w) => (
            <div key={w.id} className="card-soft p-3 flex items-center justify-between" data-testid={`w-${w.id}`}>
              <div className="min-w-0">
                <div className="font-semibold text-[color:var(--text-primary)]">{formatNaira(w.amount)}</div>
                <div className="text-xs text-[color:var(--text-secondary)] truncate">{w.bank_name} · {w.account_number}</div>
                <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">{formatDate(w.created_at)}</div>
              </div>
              <span className={`pill ${
                w.status === "paid" || w.status === "approved"
                  ? "pill-success"
                  : w.status === "rejected"
                  ? "pill-error"
                  : "pill-warn"
              }`}>{w.status}</span>
            </div>
          ))}
          {history.length === 0 && (
            <div className="card-soft p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals yet.</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block card-soft overflow-hidden">
          <table className="w-full text-sm" data-testid="withdraw-history-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Bank</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((w) => (
                <tr key={w.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3 font-semibold text-[color:var(--text-primary)]">{formatNaira(w.amount)}</td>
                  <td className="p-3 text-[color:var(--text-secondary)]">{w.bank_name} · {w.account_number}</td>
                  <td className="p-3">
                    <span className={`pill ${w.status === "paid" || w.status === "approved" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status}</span>
                  </td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap">{formatDate(w.created_at)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </UserLayout>
  );
}
