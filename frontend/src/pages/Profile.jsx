import React, { useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Lock, Building2, Save } from "lucide-react";

export default function Profile() {
  const { user, refresh } = useAuth();

  const [bank, setBank] = useState({
    bank_name: user?.bank_name || "",
    account_number: user?.account_number || "",
    account_name: user?.account_name || "",
  });
  const [pwd, setPwd] = useState({ old_password: "", new_password: "" });

  const saveBank = async (e) => {
    e.preventDefault();
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
          <div className="flex items-center gap-2 text-label"><Building2 className="w-3.5 h-3.5" /> Bank details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Bank name</label>
              <input value={bank.bank_name} onChange={(e)=>setBank({...bank, bank_name: e.target.value})} required
                data-testid="bank-name-input"
                className="w-full mt-2 px-3 py-2.5 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account number</label>
              <input value={bank.account_number} onChange={(e)=>setBank({...bank, account_number: e.target.value})} required
                data-testid="bank-account-input"
                className="w-full mt-2 px-3 py-2.5 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Account name</label>
              <input value={bank.account_name} onChange={(e)=>setBank({...bank, account_name: e.target.value})} required
                data-testid="bank-account-name-input"
                className="w-full mt-2 px-3 py-2.5 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
            </div>
          </div>
          <button data-testid="save-bank-btn" className="mt-5 flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-5 py-2.5 rounded-lg font-semibold">
            <Save className="w-4 h-4" /> Save bank
          </button>
        </form>

        <form onSubmit={changePwd} className="card-soft p-6 lg:col-span-3" data-testid="password-form">
          <div className="flex items-center gap-2 text-label"><Lock className="w-3.5 h-3.5" /> Change password</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <input type="password" required minLength={4} value={pwd.old_password} onChange={(e)=>setPwd({...pwd, old_password: e.target.value})}
              placeholder="Current password" data-testid="old-pwd-input"
              className="w-full px-3 py-2.5 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
            <input type="password" required minLength={4} value={pwd.new_password} onChange={(e)=>setPwd({...pwd, new_password: e.target.value})}
              placeholder="New password" data-testid="new-pwd-input"
              className="w-full px-3 py-2.5 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]" />
          </div>
          <button data-testid="save-pwd-btn" className="mt-5 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-5 py-2.5 rounded-lg font-semibold">Update password</button>
        </form>
      </div>
    </UserLayout>
  );
}
