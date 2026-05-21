import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import {
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, Sparkles, Gift, Ticket, Users, RefreshCcw,
} from "lucide-react";

const types = [
  { v: "", label: "All" },
  { v: "deposit", label: "Deposits" },
  { v: "withdrawal", label: "Withdrawals" },
  { v: "profit", label: "Profits" },
];

const meta = {
  deposit:    { icon: ArrowDownToLine, color: "var(--success)",     soft: "var(--success-soft)" },
  withdrawal: { icon: ArrowUpFromLine, color: "var(--error)",       soft: "var(--error-soft)" },
  invest:     { icon: TrendingUp,      color: "var(--brand)",       soft: "var(--brand-soft)" },
  profit:     { icon: Sparkles,        color: "var(--accent-main)", soft: "var(--accent-soft)" },
  referral:   { icon: Users,           color: "var(--brand)",       soft: "var(--brand-soft)" },
  bonus:      { icon: Gift,            color: "var(--gold)",        soft: "var(--gold-soft)" },
  coupon:     { icon: Ticket,          color: "var(--accent-main)", soft: "var(--accent-soft)" },
  refund:     { icon: RefreshCcw,      color: "var(--text-tertiary)", soft: "var(--surface-alt)" },
};

export default function History() {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/transactions", { params: filter ? { ttype: filter } : {} })
      .then(({ data }) => setItems(data));
  }, [filter]);

  return (
    <UserLayout>
      <div className="overflow-x-hidden" data-testid="history-root">
      <div className="text-label">Wallet log</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-[color:var(--text-primary)]">Transaction History</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Every credit and debit on your wallet, in one place.</p>

      <div className="flex flex-wrap gap-2 mt-5 pb-1" data-testid="history-filters">
        {types.map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)} data-testid={`filter-${t.v || "all"}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === t.v
                ? "bg-[color:var(--brand)] text-white border-[color:var(--brand)]"
                : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: card list */}
      <div className="mt-5 space-y-2 md:hidden" data-testid="history-list-mobile">
        {items.map((t) => {
          const m = meta[t.type] || meta.refund;
          const Icon = m.icon;
          const credit = t.amount >= 0;
          return (
            <div key={t.id} className="card-soft p-3 flex items-center gap-3" data-testid={`tx-${t.id}`}>
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: m.soft, color: m.color }}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[color:var(--text-primary)] text-sm capitalize truncate">{t.type}</div>
                  <div className={`font-bold text-sm shrink-0 ${credit ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
                    {credit ? "+" : ""}{formatNaira(t.amount)}
                  </div>
                </div>
                <div className="text-xs text-[color:var(--text-secondary)] truncate">{t.description || "—"}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[10px] text-[color:var(--text-tertiary)]">{formatDate(t.created_at)}</div>
                  <div className="text-[10px] text-[color:var(--text-tertiary)] font-mono">Bal {formatNaira(t.balance_after, { compact: true })}</div>
                </div>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="card-soft p-8 text-center text-[color:var(--text-tertiary)]">No transactions.</div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block mt-5 card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]" data-testid="history-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Type</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Description</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Balance</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => {
                const m = meta[t.type] || meta.refund;
                const Icon = m.icon;
                return (
                  <tr key={t.id} className="border-t border-[color:var(--border-default)]">
                    <td className="p-3">
                      <div className="inline-flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
                              style={{ background: m.soft, color: m.color }}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="capitalize font-medium text-[color:var(--text-primary)]">{t.type}</span>
                      </div>
                    </td>
                    <td className="p-3 text-[color:var(--text-secondary)]">{t.description}</td>
                    <td className={`p-3 text-right font-semibold ${t.amount >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
                      {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
                    </td>
                    <td className="p-3 text-right font-mono text-[color:var(--text-primary)]">{formatNaira(t.balance_after)}</td>
                    <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap">{formatDate(t.created_at)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-[color:var(--text-tertiary)]">No transactions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </UserLayout>
  );
}
