import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";

export default function AdminWithdrawals() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/withdrawals").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

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
        <table className="w-full text-sm" data-testid="admin-withdrawals-table">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Bank</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Method</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id} className="border-t border-[color:var(--border-default)]">
                <td className="p-3">
                  <div className="font-medium">{w.user_name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{w.user_phone}</div>
                </td>
                <td className="p-3 text-right font-semibold">{formatNaira(w.amount)}</td>
                <td className="p-3">
                  <div>{w.bank_name}</div>
                  <div className="font-mono text-xs">{w.account_number}</div>
                  <div className="text-xs text-[color:var(--text-tertiary)]">{w.account_name}</div>
                </td>
                <td className="p-3 capitalize">{w.method}</td>
                <td className="p-3"><span className={`pill ${w.status === "paid" ? "pill-success" : w.status === "rejected" ? "pill-error" : "pill-warn"}`}>{w.status}</span></td>
                <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(w.created_at)}</td>
                <td className="p-3 text-right space-x-2">
                  {w.status === "pending" && (
                    <>
                      <button onClick={() => act(w, "approve")} data-testid={`approve-${w.id}`}
                        className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)]">Mark paid</button>
                      <button onClick={() => act(w, "reject")} data-testid={`reject-${w.id}`}
                        className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--error-soft)] text-[color:var(--error)]">Reject</button>
                    </>
                  )}
                  {w.admin_note && <div className="text-xs text-[color:var(--text-tertiary)] mt-1 italic">{w.admin_note}</div>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-[color:var(--text-tertiary)]">No withdrawals.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
