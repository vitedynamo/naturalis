import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, timeUntilNextPayout } from "@/lib/format";
import { Briefcase, Clock, CheckCircle2, Calendar, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export default function MyPackages() {
  const [items, setItems] = useState([]);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/investments").then(({ data }) => setItems(data));
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const filtered = items.filter((i) => filter === "all" ? true : i.status === filter);
  const totalActiveAmount = items.filter(i => i.status === "active").reduce((s, i) => s + i.amount, 0);
  const totalProfit = items.reduce((s, i) => s + (i.total_profit_paid || 0), 0);

  return (
    <UserLayout>
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-label flex items-center gap-2"><Briefcase className="w-3 h-3" /> My investments</div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-[color:var(--text-primary)]">My Packages</h1>
        </div>
        <Link to="/invest" data-testid="invest-more" className="btn-accent text-sm">+ New plan</Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-soft p-4 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-[color:var(--brand-soft)] opacity-50" />
          <div className="text-label relative">Active capital</div>
          <div className="metric-num text-2xl mt-1 relative" data-testid="active-capital">{formatNaira(totalActiveAmount)}</div>
        </div>
        <div className="card-soft p-4 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-[color:var(--accent-soft)] opacity-60" />
          <div className="text-label relative">Total profit earned</div>
          <div className="metric-num text-2xl mt-1 text-[color:var(--accent-main)] relative" data-testid="total-profit">{formatNaira(totalProfit)}</div>
        </div>
      </div>

      <div className="flex gap-2 mt-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{v:"all",l:"All"},{v:"active",l:"Active"},{v:"completed",l:"Completed"}].map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)} data-testid={`pkg-filter-${t.v}`}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border ${
              filter === t.v ? "bg-[color:var(--brand)] text-white border-[color:var(--brand)]" : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
            }`}>{t.l}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        {filtered.map((inv, idx) => {
          const pct = Math.min(100, ((inv.days_paid || 0) / inv.duration_days) * 100);
          const active = inv.status === "active";
          return (
            <div key={inv.id} className="card-soft p-5 relative overflow-hidden animate-fade-up"
                 style={{ animationDelay: `${idx * 60}ms` }}
                 data-testid={`pkg-${inv.id}`}>
              {/* Top stripe with status color */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${active ? "bg-[color:var(--accent-main)]" : "bg-[color:var(--success)]"}`} />

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${active ? "bg-[color:var(--brand-soft)] text-[color:var(--brand)]" : "bg-[color:var(--success-soft)] text-[color:var(--success)]"}`}>
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-lg text-[color:var(--text-primary)] truncate">{inv.product_name}</div>
                    <div className="text-xs text-[color:var(--text-secondary)]">
                      {inv.daily_profit_percent}% daily · {inv.duration_days} days
                    </div>
                  </div>
                </div>
                {active
                  ? <div className="pill pill-success shrink-0">Active</div>
                  : <div className="pill pill-neutral shrink-0"><CheckCircle2 className="w-3 h-3" /> Done</div>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Invested</div>
                  <div className="font-bold text-sm text-[color:var(--text-primary)] mt-0.5">{formatNaira(inv.amount)}</div>
                </div>
                <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Earned</div>
                  <div className="font-bold text-sm text-[color:var(--accent-main)] mt-0.5">{formatNaira(inv.total_profit_paid)}</div>
                </div>
                <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Per day</div>
                  <div className="font-bold text-sm text-[color:var(--text-primary)] mt-0.5">{formatNaira(inv.daily_profit_amount)}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-[color:var(--text-secondary)] mb-1.5">
                  <span className="font-semibold">{inv.days_paid}/{inv.duration_days} days paid</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[color:var(--surface-alt)] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-[color:var(--text-secondary)]" data-testid={`pkg-${inv.id}-started`}>
                  <Calendar className="w-3.5 h-3.5 text-[color:var(--brand)]" />
                  <span>Invested <span className="font-semibold text-[color:var(--text-primary)]">{formatDate(inv.started_at)}</span></span>
                </div>
                {active ? (
                  <div className="flex items-center gap-1.5 text-[color:var(--text-secondary)]">
                    <Clock className="w-3.5 h-3.5 text-[color:var(--accent-main)]" />
                    <span className="font-mono font-semibold text-[color:var(--text-primary)]">{timeUntilNextPayout(inv.last_payout_at)}</span>
                  </div>
                ) : (
                  <div className="text-[color:var(--text-tertiary)]">Ended {formatDate(inv.completed_at)}</div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full card-soft p-10 text-center">
            <div className="text-[color:var(--text-secondary)]">No {filter === "all" ? "" : filter} packages yet.</div>
            <Link to="/invest" className="mt-4 inline-block btn-primary">Browse plans</Link>
          </div>
        )}
      </div>

      <span className="hidden">{tick}</span>
    </UserLayout>
  );
}
