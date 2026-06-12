import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira } from "@/lib/format";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const FEATURED_FALLBACK_BG =
  "https://images.unsplash.com/photo-1527576539890-dfa815648363?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwaGlnaCUyMGVuZCUyMGJsYWNrJTIwYW5kJTIwd2hpdGUlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzgxMjk1NzczfDA&ixlib=rb-4.1.0&q=85";
const WELCOME_ART =
  "https://images.unsplash.com/photo-1658165598588-eac23c4d76ff?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwxfHxtb25vY2hyb21lJTIwcGF0dGVybiUyMHRleHR1cmV8ZW58MHx8fHwxNzgxMjk1NzY3fDA&ixlib=rb-4.1.0&q=85";

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

function fmtCountdown(sec) {
  if (sec <= 0) return "READY";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ===== Top announcement marquee ===== */
function Ticker({ settings }) {
  const announce =
    settings.home_announcement_active && settings.home_announcement
      ? settings.home_announcement.replace(/\s+/g, " ").trim()
      : null;
  const base = announce
    ? [announce]
    : ["Daily returns, paid every 24h", "Refer & earn across 2 generations", "Withdraw anytime", "Naturalis — grow with confidence"];
  const items = [...base, ...base, ...base];
  const line = (
    <span className="lh-marquee-track lh-mono text-[11px] tracking-[0.18em] uppercase py-2">
      {items.map((t, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="px-5">{t}</span>
          <span className="text-[color:var(--lh-accent)]">/</span>
        </span>
      ))}
    </span>
  );
  return (
    <div
      className="lh-marquee-wrap overflow-hidden bg-[color:var(--lh-fg)] text-[color:var(--lh-bg)] border-b border-[color:var(--lh-line)]"
      data-testid="home-announcement-ticker"
    >
      <div className="relative whitespace-nowrap">{line}</div>
    </div>
  );
}

/* ===== Daily reward — terminal row ===== */
function DailyReward({ onClaimed }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get("/daily-claim/status").then(({ data }) => { if (!cancelled) setStatus(data); }).catch(() => {});
    const t = setInterval(
      () => setStatus((s) => (s ? { ...s, cooldown_remaining_sec: Math.max(0, s.cooldown_remaining_sec - 1) } : s)),
      1000,
    );
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
      className="flex items-center justify-between gap-4 px-6 lg:px-8 py-6 border-b border-[color:var(--lh-line)]"
      data-testid="daily-claim-card"
    >
      <div className="min-w-0">
        <div className="lh-mono text-[10px] tracking-[0.24em] uppercase text-[color:var(--lh-muted)] flex items-center gap-2">
          <span className={`w-1.5 h-1.5 ${ready ? "bg-[color:var(--lh-accent)]" : "bg-[color:var(--lh-muted)]"}`} />
          Daily reward
        </div>
        <div className="lh-mono text-2xl sm:text-3xl tracking-tighter mt-2">
          {formatNaira(status.amount)}
          {!ready && <span className="text-sm text-[color:var(--lh-muted)] ml-3">{fmtCountdown(status.cooldown_remaining_sec)}</span>}
        </div>
      </div>
      <button
        onClick={claim}
        disabled={!ready || busy}
        data-testid="daily-claim-btn"
        className={`shrink-0 lh-mono text-xs uppercase tracking-widest px-6 py-4 transition-colors duration-150 ${
          justClaimed
            ? "bg-[color:var(--lh-accent)] text-[color:var(--lh-accent-ink)]"
            : ready
              ? "bg-[color:var(--lh-fg)] text-[color:var(--lh-bg)] hover:bg-[color:var(--lh-accent)] hover:text-[color:var(--lh-accent-ink)]"
              : "bg-transparent border border-[color:var(--lh-line)] text-[color:var(--lh-muted)] cursor-not-allowed"
        }`}
      >
        {justClaimed ? (
          <span className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Claimed</span>
        ) : busy ? "Claiming" : ready ? "Claim" : "Locked"}
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const { settings } = useSettings();
  const [products, setProducts] = useState([]);
  const [welcomeOpen, setWelcomeOpen] = useState(settings.welcome_modal_active !== false);

  useEffect(() => {
    (async () => {
      await refresh();
      const { data: ps } = await api.get("/products");
      setProducts(ps);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWelcome = () => setWelcomeOpen(false);

  const featured =
    products.find((p) => p.id === settings.featured_product_id) ||
    [...products].sort(
      (a, b) => (b.daily_profit_percent * b.duration_days) - (a.daily_profit_percent * a.duration_days),
    )[0];

  const firstName = (user?.name?.split(" ")[0] || "Investor").toUpperCase();
  const today = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const featuredEnabled = settings.home_featured_plan_enabled !== false;
  const secondaryEnabled = settings.home_secondary_section_enabled !== false;
  const showImage = settings.home_below_featured_mode === "image" && settings.home_below_featured_image_url;

  const indexLinks = [
    { to: "/invest", label: "Browse plans", note: "Start a new investment", testid: "cta-invest" },
    { to: "/team", label: "Invite & earn", note: `Earn ${settings.gen1_percent || 10}% / ${settings.gen2_percent || 5}% · 2 generations`, testid: "cta-team" },
    { to: "/my-packages", label: "Your packages", note: "Track active investments", testid: "cta-packages" },
    { to: "/coupons", label: "Redeem a coupon", note: "Promo codes for instant cash", testid: "cta-coupon" },
    { to: "/history", label: "Transaction history", note: "Every credit & debit", testid: "cta-history" },
  ];

  return (
    <UserLayout>
      <div
        className="ledger-home -mx-4 sm:-mx-6 lg:-mx-10 -mt-6 lg:-mt-8 -mb-6 lg:-mb-8 min-h-[80vh] border-x-0 lg:border-x border-[color:var(--lh-line)]"
        data-testid="dashboard-hero"
      >
        {/* ===== Ticker ===== */}
        <Ticker settings={settings} />

        {/* ===== Editorial greeting ===== */}
        <div className="px-6 lg:px-8 pt-7 pb-6 border-b border-[color:var(--lh-line)]" data-testid="home-greeting">
          <div className="lh-mono text-[10px] tracking-[0.24em] text-[color:var(--lh-muted)]">{today}</div>
          <h1 className="lh-display text-3xl sm:text-4xl mt-2 leading-[0.95]">Good day,<br />{firstName}</h1>
        </div>

        {/* ===== Ledger vault — balance ===== */}
        <div className="px-6 lg:px-8 py-12 sm:py-14 border-b border-[color:var(--lh-line)]" data-testid="wallet-balance-display">
          <div className="lh-mono text-[10px] tracking-[0.26em] text-[color:var(--lh-muted)]">TOTAL LEDGER BALANCE — NGN</div>
          <div className="lh-mono text-5xl sm:text-7xl tracking-tighter mt-5 break-all leading-none" data-testid="hero-balance">
            {formatNaira(user?.wallet_balance)}
          </div>
        </div>

        {/* ===== Split brutalist actions ===== */}
        <div className="grid grid-cols-2 border-b border-[color:var(--lh-line)]" data-testid="primary-actions-grid">
          <Link
            to="/deposit"
            data-testid="hero-deposit-btn"
            className="group relative px-6 py-7 sm:py-8 bg-[color:var(--lh-accent)] text-[color:var(--lh-accent-ink)] flex flex-col items-start justify-between gap-6 min-h-[120px] transition-opacity hover:opacity-90"
          >
            <span className="lh-mono text-[10px] tracking-[0.2em]">01 / FUND</span>
            <span className="lh-display text-2xl sm:text-3xl inline-flex items-center gap-2">
              Deposit <ArrowUpRight className="w-6 h-6 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </span>
          </Link>
          <Link
            to="/withdraw"
            data-testid="hero-withdraw-btn"
            className="group relative px-6 py-7 sm:py-8 bg-[color:var(--lh-bg)] text-[color:var(--lh-fg)] border-l border-[color:var(--lh-line)] flex flex-col items-start justify-between gap-6 min-h-[120px] transition-colors duration-150 hover:bg-[color:var(--lh-fg)] hover:text-[color:var(--lh-bg)]"
          >
            <span className="lh-mono text-[10px] tracking-[0.2em] text-[color:var(--lh-muted)] group-hover:text-[color:var(--lh-bg)]">02 / CASH OUT</span>
            <span className="lh-display text-2xl sm:text-3xl inline-flex items-center gap-2">
              Withdraw <ArrowUpRight className="w-6 h-6 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </span>
          </Link>
        </div>

        {/* ===== Daily reward ===== */}
        <DailyReward onClaimed={refresh} />

        {/* ===== Featured plan — prospectus ===== */}
        {featured && featuredEnabled && (
          <div className="relative w-full h-[420px] sm:h-[460px] border-b border-[color:var(--lh-line)] overflow-hidden" data-testid="featured-plan">
            <img
              src={featured.image_url ? resolveUrl(featured.image_url) : FEATURED_FALLBACK_BG}
              alt={featured.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
            <span className="absolute top-5 left-6 lh-mono text-[10px] tracking-[0.24em] text-white/90 border border-white/40 px-3 py-1.5">
              FEATURED PROSPECTUS
            </span>
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8 text-white">
              <h3 className="lh-display text-3xl sm:text-5xl leading-[0.9]">{featured.name}</h3>
              <p className="text-sm text-white/70 mt-3 max-w-md line-clamp-2">{featured.description}</p>
              <div className="grid grid-cols-3 gap-4 border-t border-white/25 pt-4 mt-5 lh-mono">
                {[
                  { label: "DAILY", value: `${featured.daily_profit_percent}%` },
                  { label: "DURATION", value: `${featured.duration_days}D` },
                  { label: "TOTAL ROI", value: `${(featured.daily_profit_percent * featured.duration_days).toFixed(0)}%` },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="text-[9px] tracking-[0.2em] text-white/55">{m.label}</div>
                    <div className="text-xl sm:text-2xl mt-1 tracking-tight">{m.value}</div>
                  </div>
                ))}
              </div>
              <Link
                to="/invest"
                data-testid="featured-cta"
                className="group mt-6 inline-flex items-center justify-between gap-6 w-full sm:w-auto bg-white text-black px-7 py-4 lh-mono text-xs uppercase tracking-widest hover:bg-[color:var(--lh-accent)] hover:text-white transition-colors duration-150"
              >
                Invest from {formatNaira(featured.price)}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        )}

        {/* ===== Secondary — image OR index list ===== */}
        {secondaryEnabled && (
          showImage ? (
            <div className="border-b border-[color:var(--lh-line)]" data-testid="home-below-featured-image">
              <img src={resolveUrl(settings.home_below_featured_image_url)} alt="Investment packages" className="w-full object-cover" />
            </div>
          ) : (
            <div data-testid="quick-actions-list">
              <div className="px-6 lg:px-8 pt-7 pb-3">
                <div className="lh-mono text-[10px] tracking-[0.26em] text-[color:var(--lh-muted)]">INDEX — QUICK ACTIONS</div>
              </div>
              {indexLinks.map((c, i) => (
                <Link
                  key={c.to}
                  to={c.to}
                  data-testid={c.testid}
                  className="group flex items-center justify-between gap-4 px-6 lg:px-8 py-6 border-t border-[color:var(--lh-line)] last:border-b transition-colors duration-150 hover:bg-[color:var(--lh-fg)] hover:text-[color:var(--lh-bg)]"
                >
                  <div className="flex items-center gap-5 min-w-0">
                    <span className="lh-mono text-xs text-[color:var(--lh-muted)] group-hover:text-[color:var(--lh-bg)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="lh-display text-lg sm:text-xl">{c.label}</div>
                      <div className="text-xs text-[color:var(--lh-muted)] group-hover:text-[color:var(--lh-bg)]/70 mt-0.5">{c.note}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1.5" />
                </Link>
              ))}
            </div>
          )
        )}
      </div>

      {/* ===== Welcome modal — stark overlay ===== */}
      <Dialog open={welcomeOpen} onOpenChange={(o) => { if (!o) closeWelcome(); }}>
        <DialogContent
          data-testid="welcome-modal"
          className="ledger-home p-0 gap-0 w-[calc(100vw-2rem)] max-w-sm rounded-none border-2 border-[color:var(--lh-fg)] bg-[color:var(--lh-bg)] text-[color:var(--lh-fg)] shadow-[8px_8px_0_0_var(--lh-fg)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="relative h-28 overflow-hidden border-b-2 border-[color:var(--lh-fg)]">
            <img src={WELCOME_ART} alt="" className="w-full h-full object-cover grayscale" />
            <div className="absolute inset-0 bg-[color:var(--lh-bg)]/30" />
          </div>
          <div className="p-7">
            <div className="lh-mono text-[10px] tracking-[0.26em] text-[color:var(--lh-accent)]">WELCOME ABOARD</div>
            <DialogTitle className="lh-display text-3xl mt-3 leading-[0.95] font-normal" data-testid="welcome-modal-title">
              {(() => {
                const tpl = settings.welcome_modal_title;
                if (tpl && tpl.trim()) return tpl.replace(/\{name\}/g, firstName);
                return `Hi ${firstName}`;
              })()}
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm text-[color:var(--lh-muted)] leading-relaxed whitespace-pre-wrap" data-testid="welcome-message">
              {settings.welcome_message ||
                "Earn daily returns on every plan you fund. Top up, pick a plan, and watch profit land every 24 hours. Refer friends to earn across 2 generations."}
            </DialogDescription>
            <Link
              to="/deposit"
              onClick={closeWelcome}
              data-testid="welcome-bonus-cta"
              className="mt-6 w-full inline-flex items-center justify-between gap-4 bg-[color:var(--lh-accent)] text-[color:var(--lh-accent-ink)] px-5 py-4 lh-mono text-xs uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Claim {formatNaira(settings.welcome_bonus ?? 750)} bonus
              <ArrowRight className="w-4 h-4" />
            </Link>
            {settings.telegram_url && (
              <a
                href={settings.telegram_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeWelcome}
                data-testid="welcome-telegram-btn"
                className="mt-3 w-full inline-flex items-center justify-between gap-4 border border-[color:var(--lh-fg)] px-5 py-4 lh-mono text-xs uppercase tracking-widest hover:bg-[color:var(--lh-fg)] hover:text-[color:var(--lh-bg)] transition-colors duration-150"
              >
                Join Telegram
                <ArrowUpRight className="w-4 h-4" />
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
