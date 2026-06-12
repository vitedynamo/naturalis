# Evoque-Nova — PRD & Implementation Log

## Recent Changes (Jun 2026 — iteration 68)

### "Verdant Growth" rolled out across user pages

Applied the new green/coral identity consistently to all in-app user pages (they already inherited the `.user-theme` palette/fonts/pill buttons; this pass tightened visual consistency):
- **Headers** on Invest, Deposit, DepositTransfer, Withdraw, MyPackages, Profile, Referrals, Coupons, History changed from `font-extrabold` (800, not loaded for Clash Display) → `font-semibold` (600) for the clean editorial look.
- **Primary CTAs** made pill-shaped (`rounded-full`): Invest "Invest now" (also de-gradiented to solid green), Deposit "Proceed to pay", Coupons "Redeem", DepositTransfer "I have paid"/"Start new deposit", and all 6 Profile action buttons.
- `index.css`: scoped `.user-theme .text-label` to the Satoshi font for overline consistency.

**Verified (read-only, live Atlas NOT mutated):** Invest + History render correctly with the new style; sidebar active states + wordmark correct in screenshots. Compiles clean.

**Remaining:** Auth pages (Login / Register / Forgot Password) still use the old global theme — they don't use `UserLayout`, so they need a separate scoped restyle.



## Recent Changes (Jun 2026 — iteration 67)

### Dashboard redesign — 3 fixes from user feedback

1. **Cards-before-image flash fixed**: added a `loaded` state in `Dashboard.jsx`; the featured-plan + secondary sections now render only after `/settings/public` resolves, so the default quick-action cards no longer flash before the configured packages image appears.
2. **Featured-plan label overlap fixed**: removed the absolute top-left "Hot pick" badge (which overlapped the "Featured plan" overline on the 4:3 mobile poster) and placed "Hot pick" as an inline chip next to the "Featured plan" overline inside the bottom content block — no overlap at any aspect ratio.
3. **"More" is now a real page**: replaced the bottom-sheet with a dedicated `/more` route (`pages/More.jsx`, added to `App.js`). The bottom-nav "More" item is now a `NavLink` to `/more` (with active state). The page lists Quick links (Deposit/Withdraw/Coupons/History/Profile), "Join our community" social links, and Sign out. `UserLayout` exports `moreItems`; the old More-sheet + socials fetch were removed from `UserLayout`.

**Verified:** frontend compiles; `/more` renders correctly (screenshot). Live Atlas DB untouched.



## Recent Changes (Jun 2026 — iteration 66)

### User-side FULL redesign #2 — "Verdant Growth" + decoupled home toggles

User felt the prior (blue/gold/black) restyle still looked too similar and asked for an *entirely new* design (fresh palette, redesigned bottom nav kept at bottom). New blueprint at `/app/design_guidelines.json`.

**New identity — "Verdant Growth"** (deep forest green + sage + coral/terracotta accents; Clash Display headings, Satoshi body, JetBrains Mono numbers). Implemented by replacing the `.user-theme` palette in `index.css` (light + dark + shadcn HSL tokens + new green/coral `hero-gradient`), still scoped so the admin console is untouched.

**Dashboard.jsx fully rebuilt** (new structure, not a recolor):
- Typographic balance hero (no card) — big mono balance, coral **Deposit** pill + outline **Withdraw**.
- Daily reward → dense structural status banner with a pulsing green dot, mono countdown, "Claim now" pill (animated check on claim).
- Featured plan → immersive 4:3/16:9 poster with dark gradient overlay, glass stat tiles, full-width green Invest CTA.
- Secondary section → horizontal-scroll quick-action "pill cards" (or the admin packages image).
- Welcome modal → glassmorphism with top hero image.

**Bottom nav redesign** (`UserLayout.jsx`): floating glass pill (`bottom-4`, detached) with a raised brand-green circle for the active item; desktop sidebar active state = coral left-border + `surface-alt`.

**Point 2 — decoupled toggles (admin):** added new setting `home_secondary_section_enabled` (models.py `Settings`/`SettingsUpdate`, exposed in `/api/settings/public`, default True). Dashboard now renders the **featured plan** (`home_featured_plan_enabled`) and the **secondary cards/image section** (`home_secondary_section_enabled`) independently. AdminSettings → "Featured plan visibility" now controls ONLY the poster; "Section below featured plan" gained its own independent on/off toggle (`secondary-section-toggle`).

**Verified:** light + dark render correctly (diagnostics: `--app-bg #F4F5F4` light, no `dark` class); `/api/settings/public` returns the new field; toggle decoupling confirmed by code. Live Atlas DB NOT mutated. Bottom nav is mobile-only (not in desktop screenshot).

**Scope:** dashboard + bottom nav done; pending rollout of the new style to Invest/Deposit/Withdraw/Profile/etc. + auth pages.



## Recent Changes (Jun 2026 — iteration 65)

### User-side UI/UX redesign — Royal Blue + Gold + Black (home/dashboard first)

User asked to change the user-side primary colors and restyle, starting with the home page. Design blueprint generated at `/app/design_guidelines.json` (Royal/Electric Blue + Gold + Black, "wealth club" premium aesthetic; Clash Display headings + IBM Plex Sans body).

