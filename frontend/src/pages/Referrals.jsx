import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { Copy, Share2, Users, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { toast } from "sonner";

function GenCard({ gen, data, color, open, onToggle }) {
  const users = data?.users || [];
  return (
    <div className="card-soft overflow-hidden" data-testid={`gen-${gen}-card`}>
      <button type="button" onClick={onToggle} data-testid={`gen-${gen}-toggle`}
        className="w-full p-5 flex items-center justify-between text-left hover:bg-[color:var(--surface-alt)]/40 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-label">Generation {gen}</div>
            <div className="font-display font-bold text-2xl text-[color:var(--text-primary)] leading-tight" data-testid={`gen-${gen}-count`}>
              {data?.count || 0} <span className="text-sm font-medium text-[color:var(--text-secondary)]">member{(data?.count || 0) === 1 ? "" : "s"}</span>
            </div>
            <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              {data?.percent}% commission · earned <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(data?.earnings)}</span>
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-[color:var(--text-tertiary)]" /> : <ChevronDown className="w-5 h-5 text-[color:var(--text-tertiary)]" />}
      </button>

      {open && (
        <div className="border-t border-[color:var(--border-light)]" data-testid={`gen-${gen}-list`}>
          {users.length === 0 && (
            <div className="p-6 text-center text-sm text-[color:var(--text-tertiary)]">No referrals in this generation yet.</div>
          )}
          {users.map((u) => (
            <div key={u.id} className="p-4 border-b last:border-b-0 border-[color:var(--border-light)]" data-testid={`gen-${gen}-user-${u.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[color:var(--text-primary)] truncate">{u.name}</div>
                  <div className="font-mono text-xs text-[color:var(--text-tertiary)]">{u.phone}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">Invested</div>
                  <div className="font-bold text-[color:var(--accent-main)]">{formatNaira(u.total_invested || 0)}</div>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-tertiary)]">
                Joined {formatDate(u.joined_at)}
              </div>
              {u.investments && u.investments.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-[color:var(--brand-soft)] space-y-1">
                  {u.investments.map((i) => (
                    <div key={i.id} className="text-xs flex items-center justify-between gap-2" data-testid={`gen-${gen}-inv-${i.id}`}>
                      <div className="flex items-center gap-1.5 text-[color:var(--text-secondary)] truncate">
                        <TrendingUp className="w-3 h-3 shrink-0 text-[color:var(--brand)]" />
                        <span className="truncate">{i.product_name}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-semibold text-[color:var(--text-primary)]">{formatNaira(i.amount)}</span>
                        <span className="text-[color:var(--text-tertiary)] ml-2">{formatDate(i.started_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Referrals() {
  const [info, setInfo] = useState(null);
  const [openGen, setOpenGen] = useState(1);

  useEffect(() => {
    api.get("/referrals").then(({ data }) => setInfo(data));
  }, []);

  const link = info ? `${window.location.origin}/register?ref=${info.referral_code}` : "";

  const copy = (text, msg) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <UserLayout>
      <div className="text-label">Earn together</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">My Team</h1>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Invite friends and earn a percentage of their daily profits — across 2 generations.</p>

      <div className="card-soft p-6 mt-6 hero-gradient text-white relative overflow-hidden" data-testid="referral-banner">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center relative z-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-white/85">Your code</div>
            <div className="metric-num text-4xl md:text-5xl font-display tracking-widest text-white mt-2 drop-shadow-sm" data-testid="referral-code">{info?.referral_code || "—"}</div>
            <div className="mt-3 text-white/85 text-sm">Total earned: <span className="text-white font-bold">{formatNaira(info?.total_referral_earnings)}</span></div>
          </div>
          <div className="space-y-2">
            <button onClick={() => copy(info?.referral_code, "Code copied")} data-testid="copy-code-btn"
              className="w-full flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur border border-white/30 text-white rounded-lg px-4 py-3 font-semibold">
              <Copy className="w-4 h-4" /> Copy code
            </button>
            <button onClick={() => copy(link, "Link copied")} data-testid="copy-link-btn"
              className="w-full flex items-center justify-center gap-2 bg-white text-[color:var(--brand)] hover:bg-white/90 rounded-lg px-4 py-3 font-semibold shadow-lg shadow-black/10">
              <Share2 className="w-4 h-4" /> Copy invite link
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mt-6" data-testid="team-generations">
        <div className="flex-1">
          <GenCard gen={1} data={info?.gen1} color="bg-[color:var(--success-soft)] text-[color:var(--success)]"
                   open={openGen === 1} onToggle={() => setOpenGen(openGen === 1 ? null : 1)} />
        </div>
        <div className="flex-1">
          <GenCard gen={2} data={info?.gen2} color="bg-[color:var(--brand-soft)] text-[color:var(--brand)]"
                   open={openGen === 2} onToggle={() => setOpenGen(openGen === 2 ? null : 2)} />
        </div>
      </div>
    </UserLayout>
  );
}
