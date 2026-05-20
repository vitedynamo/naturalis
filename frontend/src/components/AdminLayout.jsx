import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Gauge, Users, Package, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, Share2, Ticket, Settings as SettingsIcon, KeyRound, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

const items = [
  { to: "/admin", icon: Gauge, label: "Overview", end: true },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/deposits", icon: ArrowDownToLine, label: "Deposits" },
  { to: "/admin/withdrawals", icon: ArrowUpFromLine, label: "Withdrawals" },
  { to: "/admin/investments", icon: TrendingUp, label: "Investments" },
  { to: "/admin/referrals", icon: Share2, label: "Referrals" },
  { to: "/admin/coupons", icon: Ticket, label: "Coupons" },
  { to: "/admin/password-resets", icon: KeyRound, label: "Password Resets" },
  { to: "/admin/settings", icon: SettingsIcon, label: "Settings" },
];

export default function AdminLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const Sidebar = (
    <>
      <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="font-display font-extrabold text-xl tracking-tight">
            Naija<span className="text-[color:var(--accent-main)]">Invest</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1">Admin Console</div>
        </div>
        <ThemeToggle />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={() => setOpen(false)}
            data-testid={`admin-nav-${it.to.split("/").pop() || "root"}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-[color:var(--accent-main)] text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <it.icon className="w-4 h-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="px-3 py-2 text-xs text-white/60">{user?.name}</div>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          data-testid="admin-logout-btn"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--error)] hover:bg-[color:var(--error-soft)]0/10"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[color:var(--app-bg)]">
      <aside className="w-64 hidden md:flex flex-col bg-[#0F0F25] text-white">
        {Sidebar}
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-[#0F0F25] text-white flex flex-col">
            <div className="flex justify-end p-2">
              <button onClick={() => setOpen(false)} className="p-2"><X className="w-5 h-5" /></button>
            </div>
            {Sidebar}
          </aside>
        </div>
      )}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-[color:var(--surface)]/85 backdrop-blur border-b border-[color:var(--border-default)] px-6 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button data-testid="admin-open-menu" onClick={() => setOpen(true)} className="md:hidden p-2 rounded-md hover:bg-[color:var(--surface-alt)]">
              <Menu className="w-5 h-5 text-[color:var(--text-primary)]" />
            </button>
            <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]" data-testid="admin-page-title">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex pill pill-success" data-testid="admin-online">Online</span>
            <span className="md:hidden"><ThemeToggle /></span>
          </div>
        </header>
        <div className="p-6 md:p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
