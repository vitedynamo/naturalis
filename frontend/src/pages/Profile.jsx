import React, { useEffect, useMemo, useRef, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Lock, Building2, Save, Search, ChevronDown, Check, Loader2, BadgeCheck } from "lucide-react";

function BankPicker({ value, banks, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = useMemo(() => banks.find((b) => b.code === value?.bank_code) || banks.find((b) => b.name === value?.bank_name) || null, [banks, value]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(ql) || b.code.includes(ql));
  }, [banks, q]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="bank-picker-trigger"
        className="w-full mt-2 flex items-center justify-between gap-3 px-3 py-2.5 input-base text-left"
      >
        <span className={selected ? "text-[color:var(--text-primary)] font-semibold" : "text-[color:var(--text-tertiary)]"}>
          {selected ? selected.name : "Select your bank"}
        </span>
        <ChevronDown className={`w-4 h-4 text-[color:var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-2 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-default)] shadow-2xl overflow-hidden" data-testid="bank-picker-dropdown">
          <div className="px-3 py-2 border-b border-[color:var(--border-default)] sticky top-0 bg-[color:var(--surface)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search 100+ Nigerian banks…"
                data-testid="bank-search"
                className="w-full pl-8 pr-3 py-2 text-sm bg-[color:var(--surface-alt)] border border-[color:var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-[color:var(--text-tertiary)]">No bank matches "{q}"</div>
            )}
            {filtered.map((b) => {
              const active = selected?.code === b.code;
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => { onSelect(b); setOpen(false); setQ(""); }}
                  data-testid={`bank-option-${b.code}`}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-[color:var(--surface-alt)] transition-colors ${active ? "bg-[color:var(--brand-soft)]" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--text-primary)] truncate">{b.name}</div>
                    <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{b.code}</div>
                  </div>
                  {active && <Check className="w-4 h-4 text-[color:var(--brand)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const [banks, setBanks] = useState([]);
  const [bank, setBank] = useState({
    bank_name: user?.bank_name || "",
    bank_code: user?.bank_code || "",
    account_number: user?.account_number || "",
    account_name: user?.account_name || "",
  });
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(!!user?.account_name);
  const [pwd, setPwd] = useState({ old_password: "", new_password: "" });

  useEffect(() => {
    api.get("/banks").then(({ data }) => setBanks(data)).catch(() => setBanks([]));
  }, []);

  // Auto-resolve account name when bank + 10-digit number are present
  useEffect(() => {
    setResolved(false);
    const num = (bank.account_number || "").trim();
    if (!bank.bank_code || num.length !== 10 || !/^\d{10}$/.test(num)) {
      return;
    }
    let cancelled = false;
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post("/banks/resolve", { account_number: num, bank_code: bank.bank_code });
        if (cancelled) return;
        setBank((b) => ({ ...b, account_name: data.account_name }));
        setResolved(true);
      } catch (e) {
        if (cancelled) return;
        setBank((b) => ({ ...b, account_name: "" }));
        toast.error(e?.response?.data?.detail || "Could not verify account");
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank.bank_code, bank.account_number]);

  const saveBank = async (e) => {
    e.preventDefault();
    if (!bank.account_name) {
      toast.error("Verify your account first");
      return;
    }
    try {
      await api.put("/profile/bank", bank);
      toast.success("Bank details updated");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const changePwd = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/change-password", pwd);
      toast.success("Password changed");
      setPwd({ old_password: "", new_password: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <UserLayout>
      <div className="text-label">Account</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="card-soft p-6">
          <div className="text-label">Account info</div>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="text-[color:var(--text-tertiary)]">Name:</span> <span className="font-semibold">{user?.name}</span></div>
            <div><span className="text-[color:var(--text-tertiary)]">Phone:</span> <span className="font-mono">{user?.phone}</span></div>
            <div><span className="text-[color:var(--text-tertiary)]">Referral code:</span> <span className="font-mono font-semibold text-[color:var(--brand)]">{user?.referral_code}</span></div>
          </div>
        </div>

        <form onSubmit={saveBank} className="card-soft p-6 lg:col-span-2" data-testid="bank-form">
          <div className="flex items-center gap-2 text-label"><Building2 className="w-3.5 h-3.5" /> Payout bank details</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Pick your bank then enter your 10-digit account number — we'll auto-verify the account name.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Bank</label>
              <BankPicker
                value={bank}
                banks={banks}
                onSelect={(b) => setBank((prev) => ({ ...prev, bank_name: b.name, bank_code: b.code, account_name: "" }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account number</label>
              <input
                value={bank.account_number}
                onChange={(e) => setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "").slice(0, 10), account_name: "" })}
                inputMode="numeric" pattern="[0-9]{10}" maxLength={10}
                placeholder="0123456789"
                required
                data-testid="bank-account-input"
                className="w-full mt-2 input-base font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account name</label>
              <div className="mt-2 relative">
                <input
                  value={resolving ? "" : bank.account_name}
                  readOnly
                  placeholder={resolving ? "Verifying with bank…" : "Auto-filled after entering account number"}
                  data-testid="bank-account-name-input"
                  className="w-full input-base pr-10 font-semibold uppercase"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {resolving && <Loader2 className="w-4 h-4 text-[color:var(--brand)] animate-spin" />}
                  {!resolving && resolved && bank.account_name && (
                    <BadgeCheck className="w-5 h-5 text-[color:var(--success)]" data-testid="bank-verified-badge" />
                  )}
                </div>
              </div>
              {resolved && bank.account_name && (
                <div className="text-[11px] text-[color:var(--success)] mt-1 font-semibold">✓ Verified with bank</div>
              )}
            </div>
          </div>

          <button type="submit" disabled={!bank.account_name || resolving}
            data-testid="save-bank-btn"
            className="mt-5 flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-semibold">
            <Save className="w-4 h-4" /> Save bank
          </button>
        </form>
      </div>

      <form onSubmit={changePwd} className="card-soft p-6 mt-6 max-w-xl" data-testid="pwd-form">
        <div className="flex items-center gap-2 text-label"><Lock className="w-3.5 h-3.5" /> Change password</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <input type="password" placeholder="Current password" value={pwd.old_password}
            onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })} required
            data-testid="pwd-old-input"
            className="w-full input-base" />
          <input type="password" placeholder="New password (min 6 chars)" value={pwd.new_password}
            onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} required minLength={6}
            data-testid="pwd-new-input"
            className="w-full input-base" />
        </div>
        <button data-testid="save-pwd-btn" className="mt-5 flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-5 py-2.5 rounded-lg font-semibold">
          <Save className="w-4 h-4" /> Update password
        </button>
      </form>
    </UserLayout>
  );
}
