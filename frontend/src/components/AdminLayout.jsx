import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Users, Package, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, Share2, Ticket, Settings as SettingsIcon, KeyRound, LogOut, Menu, X,
  Megaphone, SlidersHorizontal, ShieldAlert, FileBarChart2, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";

const items = [
  { to: "/admin", icon: LayoutGrid, label: "Dashboard", end: true },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/deposits", icon: ArrowDownToLine, label: "Deposits" },
  { to: "/admin/withdrawals", icon: ArrowUpFromLine, label: "Withdrawals" },
  { to: "/admin/investments", icon: TrendingUp, label: "Investments" },
  { to: "/admin/referrals", icon: Share2, label: "Referrals" },
  { to: "/admin/coupons", icon: Ticket, label: "Coupons" },
  { to: "/admin/announcements", icon: Megaphone, label: "Announcements" },
  { to: "/admin/manual-adjustments", icon: SlidersHorizontal, label: "Manual Adjustments" },
  { to: "/admin/fraud-monitor", icon: ShieldAlert, label: "Fraud Monitor" },
  { to: "/admin/financial-report", icon: FileBarChart2, label: "Financial Report" },
  { to: "/admin/password-resets", icon: KeyRound, label: "Password Resets" },
  { to: "/admin/settings", icon: SettingsIcon, label: "Settings" },
];

function Brand() {
  return (
    <div className="px-5 pt-5 pb-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[color:var(--accent-main)] to-[color:var(--brand)] flex items-center justify-center font-display font-extrabold text-white text-lg shadow-lg shadow-[color:var(--accent-main)]/30">
        NI
      </div>
      <div className="leading-tight">
        <div className="font-display font-extrabold text-[color:var(--text-primary)] text-base tracking-tight">NAIJAINVEST</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-tertiary)] mt-0.5">Admin Panel</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children, title }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const SidebarBody = (
    <>
      <Brand />

      <nav className="flex-1 px-3 pt-2 pb-4 space-y-0.5 overflow-y-auto">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={() => setOpen(false)}
            data-testid={`admin-nav-${it.to.split("/").pop() || "root"}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[color:var(--accent-main)] text-white shadow-md shadow-[color:var(--accent-main)]/25"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--text-primary)]"
              }`
            }
          >
            <it.icon className="w-4 h-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-[color:var(--border-default)] space-y-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[color:var(--surface-alt)]">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] font-bold">Theme</span>
          <ThemeToggle />
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          data-testid="admin-view-as-user"
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          <span>View as user</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          data-testid="admin-logout-btn"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[color:var(--error)] hover:bg-[color:var(--error-soft)] transition-colors"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[color:var(--app-bg)]">
      {/* Desktop sidebar */}
      <aside className="w-64 hidden md:flex flex-col bg-[color:var(--surface)] border-r border-[color:var(--border-default)]">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-[color:var(--surface)] border-r border-[color:var(--border-default)] flex flex-col">
            <div className="flex justify-end p-2">
              <button onClick={() => setOpen(false)} className="p-2 rounded-md hover:bg-[color:var(--surface-alt)]">
                <X className="w-5 h-5 text-[color:var(--text-primary)]" />
              </button>
            </div>
            {SidebarBody}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-[color:var(--surface)]/85 backdrop-blur border-b border-[color:var(--border-default)] px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button data-testid="admin-open-menu" onClick={() => setOpen(true)} className="md:hidden p-2 rounded-md hover:bg-[color:var(--surface-alt)]">
              <Menu className="w-5 h-5 text-[color:var(--text-primary)]" />
            </button>
            <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]" data-testid="admin-page-title">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex pill pill-success" data-testid="admin-online">Online</span>
          </div>
        </header>
        <div className="p-5 md:p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
