# Naija Invest — PRD & Implementation Log

## Recent Changes (Feb 2026 — iteration 40)

### AdminDeposits gateway-id parity with Withdrawals
**User request**: apply the same gateway-id treatment to Admin Deposits.

**Backend** (`routes_admin.py`, `routes_user.py`):
- Added `_extract_marasoft_gateway_id` and `_extract_paystack_gateway_id` helpers that pull the gateway-side reference (Marasoft `transaction_id`/`payment_ref`/`session_id`/etc., Paystack numeric `id`) from each verify response.
- `_refresh_pending_deposit` and `deposit_verify` now persist this as `gateway_id` on the deposit doc — even on `pending` states — so admins see the canonical gateway ref the moment it's known.

**Frontend** (`AdminDeposits.jsx`):
- New "Gateway ref" column (xl+ screens) that resolves to `gateway_id` only. Successful deposits without a captured gateway ID show a small `awaiting` pill with a tooltip explaining how to backfill (instead of leaking our internal `dep_xxx`).
- Modal "Gateway & identifiers" now labels the row contextually (`Paystack ID (gateway-side)` / `Marasoft ID (gateway-side)`) and tells admins to click *Refresh* if the ID hasn't been captured yet. "Our reference" relabeled "Our reference (sent to gateway)" for clarity.

## Recent Changes (Feb 2026 — iteration 39)

### Gateway Ref column now shows the actual Nomba/Paystack ID (not our app reference)
**User report**: On Admin → Withdrawals the *Gateway Ref* column was rendering our internal `ntr_xxx` / `ptr_xxx` merchant reference (what we send to the gateway) instead of the provider's own transaction ID (Nomba's `AAP-WALLET_T-…` / Paystack's `TRF_…`).

**Fix** (`AdminWithdrawals.jsx`):
- Table column now resolves to `nomba_transaction_id || paystack_transfer_code` only. If the gateway-side ID hasn't been captured yet, a small `awaiting` pill is shown with a tooltip explaining it can be backfilled via the Backfill / Toolkit tools (instead of misleadingly displaying our `ntr_xxx`).
- ToolkitModal "References" panel now clearly distinguishes three IDs:
  1. **Our reference** — the withdrawal record id (`w_xxx`).
  2. **Nomba transaction ID / Paystack transfer code** — gateway-side canonical ID. Shows a helpful note when missing.
  3. **Merchant ref sent to gateway** — our `ntr_xxx` / `ptr_xxx` reference, still surfaced for debugging.
- "Check status" button now also enables when only a merchant ref exists (so admins can still re-poll legacy records).

## Recent Changes (Feb 2026 — iteration 38)

### Two withdrawal UX fixes
1. **Bank details required at request-time** — `routes_user.py::request_withdrawal` now explicitly requires `bank_code` in addition to bank_name/account_number/account_name. If any field is missing the request returns HTTP 400 with: *"Please add your complete bank account details (bank, account number, account name) on the Profile page before withdrawing."* Previously a missing `bank_code` silently routed the withdrawal to the admin queue.
2. **Insufficient Nomba float — no more red warning** — when the float can't cover the payout, the withdrawal is now saved as plain `pending` with a clean `admin_note` ("Auto-payout deferred (Nomba float ₦X < requested ₦Y). Top up Nomba and retry, or pay manually."). The `insufficient_float` / `needs_attention` flags and the red **INSUFFICIENT FLOAT** pill in the admin Withdrawals table are gone. Admin sees a normal pending entry, no special UI noise.

## Recent Changes (Feb 2026 — iteration 37)

### Auto-payout enabled by default — withdrawals self-process end-to-end
**User request**: "I want withdrawal to be automatically updated. It shouldn't have to be approved from the admin. Once a withdrawal has been made, the app should automatically check if the transaction has been processed successfully."

**Changes**:
1. `models.py::SettingsDoc.auto_payout_enabled` default flipped to `True`.
2. `routes_user.py::request_withdrawal` Nomba branch now:
   - Captures Nomba's `transactionId` from the create-transfer response via the recursive `_find_nomba_id` extractor.
   - If Nomba reports `SUCCESS` at create time → status flips directly to `paid` (skips `processing`).
   - Otherwise stores `nomba_transaction_id` + `nomba_transfer_ref` and lets the adaptive poller take over.
3. Admin settings UI already exposes the `auto_payout_enabled` toggle — admins can still revert to manual approval if they want.
4. Pre-existing fallbacks preserved: insufficient float / no bank_code / Nomba rejection all route to the admin queue with a clear `admin_note` instead of failing silently.

**End-to-end flow** (no admin involvement required):
- User submits withdrawal → backend immediately calls Nomba → captures `transactionId` → adaptive poller (30s for first 3 min, then 60s, then 5 min) auto-confirms status → flips to `paid` the moment Nomba returns `SUCCESS`.

## Recent Changes (Feb 2026 — iteration 36)

### Bulk Nomba backfill + dedup + relaxed gateway display
**User report**: 23 production withdrawals showing pending despite being paid via Nomba — Nomba IDs not captured, gateway label missing. Caused by withdrawals paid **off-system** (via Nomba dashboard) that our app has no awareness of.

**Fixes shipped**:
1. `POST /admin/withdrawals/backfill-all-stuck` — one-shot bulk endpoint that scans Nomba's transaction history for *every* non-final withdrawal missing `nomba_transaction_id`, links matches, and immediately re-polls. Returns per-record outcome breakdown.
2. **Dedup logic** in both bulk and single backfill: pre-loads every Nomba ID already attached to any other withdrawal and excludes them from candidate matches, so the same Nomba transaction can't be linked to two different records.
3. `_refresh_one_withdrawal` now polls when EITHER `nomba_transfer_ref` OR `nomba_transaction_id` is present — previously skipped backfilled records that had only the recovered ID.
4. Poller in `server.py` now treats records with only `nomba_transaction_id` as pollable.
5. Toolkit "Nomba ID recovery" section no longer gated on `gw === "nomba"` — now appears for **every non-final record missing `nomba_transaction_id`**, since off-system payouts have no `nomba_transfer_ref` either.
6. Withdrawals table: `gw` derivation now matches on `nomba_transfer_ref OR nomba_transaction_id`, so the **NOMBA pill** displays correctly once backfill links a record.
7. New top-bar **Backfill from Nomba** button (accent-pink) sits next to *Refresh all pending*.

