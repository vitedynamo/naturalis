# Naturalis — Product Requirements (PRD)

## Original problem statement
Build a Nigerian investment web app (deposits, withdrawals, referrals, profile, bonuses,
transaction history) — branded **Naturalis**. Admin panel for products, settings, UI toggles.
Min deposit ₦3,000, min withdrawal ₦1,000.

## Stack
React + FastAPI + MongoDB Atlas (`naturalis` DB). Tailwind, Context API, JWT auth.
Cowrywise-style mobile-first fintech UI, dark/light mode, bottom nav.

## Integrations
Paystack, Nomba, Marasoft, QorePay, BudPay (payments). Emergent Object Storage (images).

## Routes
- User: `/login`, `/register`, `/dashboard`, `/invest`, `/deposit`, `/withdraw`, `/team`, `/history`, `/profile`
- Admin: login at `/pentest/fuser/login`, console under `/pentest/fuser` (NOTE: `/admin/login` does NOT exist)

## Auth session design (VERIFIED WORKING — iteration_19, Jun 2026)
Three independent token slots so admin + user + impersonation coexist in one browser:
- `localStorage.ni_admin_token` / `ni_admin_user` — admin session
- `localStorage.ni_token` / `ni_user` — regular user session
- `sessionStorage.ni_token` / `ni_user` — impersonation tab (per-tab)
`api.js` picks token by URL/route; 401 interceptor clears ONLY the rejected slot.

## Implemented (recent)
- [Jun 2026] IP masking for Paystack: all 12 outbound Paystack calls (bank list, resolve,
  transaction init/verify, transferrecipient, transfer, transfer verify, balance) now route
  through the Fixie proxy via new `payments_proxy.fixie_client()` — same static IP as Nomba
  (verified exit IP 52.87.82.133, Paystack HTTP 200). `_httpx` diagnostic untouched.
- [Jun 2026] Verified admin/user session isolation in same browser — all invariants pass.
  Reported "sessions crash together" bug = STALE PRODUCTION CODE. Fix = redeploy.
- [Jun 2026] Added visible circular close (X) button to Dashboard welcome modal.
- Cowrywise-style Dashboard, Invest, Team, History, Withdraw, Deposit redesigns.
- 10 nature-themed investment plans seeded into Atlas.
- N+1 query fixes across user + admin list endpoints.
- Naturalis branding applied globally.

## Backlog (prioritized)
- P1: CSV export for Activity Logs (never started).
- P2: Email/SMS confirmations on deposit/withdrawal success.
- P2: Migrate payouts to APScheduler-driven logic.
- P2: Modularize large `routes_user.py` / `routes_admin.py`.
- P2: Home "packages" banner image (blocked on user preference).
- P3: Trim/no-overflow treatment for Admin Withdrawals & Investments tables.

## ⚠️ Critical notes
- Preview and Production currently share the SAME Atlas cluster + `naturalis` DB.
  Any DB mutation in Preview affects LIVE data. Avoid destructive DB ops.
- Test creds in `/app/memory/test_credentials.md`.
