import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { ArrowLeft, TrendingUp, TrendingDown, Gift, Ticket, Share2, Coins, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

function MoneyRow({ icon: Icon, label, amount, count, tone, sign = "+" }) {
  const tones = {
    in: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    out: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  };
  return (
    <div className="flex items-center gap-4 py-3 border-b border-[color:var(--border-default)] last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[color:var(--text-primary)] text-sm">{label}</div>
        <div className="text-xs text-[color:var(--text-tertiary)] mt-0.5">{count.toLocaleString()} transactions</div>
      </div>
      <div className={`font-display font-extrabold tabular-nums text-lg ${tone === "in" ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>
        {sign}{formatNaira(Math.abs(amount))}
      </div>
    </div>
  );
}

function RecentList({ title, items, money_key = "amount" }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="card-soft p-5" data-testid={`recent-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-label">{title}</div>
      <div className="mt-3 space-y-2">
        {items.slice(0, 5).map((it) => (
          <div key={it.id} className="flex items-center justify-between text-xs border-b border-[color:var(--border-default)] pb-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[color:var(--text-primary)] truncate">{it.user_name || it.account_name || "—"}</div>
              <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{it.user_phone || ""}</div>
              <div className="text-[10px] text-[color:var(--text-tertiary)] truncate">{it.description || ""}</div>
            </div>
            <div className="text-right ml-2 shrink-0">
              <div className="font-semibold text-[color:var(--text-primary)] tabular-nums">{formatNaira(it[money_key])}</div>
              <div className="text-[10px] text-[color:var(--text-tertiary)]">{formatDate(it.created_at || it.updated_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminProfitBreakdown() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/stats/profit-breakdown").then(({ data }) => setData(data)).catch(() => {}); }, []);

  return (
    <AdminLayout title="">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--brand)]" data-testid="back-to-dashboard">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="mt-2 text-label">P&amp;L breakdown</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)]" data-testid="profit-breakdown-title">Platform profit</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">All-time inflow versus everything paid out of the platform's pocket.</p>

      {!data && <div className="card-soft p-6 mt-6 text-center text-[color:var(--text-tertiary)]">Loading…</div>}

      {data && (
        <>
          {/* Net hero */}
          <div className="rounded-3xl p-6 md:p-8 text-white relative overflow-hidden bg-gradient-to-br from-[color:var(--accent-main)] via-[#E11D74] to-[color:var(--brand)] shadow-xl shadow-[color:var(--accent-main)]/30 mt-6" data-testid="net-profit-card">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/85">Net platform profit</div>
            <div className="font-display font-extrabold text-4xl md:text-5xl mt-2 leading-none" data-testid="net-profit-value">{formatNaira(data.net_profit)}</div>
            <div className="text-white/80 text-xs mt-3 font-mono">{data.formula}</div>
          </div>

          {/* Inflow */}
          <div className="card-soft p-5 mt-5">
            <div className="text-label flex items-center gap-2 text-[color:var(--success)]"><TrendingUp className="w-3.5 h-3.5" /> Inflow</div>
            <div className="mt-2 divide-y divide-[color:var(--border-default)]">
              <MoneyRow icon={ArrowDownToLine} label="Successful deposits" amount={data.inflow.total_deposits} count={data.inflow.count} tone="in" sign="+" />
            </div>
          </div>

          {/* Outflow */}
          <div className="card-soft p-5 mt-5">
            <div className="text-label flex items-center gap-2 text-[color:var(--error)]"><TrendingDown className="w-3.5 h-3.5" /> Outflow</div>
            <div className="mt-2 divide-y divide-[color:var(--border-default)]">
              <MoneyRow icon={ArrowUpFromLine} label="Paid withdrawals" amount={data.outflow.paid_withdrawals.total} count={data.outflow.paid_withdrawals.count} tone="out" sign="−" />
              <MoneyRow icon={Gift} label="Welcome bonuses credited" amount={data.outflow.welcome_bonuses.total} count={data.outflow.welcome_bonuses.count} tone="out" sign="−" />
              <MoneyRow icon={Ticket} label="Coupon redemptions" amount={data.outflow.coupon_redemptions.total} count={data.outflow.coupon_redemptions.count} tone="out" sign="−" />
              <MoneyRow icon={Share2} label="Referral commissions paid" amount={data.outflow.referral_commissions.total} count={data.outflow.referral_commissions.count} tone="out" sign="−" />
              <MoneyRow icon={Coins} label="Daily profits credited" amount={data.outflow.daily_profit_credits.total} count={data.outflow.daily_profit_credits.count} tone="out" sign="−" />
            </div>
          </div>

          {/* Recent contributors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <RecentList title="Latest welcome bonuses" items={data.recent.welcome_bonuses} />
            <RecentList title="Latest coupon redemptions" items={data.recent.coupons} />
            <RecentList title="Latest referral payouts" items={data.recent.referrals} />
            <RecentList title="Latest daily profit credits" items={data.recent.profits} />
          </div>
        </>
      )}
    </AdminLayout>
  );
}
