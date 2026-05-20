import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate, timeUntilNextPayout } from "@/lib/format";
import { Briefcase, Clock, CheckCircle2 } from "lucide-react";
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
        <div className="card-soft p-4">
          <div className="text-label">Active capital</div>
          <div className="metric-num text-2xl mt-1">{formatNaira(totalActiveAmount)}</div>
        </div>
        <div className="card-soft p-4">
          <div className="text-label">Total profit earned</div>
          <div className="metric-num text-2xl mt-1 text-[color:var(--accent-main)]">{formatNaira(totalProfit)}</div>
        </div>
      </div>

      <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
        {[{v:"all",l:"All"},{v:"active",l:"Active"},{v:"completed",l:"Completed"}].map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)} data-testid={`pkg-filter-${t.v}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border ${
              filter === t.v ? "bg-[color:var(--brand)] text-white border-[color:var(--brand)]" : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
            }`}>{t.l}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        {filtered.map((inv) => {
          const pct = Math.min(100, ((inv.days_paid || 0) / inv.duration_days) * 100);
          const active = inv.status === "active";
          return (
            <div key={inv.id} className="card-soft p-5" data-testid={`pkg-${inv.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display font-semibold text-[color:var(--text-primary)]">{inv.product_name}</div>
                  <div className="text-xs text-[color:var(--text-tertiary)] mt-0.5">
                    {formatNaira(inv.amount)} · {inv.daily_profit_percent}% daily · {inv.duration_days} days
                  </div>
                </div>
                {active
                  ? <div className="pill pill-success">Active</div>
                  : <div className="pill pill-neutral"><CheckCircle2 className="w-3 h-3" /> Completed</div>}
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-[color:var(--text-secondary)] mb-1">
                  <span>{inv.days_paid}/{inv.duration_days} days</span>
                  <span>Earned {formatNaira(inv.total_profit_paid)}</span>
                </div>
                <div className="h-2 rounded-full bg-[color:var(--surface-alt)] overflow-hidden">
                  <div className="h-full bg-[color:var(--accent-main)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                {active ? (
                  <div className="flex items-center gap-2 text-[color:var(--text-secondary)]">
                    <Clock className="w-4 h-4" />
                    <span>Next payout: <span className="font-mono font-semibold text-[color:var(--text-primary)]">{timeUntilNextPayout(inv.last_payout_at)}</span></span>
                  </div>
                ) : (
                  <div className="text-[color:var(--text-tertiary)] text-xs">Completed {formatDate(inv.completed_at)}</div>
                )}
                <div className="text-xs text-[color:var(--text-tertiary)]">+{formatNaira(inv.daily_profit_amount)}/day</div>
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
