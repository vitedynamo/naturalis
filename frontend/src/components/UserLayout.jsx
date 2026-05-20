import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wallet, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, Users, Ticket, History as HistoryIcon, UserCircle,
  LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";

const items = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/invest", icon: TrendingUp, label: "Invest" },
  { to: "/deposit", icon: ArrowDownToLine, label: "Deposit" },
  { to: "/withdraw", icon: ArrowUpFromLine, label: "Withdraw" },
  { to: "/referrals", icon: Users, label: "Referrals" },
  { to: "/coupons", icon: Ticket, label: "Coupons" },
  { to: "/history", icon: HistoryIcon, label: "History" },
  { to: "/profile", icon: UserCircle, label: "Profile" },
];

export default function UserLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
          {items.map((it) => (
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-[#E5E9E4] px-4 h-14 flex items-center justify-between">
        <div className="font-display font-extrabold text-lg text-[#0F4C3A]">Naija<span className="text-[#00D084]">Invest</span></div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[#8A9C93]">Wallet</div>
            <div className="font-semibold text-sm text-[#0A1C16]" data-testid="topbar-balance">{formatNaira(user?.wallet_balance)}</div>
          </div>
          <button data-testid="open-menu" onClick={() => setOpen(true)} className="p-2 rounded-md hover:bg-[#F3F5F1]">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#E5E9E4]">
              <div className="font-display font-extrabold text-[#0F4C3A]">Menu</div>
              <button data-testid="close-menu" onClick={() => setOpen(false)} className="p-2 rounded-md hover:bg-[#F3F5F1]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? "bg-[#0F4C3A] text-white" : "text-[#4A5D54] hover:bg-[#F3F5F1]"
                    }`
                  }
                >
                  <it.icon className="w-4 h-4" />
                  {it.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#E11D48] hover:bg-rose-50"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 pt-14 lg:pt-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8">{children}</div>
      </main>
    </div>
  );
}
