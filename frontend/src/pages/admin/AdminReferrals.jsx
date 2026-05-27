import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import Pagination from "@/components/admin/Pagination";

export default function AdminReferrals() {
  const [items, setItems] = useState([]);
  const [gen, setGen] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => { api.get("/admin/referrals").then(({ data }) => setItems(data)); }, []);
  useEffect(() => { setPage(1); }, [gen]);

  const filtered = useMemo(
    () => gen === 0 ? items : items.filter(r => r.generation === gen),
    [items, gen],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  return (
    <AdminLayout title="Referrals">
      <div className="flex gap-2 mb-4">
        {[0, 1, 2, 3].map(g => (
          <button key={g} onClick={() => setGen(g)} data-testid={`gen-filter-${g}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border ${gen === g ? "bg-[color:var(--brand)] text-white border-[color:var(--brand)]" : "border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"}`}>
            {g === 0 ? "All" : `Generation ${g}`}
          </button>
        ))}
      </div>
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="admin-referrals-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Referrer</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Referred</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Generation</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(r => (
                <tr key={r.id} className="border-t border-[color:var(--border-default)]">
                  <td className="p-3 max-w-[180px]">
                    <div className="font-medium truncate">{r.referrer_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{r.referrer_phone}</div>
                  </td>
                  <td className="p-3 max-w-[180px]">
                    <div className="font-medium truncate">{r.referred_name}</div>
                    <div className="font-mono text-xs text-[color:var(--text-tertiary)] truncate">{r.referred_phone}</div>
                  </td>
                  <td className="p-3"><span className="pill pill-neutral">Gen {r.generation}</span></td>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap hidden md:table-cell">{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[color:var(--text-tertiary)]">No referrals.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            testidPrefix="referrals-page"
          />
        )}
      </div>
    </AdminLayout>
  );
}
