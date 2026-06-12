import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Users, Ticket, Sparkles, Flame, ArrowRight, Megaphone, Send, Sparkle, Gift, Briefcase, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const FEATURED_FALLBACK_BG = "https://images.unsplash.com/photo-1677611998429-1baa4371456b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGZvcmVzdCUyMGdyZWVuJTIwZ2VvbWV0cmljJTIwdGV4dHVyZXxlbnwwfHx8fDE3ODEyNzMwODN8MA&ixlib=rb-4.1.0&q=85";
const WELCOME_ART = "https://images.unsplash.com/photo-1777576968636-efa4ed929c9a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwbW9uZXklMjB3ZWFsdGglMjBjb25jZXB0JTIwdGVycmFjb3R0YSUyMHNhbmR8ZW58MHx8fHwxNzgxMjczMDgzfDA&ixlib=rb-4.1.0&q=85";

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

/* Daily reward — dense structural status banner */
function DailyClaimBanner({ onClaimed }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
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
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 1400);
      const fresh = await api.get("/daily-claim/status");
      setStatus(fresh.data);
      onClaimed?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Claim failed");
    } finally { setBusy(false); }
  };
  return (
    <div
      className="mt-7 rounded-[var(--radius)] p-4 sm:p-5 relative overflow-hidden border border-[color:var(--border-default)] bg-[color:var(--surface-alt)] animate-fade-up flex items-center gap-4"
      data-testid="daily-claim-card"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          {ready && <span className="animate-claim-pulse absolute inline-flex w-full h-full rounded-full bg-[color:var(--success)] opacity-70" />}
          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${ready ? "bg-[color:var(--success)]" : "bg-[color:var(--text-tertiary)]"}`} />
        </span>
        <div className="min-w-0">
          <div className="font-body text-[10px] uppercase tracking-[0.2em] font-bold text-[color:var(--text-tertiary)]">Daily reward</div>
          <div className="font-display font-medium text-lg leading-tight text-[color:var(--text-primary)] mt-0.5">
            {formatNaira(status.amount)}
            {!ready && <span className="font-mono text-xs text-[color:var(--text-secondary)] ml-2">· {fmtCountdown(status.cooldown_remaining_sec)}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={claim}
        disabled={!ready || busy}
        data-testid="daily-claim-btn"
        className={`shrink-0 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
          justClaimed
            ? "bg-[color:var(--success)] text-white"
            : ready
              ? "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] hover:-translate-y-0.5"
              : "bg-[color:var(--surface-2)] text-[color:var(--text-tertiary)] cursor-not-allowed"
        } disabled:cursor-not-allowed`}
      >
        {justClaimed ? <><Check className="w-4 h-4" /> Claimed</> : <><Sparkles className="w-4 h-4" /> {busy ? "Claiming…" : ready ? "Claim now" : "Locked"}</>}
      </button>
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
      if (s.welcome_modal_active !== false) setWelcomeOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWelcome = () => setWelcomeOpen(false);

  const featured =
    products.find((p) => p.id === settings.featured_product_id) ||
    [...products].sort(
      (a, b) => (b.daily_profit_percent * b.duration_days) - (a.daily_profit_percent * a.duration_days),
    )[0];

  const firstName = user?.name?.split(" ")[0] || "Investor";
  const featuredEnabled = settings.home_featured_plan_enabled !== false;
  const secondaryEnabled = settings.home_secondary_section_enabled !== false;
  const showImage = settings.home_below_featured_mode === "image" && settings.home_below_featured_image_url;

  return (
    <UserLayout>
      {/* ===== Typographic balance hero (no card) ===== */}
      <section className="pt-1 animate-fade-up" data-testid="dashboard-hero">
        <div className="font-body text-xs font-bold uppercase tracking-[0.22em] text-[color:var(--text-tertiary)]">Good day, {firstName}</div>
        <div className="font-body text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mt-5">Total balance</div>
        <div
          className="metric-num text-5xl sm:text-6xl text-[color:var(--text-primary)] leading-none mt-2 break-all"
          data-testid="hero-balance"
          style={{ textShadow: "0 2px 28px rgba(10,77,46,0.14)" }}
        >
          {formatNaira(user?.wallet_balance)}
        </div>
        <div className="flex gap-3 mt-7">
          <Link
            to="/deposit"
            data-testid="hero-deposit-btn"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-[color:var(--accent-main)] text-white font-semibold shadow-md shadow-[color:var(--accent-main)]/25 hover:bg-[color:var(--accent-hover)] hover:-translate-y-0.5 transition-all"
          >
            <ArrowDownToLine className="w-4 h-4" /> Deposit
          </Link>
          <Link
            to="/withdraw"
            data-testid="hero-withdraw-btn"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-[color:var(--border-default)] text-[color:var(--text-primary)] font-semibold hover:bg-[color:var(--surface-alt)] transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4" /> Withdraw
          </Link>
        </div>
      </section>

      {/* ===== Daily reward ===== */}
      <DailyClaimBanner onClaimed={refresh} />

      {/* ===== Announcement (editorial) ===== */}
      {settings.home_announcement_active && (settings.home_announcement || settings.home_announcement_image_url) && (
        <div className="mt-5 rounded-[var(--radius)] overflow-hidden border border-[color:var(--border-light)] bg-[color:var(--brand-soft)] animate-fade-up" data-testid="home-announcement">
          {settings.home_announcement_image_url && (
            <img src={resolveUrl(settings.home_announcement_image_url)} alt="Announcement"
                 className="w-full max-h-56 object-cover" data-testid="home-announcement-image" />
          )}
          {settings.home_announcement && (
            <div className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[color:var(--surface)] text-[color:var(--brand)] flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="text-sm text-[color:var(--text-primary)] whitespace-pre-wrap">{settings.home_announcement}</div>
            </div>
          )}
        </div>
      )}

      {/* ===== Featured plan — immersive poster ===== */}
      {featured && featuredEnabled && (
        <div className="mt-6 animate-fade-up">
          <div className="relative overflow-hidden rounded-[var(--radius)] aspect-[4/3] sm:aspect-[16/9] border border-[color:var(--border-default)]" data-testid="featured-plan">
            {featured.image_url ? (
              <img src={resolveUrl(featured.image_url)} alt={featured.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <img src={FEATURED_FALLBACK_BG} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
            <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
              <Flame className="w-3 h-3" /> Hot pick
            </span>
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-white">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/70">Featured plan</div>
              <h3 className="font-display text-2xl sm:text-3xl font-semibold mt-1 leading-tight">{featured.name}</h3>
              <p className="text-sm text-white/75 mt-1.5 line-clamp-2 max-w-xl">{featured.description}</p>
              <div className="grid grid-cols-3 gap-2 mt-4 max-w-md">
                {[
                  { label: "Daily", value: `${featured.daily_profit_percent}%` },
                  { label: "Days", value: featured.duration_days },
                  { label: "Total ROI", value: `${(featured.daily_profit_percent * featured.duration_days).toFixed(0)}%` },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-white/10 backdrop-blur px-3 py-2.5 border border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-white/60 font-bold">{m.label}</div>
                    <div className="font-mono font-semibold text-base mt-0.5">{m.value}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/invest"
                data-testid="featured-cta"
                className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[color:var(--brand)] text-white font-semibold hover:bg-[color:var(--brand-hover)] hover:-translate-y-0.5 transition-all"
              >
                Invest from {formatNaira(featured.price)} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ===== Secondary section — independent toggle ===== */}
      {secondaryEnabled && (
        showImage ? (
          <div className="mt-6 rounded-[var(--radius)] overflow-hidden border border-[color:var(--border-default)] animate-fade-up" data-testid="home-below-featured-image">
            <img src={resolveUrl(settings.home_below_featured_image_url)} alt="Investment packages" className="w-full object-cover" />
          </div>
        ) : (
          <div className="mt-7 animate-fade-up">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)] mb-3">Quick actions</div>
            <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 snap-x pb-1">
              {[
                { to: "/team", icon: Users, tone: "brand", title: "Invite & earn", sub: `Earn ${settings.gen1_percent || 10}% / ${settings.gen2_percent || 5}% across 2 generations`, testid: "cta-team" },
                { to: "/coupons", icon: Ticket, tone: "accent", title: "Got a coupon?", sub: "Redeem promo codes for instant cash", testid: "cta-coupon" },
                { to: "/my-packages", icon: Briefcase, tone: "gold", title: "Your packages", sub: "Track active investments & profits", testid: "cta-packages" },
              ].map((c) => {
                const tones = {
                  brand: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
                  accent: "bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]",
                  gold: "bg-[color:var(--gold-soft)] text-[color:var(--gold)]",
                };
                return (
                  <Link
                    key={c.to}
                    to={c.to}
                    data-testid={c.testid}
                    className="snap-start shrink-0 w-[62%] sm:w-auto card-soft p-4 flex flex-col gap-3 min-h-[150px] hover:-translate-y-0.5 transition-transform"
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tones[c.tone]}`}>
                      <c.icon className="w-5 h-5" />
                    </div>
                    <div className="mt-auto">
                      <div className="font-display font-semibold text-[color:var(--text-primary)]">{c.title}</div>
                      <div className="text-xs text-[color:var(--text-secondary)] mt-1 leading-snug">{c.sub}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ===== Welcome modal — glassmorphism ===== */}
      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) closeWelcome(); }}>
        <DialogContent
          data-testid="welcome-modal"
          className="user-theme duration-500 w-[calc(100vw-2rem)] max-w-md rounded-[1.25rem] overflow-hidden p-0 border border-[color:var(--border-default)] shadow-2xl bg-[color:var(--surface)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative h-40 overflow-hidden">
            <img src={WELCOME_ART} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--surface)] via-transparent to-transparent" />
          </div>
          <div className="px-6 pt-4 pb-6">
            <div className="inline-flex items-center gap-1.5 text-[color:var(--accent-main)] text-[10px] uppercase tracking-[0.18em] font-bold">
              <Sparkle className="w-3 h-3" /> Welcome aboard
            </div>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl md:text-3xl font-semibold mt-2 text-[color:var(--text-primary)]" data-testid="welcome-modal-title">
                {(() => {
                  const tpl = settings.welcome_modal_title;
                  if (tpl && tpl.trim()) return tpl.replace(/\{name\}/g, firstName);
                  return `Hi ${firstName} — welcome to Evoque-Nova`;
                })()}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap" data-testid="welcome-message">
              {settings.welcome_message ||
                "Earn daily returns on every plan you fund. Top up your wallet, pick a plan, and watch your profit land every 24 hours. Refer friends to earn across 2 generations."}
            </p>
            <DialogFooter className="flex-col sm:flex-col gap-3 mt-5">
              <Link
                to="/deposit"
                onClick={closeWelcome}
                data-testid="welcome-bonus-cta"
                className="w-full inline-flex items-center justify-center gap-2 bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)] text-white font-semibold rounded-full px-5 py-3 shadow-md shadow-[color:var(--accent-main)]/25 transition-colors"
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
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#229ED9] hover:bg-[#1f8fc4] text-white font-semibold rounded-full px-5 py-3 shadow-md transition-colors"
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
