import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowDownToLine, Search, Eye, BadgeCheck, Copy, CheckCircle2, Wallet, RefreshCw } from "lucide-react";

function avatarColor(seed = "") {
  const palette = ["#E5097F", "#5B5BD6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function StatCard({ tone, label, value, sub, testid }) {
  const tones = {
    neutral: "bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]",
    success: "bg-[color:var(--success-soft)] text-[color:var(--success)]",
    warn: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]",
    error: "bg-[color:var(--error-soft)] text-[color:var(--error)]",
  };
  return (
    <div className="card-soft p-5" data-testid={testid}>
      <div className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>
        {label}
      </div>
      <div className="font-display font-extrabold text-3xl mt-3 text-[color:var(--text-primary)] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--text-tertiary)] mt-1">{sub}</div>}
    </div>
  );
}

function CopyChip({ value, testid }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[color:var(--text-tertiary)]">—</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1300); } catch {}
  };
  return (
    <button onClick={copy} data-testid={testid}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-[color:var(--text-primary)] hover:text-[color:var(--brand)] transition-colors group max-w-[180px]">
      <span className="truncate">{value}</span>
      {copied ? <CheckCircle2 className="w-3 h-3 text-[color:var(--success)] shrink-0" /> : <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 shrink-0" />}
    </button>
  );
}

const STATUS_PILL = {
  success: { label: "funded", cls: "bg-[color:var(--success-soft)] text-[color:var(--success)]" },
  pending: { label: "pending", cls: "bg-[color:var(--gold-soft)] text-[color:var(--warning)]" },
  failed: { label: "unsuccessful", cls: "bg-[color:var(--error-soft)] text-[color:var(--error)]" },
};

