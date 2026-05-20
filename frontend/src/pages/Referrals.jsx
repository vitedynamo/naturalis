import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";
import { Copy, Share2, Users } from "lucide-react";
import { toast } from "sonner";

function GenColumn({ gen, data, color }) {
  return (
    <div className="card-soft p-5" data-testid={`gen-${gen}-card`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label">Generation {gen}</div>
          <div className="metric-num text-3xl mt-1">{data?.count || 0}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Users className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 text-sm text-[#4A5D54]">
        Commission: <span className="font-semibold text-[#0A1C16]">{data?.percent}%</span>
      </div>
      <div className="text-sm text-[#4A5D54]">
        Earned: <span className="font-semibold text-[#0A1C16]">{formatNaira(data?.earnings)}</span>
      </div>
      <div className="mt-4 max-h-40 overflow-y-auto divide-y divide-[#F1F5F9]">
        {(data?.users || []).map(u => (
          <div key={u.id} className="py-2 text-sm flex justify-between">
            <div>
              <div className="font-medium text-[#0A1C16]">{u.name}</div>
              <div className="text-xs text-[#8A9C93]">{u.phone}</div>
            </div>
            <div className="text-xs text-[#8A9C93]">{formatDate(u.joined_at)}</div>
          </div>
        ))}
        {(!data?.users || data.users.length === 0) && (
          <div className="py-4 text-xs text-[#8A9C93]">No referrals yet.</div>
        )}
      </div>
    </div>
  );
}

export default function Referrals() {
  const [info, setInfo] = useState(null);

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
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Referral Program</h1>
      <p className="text-sm text-[#4A5D54] mt-1">Invite friends and earn a percentage of their daily profits — across 3 generations.</p>

      <div className="card-soft p-6 mt-6 bg-gradient-to-br from-[#0F4C3A] to-[#0A3629] text-white" data-testid="referral-banner">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-label text-white/70">Your code</div>
            <div className="metric-num text-4xl font-display tracking-widest text-white mt-1" data-testid="referral-code">{info?.referral_code || "—"}</div>
            <div className="mt-3 text-white/70 text-sm">Total earned: <span className="text-[#00D084] font-bold">{formatNaira(info?.total_referral_earnings)}</span></div>
          </div>
          <div className="space-y-2">
            <button onClick={() => copy(info?.referral_code, "Code copied")} data-testid="copy-code-btn"
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-lg px-4 py-3 font-semibold">
              <Copy className="w-4 h-4" /> Copy code
            </button>
            <button onClick={() => copy(link, "Link copied")} data-testid="copy-link-btn"
              className="w-full flex items-center justify-center gap-2 bg-[#00D084] hover:bg-[#00B372] text-[#0A1C16] rounded-lg px-4 py-3 font-semibold">
              <Share2 className="w-4 h-4" /> Copy invite link
            </button>
            <div className="font-mono text-xs text-white/60 break-all px-1">{link}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <GenColumn gen={1} data={info?.gen1} color="bg-[#E6FBF3] text-[#007a4d]" />
        <GenColumn gen={2} data={info?.gen2} color="bg-[#EEF2FF] text-[#3B82F6]" />
        <GenColumn gen={3} data={info?.gen3} color="bg-[#FFF5E6] text-[#D97736]" />
      </div>
    </UserLayout>
  );
}
