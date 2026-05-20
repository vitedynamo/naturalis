import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, ArrowDownToLine, ArrowUpFromLine,
  Users, Ticket, History as HistoryIcon, UserCircle,
  LogOut, MoreHorizontal, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";

const primaryItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/deposit", icon: ArrowDownToLine, label: "Deposit" },
  { to: "/withdraw", icon: ArrowUpFromLine, label: "Withdraw" },
];

const moreItems = [
  { to: "/referrals", icon: Users, label: "Referrals" },
  { to: "/coupons", icon: Ticket, label: "Coupons" },
  { to: "/history", icon: HistoryIcon, label: "History" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

const allItems = [...primaryItems, ...moreItems];

export default function UserLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((i) => location.pathname === i.to);

  return (
    <div className="min-h-screen bg-[#F9FAF8] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-[#E5E9E4] sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-[#E5E9E4]">
          <div className="font-display font-extrabold text-2xl tracking-tight text-[#0F4C3A]">
            Naija<span className="text-[#00D084]">Invest</span>
          </div>
          <div className="text-label mt-1">Daily Returns Platform</div>
        </div>
        <div className="px-4 py-3">
          <div className="rounded-xl bg-[#0F4C3A] text-white p-4 relative overflow-hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Wallet Balance</div>
            <div className="metric-num text-3xl mt-1" data-testid="sidebar-balance">{formatNaira(user?.wallet_balance)}</div>
            <div className="text-[11px] mt-1 opacity-80">{user?.name}</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {allItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.to.replace("/", "")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#0F4C3A] text-white"
                    : "text-[#4A5D54] hover:bg-[#F3F5F1]"
                }`
              }
            >
              <it.icon className="w-4 h-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[#E5E9E4]">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#E11D48] hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white/85 backdrop-blur border-b border-[#E5E9E4] px-4 h-14 flex items-center justify-between">
        <div className="font-display font-extrabold text-lg text-[#0F4C3A]">
          Naija<span className="text-[#00D084]">Invest</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#8A9C93]">Wallet</div>
          <div className="font-semibold text-sm text-[#0A1C16]" data-testid="topbar-balance">
            {formatNaira(user?.wallet_balance)}
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 pt-14 lg:pt-0 pb-24 lg:pb-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">{children}</div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-[#E5E9E4] pl-2 pr-28 sm:pr-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
                    isActive ? "text-[#0F4C3A]" : "text-[#8A9C93] hover:text-[#0A1C16]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-[#00D084]" />
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
                isMoreActive ? "text-[#0F4C3A]" : "text-[#8A9C93] hover:text-[#0A1C16]"
              }`}
            >
              {isMoreActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-[#00D084]" />
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-fade-up shadow-2xl" data-testid="more-sheet">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-label">Menu</div>
                <div className="font-display text-xl font-semibold mt-0.5">{user?.name}</div>
              </div>
              <button onClick={() => setMoreOpen(false)} data-testid="close-more" className="p-2 rounded-full hover:bg-[#F3F5F1]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {moreItems.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setMoreOpen(false)}
                  data-testid={`more-${it.label.toLowerCase()}`}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-[#F3F5F1] hover:bg-[#E5E9E4] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#0F4C3A]">
                    <it.icon className="w-5 h-5" />
                  </div>
                  <span className="font-semibold text-[#0A1C16]">{it.label}</span>
                </NavLink>
              ))}
            </div>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              data-testid="more-logout"
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-[#9c1239] font-semibold"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