**Implementation (scoped to NOT touch the admin console):**
- `index.css`: added a `.user-theme` (light) + `.dark .user-theme` (dark) block that overrides ALL app + shadcn HSL color tokens with the new blue/gold/black palette, `--radius: 0.5rem`, scoped fonts (Clash Display via Fontshare, IBM Plex Sans via Google), and a new blue→gold `hero-gradient`. Admin keeps its original pink/indigo identity untouched.
- `UserLayout.jsx`: root div now carries `user-theme` → every user page (Dashboard, Deposit, Withdraw, Invest, Profile, etc.) inherits the new palette automatically (other user pages use only CSS vars — no hardcoded colors, so they recolor cleanly). Sidebar active state = blue left-border + `brand-soft`. Fixed wordmark truncation caused by the wider Clash Display font.
- `Dashboard.jsx`: full component restyle per blueprint — wallet hero with mono label + gold Deposit CTA on royal-blue gradient; Daily Claim card rebuilt as a gold-bordered card with gold glow + gold Claim button (was a hardcoded pink gradient); welcome modal `DialogContent` tagged `user-theme` so the portaled dialog inherits the palette.

**Verified:** dashboard renders correctly in both light & dark themes (desktop screenshots). All `data-testid`s preserved. Auth pages (Login/Register) intentionally left on the old theme for a later rollout round.



## Recent Changes (Jun 2026 — iteration 64)

### Fix: Manual Adjustments admin page lag (P0)

**Root cause:** `AdminManualAdjustments.jsx` called `GET /api/admin/transactions` (returns up to 2000 rows) and filtered client-side for `meta.by_admin`. The backend endpoint also ran a **separate `users.find_one` lookup per transaction** (N+1 over MongoDB Atlas), so the page pulled ~344KB and hung on thousands of round-trips.

**Fix:**
- Added `GET /api/admin/manual-adjustments` (in `routes_admin.py`) that filters `{"meta.by_admin": True}` **server-side** and batch-loads users via a single `$in` query (new `_attach_user_names` helper, also reused by `/admin/transactions` to kill its N+1).
- Pointed `AdminManualAdjustments.jsx` (`useEffect` + `reload`) at the new endpoint; removed the client-side filter.
- Added startup indexes in `server.py`: `transactions(created_at)`, `transactions(meta.by_admin, created_at)`, `transactions(user_id, created_at)`, `users(id)`.

**Verified:** new endpoint returns in ~0.49s (16 rows, correct keys) vs the old 1.5s/344KB fetch; admin page renders all adjustments correctly (screenshot + curl).



## Recent Changes (Feb 2026 — iteration 63)

### Withdrawal fee — UI surface complete

The `withdrawal_fee_percent` setting was wired end-to-end on the backend (wallet debited gross, bank receives net) but the UI never exposed fee/net to users or admins. Three surfaces added:

1. **`Withdraw.jsx` — live fee preview**: when `settings.withdrawal_fee_percent > 0` and the user types a valid amount, a small card under the amount input shows `Withdrawal fee (X%) − ₦Y` and `You'll receive ₦Z` in success-green. Hidden when fee is 0 to keep the form clean.
2. **`Withdraw.jsx` — history rows**: mobile cards now show a `Fee ₦X · Net ₦Y` sub-line under the gross amount; the desktop table gained a new "Fee · Net" column. Only renders when `fee_amount > 0` on that row.
3. **`AdminWithdrawals.jsx`** — the Amount column in the main table now shows `−₦fee · net ₦Y` under the gross figure when applicable. The Toolkit modal header was also bug-fixed: the "Net" line previously hardcoded `formatNaira(w.amount)` (i.e. same as gross), now correctly renders `formatNaira(w.net_amount)` plus an extra "Platform fee (X%) − ₦Y" row when the row carries a non-zero fee.

All edits are purely conditional UI rendering against API fields already exposed by `GET /api/withdrawals`, `GET /api/admin/withdrawals`, and `GET /api/settings/public`. Backend code untouched.

## Recent Changes (Jun 2026 — iteration 62)

### BudPay + QorePay payment gateway integration

**Two new deposit gateways** wired into the existing multi-gateway architecture.

- **BudPay** (`backend/budpay.py`) — fully working live:
  - `POST /api/v2/transaction/initialize` returns a `https://checkout.budpay.com/...` URL.
  - `GET /api/v2/transaction/verify/{ref}` maps status `success` → success, `failed/abandoned/reversed/cancelled` → failed, anything else → pending.
  - Settings keys: `budpay_secret_key`, `budpay_public_key`, `budpay_webhook_secret`.
  - Smoke-tested live with the user's sk_live_… key — got real checkout URL back, verify correctly returns pending until the user pays.

- **QorePay** (`backend/qorepay.py`):
  - `POST /v1/purchases` with `channel: "TRANSFER"`, `customer_email`, `customer_name`, and **`brand_id`** (a value the merchant configures under Brands in their QorePay dashboard).
  - `GET /v1/transactions/{ref}` for verification (maps `success/successful/paid/completed` → success, `failed/declined/cancelled/expired` → failed, else pending).
  - Settings keys: `qorepay_secret_key`, `qorepay_public_key`, `qorepay_brand_id`.

- **Per-gateway availability** toggles extended with `gateway_budpay_enabled` and `gateway_qorepay_enabled` (default OFF — admin must opt-in). The user-side `Deposit.jsx` gateway picker now shows BudPay (Card · Transfer) and QorePay (Transfer) chips when their respective toggles are on.

- **Admin Settings → Gateways** tab gains two new sections (BudPay credentials and QorePay credentials) modelled after the existing Marasoft section, with public/secret key fields, webhook secret, and Brand ID.

