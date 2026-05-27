import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import Pagination from "@/components/admin/Pagination";

export default function AdminInvestments() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => { api.get("/admin/investments").then(({ data }) => setItems(data)); }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage],
  );

  return (
    <AdminLayout title="Investments">
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="admin-investments-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Product</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider hidden md:table-cell">Daily %</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider hidden md:table-cell">Paid / Days</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider hidden lg:table-cell">Total Profit</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider hidden lg:table-cell">Started</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(i => (
                <tr key={i.id} className="border-t border-[color:var(--border-default)]" data-testid={`investment-row-${i.id}`}>
                  <td className="p-3 max-w-[180px]">
                    <div className="font-medium truncate">{i.user_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{i.user_phone}</div>
                  </td>
                  <td className="p-3 max-w-[180px]">
                    <div className="truncate">{i.product_name}</div>
                  </td>
                  <td className="p-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatNaira(i.amount)}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{i.daily_profit_percent}%</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">{i.days_paid}/{i.duration_days}</td>
                  <td className="p-3 text-right text-[color:var(--success)] font-semibold tabular-nums whitespace-nowrap hidden lg:table-cell">{formatNaira(i.total_profit_paid)}</td>
                  <td className="p-3"><span className={`pill ${i.status === "active" ? "pill-success" : "pill-neutral"}`}>{i.status}</span></td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap hidden lg:table-cell">{formatDate(i.started_at)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[color:var(--text-tertiary)]">No investments.</td></tr>}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={items.length}
            pageSize={PAGE_SIZE}
            testidPrefix="investments-page"
          />
        )}
      </div>
    </AdminLayout>
  );
}
