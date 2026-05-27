import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowUpFromLine, Banknote, Send, Smartphone, Search, ChevronDown, Check, Loader2,
  BadgeCheck, AlertTriangle, RefreshCw, Wallet, Copy, X, ExternalLink,
  User as UserIcon, Hourglass, CalendarDays, CheckCircle2, ClipboardCheck, Undo2,
} from "lucide-react";
import Pagination from "@/components/admin/Pagination";
import { Link } from "react-router-dom";

/* ---------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------*/

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function relativeTime(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function startOfLagosDayISO() {
  // Lagos = UTC+1, no DST.
  const now = new Date();
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);
  const lagosMidnight = new Date(Date.UTC(
    lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate(), 0, 0, 0
  ));
  // back to UTC by subtracting 1 hour
  return new Date(lagosMidnight.getTime() - 60 * 60 * 1000).toISOString();
}

function CopyButton({ text, testid }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
        catch { /* ignore */ }
      }}
      className="ml-2 p-1 rounded-md text-[color:var(--text-tertiary)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--accent-main)]"
      title="Copy"
    >
      {done ? <CheckCircle2 className="w-3.5 h-3.5 text-[color:var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * AdminBankPicker (kept identical to previous)
 * -------------------------------------------------------------------------*/

function AdminBankPicker({ value, banks, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    if (open) { document.addEventListener("mousedown", onClick); setTimeout(() => searchRef.current?.focus(), 50); }
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = useMemo(() => banks.find((b) => b.code === value), [banks, value]);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(qq));
  }, [banks, q]);

  const pick = (b) => { onSelect(b); setOpen(false); setQ(""); };

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
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

/* ---------------------------------------------------------------------------
 * Stat cards & gateway cards
 * -------------------------------------------------------------------------*/

const STAT_TONES = {
  warn:    "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
  brand:   "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
  accent:  "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
};

