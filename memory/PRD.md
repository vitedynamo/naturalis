# Naija Invest — PRD & Implementation Log

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
- **P2** Email/SMS notifications (deposit success, withdrawal status)
- **P2** Investment plan caps (one per product per user)
- **P2** Admin transactions view with filters/export
- **P2** Two-factor auth / PIN for withdrawals
- **P3** Cleanup dead `gen3_percent` field on Settings model (harmless, not exposed)
