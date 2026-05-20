import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function Invest() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await api.get("/products");
    setProducts(data);
  };

  useEffect(() => { load(); }, []);

  const openInvest = (p) => {
    setSelected(p);
    setAmount(String(p.price));
    setOpen(true);
  };

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post("/invest", { product_id: selected.id, amount: Number(amount) });
      toast.success(`Invested ${formatNaira(amount)} in ${selected.name}`);
      setOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Investment failed");
    } finally { setSubmitting(false); }
  };

  return (
    <UserLayout>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-label">Investment Plans</div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Pick a plan</h1>
          <p className="text-sm text-[#4A5D54] mt-1">Earn daily profit for the plan duration. Profit lands in your wallet every 24 hours.</p>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-label">Wallet</div>
          <div className="metric-num text-2xl">{formatNaira(user?.wallet_balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.map((p, idx) => (
          <div key={p.id} className="card-soft overflow-hidden animate-fade-up" style={{ animationDelay: `${idx * 60}ms` }} data-testid={`product-card-${p.id}`}>
            <div className="aspect-video w-full bg-[#F3F5F1] overflow-hidden">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#8A9C93]">No image</div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-display font-semibold text-lg">{p.name}</div>
                <div className="pill pill-success">{p.daily_profit_percent}% daily</div>
              </div>
              <p className="text-sm text-[#4A5D54] mt-1 line-clamp-2">{p.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8A9C93]">Price</div>
                  <div className="font-semibold">{formatNaira(p.price)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8A9C93]">Duration</div>
                  <div className="font-semibold">{p.duration_days}d</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8A9C93]">Total ROI</div>
                  <div className="font-semibold">{(p.daily_profit_percent * p.duration_days).toFixed(0)}%</div>
                </div>
              </div>
              <button
                onClick={() => openInvest(p)}
                data-testid={`invest-btn-${p.id}`}
                className="mt-5 w-full flex items-center justify-center gap-2 bg-[#0F4C3A] hover:bg-[#0A3629] text-white py-3 rounded-lg font-semibold"
              >
                <TrendingUp className="w-4 h-4" /> Invest now
              </button>
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="col-span-full card-soft p-10 text-center text-[#4A5D54]">No products available yet.</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="invest-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Invest in {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg bg-[#F3F5F1] p-3 text-sm">
                Daily profit: <span className="font-semibold">{selected.daily_profit_percent}%</span> · Duration: <span className="font-semibold">{selected.duration_days} days</span>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#4A5D54]">Amount (₦)</label>
              <input
                type="number" min={selected.min_amount || selected.price} value={amount} onChange={(e)=>setAmount(e.target.value)}
                data-testid="invest-amount-input"
                className="w-full px-3 py-3 bg-white border border-[#E5E9E4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
              />
              <div className="text-sm text-[#4A5D54]">
                Daily return: <span className="font-semibold text-[#0A1C16]">{formatNaira((Number(amount) || 0) * selected.daily_profit_percent / 100)}</span>
              </div>
              <div className="text-xs text-[#8A9C93]">Wallet balance: {formatNaira(user?.wallet_balance)}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="invest-cancel">Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="invest-submit" className="bg-[#0F4C3A] hover:bg-[#0A3629]">
              {submitting ? "Investing…" : "Confirm investment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