**Verified**: BudPay init returned `mode=live, gateway=budpay, authorization_url=https://checkout.budpay.com/pay/api?reference=...`; BudPay verify on an unpaid reference correctly returned `status=pending`. Both gateways have been turned OFF after testing and `payment_mode` reset to `mock` to avoid live charges in the preview environment.



### Admin polish + start of route modularisation

**1. Manual Adjustments polish**
- Removed the hover-shadow effect on each adjustment card (was distracting at scroll).
- Username font reduced + restyled to match the AdminUsers table (`font-semibold text-sm` instead of `font-display font-bold`).
- Amount font reduced from `text-xl font-extrabold` → `text-base font-bold` so the row reads as a unified line.

**2. AdminUsers pagination upgrade**
- Replaced the bespoke prev/next buttons with the shared `<Pagination>` component (same one used by Admin Deposits / Withdrawals). Users now get the full feature set: "Showing X – Y of N" copy, keyboard shortcuts (←/→ flip pages, `g g` to jump), Go-to input, and consistent visual style across all admin tables.

**3. Password Resets card polish**
- Username font reduced from `font-display font-bold text-base` → `font-semibold text-sm` to match the AdminUsers table convention.

**4. Route modularisation (incremental — step 1 of N)**
- New `/app/backend/_routers.py` exports the canonical `user_router` and `admin_router` instances. Both legacy files now re-export the SAME instances, so domain modules can safely attach handlers without breaking server.py's `from routes_user import router as user_router` contract.
- New `/app/backend/routes/` package holds per-domain files. Three domains extracted as a proof-of-concept and to validate the pattern:
  - `routes/admin_password_resets.py` — 3 endpoints
  - `routes/user_daily_claim.py` — 2 endpoints
  - `routes/user_coupons_transactions.py` — 2 endpoints
- `routes_user.py` reduced 1626 → 1514 lines; `routes_admin.py` reduced 3060 → 3029 lines.
- New `/app/backend/tests/test_route_modularisation.py` snapshots the registered routes (35 user + 70 admin) so any accidental drop during future incremental extractions fails immediately.

**Why incremental?** A bulk move of 4600+ lines into ~20 domain files would be high-risk: many handlers share file-local helpers (`_settings`, `_log_admin_activity`, `_announce_doc`, etc.) and rewriting those import chains in one shot invites regressions. The shared-router pattern unblocks safe incremental extraction — future agents can move one domain at a time without touching the rest of the codebase.

**Verified**: all extracted endpoints + a sample of legacy endpoints (transactions, withdrawals, investments, settings, products) return correctly via curl; `test_route_modularisation.py` passes (35 user / 70 admin routes intact).



## Recent Changes (Feb 2026 — iteration 56)

**1. Featured plan visibility toggle** — new Setting `home_featured_plan_enabled` (default `True`). Admin Settings → Home now exposes a toggle that hides the entire "Featured Plan" hero (image + stats + CTA + right-hand cards/image) on the user dashboard when OFF. Verified via curl PUT + `/settings/public` round-trip and the user `Dashboard` early-exit guard.

**2. Admin Activity Log redesign** (`AdminActivityLog.jsx`):
   - Gradient hero with **Refresh** + **Export CSV** actions (export emits the currently-filtered rows to a clean CSV with timestamped filename).
   - 4 stat cards: In current range / Last 24h / Unique admins / Sensitive actions.
   - Filter toolbar: search input + action dropdown (showing friendly labels via `ACTION_META`) + date-range dropdown (All / 24h / 7d / 30d).
   - Modern hoverable desktop table with target meta and "View" affordance; click any row to open a slide-in detail drawer with a JSON payload viewer + copy-to-clipboard buttons.
   - Mobile list view: icon-tile cards (replaces the wide-table scroll on small screens).
   - Pagination preserved.

**3. Admin Password Resets redesign** (`AdminPasswordResets.jsx`):
   - Gradient hero with Refresh action.
   - 4 stat cards: Pending / Approved / Rejected / Total ever.
   - Filter pill row with live counts (Pending • Approved • Rejected • All) + search box.
   - Each request is an expandable card showing the user's name + phone + status pill + truncated reason. Expanding shows full reason, admin note, action timestamp, and the Approve/Reject buttons when pending.
   - Replaced the bare `window.prompt()` workflow with a polished Shadcn `<Dialog>` confirmation: shows user summary, captures an internal note in a textarea, and warns admins that approval activates the new password immediately.
   - Friendly empty state with `Inbox` icon when no requests match the current filter.

**Verified**: curl PUT /admin/settings persists `home_featured_plan_enabled`; live admin screenshots confirm Activity Log + Password Resets render correctly with stat cards, filters, search, and expand-to-act flow.



## Recent Changes (Feb 2026 — iteration 55)

**1. Branding image uploader (Admin Settings → Branding tab)**
- New Settings field `brand_logo_url` (uploaded via existing `/admin/upload-image` endpoint).
- New `BrandingProvider` context (`/app/frontend/src/context/BrandingContext.jsx`) fetches `/settings/public` once and exposes `logoUrl` with fallback to the bundled `/evoque-nova-logo.png`.
- `BrandingProvider` also syncs the document favicon (`<link rel="icon">` + `apple-touch-icon`) dynamically when the logo changes — so the browser tab icon updates without rebuilding the bundle.
- Wired the dynamic logo into: `AdminLayout` sidebar, `AdminLogin` left panel, `Login`, `Register`, `ForgotPassword`, and the user `UserLayout` (desktop sidebar + mobile top bar).

