import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function AdminReferrals() {
  const [items, setItems] = useState([]);
  const [gen, setGen] = useState(0);
  useEffect(() => { api.get("/admin/referrals").then(({ data }) => setItems(data)); }, []);

  const filtered = gen === 0 ? items : items.filter(r => r.generation === gen);

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
        <table className="w-full text-sm" data-testid="admin-referrals-table">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Referrer</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Referred</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Generation</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-[color:var(--border-default)]">
                <td className="p-3">
                  <div className="font-medium">{r.referrer_name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{r.referrer_phone}</div>
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.referred_name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{r.referred_phone}</div>
                </td>
                <td className="p-3"><span className="pill pill-neutral">Gen {r.generation}</span></td>
                <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(r.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[color:var(--text-tertiary)]">No referrals.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
