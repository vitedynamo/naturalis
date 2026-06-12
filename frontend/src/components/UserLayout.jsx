import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Briefcase, Users,
  ArrowDownToLine, ArrowUpFromLine,
  Ticket, History as HistoryIcon, UserCircle,
  LogOut, MoreHorizontal, X, Send, MessageCircle,
} from "lucide-react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import { formatNaira } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";
import InAppAnnouncementPopup from "@/components/InAppAnnouncementPopup";

const primaryItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/my-packages", icon: Briefcase, label: "Packages" },
  { to: "/team", icon: Users, label: "Team" },
];

const moreItems = [
  { to: "/deposit", icon: ArrowDownToLine, label: "Deposit" },
  { to: "/withdraw", icon: ArrowUpFromLine, label: "Withdraw" },
  { to: "/coupons", icon: Ticket, label: "Coupons" },
  { to: "/history", icon: HistoryIcon, label: "History" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

const sidebarItems = [...primaryItems, ...moreItems];

export default function UserLayout({ children }) {
  const { user, logout } = useAuth();
  const { logoUrl } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [socials, setSocials] = useState({});

  useEffect(() => {
    // One-shot fetch of public settings for the social links surfaced in the More sheet.
    axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/settings/public`)
      .then(({ data }) => setSocials({
        telegram_url: data?.telegram_url || "",
        telegram_channel_url: data?.telegram_channel_url || "",
        telegram_group_url: data?.telegram_group_url || "",
        whatsapp_channel_url: data?.whatsapp_channel_url || "",
        whatsapp_group_url: data?.whatsapp_group_url || "",
      }))
      .catch(() => {});
  }, []);

  const socialItems = [
    { key: "telegram_url",         label: "Telegram",         href: socials.telegram_url,         color: "#229ED9", icon: Send },
    { key: "telegram_channel_url", label: "Telegram channel", href: socials.telegram_channel_url, color: "#229ED9", icon: Send },
    { key: "telegram_group_url",   label: "Telegram group",   href: socials.telegram_group_url,   color: "#229ED9", icon: Send },
    { key: "whatsapp_channel_url", label: "WhatsApp channel", href: socials.whatsapp_channel_url, color: "#25D366", icon: MessageCircle },
    { key: "whatsapp_group_url",   label: "WhatsApp group",   href: socials.whatsapp_group_url,   color: "#25D366", icon: MessageCircle },
  ].filter((s) => s.href);

  const isMoreActive = moreItems.some((i) => location.pathname === i.to);

  return (
    <div className="user-theme min-h-screen bg-[color:var(--app-bg)] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-[color:var(--app-bg)] border-r border-[color:var(--border-default)] sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-[color:var(--border-default)] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center overflow-hidden shrink-0">
              <img src={logoUrl} alt="Evoque-Nova" className="w-full h-full object-contain p-0.5" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-lg tracking-tight text-[color:var(--brand)] whitespace-nowrap">
                Evoque<span className="text-[color:var(--accent-main)]">-Nova</span>
              </div>
              <div className="text-label mt-0.5 leading-tight">Daily Returns</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="rounded-xl hero-gradient text-white p-4 relative overflow-hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">Wallet Balance</div>
            <div className="metric-num text-3xl mt-1 text-white" data-testid="sidebar-balance">{formatNaira(user?.wallet_balance)}</div>
            <div className="text-[11px] mt-1 opacity-90">{user?.name}</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {sidebarItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.to.replace("/", "")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-[3px] ${
                  isActive
                    ? "border-[color:var(--accent-main)] bg-[color:var(--surface-alt)] text-[color:var(--brand)]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
                }`
              }
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[color:var(--border-default)]">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--error)] hover:bg-[color:var(--error-soft)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-[color:var(--surface)]/95 backdrop-blur border-b border-[color:var(--border-default)] px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center overflow-hidden shrink-0">
            <img src={logoUrl} alt="Evoque-Nova" className="w-full h-full object-contain p-0.5" />
          </div>
          <div className="font-display font-bold text-base text-[color:var(--brand)] whitespace-nowrap">
            Evoque<span className="text-[color:var(--accent-main)]">-Nova</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Wallet</div>
            <div className="font-semibold text-sm text-[color:var(--text-primary)]" data-testid="topbar-balance">
              {formatNaira(user?.wallet_balance)}
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 lg:pt-0 pb-28 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">{children}</div>
      </main>

      {/* MOBILE BOTTOM NAV — floating glass pill with raised active icon */}
      <nav
        className="lg:hidden fixed bottom-4 left-4 right-4 z-40"
        data-testid="mobile-bottom-nav"
        aria-label="Primary"
      >
        <div className="glass-pill rounded-full px-1.5 py-2 flex items-stretch justify-between">
          {primaryItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`bottom-nav-${it.label.toLowerCase()}`}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? "-mt-7 w-12 h-12 rounded-full bg-[color:var(--brand)] text-white shadow-lg shadow-[color:var(--brand)]/30 ring-4 ring-[color:var(--surface)]"
                        : "w-9 h-9 text-[color:var(--text-tertiary)]"
                    }`}
                  >
                    <it.icon className="w-5 h-5" />
                  </span>
                  <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"}`}>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            data-testid="bottom-nav-more"
            className="flex-1 flex flex-col items-center justify-end gap-1"
          >
            <span
              className={`flex items-center justify-center transition-all duration-300 ${
                isMoreActive
                  ? "-mt-7 w-12 h-12 rounded-full bg-[color:var(--brand)] text-white shadow-lg shadow-[color:var(--brand)]/30 ring-4 ring-[color:var(--surface)]"
                  : "w-9 h-9 text-[color:var(--text-tertiary)]"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className={`text-[10px] font-semibold leading-none ${isMoreActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"}`}>More</span>
          </button>
        </div>
      </nav>

      {/* MORE SHEET */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[color:var(--surface)] rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-fade-up shadow-2xl border-t border-[color:var(--border-default)]" data-testid="more-sheet">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-label">Menu</div>
                <div className="font-display text-xl font-semibold mt-0.5 text-[color:var(--text-primary)]">{user?.name}</div>
              </div>
              <button onClick={() => setMoreOpen(false)} data-testid="close-more" className="p-2 rounded-full hover:bg-[color:var(--surface-alt)]">
                <X className="w-5 h-5 text-[color:var(--text-primary)]" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {moreItems.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setMoreOpen(false)}
                  data-testid={`more-${it.label.toLowerCase()}`}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--surface-2)] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--surface)] flex items-center justify-center text-[color:var(--brand)]">
                    <it.icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-[color:var(--text-primary)]">{it.label}</span>
                </NavLink>
              ))}
            </div>
            {socialItems.length > 0 && (
              <div className="mt-5" data-testid="more-socials">
                <div className="text-label mb-2">Join our community</div>
                <div className="grid grid-cols-1 gap-2">
                  {socialItems.map((s) => {
                    const Icon = s.icon;
                    return (
                      <a
                        key={s.key}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        data-testid={`more-social-${s.key}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[color:var(--surface-alt)] hover:bg-[color:var(--surface-2)] transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: s.color }}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-sm text-[color:var(--text-primary)] flex-1">{s.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Open</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              onClick={() => { logout(); navigate("/login"); }}
              data-testid="more-logout"
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[color:var(--error-soft)] text-[color:var(--error)] font-semibold"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
      <InAppAnnouncementPopup />
    </div>
  );
}
