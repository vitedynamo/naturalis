import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calendar, Coins, Leaf, Sprout, TreePine, Trees, Mountain, Flower2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const NATURE_ICONS = [Leaf, Sprout, TreePine, Trees, Mountain, Flower2];

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

/* Loading skeleton card */
function SkeletonCard() {
  return (
    <div className="card-soft overflow-hidden" data-testid="plan-skeleton">
      <div className="aspect-[16/10] w-full bg-[color:var(--surface-2)] animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 rounded bg-[color:var(--surface-2)] animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-[color:var(--surface-alt)] animate-pulse" />)}
        </div>
        <div className="h-10 rounded-full bg-[color:var(--surface-2)] animate-pulse" />
      </div>
    </div>
  );
}

/* Cowrywise-style investment plan card */
function PlanCard({ p, idx, onInvest }) {
  const totalRoi = (p.daily_profit_percent * p.duration_days).toFixed(0);
  const dailyPayout = p.price * p.daily_profit_percent / 100;
  const totalReturn = p.price + dailyPayout * p.duration_days;
  const NatureIcon = NATURE_ICONS[idx % NATURE_ICONS.length];
  return (
    <div
      className="card-soft overflow-hidden group animate-fade-up hover:-translate-y-0.5 transition-transform"
      style={{ animationDelay: `${idx * 50}ms` }}
      data-testid={`product-card-${p.id}`}
    >
      {/* Header — nature image with name overlaid */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {p.image_url ? (
          <img src={resolveImg(p.image_url)} alt={p.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 hero-gradient flex items-center justify-center">
            <NatureIcon className="w-12 h-12 text-white/80" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 text-[color:var(--brand)] text-[11px] font-bold shadow">
          <TrendingUp className="w-3 h-3" /> {totalRoi}% ROI
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <div className="flex items-center gap-1.5 text-white/85 text-[10px] uppercase tracking-[0.15em] font-semibold">
            <NatureIcon className="w-3 h-3" /> Naturalis plan
          </div>
          <div className="font-display font-bold text-xl text-white leading-tight truncate drop-shadow">{p.name}</div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center justify-center gap-1"><Coins className="w-2.5 h-2.5" /> Daily</div>
            <div className="font-bold text-sm text-[color:var(--accent-main)] mt-1">{formatNaira(dailyPayout, { compact: true })}</div>
          </div>
          <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center justify-center gap-1"><Calendar className="w-2.5 h-2.5" /> Days</div>
            <div className="font-bold text-sm text-[color:var(--text-primary)] mt-1">{p.duration_days}</div>
          </div>
          <div className="rounded-xl bg-[color:var(--surface-alt)] p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-[color:var(--text-tertiary)] flex items-center justify-center gap-1"><TrendingUp className="w-2.5 h-2.5" /> Total</div>
            <div className="font-bold text-sm text-[color:var(--brand)] mt-1">{formatNaira(totalReturn, { compact: true })}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">From</div>
            <div className="font-display font-bold text-lg text-[color:var(--text-primary)] leading-none">{formatNaira(p.price)}</div>
          </div>
          <button
            onClick={() => onInvest(p)}
            data-testid={`invest-btn-${p.id}`}
            className="inline-flex items-center gap-2 bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-ink)] px-5 py-2.5 rounded-full font-semibold shadow-md shadow-[color:var(--brand)]/20 hover:-translate-y-0.5 transition-all"
          >
            Invest <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Invest() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const amountRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products");
      setProducts(data);
    } finally {
      setLoading(false);
    }
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
    if (amountRef.current) {
      try { amountRef.current.blur(); } catch { /* noop */ }
    }
    try {
      const { data } = await api.post("/invest", { product_id: selected.id, amount: Number(amount) });
      toast.success(`Invested ${formatNaira(amount)} in ${selected.name}`);
      setOpen(false);
      await refresh();
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
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">Grow with Naturalis</h1>
          <p className="text-sm text-[color:var(--text-secondary)] mt-1">Pick a plan and earn daily profit — paid into your wallet every 24 hours.</p>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-label">Wallet</div>
          <div className="metric-num text-2xl">{formatNaira(user?.wallet_balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : products.length === 0 ? (
          <div className="col-span-full card-soft p-10 text-center text-[color:var(--text-secondary)]" data-testid="plans-empty">No plans available yet. Please check back soon.</div>
        ) : (
          products.map((p, idx) => <PlanCard key={p.id} p={p} idx={idx} onInvest={openInvest} />)
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
        <DialogContent
          data-testid="invest-dialog"
          className="duration-[1200ms] ease-out w-[calc(100vw-2rem)] max-w-lg rounded-2xl data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
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
                disabled
                readOnly
                tabIndex={-1}
                data-testid="invest-amount-input"
                className="w-full px-3 py-3 bg-[color:var(--surface-alt)] border border-[color:var(--border-default)] rounded-lg text-[color:var(--text-primary)] font-semibold opacity-90 cursor-not-allowed focus:outline-none"
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