**2. Cleaned user-facing transaction descriptions** — backend now writes generic strings (`"Deposit"`, `"Deposit credited"`, `"Withdrawal request"`, `"Auto-refund: withdrawal failed"`) instead of leaking the gateway name. A one-off data migration normalized 47 existing rows. A new pytest at `/app/backend/tests/test_tx_descriptions.py` guards against regression by failing if any tx description contains `paystack|nomba|marasoft`.

**3. Bottom-nav visibility fix (`AuthContext.jsx`)** — replaced the previous focus-only heuristic with a robust `visualViewport`-based keyboard detector. The nav now hides ONLY when the actual on-screen keyboard shrinks `visualViewport.height` by > 150px (with focus-based fallback for browsers that lack the API). A 2-second safety interval also force-clears the `kb-open` class whenever no input is focused, recovering from edge cases where `focusout` was swallowed by a modal dismiss.

**4. Social links in user "More" sheet** — `UserLayout` now fetches `/settings/public` and renders any populated `telegram_url`, `telegram_channel_url`, `telegram_group_url`, `whatsapp_channel_url`, `whatsapp_group_url` as a "Join our community" block above the Sign out button on mobile.

**5. Customizable section below the Featured Plan (Home)** — new Settings fields `home_below_featured_mode` (`cards` | `image`) + `home_below_featured_image_url`. Admin Settings → Home tab now exposes a 2-card toggle (`Default cards` / `Custom image`); when `image` is selected, the right-hand region of the user dashboard renders the uploaded poster instead of the default Team/Coupon/Packages CTAs.

**Verified**: PUT admin/settings persists all new fields; user-facing screenshots confirm logo renders on login/admin/sidebar; mobile More sheet shows social links; 15/15 user transactions are gateway-free; bottom-nav is visible on Deposit page after focus/blur cycle.



## Recent Changes (Feb 2026 — iteration 54)
**Branding** — renamed `NaijaInvest` → `Evoque-Nova` across user/admin layouts (`UserLayout.jsx`, `Register.jsx`, `Login.jsx`, `ForgotPassword.jsx`); admin sidebar badge `NI` → `EN`. Title was already `Evoque-Nova — Daily Returns Platform`.

**Favicon** — added second image (uploaded `evoque-nova.jpg`) to `/app/frontend/public/`; wired `<link rel="icon">` + `<link rel="apple-touch-icon">` in `index.html`.

**Backend** (`models.py`, `routes_user.py`):
- New Settings fields: `gateway_paystack_enabled`, `gateway_nomba_enabled`, `gateway_marasoft_enabled` (all default `True`), `referral_commission_mode` (`first_only`|`unlimited`|`capped`, default `first_only`), `referral_commission_cap_n` (default `3`).
- `/deposit/initialize` now rejects deposits routed to a disabled gateway with `503 "<gateway> is currently disabled"` — auto-fallback to the primary if it is enabled.
- `_award_invest_commissions` honours the new mode:
  - `first_only` — pay only on the referred user's first investment ever
  - `unlimited` — pay on every investment
  - `capped` — pay on the first N investments (N = `referral_commission_cap_n`)
- All new fields exposed on `/settings/public` so the user-side gateway picker can filter disabled providers.

**Frontend** (`AdminSettings.jsx`, `Deposit.jsx`):
- Admin Settings → Deposits: new **"Per-gateway availability"** section with three toggles (Paystack/Nomba/Marasoft).
- Admin Settings → Referrals: redesigned to match reference image — Level 1 / Level 2 bonus inputs + 3 commission-mode cards (Legacy · First only, Unlimited · Every invest, Capped · First N). When Capped is selected, an inline "Cap (N investments)" input appears.
- User Deposit page: gateway-picker filters out disabled providers, so toggling Nomba off on admin hides the Nomba chip from the user.

**Verified e2e**:
- Backend pytest-style script confirmed all 3 modes work: first_only → 1 tx after 2 invests; unlimited → +1 tx; capped N=3 → 3 tx held at cap.
- Curl against `/deposit/initialize` rejected disabled gateway choice with 503 + clear message.
- Screenshots verified Referrals tab matches user's reference image; Per-gateway toggles render; user login shows "Evoque-Nova" brand and favicon resolves.

## Recent Changes (Feb 2026 — iteration 53)

### User-facing pages wired to new settings + Daily Claim end-to-end
**Backend** (`routes_user.py`, `models.py`):
- `DepositInitRequest` accepts optional `gateway`. Honoured by `/deposit/initialize` only when both `multi_gateway_enabled` and `let_users_choose_gateway` are ON; otherwise the global `deposit_gateway` setting wins.
- `/withdrawal/request` now:
  - Skips the PIN block entirely when `require_withdrawal_pin = false` (admin override).
  - Rejects amounts above `max_withdrawal` (when configured) with a 400.
  - Forces manual approval (skips auto-payout, leaves status pending) when `auto_payout_max_amount > 0` and the request equals/exceeds it.
- New endpoints `/daily-claim/status` (returns enabled/amount/cooldown) and `/daily-claim/claim` (24h cooldown; credits wallet + writes `daily_claim` transaction). User doc gains `last_daily_claim_at`.

