import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";

export default function AdminDeposits() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/admin/deposits").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const approve = async (d) => {
    try { await api.post(`/admin/deposits/${d.id}/approve`); toast.success("Deposit approved"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="Deposits">
      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-deposits-table">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Method</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map(d => (
              <tr key={d.id} className="border-t border-[color:var(--border-default)]">
                <td className="p-3">
                  <div className="font-medium">{d.user_name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{d.user_phone}</div>
                </td>
                <td className="p-3 font-mono text-xs">{d.reference}</td>
                <td className="p-3 text-right font-semibold">{formatNaira(d.amount)}</td>
                <td className="p-3 capitalize">{d.method}</td>
                <td className="p-3"><span className={`pill ${d.status === "success" ? "pill-success" : d.status === "failed" ? "pill-error" : "pill-warn"}`}>{d.status}</span></td>
                <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(d.created_at)}</td>
                <td className="p-3 text-right">
                  {d.status === "pending" && (
                    <button onClick={() => approve(d)} data-testid={`approve-deposit-${d.id}`}
                      className="px-3 py-1.5 rounded-md text-xs bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)]">Approve</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-[color:var(--text-tertiary)]">No deposits.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
