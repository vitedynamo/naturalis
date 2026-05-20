import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export default function AdminPasswordResets() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("pending");

  const load = () => api.get("/admin/password-resets").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const act = async (r, action) => {
    const note = window.prompt(action === "approve" ? "Optional note for record" : "Reason for rejecting?", "");
    if (action === "reject" && note === null) return;
    try {
      await api.post(`/admin/password-resets/${r.id}/${action}`, { note });
      toast.success(action === "approve" ? "Password reset approved — new password is active" : "Request rejected");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const filtered = items.filter((r) => (filter === "all" ? true : r.status === filter));

  return (
    <AdminLayout title="Password Resets">
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} data-testid={`filter-${s}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap capitalize ${
              filter === s ? "bg-[#0F4C3A] text-white border-[#0F4C3A]" : "border-[#E5E9E4] text-[#4A5D54] hover:bg-[#F3F5F1]"
            }`}>
            {s}
          </button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-resets-table">
          <thead className="bg-[#F3F5F1] text-[#4A5D54]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">User</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Reason</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Requested</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-[#E5E9E4]">
                <td className="p-3">
                  <div className="font-medium">{r.user_name || "—"}</div>
                  <div className="font-mono text-xs text-[#8A9C93]">{r.phone}</div>
                </td>
                <td className="p-3 max-w-xs text-[#4A5D54]">{r.reason || <span className="italic text-[#8A9C93]">No reason given</span>}</td>
                <td className="p-3">
                  <span className={`pill ${r.status === "approved" ? "pill-success" : r.status === "rejected" ? "pill-error" : "pill-warn"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="p-3 text-[#4A5D54]">{formatDate(r.created_at)}</td>
                <td className="p-3 text-right space-x-2">
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => act(r, "approve")} data-testid={`approve-reset-${r.id}`}
                        className="px-3 py-1.5 rounded-md text-xs bg-[#0F4C3A] text-white hover:bg-[#0A3629]">Approve</button>
                      <button onClick={() => act(r, "reject")} data-testid={`reject-reset-${r.id}`}
                        className="px-3 py-1.5 rounded-md text-xs bg-rose-50 text-[#9c1239]">Reject</button>
                    </>
                  )}
                  {r.admin_note && <div className="text-xs text-[#8A9C93] mt-1 italic">{r.admin_note}</div>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-[#8A9C93]">No requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