**Frontend** (`Deposit.jsx`, `Withdraw.jsx`, `Dashboard.jsx`):
- Deposit: Quick-amount chips now read from `settings.quick_deposit_amounts` (fallback retained); a new gateway-picker grid appears below when both `multi_gateway_enabled` + `let_users_choose_gateway` are ON; transfer-description template surfaced as a "narration to use" hint.
- Withdraw: Limits row now shows `min – max` and an extra hint about auto-payout cap; PIN input is conditionally rendered + the submit gating bypasses PIN checks when not required; in-form warning when requested amount exceeds the auto-payout cap (admin-approval needed); `max` attribute set on amount input.
- Dashboard: New **DailyClaimCard** (brand-magenta gradient) appears above the featured plan when daily claim is enabled. Shows the amount, a live 24h countdown when on cooldown, and a one-click Claim button that credits the wallet via the new endpoint.

Verified e2e: daily-claim status + claim + re-claim (429); deposit init with gateway override produces a deposit (logged as "mock" in mock-mode as expected); screenshots confirm new Limits row on Withdraw and dashboard daily-claim flow.

## Recent Changes (Feb 2026 — iteration 52)

### Settings expansion + Danger-zone tools + Reverse adjustment + Admin password
**Backend** (`models.py`, `routes_admin.py`, `routes_user.py`):
- Settings model + SettingsUpdate gained: `deposit_bonus_percent`, `deposit_bonus_limit_per_user`, `transfer_description_template`, `multi_gateway_enabled`, `let_users_choose_gateway`, `quick_deposit_amounts` (list), `require_withdrawal_pin`, `max_withdrawal`, `auto_payout_max_amount`, `daily_claim_enabled`, `daily_claim_amount`, `telegram_channel_url`, `telegram_group_url`, `whatsapp_channel_url`, `whatsapp_group_url`. All exposed on `/api/settings/public` for user-side rendering.
- **Destructive admin endpoints**:
  - `POST /api/admin/system/logout-all-users` — bumps `session_epoch` on every non-admin (forces re-login).
  - `POST /api/admin/system/clear-user-data` — wipes deposits/withdrawals/investments/transactions/referrals/redemptions/dismissals, zeros every non-admin wallet (`total_earnings`, `referral_earnings` too). Requires typed token `CLEAR_USER_DATA`.
  - `POST /api/admin/system/clear-database` — additionally drops products, coupons, announcements, admin_activity, and every non-admin user. Requires token `CLEAR_ALL_DATA`.
- `POST /api/admin/transactions/{id}/reverse` — creates the inverse transaction, marks original `meta.reversed: true`, blocks re-reversal + reversing-a-reversal.
- `POST /api/admin/change-password` — verifies current password, refuses identical-replacement, persists bcrypt hash.

**Frontend** (`AdminSettings.jsx` overhaul, `AdminManualAdjustments.jsx`):
- New tabs added: **Daily Claim**, **Password**, plus expanded Deposits/Withdrawals/Home.
- Deposits tab: removed Welcome bonus from here (moved to Daily Claim); added Deposit bonus % + Bonus limit per user + new "Deposit experience" section (Transfer description template / Quick amounts CSV input / Multi-gateway toggle / Let-users-pick-gateway toggle).
- Withdrawals tab: new "Limits & PIN" section with Min/Max withdrawal + Auto-payout limit + "Require 4-digit PIN" toggle.
- Daily Claim tab: enable toggle + daily amount + welcome bonus.
- Home tab: new Social channels section (Telegram channel · Telegram group · WhatsApp channel · WhatsApp group). Featured-product select rewritten with "— None (auto-pick highest ROI) —" + tier preview + currently-selected echo.
- Password tab: full change-password form with current/new/confirm fields.
- Danger zone: payment mode + three big destructive-action cards (SOFT logout · HARD clear-user-data · NUKE clear-database). Each opens a brand-coloured gradient modal with typed-token confirmation and warning callout.
- **Manual Adjustments**: each row now has a **Reverse** button (red) that opens a confirm modal showing the amount-flip (+₦5,000 → -₦5,000), required reason textarea, and warning banner. Rows already reversed (or reversals themselves) show a disabled icon with a tooltip explanation.

Verified e2e: settings save echoes new fields with correct values; logout-all returned `affected: 90`; clear-user-data with wrong token rejected; change-password with wrong current rejected; reverse-adjustment created `tx_d41386e2f0007998` with `new_balance: 6000`, re-reversal blocked. Screenshots confirm Danger zone & Deposits tab render correctly.

## Recent Changes (Feb 2026 — iteration 51)

### Admin Settings — full redesign with tabbed shell
**Frontend** (`AdminSettings.jsx` full rewrite, preserves every existing field binding):
- **Brand-magenta hero** with gear-strip SVG decoration; status strip in the hero showing current mode + active deposit + payout gateways (`Mode: LIVE · Deposit gateway: MARASOFT · Payout gateway: NOMBA`); big white "Save changes" pill on the right.
- **6 horizontal pill tabs** (Deposits · Withdrawals · Referrals · Gateways · Home · Danger zone). Active pill is a magenta→pink gradient with shadow; inactive pills are subtle text-only buttons.
- **Signature element** — `GatewayCard` selectable cards with check badge + brand-pink border + soft-pink fill on the selected provider. Used for both *Active deposit gateway* (Paystack / Nomba / Marasoft) and *Active payout gateway* (Paystack / Nomba).
- Custom brand-gradient **toggle switches** (gradient ON, neutral OFF) for auto-payout, withdrawals-open, banner-active, welcome-modal-active, etc.
- Reusable `Field`, `SecretField`, `Toggle`, `Section`, `GatewayCard` building blocks keep every tab visually consistent.
- **Sticky save bar at the bottom** with sparkle icon and a second "Save changes" button.
- Danger-zone tab wraps the live/mock payment-mode select in a red-bordered card with a warning callout.
- Verified light mode via screenshots — Deposits tab and Withdrawals tab both render beautifully with the selected gateway card highlighted.

