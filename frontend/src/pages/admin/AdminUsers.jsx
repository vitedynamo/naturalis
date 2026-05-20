import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [adjust, setAdjust] = useState({ amount: "", note: "" });

  const load = () => api.get("/admin/users").then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []);

  const toggle = async (u) => {
    try {
      await api.post(`/admin/users/${u.id}/${u.is_blocked ? "unblock" : "block"}`);
      toast.success(u.is_blocked ? "Unblocked" : "Blocked");
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const doAdjust = async () => {
    try {
      await api.post(`/admin/users/${editing.id}/adjust`, { amount: Number(adjust.amount), note: adjust.note || "Admin adjustment" });
      toast.success("Balance updated");
      setEditing(null);
      setAdjust({ amount: "", note: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="Users">
      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-users-table">
          <thead className="bg-[#F3F5F1] text-[#4A5D54]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Name</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Phone</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Referral</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Wallet</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Earnings</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Joined</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-[#E5E9E4]">
                <td className="p-3 font-medium">{u.name}{u.is_admin && <span className="ml-2 pill pill-warn">admin</span>}</td>
                <td className="p-3 font-mono text-xs">{u.phone}</td>
                <td className="p-3 font-mono text-xs text-[#0F4C3A]">{u.referral_code}</td>
                <td className="p-3 text-right font-semibold">{formatNaira(u.wallet_balance)}</td>
                <td className="p-3 text-right">{formatNaira(u.total_earnings)}</td>
                <td className="p-3 text-[#4A5D54]">{formatDate(u.created_at)}</td>
                <td className="p-3">
                  {u.is_blocked ? <span className="pill pill-error">blocked</span> : <span className="pill pill-success">active</span>}
                </td>
                <td className="p-3 text-right space-x-2">
                  {!u.is_admin && (
                    <>
                      <button onClick={() => { setEditing(u); setAdjust({ amount: "", note: "" }); }}
                        data-testid={`adjust-${u.id}`}
                        className="px-3 py-1.5 rounded-md text-xs bg-[#0F4C3A] text-white hover:bg-[#0A3629]">
                        Adjust ₦
                      </button>
                      <button onClick={() => toggle(u)}
                        data-testid={`toggle-${u.id}`}
                        className={`px-3 py-1.5 rounded-md text-xs ${u.is_blocked ? "bg-[#00D084] text-[#0A1C16]" : "bg-rose-50 text-[#9c1239]"}`}>
                        {u.is_blocked ? "Unblock" : "Block"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-[#8A9C93]">No users.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust wallet — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Amount (₦) — negative to debit</label>
            <input type="number" value={adjust.amount} onChange={(e)=>setAdjust({...adjust, amount: e.target.value})}
              data-testid="adjust-amount-input"
              className="w-full px-3 py-2.5 bg-white border border-[#E5E9E4] rounded-lg" />
            <input value={adjust.note} onChange={(e)=>setAdjust({...adjust, note: e.target.value})}
              data-testid="adjust-note-input"
              placeholder="Note (visible in user transaction history)"
              className="w-full px-3 py-2.5 bg-white border border-[#E5E9E4] rounded-lg" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={doAdjust} data-testid="adjust-submit" className="bg-[#0F4C3A] hover:bg-[#0A3629]">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