**Verified live**: Bulk endpoint dedupes correctly (no duplicate matches); previously-stuck `w_652a44e14b991390` shows the recovered `AAP-WALLET_T-…` ID in the Gateway Ref column + green disbursed pill + NOMBA gateway label.

## Recent Changes (Feb 2026 — iteration 35)

### Nomba ID recovery — auto-backfill + manual-paste (resolves stuck legacy withdrawals)

**Problem confirmed live**: my earlier fix captures `nomba_transaction_id` only for *new* withdrawals. For legacy stuck `processing` records (which already had `nomba_transfer_ref` but no `nomba_transaction_id`), polling fails because Nomba's requery endpoint is keyed by their own `transactionId`, not our `merchantTxRef`. We had no recovery path.

**Diagnosis**: added raw-response logging in `nomba.py::list_transfers` revealed Nomba's actual response shape is `data.data.results[]`, with fields `customerBillerId` (account), `timeCreated` (date), `amount` (string), and IDs prefixed `AAP-WALLET_T-…` (not `API-TRANSFER-…`).

**Backend** (`nomba.py` + `routes_admin.py`):
1. `nomba.py::list_transfers(date_from, date_to, limit)` — paginated transaction-history fetch. Uses ISO datetime format (`2026-05-23T00:00:00`) as Nomba requires. Skips obvious non-transaction shapes (the bank-list endpoint). Tries multiple `/v1/transactions/…` candidates and logs the raw response.
2. `nomba.py::transfer_to_bank` — recursive `_find_nomba_id()` now searches every nested level of the response for an id-like field, plus added full raw-body logging so production deviations are auditable.
3. `POST /admin/withdrawals/{wid}/backfill-nomba-id` — pulls the merchant's transfer history for `created_at ± 1 day`, matches by `merchantTxRef` → `amount+account` → `amount+time-proximity (±5 min)`, stores the recovered `nomba_transaction_id`, and immediately re-polls. **Verified live**: 4-day stuck record `w_652a44e14b991390` auto-resolved to `paid` after scanning 3 candidates.
4. `POST /admin/withdrawals/{wid}/resolve-from-nomba` — accepts a manually-pasted Nomba `transactionId` (from Nomba dashboard), stores it, re-polls.

**Frontend** (`AdminWithdrawals.jsx::ToolkitModal`):
- New "Nomba ID recovery" section (only shown for non-final Nomba records missing `nomba_transaction_id`) with two buttons:
  - **Auto-backfill from Nomba** (purple, brand)
  - **Paste Nomba ID manually** (orange, warn)
- New "NOMBA TRANSACTIONID (RECOVERED)" section (shown when the ID is present) — surfaces the recovered ID with a copy-to-clipboard button.

## Recent Changes (Feb 2026 — iteration 34)

### "Last polled" badge on Admin Withdrawals & Admin Deposits
- New reusable component **`/app/frontend/src/components/admin/LastPolledBadge.jsx`** — tiny "polled Xs ago" pill that self-ticks every 1s so the relative time stays fresh without a refetch. Hover reveals the full ISO timestamp.
- Shared `relativeTime` helper moved to `/app/frontend/src/lib/format.js`. Duplicate inline copy in `AdminWithdrawals.jsx` removed.
- Withdrawals table: badge renders under the status pill for `pending` / `processing` rows.
- Deposits table: badge renders under the status pill for `pending` rows.
- No new API calls — reads the `last_polled_at` field already populated by the adaptive poller.
- Verified live: stuck Marasoft `processing` withdrawal showed **🔄 POLLED 1M AGO** under the pill. Synthetic pending deposit got `last_polled_at` set within 35 s of insertion (will surface the badge as soon as the page is reloaded).

## Recent Changes (Feb 2026 — iteration 33)

### FIFO ordering on the adaptive poller
- Both queries (`db.withdrawals.find` and `db.deposits.find`) in the poller now use `.sort("created_at", 1)` so the oldest pending records are evaluated first.
- When the per-tick batch exceeds `POLLER_CONCURRENCY` (default 10), the oldest 10 win the slots — guaranteeing **fairness** so no aging record is starved out by a flood of newer ones.
- Verified live: 5 synthetic withdrawals with staggered `created_at` (30s apart) all got refreshed in a single tick, with FIFO order honored (the polling outcome `last_polled_at` order matches `created_at` order exactly).

## Recent Changes (Feb 2026 — iteration 32)

### Bounded concurrency on the adaptive poller
- The poller's per-tick refresh loop now uses `asyncio.Semaphore(POLLER_CONCURRENCY)` (default **10**) with `asyncio.gather` to fan out withdrawal + deposit refreshes in parallel rather than serially.
- New env knob: `POLLER_CONCURRENCY` (defaults to 10, min 1).
- `_is_due` was tightened: records with no prior `last_polled_at` are now polled on the very next tick (instead of waiting one full cadence), so brand-new records get sub-30s first-confirmation feedback.
- Logs now print `refreshed X/Y withdrawal(s) + A/B deposit(s) (concurrency=N)` so spikes are visible.
- Verified live: 8 synthetic processing withdrawals inserted simultaneously were refreshed in a single tick — all `last_polled_at` timestamps identical to the millisecond, confirming gather-with-semaphore stamped them in the same atomic batch.

## Recent Changes (Feb 2026 — iteration 31)

### Adaptive poller cadence
`server.py` now runs a **single 30s tick loop** that decides per-record whether to refresh:

| Record age (from `created_at`) | Refresh cadence |
|---|---|
| ≤ 3 minutes  | **30 seconds** |
| ≤ 30 minutes | **60 seconds** |
| > 30 minutes | **5 minutes** |

