import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { SlidersHorizontal } from "lucide-react";

export default function AdminManualAdjustments() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/admin/transactions").then(({ data }) => {
      // Filter admin-driven adjustments
      const adj = data.filter((t) => (t?.meta?.by_admin === true) || (t.type === "bonus" && t?.meta?.by_admin) || (t.type === "refund" && t?.meta?.by_admin));
      setItems(adj);
    });
  }, []);

  const totalCredits = items.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalDebits = items.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  return (
    <AdminLayout title="Manual Adjustments">
      <div className="text-label flex items-center gap-2"><SlidersHorizontal className="w-3.5 h-3.5 text-[color:var(--brand)]" /> Admin wallet adjustments</div>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Every credit or debit applied directly via the admin → Users page. Use this audit log for reconciliation.</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        <div className="card-soft p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Total adjustments</div>
          <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--text-primary)]">{items.length}</div>
        </div>
        <div className="card-soft p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Credits</div>
          <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--success)]">+{formatNaira(totalCredits)}</div>
        </div>
        <div className="card-soft p-4">
          <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">Debits</div>
          <div className="font-display font-extrabold text-2xl mt-1 text-[color:var(--error)]">{formatNaira(totalDebits)}</div>
        </div>
      </div>

      <div className="card-soft overflow-hidden mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]" data-testid="adj-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Note</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3">
                    <div className="font-medium text-[color:var(--text-primary)]">{t.user_name || "—"}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{t.user_phone || ""}</div>
                  </td>
                  <td className={`p-3 text-right font-bold ${t.amount >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--error)]"}`}>{t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}</td>
                  <td className="p-3 text-[color:var(--text-secondary)]">{t.description}</td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap">{formatDate(t.created_at)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-[color:var(--text-tertiary)]">No manual adjustments yet. Adjust user balances from the Users page.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