## Recent Changes (Feb 2026 — iteration 50)

### Admin Manual Adjustments — full redesign + Withdrawals-style pagination
**Frontend** (`AdminManualAdjustments.jsx` full rewrite):
- **Brand-magenta hero** with sliders/scales SVG decoration (replaces the plain heading) and a stat strip ("20 total adjustments · 18 credits · 2 debits").
- 4 KPI cards with per-tone glow blobs: **Total credited / Total debited / Net adjustment / Records on view**. Net switches between accent (positive) and warn (negative) tones automatically.
- Filter dropdown (`All / Credits only / Debits only / Bonus / Refunds`) + search across name / phone / note / transaction ID.
- **Same row-size pill toolbar** as Admin Withdrawals (5 · 20 · 50 · 100 · All) with the same "Showing X of Y" counter, and **the same `Pagination` component** at the bottom (Previous · Page N of M · Jump-to · Next + keyboard shortcuts).
- Each adjustment renders as a **card with a coloured side accent strip** (green for credit, red for debit), up/down arrow well, avatar with initial, name + phone + credit/debit/refund pill, italic description, **balance-delta footer** `₦6,000 ↗ ₦11,000 · reason` showing the before→after trail (unique signature vs the reference), and a right-side block with big coloured amount + absolute date + **relative time** ("2h ago") + profile-jump button.
- Verified via screenshot.

## Recent Changes (Feb 2026 — iteration 49)

### Fix: Referrals tab on Admin User Detail returning empty
**Bug**: On `/admin/users/{id}` the Referrals stat card, Referral Bonus card, Referrals tab badge, and the Referrals table were all empty / zero, even for users with active referred members. Confirmed in DB: 22 users carry `referred_by` (user id), 0 carry `referred_by_code`.

**Root cause**: `routes_admin.py` was querying `{"referred_by_code": user.referral_code}` to find referred users — but the signup flow (`routes_user.py`) stores the relationship as `referred_by: <referrer_user_id>` directly. The `referred_by_code` field never existed on any document.

**Fix** (`routes_admin.py`): three queries in `admin_user_details` and `admin_user_timeline` now use `{"referred_by": user_id}` for fetching the user's referred members, and `{"id": u["referred_by"]}` for resolving the user's own referrer info. Also updated the CSV export columns to use `referred_by` instead of the non-existent `referred_by_code`.

Verified e2e via curl + UI screenshot — referrer with 3 referrals (Adam / Johnny / Manny) now renders correctly with stats `3 referrals · 3 active · ₦3,250 referral bonus`.

## Recent Changes (Feb 2026 — iteration 48)

### Announcements — full multi-row redesign (replaces single-banner setting)
Previously the admin "Announcements" page edited a single global home banner + welcome modal in settings. Now it manages a full collection of standalone in-app pop-ups with scheduling, targeting, and per-user dismiss tracking.

**Backend** (`models.py`, `routes_admin.py`, `routes_user.py`):
- New `Announcement` model + `AnnouncementCreate` payload with: `title`, `message`, `style` (info/success/warning/critical), `cta_type` (none/internal/external) + `cta_label` + `cta_url`, `starts_at`/`ends_at`, `hide_from_newcomers_hours`, `reshow_interval_minutes`, `priority`, `is_active`.
- Admin CRUD: `GET /api/admin/announcements`, `POST /api/admin/announcements`, `PUT /api/admin/announcements/{id}`, `DELETE /api/admin/announcements/{id}`. All write actions logged to admin activity.
- User-facing: `GET /api/announcements/next` returns the single highest-priority announcement the current user qualifies for right now (honours window, newcomer-hours, dismissals, reshow interval). `POST /api/announcements/{id}/dismiss` upserts the per-user dismissal timestamp.
- New collection `announcement_dismissals` `{user_id, announcement_id, dismissed_at}`.

**Frontend** (`AdminAnnouncements.jsx` full rewrite, new `InAppAnnouncementPopup.jsx`):
- **Brand-magenta hero** with sound-wave SVG decoration on the right + big white "+ New announcement" CTA. Stat strip ("4 total · 4 live · 0 scheduled").
- **Card list** — each announcement renders as a card with a **coloured side accent strip** per style (blue/green/gold/red), icon well, title with LIVE/style/priority pills, two-line message preview, and schedule / newcomer-hours / creation-relative meta. Eye toggles active state; Edit and Delete on the right.
- **Two-column modal** — form on the left (Title / Message w/ 0-2000 counter / coloured Style pills / CTA select with label+URL / Starts+Ends / Smart-timing accent card with newcomer hours and reshow interval w/ Min/Hrs/Days unit toggle / Priority + Active card), **Live preview panel on the right** that renders the exact user-facing popup as the admin types — unique signature vs the reference design (which has no preview).
- User-facing `InAppAnnouncementPopup` is mounted in `UserLayout` so it appears on every authenticated page. Fetches `/announcements/next`, renders the popup with the style-coloured gradient header, internal-vs-external CTA routing, and dismisses to the backend with relative time tracking.
- Verified e2e via curl + screenshots in light mode.

## Recent Changes (Feb 2026 — iteration 47)

