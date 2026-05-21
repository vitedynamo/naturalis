import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import {
  Users, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Clock, DollarSign,
  CircleCheck, CircleAlert, ShieldAlert, ScanSearch, Banknote, ChevronRight,
  CalendarRange, ArrowUpRight, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function StatCard({ icon: Icon, label, value, sub, tone = "brand", testid }) {
  const tones = {
    brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
    gold: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    error: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
    neutral: "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-4">{label}</div>
      <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function InflowChip({ label, value, active, onClick }) {
  return (
    <button onClick={onClick} data-testid={`range-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
        active
          ? "bg-[color:var(--accent-main)] text-white border-[color:var(--accent-main)]"
          : "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)] border-transparent hover:bg-[color:var(--surface)]"
      }`}>
      {label}
    </button>
  );
}

const RANGES = [
  { id: "today", label: "Today", days: 0 },
  { id: "yesterday", label: "Yesterday", days: -1 },
  { id: "7d", label: "Last 7 days", days: 6 },
  { id: "30d", label: "Last 30 days", days: 29 },
  { id: "month", label: "This month", days: "month" },
  { id: "lastmonth", label: "Last month", days: "lastmonth" },
];

function computeRange(id) {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (id === "today") return { frm: ymd(today), to: ymd(today) };
  if (id === "yesterday") {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    return { frm: ymd(y), to: ymd(y) };
  }
  if (id === "7d") {
    const f = new Date(today); f.setDate(today.getDate() - 6);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "30d") {
    const f = new Date(today); f.setDate(today.getDate() - 29);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "month") {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { frm: ymd(f), to: ymd(today) };
  }
  if (id === "lastmonth") {
    const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const l = new Date(today.getFullYear(), today.getMonth(), 0);
    return { frm: ymd(f), to: ymd(l) };
  }
  return { frm: ymd(today), to: ymd(today) };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [range, setRange] = useState("7d");
  const [inflow, setInflow] = useState(null);
  const [customFrm, setCustomFrm] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [drillDate, setDrillDate] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    api.get("/admin/stats/extended").then(({ data }) => setS(data));
  }, []);

  const loadInflow = useCallback(async (frm, to) => {
    const { data } = await api.get("/admin/stats/inflow", { params: { frm, to } });
    setInflow(data);
    setCustomFrm(frm);
    setCustomTo(to);
  }, []);

  useEffect(() => {
    const { frm, to } = computeRange(range);
    loadInflow(frm, to);
  }, [range, loadInflow]);

  const applyCustom = () => {
    if (customFrm && customTo) loadInflow(customFrm, customTo);
  };

  const openDrill = async (date) => {
    setDrillDate(date);
    setDrillData(null);
    setDrillLoading(true);
    try {
      const { data } = await api.get("/admin/deposits/by-day", { params: { date } });
      setDrillData(data);
    } finally {
      setDrillLoading(false);
    }
  };

  const maxSeries = inflow ? Math.max(1, ...inflow.series.map((p) => p.total)) : 1;

  return (
    <AdminLayout title="">
      <div className="mb-1 text-label">Platform overview</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)]" data-testid="admin-dashboard-title">Dashboard</h1>

      {/* Hero: Platform profit + Next 24h payout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="rounded-3xl p-6 md:p-8 text-white relative overflow-hidden bg-gradient-to-br from-[color:var(--accent-main)] via-[#E11D74] to-[color:var(--brand)] shadow-xl shadow-[color:var(--accent-main)]/30" data-testid="platform-profit-card">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">Platform profit</div>
              <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none" data-testid="platform-profit-value">
                {formatNaira(s?.platform_profit ?? 0)}
              </div>
              <div className="text-white/80 text-xs mt-2">Deposits − payouts − bonuses − referrals − profits</div>
            </div>
            <ArrowUpRight className="w-7 h-7 text-white/80" />
          </div>
        </div>

        <div className="card-soft p-6 md:p-8 relative" data-testid="next-payout-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-label">Next 24h payout</div>
              <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none text-[color:var(--text-primary)]" data-testid="next-payout-value">
                {formatNaira(s?.next_24h_payout ?? 0)}
              </div>
              <div className="text-xs text-[color:var(--text-tertiary)] mt-2">Projected from active investments' daily profit</div>
            </div>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard testid="stat-total-users" icon={Users} label="Total users" value={s?.users ?? 0} sub={`${s?.online ?? 0} online`} tone="success" />
        <StatCard testid="stat-total-deposits" icon={DollarSign} label="Total deposits" value={formatNaira(s?.total_deposits ?? 0)} tone="accent" />
        <StatCard testid="stat-active-investments" icon={TrendingUp} label="Active investments" value={s?.active_investments ?? 0} tone="brand" />
        <StatCard testid="stat-pending-withdrawals" icon={Clock} label="Pending withdrawals" value={s?.pending_withdrawals ?? 0} tone="gold" />
      </div>

      {/* Today (Lagos) */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Today (Lagos)</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        <StatCard testid="today-deposits" icon={ArrowDownToLine} label="Deposits today" value={formatNaira(s?.today?.deposits ?? 0)} sub={`${s?.today?.deposits_count ?? 0} successful`} tone="success" />
        <StatCard testid="today-paid" icon={ArrowUpFromLine} label="Paid out today" value={formatNaira(s?.today?.paid_out ?? 0)} sub={`${s?.today?.paid_out_count ?? 0} payouts`} tone="error" />
        <StatCard testid="today-net" icon={DollarSign} label="Net inflow today" value={formatNaira(s?.today?.net_inflow ?? 0)} sub={(s?.today?.net_inflow ?? 0) >= 0 ? "Inflow positive" : "Withdrawals exceed deposits"} tone="accent" />
        <StatCard testid="today-pending" icon={Clock} label="Pending right now" value={s?.today?.pending_now ?? 0} sub="Awaiting admin action" tone="gold" />
      </div>

      {/* Inflow by date */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Inflow by date</div>
      <div className="card-soft p-5">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RANGES.map((r) => (
            <InflowChip key={r.id} label={r.label} active={range === r.id} onClick={() => setRange(r.id)} />
          ))}
        </div>

        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">From</div>
            <input type="date" value={customFrm} onChange={(e) => setCustomFrm(e.target.value)}
              data-testid="inflow-from" className="input-base px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">To</div>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              data-testid="inflow-to" className="input-base px-3 py-2 text-sm" />
          </div>
          <button onClick={applyCustom} data-testid="inflow-apply"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[color:var(--text-primary)] text-[color:var(--surface)] hover:opacity-90 inline-flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" /> Apply
          </button>
        </div>

        {inflow && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3 mt-5">
              <div className="rounded-2xl p-4 bg-[color:var(--success-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--success)]">Total inflow</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-total">{formatNaira(inflow.total)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{inflow.from} → {inflow.to}</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--accent-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--accent-main)]">Deposits</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-count">{inflow.count}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">completed</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--brand-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--brand)]">Average deposit</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-avg">{formatNaira(inflow.avg)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">per deposit</div>
              </div>
              <div className="rounded-2xl p-4 bg-[color:var(--gold-soft)]">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--warning)]">Peak day</div>
                <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]" data-testid="inflow-peak">{formatNaira(inflow.peak?.total ?? 0)}</div>
                <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{inflow.peak?.date || "—"}</div>
              </div>
            </div>

            {/* Mini bar chart — clickable bars open day drill-down */}
            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-2 flex items-center justify-between">
                <span>{inflow.from} → {inflow.to}</span>
                <span className="hidden sm:inline">tap a bar to view deposits</span>
              </div>
              <div className="bg-[color:var(--surface-alt)] rounded-xl p-3 overflow-x-auto">
                <div className="flex items-end gap-1 h-32 min-w-full" style={{ minWidth: `${Math.max(inflow.series.length * 36, 100)}px` }}>
                  {inflow.series.length === 0 ? (
                    <div className="w-full text-center text-xs text-[color:var(--text-tertiary)] self-center">No deposits in this range.</div>
                  ) : (
                    inflow.series.map((p) => {
                      const empty = p.total <= 0;
                      return (
                        <button
                          key={p.date}
                          type="button"
                          onClick={() => openDrill(p.date)}
                          disabled={empty}
                          data-testid={`bar-${p.date}`}
                          title={`${p.date}: ${formatNaira(p.total)} — click to view deposits`}
                          className={`flex-1 flex flex-col items-center justify-end h-full group ${empty ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        >
                          <div
                            className={`w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-[color:var(--brand)] to-[color:var(--accent-main)] transition-all ${empty ? "" : "group-hover:from-[color:var(--brand-hover)] group-hover:to-[color:var(--accent-hover)] group-hover:scale-105"}`}
                            style={{ height: `${(p.total / maxSeries) * 100}%`, minHeight: empty ? "2px" : "6px" }}
                          />
                          <div className="text-[9px] text-[color:var(--text-secondary)] mt-1 truncate w-full text-center">{p.date.slice(5)}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Gateway breakdown */}
            <div className="mt-5 flex flex-wrap gap-2" data-testid="gateway-breakdown">
              {inflow.gateways.map((g) => (
                <div key={g.name} className="inline-flex items-center gap-2 bg-[color:var(--text-primary)] text-[color:var(--surface)] rounded-full px-3 py-1.5 text-xs">
                  <span className="font-bold uppercase tracking-wider">{g.name}</span>
                  <span>{formatNaira(g.total)}</span>
                  <span className="opacity-60">· {g.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* All time */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">All time</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        <StatCard testid="all-paid" icon={ArrowUpFromLine} label="Total paid out" value={formatNaira(s?.all_time?.total_paid_out ?? 0)} sub={`${s?.all_time?.paid_withdrawals_count ?? 0} settled withdrawals`} tone="brand" />
        <StatCard testid="all-fees" icon={DollarSign} label="Total fees charged" value={formatNaira(s?.all_time?.total_fees ?? 0)} sub="From all withdrawals" tone="success" />
        <StatCard testid="all-await" icon={ScanSearch} label="Awaiting verification" value={s?.all_time?.awaiting_verification ?? 0} tone="error" />
        <StatCard testid="all-invest" icon={TrendingUp} label="Total investments" value={s?.all_time?.total_investments ?? 0} tone="accent" />
      </div>

      {/* System health */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">System health</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card-soft p-5 flex items-center gap-4" data-testid="fraud-attempts">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--error-soft)] text-[color:var(--error)] shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Fraud attempts</div>
            <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{s?.system_health?.fraud_attempts ?? 0}</div>
          </div>
          {(s?.system_health?.fraud_attempts ?? 0) === 0
            ? <CircleCheck className="w-5 h-5 text-[color:var(--success)]" />
            : <CircleAlert className="w-5 h-5 text-[color:var(--error)]" />}
        </div>
        <div className="card-soft p-5 flex items-center gap-4" data-testid="amount-mismatches">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[color:var(--gold-soft)] text-[color:var(--warning)] shrink-0">
            <CircleAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)]">Amount mismatches</div>
            <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{s?.system_health?.amount_mismatches ?? 0}</div>
          </div>
          {(s?.system_health?.amount_mismatches ?? 0) === 0
            ? <CircleCheck className="w-5 h-5 text-[color:var(--success)]" />
            : <CircleAlert className="w-5 h-5 text-[color:var(--error)]" />}
        </div>
      </div>

      {/* Quick actions */}
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] mt-8 mb-2">Quick actions</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 sm:gap-4 gap-3">
        {[
          { to: "/admin/users", icon: Users, label: "Manage Users", tone: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]" },
          { to: "/admin/products", icon: TrendingUp, label: "Products", tone: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]" },
          { to: "/admin/deposits", icon: ArrowDownToLine, label: "Deposits", tone: "bg-[color:var(--success-soft)] text-[color:var(--success)]" },
          { to: "/admin/withdrawals", icon: Banknote, label: "Withdrawals", tone: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]" },
        ].map((q) => (
          <Link key={q.to} to={q.to} data-testid={`quick-${q.to.split("/").pop()}`}
            className="card-soft p-4 flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${q.tone}`}>
                <q.icon className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-[color:var(--text-primary)] truncate">{q.label}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[color:var(--text-tertiary)] shrink-0" />
          </Link>
        ))}
      </div>

      {/* Day drill-down */}
      <Dialog open={!!drillDate} onOpenChange={(o) => { if (!o) { setDrillDate(null); setDrillData(null); } }}>
        <DialogContent data-testid="drill-dialog" className="max-w-2xl w-[calc(100vw-2rem)] rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-[color:var(--border-default)]">
            <DialogTitle className="font-display text-xl text-[color:var(--text-primary)]">
              Deposits on {drillDate}
            </DialogTitle>
            {drillData && (
              <div className="text-sm text-[color:var(--text-secondary)] mt-1">
                <span className="font-bold text-[color:var(--text-primary)]">{formatNaira(drillData.total)}</span> across <span className="font-bold text-[color:var(--text-primary)]">{drillData.count}</span> deposit{drillData.count === 1 ? "" : "s"}
              </div>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {drillLoading && <div className="p-8 text-center text-sm text-[color:var(--text-secondary)]">Loading…</div>}
            {!drillLoading && drillData && drillData.deposits.length === 0 && (
              <div className="p-10 text-center text-sm text-[color:var(--text-tertiary)]">No deposits on this day.</div>
            )}
            {!drillLoading && drillData && drillData.deposits.length > 0 && (
              <div className="divide-y divide-[color:var(--border-light)]" data-testid="drill-list">
                {drillData.deposits.map((d) => (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-3" data-testid={`drill-row-${d.id}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-[color:var(--text-primary)] truncate">{d.user_name}</div>
                      <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{d.user_phone}</div>
                      <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] mt-1 truncate">{d.reference}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-extrabold text-base text-[color:var(--text-primary)]">{formatNaira(d.amount)}</div>
                      <div className="inline-flex items-center gap-1 mt-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{d.method || "paystack"}</span>
                      </div>
                      <div className="text-[10px] text-[color:var(--text-tertiary)] mt-0.5">{formatDate(d.updated_at || d.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
