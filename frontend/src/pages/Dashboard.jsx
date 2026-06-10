import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Users, Ticket, Sparkles, Flame, ArrowRight, Megaphone, Send, Sparkle, Gift, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

function fmtCountdown(sec) {
  if (sec <= 0) return "Ready";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DailyClaimCard({ onClaimed }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.get("/daily-claim/status")
        .then(({ data }) => { if (!cancelled) setStatus(data); })
        .catch(() => {});
    load();
    const t = setInterval(() => setStatus((s) => s ? { ...s, cooldown_remaining_sec: Math.max(0, s.cooldown_remaining_sec - 1) } : s), 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  if (!status || !status.enabled) return null;
  const ready = status.can_claim || status.cooldown_remaining_sec === 0;
  const claim = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/daily-claim/claim");
      toast.success(`+${data.amount.toLocaleString()} added to wallet`);
      const fresh = await api.get("/daily-claim/status");
      setStatus(fresh.data);
      onClaimed?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Claim failed");
    } finally { setBusy(false); }
  };
  return (
    <div
      className="mt-6 rounded-lg p-5 relative overflow-hidden card-soft animate-fade-up border border-[color:var(--gold)]/40"
      style={{ boxShadow: "inset 0 0 30px var(--gold-soft)" }}
      data-testid="daily-claim-card"
    >
      <div className="absolute -top-10 -right-8 w-36 h-36 rounded-full bg-[color:var(--gold-soft)] blur-2xl pointer-events-none" />
      <div className="relative flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-[color:var(--gold-soft)] text-[color:var(--gold)] flex items-center justify-center shrink-0 border border-[color:var(--gold)]/30">
          <Gift className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] font-medium text-[color:var(--text-tertiary)]">Daily reward</div>
          <div className="font-display font-bold text-xl mt-1 leading-none text-[color:var(--text-primary)]">{formatNaira(status.amount)} <span className="text-[color:var(--text-tertiary)] text-sm font-normal">every 24h</span></div>
          {!ready && (
            <div className="mt-1.5 text-[11px] text-[color:var(--text-secondary)] inline-flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> next claim in <span className="font-mono font-bold tabular-nums tracking-widest text-[color:var(--gold)]">{fmtCountdown(status.cooldown_remaining_sec)}</span>
            </div>
          )}
        </div>
        <button
          onClick={claim}
          disabled={!ready || busy}
          data-testid="daily-claim-btn"
          className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${ready ? "bg-[color:var(--gold)] text-black hover:bg-[color:var(--accent-hover)] hover:scale-105" : "bg-[color:var(--surface-alt)] text-[color:var(--text-tertiary)] cursor-not-allowed grayscale"} disabled:cursor-not-allowed`}
        >
          <Sparkles className="w-4 h-4" /> {busy ? "Claiming…" : ready ? "Claim" : "Locked"}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    (async () => {
      await refresh();
      const [{ data: ps }, { data: s }] = await Promise.all([
        api.get("/products"),
        api.get("/settings/public"),
      ]);
      setProducts(ps);
      setSettings(s);
      // Show welcome modal every time the user opens the homepage, unless admin disabled it
      if (s.welcome_modal_active !== false) {
        setWelcomeOpen(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWelcome = () => {
    setWelcomeOpen(false);
  };

  // Featured = admin-selected, else highest ROI
  const featured =
    products.find((p) => p.id === settings.featured_product_id) ||
    [...products].sort(
      (a, b) => (b.daily_profit_percent * b.duration_days) - (a.daily_profit_percent * a.duration_days),
    )[0];

  return (
    <UserLayout>
      {/* Wallet hero */}
      <div className="relative overflow-hidden rounded-lg hero-gradient grain text-white p-6 md:p-9 animate-fade-up" data-testid="dashboard-hero">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.24em] font-medium text-white/70">Wallet balance · {user?.name?.split(" ")[0] || "Investor"}</div>
            <div className="metric-num text-5xl md:text-6xl mt-3 text-white tracking-tighter tabular-nums" data-testid="hero-balance">{formatNaira(user?.wallet_balance)}</div>
            <div className="text-white/65 text-sm mt-2">Available to invest or withdraw</div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Link to="/deposit" data-testid="hero-deposit-btn" className="flex-1 md:flex-none bg-[color:var(--gold)] text-black hover:bg-[color:var(--accent-hover)] font-semibold rounded-lg px-5 py-3.5 inline-flex items-center justify-center gap-2 shadow-lg shadow-black/20 transition-colors">
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </Link>
            <Link to="/withdraw" data-testid="hero-withdraw-btn" className="flex-1 md:flex-none bg-white/10 hover:bg-white/20 backdrop-blur border border-white/25 text-white font-semibold rounded-lg px-5 py-3.5 inline-flex items-center justify-center gap-2 transition-colors">
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw
            </Link>
          </div>
        </div>
      </div>

      {/* Admin-controlled announcement banner */}
      {settings.home_announcement_active && (settings.home_announcement || settings.home_announcement_image_url) && (
        <div className="mt-5 card-soft overflow-hidden border-l-4 border-[color:var(--accent-main)] animate-fade-up" data-testid="home-announcement">
          {settings.home_announcement_image_url && (
            <img src={resolveUrl(settings.home_announcement_image_url)} alt="Announcement"
                 className="w-full max-h-56 object-cover" data-testid="home-announcement-image" />
          )}
          {settings.home_announcement && (
            <div className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="text-sm text-[color:var(--text-primary)] whitespace-pre-wrap">{settings.home_announcement}</div>
            </div>
          )}
        </div>
      )}

      {/* Daily sign-in bonus */}
      <DailyClaimCard onClaimed={refresh} />

      {/* Featured plan (admin-controlled) */}
      {featured && (settings.home_featured_plan_enabled !== false) && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-5 animate-fade-up">
          <div className="md:col-span-3 card-soft overflow-hidden relative" data-testid="featured-plan">
            <div className="absolute top-4 right-4 pill pill-accent z-10">
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
            {settings.home_below_featured_mode === "image" && settings.home_below_featured_image_url ? (
              <div className="card-soft overflow-hidden p-0" data-testid="home-below-featured-image">
                <img
                  src={resolveUrl(settings.home_below_featured_image_url)}
                  alt="Investment packages"
                  className="w-full h-full object-cover min-h-[260px]"
                />
              </div>
            ) : (
              <>
                <Link to="/team" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-team">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--brand-soft)] text-[color:var(--brand)] flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-[color:var(--text-primary)]">Invite & earn</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Earn {settings.gen1_percent || 10}% / {settings.gen2_percent || 5}% across 2 generations</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
            <Link to="/coupons" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-coupon">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent-main)] flex items-center justify-center">
                <Ticket className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-[color:var(--text-primary)]">Got a coupon?</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Redeem promo codes for instant cash</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
            <Link to="/my-packages" className="card-soft p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-transform" data-testid="cta-packages">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--gold-soft)] text-[color:var(--gold)] flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold text-[color:var(--text-primary)]">Your packages</div>
                <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Track active investments & profits</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[color:var(--text-tertiary)]" />
            </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Welcome modal — admin-configurable, shown on every homepage visit */}
      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) closeWelcome(); }}>
        <DialogContent
          data-testid="welcome-modal"
          className="user-theme duration-500 w-[calc(100vw-2rem)] max-w-md rounded-lg overflow-hidden p-0 border-0 shadow-2xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="hero-gradient grain text-white px-6 pt-6 pb-8 relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-2 text-white/85 text-[10px] uppercase tracking-[0.18em] font-bold">
              <Sparkle className="w-3 h-3" /> Welcome aboard
            </div>
            <DialogHeader>
              <DialogTitle className="text-white font-display text-2xl md:text-3xl font-extrabold mt-2" data-testid="welcome-modal-title">
                {(() => {
                  const firstName = user?.name?.split(" ")[0] || "there";
                  const tpl = settings.welcome_modal_title;
                  if (tpl && tpl.trim()) return tpl.replace(/\{name\}/g, firstName);
                  return `Hi ${firstName} — welcome to Evoque-Nova`;
                })()}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-3 text-white/90 text-sm leading-relaxed whitespace-pre-wrap" data-testid="welcome-message">
              {settings.welcome_message ||
                "Earn daily returns on every plan you fund. Top up your wallet, pick a plan, and watch your profit land every 24 hours. Refer friends to earn across 2 generations."}
            </p>
          </div>

          <div className="px-6 py-5 bg-[color:var(--surface)]">
            <DialogFooter className="flex-col sm:flex-col gap-3">
              <Link
                to="/deposit"
                onClick={closeWelcome}
                data-testid="welcome-bonus-cta"
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)] hover:from-[color:var(--brand-hover)] hover:to-[color:var(--accent-hover)] text-white font-semibold rounded-xl px-5 py-3 shadow-lg shadow-[color:var(--brand)]/20 transition-all"
              >
                <Sparkles className="w-4 h-4" /> Get started — claim your {formatNaira(settings.welcome_bonus ?? 750)} bonus
              </Link>
              {settings.telegram_url && (
                <a
                  href={settings.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeWelcome}
                  data-testid="welcome-telegram-btn"
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#229ED9] hover:bg-[#1f8fc4] text-white font-semibold rounded-xl px-5 py-3 shadow-md transition-colors"
                >
                  <Send className="w-4 h-4" /> Join our Telegram group
                </a>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