### 1. "Pay missing bonuses" safety-net tool on Referrals
**Backend** (`routes_admin.py`):
- New `POST /api/admin/referrals/pay-missing-bonuses` with `{dry_run: bool}` payload.
- Scans every (referrer, referred user) pair × every investment the referred user made. If no `referral` transaction exists yet for that `(referrer_id, investment_id)`, computes the gen-1/gen-2 commission per current settings and credits the delta. Writes a `referral` transaction tagged `meta.backfill: true`.
- **Idempotent** — re-running is a no-op because the `(user_id, meta.investment_id)` key is already taken on completed payouts.
- Logs an `referral.backfill` admin activity entry with aggregate totals + per-referrer breakdown when live-run credits anything.

**Frontend** (`AdminReferrals.jsx`):
- Pink gradient "**Pay missing bonuses**" button in the toolbar.
- Opens a brand-magenta confirmation modal that previews `records_to_credit / users_impacted / total_amount` via a server-side `dry_run` call, with a green "nothing to pay" banner when up-to-date OR a gold caution banner when there are credits to issue, and a final disabled-when-zero **PAY ₦X** action.
- Verified e2e via curl: dry-run, live-run (credited ₦500 across 1 record/user after deleting a test tx), no-op rerun.

### 2. Admin Coupons page — full redesign
**Backend** (`routes_admin.py`, `models.py`):
- Coupon model extended with optional `expires_at` (ISO timestamp) and `note` (≤200-char internal label).
- `list_coupons` enriches each row with `redemption_count` and `total_credited` aggregated from the `coupon_redemptions` collection.

**Frontend** (`AdminCoupons.jsx`, full rewrite):
- Brand-magenta hero with floating SVG ticket decorations + a big white "New coupon" CTA.
- 4 KPI cards (Total codes / Live now / Redemptions / Credit given) with per-tone glow blobs.
- Tab filter (All / Active / Inactive / Expired) + code/note search.
- Each coupon renders as a **paper-ticket card with side notches and a dashed perforation divider** — uniquely identifiable vs the reference's flat table. Card shows live/expired/redeemed pip in the magenta header, big naira amount, redemption progress bar (when capped), internal note in italics, expires relative-countdown that turns red when overdue, and three actions (On/Off · Edit · Delete).
- Modal with brand-gradient header, **"Generate"** button (NJ-prefixed unambiguous code), amount, max uses, expires datetime-local, internal note, active toggle row with helper text, and sticky **"Mint coupon"** footer.
- Verified light + dark via screenshots.

## Recent Changes (Feb 2026 — iteration 46)

### Admin Referrals page — full redesign
**Backend** (`routes_admin.py`):
- `GET /api/admin/referrals` now hydrates each row with `bonus_paid` (aggregated from `transactions` matching `type:referral` + `meta.from_user_id`), `referred_invested` + `referred_investment_count` (aggregated from `investments`), and a derived `status` of `earned`/`pending`. All hydration done via three batched aggregations — keeps it O(N) round-trips.

**Frontend** (`AdminReferrals.jsx`, full rewrite):
- **Brand-coherent magenta hero** with a network-graph SVG (nodes + arcs) behind the title and an **embedded radial Conversion ring** showing the share of referrals that became investors — unique vs the reference design.
- **2×2 KPI grid** (Total / Bonus paid / Referred capital / Pending) PLUS a dedicated **Top Earners leaderboard panel** to the right (podium + ranked list of referrers by bonus paid, linked to their profiles).
- **Tab-style** Level switcher (All / L1 direct / L2) with a separate Status dropdown.
- **Each table row** shows avatars for both referrer and referred user, an arrow connector between them, bonus column (green when paid, "none yet" otherwise), referred user's invested amount + plan count, an `EARNED`/`PENDING` pill (pending pulses gold), and a dual date column (absolute + `7d ago`).
- **L1 / L2 badge**: L1 gets a gradient-pink pill with a crown icon; L2 a subtle accent pill. Reinforces commission tier visually.
- Verified light + dark mode via screenshots.

## Recent Changes (Feb 2026 — iteration 45)

### Auto-resume scheduled pauses
A paused investment can now flip itself back to active at a specific future timestamp without any admin intervention.

**Backend** (`routes_admin.py`, `server.py`):
- Pause payloads (`PauseInvestmentPayload`, `BulkInvestmentPayload`) now accept an optional `auto_resume_at` ISO-8601 string. `_validate_auto_resume_at` rejects past timestamps with a clear 400.
- New endpoint `PATCH /api/admin/investments/{id}/auto-resume` to set or clear (`null`) the schedule on an already-paused investment.
- New helper `_sweep_due_auto_resumes(db)` flips every paused investment whose schedule is past, attributes activity to a SYSTEM sentinel, and logs `investment.auto_resumed`. Each resume advances `last_payout_at` to now and clears `auto_resume_at`.
- The sweep runs inside the existing background poller loop (every `POLLER_TICK_SEC`, default 30s) — no new infrastructure needed.

**Frontend** (`AdminInvestments.jsx`, `lib/format.js`):
- Modal Payout-control section now exposes:
  - When active: optional `datetime-local` picker labelled "Optional · auto-resume at" inside the pause card.
  - When paused: a dedicated card showing the scheduled time, relative countdown, and **Edit** + **Cancel auto-resume** controls (or a "+ Schedule auto-resume…" CTA when nothing is scheduled).
- Bulk-pause bar gains an inline "AUTO-RESUME" datetime input when any active rows are selected — applies the same schedule to every paused investment in one call.
- Table now shows a small hint line under the `PAUSED` pill: `paused 1m ago · auto-resume in 1d` (or `· no schedule`).
- `relativeTime()` extended to handle future timestamps (returns `in 1d` instead of `0s ago`).
- Verified e2e via curl: pause-with-future / past-rejected / PATCH-clear / direct mongo past-set + sweep → status flipped to active, `auto_resumed: true`, `auto_resume_at: null`.