export default function AdminDeposits() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);
  const [creditAmt, setCreditAmt] = useState({ open: false, deposit: null });
  const [polling, setPolling] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const load = () => api.get("/admin/deposits").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const refreshOne = async (d) => {
    setRefreshingId(d.id);
    try {
      const { data } = await api.post(`/admin/deposits/${d.id}/refresh-status`);
      const act = data?._refresh || "no_op";
      if (act === "credited") toast.success("Confirmed and credited");
      else if (act === "marked_failed") toast.warning("Gateway reports FAILED");
      else if (act === "still_pending") toast.info("Still pending at gateway");
      else if (act === "no_provider") toast.info("No supported provider — manual credit only");
      else if (act === "already_final") toast.info("Already finalised");
      else toast.info(`Refresh: ${act}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Refresh failed"); }
    finally { setRefreshingId(null); }
  };

  const pollAll = async () => {
    setPolling(true);
    try {
      const { data } = await api.post("/admin/deposits/poll-pending");
      toast.success(`Polled ${data.refreshed} · credited ${data.credited} · failed ${data.marked_failed} · still pending ${data.still_pending}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Poll failed"); }
    finally { setPolling(false); }
  };

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "All") r = r.filter((d) => d.status === filter.toLowerCase());
    const qq = q.trim().toLowerCase();
    if (qq) r = r.filter((d) =>
      (d.user_name || "").toLowerCase().includes(qq)
      || (d.user_phone || "").toLowerCase().includes(qq)
      || (d.reference || "").toLowerCase().includes(qq)
      || (d.method || "").toLowerCase().includes(qq)
    );
    return r;
  }, [items, filter, q]);

  const stats = useMemo(() => ({
    total: items.length,
    funded: filtered.filter((d) => d.status === "success").length,
    pending: filtered.filter((d) => d.status === "pending").length,
    failed: filtered.filter((d) => d.status === "failed").length,
  }), [items, filtered]);

  const credit = async (d) => {
    try {
      await api.post(`/admin/deposits/${d.id}/approve`);
      toast.success(`Credited ₦${Number(d.amount).toLocaleString()} to ${d.user_name}`);
      setCreditAmt({ open: false, deposit: null });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <AdminLayout title="">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#065F46] via-[#047857] to-[#10B981] text-white p-6 md:p-8" data-testid="deposits-hero">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <ArrowDownToLine className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-extrabold text-3xl md:text-4xl leading-tight" data-testid="deposits-title">Deposits</h1>
            <div className="text-white/80 text-xs md:text-sm mt-1" data-testid="deposits-subtitle">
              {stats.total} total · trace every funding attempt · match with gateway IDs
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <StatCard tone="success" label="All deposits" value={stats.total} testid="stat-all" />
        <StatCard tone="success" label="This page · Funded" value={stats.funded} sub="Funded on this page" testid="stat-funded" />
        <StatCard tone="warn" label="This page · Pending" value={stats.pending} testid="stat-pending" />
        <StatCard tone="error" label="This page · Failed" value={stats.failed} testid="stat-failed" />
      </div>

      {/* Search + filter */}
      <div className="card-soft p-3 md:p-4 mt-5 flex items-center gap-3 flex-wrap" data-testid="deposits-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          data-testid="deposits-filter"
          className="shrink-0 input-base text-sm font-semibold">
          <option>All</option>
          <option value="success">Funded</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, username, account, or reference…"
            data-testid="deposits-search"
            className="w-full pl-10 input-base"
          />
        </div>
        <button onClick={pollAll} disabled={polling}
          data-testid="deposits-poll-all"
          title="Re-verify every pending deposit with its payment gateway"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-hover)] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} /> {polling ? "Polling…" : "Poll pending"}
        </button>
      </div>

      {/* Table */}
      <div className="card-soft overflow-hidden mt-5" data-testid="deposits-table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--text-tertiary)] border-b border-[color:var(--border-default)]">
                <th className="text-left p-4">User</th>
                <th className="text-left p-4">Initiated</th>
                <th className="text-left p-4">Paid</th>
                <th className="text-left p-4">Gateway</th>
                <th className="text-left p-4">Gateway ID</th>
                <th className="text-left p-4">Account generated</th>
                <th className="text-left p-4">Our ref</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Date</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {q || filter !== "All" ? "No deposits match this filter." : "No deposits yet."}
                </td></tr>
              )}
              {filtered.map((d) => {
                const pill = STATUS_PILL[d.status] || STATUS_PILL.pending;
                return (
                  <tr key={d.id} className="border-b border-[color:var(--border-default)] last:border-0 hover:bg-[color:var(--surface-alt)]/40 transition-colors" data-testid={`deposit-row-${d.id}`}>
                    <td className="p-4">
                      <Link to={`/admin/users/${d.user_id}`} className="flex items-center gap-2.5 group">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ backgroundColor: avatarColor(d.user_id) }}>
                          {(d.user_name || "?").trim()[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[color:var(--accent-main)] group-hover:underline truncate max-w-[140px]">{d.user_name || "—"}</div>
                          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{d.user_phone}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-4 font-display font-bold tabular-nums">{formatNaira(d.amount)}</td>
                    <td className="p-4 font-display font-bold tabular-nums">
                      {d.status === "success" ? <span className="text-[color:var(--success)]">{formatNaira(d.amount)}</span> : <span className="text-[color:var(--text-tertiary)]">—</span>}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent-soft)] text-[color:var(--accent-main)]">{d.method}</span>
                    </td>
                    <td className="p-4"><CopyChip value={d.gateway_id || d.meta?.gateway_ref} testid={`copy-gid-${d.id}`} /></td>
                    <td className="p-4 text-xs">
                      {d.account_number ? (
                        <div>
                          <div className="font-mono">{d.account_number}</div>
                          {d.bank_name && <div className="text-[10px] text-[color:var(--text-tertiary)]">{d.bank_name}</div>}
                        </div>
                      ) : (
                        <span className="text-[color:var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="p-4"><CopyChip value={d.reference} testid={`copy-ref-${d.id}`} /></td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${pill.cls}`}>{pill.label}</span>
                    </td>
                    <td className="p-4 text-xs text-[color:var(--text-tertiary)] whitespace-nowrap">{formatDate(d.created_at)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setViewing(d)} data-testid={`view-deposit-${d.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--accent-main)]/30 text-[color:var(--accent-main)] hover:bg-[color:var(--accent-soft)]">
                          <Eye className="w-3 h-3" /> View
                        </button>
                        {d.status === "pending" && (d.method === "marasoft" || d.method === "paystack") && (
                          <button onClick={() => refreshOne(d)} disabled={refreshingId === d.id}
                            data-testid={`refresh-deposit-${d.id}`}
                            title="Re-verify with the payment gateway"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                            <RefreshCw className={`w-3 h-3 ${refreshingId === d.id ? "animate-spin" : ""}`} /> Refresh
                          </button>
                        )}
                        {d.status !== "success" && (
                          <button onClick={() => setCreditAmt({ open: true, deposit: d })}
                            data-testid={`credit-deposit-${d.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[color:var(--success)] text-white hover:opacity-90">
                            <BadgeCheck className="w-3 h-3" /> Credit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5" /> Deposit details</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="card-soft p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">User</div><div className="font-semibold mt-1">{viewing.user_name}</div><div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{viewing.user_phone}</div></div>
                <div className="card-soft p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Initiated</div><div className="font-display font-bold mt-1 tabular-nums">{formatNaira(viewing.amount)}</div></div>
                <div className="card-soft p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Status</div><div className={`inline-flex mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${(STATUS_PILL[viewing.status] || STATUS_PILL.pending).cls}`}>{(STATUS_PILL[viewing.status] || STATUS_PILL.pending).label}</div></div>
                <div className="card-soft p-3"><div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Gateway</div><div className="font-semibold mt-1 uppercase">{viewing.method}</div></div>
              </div>
              <div className="card-soft p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Reference</div>
                <div className="font-mono text-xs mt-1 break-all">{viewing.reference}</div>
              </div>
              {viewing.account_number && (
                <div className="card-soft p-3">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]">Account generated</div>
                  <div className="font-mono text-xs mt-1">{viewing.account_number} · {viewing.bank_name || "—"}</div>
                </div>
              )}
              <div className="text-[11px] text-[color:var(--text-tertiary)]">
                Created {formatDate(viewing.created_at)} · Updated {formatDate(viewing.updated_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credit confirm */}
      <Dialog open={creditAmt.open} onOpenChange={(o) => !o && setCreditAmt({ open: false, deposit: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit deposit?</DialogTitle>
          </DialogHeader>
          {creditAmt.deposit && (
            <div className="space-y-2 text-sm">
              <p>This will mark the deposit as <span className="font-bold text-[color:var(--success)]">funded</span> and credit <span className="font-display font-bold tabular-nums">{formatNaira(creditAmt.deposit.amount)}</span> to <span className="font-bold">{creditAmt.deposit.user_name}</span>'s wallet.</p>
              <p className="text-[11px] text-[color:var(--text-tertiary)]">This action is audited and irreversible.</p>
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setCreditAmt({ open: false, deposit: null })} className="px-4 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)]">Cancel</button>
            <button onClick={() => credit(creditAmt.deposit)} data-testid="credit-confirm-btn"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--success)] text-white">Yes, credit</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
