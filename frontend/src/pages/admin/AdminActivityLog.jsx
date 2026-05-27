import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { History, Search, X, ShieldCheck, KeyRound, Coins, ArrowUpFromLine, ArrowDownToLine, Settings as SettingsIcon, Ban, UserCheck } from "lucide-react";
import Pagination from "@/components/admin/Pagination";

const ICONS = {
  "pin.cleared": KeyRound,
  "user.balance_adjusted": Coins,
  "user.blocked": Ban,
  "user.unblocked": UserCheck,
  "withdrawal.approved": ArrowUpFromLine,
  "withdrawal.rejected": ArrowUpFromLine,
  "withdrawal.paid_paystack": ArrowUpFromLine,
  "withdrawal.paid_nomba": ArrowUpFromLine,
  "deposit.approved": ArrowDownToLine,
  "settings.updated": SettingsIcon,
};

const TONES = {
  "pin.cleared": "text-[color:var(--warning)] bg-[color:var(--gold-soft)]",
  "user.balance_adjusted": "text-[color:var(--brand)] bg-[color:var(--brand-soft)]",
  "user.blocked": "text-[color:var(--error)] bg-[color:var(--error-soft)]",
  "user.unblocked": "text-[color:var(--success)] bg-[color:var(--success-soft)]",
  "withdrawal.approved": "text-[color:var(--success)] bg-[color:var(--success-soft)]",
  "withdrawal.rejected": "text-[color:var(--error)] bg-[color:var(--error-soft)]",
  "withdrawal.paid_paystack": "text-[color:var(--accent-main)] bg-[color:var(--surface-alt)]",
  "withdrawal.paid_nomba": "text-[color:var(--brand)] bg-[color:var(--brand-soft)]",
  "deposit.approved": "text-[color:var(--success)] bg-[color:var(--success-soft)]",
  "settings.updated": "text-[color:var(--text-secondary)] bg-[color:var(--surface-alt)]",
};

function ActionBadge({ action }) {
  const Icon = ICONS[action] || ShieldCheck;
  const tone = TONES[action] || "text-[color:var(--text-secondary)] bg-[color:var(--surface-alt)]";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${tone}`}>
      <Icon className="w-3 h-3" /> {action}
    </span>
  );
}

export default function AdminActivityLog() {
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [filter, setFilter] = useState({ action: "", q: "" });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.action) params.set("action", filter.action);
      const { data } = await api.get(`/admin/activity${params.toString() ? `?${params}` : ""}`);
      setItems(data.items || []);
      setActions(data.actions || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter.action]);
  useEffect(() => { setPage(1); }, [filter.action, filter.q]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      (it.admin_phone || "").toLowerCase().includes(q)
      || (it.admin_name || "").toLowerCase().includes(q)
      || (it.target_id || "").toLowerCase().includes(q)
      || (it.description || "").toLowerCase().includes(q)
    );
  }, [items, filter.q]);

  const safePage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  return (
    <AdminLayout title="Activity Log">
      <div className="card-soft p-5 mb-5" data-testid="activity-toolbar">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--accent-main)] flex items-center justify-center text-white">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold text-[color:var(--text-primary)]">Admin Activity Log</div>
            <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">Tamper-resistant audit trail of every sensitive admin action.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-tertiary)]" />
            <input
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="Search by admin phone / name / target id / description…"
              data-testid="activity-search-input"
              className="w-full pl-10 pr-10 input-base"
            />
            {filter.q && (
              <button onClick={() => setFilter({ ...filter, q: "" })} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-[color:var(--surface-alt)]" data-testid="activity-search-clear">
                <X className="w-4 h-4 text-[color:var(--text-tertiary)]" />
              </button>
            )}
          </div>
          <select
            value={filter.action}
            onChange={(e) => setFilter({ ...filter, action: e.target.value })}
            data-testid="activity-action-filter"
            className="input-base"
          >
            <option value="">{`All actions (${actions.length})`}</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]" data-testid="activity-table">
            <thead className="bg-[color:var(--surface-alt)] text-[color:var(--text-secondary)]">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">When</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Admin</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Action</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Target</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((it) => (
                <tr key={it.id} className="border-t border-[color:var(--border-default)] align-top" data-testid={`activity-row-${it.id}`}>
                  <td className="p-3 text-[color:var(--text-secondary)] whitespace-nowrap text-xs">{formatDate(it.created_at)}</td>
                  <td className="p-3">
                    <div className="font-medium text-[color:var(--text-primary)] text-xs">{it.admin_name || "—"}</div>
                    <div className="font-mono text-[10px] text-[color:var(--text-tertiary)]">{it.admin_phone}</div>
                  </td>
                  <td className="p-3"><ActionBadge action={it.action} /></td>
                  <td className="p-3">
                    {it.target_type && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] font-bold">{it.target_type}</div>
                        <div className="font-mono text-[11px] text-[color:var(--text-primary)] break-all">{it.target_id || "—"}</div>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-[color:var(--text-primary)] text-xs">{it.description}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">
                  {filter.q || filter.action ? "No activity matches the current filter." : "No admin activity recorded yet."}
                </td></tr>
              )}
              {loading && (
                <tr><td colSpan={5} className="p-12 text-center text-[color:var(--text-tertiary)]">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={page}
            setPage={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            testidPrefix="activity-page"
          />
        )}
      </div>
    </AdminLayout>
  );
}
