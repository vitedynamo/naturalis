import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, Sparkles, Users, Ticket, Flame, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    (async () => {
      await refresh();
      const { data } = await api.get("/products");
      setProducts(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick the most lucrative plan as the featured one
  const featured = [...products].sort(
    (a, b) => (b.daily_profit_percent * b.duration_days) - (a.daily_profit_percent * a.duration_days),
  )[0];
  const recommended = products.filter((p) => !featured || p.id !== featured.id).slice(0, 4);

  return (
    <UserLayout>
      {/* Wallet hero */}
      <div className="relative overflow-hidden rounded-2xl hero-gradient grain text-white p-6 md:p-9 animate-fade-up" data-testid="dashboard-hero">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/75">Good day, {user?.name?.split(" ")[0] || "Investor"}</div>
            <div className="metric-num text-4xl md:text-5xl mt-2 text-white" data-testid="hero-balance">{formatNaira(user?.wallet_balance)}</div>
            <div className="text-white/75 text-sm mt-1">Available wallet balance</div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Link to="/deposit" data-testid="hero-deposit-btn" className="flex-1 md:flex-none bg-white text-[color:var(--brand)] hover:bg-white/90 font-semibold rounded-xl px-5 py-3.5 inline-flex items-center justify-center gap-2 shadow-lg shadow-black/10">
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </Link>
            <Link to="/withdraw" data-testid="hero-withdraw-btn" className="flex-1 md:flex-none bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-white font-semibold rounded-xl px-5 py-3.5 inline-flex items-center justify-center gap-2">
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw
            </Link>
          </div>
        </div>
      </div>

      {/* Featured plan (revenue driver) */}
      {featured && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-5 animate-fade-up">
          <div className="md:col-span-3 card-soft overflow-hidden relative" data-testid="featured-plan">
            <div className="absolute top-4 right-4 pill pill-accent">
              <Flame className="w-3 h-3" /> Hot pick
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="aspect-[4/3] sm:aspect-auto bg-[color:var(--surface-alt)]">
                {featured.image_url ? (
                  <img src={resolveUrl(featured.image_url)} alt={featured.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[color:var(--text-tertiary)]">No image</div>
                )}
              </div>
              <div className="p-5 flex flex-col justify-between">
                <div>
                  <div className="text-label">Featured Plan</div>
                  <h3 className="font-display text-2xl font-bold mt-1 text-[color:var(--text-primary)]">{featured.name}</h3>
                  <p className="text-sm text-[color:var(--text-secondary)] mt-2 line-clamp-3">{featured.description}</p>
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="bg-[color:var(--surface-alt)] rounded-lg p-2">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Daily</div>
                      <div className="font-bold text-[color:var(--accent-main)]">{featured.daily_profit_percent}%</div>
                    </div>
                    <div className="bg-[color:var(--surface-alt)] rounded-lg p-2">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Days</div>
                      <div className="font-bold text-[color:var(--text-primary)]">{featured.duration_days}</div>
                    </div>
                    <div className="bg-[color:var(--surface-alt)] rounded-lg p-2">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">ROI</div>
                      <div className="font-bold text-[color:var(--brand)]">{(featured.daily_profit_percent * featured.duration_days).toFixed(0)}%</div>
                    </div>
                  </div>
                  <Link to="/invest" data-testid="featured-cta" className="mt-4 w-full inline-flex items-center justify-center gap-2 btn-primary">
                    Invest from {formatNaira(featured.price)} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 gap-3">
            <Link to="/team" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-team">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand)] flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold">Invite & earn</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Earn 10% / 5% / 2% across 3 generations</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
            <Link to="/coupons" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-coupon">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] flex items-center justify-center">
                <Ticket className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold">Got a coupon?</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Redeem promo codes for instant cash</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
            <Link to="/my-packages" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-packages">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--gold-soft)] text-[color:var(--gold)] flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold">Your packages</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Track active investments & profits</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
          </div>
        </div>
      )}

      {/* Recommended plans */}
      <div className="mt-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-label flex items-center gap-2"><TrendingUp className="w-3 h-3" /> Recommended for you</div>
            <h2 className="font-display text-2xl font-semibold tracking-tight mt-1 text-[color:var(--text-primary)]">Top earning plans</h2>
          </div>
          <Link to="/invest" data-testid="see-all-plans" className="text-sm text-[color:var(--brand)] font-semibold hover:underline underline-offset-2">View all →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recommended.map((p, idx) => (
            <Link key={p.id} to="/invest" data-testid={`reco-${p.id}`} className="card-soft overflow-hidden hover:-translate-y-0.5 transition-transform animate-fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
              <div className="aspect-[4/3] bg-[color:var(--surface-alt)] flex items-center justify-center">
                {p.image_url ? (
                  <img src={resolveUrl(p.image_url)} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-[color:var(--text-tertiary)] text-xs">No image</div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-display font-semibold text-[color:var(--text-primary)]">{p.name}</div>
                  <div className="pill pill-success text-[11px]">{p.daily_profit_percent}%/d</div>
                </div>
                <div className="mt-2 text-xs text-[color:var(--text-secondary)]">{p.duration_days} days · ROI {(p.daily_profit_percent * p.duration_days).toFixed(0)}%</div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[color:var(--brand)]">{formatNaira(p.price)}</div>
                  <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
                </div>
              </div>
            </Link>
          ))}
          {recommended.length === 0 && (
            <div className="col-span-full card-soft p-8 text-center text-[color:var(--text-tertiary)]">Plans will appear here soon.</div>
          )}
        </div>
      </div>
    </UserLayout>
  );
}

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}
