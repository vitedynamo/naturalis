export function formatNaira(amount, opts = {}) {
  const { compact = false } = opts;
  const n = Number(amount || 0);
  if (compact && Math.abs(n) >= 1000) {
    return "₦" + new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  return "₦" + new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

export function relativeTime(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}


export function timeUntilNextPayout(lastPayoutIso) {
  if (!lastPayoutIso) return "—";
  try {
    const last = new Date(lastPayoutIso).getTime();
    const next = last + 24 * 3600 * 1000;
    const diff = next - Date.now();
    if (diff <= 0) return "Due now";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  } catch { return "—"; }
}
