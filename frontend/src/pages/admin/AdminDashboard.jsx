import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { Users, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Clock, Wallet } from "lucide-react";

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="card-soft p-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-label">{label}</div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="metric-num text-3xl mt-3">{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data));
  }, []);

  return (
    <AdminLayout title="Overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat icon={Users} label="Total Users" value={stats.users || 0} accent="bg-[#E6FBF3] text-[#007a4d]" />
        <Stat icon={TrendingUp} label="Active Investments" value={stats.active_investments || 0} accent="bg-[#EEF2FF] text-[#3B82F6]" />
        <Stat icon={Wallet} label="Total Invested" value={formatNaira(stats.total_invested)} accent="bg-[#FFF5E6] text-[#D97736]" />
        <Stat icon={ArrowDownToLine} label="Total Deposits" value={formatNaira(stats.total_deposits)} accent="bg-[#E6FBF3] text-[#007a4d]" />
        <Stat icon={ArrowUpFromLine} label="Total Withdrawn" value={formatNaira(stats.total_withdrawn)} accent="bg-[#FEF2F2] text-[#9c1239]" />
        <Stat icon={Clock} label="Pending Withdrawals" value={stats.pending_withdrawals || 0} accent="bg-[#FFFAEB] text-[#a14d12]" />
      </div>

      <div className="mt-8 card-soft p-6">
        <div className="text-label">Admin Notes</div>
        <ul className="mt-3 text-sm text-[#4A5D54] space-y-2">
          <li>• Use <strong>Settings</strong> to switch payment mode to <code>live</code> after adding Paystack keys.</li>
          <li>• Approve manual withdrawals from the Withdrawals page after paying users.</li>
          <li>• Investment payouts run automatically every time a user opens the app or fetches their data.</li>
          <li>• Referral commissions for Gen 1/2/3 are awarded based on each daily profit payout.</li>
        </ul>
      </div>
    </AdminLayout>
  );
}
