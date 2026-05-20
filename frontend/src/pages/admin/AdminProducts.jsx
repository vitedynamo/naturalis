import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, Upload, Image as ImageIcon } from "lucide-react";

const blank = {
  name: "", description: "", image_url: "",
  price: 5000, daily_profit_percent: 4, duration_days: 30,
  min_amount: 5000, max_amount: 0, is_active: true,
};

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = () => api.get("/admin/products").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ ...p });
    setOpen(true);
  };

  const uploadImage = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be ≤ 5MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, image_url: data.url }));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const save = async () => {
    try {
      const payload = {
        name: form.name, description: form.description, image_url: form.image_url,
        price: Number(form.price), daily_profit_percent: Number(form.daily_profit_percent),
        duration_days: Number(form.duration_days), min_amount: Number(form.min_amount),
        max_amount: Number(form.max_amount), is_active: !!form.is_active,
      };
      if (editing) {
        await api.put(`/admin/products/${editing.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/admin/products", payload);
        toast.success("Product created");
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    await api.delete(`/admin/products/${p.id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <AdminLayout title="Products">
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} data-testid="add-product-btn" className="flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-white px-4 py-2.5 rounded-lg font-semibold">
          <Plus className="w-4 h-4" /> Add product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(p => (
          <div key={p.id} className="card-soft overflow-hidden" data-testid={`admin-product-${p.id}`}>
            <div className="aspect-video bg-[color:var(--surface-alt)] flex items-center justify-center">
              {p.image_url ? (
                <img src={resolveImg(p.image_url)} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-[color:var(--text-tertiary)] text-sm font-display">No image</div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold">{p.name}</div>
                <span className={`pill ${p.is_active ? "pill-success" : "pill-neutral"}`}>{p.is_active ? "active" : "off"}</span>
              </div>
              <div className="text-xs text-[color:var(--text-secondary)] mt-1 line-clamp-2">{p.description}</div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <div><div className="text-[color:var(--text-tertiary)]">Price</div><div className="font-semibold">{formatNaira(p.price)}</div></div>
                <div><div className="text-[color:var(--text-tertiary)]">Daily</div><div className="font-semibold">{p.daily_profit_percent}%</div></div>
                <div><div className="text-[color:var(--text-tertiary)]">Days</div><div className="font-semibold">{p.duration_days}</div></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`} className="flex-1 flex items-center justify-center gap-2 border border-[color:var(--border-default)] hover:bg-[color:var(--surface-alt)] rounded-md py-1.5 text-sm"><Edit3 className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={() => remove(p)} data-testid={`delete-product-${p.id}`} className="flex items-center justify-center gap-2 bg-[color:var(--error-soft)] text-[color:var(--error)] rounded-md px-3 py-1.5 text-sm"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="col-span-full card-soft p-10 text-center text-[color:var(--text-tertiary)]">No products yet.</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input placeholder="Name" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})}
              data-testid="product-name-input"
              className="md:col-span-2 px-3 py-2.5 border border-[color:var(--border-default)] rounded-lg" />
            <textarea placeholder="Description" rows={3} value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})}
              data-testid="product-description-input"
              className="md:col-span-2 px-3 py-2.5 border border-[color:var(--border-default)] rounded-lg" />

            <div className="md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mb-2">Product image</div>
              <div className="flex items-start gap-3">
                <div className="w-28 h-28 rounded-lg bg-[color:var(--surface-alt)] flex items-center justify-center overflow-hidden border border-[color:var(--border-default)]">
                  {form.image_url ? (
                    <img src={resolveImg(form.image_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-[color:var(--text-tertiary)]" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={(e)=>uploadImage(e.target.files?.[0])}
                    data-testid="product-image-upload"
                    className="hidden"
                  />
                  <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={uploading} data-testid="product-image-upload-btn"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-[color:var(--brand)] text-white rounded-lg hover:bg-[color:var(--brand-hover)] disabled:opacity-60">
                    <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : (form.image_url ? "Replace image" : "Upload image")}
                  </button>
                  <input placeholder="…or paste image URL" value={form.image_url || ""} onChange={(e)=>setForm({...form, image_url: e.target.value})}
                    data-testid="product-image-input"
                    className="w-full px-3 py-2 border border-[color:var(--border-default)] rounded-lg text-xs" />
                  <div className="text-[10px] text-[color:var(--text-tertiary)]">JPG / PNG / WebP · max 5MB</div>
                </div>
              </div>
            </div>
            <label className="text-xs"><span>Price (₦)</span>
              <input type="number" value={form.price} onChange={(e)=>setForm({...form, price: e.target.value})}
                data-testid="product-price-input"
                className="w-full mt-1 px-3 py-2 border border-[color:var(--border-default)] rounded-lg" /></label>
            <label className="text-xs"><span>Daily profit %</span>
              <input type="number" step="0.1" value={form.daily_profit_percent} onChange={(e)=>setForm({...form, daily_profit_percent: e.target.value})}
                data-testid="product-percent-input"
                className="w-full mt-1 px-3 py-2 border border-[color:var(--border-default)] rounded-lg" /></label>
            <label className="text-xs"><span>Duration (days)</span>
              <input type="number" value={form.duration_days} onChange={(e)=>setForm({...form, duration_days: e.target.value})}
                data-testid="product-days-input"
                className="w-full mt-1 px-3 py-2 border border-[color:var(--border-default)] rounded-lg" /></label>
            <label className="text-xs"><span>Min amount</span>
              <input type="number" value={form.min_amount} onChange={(e)=>setForm({...form, min_amount: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-[color:var(--border-default)] rounded-lg" /></label>
            <label className="text-xs md:col-span-2"><span>Max amount (0 = no cap)</span>
              <input type="number" value={form.max_amount} onChange={(e)=>setForm({...form, max_amount: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-[color:var(--border-default)] rounded-lg" /></label>
            <label className="md:col-span-2 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.is_active} onChange={(e)=>setForm({...form, is_active: e.target.checked})} data-testid="product-active-checkbox" />
              Active (visible to users)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="product-save-btn" className="bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
