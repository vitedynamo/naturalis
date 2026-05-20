import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

const blank = { code: "", amount: 500, max_uses: 100, is_active: true };

export default function AdminCoupons() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const load = () => api.get("/admin/coupons").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/admin/coupons", { ...form, amount: Number(form.amount), max_uses: Number(form.max_uses) });
      toast.success("Coupon created");
      setOpen(false); setForm(blank); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.code}?`)) return;
    await api.delete(`/admin/coupons/${c.id}`);
    load();
  };

  return (
    <AdminLayout title="Coupons">
      <div className="flex justify-end mb-4">
        <button onClick={() => { setForm(blank); setOpen(true); }} data-testid="add-coupon-btn"
          className="flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-4 py-2.5 rounded-lg font-semibold">
          <Plus className="w-4 h-4" /> New coupon
        </button>
      </div>
      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm" data-testid="admin-coupons-table">
          <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Code</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Used / Max</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Created</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} className="border-t border-[color:var(--border-default)]">
                <td className="p-3 font-mono text-[color:var(--brand)] font-semibold">{c.code}</td>
                <td className="p-3 text-right font-semibold">{formatNaira(c.amount)}</td>
                <td className="p-3 text-right">{c.used_count}/{c.max_uses}</td>
                <td className="p-3"><span className={`pill ${c.is_active ? "pill-success" : "pill-neutral"}`}>{c.is_active ? "active" : "off"}</span></td>
                <td className="p-3 text-[color:var(--text-secondary)]">{formatDate(c.created_at)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(c)} data-testid={`delete-coupon-${c.id}`} className="p-2 rounded-md bg-[color:var(--error-soft)] text-[color:var(--error)]"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[color:var(--text-tertiary)]">No coupons.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New coupon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input placeholder="CODE" value={form.code} onChange={(e)=>setForm({...form, code: e.target.value.toUpperCase()})}
              data-testid="coupon-code-input"
              className="w-full px-3 py-2.5 border border-[color:var(--border-default)] rounded-lg uppercase font-mono" />
            <input type="number" placeholder="Amount (₦)" value={form.amount} onChange={(e)=>setForm({...form, amount: e.target.value})}
              data-testid="coupon-amount-input"
              className="w-full px-3 py-2.5 border border-[color:var(--border-default)] rounded-lg" />
            <input type="number" placeholder="Max uses" value={form.max_uses} onChange={(e)=>setForm({...form, max_uses: e.target.value})}
              data-testid="coupon-max-input"
              className="w-full px-3 py-2.5 border border-[color:var(--border-default)] rounded-lg" />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_active} onChange={(e)=>setForm({...form, is_active: e.target.checked})} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} data-testid="coupon-create-btn" className="bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
