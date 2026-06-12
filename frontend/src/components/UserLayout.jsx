import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Briefcase, Users,
  ArrowDownToLine, ArrowUpFromLine,
  Ticket, History as HistoryIcon, UserCircle,
  LogOut, MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import { useSettings } from "@/context/SettingsContext";
import { formatNaira } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";
import InAppAnnouncementPopup from "@/components/InAppAnnouncementPopup";

const primaryItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/my-packages", icon: Briefcase, label: "Packages" },
  { to: "/team", icon: Users, label: "Team" },
];

export const moreItems = [
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
  const { loaded: settingsReady } = useSettings();
  const navigate = useNavigate();

  return (
    <div className="user-theme min-h-screen bg-[color:var(--app-bg)] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-[color:var(--app-bg)] border-r border-[color:var(--border-default)] sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-[color:var(--border-default)] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center overflow-hidden shrink-0">
              <img src={logoUrl} alt="Naturalis" className="w-full h-full object-contain p-0.5" />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-lg tracking-tight text-[color:var(--brand)] whitespace-nowrap">
                Natura<span className="text-[color:var(--accent-main)]">lis</span>
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
            <img src={logoUrl} alt="Naturalis" className="w-full h-full object-contain p-0.5" />
          </div>
          <div className="font-display font-bold text-base text-[color:var(--brand)] whitespace-nowrap">
            Natura<span className="text-[color:var(--accent-main)]">lis</span>
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
          {settingsReady ? children : (
            <div className="flex items-center justify-center py-32" data-testid="settings-loading">
              <div className="w-8 h-8 rounded-full border-2 border-[color:var(--border-default)] border-t-[color:var(--brand)] animate-spin" />
            </div>
          )}
        </div>
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
          <NavLink
            to="/more"
            data-testid="bottom-nav-more"
            className="flex-1 flex flex-col items-center justify-end gap-1"
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
                  <MoreHorizontal className="w-5 h-5" />
                </span>
                <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"}`}>More</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

      <InAppAnnouncementPopup />
    </div>
  );
}
