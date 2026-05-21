import React, { useEffect, useState } from "react";
import { Bell, X, CheckCheck, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

const TYPE_ICON = {
  success: { Icon: CheckCircle2, color: "var(--success)", soft: "var(--success-soft)" },
  warn:    { Icon: AlertTriangle, color: "var(--warning)", soft: "rgba(245,158,11,0.16)" },
  info:    { Icon: Info, color: "var(--brand)", soft: "var(--brand-soft)" },
  error:   { Icon: XCircle, color: "var(--error)", soft: "var(--error-soft)" },
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(i);
  }, []);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await api.post("/notifications/mark-all-read");
      } catch { /* ignore */ }
      setUnread(0);
      setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        data-testid="notification-bell"
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface)] hover:bg-[color:var(--surface-alt)]"
      >
        <Bell className="w-4 h-4 text-[color:var(--text-primary)]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[color:var(--accent-main)] text-white rounded-full text-[10px] font-bold flex items-center justify-center" data-testid="notif-unread-count">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-[92vw] max-w-sm bg-[color:var(--surface)] border border-[color:var(--border-default)] rounded-2xl shadow-2xl overflow-hidden" data-testid="notif-panel">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border-default)]">
              <div>
                <div className="text-label">Notifications</div>
                <div className="font-display font-semibold text-[color:var(--text-primary)]">{items.length} recent</div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-[color:var(--surface-alt)]">
                <X className="w-4 h-4 text-[color:var(--text-secondary)]" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && (
                <div className="p-8 text-center text-sm text-[color:var(--text-tertiary)]">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  No notifications yet.
                </div>
              )}
              {items.map((n) => {
                const meta = TYPE_ICON[n.type] || TYPE_ICON.info;
                const Icon = meta.Icon;
                return (
                  <div key={n.id} className="px-4 py-3 border-b border-[color:var(--border-light)] flex items-start gap-3" data-testid={`notif-${n.id}`}>
                    <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: meta.soft, color: meta.color }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[color:var(--text-primary)] truncate">{n.title}</div>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-[color:var(--accent-main)] shrink-0" />}
                      </div>
                      <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-[color:var(--text-tertiary)] mt-1">{formatDate(n.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {items.length > 0 && (
              <div className="px-4 py-2 bg-[color:var(--surface-alt)] text-[11px] text-[color:var(--text-tertiary)] flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> All caught up
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