## Recent Changes (Feb 2026 — iteration 44)

### Pause / Resume investments — single + bulk
**Backend** (`routes_admin.py`):
- `POST /api/admin/investments/{id}/pause` — flips `active → paused`, stamps `paused_at`/`pause_reason`/`paused_by_admin_id`. 400 if not currently active.
- `POST /api/admin/investments/{id}/resume` — flips `paused → active`, advances `last_payout_at` to *now* so the user gets a fresh 24h cycle (no backlog drops). 400 if not currently paused.
- `POST /api/admin/investments/bulk-pause` and `…/bulk-resume` — accept `{investment_ids: list[str], reason?: str}`, walk through each, return per-id results + summary counts (`paused/not_active/not_found` and `resumed/not_paused/not_found`).
- Every action writes an `investment.paused` / `investment.resumed` activity log entry with full context.
- The payouts cron query already filters `{status: "active"}`, so paused investments are naturally skipped.

**Frontend** (`AdminInvestments.jsx`):
- **Single action**: new "Payout control" section in the detail modal (rendered for both active & paused) with a contextual button — pause (gold outlined) or resume (green filled) — and a status line showing "Paused {relative-time} ago".
- **Bulk action**: per-row checkbox column (only enabled for active/paused), header-level "select all on page" toggle, and a **sticky bulk-action bar** that appears the moment selection is non-empty. The bar shows the selection breakdown (`3 active · 0 paused`), enables/disables Pause/Resume buttons based on what's in the selection, and includes a Clear control.
- Selected rows render in the pink brand-soft tint for unmistakable feedback.
- Verified e2e via curl: single pause + re-pause guard + single resume + bulk pause (3 paused) + bulk resume (3 resumed).

## Recent Changes (Feb 2026 — iteration 43)

### Cancel investment from admin modal
**Backend** (`routes_admin.py`):
- `POST /api/admin/investments/{inv_id}/cancel` — Pydantic-validated payload `{reason: str (3-500 chars), refund_capital: bool}`. Returns 404 for missing, 400 if not currently `active`, 200 with full receipt otherwise. On `refund_capital=true` it credits the user wallet, writes a `refund`-type transaction, and includes `new_wallet_balance` in the response. Always logs an `investment.cancelled` activity entry with full context.

**Frontend** (`AdminInvestments.jsx`):
- New **Danger zone** section in the investment detail modal (only rendered for `active` investments).
- Two-step UX: primary outlined button "Cancel investment" → expands a confirmation card with required reason textarea, "Also refund capital" toggle (with live ₦amount preview), contextual hint that updates based on the refund choice, and a final "Cancel & refund / Cancel investment" red button.
- Reload + toast on success; explicit error toast on failure.
- Verified e2e via curl: validation (short reason → 422), success path (status flipped, wallet credited from ₦6,000 → ₦11,000, refund transaction created), re-cancel guard (400 "Cannot cancel a cancelled investment").

## Recent Changes (Feb 2026 — iteration 42)

### Investments KPI locale formatting + Deposits bulk gateway-ID backfill
1. **Investments KPI cards** — values now render in full Naira locale (`₦81,000.00`) instead of compact (`₦81K`). Hero strip "capital working" amount likewise full-locale.
2. **Backfill gateway IDs for historical deposits**
   - **Backend** `POST /api/admin/deposits/bulk-backfill-gateway-ids`: scans every `success` deposit (Marasoft / Paystack) with `gateway_id` empty, re-queries the gateway and writes the extracted ID. Does **not** touch status or wallet balance — purely a metadata backfill. Returns `{scanned, updated, not_found, errors, skipped_provider}`.
   - **Frontend** `AdminDeposits.jsx`: new accent-coloured **"Backfill gateway IDs"** button next to *Bulk recheck*, with toast summary of the run.
   - Verified end-to-end via curl on preview (`scanned: 11, updated: 0, not_found: 9, skipped_provider: 2` — expected since most preview records are sandbox/mocked).

## Recent Changes (Feb 2026 — iteration 41)

### Admin Investments page — full redesign
**User request**: redesign with a richer, more unique aesthetic than the reference design.

**What's new** (`AdminInvestments.jsx`, full rewrite):
- **Brand-coherent hero** (magenta gradient with subtle SVG wave + radial glow blobs) instead of the reference's generic purple. Includes a contextual stat strip (`14 investments · 14 active · ₦81K capital working`) and an embedded "Drops due now" pulse badge that flashes when payouts are overdue.
- **Four KPI cards** with per-tone radial-glow blobs (no purple cliché): Capital invested · Profit paid (with % of projected) · Projected return · Active plans.
- **Live SVG radial-countdown ring** per row showing time until each user's next 24h payout. Rows where a drop is overdue get a soft pink highlight and a pulsing "DUE" label.
- **Inline progress bar** in the *Earned · Expected* column (days_paid/duration with gradient fill).
- **Plan badge** (product name + daily%) for instant tier recognition.
- **Two filters** (status + plan) + search + adaptive row-size selector (5/20/50/100/All).
- **Detail modal** with header gradient adapted to status, customer card linking to profile, four money tiles (invested/earned/daily-drop/expected), progress card with start/end/next-drop, timeline & identifiers.
- Status pill animates its dot when the investment is active.

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
