import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calendar, Coins, Flame } from "lucide-react";
import { toast } from "sonner";

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

export default function Invest() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef(null);

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
    // Blur and disable input as soon as user confirms
    if (amountRef.current) {
      try { amountRef.current.blur(); } catch { /* noop */ }
    }
    try {
      const { data } = await api.post("/invest", { product_id: selected.id, amount: Number(amount) });
      toast.success(`Invested ${formatNaira(amount)} in ${selected.name}`);
      setOpen(false);
      await refresh();
      // Redirect to My Packages and scroll to the new investment
      navigate("/my-packages", { state: { highlightId: data?.investment?.id } });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Investment failed");
      setSubmitting(false);
    }
  };

  return (
    <UserLayout>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-label">Investment Plans</div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Pick a plan</h1>
          <p className="text-sm text-[color:var(--text-secondary)] mt-1">Earn daily profit for the plan duration. Profit lands in your wallet every 24 hours.</p>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-label">Wallet</div>
          <div className="metric-num text-2xl">{formatNaira(user?.wallet_balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {products.map((p, idx) => {
          const totalRoi = (p.daily_profit_percent * p.duration_days).toFixed(0);
          const totalReturn = p.price + (p.price * p.daily_profit_percent / 100) * p.duration_days;
          return (
            <div key={p.id}
              className="card-soft overflow-hidden relative animate-fade-up group hover:-translate-y-0.5 transition-transform"
              style={{ animationDelay: `${idx * 60}ms` }}
              data-testid={`product-card-${p.id}`}>
              {/* Top status stripe */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--accent-main)] z-10" />

              <div className="aspect-[5/3] w-full bg-[color:var(--surface-alt)] overflow-hidden relative">
                {p.image_url ? (
                  <img src={resolveImg(p.image_url)} alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[color:var(--text-tertiary)]">No image</div>
                )}
                <div className="absolute top-3 right-3 pill pill-accent backdrop-blur shadow-md">
                  <Flame className="w-3 h-3" /> {totalRoi}% ROI
                </div>
              </div>

              <div className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-lg leading-tight text-[color:var(--text-primary)] truncate">{p.name}</div>
                    <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                      {p.daily_profit_percent}% daily · {p.duration_days} days
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">From</div>
                    <div className="font-display font-bold text-base text-[color:var(--brand)] leading-tight">{formatNaira(p.price)}</div>
                  </div>
                </div>

                <p className="text-xs text-[color:var(--text-secondary)] mt-2 line-clamp-2">{p.description}</p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-[color:var(--surface-alt)] p-2">
                    <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center gap-1"><Coins className="w-2.5 h-2.5" /> Daily</div>
                    <div className="font-bold text-sm text-[color:var(--accent-main)] mt-0.5">{formatNaira(p.price * p.daily_profit_percent / 100, { compact: true })}</div>
                  </div>
                  <div className="rounded-xl bg-[color:var(--surface-alt)] p-2">
                    <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Days</div>
                    <div className="font-bold text-sm text-[color:var(--text-primary)] mt-0.5">{p.duration_days}</div>
                  </div>
                  <div className="rounded-xl bg-[color:var(--surface-alt)] p-2">
                    <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5" /> Total</div>
                    <div className="font-bold text-sm text-[color:var(--brand)] mt-0.5">{formatNaira(totalReturn, { compact: true })}</div>
                  </div>
                </div>

                <button
                  onClick={() => openInvest(p)}
                  data-testid={`invest-btn-${p.id}`}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[color:var(--brand)] to-[color:var(--brand-hover)] hover:to-[color:var(--accent-main)] text-white py-3 rounded-xl font-semibold shadow-md shadow-[color:var(--brand)]/20 transition-all"
                >
                  <TrendingUp className="w-4 h-4" /> Invest now
                </button>
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <div className="col-span-full card-soft p-10 text-center text-[color:var(--text-secondary)]">No products available yet.</div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
        <DialogContent data-testid="invest-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Invest in {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg bg-[color:var(--surface-alt)] p-3 text-sm">
                Daily profit: <span className="font-semibold">{selected.daily_profit_percent}%</span> · Duration: <span className="font-semibold">{selected.duration_days} days</span>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Amount (₦)</label>
              <input
                ref={amountRef}
                type="number" min={selected.min_amount || selected.price} value={amount}
                onChange={(e)=>setAmount(e.target.value)}
                disabled={submitting}
                data-testid="invest-amount-input"
                className="w-full px-3 py-3 bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)] disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <div className="text-sm text-[color:var(--text-secondary)]">
                Daily return: <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira((Number(amount) || 0) * selected.daily_profit_percent / 100)}</span>
              </div>
              <div className="text-xs text-[color:var(--text-tertiary)]">Wallet balance: {formatNaira(user?.wallet_balance)}</div>
            </div>
          )}
          <DialogFooter className="gap-3 sm:gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting} data-testid="invest-cancel">Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="invest-submit" className="bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)]">
              {submitting ? "Investing…" : "Confirm investment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UserLayout>
  );
}
