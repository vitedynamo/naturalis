import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Save, Megaphone, Flame, ImagePlus, X, Banknote, Clock, KeyRound,
  ArrowDownToLine, ArrowUpFromLine, Share2, ShieldAlert, Home,
  Sparkles, Check,
} from "lucide-react";

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

/* ----------------------------------------------------------------------------
 * Reusable bits
 * --------------------------------------------------------------------------*/
function Field({ label, value, onChange, step = "1", text = false, testid, sub }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">{label}</span>
      <input
        type={text ? "text" : "number"} step={step} value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`${testid}-input`}
        className="w-full input-base"
      />
      {sub && <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">{sub}</span>}
    </label>
  );
}

function SecretField({ label, value, onChange, placeholder, sub, testid }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">{label}</span>
      <input
        type="password" value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={`${testid}-input`}
        className="w-full input-base font-mono text-sm"
      />
      {sub && <span className="block text-[10px] text-[color:var(--text-tertiary)] mt-1">{sub}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint, testid }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        data-testid={testid}
        aria-pressed={checked}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA]" : "bg-[color:var(--surface-alt)]"}`}
      >
        <span className={`absolute top-0.5 ${checked ? "left-[22px]" : "left-0.5"} w-5 h-5 rounded-full bg-white shadow transition-all`} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{label}</div>
        {hint && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="card-soft p-6">
      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[color:var(--text-tertiary)]">{title}</div>
      {hint && <p className="text-xs text-[color:var(--text-secondary)] mt-1.5 leading-relaxed">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Gateway picker card — the signature element from the reference */
function GatewayCard({ active, label, name, sub, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`relative text-left p-4 rounded-2xl border-2 transition-all ${active
        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] shadow-md ring-2 ring-[color:var(--brand)]/10"
        : "border-[color:var(--border-default)] bg-[color:var(--surface)] hover:border-[color:var(--brand)]/50"}`}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">{label}</div>
      <div className={`font-display font-extrabold text-lg mt-0.5 ${active ? "text-[color:var(--brand)]" : "text-[color:var(--text-primary)]"}`}>{name}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
      {active && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[color:var(--brand)] text-white flex items-center justify-center">
          <Check className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

/* ============================================================================
 * MAIN
 * ==========================================================================*/
const TABS = [
  { key: "deposits",    label: "Deposits",     icon: ArrowDownToLine },
  { key: "withdrawals", label: "Withdrawals",  icon: ArrowUpFromLine },
  { key: "referrals",   label: "Referrals",    icon: Share2 },
  { key: "gateways",    label: "Gateways",     icon: KeyRound },
  { key: "home",        label: "Home",         icon: Home },
  { key: "danger",      label: "Danger zone",  icon: ShieldAlert },
];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("deposits");
  const [saving, setSaving] = useState(false);
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
    e?.preventDefault?.();
    setSaving(true);
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
        marasoft_public_key: s.marasoft_public_key || "",
        marasoft_secret_key: s.marasoft_secret_key || "",
        marasoft_encryption_key: s.marasoft_encryption_key || "",
        marasoft_secret_hash: s.marasoft_secret_hash || "",
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
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!s) return <AdminLayout title="Settings"><div className="text-[color:var(--text-secondary)] p-6">Loading…</div></AdminLayout>;

  const ActiveIcon = (TABS.find((t) => t.key === tab) || TABS[0]).icon;

  return (
    <AdminLayout title="">
      {/* ===== HERO ===== */}
      <div
        className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8"
        style={{ background: "linear-gradient(120deg,#3F0825 0%,#7A0A45 38%,#C81A6E 72%,#E5097F 100%)" }}
        data-testid="settings-hero"
      >
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-48 h-48 rounded-full bg-[#FF5BAA]/30 blur-3xl" />
        {/* Gear-strip decoration */}
        <svg className="absolute inset-y-0 right-0 h-full opacity-[0.10]" viewBox="0 0 200 200" preserveAspectRatio="none">
          <g fill="none" stroke="white" strokeWidth="1.5">
            <circle cx="60" cy="100" r="36" />
            <circle cx="140" cy="60" r="22" />
            <circle cx="140" cy="140" r="22" />
            <circle cx="60" cy="100" r="6" fill="white" />
            <circle cx="140" cy="60" r="4" fill="white" />
            <circle cx="140" cy="140" r="4" fill="white" />
          </g>
        </svg>
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <ActiveIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/80">Configuration · gateways · limits</div>
              <div className="font-display font-extrabold text-3xl md:text-4xl leading-tight mt-1">Settings</div>
              <div className="text-white/85 text-xs md:text-sm mt-1.5">Mode: <span className="font-bold uppercase">{s.payment_mode || "mock"}</span> · Deposit gateway: <span className="font-bold uppercase">{s.deposit_gateway || "paystack"}</span> · Payout gateway: <span className="font-bold uppercase">{s.payout_gateway || "paystack"}</span></div>
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            data-testid="save-settings-btn"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[color:var(--brand)] font-bold text-sm shadow-lg hover:scale-105 transition-transform disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* ===== Tab pills (horizontal scroll on mobile) ===== */}
      <div className="card-soft p-2 mt-5 flex items-center gap-1 overflow-x-auto" data-testid="settings-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${active
                ? "bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white shadow"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== Tab content ===== */}
      <form onSubmit={save} className="mt-5 space-y-5" data-testid="settings-form">
        {tab === "deposits" && (
          <>
            <Section title="Active deposit gateway" hint="Pick which provider funds users' deposits. Users on /deposit will see the virtual account from this gateway only. Make sure the gateway is also enabled below.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <GatewayCard active={s.deposit_gateway === "paystack"}  label="Card / Bank" name="Paystack" sub="NGN card + bank transfer" onClick={() => setS({ ...s, deposit_gateway: "paystack" })}  testid="dep-gw-paystack" />
                <GatewayCard active={s.deposit_gateway === "nomba"}     label="Wallet"      name="Nomba"    sub="Virtual account · bank pay-in" onClick={() => setS({ ...s, deposit_gateway: "nomba" })}     testid="dep-gw-nomba" />
                <GatewayCard active={s.deposit_gateway === "marasoft"}  label="9PSB / VAS"  name="Marasoft" sub="Dynamic virtual account" onClick={() => setS({ ...s, deposit_gateway: "marasoft" })} testid="dep-gw-marasoft" />
              </div>
            </Section>

            <Section title="Limits & bonuses">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Min deposit (₦)"    value={s.min_deposit}    onChange={(v) => setS({ ...s, min_deposit: v })}   testid="min-deposit" />
                <Field label="Welcome bonus (₦)"  value={s.welcome_bonus}  onChange={(v) => setS({ ...s, welcome_bonus: v })} testid="welcome-bonus" sub="Credited once at signup" />
                <Field label="Min withdrawal (₦)" value={s.min_withdrawal} onChange={(v) => setS({ ...s, min_withdrawal: v })} testid="min-withdrawal" />
              </div>
            </Section>
          </>
        )}

        {tab === "withdrawals" && (
          <>
            <Section title="Active payout gateway" hint="Which provider actually sends money out when a withdrawal is approved.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GatewayCard active={s.payout_gateway === "paystack"} label="Transfer" name="Paystack" sub="Paystack Transfers API" onClick={() => setS({ ...s, payout_gateway: "paystack" })} testid="payout-gw-paystack" />
                <GatewayCard active={s.payout_gateway === "nomba"}    label="Wallet"   name="Nomba"    sub="Nomba transfer-to-bank"  onClick={() => setS({ ...s, payout_gateway: "nomba" })}    testid="payout-gw-nomba" />
              </div>
            </Section>

            <Section title="Automation & opening hours" hint="Auto-payout pushes money out the moment a user requests it. With it off, withdrawals queue for admin approval.">
              <div className="space-y-3">
                <Toggle checked={!!s.auto_payout_enabled}     onChange={(v) => setS({ ...s, auto_payout_enabled: v })} label="Auto-payout enabled"   hint="When ON, user withdrawals process instantly. Failed transfers fall back to pending." testid="auto-payout-toggle" />
                <Toggle checked={s.withdrawals_open !== false} onChange={(v) => setS({ ...s, withdrawals_open: v })}   label="Withdrawals open"      hint="Master kill-switch. Untick to temporarily close withdrawals." testid="withdrawals-open-toggle" />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Open time (Lagos)</span>
                  <input type="time" value={s.withdrawal_start_time || "00:00"} onChange={(e) => setS({ ...s, withdrawal_start_time: e.target.value })} data-testid="withdrawal-start-input" className="w-full input-base" />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Close time (Lagos)</span>
                  <input type="time" value={s.withdrawal_end_time || "23:59"} onChange={(e) => setS({ ...s, withdrawal_end_time: e.target.value })} data-testid="withdrawal-end-input" className="w-full input-base" />
                </label>
              </div>
              <p className="text-[11px] text-[color:var(--text-tertiary)] mt-2">Set to 00:00 → 23:59 for always-on. Overnight windows (e.g. 22:00 → 04:00) supported.</p>
            </Section>
          </>
        )}

        {tab === "referrals" && (
          <Section title="Commission percentages" hint="Applied to each daily profit payout your referrals receive (2 generations).">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Generation 1 (%) · direct referrals" value={s.gen1_percent} step="0.1" onChange={(v) => setS({ ...s, gen1_percent: v })} testid="gen1" />
              <Field label="Generation 2 (%) · indirect"          value={s.gen2_percent} step="0.1" onChange={(v) => setS({ ...s, gen2_percent: v })} testid="gen2" />
            </div>
          </Section>
        )}

        {tab === "gateways" && (
          <>
            <Section title="Paystack credentials" hint="Required only when a Paystack gateway is active and mode is live.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.paystack_public_key} text onChange={(v) => setS({ ...s, paystack_public_key: v })} testid="pk-key" />
                <SecretField label="Secret key" value={s.paystack_secret_key} onChange={(v) => setS({ ...s, paystack_secret_key: v })} testid="sk-key" />
              </div>
            </Section>

            <Section title="Nomba credentials" hint="Pick the environment that matches your keys — Nomba sandbox and production are separate.">
              <label className="block mb-4">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Environment</span>
                <select value={s.nomba_environment || "sandbox"} onChange={(e) => setS({ ...s, nomba_environment: e.target.value })} data-testid="nomba-environment-select" className="w-full input-base">
                  <option value="sandbox">Sandbox (sandbox.nomba.com)</option>
                  <option value="production">Production (api.nomba.com)</option>
                </select>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Client ID" value={s.nomba_client_id} text onChange={(v) => setS({ ...s, nomba_client_id: v })} testid="nomba-client-id" />
                <Field label="Account ID" value={s.nomba_account_id} text onChange={(v) => setS({ ...s, nomba_account_id: v })} testid="nomba-account-id" />
                <div className="md:col-span-2">
                  <SecretField label="Client secret" value={s.nomba_client_secret} onChange={(v) => setS({ ...s, nomba_client_secret: v })} testid="nomba-client-secret" />
                </div>
              </div>
            </Section>

            <Section title="Marasoft credentials" hint="Used when deposit gateway is Marasoft. The key prefix (MSFT_Live_ vs MSFT_Test_) determines sandbox vs production automatically.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Public key" value={s.marasoft_public_key} text onChange={(v) => setS({ ...s, marasoft_public_key: v })} testid="marasoft-public-key" />
                <Field label="Encryption key" value={s.marasoft_encryption_key} text onChange={(v) => setS({ ...s, marasoft_encryption_key: v })} testid="marasoft-encryption-key" />
                <div className="md:col-span-2">
                  <SecretField label="Secret key" value={s.marasoft_secret_key} onChange={(v) => setS({ ...s, marasoft_secret_key: v })} testid="marasoft-secret-key" />
                </div>
                <div className="md:col-span-2">
                  <SecretField label="Webhook secret hash" value={s.marasoft_secret_hash} onChange={(v) => setS({ ...s, marasoft_secret_hash: v })} placeholder="Paste the same value you set in Marasoft dashboard → Settings → Secret Hash" sub="Optional but recommended. When set, the webhook rejects requests whose secret_hash field does not match." testid="marasoft-secret-hash" />
                </div>
              </div>
              <div className="mt-4 text-[11px] text-[color:var(--text-tertiary)] bg-[color:var(--surface-alt)] rounded-md p-3">
                <span className="font-bold text-[color:var(--text-primary)]">Webhook URL:</span> <code className="break-all">{(process.env.REACT_APP_BACKEND_URL || "")}/api/deposit/webhook/marasoft</code>
                <div className="mt-1">Add this URL in your Marasoft dashboard so credit events reach the platform.</div>
              </div>
            </Section>
          </>
        )}

        {tab === "home" && (
          <>
            <Section title="Home page banner" hint="Pinned promo banner that appears at the top of the user dashboard. Toggle off to hide it without losing the text.">
              <div className="space-y-4">
                <Toggle checked={!!s.home_announcement_active} onChange={(v) => setS({ ...s, home_announcement_active: v })} label="Show banner on home" testid="home-announcement-toggle" />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Banner text</span>
                  <textarea rows={3} value={s.home_announcement || ""} onChange={(e) => setS({ ...s, home_announcement: e.target.value })} data-testid="home-announcement-input" className="w-full input-base resize-none" placeholder="e.g. 🎉 5% extra on every deposit this weekend." />
                </label>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Banner image</span>
                  {s.home_announcement_image_url ? (
                    <div className="relative inline-block">
                      <img src={resolveImg(s.home_announcement_image_url)} alt="" className="max-h-40 rounded-xl" />
                      <button type="button" onClick={() => setS({ ...s, home_announcement_image_url: "" })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[color:var(--error)] text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[color:var(--border-default)] cursor-pointer hover:bg-[color:var(--surface-alt)]">
                      <ImagePlus className="w-5 h-5 text-[color:var(--brand)]" />
                      <span className="text-sm font-semibold text-[color:var(--text-primary)]">{uploading ? "Uploading…" : "Click to upload image"}</span>
                      <input ref={fileRef} type="file" accept="image/*" onChange={uploadAnnouncement} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Welcome modal" hint="Shown to new users when they first log in. Use it to greet, link Telegram, or push the headline product.">
              <div className="space-y-4">
                <Toggle checked={s.welcome_modal_active !== false} onChange={(v) => setS({ ...s, welcome_modal_active: v })} label="Show welcome modal to new users" testid="welcome-modal-toggle" />
                <Field label="Modal title" text value={s.welcome_modal_title} onChange={(v) => setS({ ...s, welcome_modal_title: v })} testid="welcome-modal-title" />
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Welcome message</span>
                  <textarea rows={3} value={s.welcome_message || ""} onChange={(e) => setS({ ...s, welcome_message: e.target.value })} data-testid="welcome-message-input" className="w-full input-base resize-none" />
                </label>
                <Field label="Telegram URL" text value={s.telegram_url} onChange={(v) => setS({ ...s, telegram_url: v })} testid="telegram-url" sub="Shows as a 'Join Telegram' button inside the welcome modal. Leave empty to hide." />
              </div>
            </Section>

            <Section title="Featured product" hint="Pinned to the top of the Invest tab.">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)] mb-1.5">Pick a product</span>
                <select value={s.featured_product_id || ""} onChange={(e) => setS({ ...s, featured_product_id: e.target.value || null })} data-testid="featured-product-select" className="w-full input-base">
                  <option value="">None</option>
                  {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </label>
            </Section>
          </>
        )}

        {tab === "danger" && (
          <Section title="Danger zone" hint="Settings that affect how real money moves. Touch with care.">
            <div className="space-y-4">
              <div className="card-soft p-4 border border-[color:var(--error)]/20">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-[color:var(--error)] mb-1.5">Payment mode</span>
                  <select value={s.payment_mode || "mock"} onChange={(e) => setS({ ...s, payment_mode: e.target.value })} data-testid="payment-mode-select" className="w-full input-base font-semibold">
                    <option value="mock">Mock — deposits auto-succeed, payouts simulated (testing only)</option>
                    <option value="live">Live — real Paystack / Nomba / Marasoft calls</option>
                  </select>
                  <span className="block text-[11px] text-[color:var(--text-tertiary)] mt-2">Mock mode never moves real money. Switch to <span className="font-bold">Live</span> only when you've added gateway credentials and tested a real deposit.</span>
                </label>
              </div>
              <div className="rounded-xl bg-[color:var(--error-soft)] text-[color:var(--error)] p-3 text-[11px] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Always verify a small test transaction after editing gateway credentials. Changes apply instantly and may interrupt in-flight deposits.</span>
              </div>
            </div>
          </Section>
        )}

        {/* Sticky save bar at the bottom */}
        <div className="sticky bottom-3 mt-6 card-soft p-3 flex items-center gap-3 border border-[color:var(--brand)]/20 shadow-lg bg-[color:var(--surface)]">
          <Sparkles className="w-4 h-4 text-[color:var(--brand)]" />
          <span className="text-xs text-[color:var(--text-secondary)] flex-1">Changes apply across the whole app the moment you save.</span>
          <button
            type="submit"
            disabled={saving}
            data-testid="save-settings-btn-bottom"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[color:var(--brand)] to-[#FF5BAA] text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