- A new `last_polled_at` field on each withdrawal/deposit drives the next-due decision (falls back to `updated_at` then `created_at` for legacy records).
- Same rule applies to deposits (Marasoft / Paystack pending records).
- All tunable via env: `POLLER_TICK_SEC`, `POLLER_FAST_WINDOW_MIN`, `POLLER_MED_WINDOW_MIN`, `POLLER_FAST_CADENCE_SEC`, `POLLER_MED_CADENCE_SEC`, `POLLER_SLOW_CADENCE_SEC`.
- Verified live: a synthetic processing withdrawal got refreshed within 40s of creation (fast cadence honored). Legacy stuck record continues to refresh on the 5-min slow cadence (confirmed via logs).

## Recent Changes (Feb 2026 — iteration 30)

### Nomba auto-polling fixed (no webhook required)
**Root cause**: Nomba's `/v1/transactions/accounts/single` requery endpoint is keyed by Nomba's internal `transactionId` (format `API-TRANSFER-XXX-XXX`), NOT by our `merchantTxRef`. We were querying with `merchantTxRef`, Nomba returned empty payloads, and our normaliser defaulted empty → `PENDING`, leaving withdrawals stuck forever. A 5-min background poller was running the whole time but couldn't recover state.

**Fixes** (`nomba.py` + `routes_admin.py`):
1. `transfer_to_bank` now extracts Nomba's `transactionId` from the create response and injects two convenience fields: `_nomba_transaction_id` and `_nomba_status` (normalised SUCCESS/PENDING/FAILED).
2. `pay-nomba` admin endpoint now persists `nomba_transaction_id` on the withdrawal. If `_nomba_status === "SUCCESS"` at create time, the withdrawal is marked `paid` immediately — no `processing` phase.
3. `get_transfer_status` (Nomba) now accepts an optional `nomba_transaction_id`; tries it first (canonical key), falls back to `merchantTxRef`, then falls back to `/v2/transfers/bank/{id}` for stubborn cases.
4. Recognises Nomba's `REFUND` status as `FAILED` so the user wallet is auto-credited.
5. The 5-min background poller (already running in `server.py`) automatically picks up the new lookup path.

## Recent Changes (Feb 2026 — iteration 29)

### Bug fix: withdrawals stuck in "processing" can now be resolved
**Symptom**: After Pay via Nomba is initiated successfully, the withdrawal sits at `processing` indefinitely because Nomba's `/v1/transactions/accounts/single` endpoint keeps returning `PENDING` even when the funds have already landed in the recipient's bank. The Toolkit modal only exposed Mark-disbursed and Refund-to-wallet buttons for `status === "pending"`, so there was no UI to manually resolve stuck records. Also, every refresh appended a fresh "Nomba status: PENDING" suffix to `admin_note`, growing it to thousands of characters.

**Fixes**:
1. `_refresh_one_withdrawal` in `routes_admin.py` now strips prior trailing status-poll fragments (`Nomba status:`, `Paystack status:`, `Status poll error:`, `Confirmed via ...`, `Nomba reports`, `Paystack reports`) before appending the latest, so `admin_note` no longer grows unboundedly.
2. `ToolkitModal` in `AdminWithdrawals.jsx` now shows **Mark disbursed** and **Refund to wallet** for BOTH `pending` and `processing` statuses. The duplicate "Pay via …" buttons stay hidden once a payout has already been initiated.
3. A helpful warning banner ("Stuck in processing?") renders in the modal for `processing` withdrawals to guide the admin on how to manually resolve.
4. Backend `approve` / `reject` endpoints already accepted both pending and processing — no change required there.

## Recent Changes (Feb 2026 — iteration 28)

### Keyboard shortcuts on all admin tables
- `Pagination.jsx` now binds a page-wide `keydown` listener:
  - `←` previous page · `→` next page (skipped while typing in any input/textarea/select)
  - `g g` (double-tap within 500ms) focuses & selects the jump-to-page input
- A subtle inline keyboard hint renders next to "Showing X – Y of N" on `md+` viewports.
- Verified live: arrow keys flip pages, g+g focuses the jump input on Admin Deposits.

### Withdrawals page redesign (matches reference)
- Pink/red gradient hero header with up-arrow icon and "N total · approve, reject and track payouts via Nomba & Paystack" subtitle.
- 4 stat cards: **Pending**, **Paid today** (Lagos midnight cutoff), **Paid · all time**, **All withdrawals**.
- Toolbar with status filter (All / pending / processing / paid / rejected), search across name/phone/account/refs, and Refresh-all-pending button.
- 2 gateway status cards (NOMBA + PAYSTACK) showing last successful payout relative-time, pending and done counts. Nomba card also surfaces live float.
- Quick row-size selector: 5 / 20 / 50 / 100 / All (sets pagination page size or shows everything).
- Redesigned table: `User | Amount | Bank | Status | Gateway ref | Date | Action`. Status pill renames `paid → disbursed` to match design language. Action column collapsed to a single **Toolkit** button.
- New **`ToolkitModal`** (drill-in detail) with:
  - Gradient header — green for paid, red for rejected, amber for pending — showing amount, net, status badge, Profile link and close button.
  - Customer card with avatar + View → link.
  - Payout destination card with bank label, account number (large), account holder name.
  - References (Our reference + Provider reference, both with one-click Copy).
  - Timeline (Requested · Status updated · Disbursed/Rejected) and admin note display.
  - Resolution Tools (still-pending only): Check Nomba/Paystack status · Pay via Nomba · Pay via Paystack · Mark disbursed · Refund to wallet.
- Existing Pay dialog (bank-picker + verified name + insufficient-float guard) preserved exactly — Toolkit "Pay via …" buttons open it.

## Recent Changes (Feb 2026 — iteration 27)

### Shared pagination component + "Jump to page" input
- New shared component **`/app/frontend/src/components/admin/Pagination.jsx`** — single source of truth for paginated admin tables. Renders `Showing X – Y of N` · `Previous` · `Page X of Y` · `Go to [__] Go` · `Next`. Self-clamps out-of-range state. Jump input commits on Enter, blur, or Go button. Hidden when only 1 page exists.
- Wired into **AdminDeposits**, **AdminWithdrawals**, **AdminInvestments** (replaced inline footers); newly added to **AdminReferrals** (with `filtered` reset on generation filter change) and **AdminActivityLog** (with reset on `action`/`q` filter change).
- Tested live: jumping to a valid page works, Enter key works, out-of-range (999) clamps to max page correctly.

