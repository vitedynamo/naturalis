import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, Send, Smartphone, Search, ChevronDown, Check, Loader2, BadgeCheck, AlertTriangle, RefreshCw, Wallet } from "lucide-react";

function AdminBankPicker({ value, banks, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const selected = useMemo(() => banks.find((b) => b.code === value) || null, [banks, value]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(ql) || b.code.includes(ql));
  }, [banks, q]);
  const pick = (b) => {
    onSelect(b);
    setOpen(false);
    setQ("");
    setTimeout(() => rootRef.current?.querySelector('[data-testid="payout-bank-trigger"]')?.focus(), 0);
  };
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        data-testid="payout-bank-trigger"
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 input-base text-left">
        <span className={selected ? "text-[color:var(--text-primary)] font-semibold truncate" : "text-[color:var(--text-tertiary)] truncate"}>
          {selected ? selected.name : "— select bank —"}
        </span>
        <ChevronDown className={`w-4 h-4 text-[color:var(--text-tertiary)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-40 left-0 right-0 mt-2 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-default)] shadow-2xl flex flex-col" style={{ maxHeight: "min(60vh, 380px)" }}>
          <div className="px-3 py-2 border-b border-[color:var(--border-default)] bg-[color:var(--surface)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${banks.length} banks…`}
                data-testid="payout-bank-search"
                className="w-full pl-8 pr-3 py-2 text-sm bg-[color:var(--surface-alt)] border border-[color:var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-[color:var(--text-tertiary)]">No bank matches "{q}"</div>}
            {filtered.map((b) => {
              const active = selected?.code === b.code;
              return (
                <button key={b.code} type="button"
                  onClick={() => pick(b)}
                  data-testid={`payout-bank-option-${b.code}`}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[color:var(--surface-alt)] ${active ? "bg-[color:var(--brand-soft)]" : ""}`}>
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--text-primary)] truncate">{b.name}</div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[color:var(--brand)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [target, setTarget] = useState(null);
  const [gateway, setGateway] = useState("paystack");
  const [bankCode, setBankCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");
  const [nombaFloat, setNombaFloat] = useState(null); // {balance, live, ...}
  const [polling, setPolling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = () => api.get("/admin/withdrawals").then(({ data }) => setItems(data));
  const loadFloat = () => api.get("/admin/nomba/balance").then(({ data }) => setNombaFloat(data)).catch(() => setNombaFloat(null));
  useEffect(() => { load(); loadFloat(); }, []);

  const refreshOne = async (w) => {
    setRefreshingId(w.id);
    try {
      const { data } = await api.post(`/admin/withdrawals/${w.id}/refresh-status`);
      const action = data?._refresh || "no_op";
      if (action === "marked_paid") toast.success("Confirmed PAID by provider");
      else if (action === "marked_rejected_refunded") toast.warning("Provider reports FAILED — user refunded");
      else if (action === "still_pending") toast.info("Still pending at provider");
      else if (action === "no_provider_ref") toast.info("No provider reference — nothing to poll");
      else if (action === "already_final") toast.info("Already finalised");
      else toast.info(`Refresh: ${action}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refresh failed");
    } finally { setRefreshingId(null); }
  };

  const pollAll = async () => {
    setPolling(true);
    try {
      const { data } = await api.post("/admin/withdrawals/poll-pending");
      toast.success(`Polled ${data.refreshed} · paid ${data.marked_paid} · rejected ${data.marked_rejected}`);
      load();
      loadFloat();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Poll failed");
    } finally { setPolling(false); }
  };

  const ensureBanks = async () => {
    if (banks.length) return banks;
    const { data } = await api.get("/admin/banks");
    setBanks(data);
    return data;
  };

  const openPay = async (w, gw) => {
    setTarget(w);
    setGateway(gw);
    setReason(`Withdrawal payout to ${w.account_name}`);
    setVerifiedName("");
    const list = await ensureBanks();
    const match = list.find((b) => b.name.toLowerCase() === (w.bank_name || "").toLowerCase().trim());
    setBankCode(match?.code || "");
  };

  // Auto-resolve account name when both bank + account_number ready
  useEffect(() => {
    if (!target || !bankCode || !target.account_number || target.account_number.length !== 10) {
      setVerifiedName("");
      return;
    }
    let cancelled = false;
    setResolving(true);
    setVerifiedName("");
    const t = setTimeout(async () => {
      try {
        const { data } = await api.post("/banks/resolve", { account_number: target.account_number, bank_code: bankCode });
        if (!cancelled) setVerifiedName(data.account_name || "");
      } catch (e) {
        if (!cancelled) toast.error(e?.response?.data?.detail || "Could not verify account");
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [bankCode, target]);

  const nameMismatch = verifiedName && target && verifiedName.toUpperCase().trim() !== (target.account_name || "").toUpperCase().trim();

  const submitPay = async () => {
    if (!bankCode) { toast.error("Pick the bank for this account first"); return; }
    if (!verifiedName) { toast.error("Wait for account verification to complete"); return; }
    setBusy(true);
    try {
      const endpoint = gateway === "nomba" ? "pay-nomba" : "pay-paystack";
      const { data } = await api.post(`/admin/withdrawals/${target.id}/${endpoint}`, { bank_code: bankCode, reason });
      toast.success(`Paid via ${gateway === "nomba" ? "Nomba" : "Paystack"} (${data.mode})`);
      setTarget(null); setBankCode(""); setReason(""); setVerifiedName("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payment failed");
    } finally { setBusy(false); }
  };

  const act = async (w, action) => {
    const note = window.prompt(action === "approve" ? "Optional note (e.g. transfer ref)" : "Reason for rejecting?", "");
    if (action === "reject" && note === null) return;
    try {
      await api.post(`/admin/withdrawals/${w.id}/${action}`, { note });
      toast.success(action === "approve" ? "Withdrawal marked paid" : "Rejected — user refunded");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="Withdrawals">
      {/* Header strip: live Nomba float + poll-all */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4" data-testid="withdrawals-toolbar">
        <div className="card-soft p-4 flex items-center gap-3" data-testid="nomba-float-card">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nombaFloat?.live ? "bg-[color:var(--brand-soft)] text-[color:var(--brand)]" : "bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)]"}`}>
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Nomba float (live)</div>
            <div className="font-display font-bold text-lg text-[color:var(--text-primary)] mt-0.5 truncate" data-testid="nomba-float-amount">
              {nombaFloat?.live === false ? "Live mode off"
                : nombaFloat?.balance == null ? (nombaFloat?.error ? "Unavailable" : "—")
                : formatNaira(nombaFloat.balance)}
            </div>
            {nombaFloat?.error && <div className="text-[10px] text-[color:var(--error)] mt-0.5 truncate" title={nombaFloat.error}>{nombaFloat.error}</div>}
          </div>
          <button onClick={loadFloat} title="Refresh balance" className="ml-auto p-2 rounded-lg hover:bg-[color:var(--surface-alt)]" data-testid="refresh-float-btn">
            <RefreshCw className="w-4 h-4 text-[color:var(--text-secondary)]" />
          </button>
        </div>
        <div className="card-soft p-4 flex items-center gap-3 md:col-span-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Status verification</div>
            <div className="text-sm text-[color:var(--text-secondary)] mt-0.5">Live withdrawals are polled every 5 min automatically. Manually trigger to verify all non-final transfers now.</div>
          </div>
          <button onClick={pollAll} disabled={polling}
            data-testid="poll-all-btn"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} /> {polling ? "Polling…" : "Refresh all pending"}
          </button>
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="admin-withdrawals-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider hidden md:table-cell">Bank</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider hidden lg:table-cell">Date</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.slice((Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE))) - 1) * PAGE_SIZE, Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE))) * PAGE_SIZE).map(w => (
                <tr key={w.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3 max-w-[180px]">
                    <div className="font-medium text-[color:var(--text-primary)] truncate">{w.user_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{w.user_phone}</div>
                  </td>
                  <td className="p-3 text-right font-semibold text-[color:var(--text-primary)] whitespace-nowrap tabular-nums">{formatNaira(w.amount)}</td>
                  <td className="p-3 hidden md:table-cell max-w-[220px]">
                    <div className="text-[color:var(--text-primary)] truncate">{w.bank_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-primary)] truncate">{w.account_number}</div>
                    <div className="text-xs text-[color:var(--text-tertiary)] truncate">{w.account_name}</div>
                  </td>
                  <td className="p-3">
                    <span className={`pill ${w.status === "paid" ? "pill-success" : w.status === "rejected" ? "pill-error" : w.status === "processing" ? "pill-warn" : w.insufficient_float ? "pill-error" : "pill-warn"}`}>
                      {w.insufficient_float && w.status === "pending" ? "insufficient float" : w.status}
                    </span>
                  </td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap hidden lg:table-cell">{formatDate(w.created_at)}</td>
                  <td className="p-3 text-right">
                    {(w.status === "pending" || w.status === "processing") && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {(w.nomba_transfer_ref || w.paystack_transfer_ref) && (
                          <button onClick={() => refreshOne(w)} disabled={refreshingId === w.id}
                            data-testid={`refresh-status-${w.id}`}
                            title="Verify status with provider"
                            className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--brand-soft)] text-[color:var(--brand)] inline-flex items-center gap-1.5">
                            <RefreshCw className={`w-3 h-3 ${refreshingId === w.id ? "animate-spin" : ""}`} /> Refresh status
                          </button>
                        )}
                        {w.status === "pending" && (
                          <>
                            <button onClick={() => openPay(w, "paystack")} data-testid={`pay-paystack-${w.id}`}
                              className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--accent-main)] text-white hover:bg-[color:var(--accent-hover)] inline-flex items-center gap-1.5">
                              <Send className="w-3 h-3" /> Pay via Paystack
                            </button>
                            <button onClick={() => openPay(w, "nomba")} data-testid={`pay-nomba-${w.id}`}
                              className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] inline-flex items-center gap-1.5">
                              <Smartphone className="w-3 h-3" /> Pay via Nomba
                            </button>
                            <button onClick={() => act(w, "approve")} data-testid={`approve-${w.id}`}
                              className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--surface-alt)] text-[color:var(--text-primary)] inline-flex items-center gap-1.5 border border-[color:var(--border-default)]">
                              <Banknote className="w-3 h-3" /> Mark paid manually
                            </button>
                            <button onClick={() => act(w, "reject")} data-testid={`reject-${w.id}`}
                              className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--error-soft)] text-[color:var(--error)]">Reject</button>
                          </>
                        )}
                      </div>
                    )}
                    {w.admin_note && <div className="text-xs text-[color:var(--text-tertiary)] mt-1 italic line-clamp-2">{w.admin_note}</div>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals.</td></tr>}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (() => {
          const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages);
          return (
            <div className="flex items-center justify-between gap-3 p-4 border-t border-[color:var(--border-default)] flex-wrap" data-testid="withdrawals-pagination">
              <div className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                Showing <span className="font-bold text-[color:var(--text-primary)]">{(safePage - 1) * PAGE_SIZE + 1}</span>
                {" – "}
                <span className="font-bold text-[color:var(--text-primary)]">{Math.min(safePage * PAGE_SIZE, items.length)}</span>
                {" of "}
                <span className="font-bold text-[color:var(--text-primary)]">{items.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                  data-testid="withdrawals-page-prev"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <span className="text-xs font-bold text-[color:var(--text-primary)] tabular-nums px-2" data-testid="withdrawals-page-indicator">
                  Page {safePage} of {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                  data-testid="withdrawals-page-next"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pay via {gateway === "nomba" ? "Nomba" : "Paystack"} Transfer</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3">
                <div className="text-[color:var(--text-primary)] font-semibold">{target.user_name} · {formatNaira(target.amount)}</div>
                <div className="font-mono text-xs text-[color:var(--text-primary)]">{target.account_number}</div>
                <div className="text-xs text-[color:var(--text-secondary)]">User-saved: <span className="font-semibold">{target.bank_name} · {target.account_name}</span></div>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Bank</label>
              <AdminBankPicker value={bankCode} banks={banks}
                onSelect={(b) => setBankCode(b.code)} />

              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account name (verified by gateway)</label>
              <div className="relative">
                <input
                  value={resolving ? "" : verifiedName}
                  readOnly
                  placeholder={resolving ? "Verifying with bank…" : "Pick a bank to auto-verify"}
                  data-testid="payout-verified-name"
                  className="w-full input-base pr-10 font-semibold uppercase"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {resolving && <Loader2 className="w-4 h-4 text-[color:var(--brand)] animate-spin" />}
                  {!resolving && verifiedName && !nameMismatch && (
                    <BadgeCheck className="w-5 h-5 text-[color:var(--success)]" data-testid="payout-verified-badge" />
                  )}
                  {!resolving && verifiedName && nameMismatch && (
                    <AlertTriangle className="w-5 h-5 text-[color:var(--warning)]" data-testid="payout-mismatch-warn" />
                  )}
                </div>
              </div>
              {!resolving && verifiedName && nameMismatch && (
                <div className="rounded-lg bg-[color:var(--gold-soft)] text-[color:var(--warning)] p-3 text-xs flex items-start gap-2" data-testid="mismatch-banner">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">Name mismatch.</div>
                    User saved <span className="font-mono">"{target.account_name}"</span> but the bank returned <span className="font-mono font-bold">"{verifiedName}"</span>. Verify before paying.
                  </div>
                </div>
              )}

              {gateway === "nomba" && nombaFloat?.live && nombaFloat?.balance != null && nombaFloat.balance < Number(target.amount) && (
                <div className="rounded-lg bg-[color:var(--error-soft)] text-[color:var(--error)] p-3 text-xs flex items-start gap-2" data-testid="insufficient-float-banner">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold">Insufficient Nomba float.</div>
                    Available <span className="font-mono font-bold">{formatNaira(nombaFloat.balance)}</span> · Required <span className="font-mono font-bold">{formatNaira(target.amount)}</span>. Top up your Nomba wallet before paying.
                  </div>
                </div>
              )}

              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reason / narration</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                data-testid="payout-reason-input"
                className="w-full input-base" />
            </div>
          )}
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={busy || resolving || !verifiedName} data-testid="payout-confirm-btn"
              className={gateway === "nomba" ? "bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]" : "bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)]"}>
              {busy ? "Processing…" : "Confirm transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
