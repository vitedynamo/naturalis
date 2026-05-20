import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";

export default function AdminInvestments() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/investments").then(({ data }) => setItems(data)); }, []);

  return (
    <AdminLayout title="Investments">
      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-investments-table">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Product</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Daily %</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Paid / Days</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Total Profit</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Started</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className="border-t border-[color:var(--border-default)]">
                <td className="p-3">
                  <div className="font-medium">{i.user_name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{i.user_phone}</div>
                </td>
                <td className="p-3">{i.product_name}</td>
                <td className="p-3 text-right font-semibold">{formatNaira(i.amount)}</td>
                <td className="p-3 text-right">{i.daily_profit_percent}%</td>
                <td className="p-3 text-right">{i.days_paid}/{i.duration_days}</td>
                <td className="p-3 text-right text-[color:var(--success)] font-semibold">{formatNaira(i.total_profit_paid)}</td>
                <td className="p-3"><span className={`pill ${i.status === "active" ? "pill-success" : "pill-neutral"}`}>{i.status}</span></td>
                <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(i.started_at)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[color:var(--text-tertiary)]">No investments.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