## Recent Changes (Feb 2026 — iteration 26)

### Pagination + column trim on Admin Withdrawals & Admin Investments
- **AdminWithdrawals.jsx**: removed forced `min-w-[850px]`; user/bank cells now truncate; Bank column hides on <md, Date column hides on <lg. Added 20/page client-side pagination (`Showing X – Y of N`, Page X of Y, Previous/Next). Verified live with 12 rows (page 1 of 1).
- **AdminInvestments.jsx**: rewrote with 20/page pagination + responsive column trim — User/Product truncate, Daily%/Paid-Days hide on <md, Total Profit/Started hide on <lg. Verified live with 14 rows.
- **AdminUsers.jsx**: already had server-side pagination (20/page, ChevronLeft/Right), so no change required.

## Recent Changes (Feb 2026 — iteration 25)

### Admin user profile — gateway columns on deposits & withdrawals
- `AdminUserDetail.jsx`: the **Deposits** tab now has a `Gateway` column showing the payment method pill (`marasoft` / `paystack` / `mock`). The **Withdrawals** tab now has a `Gateway` column derived from the stored transfer refs (`paystack_transfer_ref` → paystack, `nomba_transfer_ref` → nomba, otherwise `manual` once paid).

### Admin deposits — auto-expire, accurate status copy, pagination
- **Auto-expire stale Marasoft pending deposits**: new helper `_expire_stale_pending_deposits(db)` in `routes_admin.py` marks any `status="pending" + method="marasoft"` deposit older than 60 minutes as `failed` with note "Auto-expired: 60-minute transfer window elapsed without payment". Called in `GET /admin/deposits`, the deposits tab of `GET /admin/users/{id}/timeline`, and `POST /admin/deposits/poll-pending`. The user-facing `GET /deposit/verify/{ref}` mirrors the same logic.
- **Sublabel under amount on Admin Deposits**: `Pending settle` → now reads `Failed` (red, bold) when `status === "failed"`. Funded rows still read `Paid in full`.
- **Pagination**: 20 rows per page, `Showing X – Y of N`, Page X of Y indicator, Previous/Next buttons. Resets to page 1 when filter or search query changes.

## Recent Changes (Feb 2026 — iteration 24)

### Marasoft verify endpoint + webhook secret-hash + pending state
- **Bug**: every "I have paid" tap on production returned "Marasoft reported this transaction as failed" because we were calling the **wrong** verify endpoint (`POST https://checkout.marasoftpay.live/verify_transaction`, the WEB CHECKOUT verifier) for transactions created via Dynamic Accounts.
- **Fix in `marasoft.py`**: added `check_transaction_status(enc_key, transaction_ref)` → POST `https://api.marasoftpay.live/checktransaction` (the correct endpoint for dynamic & reserved account flows). Normalises Marasoft's odd response shape (`{status: "true"/"false", transaction_ref: "Successful"|"…"}`) to `success | failed | pending`.
- **Fix in `routes_user.py`**: rewrote `/deposit/verify/{ref}` to distinguish `success` (credit wallet, mark success), `failed` (mark failed), and `pending` (do NOT mutate row — let user keep re-checking). Stops the false "failed" message that production users were seeing.
- **Webhook hardening — secret hash**: new `marasoft_secret_hash` setting + admin UI field. When configured, the webhook (`POST /api/deposit/webhook/marasoft`) requires the incoming `secret_hash` field/header to match before processing. If hash matches **and** payload claims success, we trust the payload directly (no extra API roundtrip) — important because Marasoft's `checktransaction` endpoint is gated behind IP-whitelist in some merchant configs.
- **All Marasoft re-verify call sites** (`/deposit/verify/{ref}`, admin poll-pending, background poller) switched to the new `check_transaction_status()`.

## Recent Changes (Feb 2026 — iteration 23)

### Dedicated bank-transfer page with countdown timer
- **New page `/deposit/transfer/:reference`** (`DepositTransfer.jsx`): replaces the inline bank-card on `/deposit`. Renders a full-screen flow with:
  - Live 60-minute MM:SS countdown (Marasoft dynamic-account validity window) with gradient progress bar
  - "Account expires in" → switches to "Window expired" red state at 00:00
  - Copyable Bank / Account name / Account number / Amount tiles
  - "I have paid — check status" button + background auto-poll every 12s while pending
  - Success overlay with checkmark + auto-redirect once Marasoft confirms
  - Expired state replaces the verify button with "Start a new deposit"
- **`/deposit`**: simplified — on successful init, `navigate('/deposit/transfer/<ref>')`. Also shows a "Pending transfer" banner if user has an unfinished bank transfer (one-tap resume).
- **Backend**: new `GET /api/deposits/{reference}` returns one deposit by reference (used by the transfer page on direct nav / refresh).
- **Routing**: added `/deposit/transfer/:reference` protected route in `App.js`.

## Recent Changes (Feb 2026 — iteration 22)

### Marasoft in-app bank-transfer checkout (no more external redirect)
- **Backend `marasoft.py`**:
  - Fixed broken module — previous edit had spliced `create_reserved_account` inside `verify_transaction`, leaving an orphan `elif/else/return` block and breaking module import (only hot-reload cache had been keeping it alive).
  - Replaced reserved-account integration with **Dynamic Accounts** endpoint (`POST https://api.marasoftpay.live/generate_dynamic_account/`) which only needs `{enc_key, amount, transaction_ref}` — no merchant BVN/KYC required, much cleaner reconciliation.
  - New `create_dynamic_account()` function returns `{account_name, account_number, bank, amount_to_pay}`.
- **Backend `routes_user.py`**:
  - `/deposit/initialize` now returns `{mode:'live', gateway:'marasoft', type:'bank_transfer', reference, amount, account_number, account_name, bank_name, expires_in_minutes}` — no `authorization_url`.
  - Deposit document is enriched with the virtual account details for re-display.
