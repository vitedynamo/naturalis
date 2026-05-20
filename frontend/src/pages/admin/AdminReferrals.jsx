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
            className={`px-4 py-1.5 rounded-full text-sm font-medium border ${gen === g ? "bg-[#0F4C3A] text-white border-[#0F4C3A]" : "border-[#E5E9E4] text-[#4A5D54] hover:bg-[#F3F5F1]"}`}>
            {g === 0 ? "All" : `Generation ${g}`}
          </button>
        ))}
      </div>
      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-referrals-table">
          <thead className="bg-[#F3F5F1] text-[#4A5D54]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Referrer</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Referred</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Generation</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-[#E5E9E4]">
                <td className="p-3">
                  <div className="font-medium">{r.referrer_name}</div>
                  <div className="font-mono text-xs text-[#8A9C93]">{r.referrer_phone}</div>
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.referred_name}</div>
                  <div className="font-mono text-xs text-[#8A9C93]">{r.referred_phone}</div>
                </td>
                <td className="p-3"><span className="pill pill-neutral">Gen {r.generation}</span></td>
                <td className="p-3 text-[#4A5D54]">{formatDate(r.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-[#8A9C93]">No referrals.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
