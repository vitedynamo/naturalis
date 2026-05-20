# Naija Invest — PRD & Implementation Log

## Original Problem Statement
Build a Nigerian investment web app with features: deposits, withdrawals, referrals, profile, coupon bonuses, transaction history. Users invest in products and profit returns every 24 hours. Phone+password registration with optional referral code. Admin panel to customize products/packages, profit %, images, view users/withdrawals/deposits/referrals/investments. 3-generation referral program with customizable percentages. Admin caters for all user-side features. No landing/about page.

## User Choices (gathered at start)
- **Auth**: Custom JWT-based phone + password
- **Currency**: Naira (₦). Min deposit ₦3,000, min withdrawal ₦1,000, welcome bonus ₦750
- **Deposits**: Paystack gateway (no keys yet → mock mode; configurable via admin → settings)
- **Withdrawals**: Both manual (admin processes) and automatic (Paystack transfer when keys live)
- **Admin**: phone `08123456789` / password `personally`

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Modules: `server.py`, `models.py`, `auth.py`, `payouts.py`, `routes_user.py`, `routes_admin.py`. JWT auth via PyJWT, bcrypt password hashing.
- **Frontend**: React 19 + React Router, Tailwind + Shadcn UI components, Sonner toasts, lucide-react icons. Fonts: Outfit (display) + Manrope (body). Theme: deep forest green (#0F4C3A) + accent (#00D084) + sand.

## What's Implemented (2026-02 — MVP)
**User side**
- Phone+password registration with optional referral code; ₦750 welcome bonus auto-credited
- JWT login; persistent session via localStorage
- Dashboard (wallet hero, stats, active investment cards with 24h countdown + progress)
- Invest page (product grid with images, daily %, duration, ROI; invest dialog)
- Deposit page (Paystack mock+live flow, quick amount chips, history table, callback page at /payment/callback)
- Withdraw page (manual/auto method choice, bank-on-file guard, history)
- Referrals page (referral code, copy code & invite link, 3-generation breakdown with users + earnings)
- Profile (bank details edit, password change)
- Coupons (redeem code → wallet credit)
- Transaction history (filter by type)

**Admin side**
- Auto-seeded admin user (08123456789 / personally)
- Overview stats (users, active investments, totals deposited/withdrawn/invested, pending counts)
- Users (block/unblock, manual wallet adjustment)
- Products CRUD (image URL, price, daily %, duration, min/max, active)
- Deposits (approve manual deposits)
- Withdrawals (approve → mark paid; reject → auto-refund wallet)
- Investments (read-only list)
- Referrals (filter by generation)
- Coupons CRUD
- Settings (welcome bonus, min deposit/withdrawal, gen1/2/3 percentages, Paystack public+secret keys, payment_mode = mock|live)

**Investment payout engine** (`payouts.py`)
- Runs on every `/auth/me`, `/investments`, `/invest` call.
- For each active investment, credits every full 24h elapsed since `last_payout_at`, up to `duration_days`.
- For each payout cycle, cascades commissions up 3 generations using settings percentages.
- All credits logged to `transactions` collection with `balance_after`.

**Paystack integration**
- Real init/verify/webhook code wired in (`/deposit/initialize`, `/deposit/verify/:ref`, `/deposit/webhook` with HMAC-SHA512 signature check).
- Switch via admin Settings: payment_mode + Paystack keys. Mock mode (default) auto-credits deposits for testing.

## Test Results (iteration 1)
- Backend: 100% (38/38 pytest cases) — auth, products, deposits, invest, withdrawals, coupons, referrals, transactions, admin CRUD, **24h payout simulation + 3-gen referral cascade verified**
- Frontend: 100% of flows tested (login, register, dashboard, invest, deposit, withdraw, referrals, admin panel)
- Issues found & fixed during test run: MongoDB `_id` leak on 4 POST endpoints — patched in routes_user.py and routes_admin.py
- Minor design improvement applied post-test: increased contrast of label text; added "No image" placeholder for admin product cards

## Test Credentials
See `/app/memory/test_credentials.md`.
- Admin: `08123456789` / `personally`
- Sample user: `08011112222` / `resetMe` (created in tests; password later reset via forgot-password flow)

## Updates — Feb 2026 (iteration 3) — Major Redesign

### Added
- **Object storage for product images**: Emergent storage integration. Admin uploads JPG/PNG/WebP (≤5MB) via `POST /api/admin/upload-image`; files served publicly at `GET /api/files/{path}`.
- **Dark / light theme toggle**: CSS-variable-based theme system; toggle button on Login, Register, ForgotPassword, UserLayout (top bar mobile + sidebar desktop), AdminLayout sidebar. Theme persists in `localStorage.ni_theme`.
- **Security questions at signup**: 2 of 8 predefined questions + answers (case-insensitive). Self-service password recovery via `GET /api/auth/security-questions/{phone}` + `POST /api/auth/reset-with-questions`. Admin-mediated reset retained as fallback.
- **My Packages page** (`/my-packages`): replaces the active investments view that was on Dashboard.
- **Team page** (`/team`): alias of `/referrals` (3-generation tree).

### Removed from Dashboard
- The 4 stat cards (Total Earnings, Daily Expected, Referral Earnings, Active Plans).
- The Active Investments list.

### Replaced with (revenue-driving)
- Wallet hero + Deposit/Withdraw buttons.
- **Featured Plan** card showing highest-ROI product with prominent invest CTA.
- 3 vertical CTA cards (Invite, Coupon, My Packages).
- **Recommended plans** grid linking to invest.

### Navigation changes
- Mobile bottom nav primary items: **Home / Invest / My Packages / Team / More**.
- Deposit and Withdraw moved into the "More" sheet (alongside Coupons, History, Profile, Sign out).
- Desktop sidebar shows all items.

### Color system
- New palette replacing green: **Indigo `#4F46E5`** (primary) + **Coral pink `#EC4899`** (accent) + **Gold `#F59E0B`**.
- Dark mode: deep midnight `#0B0B1F`, surface `#15152A`, brighter indigo `#818CF8` and pink `#F472B6`.

## Updates — Feb 2026 (iteration 4) — Hardening & Admin Controls

### Backend
- **Security questions**: register endpoint now enforces all-or-none on the 4 fields (Q1/A1/Q2/A2) and rejects identical questions.
- **Paystack Transfers**: `POST /api/admin/withdrawals/{id}/pay-paystack` creates a transfer recipient + initiates a transfer in live mode; simulates in mock mode. `GET /api/admin/banks` returns Paystack's NG list (cached 1h) or a static fallback.
- **Admin-controlled home**: `featured_product_id` + `home_announcement` + `home_announcement_active` added to Settings. `PUT /admin/settings` clears featured_product_id on both explicit null and empty string (uses `dict(exclude_unset=True)`).
- `GET /api/settings/public` exposes featured product + announcement so the user dashboard can fetch them.

### Frontend
- **Emergent badge removed** entirely from `public/index.html` (kept inert hidden anchor + JS auto-removal + MutationObserver guard). Title changed to "NaijaInvest — Daily Returns Platform".
- **Mobile bottom navbar** padding rebalanced to `px-1` (no more pr-28 reserve).
- **History/Transactions** redesign: card list on mobile, scroll-protected table on desktop. `UserLayout <main>` now uses `flex-1 min-w-0 overflow-x-hidden` to prevent flex-child overflow.
- **Dashboard**: featured plan is admin-controlled (with auto-highest-ROI fallback); home announcement banner shows when active; "Recommended for you" grid REMOVED.
- **Withdraw page**: removed method selector + bank-on-file card; "Add bank" button placed directly below the warning text (only shown when bank not yet set).
- **Admin Settings**: featured-plan dropdown + announcement textarea with active toggle.
- **Admin Withdrawals**: new "Pay via Paystack" button + dialog (auto-suggests bank code from user's saved bank name, manual override available).

### Tests
- iter 4: 23/24 backend + frontend pass; 2 issues fixed in iter 4.2 → 6/6 retest pass.

## Tech Notes
- All backend routes are under `/api/*` (ingress requirement).
- Frontend calls use `process.env.REACT_APP_BACKEND_URL`.
- Mongo uses `MONGO_URL` and `DB_NAME` from `.env`. All documents store dates as ISO strings.
- Default products auto-seeded on first startup if collection empty.

## Backlog / Future Enhancements (P0/P1/P2)
- **P1** Live Paystack: enter keys + flip `payment_mode` to `live` in admin → Settings.
- **P1** Automatic Paystack Transfers for "auto" withdrawals (create transfer recipient + initiate transfer flow).
- **P1** Image upload for products (replace URL-only field with file upload to object storage).
- **P2** Background scheduler (e.g. APScheduler) for payouts so they don't depend on user activity.
- **P2** Email/SMS notifications (deposit success, withdrawal status).
- **P2** Investment plan caps (one per product per user) — currently unlimited.
- **P2** Admin transactions view with filters/export.
- **P2** Two-factor auth / PIN for withdrawals.
- **P2** Internationalisation / dialect copy.
