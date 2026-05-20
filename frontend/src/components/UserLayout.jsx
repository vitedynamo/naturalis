import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Briefcase, Users,
  ArrowDownToLine, ArrowUpFromLine,
  Ticket, History as HistoryIcon, UserCircle,
  LogOut, MoreHorizontal, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

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
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((i) => location.pathname === i.to);

  return (
    <div className="min-h-screen bg-[color:var(--app-bg)] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-[color:var(--surface)] border-r border-[color:var(--border-default)] sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-[color:var(--border-default)] flex items-center justify-between">
          <div>
            <div className="font-display font-extrabold text-2xl tracking-tight text-[color:var(--brand)]">
              Naija<span className="text-[color:var(--accent-main)]">Invest</span>
            </div>
            <div className="text-label mt-1">Daily Returns Platform</div>
          </div>
          <ThemeToggle />
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
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[color:var(--brand)] text-white"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"
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
        <div className="font-display font-extrabold text-lg text-[color:var(--brand)]">
          Naija<span className="text-[color:var(--accent-main)]">Invest</span>
        </div>
        <div className="flex items-center gap-3">
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
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 lg:pt-0 pb-24 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">{children}</div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[color:var(--surface)]/95 backdrop-blur border-t border-[color:var(--border-default)] px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        data-testid="mobile-bottom-nav"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5 gap-1">
          {primaryItems.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                data-testid={`bottom-nav-${it.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors ${
                    isActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-[color:var(--accent-main)]" />
                    )}
                    <it.icon className={`w-5 h-5 ${isActive ? "stroke-[2.4]" : ""}`} />
                    <span>{it.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              data-testid="bottom-nav-more"
              className={`relative w-full flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors ${
                isMoreActive ? "text-[color:var(--brand)]" : "text-[color:var(--text-tertiary)]"
              }`}
            >
              {isMoreActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-[color:var(--accent-main)]" />
              )}
              <MoreHorizontal className="w-5 h-5" />
              <span>More</span>
            </button>
          </li>
        </ul>
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
    </div>
  );
}