function StatCard({ tone = "brand", icon: Icon, label, value, sub, testid }) {
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${STAT_TONES[tone]}`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-2">{sub}</div>}
    </div>
  );
}

function GatewayStatusCard({ name, last, pendingCount, doneCount, tone, balance, balanceLive, balanceError, onRefreshBalance }) {
  const tones = {
    nomba: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    paystack: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
  };
  return (
    <div className="card-soft p-4 flex items-center gap-4" data-testid={`gateway-card-${name.toLowerCase()}`}>
      <div className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[name.toLowerCase()] || tones.nomba} shrink-0`}>
        {name}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Last successful payout</span>
          {doneCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[color:var(--success)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]" /> ACTIVE
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <span className="font-display font-bold text-base text-[color:var(--text-primary)]">{last ? relativeTime(last) : "—"}</span>
          <span className="text-[11px] text-[color:var(--text-tertiary)]">· {pendingCount} pending · {doneCount} done</span>
        </div>
        {balance !== undefined && (
          <div className="mt-1 text-[10px] flex items-center gap-1.5">
            <Wallet className="w-3 h-3 text-[color:var(--text-tertiary)]" />
            <span className="text-[color:var(--text-tertiary)] font-medium">Float:</span>
            <span className="font-mono font-bold tabular-nums text-[color:var(--text-primary)]">
              {balanceLive === false ? "Live off"
                : balance == null ? (balanceError ? "Unavailable" : "—")
                : formatNaira(balance)}
            </span>
            {onRefreshBalance && (
              <button onClick={onRefreshBalance} className="ml-1 p-0.5 rounded hover:bg-[color:var(--surface-alt)]" title="Refresh balance" data-testid="refresh-float-btn">
                <RefreshCw className="w-3 h-3 text-[color:var(--text-tertiary)]" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Status pill (display labels in the redesigned table)
 * -------------------------------------------------------------------------*/

function StatusPill({ w }) {
  if (w.insufficient_float && w.status === "pending") {
    return <span className="pill pill-error">insufficient float</span>;
  }
  // Map "paid" -> "disbursed" visually to match the new design language.
  if (w.status === "paid") return <span className="pill pill-success" data-testid={`status-${w.id}`}>disbursed</span>;
  if (w.status === "rejected") return <span className="pill pill-error" data-testid={`status-${w.id}`}>rejected</span>;
  if (w.status === "processing") return <span className="pill pill-warn" data-testid={`status-${w.id}`}>processing</span>;
  return <span className="pill pill-warn" data-testid={`status-${w.id}`}>pending</span>;
}

/* ===========================================================================
 * MAIN PAGE
 * =========================================================================*/

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [nombaFloat, setNombaFloat] = useState(null);
  const [polling, setPolling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  // Toolkit modal (per-row drill-in).
  const [toolkit, setToolkit] = useState(null); // withdrawal record

  // Pay dialog state (kept the same).
  const [target, setTarget] = useState(null);
  const [gateway, setGateway] = useState("paystack");
  const [bankCode, setBankCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");

  // List filter / search / page-size.
  const [filter, setFilter] = useState("All"); // All | pending | processing | paid | rejected
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = () => api.get("/admin/withdrawals").then(({ data }) => setItems(data));
  const loadFloat = () => api.get("/admin/nomba/balance").then(({ data }) => setNombaFloat(data)).catch(() => setNombaFloat(null));
  useEffect(() => { load(); loadFloat(); }, []);

  /* ----- derived stats ----- */
  const stats = useMemo(() => {
    const lagosStart = startOfLagosDayISO();
    let pendingCount = 0, paidToday = 0, paidAll = 0;
    let nombaLast = null, paystackLast = null;
    let nombaPending = 0, nombaDone = 0, paystackPending = 0, paystackDone = 0;
    for (const w of items) {
      if (w.status === "pending" || w.status === "processing") pendingCount += 1;
      if (w.status === "paid") {
        paidAll += Number(w.amount || 0);
        if ((w.updated_at || w.created_at) >= lagosStart) paidToday += Number(w.amount || 0);
        if (w.nomba_transfer_ref) {
          nombaDone += 1;
          if (!nombaLast || (w.updated_at || w.created_at) > nombaLast) nombaLast = w.updated_at || w.created_at;
        } else if (w.paystack_transfer_ref) {
          paystackDone += 1;
          if (!paystackLast || (w.updated_at || w.created_at) > paystackLast) paystackLast = w.updated_at || w.created_at;
        }
      }
      if ((w.status === "pending" || w.status === "processing")) {
        if (w.nomba_transfer_ref) nombaPending += 1;
        else if (w.paystack_transfer_ref) paystackPending += 1;
      }
    }
    return {
      pendingCount, paidToday, paidAll, total: items.length,
      nombaLast, paystackLast,
      nombaPending, nombaDone,
      paystackPending, paystackDone,
    };
  }, [items]);

  /* ----- filtered + paged ----- */
  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "All") r = r.filter((w) => w.status === filter);
    const qq = q.trim().toLowerCase();
    if (qq) r = r.filter((w) =>
      (w.user_name || "").toLowerCase().includes(qq)
      || (w.user_phone || "").toLowerCase().includes(qq)
      || (w.account_number || "").toLowerCase().includes(qq)
      || (w.bank_name || "").toLowerCase().includes(qq)
      || (w.nomba_transfer_ref || "").toLowerCase().includes(qq)
      || (w.paystack_transfer_ref || "").toLowerCase().includes(qq)
    );
    return r;
  }, [items, filter, q]);

  useEffect(() => { setPage(1); }, [filter, q, pageSize]);
  const effPageSize = pageSize === "all" ? Math.max(1, filtered.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effPageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * effPageSize, safePage * effPageSize),
    [filtered, safePage, effPageSize],
  );

  /* ----- actions ----- */
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
    setToolkit(null);
    setTarget(w);
    setGateway(gw);
    setReason(`Withdrawal payout to ${w.account_name}`);
    setVerifiedName("");
    const list = await ensureBanks();
    const match = list.find((b) => b.name.toLowerCase() === (w.bank_name || "").toLowerCase().trim());
    setBankCode(match?.code || "");
  };

  // Auto-resolve account name
  useEffect(() => {
    if (!target || !bankCode || !target.account_number || target.account_number.length !== 10) {
      setVerifiedName("");
      return undefined;
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
      setToolkit(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const QUICK_SIZES = [5, 20, 50, 100, "all"];

  return (
    <AdminLayout title="">
      {/* ====== Hero ====== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#9F0F50] via-[#C81A6E] to-[#E5097F] text-white p-6 md:p-8" data-testid="withdrawals-hero">
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-12 left-1/3 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <ArrowUpFromLine className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-extrabold text-2xl md:text-3xl leading-tight">Withdrawals</div>
            <div className="text-white/85 text-xs md:text-sm mt-1">
              {stats.total} total · approve, reject and track payouts via Nomba & Paystack
            </div>
          </div>
        </div>
      </div>

      {/* ====== Stats ====== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="warn" icon={Hourglass} label="Pending" value={stats.pendingCount} sub="Awaiting approval" testid="stat-pending" />
        <StatCard tone="success" icon={CheckCircle2} label="Paid today" value={formatNaira(stats.paidToday)} sub={`Since 00:00 Lagos`} testid="stat-paid-today" />
        <StatCard tone="accent" icon={Wallet} label="Paid · all time" value={formatNaira(stats.paidAll)} sub="Settled withdrawals" testid="stat-paid-all" />
        <StatCard tone="brand" icon={ArrowUpFromLine} label="All withdrawals" value={stats.total} sub="All statuses combined" testid="stat-total" />
      </div>

      {/* ====== Filter + search + refresh-all ====== */}
      <div className="card-soft p-3 mt-5 flex items-center gap-3 flex-wrap" data-testid="withdrawals-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="withdrawals-status-filter"
          className="input-base !py-2 !w-[140px] text-sm font-semibold">
          {["All", "pending", "processing", "paid", "rejected"].map((s) => (
            <option key={s} value={s}>{s === "All" ? "All" : s}</option>
          ))}
        </select>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, account, or payout reference…"
            data-testid="withdrawals-search-input"
            className="w-full pl-10 input-base" />
        </div>
        <button onClick={pollAll} disabled={polling}
          data-testid="poll-all-btn"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} /> {polling ? "Polling…" : "Refresh all pending"}
        </button>
      </div>

      {/* ====== Gateway status ====== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <GatewayStatusCard
          name="NOMBA"
          last={stats.nombaLast}
          pendingCount={stats.nombaPending}
          doneCount={stats.nombaDone}
          balance={nombaFloat?.balance}
          balanceLive={nombaFloat?.live}
          balanceError={nombaFloat?.error}
          onRefreshBalance={loadFloat}
        />
        <GatewayStatusCard
          name="PAYSTACK"
          last={stats.paystackLast}
          pendingCount={stats.paystackPending}
          doneCount={stats.paystackDone}
        />
      </div>

      {/* ====== Quick page size ====== */}
      <div className="card-soft p-3 mt-3 flex items-center gap-3 flex-wrap" data-testid="withdrawals-quickrows">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-tertiary)]">Rows per page</span>
        {QUICK_SIZES.map((n) => {
          const active = pageSize === n;
          return (
            <button key={String(n)} onClick={() => setPageSize(n)}
              data-testid={`quick-size-${n}`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${active
                ? "bg-[color:var(--brand)] text-white"
                : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]/70"}`}>
              {n === "all" ? "All" : n}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-[color:var(--text-tertiary)]">
          Showing <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{pageItems.length}</span> of <span className="font-bold text-[color:var(--text-primary)] tabular-nums">{filtered.length}</span>
        </span>
      </div>

      {/* ====== Table ====== */}
      <div className="card-soft overflow-hidden mt-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="admin-withdrawals-table">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4">User</th>
                <th className="text-right p-4">Amount</th>
                <th className="text-left p-4 hidden md:table-cell">Bank</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4 hidden xl:table-cell">Gateway ref</th>
                <th className="text-left p-4 hidden lg:table-cell">Date</th>
                <th className="text-right p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || filter !== "All" ? "No withdrawals match this filter." : "No withdrawals yet."}
                </td></tr>
              )}
              {pageItems.map((w) => {
                const ref = w.nomba_transfer_ref || w.paystack_transfer_ref;
                const gw = w.nomba_transfer_ref ? "nomba" : w.paystack_transfer_ref ? "paystack" : null;
                return (
                  <tr key={w.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`withdrawal-row-${w.id}`}>
                    <td className="p-4 max-w-[200px]">
                      <Link to={`/admin/users/${w.user_id}`} className="flex items-center gap-2.5 group min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(w.user_id) }}>
                          {(w.user_name || "?").trim()[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate">{w.user_name || "—"}</div>
                          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate">{w.user_phone}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="font-display font-bold tabular-nums leading-tight">{formatNaira(w.amount)}</div>
                    </td>
                    <td className="p-4 hidden md:table-cell max-w-[200px]">
                      {gw && (
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mb-1 bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                          {gw}
                        </span>
                      )}
                      <div className="text-[color:var(--text-primary)] truncate font-semibold text-xs">{w.bank_name}</div>
                      <div className="font-mono text-[11px] text-[color:var(--text-primary)] truncate">{w.account_number}</div>
                    </td>
                    <td className="p-4"><StatusPill w={w} /></td>
                    <td className="p-4 hidden xl:table-cell max-w-[160px]">
                      <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] truncate" title={ref || ""}>{ref || "—"}</div>
                    </td>
                    <td className="p-4 hidden lg:table-cell text-[11px] text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(w.created_at)}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setToolkit(w)}
                        data-testid={`toolkit-${w.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-[color:var(--brand-soft)] text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]/80 transition-colors"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> Toolkit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && pageSize !== "all" && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={effPageSize}
            testidPrefix="withdrawals-page"
          />
        )}
      </div>

      {/* ====== TOOLKIT MODAL (drill-in detail) ====== */}
      <ToolkitModal
        w={toolkit}
        onClose={() => setToolkit(null)}
        onRefresh={refreshOne}
        refreshingId={refreshingId}
        onPay={openPay}
        onApprove={(w) => act(w, "approve")}
        onReject={(w) => act(w, "reject")}
      />

      {/* ====== PAY DIALOG (kept the same flow) ====== */}
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
              <AdminBankPicker value={bankCode} banks={banks} onSelect={(b) => setBankCode(b.code)} />

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

/* ===========================================================================
 * ToolkitModal — drill-in detail (matches the design reference)
 * =========================================================================*/

function ToolkitModal({ w, onClose, onRefresh, refreshingId, onPay, onApprove, onReject }) {
  if (!w) return null;
  const isFinal = w.status === "paid" || w.status === "rejected";
  const headerTone = w.status === "paid"
    ? "from-[#0f7a4f] via-[#10996c] to-[#10B981]"
    : w.status === "rejected"
      ? "from-[#7a1f2b] via-[#a31931] to-[#EF4444]"
      : "from-[#7c4807] via-[#a36a08] to-[#F59E0B]";
  const statusBadge = w.status === "paid"
    ? "bg-[#054128]/80 text-[#10B981] border-[#10B981]/30"
    : w.status === "rejected"
      ? "bg-[#3a0c12]/70 text-[#EF4444] border-[#EF4444]/30"
      : "bg-[#3f290a]/70 text-[#F59E0B] border-[#F59E0B]/30";
  const gw = w.nomba_transfer_ref ? "nomba" : w.paystack_transfer_ref ? "paystack" : null;
  const providerRef = w.nomba_transfer_ref || w.paystack_transfer_ref;

  return (
    <Dialog open={!!w} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-3xl gap-0" data-testid="withdrawal-toolkit-modal">
        {/* Gradient header */}
        <div className={`relative bg-gradient-to-br ${headerTone} text-white p-6`}>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <Link to={`/admin/users/${w.user_id}`}
              data-testid="toolkit-profile-link"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 backdrop-blur hover:bg-white/25 text-white">
              <UserIcon className="w-3.5 h-3.5" /> Profile
            </Link>
            <button onClick={onClose} data-testid="toolkit-close"
              className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <ArrowUpFromLine className="w-6 h-6" />
            </div>
            <div className="min-w-0 mt-1">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/80">Withdrawal</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl tabular-nums leading-none mt-1">
                {formatNaira(w.amount)}
              </div>
              <div className="text-white/85 text-xs mt-2">
                Net <span className="font-bold tabular-nums">{formatNaira(w.amount)}</span>
              </div>
              <div className="mt-3">
                <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusBadge}`}>
                  {w.status === "paid" ? "completed" : w.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5 bg-[color:var(--surface)]">
          {/* Customer */}
          <Section icon={UserIcon} label="Customer">
            <Link to={`/admin/users/${w.user_id}`}
              data-testid="toolkit-customer-link"
              className="card-soft p-3 flex items-center gap-3 group hover:bg-[color:var(--surface-alt)]/60 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(w.user_id) }}>
                {(w.user_name || "?").trim()[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[color:var(--text-primary)] truncate">{w.user_name || "—"}</div>
                <div className="font-mono text-[11px] text-[color:var(--text-tertiary)]">{w.user_phone}</div>
              </div>
              <span className="text-[color:var(--accent-main)] text-xs font-bold group-hover:underline shrink-0 inline-flex items-center gap-1">
                View <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </Section>

          {/* Payout destination */}
          <Section icon={Banknote} label="Payout destination">
            <div className="card-soft p-4">
              <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{w.bank_name || "—"}</div>
              <div className="font-display font-extrabold text-2xl tabular-nums mt-1 text-[color:var(--text-primary)]">{w.account_number}</div>
              <div className="text-xs text-[color:var(--text-primary)] uppercase font-semibold tracking-wider mt-1">{w.account_name}</div>
            </div>
          </Section>

          {/* References */}
          <Section icon={Copy} label="References">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Our reference</div>
                <div className="flex items-center mt-1 min-w-0">
                  <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-our-ref">{w.id}</span>
                  <CopyButton text={w.id} testid="toolkit-copy-our-ref" />
                </div>
              </div>
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">
                  {gw === "paystack" ? "Paystack reference" : "Nomba reference"}
                </div>
                <div className="flex items-center mt-1 min-w-0">
                  <span className="font-mono text-xs text-[color:var(--text-primary)] truncate" data-testid="toolkit-provider-ref">{providerRef || "—"}</span>
                  {providerRef && <CopyButton text={providerRef} testid="toolkit-copy-provider-ref" />}
                </div>
              </div>
            </div>
          </Section>

          {/* Timeline */}
          <Section icon={CalendarDays} label="Timeline">
            <div className="card-soft p-4 space-y-3">
              <TimelineRow color="brand" label="Requested" ts={w.created_at} />
              {w.updated_at && w.updated_at !== w.created_at && (
                <TimelineRow color="brand" label="Status updated" ts={w.updated_at} />
              )}
              {w.status === "paid" && <TimelineRow color="success" label="Disbursed" ts={w.updated_at || w.created_at} />}
              {w.status === "rejected" && <TimelineRow color="error" label="Rejected · refunded" ts={w.updated_at || w.created_at} />}
            </div>
            {w.admin_note && (
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3 text-xs text-[color:var(--text-secondary)] italic mt-2">
                <span className="font-bold not-italic text-[color:var(--text-primary)] mr-1">Note:</span>
                {w.admin_note}
              </div>
            )}
          </Section>

          {/* Resolution tools */}
          {!isFinal && (
            <Section icon={RefreshCw} label="Resolution tools">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {providerRef && (
                  <ToolButton
                    onClick={() => onRefresh(w)}
                    busy={refreshingId === w.id}
                    icon={RefreshCw}
                    label={`Check ${gw === "paystack" ? "Paystack" : "Nomba"} status`}
                    tone="brand"
                    testid="tool-check-status"
                  />
                )}
                {w.status === "pending" && (
                  <>
                    <ToolButton onClick={() => onPay(w, "nomba")} icon={Smartphone} label="Pay via Nomba" tone="brand" testid="tool-pay-nomba" />
                    <ToolButton onClick={() => onPay(w, "paystack")} icon={Send} label="Pay via Paystack" tone="warn" testid="tool-pay-paystack" />
                    <ToolButton onClick={() => onApprove(w)} icon={ClipboardCheck} label="Mark disbursed" tone="success" testid="tool-mark-disbursed" />
                    <ToolButton onClick={() => onReject(w)} icon={Undo2} label="Refund to wallet" tone="error" testid="tool-refund" />
                  </>
                )}
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon: Icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--text-tertiary)] mb-2">
        <Icon className="w-3 h-3" /> {label}
      </div>
      {children}
    </div>
  );
}

function TimelineRow({ color, label, ts }) {
  const dot = {
    brand: "bg-[color:var(--brand)]",
    success: "bg-[color:var(--success)]",
    error: "bg-[color:var(--error)]",
  }[color];
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
        <span className="text-xs font-semibold text-[color:var(--text-primary)] truncate">{label}</span>
      </div>
      <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums whitespace-nowrap">{formatDate(ts)}</span>
    </div>
  );
}

function ToolButton({ onClick, busy, icon: Icon, label, tone, testid }) {
  const tones = {
    brand:   "bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white",
    warn:    "bg-[color:var(--warning)] hover:opacity-90 text-white",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)] hover:bg-[color:var(--success-soft)]/70 border border-[color:var(--success)]/20",
    error:   "bg-[color:var(--error-soft)] text-[color:var(--error)] hover:bg-[color:var(--error-soft)]/70 border border-[color:var(--error)]/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testid}
      className={`px-4 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> {label}
    </button>
  );
}
