import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Save, Megaphone, Flame, ImagePlus, X, Banknote, MessageCircle, Clock } from "lucide-react";

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get("/admin/settings"),
      api.get("/admin/products"),
    ]).then(([{ data: sd }, { data: pd }]) => {
      setS(sd);
      setProducts(pd);
    });
  }, []);

  const uploadAnnouncement = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setS((prev) => ({ ...prev, home_announcement_image_url: data.url }));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        gen1_percent: Number(s.gen1_percent),
        gen2_percent: Number(s.gen2_percent),
        paystack_public_key: s.paystack_public_key || "",
        paystack_secret_key: s.paystack_secret_key || "",
        nomba_client_id: s.nomba_client_id || "",
        nomba_client_secret: s.nomba_client_secret || "",
        nomba_account_id: s.nomba_account_id || "",
        nomba_environment: s.nomba_environment || "sandbox",
        deposit_gateway: s.deposit_gateway || "paystack",
        payout_gateway: s.payout_gateway || "paystack",
        payment_mode: s.payment_mode || "mock",
        auto_payout_enabled: !!s.auto_payout_enabled,
        withdrawals_open: s.withdrawals_open !== false,
        withdrawal_start_time: s.withdrawal_start_time || "00:00",
        withdrawal_end_time: s.withdrawal_end_time || "23:59",
        featured_product_id: s.featured_product_id || null,
        home_announcement: s.home_announcement || "",
        home_announcement_active: !!s.home_announcement_active,
        home_announcement_image_url: s.home_announcement_image_url || "",
        telegram_url: s.telegram_url || "",
        welcome_message: s.welcome_message || "",
        welcome_modal_title: s.welcome_modal_title || "",
        welcome_modal_active: s.welcome_modal_active !== false,
      };
      const { data } = await api.put("/admin/settings", payload);
      setS(data);
      toast.success("Settings saved");
    } catch (e) { toast.error("Failed"); }
  };

  if (!s) return <AdminLayout title="Settings"><div className="text-[color:var(--text-secondary)]">Loading…</div></AdminLayout>;

  const annImg = s.home_announcement_image_url;

  return (
    <AdminLayout title="Settings">
      <form onSubmit={save} className="w-full" data-testid="settings-form">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card-soft p-6">
          <div className="text-label flex items-center gap-2"><Flame className="w-3.5 h-3.5 text-[color:var(--accent-main)]" /> Home page content</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">
            Pick the plan that shows as the <strong>featured "Hot pick"</strong> on every user's home page, and broadcast an announcement (text + optional image).
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
              <option key={p.id} value={p.id}>{`${p.name} · ${p.daily_profit_percent}% × ${p.duration_days}d`}</option>
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
            placeholder="e.g. Weekend bonus: top-up ₦20,000 and get an extra 5%!"
            data-testid="home-announcement-input"
            className="w-full mt-2 input-base resize-none" />

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Announcement image (optional)</label>
            <div className="mt-2 flex items-start gap-4">
              <div className="w-32 h-20 rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-alt)] flex items-center justify-center overflow-hidden shrink-0">
                {annImg ? (
                  <img src={resolveImg(annImg)} alt="ann" className="w-full h-full object-cover" data-testid="ann-image-preview" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-[color:var(--text-tertiary)]" />
                )}
              </div>
              <div className="flex-1 flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAnnouncement} className="hidden" data-testid="ann-image-input" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  data-testid="ann-image-upload-btn"
                  className="px-3 py-2 text-xs rounded-md bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-60">
                  {uploading ? "Uploading…" : (annImg ? "Replace image" : "Upload image")}
                </button>
                {annImg && (
                  <button type="button" onClick={() => setS({ ...s, home_announcement_image_url: "" })}
                    data-testid="ann-image-clear-btn"
                    className="px-3 py-2 text-xs rounded-md bg-[color:var(--error-soft)] text-[color:var(--error)] inline-flex items-center gap-1">
                    <X className="w-3 h-3" /> Remove
                  </button>
                )}
                <p className="text-[11px] text-[color:var(--text-tertiary)] basis-full mt-1">JPG/PNG/WebP up to 5MB. Shown above the announcement text on the user home page.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="flex items-center justify-between">
            <div className="text-label flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5 text-[color:var(--brand)]" /> Welcome modal & community</div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={s.welcome_modal_active !== false}
                onChange={(e) => setS({ ...s, welcome_modal_active: e.target.checked })}
                data-testid="welcome-modal-active-checkbox" />
              <span className="text-[color:var(--text-secondary)]">Show modal</span>
            </label>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Shown to every user when they open their dashboard. Untick the box above to disable the modal entirely.</p>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Heading</label>
          <input type="text" value={s.welcome_modal_title || ""}
            onChange={(e) => setS({ ...s, welcome_modal_title: e.target.value })}
            placeholder="e.g. Hi {name} — welcome to NaijaInvest"
            data-testid="welcome-modal-title-input"
            className="w-full mt-2 input-base" />
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">Use <code>{`{name}`}</code> to inject the user's first name. Leave empty for the default greeting.</p>

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Welcome message</label>
          <textarea rows={4} value={s.welcome_message || ""}
            onChange={(e) => setS({ ...s, welcome_message: e.target.value })}
            placeholder="Welcome to NaijaInvest! Earn daily returns on every plan. Join our Telegram community for tips, updates and support."
            data-testid="welcome-message-input"
            className="w-full mt-2 input-base resize-none" />

          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Telegram group link</label>
          <input type="url" value={s.telegram_url || ""}
            onChange={(e) => setS({ ...s, telegram_url: e.target.value })}
            placeholder="https://t.me/your-group"
            data-testid="telegram-url-input"
            className="w-full mt-2 input-base" />
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1">Shows as a "Join Telegram" button inside the welcome modal. Leave empty to hide the button.</p>
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
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Applied to each daily profit payout your referrals receive (2 generations).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Field label="Generation 1 (%)" value={s.gen1_percent} step="0.1" onChange={(v)=>setS({...s, gen1_percent: v})} testid="gen1" />
            <Field label="Generation 2 (%)" value={s.gen2_percent} step="0.1" onChange={(v)=>setS({...s, gen2_percent: v})} testid="gen2" />
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="text-label flex items-center gap-2"><Banknote className="w-3.5 h-3.5 text-[color:var(--brand)]" /> Payment gateways</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Switch the active gateway for deposits and payouts. Both Paystack and Nomba support Nigerian Naira transfers.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="text-xs">
              <span>Deposit gateway</span>
              <select value={s.deposit_gateway || "paystack"} onChange={(e)=>setS({...s, deposit_gateway: e.target.value})}
                data-testid="deposit-gateway-select"
                className="w-full mt-1 px-3 py-2.5 input-base">
                <option value="paystack">Paystack</option>
                <option value="nomba">Nomba</option>
              </select>
            </label>
            <label className="text-xs">
              <span>Payout gateway</span>
              <select value={s.payout_gateway || "paystack"} onChange={(e)=>setS({...s, payout_gateway: e.target.value})}
                data-testid="payout-gateway-select"
                className="w-full mt-1 px-3 py-2.5 input-base">
                <option value="paystack">Paystack</option>
                <option value="nomba">Nomba</option>
              </select>
            </label>
            <label className="md:col-span-2 text-xs">
              <span>Mode</span>
              <select value={s.payment_mode} onChange={(e)=>setS({...s, payment_mode: e.target.value})}
                data-testid="payment-mode-select"
                className="w-full mt-1 px-3 py-2.5 input-base">
                <option value="mock">Mock (testing — deposits auto-succeed, payouts simulated)</option>
                <option value="live">Live (real Paystack / Nomba calls)</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="flex items-center justify-between">
            <div className="text-label flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-[color:var(--brand)]" /> Withdrawal automation & hours</div>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Auto-payout sends withdrawals to users instantly via the configured payout gateway. If unchecked, withdrawals queue as pending for admin approval.</p>

          <label className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-[color:var(--surface-alt)] cursor-pointer">
            <input type="checkbox" checked={!!s.auto_payout_enabled}
              onChange={(e) => setS({ ...s, auto_payout_enabled: e.target.checked })}
              data-testid="auto-payout-toggle" />
            <div>
              <div className="font-semibold text-[color:var(--text-primary)] text-sm">Auto-payout enabled</div>
              <div className="text-[11px] text-[color:var(--text-secondary)]">When ON, user withdrawals are paid out immediately. Failed transfers fall back to pending.</div>
            </div>
          </label>

          <label className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-[color:var(--surface-alt)] cursor-pointer">
            <input type="checkbox" checked={s.withdrawals_open !== false}
              onChange={(e) => setS({ ...s, withdrawals_open: e.target.checked })}
              data-testid="withdrawals-open-toggle" />
            <div>
              <div className="font-semibold text-[color:var(--text-primary)] text-sm">Withdrawals open</div>
              <div className="text-[11px] text-[color:var(--text-secondary)]">Master kill-switch. Untick to temporarily close withdrawals (maintenance, outages).</div>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <label className="text-xs">
              <span>Open time (Lagos)</span>
              <input type="time" value={s.withdrawal_start_time || "00:00"}
                onChange={(e) => setS({ ...s, withdrawal_start_time: e.target.value })}
                data-testid="withdrawal-start-input"
                className="w-full mt-1 input-base" />
            </label>
            <label className="text-xs">
              <span>Close time (Lagos)</span>
              <input type="time" value={s.withdrawal_end_time || "23:59"}
                onChange={(e) => setS({ ...s, withdrawal_end_time: e.target.value })}
                data-testid="withdrawal-end-input"
                className="w-full mt-1 input-base" />
            </label>
          </div>
          <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">Set to 00:00 → 23:59 for always-on. Overnight windows (e.g. 22:00 → 04:00) supported.</p>
        </div>

        <div className="card-soft p-6">
          <div className="text-label">Paystack credentials</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Required only when a Paystack gateway is active and mode is <code>live</code>.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <Field label="Public key" value={s.paystack_public_key} text onChange={(v)=>setS({...s, paystack_public_key: v})} testid="pk-key" />
            <label className="text-xs">
              <span>Secret key</span>
              <input type="password" value={s.paystack_secret_key || ""} onChange={(e)=>setS({...s, paystack_secret_key: e.target.value})}
                data-testid="sk-key-input"
                className="w-full mt-1 input-base font-mono text-sm" />
            </label>
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="text-label">Nomba credentials</div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">Required only when a Nomba gateway is active and mode is <code>live</code>. Pick the environment that matches your keys — Nomba sandbox and production are separate.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <label className="text-xs md:col-span-2">
              <span>Environment</span>
              <select
                value={s.nomba_environment || "sandbox"}
                onChange={(e) => setS({ ...s, nomba_environment: e.target.value })}
                data-testid="nomba-environment-select"
                className="w-full mt-1 input-base"
              >
                <option value="sandbox">{`Sandbox (sandbox.nomba.com)`}</option>
                <option value="production">{`Production (api.nomba.com)`}</option>
              </select>
            </label>
            <Field label="Client ID" value={s.nomba_client_id} text onChange={(v)=>setS({...s, nomba_client_id: v})} testid="nomba-client-id" />
            <Field label="Account ID" value={s.nomba_account_id} text onChange={(v)=>setS({...s, nomba_account_id: v})} testid="nomba-account-id" />
            <label className="md:col-span-2 text-xs">
              <span>Client secret</span>
              <input type="password" value={s.nomba_client_secret || ""} onChange={(e)=>setS({...s, nomba_client_secret: e.target.value})}
                data-testid="nomba-client-secret-input"
                className="w-full mt-1 input-base font-mono text-sm" />
            </label>
          </div>
        </div>

        </div>

        <button data-testid="save-settings-btn" className="mt-6 flex items-center gap-2 btn-primary">
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
