import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Save, Megaphone, Flame } from "lucide-react";

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/admin/settings"),
      api.get("/admin/products"),
    ]).then(([{ data: sd }, { data: pd }]) => {
      setS(sd);
      setProducts(pd);
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        gen1_percent: Number(s.gen1_percent),
        gen2_percent: Number(s.gen2_percent),
        gen3_percent: Number(s.gen3_percent),
        paystack_public_key: s.paystack_public_key || "",
        paystack_secret_key: s.paystack_secret_key || "",
        payment_mode: s.payment_mode || "mock",
        featured_product_id: s.featured_product_id || null,
        home_announcement: s.home_announcement || "",
        home_announcement_active: !!s.home_announcement_active,
      };
      const { data } = await api.put("/admin/settings", payload);
      setS(data);
      toast.success("Settings saved");
    } catch (e) { toast.error("Failed"); }
  };

  if (!s) return <AdminLayout title="Settings"><div className="text-[color:var(--text-secondary)]">Loading…</div></AdminLayout>;

  return (
    <AdminLayout title="Settings">
      <form onSubmit={save} className="space-y-6 max-w-3xl" data-testid="settings-form">
        <div className="card-soft p-6">
          <div className="text-label flex items-center gap-2"><Flame className="w-3.5 h-3.5 text-[color:var(--accent-main)]" /> Home page content</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">
            Pick the plan that shows as the <strong>featured "Hot pick"</strong> on every user's home page, and broadcast an announcement.
          </p>
          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Featured plan</label>
          <select
            value={s.featured_product_id || ""}
            onChange={(e) => setS({ ...s, featured_product_id: e.target.value || null })}
            data-testid="featured-product-select"
            className="w-full mt-1 px-3 py-2.5 input-base"
          >
            <option value="">— Auto (highest ROI) —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.daily_profit_percent}% × {p.duration_days}d</option>
            ))}
          </select>

          <div className="mt-5 flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
              <Megaphone className="w-3.5 h-3.5 inline-block mr-1" /> Home announcement
            </label>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!s.home_announcement_active}
                onChange={(e) => setS({ ...s, home_announcement_active: e.target.checked })}
                data-testid="announcement-active-checkbox" />
              <span className="text-[color:var(--text-secondary)]">Active</span>
            </label>
          </div>
          <textarea rows={3} value={s.home_announcement || ""}
            onChange={(e) => setS({ ...s, home_announcement: e.target.value })}
            placeholder="e.g. 🎉 Weekend bonus: top-up ₦20,000 and get an extra 5%!"
            data-testid="home-announcement-input"
            className="w-full mt-2 input-base resize-none" />
        </div>

        <div className="card-soft p-6">
          <div className="text-label">Bonuses & limits</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <Field label="Welcome bonus (₦)" value={s.welcome_bonus} onChange={(v)=>setS({...s, welcome_bonus: v})} testid="welcome-bonus" />
            <Field label="Min deposit (₦)" value={s.min_deposit} onChange={(v)=>setS({...s, min_deposit: v})} testid="min-deposit" />
            <Field label="Min withdrawal (₦)" value={s.min_withdrawal} onChange={(v)=>setS({...s, min_withdrawal: v})} testid="min-withdrawal" />
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="text-label">Referral commission percentages</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Applied to each daily profit payout your referrals receive.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <Field label="Generation 1 (%)" value={s.gen1_percent} step="0.1" onChange={(v)=>setS({...s, gen1_percent: v})} testid="gen1" />
            <Field label="Generation 2 (%)" value={s.gen2_percent} step="0.1" onChange={(v)=>setS({...s, gen2_percent: v})} testid="gen2" />
            <Field label="Generation 3 (%)" value={s.gen3_percent} step="0.1" onChange={(v)=>setS({...s, gen3_percent: v})} testid="gen3" />
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="text-label">Paystack</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Set mode to <code>live</code> after entering real Paystack keys. In <code>mock</code> mode deposits auto-succeed and Paystack transfers are simulated.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <label className="text-xs">
              <span>Payment mode</span>
              <select value={s.payment_mode} onChange={(e)=>setS({...s, payment_mode: e.target.value})}
                data-testid="payment-mode-select"
                className="w-full mt-1 px-3 py-2.5 input-base">
                <option value="mock">Mock (testing)</option>
                <option value="live">Live (Paystack)</option>
              </select>
            </label>
            <Field label="Public key" value={s.paystack_public_key} text onChange={(v)=>setS({...s, paystack_public_key: v})} testid="pk-key" />
            <label className="md:col-span-2 text-xs">
              <span>Secret key</span>
              <input type="password" value={s.paystack_secret_key || ""} onChange={(e)=>setS({...s, paystack_secret_key: e.target.value})}
                data-testid="sk-key-input"
                className="w-full mt-1 input-base font-mono text-sm" />
            </label>
          </div>
        </div>

        <button data-testid="save-settings-btn" className="flex items-center gap-2 btn-primary">
          <Save className="w-4 h-4" /> Save settings
        </button>
      </form>
    </AdminLayout>
  );
}

function Field({ label, value, onChange, step = "1", text = false, testid }) {
  return (
    <label className="text-xs">
      <span>{label}</span>
      <input
        type={text ? "text" : "number"} step={step} value={value ?? ""}
        onChange={(e)=>onChange(e.target.value)}
        data-testid={`${testid}-input`}
        className="w-full mt-1 input-base" />
    </label>
  );
}
