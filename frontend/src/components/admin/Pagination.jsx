import React, { useState, useEffect } from "react";

/**
 * Reusable admin table pagination footer.
 *
 * Layout: "Showing X – Y of N    [Previous] [Page X of Y] [Go to: __ Go] [Next]"
 *
 * - Self-clamps `page` to the valid range whenever totalPages shrinks.
 * - Jump-to-page input commits on Enter, on blur, or on the "Go" button.
 * - Hidden when there are zero items.
 */
export default function Pagination({
  page,
  setPage,
  totalItems,
  pageSize,
  testidPrefix = "page",
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const [jump, setJump] = useState("");

  // Keep page within bounds if list shrinks/grows.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);

  if (!totalItems) return null;

  const commitJump = () => {
    const n = parseInt(jump, 10);
    if (!Number.isFinite(n)) { setJump(""); return; }
    const clamped = Math.min(totalPages, Math.max(1, n));
    setPage(clamped);
    setJump("");
  };

  return (
    <div
      className="flex items-center justify-between gap-3 p-4 border-t border-[color:var(--border-default)] flex-wrap"
      data-testid={`${testidPrefix}-pagination`}
    >
      <div className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
        Showing <span className="font-bold text-[color:var(--text-primary)]">{(safePage - 1) * pageSize + 1}</span>
        {" – "}
        <span className="font-bold text-[color:var(--text-primary)]">{Math.min(safePage * pageSize, totalItems)}</span>
        {" of "}
        <span className="font-bold text-[color:var(--text-primary)]">{totalItems}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          data-testid={`${testidPrefix}-prev`}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        <span
          className="text-xs font-bold text-[color:var(--text-primary)] tabular-nums px-2"
          data-testid={`${testidPrefix}-indicator`}
        >
          Page {safePage} of {totalPages}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`${testidPrefix}-jump-input`}
              className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-tertiary)]"
            >
              Go to
            </label>
            <input
              id={`${testidPrefix}-jump-input`}
              type="number"
              min={1}
              max={totalPages}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitJump(); } }}
              onBlur={() => { if (jump !== "") commitJump(); }}
              placeholder={String(safePage)}
              data-testid={`${testidPrefix}-jump`}
              className="w-14 px-2 py-1 rounded-md text-xs text-center font-semibold tabular-nums bg-[color:var(--surface-alt)] border border-[color:var(--border-default)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-main)]/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={commitJump}
              disabled={!jump}
              data-testid={`${testidPrefix}-jump-go`}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[color:var(--accent-main)] hover:bg-[color:var(--accent-hover)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Go
            </button>
          </div>
        )}

        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          data-testid={`${testidPrefix}-next`}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
