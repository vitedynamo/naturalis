import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira, timeUntilNextPayout } from "@/lib/format";
import { TrendingUp, Wallet, Sparkles, Users, ArrowDownToLine, ArrowUpFromLine, Clock } from "lucide-react";
import { Link } from "react-router-dom";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="card-soft p-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-label">{label}</div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent || "bg-[#F3F5F1] text-[#0F4C3A]"}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="metric-num text-3xl mt-3">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [investments, setInvestments] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh();
      const { data } = await api.get("/investments");
      if (mounted) setInvestments(data);
    })();
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { mounted = false; clearInterval(i); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = investments.filter((i) => i.status === "active");
  const dailyExpected = active.reduce((s, i) => s + (i.daily_profit_amount || 0), 0);

  return (
    <UserLayout>
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0F4C3A] text-white p-7 md:p-10 grain-overlay animate-fade-up" data-testid="dashboard-hero">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "url(https://static.prod-images.emergentagent.com/jobs/e38e69f9-5b98-4414-80dd-511cf8b129a7/images/2aa38017b0e4d0f7ef14a7bc0e3229dc9e52cf76fb08e5062bf25d734c958d17.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="text-label text-white/70">Good day, {user?.name?.split(" ")[0] || "Investor"}</div>
            <div className="metric-num text-4xl md:text-5xl mt-2 text-white" data-testid="hero-balance">{formatNaira(user?.wallet_balance)}</div>
            <div className="text-white/70 text-sm mt-1">Available wallet balance</div>
          </div>
          <div className="flex gap-3">
            <Link to="/deposit" data-testid="hero-deposit-btn" className="bg-[#00D084] hover:bg-[#00B372] text-[#0A1C16] font-semibold rounded-lg px-5 py-3 inline-flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </Link>
            <Link to="/withdraw" data-testid="hero-withdraw-btn" className="bg-white/10 hover:bg-white/20 border border-white/20 font-semibold rounded-lg px-5 py-3 inline-flex items-center gap-2">
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard icon={TrendingUp} label="Total Earnings" value={formatNaira(user?.total_earnings)} />
        <StatCard icon={Sparkles} label="Daily Expected" value={formatNaira(dailyExpected)} accent="bg-[#FFF5E6] text-[#D97736]" />
        <StatCard icon={Users} label="Referral Earnings" value={formatNaira(user?.referral_earnings)} accent="bg-[#E6FBF3] text-[#007a4d]" />
        <StatCard icon={Wallet} label="Active Plans" value={active.length} accent="bg-[#EEF2FF] text-[#3B82F6]" />
      </div>

      {/* Active investments */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Active Investments</h2>
          <Link to="/invest" data-testid="invest-cta" className="text-sm text-[#0F4C3A] font-semibold underline underline-offset-2">Invest in a plan →</Link>
        </div>
        {active.length === 0 ? (
          <div className="card-soft p-10 text-center">
            <div className="text-[#4A5D54]">No active investments yet.</div>
            <Link to="/invest" className="mt-4 inline-block bg-[#0F4C3A] hover:bg-[#0A3629] text-white px-5 py-2.5 rounded-lg font-semibold" data-testid="empty-invest-btn">
              Browse plans
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((inv) => {
              const pct = Math.min(100, ((inv.days_paid || 0) / inv.duration_days) * 100);
              return (
                <div key={inv.id} className="card-soft p-5" data-testid={`active-inv-${inv.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-semibold">{inv.product_name}</div>
                      <div className="text-xs text-[#8A9C93] mt-0.5">
                        {formatNaira(inv.amount)} · {inv.daily_profit_percent}% daily · {inv.duration_days} days
                      </div>
                    </div>
                    <div className="pill pill-success">Active</div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-[#4A5D54] mb-1">
                      <span>{inv.days_paid}/{inv.duration_days} days paid</span>
                      <span>Earned {formatNaira(inv.total_profit_paid)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F3F5F1] overflow-hidden">
                      <div className="h-full bg-[#00D084]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-[#4A5D54]">
                      <Clock className="w-4 h-4" />
                      <span>Next payout: <span className="font-mono font-semibold text-[#0A1C16]">{timeUntilNextPayout(inv.last_payout_at)}</span></span>
                    </div>
                    <div className="text-xs text-[#8A9C93]">+{formatNaira(inv.daily_profit_amount)}/day</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Hidden tick to drive countdown rerender */}
      <span className="hidden">{tick}</span>
    </UserLayout>
  );
}
