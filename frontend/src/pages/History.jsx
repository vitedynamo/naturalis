import React, { useEffect, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { api } from "@/lib/api";
import { formatNaira, formatDate } from "@/lib/format";

const types = [
  { v: "", label: "All" },
  { v: "deposit", label: "Deposits" },
  { v: "withdrawal", label: "Withdrawals" },
  { v: "invest", label: "Investments" },
  { v: "profit", label: "Profits" },
  { v: "referral", label: "Referrals" },
  { v: "bonus", label: "Bonuses" },
  { v: "coupon", label: "Coupons" },
];

const typePill = {
  deposit: "pill-success",
  profit: "pill-success",
  referral: "pill-success",
  bonus: "pill-success",
  coupon: "pill-success",
  withdrawal: "pill-error",
  invest: "pill-warn",
  refund: "pill-neutral",
};

export default function History() {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/transactions", { params: filter ? { ttype: filter } : {} })
      .then(({ data }) => setItems(data));
  }, [filter]);

  return (
    <UserLayout>
      <div className="text-label">Wallet log</div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Transaction History</h1>

      <div className="flex gap-2 mt-5 overflow-x-auto pb-1" data-testid="history-filters">
        {types.map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)} data-testid={`filter-${t.v || "all"}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border ${filter === t.v ? "bg-[#0F4C3A] text-white border-[#0F4C3A]" : "border-[#E5E9E4] text-[#4A5D54] hover:bg-[#F3F5F1]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card-soft overflow-hidden mt-5">
        <table className="w-full text-sm" data-testid="history-table">
          <thead className="bg-[#F3F5F1] text-[#4A5D54]">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Type</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Description</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Balance</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} className="border-t border-[#E5E9E4]">
                <td className="p-3"><span className={`pill ${typePill[t.type] || "pill-neutral"} capitalize`}>{t.type}</span></td>
                <td className="p-3 text-[#0A1C16]">{t.description}</td>
                <td className={`p-3 text-right font-semibold ${t.amount >= 0 ? "text-[#007a4d]" : "text-[#9c1239]"}`}>
                  {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
                </td>
                <td className="p-3 text-right font-mono">{formatNaira(t.balance_after)}</td>
                <td className="p-3 text-[#4A5D54]">{formatDate(t.created_at)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-[#8A9C93]">No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </UserLayout>
  );
}
