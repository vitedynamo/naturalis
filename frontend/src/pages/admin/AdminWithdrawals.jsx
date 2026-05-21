import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, Send, Smartphone } from "lucide-react";

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [target, setTarget] = useState(null);
  const [gateway, setGateway] = useState("paystack"); // paystack | nomba
  const [bankCode, setBankCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/withdrawals").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const ensureBanks = async () => {
    if (banks.length) return banks;
    const { data } = await api.get("/admin/banks");
    setBanks(data);
    return data;
  };

  const openPay = async (w, gw) => {
    setTarget(w);
    setGateway(gw);
    setReason(`Withdrawal payout to ${w.account_name}`);
    const list = await ensureBanks();
    const match = list.find((b) => b.name.toLowerCase() === (w.bank_name || "").toLowerCase().trim());
    setBankCode(match?.code || "");
  };

  const submitPay = async () => {
    if (!bankCode) {
      toast.error("Pick the bank for this account first");
      return;
    }
    setBusy(true);
    try {
      const endpoint = gateway === "nomba" ? "pay-nomba" : "pay-paystack";
      const { data } = await api.post(`/admin/withdrawals/${target.id}/${endpoint}`, {
        bank_code: bankCode,
        reason,
      });
      toast.success(`Paid via ${gateway === "nomba" ? "Nomba" : "Paystack"} (${data.mode})`);
      setTarget(null);
      setBankCode("");
      setReason("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payment failed");
    } finally { setBusy(false); }
  };

  const act = async (w, action) => {
    const note = window.prompt(action === "approve" ? "Optional note (e.g. transfer ref)" : "Reason for rejecting?", "");
    if (action === "reject" && note === null) return;
    try {
      await api.post(`/admin/withdrawals/${w.id}/${action}`, { note });
      toast.success(action === "approve" ? "Withdrawal marked paid" : "Rejected — user refunded");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="Withdrawals">
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[850px]" data-testid="admin-withdrawals-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Bank</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(w => (
                <tr key={w.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3">
                    <div className="font-medium text-[color:var(--text-primary)]">{w.user_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{w.user_phone}</div>
                  </td>
                  <td className="p-3 text-right font-semibold text-[color:var(--text-primary)]">{formatNaira(w.amount)}</td>
                  <td className="p-3">
                    <div className="text-[color:var(--text-primary)]">{w.bank_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-primary)]">{w.account_number}</div>
                    <div className="text-xs text-[color:var(--text-tertiary)]">{w.account_name}</div>
                  </td>
                  <td className="p-3"><span className={`pill ${w.status === "paid" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status}</span></td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap">{formatDate(w.created_at)}</td>
                  <td className="p-3 text-right">
                    {w.status === "pending" && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        <button onClick={() => openPay(w, "paystack")} data-testid={`pay-paystack-${w.id}`}
                          className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--accent-main)] text-white hover:bg-[color:var(--accent-hover)] inline-flex items-center gap-1.5">
                          <Send className="w-3 h-3" /> Pay via Paystack
                        </button>
                        <button onClick={() => openPay(w, "nomba")} data-testid={`pay-nomba-${w.id}`}
                          className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] inline-flex items-center gap-1.5">
                          <Smartphone className="w-3 h-3" /> Pay via Nomba
                        </button>
                        <button onClick={() => act(w, "approve")} data-testid={`approve-${w.id}`}
                          className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--surface-alt)] text-[color:var(--text-primary)] inline-flex items-center gap-1.5 border border-[color:var(--border-default)]">
                          <Banknote className="w-3 h-3" /> Mark paid manually
                        </button>
                        <button onClick={() => act(w, "reject")} data-testid={`reject-${w.id}`}
                          className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--error-soft)] text-[color:var(--error)]">Reject</button>
                      </div>
                    )}
                    {w.admin_note && <div className="text-xs text-[color:var(--text-tertiary)] mt-1 italic">{w.admin_note}</div>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay via {gateway === "nomba" ? "Nomba" : "Paystack"} Transfer</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3">
                <div className="text-[color:var(--text-primary)] font-semibold">{target.user_name} · {formatNaira(target.amount)}</div>
                <div className="font-mono text-xs text-[color:var(--text-primary)]">{target.account_number}</div>
                <div className="text-xs text-[color:var(--text-secondary)]">{target.bank_name} · {target.account_name}</div>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Bank</label>
              <select value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                data-testid="payout-bank-select"
                className="w-full input-base">
                <option value="">— select bank —</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>{`${b.name} (${b.code})`}</option>
                ))}
              </select>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Reason / narration</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                data-testid="payout-reason-input"
                className="w-full input-base" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={busy} data-testid="payout-confirm-btn"
              className={gateway === "nomba" ? "bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]" : "bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)]"}>
              {busy ? "Processing…" : "Confirm transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