- **Frontend `Deposit.jsx`** (already done in previous fork, syntax-fixed here):
  - When response carries `type==='bank_transfer'`, render an in-app bank-transfer card with copyable Bank, Account name, Account number, and Amount tiles, plus an "I have paid — check status" button that re-verifies via `/deposit/verify/<ref>`. "Start over" button discards the pending state.
- **Verified live**: Marasoft returned Wema Bank account `9021207332` for amount ₦3,000. Page renders the inline card; no redirect to external URL.

### Tests
- iter 22: 8/8 backend pytest (`backend/tests/test_deposit_marasoft.py`) + 9/9 frontend Playwright. No issues.

## Original Problem Statement
Build a Nigerian investment web app with features: deposits, withdrawals, referrals, profile, coupon bonuses, transaction history. Users invest in products and profit returns every 24 hours. Phone+password registration with optional referral code. Admin panel to customize products/packages, profit %, images, view users/withdrawals/deposits/referrals/investments. **2-generation referral program** with customizable percentages. Admin caters for all user-side features. No landing/about page.

## User Choices
- **Auth**: Custom JWT-based phone + password (11 digits)
- **Currency**: Naira (₦). Min deposit ₦3,000, min withdrawal ₦1,000, welcome bonus ₦750
- **Deposits**: Paystack OR Nomba (admin-switchable). No keys yet → mock mode by default
- **Withdrawals**: Manual, Paystack transfer, or Nomba transfer (admin-switchable)
- **Admin**: phone `08123456789` / password `personally`

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Modules: `server.py`, `models.py`, `auth.py`, `payouts.py`, `routes_user.py`, `routes_admin.py`, `storage.py`, `nomba.py`. JWT via PyJWT, bcrypt password hashing.
- **Frontend**: React 19 + React Router, Tailwind + Shadcn UI, Sonner toasts, lucide-react icons. Outfit (display) + Manrope (body). Indigo (#4F46E5) + Coral pink (#EC4899) + Gold (#F59E0B). Dark/light theme.

## What's Implemented

### User side
- Phone+password registration with optional referral code; ₦750 welcome bonus auto-credited
- JWT login, persistent session via localStorage, security-question-based password recovery
- Dashboard: wallet hero, optional announcement banner (text + image), admin-controlled featured plan, 3 CTAs (Team, Coupon, My Packages)
- Invest: product grid with images, daily %, duration, ROI
- Deposit: Paystack mock/live flow, **modern card grid for recent deposits** (no table)
- Withdraw: manual request with bank-on-file guard, history table; **no extra helper text below the input**
- **Team page (2 generations only)**: copy-code + copy-link buttons (invite-link plain text hidden), 2 collapsible generation cards. Each member listed with phone, total invested, per-investment breakdown with dates, joined date.
- **My Packages**: restyled cards showing investment date, daily profit, earned, progress with gradient bar, next-payout countdown
- Profile, Coupons, **Transaction history** with same-line filter chips (horizontal scroll on mobile, no page overflow)

### Admin side
- Auto-seeded admin (08123456789 / personally)
- Overview stats, Users (block/adjust), Products CRUD (image upload), Deposits (approve), Withdrawals (approve manual, **Pay via Paystack**, **Pay via Nomba**, Reject+refund), Investments, Referrals, Coupons CRUD, Password-reset queue
- **Admin Settings**: bonuses & limits, 2-gen referral %, **Payment gateways selector (deposit + payout, each Paystack/Nomba)**, **Nomba credentials section**, Paystack credentials, **announcement image upload + text + active toggle**, featured-plan selector

### Payout engine
- Runs on every `/auth/me`, `/investments`, `/invest` call
- For each active investment, credits 24h payouts up to duration
- Cascades commissions up **2 generations** using settings percentages

### Integrations
- **Paystack**: deposit init/verify/webhook, transfer recipient + transfer for withdrawals
- **Nomba**: bank transfer for withdrawals (mock mode if creds missing)
- **Emergent Object Storage**: product images + announcement image (`/api/admin/upload-image`, served at `/api/files/{path}`)

## Recent Changes (Feb 2026 — iteration 21)

### Redesigned — Admin Users page + new User Detail page
- **New `/admin/users` (full redesign)**:
  - Gradient hero header with users icon and live total-account subtitle.
  - 4 stat cards: Total users · Online now (last 5 min) · Verified (≥1 successful deposit) · New today.
  - Search bar (debounced, name/phone/email/referral) + Export CSV button.
  - Paginated table (20 rows/page) with: User column (color-seeded avatar + name + @ref-code, clickable to detail page), Phone, Balance, Joined, color-coded action pills — **Add · Deduct · Pwd · PIN · Login · Ban**.
  - Modals for balance adjust + password reset.
- **New `/admin/users/:id` user detail page** matching the supplied screenshots:
  - Hero card with avatar, name, ACTIVE/BANNED badge, phone/email/referral-code/joined copy-buttons, "Referred by X" pill if applicable.
  - 8 stat cards: Balance · Total deposited · Total invested · Active plans · Profit earned · Total withdrawn · Referrals · Referral bonus.
  - Admin actions panel: **Add balance · Deduct balance · Reset password · Reset PIN · Change phone · Login as user · Ban/Unban** — every action audited.
  - 6 tabs: Investments · Deposits · Withdrawals · Referrals · Transactions · Bank (with row count badges).
- **Backend additions**:
  - `GET /admin/users` now paginated with `q`, `page`, `page_size`, `sort`, `order` + returns header stats.
  - `GET /admin/users/export` CSV export (filtered).
  - `GET /admin/users/{id}/details` — full profile + 13 aggregated stats + referrer info.
  - `GET /admin/users/{id}/timeline?tab=…` — 6 tabbed feeds.
  - `POST /admin/users/{id}/reset-password` — set new account password (admin-only).
  - `POST /admin/users/{id}/change-phone` — set new 11-digit phone (uniqueness checked).
  - `POST /admin/users/{id}/login-as` — issues a short-lived JWT for impersonation; logged in audit trail.
- **Login page**: now accepts `?_token=<jwt>` to handle the "Login as user" flow in a new tab.

### Tests
- Backend curl: paginated users (91 total, page-1 of 5), header stats (online 0/verified 16/today 0), user details (full stats for a known user), timeline tab — all pass.
- Frontend Playwright: users hero+table render, user detail hero+8 stats+admin-actions+tabs render, tab switching works.

## Recent Changes (Feb 2026 — iteration 20)

### Added — Time-range filter on the profit breakdown
- **Backend**: `GET /api/admin/stats/profit-breakdown` now accepts optional `from` and `to` ISO datetime query params. Applied to deposits.created_at, withdrawals.updated_at, transactions.created_at. Response echoes the active range back.
- **Frontend**: New filter card with 6 preset buttons — Today / Yesterday / Last 7 days / Last 30 days / All time / Custom. Custom shows two `<input type="date">` pickers with `min`/`max` cross-validation. Currently-selected range is displayed inline. Recent activity lists are also filtered.
- Tested: all-time net ₦161,020 · 7-day net ₦161,020 (matches because most activity is recent) · today net −₦2,400 (only daily-profit credits today, no deposits) — confirming the filter actually works.

## Recent Changes (Feb 2026 — iteration 19)

### Added — Drill-down pages for the dashboard hero cards
- Both hero cards on `/admin` are now clickable `<Link>` elements with hover lift effect.
- **`/admin/profit-breakdown`** (P&L page) — backed by `GET /api/admin/stats/profit-breakdown`:
  - Net profit hero showing the formula `deposits − paid_withdrawals − welcome_bonuses − coupons − referral_commissions − daily_profits`
  - Inflow section: total deposits + count
  - Outflow section: 5 buckets (paid withdrawals, welcome bonuses, coupon redemptions, referral commissions, daily profit credits) each with amount & transaction count
  - Recent activity panels showing the latest 5 entries per bucket with user phone, name, description, timestamp
- **`/admin/payout-projection`** — backed by `GET /api/admin/stats/payout-projection`:
  - Projected total hero showing total + active investment count
  - "By product" table — total invested, count, 24h payout, yield %
  - "Top 15 contributors" table showing biggest individual investments driving the projection
- Tested via curl: profit breakdown returned net ₦163,420 across 5 outflow buckets; payout projection returned ₦3,430 across 3 products and 14 active investments.

## Recent Changes (Feb 2026 — iteration 18)

### Fixed — Nomba 401/403 cascade
- **Root cause**: when an admin's credentials authed against production but the actual transfer was rejected with 403, the code fell back to sandbox base URL **reusing the production token** → 401 Unauthorized → cached the wrong token-base binding → all subsequent calls failed.
- **Fix in `nomba.py`**:
  - Refactored to centralized `_call_with_fallback()` helper.
  - When base actually switches via fallback, **the cached token is invalidated and re-issued against the new base** before the retry.
  - New `Settings.nomba_environment` field (`sandbox|production`, default `sandbox`) makes the choice **explicit** — when set, no silent fallback happens (errors are surfaced instead).
  - Token cache is keyed by `(client_id, base)` so env-switches never serve a stale token.
  - All Nomba functions now accept an `environment` parameter; threaded through from settings everywhere.
- **Admin Settings UI**: New `Environment` dropdown (Sandbox / Production) in the Nomba credentials card; clear hint that sandbox and production use different keys.
- **Verified**: With env=`production`, balance returns ₦1,057.60 + 601 Nigerian banks. With env=`sandbox`, sandbox keys would route correctly (current creds are prod).

### Added — Admin Activity Log
- **Backend**:
  - New `admin_activity` collection + `AdminActivity` model.
  - `_log_admin_activity()` helper called from: PIN clear, balance adjust, block/unblock, deposit approve, withdrawal approve/reject/Paystack-pay/Nomba-pay, settings update.
  - `GET /api/admin/activity?action=&target_type=&admin_id=&limit=` returns `{items, count, actions}`. Sensitive setting values (paystack/nomba secrets) are redacted to `•••` in the audit trail.
- **Frontend**: New `/admin/activity-log` page — searchable (admin phone / name / target / description) + filter by action. Color-coded action badges with icons. Sidebar link added.

### Tests
- iter 18: curl smoke-test — adjusted balance + cleared PIN + updated settings produced 3 distinct audit rows with correct attribution; Nomba env=production returns live balance.

## Recent Changes (Feb 2026 — iteration 17)

### Added — Admin "Clear PIN" emergency action
- `POST /api/admin/users/{id}/clear-pin` — wipes `withdrawal_pin_hash`, `withdrawal_pin_failed`, `withdrawal_pin_locked_until`. Cannot target admin accounts.
- `GET /api/admin/users` now exposes `has_withdrawal_pin` and `withdrawal_pin_locked` flags (without leaking the hash).
- **Admin Users page**: "Clear PIN" button shown only for users with an active PIN. Button turns red and reads "Clear PIN · locked" when the PIN is currently in a 15-min lockout. Confirmation prompt before clearing.
- After clear, user is told to set a new PIN on Profile before next withdrawal.

### Tests
- iter 17: smoke-tested via curl — admin lists 91 users (5 with PIN), clear-pin removes hash, user `/auth/me` reflects `has_withdrawal_pin: false`, withdrawal blocked with clear message, PIN re-settable; admin self-clear blocked (404), missing user 404. Frontend lint clean.

## Recent Changes (Feb 2026 — iteration 16)

### Added — Forgot PIN recovery
- **PIN reset via security questions**: User can recover a forgotten withdrawal PIN without admin intervention, using the same security questions answered at registration.
  - `GET /api/profile/withdrawal-pin/recovery-questions` returns the user's two questions (400 if no questions on file → ask user to contact admin).
  - `POST /api/profile/withdrawal-pin/reset` with `{answer_1, answer_2, new_pin}` verifies answers and atomically sets the new PIN + clears any lockout / fail counter.
- **Profile UI**: Added "Forgot PIN?" link beside "Change PIN" on the Withdrawal PIN card; opens an inline form showing the user's questions + new PIN input. Also surfaces an "Already had a PIN? Reset it…" link when `has_pin=false` for users whose admin manually cleared their hash.

### Tests
- iter 16: backend smoke-tested via curl — recovery questions load, wrong answers rejected (400), correct answers reset PIN and allow withdrawal with new PIN. Frontend Profile page renders `forgot-pin-btn` correctly.

## Recent Changes (Feb 2026 — iteration 15)

### Added — Security & Float Verification
- **4-digit Withdrawal PIN (mandatory)**:
  - Set on Profile (`/profile`) — requires account password re-auth. Stored as bcrypt hash.
  - Required on EVERY withdrawal — 5 wrong attempts → 15-min lockout (HTTP 429).
  - Endpoints: `GET /api/profile/withdrawal-pin/status`, `POST /api/profile/withdrawal-pin/set`, `POST /api/profile/withdrawal-pin/change`.
  - `WithdrawRequest.pin` field; `User.has_withdrawal_pin` exposed via `/auth/me`.
  - Admin bypasses PIN entirely — admins act on behalf of users via the existing admin payout actions.
- **Nomba transaction verification (no webhook)** — replaces blind "mark paid" with provider-confirmed state:
  - **Pre-flight float check**: before initiating ANY Nomba auto-payout or admin `pay-nomba`, the backend calls `GET /v1/accounts/balance`. If float < amount → withdrawal stays `pending` with `needs_attention=true`, `insufficient_float=true`, and the user wallet is NOT debited a second time. Admin sees a red "Insufficient Nomba float" banner in the pay dialog.
  - **Processing state**: live Nomba transfers now set status to `processing` (not `paid`) until confirmed. Mock mode still marks `paid` immediately.
  - **Status verification**: `GET /v1/transactions/accounts/single?transactionRef=...` is polled on:
    - Per-row "Refresh status" button on `/admin/withdrawals` for any row with a provider ref.
    - "Refresh all pending" admin action: `POST /api/admin/withdrawals/poll-pending` iterates all non-final transfers.
    - Background asyncio poller every `WITHDRAWAL_POLL_INTERVAL` seconds (default 300).
  - **Auto-refund on FAILED**: if Nomba/Paystack reports FAILED/REVERSED, the user's wallet is credited back and a refund transaction is logged.
  - **Live Nomba float card** on `/admin/withdrawals` (`GET /api/admin/nomba/balance`) — shows current `₦` float with manual refresh.
  - Admin actions `/approve` and `/reject` now also accept `processing` withdrawals (not just `pending`).

### Tests
- iter 15: 20/20 backend pytest (`backend/tests/test_iter12_pin_nomba.py`) pass. Frontend Playwright: PIN card on Profile, no-pin banner on Withdraw, PIN input enforcement, Nomba float card on AdminWithdrawals, refresh-status buttons, poll-pending toast — all verified.

## Recent Changes (Feb 2026 — iteration 14)

- **Drill-down "Search by user phone"**: dashboard drill dialog now has a debounced filter (phone / name / reference).
- **Admin fully blocked from `/login`**: rejects with generic "Invalid credentials" — no auto-redirect to `/admin/login`.
- **Dark-mode inputs/modals**: global CSS rule for `input/textarea/select` text + background colors. Fixes Coupons modal + every other Dialog where typed text was invisible in dark mode.
- **Bank picker + auto-resolve**: new `GET /api/banks` + `POST /api/banks/resolve` (Paystack live → mock fallback). New searchable BankPicker dropdown on `/profile`. Account number auto-verifies the account name (350ms debounce) with a green ✓ "Verified with bank" badge. Save disabled until verified.

## Recent Changes (Feb 2026 — iteration 13)
- Dialog hardening for dark mode (`bg-surface text-text-primary` baked into DialogContent)
- Settings page full-width XL 2-column grid

## Recent Changes (Feb 2026 — iteration 12)

### Fixes from user feedback
- **Dedicated admin login** — new `/admin/login` route with its own dark "ops console" UI (NI brand badge, gradient pink/indigo CTA, restricted-area banner). `Protected admin` now redirects unauthenticated admin requests to `/admin/login` (not `/login`). The user-side `/login` rejects admin credentials and redirects them to `/admin/login`.
- **Full-width admin** — removed `max-w-7xl mx-auto`; admin content now uses `px-3 py-4 sm:p-6 md:p-8 w-full` so it stretches edge-to-edge on every viewport (no side margins on mobile, comfortable padding on tablet/desktop).
- **Clickable inflow chart guaranteed** — bars are now real `<button>` elements (not disabled), use larger 32px min-width tap targets, no `disabled` attribute that was previously short-circuiting clicks on small-data days. Verified end-to-end in Playwright: click on bar `2026-05-21` opens the drill-dialog with all 11 deposits listed.

## Recent Changes (Feb 2026 — iteration 11)

- **Clickable inflow bars** with drill-down dialog
- **Dark-mode contrast** bump on text tokens
- **Responsive admin** wrapper with `max-w-7xl mx-auto` (superseded in iteration 12)

## Recent Changes (Feb 2026 — iteration 10)

### Modernized admin (modeled on user-provided screenshots)
- **Backend**:
  - New `GET /api/admin/stats/extended` — platform profit, next-24h-payout projection, today-Lagos metrics, all-time totals (paid-out, fees, awaiting verification, total invested, bonuses, referral paid, profit credited), system-health counters.
  - New `GET /api/admin/stats/inflow?frm=&to=` — total/count/avg, peak day, day-by-day **zero-filled series**, gateway breakdown.
- **Admin layout** — full sidebar rebuild: gradient `NI` brand badge, new nav items (Announcements / Manual Adjustments / Fraud Monitor / Financial Report), `View as user` button (admin can now preview the user side — `Protected.jsx` no longer bounces admins off `/dashboard`), pinned theme toggle + logout in footer.
- **Admin Dashboard** — full rebuild matching the screenshots:
  - Hero row: gradient Platform Profit card + Next 24h Payout card
  - Top stats: Total users / Total deposits / Active investments / Pending withdrawals
  - Today (Lagos) row + Inflow-by-date section (range chips + From/To pickers + mini bar chart + gateway pills)
  - All-time row + System health row + Quick actions
- **4 new admin pages**:
  - **Announcements** — manage home banner + welcome modal (text/image/CTA/Telegram URL) from one screen
  - **Manual Adjustments** — audit log of admin wallet credits/debits with credit/debit totals
  - **Fraud Monitor** — placeholder cards for fraud counters + amount-mismatch + blocked accounts + the active detection rules list
  - **Financial Report** — consolidated cashflow report + CSV export
- Routes added in `App.js` for the 4 new pages.

### Tests
- iter 10: 11/11 backend pytest pass. Frontend ~95% pre-fix. After fix: View-as-user routing works (Protected.jsx admin-bounce removed), /admin/stats/inflow series zero-filled for continuous chart x-axis.

## Recent Changes (Feb 2026 — iteration 9)

### Added
- **Welcome modal on dashboard**: shown once per user (keyed by user id in localStorage as `ni_welcome_seen_<id>`). Renders an admin-configurable welcome message + an optional "Join our Telegram group" button. Modal uses the indigo `hero-gradient` header for a strong first-touch impression. Closes via the X button, the "Start exploring" button, or clicking the Telegram link.
- **Admin Settings → "Welcome modal & community"**: new card with `welcome_message` textarea + `telegram_url` input. Backend Settings model adds `telegram_url` and `welcome_message` (both default `""`); exposed via `GET /api/settings/public`.

### Polish
- **Invest dialog fade-in**: bumped Dialog `duration` from 200ms to 500ms via `className="duration-500"` so the modal's existing fade + zoom transition is clearly perceived.
- **Cosmetic `<option>` hydration warning** fixed on `AdminSettings` and `AdminWithdrawals` by using template-literal option content (single text child, so visual-editor doesn't inject `<span>`).

## Recent Changes (Feb 2026 — iteration 8)

### Cleanup / polish
- **Removed dead `gen3_percent` field** from `Settings` and `SettingsUpdate` models. Existing DB row scrubbed via `$unset`. Sending the field is silently ignored.
- **Invest page restyle**: cards now have a gradient top stripe, ROI pill on the image, hover-lift, 3-cell stats grid (Daily / Days / Total), and a gradient CTA button.
- **Invest dialog UX**: on Confirm, the amount input is immediately disabled and blurred. After a successful invest, the user is redirected to `/my-packages` via `useNavigate` carrying `state.highlightId` — that card auto-scrolls into view and pulses with an accent ring for 3 seconds. Added `gap-3` between Cancel and Confirm buttons.
- **Team page (Gen tabs)**: Gen 1 and Gen 2 are sticky **side-by-side tabs** (sticky on scroll, just under the topbar). Gen 1 is selected by default; tapping a tab swaps the inline referral list below. Each list entry still shows phone, total invested, per-investment breakdown with dates, and joined date. Invite-link plain text remains hidden under the Copy buttons.
- **Welcome bonus**: already admin-customizable via Settings (`welcome_bonus`); verified end-to-end — value persists, is read on registration, and is credited to the new user's wallet.

### Tests
- iter 8: 11/11 backend pytest, 100% on frontend flows. One non-blocking React hydration warning on `/admin/settings` due to visual-editor instrumentation (cosmetic, deferred).

## Recent Changes (Feb 2026 — iteration 7)

### Removed
- **Notification feature** (entirely): no more in-app notification feed, bell icon, or backend endpoints. `notifications.py` deleted; all `notify()` calls stripped from `routes_user.py` and `routes_admin.py`.
- **3rd referral generation**: registration only writes gen1+gen2 referral records; `_award_referral_commissions` only loops 2 gens; `/referrals` no longer returns `gen3`; `/referrals/3/details` returns 400; `/settings/public` no longer exposes `gen3_percent`; admin UI no longer shows gen3 field.

### Added / Updated
- **Nomba payouts**: `/api/admin/withdrawals/{wid}/pay-nomba` endpoint; admin UI adds "Pay via Nomba" button alongside Paystack
- **Gateway switcher**: admin Settings has `deposit_gateway` and `payout_gateway` selects (paystack/nomba). Settings model exposes `nomba_client_id`, `nomba_client_secret`, `nomba_account_id`.
- **Announcement image upload** in admin Settings; Dashboard renders the image above the announcement text
- **Team page**: 2-card flex layout, click to expand inline list of users with phone, total invested, individual investment list (product, amount, date), joined date. Invite-link plain text hidden.
- **My Packages restyle**: icon, 3-cell stats grid (Invested/Earned/Per day), gradient progress bar, prominent investment date
- **Deposit page**: recent deposits now as a responsive card grid (status-colored left stripe)
- **History page**: filter chips one-line horizontal scroll; no page overflow on mobile
- **Withdraw page**: "Available: ₦X" helper text removed
- **Mobile keyboard**: viewport meta `interactive-widget=resizes-content` + existing `body.kb-open` JS handler keeps inputs visible above the soft keyboard

### Tests
- iter 7: 19/19 backend (test_iter7.py) + 100% frontend flows. Zero issues found.

## Tech Notes
- All backend routes prefixed `/api/*`
- Frontend uses `process.env.REACT_APP_BACKEND_URL`
- Mongo via `MONGO_URL` + `DB_NAME` from `.env`; dates stored as ISO strings
- Default products auto-seeded on first startup

## Backlog / Future Enhancements
- **P1** Live Paystack/Nomba: enter keys + flip `payment_mode` to `live` in admin → Settings
- **P2** Background scheduler (APScheduler) for payouts independent of user activity
- **P2** Email/SMS notifications (deposit success, withdrawal status, PIN change)
- **P2** Investment plan caps (one per product per user)
- **P2** Admin transactions view with filters/export
- **P2** PIN reset via security questions or admin override (currently PIN cannot be reset if forgotten — admin must wipe `withdrawal_pin_hash` manually)
- **P3** Cleanup dead `gen3_percent` field on Settings model (harmless, not exposed)
