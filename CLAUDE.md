# ScanDine — Build Instructions for Claude

> Read this file first, every session, before responding to anything.
> The full product vision lives in [`CONTEXT.md`](./CONTEXT.md) — this file is *how to build it*: the decisions already made, the design language, the data/security model, the build order, and the rules. When CONTEXT.md and this file disagree, **this file wins** (it reflects later decisions).

---

## 0. What ScanDine is (one paragraph)

A multi-tenant SaaS web app that digitalises **dine-in** ordering and billing for cafes/restaurants. A customer scans a QR sticker on their table → a PWA opens (no app install) → they browse the menu, customise, and order → the kitchen sees it live on a Kitchen Display System → status updates flow back to the customer's phone in real time → an auto-taxed (GST) bill closes the table. Zero hardware, works on any phone, free to start. Target: Tier-2/3 Indian cafes still on paper KOTs. Full spec, data model, feature tiers, business rules, and onboarding flow: **`CONTEXT.md`**.

---

## 1. Working mode (how to behave in this repo)

- **Hard accountability, simple explanations, ship before polish.** The founder has explicitly asked to be called out on avoidance, not cheered on. Soft answers are a failure here.
- **This is product #3 with no paying customer yet.** Two other finished products (Touchpe, Lynk) are already built and unsold; the real bottleneck is *sales*, not code. Keep that visible. Don't let "build more features" masquerade as progress. If a session drifts into polish/decoration while there's still no buyer, say so plainly.
- **Senior-dev autonomy on code.** Execute engineering decisions without per-change check-ins. Only stop to ask the founder on: product scope, money/spend, deploys, or anything customer-facing/irreversible.
- **Mobile-first is non-negotiable** for the customer PWA — it must be flawless at 375px width.
- Always handle **loading / error / empty** states in UI. No raw spinners-forever, no unhandled throws.

---

## 2. Current state of the repo (as of scaffold)

Already done:
- `create-next-app` scaffold: **Next.js 16.2.7, React 19.2.4, TypeScript (strict), Tailwind CSS v4, App Router, `src/` dir, `@/*` import alias, ESLint 9.** Package manager: **npm**.
- Project renamed to `scandine`; `package.json` name + root `metadata` set to ScanDine.

> Note: CONTEXT.md says "Next.js 14". We scaffolded **Next 16** instead — it's the current stable, App-Router patterns are identical, nothing in the spec is lost. Treat "Next 14" in CONTEXT.md as "current stable Next, App Router".

**Not done yet** — this is your work, in the order of §6:
- Design tokens / brand system (§4) — globals.css still has create-next-app defaults.
- Supabase: deps, local stack, schema, RLS, functions, seed, generated types.
- Any feature route (customer / KDS / admin / superadmin).
- PWA manifest, icons, service worker.
- `.env.local`.

---

## 3. Architecture — the one big decision (already made)

CONTEXT.md lists four separate apps (Customer PWA in Next, KDS in Vite, Admin in Next, plus a Node/Express backend on Railway). **We are NOT doing that.** For a solo operator that's four deploys, four auth surfaces, and a server to babysit.

**Decision: ONE Next.js app + Supabase as the entire backend.** No Express. No Railway. No Socket.io.

- Each "app" becomes a **route group** in the single Next project (§5).
- Supabase provides Postgres + Auth + Realtime + Storage + RLS — it replaces the Express/Railway server entirely.
- Writes that need privilege or atomicity go through **Next.js Route Handlers / Server Actions** (server-side, service-role) or **Postgres `SECURITY DEFINER` RPCs** — never a separate API server.
- One Vercel deploy. One codebase. One set of env vars.

This is more production-grade for one person, not less. Document any deviation from it before taking it.

### Tech stack (as-built / to-add)
| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS **v4** (CSS-first `@theme` tokens — there is no `tailwind.config.js`) |
| Backend / DB | Supabase (Postgres + Auth + Realtime + Storage + RLS) |
| Realtime | Supabase Realtime (`postgres_changes`) — subscribe per `restaurant_id` |
| Client state | Zustand (cart) + React Context where small; server state via Supabase |
| Validation | Zod on every input boundary (RPC args, server actions, forms) |
| Icons | lucide-react |
| Images | Supabase Storage first (it's already in the stack). Cloudinary only if we outgrow it — do NOT add Cloudinary in MVP. |
| QR | `qrcode` (PNG generation) |
| Payments (Tier 2) | Razorpay — not in MVP |
| Hosting | Vercel (one project) |

---

## 4. Design system — "alive, modern, colour-perfect"

The founder gave three UI references and wants it to *feel alive and modern, colour-wise perfect*. The brand colour is **orange `#E85D26`** (from CONTEXT.md §17, reinforced by the references).

### Reference language (what to emulate)
1. **Kans Resto** (desktop) → the **admin / POS** look: warm off-white canvas, white rounded cards, soft layered shadows, orange brand mark, **near-black pill CTAs**, **green numerals for prices/totals**, red for discounts. Breathable, lots of whitespace.
2. **Piringan** (mobile, Indonesian) → the **Customer PWA** look (closest match to our QR flow): orange-forward header, table-number + capacity cards, full-bleed food photography, item note field, **sticky bottom cart bar** with running total, orange primary CTAs.
3. **Burgenator** (mobile) → the **table-number carousel** picker and the **live order-status** screen ("Your order is ready to serve!" + check + item list).

Through-line: **warm + rounded + soft-shadowed + photography-forward + orange-primary + green-for-money.** Not flat/minimal, not heavy/dark. Light-mode first (KDS may go dark — handle inside its route group only).

### Colour tokens (implement in `src/app/globals.css` via Tailwind v4 `@theme`)

Brand orange (anchor = `#E85D26` at 500):
```
--color-brand-50:  #FFF4EF;
--color-brand-100: #FFE6D9;
--color-brand-200: #FCC9B0;
--color-brand-300: #F8A382;
--color-brand-400: #F17E53;
--color-brand-500: #E85D26;  /* PRIMARY */
--color-brand-600: #D24E1B;  /* hover */
--color-brand-700: #AE3F16;  /* pressed */
--color-brand-800: #8A3215;
--color-brand-900: #6F2A16;
--color-brand-950: #3B1208;
```
Semantic + neutrals (lean on Tailwind's warm `stone` scale for greys):
```
--color-canvas:  #F7F5F2;  /* app background (warm off-white) */
--color-surface: #FFFFFF;  /* cards */
--color-ink:     #1C1917;  /* primary text AND near-black CTAs (stone-900) */
--color-muted:   #78716C;  /* secondary text (stone-500) */
--color-hairline:#E7E5E4;  /* borders (stone-200) */

--color-success: #15A34A;  /* prices, totals, positive, READY status, veg dot */
--color-success-strong: #128A3E;
--color-danger:  #E5484D;  /* discounts, destructive, errors */
--color-veg:     #15A34A;  /* FSSAI veg square dot */
--color-nonveg:  #92400E;  /* FSSAI non-veg brown dot */
```
Order-status colour map (for the timeline + KDS chips):
`placed`→stone · `accepted`→#2563EB blue · `cooking`→#F59E0B amber · `ready`→#15A34A green · `served`→brand orange · `billed`→#7C3AED violet · `cleared`→stone-400.

### Shape, shadow, motion
```
--radius-card: 20px;  --radius-control: 14px;  --radius-pill: 9999px;
--shadow-card:   0 1px 2px rgba(17,12,8,.04), 0 6px 20px rgba(17,12,8,.06);
--shadow-pop:    0 2px 4px rgba(17,12,8,.05), 0 12px 32px rgba(17,12,8,.10);
--shadow-sticky: 0 -4px 24px rgba(17,12,8,.08);
```
**"Alive" toolkit** (use tastefully, GPU-friendly transforms/opacity only):
- `active:scale-95` press feedback on every button/stepper.
- Card hover lift (`-translate-y-0.5` + shadow-pop), 150–200ms ease-out.
- Skeleton shimmer for menu/order loading (never a bare spinner on the menu).
- Animated status timeline (each stage fills/pulses as it activates).
- Cart count "bump" on add; sticky cart bar slides up when first item added.
- Web Audio API beep on new KDS order.
Respect `prefers-reduced-motion`.

### Typography
- **Geist Sans** (already wired in `layout.tsx`) for UI — modern, clean, fits the references. Weights 400/500/600/700.
- Scale: display 30–36 / tight tracking; h1 24; h2 20; body 15–16; caption 13.
- Prices/quantities use `tabular-nums`; headings use `tracking-tight`.
- (Optional warmer alternative: Plus Jakarta Sans. Don't rabbit-hole on fonts — Geist ships and looks right.)

### First design tasks
1. Rewrite `src/app/globals.css`: `@import "tailwindcss";` then a `@theme { … }` block with the tokens above. **Remove** the `font-family: Arial…` body override (it's killing Geist) and the auto `prefers-color-scheme: dark` block (we're light-first). Set `body { background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); }`.
2. Add a `cn()` helper (`clsx` + `tailwind-merge`) at `src/lib/cn.ts`.
3. Build base primitives in `src/components/ui/`: `Button` (variants: primary=orange, dark=ink, ghost, outline; sizes; `active:scale-95`), `Card`, `Pill` (category filter, active=ink), `Badge`, `QtyStepper` (circular ±, matches refs), `VegDot`, `PriceTag` (green, tabular-nums), `Skeleton`, `EmptyState`.
4. Replace the boilerplate `src/app/page.tsx` with a minimal on-brand ScanDine landing/router that proves the tokens render.

---

## 5. Route structure (route groups in one Next app)

```
src/app/
  (marketing)/              → public landing (low priority; one page)
  order/[qr_token]/         → Customer PWA  (anon, no login)
    page.tsx                  menu browse + cart
    cart/                     cart review
    status/                   live order tracker (Realtime)
    bill/                     bill view + request-bill CTA
  kitchen/[restaurant_slug]/ → KDS (staff login; tablet-optimised, large targets)
  admin/                     → Restaurant owner (Supabase Auth, scoped to own restaurant)
    dashboard/ menu/ tables/ orders/ billing/ analytics/ settings/ staff/
  superadmin/               → YOU only (separate hardcoded-credential auth, NOT Supabase)
    login/ dashboard/ restaurants/ system/
  api/                      → Route Handlers for privileged/server-side ops
```
Customer routes are **anonymous** — identity is the `qr_token`, there is no customer login. Tenant URL convention: `/order/[qr_token]` resolves token → table → restaurant.

---

## 6. Build order (do it in this sequence)

Follows CONTEXT.md §16, adapted to the consolidated architecture. Each step should end **runnable and verified**.

1. **Design system + UI primitives** (§4) — so every later screen inherits the brand.
2. **Supabase foundation** — `npm i @supabase/supabase-js @supabase/ssr`; `npx supabase init`; write migrations (schema → RLS → functions), `seed.sql`, run `supabase start` (needs Docker Desktop — it's installed), generate types. (§7, §8)
3. **Super Admin portal** — create restaurant tenants, create admin accounts, manage tables, generate/download QR PNGs. This is the tool used to onboard every cafe. (CONTEXT.md §18)
4. **Customer PWA** — QR resolve → menu → customise → cart → place order → live status tracker. The heart of the product; make it beautiful (§4).
5. **Kitchen Display System** — live order queue, accept→cooking→ready, audio alert, per-item status.
6. **Admin Dashboard** — floor view, menu builder (with image upload), table/QR management, order history.
7. **Billing module** — auto-generate bill, GST (SGST 2.5% + CGST 2.5% on subtotal), payment record, **table clear** (frees the table; `qr_token` stays stable — it's a printed sticker).
8. **Google rating tab** — fire on status=SERVED, deep-link to the restaurant's Google review URL; second prompt at "Request Bill".
9. **Analytics** — read-only queries (daily revenue, top items, peak hours, AOV, table turnover).
10. **Tier 2** — only after pilot feedback (see CONTEXT.md §4).

---

## 7. Data model & DB conventions

Full table definitions: **CONTEXT.md §5**. Plus the Super Admin additions (CONTEXT.md §18): `restaurants` gains `is_active bool default true`, `onboarded_by text`, `onboarded_at timestamptz`, `pos_mode enum (standalone|pos_integrated)`; add `super_admin_sessions` audit table.

Add a **`profiles`** table not in CONTEXT.md but required for auth/RLS:
```
profiles
  id            uuid PK references auth.users(id)
  restaurant_id uuid FK → restaurants.id
  role          enum (admin | staff)
  full_name     text
  is_active     bool default true
  created_at    timestamptz default now()
```

Conventions:
- **snake_case** DB columns; **camelCase** TS variables. (Map at the data layer.)
- UUID PKs (`gen_random_uuid()`). All money as `decimal(10,2)`. All timestamps `timestamptz`, **stored UTC, displayed IST (UTC+5:30)**.
- `unit_price` on `order_items` is a **snapshot at order time** — bills compute from it, never from live `menu_items.price`.
- `updated_at` triggers on mutable tables.
- Enums as Postgres enum types (or `text` + check constraint — pick one and be consistent).
- Generate types with `supabase gen types typescript --local > src/lib/supabase/database.types.ts`. Do **not** hand-maintain types once the schema exists.

---

## 8. Multi-tenant + RLS security model (get this right — it's the crown jewel)

Every tenant is fully isolated. **RLS enabled on every table.** Helper SQL functions read the caller's tenant from `profiles`:
```
auth_restaurant_id()  -- SECURITY DEFINER STABLE: caller's profiles.restaurant_id
auth_role()           -- 'admin' | 'staff' | null
```
Policy design:
- **Sensitive tables** (`profiles`, `bills`, `ratings`, `super_admin_sessions`): no anon access; admin/staff only within their own `restaurant_id`, scoped by role.
- **Customer-facing low-sensitivity tables** (`restaurants` public subset, `tables`, `menu_categories`, `menu_items`, `orders`, `order_items`): **anon `SELECT` allowed** (this data is non-PII — menu + order status — and the customer PWA + Realtime need to read it). Admin/staff get writes within their restaurant.
- **No anonymous writes, ever.** All customer mutations go through `SECURITY DEFINER` RPCs that validate the `qr_token` and business rules internally:
  - `resolve_table(qr_token)` → restaurant + table + visible menu (or rejects invalid/cleared tokens).
  - `place_order(qr_token, items[])` → validates token, enforces *one active order per table*, *item is available*, snapshots `unit_price`, inserts `orders` + `order_items` atomically.
  - `add_items_to_order(order_id, items[])` → only while status < READY.
  - `request_bill(order_id)`.
- **Privileged server work** (super admin, bill view, anything needing the service role) runs in **Route Handlers / Server Actions** with `SUPABASE_SERVICE_ROLE_KEY` — **server-only, never shipped to the browser.**
- **Super Admin auth is separate from Supabase** (CONTEXT.md §18): hardcoded env credential → signed JWT with `role: super_admin`, checked in middleware. No Supabase user ever holds this role. Super admin uses the service-role client to bypass RLS, server-side only.
- **Realtime:** customer subscribes (anon) to `orders` filtered by `restaurant_id` — low-sensitivity status only. KDS/admin subscribe filtered by their `restaurant_id`.

Supabase client helpers to create in `src/lib/supabase/`:
- `client.ts` — browser anon client (`@supabase/ssr` `createBrowserClient`).
- `server.ts` — server anon client bound to cookies (`createServerClient`).
- `admin.ts` — **service-role** client, `import "server-only"` at top so it can never be bundled to the client.
- `middleware.ts` + root `src/middleware.ts` — session refresh + route protection (`/admin/*` needs admin, `/kitchen/*` needs staff, `/superadmin/*` needs the super-admin JWT).

---

## 9. Business rules (must encode — from CONTEXT.md §13)

- A table has **one active order** at a time (status ≠ CLEARED).
- Items can be added to an active order **before READY**.
- An item toggled unavailable hides from **new** orders but stays on existing active ones.
- Bill = sum of `order_items.unit_price × qty`; **SGST = subtotal × 0.025, CGST = subtotal × 0.025** (rates from `restaurants.tax_config`).
- Table is cleared **only after payment is confirmed** (admin action). The **`qr_token` stays STABLE** (it's a printed sticker — must work for every guest, forever). A stale phone just starts a fresh order on the now-empty table; the "one active order per table" rule keeps that clean. *(Earlier the token regenerated on clear — that broke printed stickers and was reverted in migration `005_stable_qr_token`.)*
- Rating prompt fires **max once per order**.
- Status machine: `placed → accepted → cooking → ready → served → billed → cleared`. Every transition is an `orders.status` UPDATE that Realtime broadcasts.

---

## 10. Environment variables (`.env.local`, gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only — never NEXT_PUBLIC_
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD_HASH=        # bcrypt
SUPER_ADMIN_SESSION_SECRET=       # long random
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
Commit a `.env.example` with these keys (no values). For local Supabase, the URL/keys come from `supabase start` output.

---

## 11. Commands

```
npm run dev        # Next dev (Turbopack) on http://localhost:3000
npm run build      # production build — must pass before any deploy
npm run lint
npx supabase start # local Postgres+Auth+Realtime+Storage (needs Docker Desktop running)
npx supabase db reset   # re-run migrations + seed
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

---

## 12. Repo hygiene

- This project is intentionally kept **outside** the founder's `solo-os/` workspace (their call).
- **Git/GitHub (UPDATED by founder, reverses the earlier rule):** push this project through the **PrimeDigitals account (`PrimeDigitals001`)** — NOT the personal `Udaya200428` account. The global git identity (`PrimeDigitals001` / `primedigitals.business@gmail.com`) and the `gh` CLI are already this account, so use them as-is.
- Private repo. Add a remote / push only with the founder's explicit say-so (they provide the PrimeDigitals remote URL).
- `.gitignore` already covers `.env*` (incl. `.env.local` — never commit it), `.next`, `node_modules`, and `supabase/.temp` / `.branches` / `.env`.

---

## 13. Definition of "production-grade" for this repo

Not "feature-complete" — **trustworthy**. Before any step counts as done:
- TypeScript strict passes, `npm run build` is green, no `any` smuggling.
- RLS is on and tested (a tenant cannot read another tenant's rows; anon cannot write).
- Every screen handles loading / error / empty.
- Money math is exact and tested (GST, totals, snapshots).
- Inputs validated with Zod at the boundary.
- Customer PWA verified at 375px.

When you finish a session, leave the repo runnable and note what's next at the bottom of this file (a short "## Progress log" section is fine).

---

## Progress log

### Session 1 — Design system + UI primitives (build-order step 1) ✅
- **`src/app/globals.css`** rewritten: `@theme` token block (brand 50–950, warm neutrals, money/semantic colours, order-status colour map, radii, layered shadows, motion keyframes). Removed the Arial override + auto dark-mode block. Added `prefers-reduced-motion` guard, `:focus-visible` brand ring, `.tnum`, and a `skeleton` shimmer utility.
- **Brand decision:** kept orange `#E85D26` (it's a deliberate, reference-anchored choice, not a default) — refined execution/accessibility instead of changing the hue.
- **`src/lib/`**: `cn.ts` (clsx + tailwind-merge), `format.ts` (`formatINR`, INR grouping), `orderStatus.ts` (status enum + labels + ordering, single source of truth).
- **`src/components/ui/`** primitives: `Button` (+ exported `buttonVariants` so links don't nest `<button>` in `<a>`), `Card`, `Pill`, `Badge`, `VegDot` (FSSAI), `PriceTag` (green, tabular), `QtyStepper`, `Skeleton` + `MenuItemSkeleton`, `EmptyState`, `StatusChip`. Barrel at `index.ts`.
- **`src/app/page.tsx`**: on-brand mobile-first landing with a live interactive demo (`src/components/landing/HeroDemo.tsx`), order-lifecycle strip, and portal links to the four route groups.
- **`src/app/layout.tsx`**: added `viewport` (theme-color `#E85D26`, `viewportFit: cover`, zoom left enabled).
- **Deps added:** `clsx`, `tailwind-merge`, `lucide-react`.
- **Verified:** `npm run build` green, `npm run lint` clean, dev server `GET / 200` with no runtime errors.

### Session 2 — Supabase foundation (build-order step 2) ✅ live & verified
- **Decision: HOSTED Supabase (free tier), not local Docker.** Founder is new to Supabase and the bottleneck is sales — hosted is demoable from a café owner's phone. Migrations stay as version-controlled SQL (not dashboard click-ops), so it's still production-grade. No Docker dependency (we hand-write migrations + `db push`, no `db diff`).
- **Deps:** `@supabase/supabase-js`, `@supabase/ssr`, `supabase` (CLI devDep, v2.105). `npx supabase init` done → `supabase/config.toml`.
- **Migrations** (`supabase/migrations/`): `…120000_schema.sql` (enums, 10 tables, FKs, checks, partial unique index `orders_one_active_per_table`, `updated_at` triggers, `new_qr_token()`), `…120100_rls.sql` (RLS on every table, `auth_restaurant_id()`/`auth_role()` SECURITY DEFINER helpers, per-table policies), `…120200_functions.sql` (SECURITY DEFINER RPCs: `resolve_table`, `place_order`, `add_items_to_order`, `request_bill`, `get_bill`, `generate_bill`, `clear_table`, internal `_insert_order_items`; EXECUTE revoked from PUBLIC then granted explicitly), `…120300_realtime.sql` (publication + replica identity).
- **Seed** (`supabase/seed.sql`): demo tenant "Friends & Fries Café", 6 tables (**T1 qr_token = `demo`** → `/order/demo`), 4 categories, 12 items with addons/variants. Idempotent (deletes tenant by slug first).
- **Client helpers** (`src/lib/supabase/`): `client.ts` (browser anon), `server.ts` (cookie-bound anon), `admin.ts` (service-role, `import "server-only"`), `middleware.ts` (`updateSession`, env-guarded). Root **`src/proxy.ts`** (Next 16 renamed `middleware`→`proxy`). `database.types.ts` is a placeholder (`Database = any`) until generated.
- **Env:** `.env.example` committed (`!.env.example` added to `.gitignore` + supabase temp dirs). `.env.local` NOT yet created — needs the founder's keys.
- **Security choices worth noting:** `tables` is NOT anon-readable (qr_token is a capability secret — deviates from CLAUDE.md §8's "anon SELECT on tables" on purpose); `bills`/`profiles`/`super_admin_sessions` no anon; customers reach everything via the token-validating RPCs. GST computed on gross subtotal, discount subtracted from total (per §9).
- **Verified:** `npm run build` green, `npm run lint` clean. SQL not yet executed (no DB) — will validate at `db push`.

- **Live project:** `vbprbnzuggayymgwlrtl` (Mumbai, free tier). Setup applied via SQL Editor (paste `supabase/setup_hosted.sql`), NOT CLI push — so the remote has no `schema_migrations` history; reconcile with `supabase migration repair` before any future `db push`. New API key format in use (`sb_publishable_…` as anon, `sb_secret_…` as service-role). `.env.local` written (gitignored).
- **Verified** by `scripts/verify-supabase.mjs` (10/10 over REST/RPC): anon loads menu + places order via RPC with server-side price snapshot; anon blocked from tables/bills/profiles + direct writes; one-active-order rule; **tenant isolation** (café-A admin can't see café-B rows). Script self-cleans its throwaway data.
- **Deferred:** real generated DB types — still the `Database = any` placeholder. Generate when ready via `supabase gen types typescript --db-url "<pooler-conn-string>"` (needs DB password) or `--linked` (needs a PAT). Not blocking.

### Session 3 — Super Admin portal (build-order step 3) ✅ built & smoke-tested
- **Deps:** `qrcode`, `bcryptjs`, `jose`, `jszip`, `zod` (+ `@types/qrcode`, `@types/bcryptjs`).
- **Auth (separate from Supabase):** `src/lib/superadmin/session.ts` (jose HS256 sign/verify, edge-safe — used by proxy), `auth.ts` (`server-only` bcrypt `verifyCredentials` + `requireSuperAdmin`), httpOnly cookie `sd_superadmin`, 8h TTL. Creds in `.env.local`: `SUPER_ADMIN_EMAIL=primedigitals.business@gmail.com`, password `12345678` (bcrypt-hashed). **⚠️ weak password — must change before any public deploy.**
- **`.env` gotcha (important):** Next's dotenv-expand corrupts `$` in values. Bcrypt hashes MUST be written with each `$` escaped as `\$` in `.env.local`/`.env.example`. Verified the hash loads intact + bcrypt matches.
- **Proxy** (`src/proxy.ts`) now guards `/superadmin/*` (redirect→login) and `/api/superadmin/*` (401) via the JWT cookie; everything else still runs Supabase `updateSession`.
- **Routes:** `/superadmin/login` (+ `LoginForm`), `(panel)/` group with guarded `layout` + `PanelNav`, `dashboard` (stats + recent), `restaurants` (list), `restaurants/new` (create form), `restaurants/[id]` (suspend toggle, tables grid w/ per-table QR download + delete + AddTablesForm, owner-login list + CreateAdminForm showing one-time temp password). Service-role reads in `lib/superadmin/data.ts`; server actions in `lib/superadmin/actions.ts` (Zod-validated, each calls `requireSuperAdmin`).
- **QR:** `GET /api/superadmin/qr/[token]` (PNG) and `/api/superadmin/qr-zip/[restaurantId]` (JSZip bundle), encoding `${NEXT_PUBLIC_APP_URL}/order/<token>`.
- **New UI primitives:** `Input`, `Textarea`, `Select`, `Field` (in `components/ui`).
- **Verified:** `npm run build` green, `npm run lint` clean, `scripts/verify-superadmin.mjs` 6/6 (guard, login render, QR 401-without/200-with, dashboard lists demo café, ZIP). No server errors in dev log.
- **Perf pass (founder asked for "instant"):** added `loading.tsx` skeletons for dashboard/restaurants/[id] (instant paint + prefetch target); consolidated dashboard into one parallel batch (`getDashboardData`); `getRestaurant` now resolves owner emails via per-member `getUserById` instead of `listUsers()` (scales as tenants grow). **Measured prod (warm, live DB):** dashboard 89ms, restaurants 85ms, detail 133ms, QR 34ms (cold first-request pays one-time Supabase connection setup). Dev mode is inherently slower (on-demand compile, no prefetch) — always judge speed from `npm run build && npm start`.

### Session 4 — Customer PWA (build-order step 4) ✅ built & smoke-tested
- **Deps:** `zustand` (cart). **Cart store** `src/lib/cart/store.ts` (persist→localStorage, SSR-guarded no-op storage on server, `ensureToken` resets cart on table change, line key = item|variant|addons|note). **Types** `src/lib/customer/types.ts` (resolve_table shapes).
- **Routes** under `src/app/order/[qr_token]/`: `layout` (max-w-md phone column, noindex), `loading` (skeleton), `page` (server `resolve_table` → `MenuScreen`; invalid token → friendly EmptyState). `MenuScreen` (sticky category filter, item cards w/ veg dot + price, quick-add for plain items / `ItemSheet` for items with variants/add-ons, sliding cart bar w/ bump). `ItemSheet` (variant radios, add-on toggles, note, qty; unit price = base+variant+addons matching server). `cart/` (CartScreen: lines, GST preview, table note, `place_order` or `add_items_to_order` if active, → status). `status/` (StatusScreen: **Realtime** channel on orders+order_items by id → refetch resolve_table; animated timeline, per-item status, request-bill, Google rating sheet once on served/billed, cleared→thank-you). `bill/` (BillScreen: `get_bill` + realtime on bills, itemised, GST, payment status, estimate+request when no bill).
- **Phone testing wired:** dev server binds LAN; `NEXT_PUBLIC_APP_URL=http://192.168.1.6:3000` so QR codes are phone-scannable. Founder confirmed landing + superadmin load on phone. **Firewall:** founder must run `New-NetFirewallRule ... -LocalPort 3000` (admin) once.
- **Demo helper:** `scripts/advance-order.mjs` walks the demo order placed→served (until KDS exists) so realtime updates are visible on the phone.
- **Verified:** build green, lint clean, `scripts/verify-customer.mjs` 7/7 (menu renders, bad token, no-order status, place_order, live tracker, served reflects, bill renders). No dev errors. Order cleaned up.

### Session 4b — Customer PWA fixes (cart interactivity + responsive) ✅ verified in a real browser
- **Cart was dead (no add/cart) bug:** zustand `persist` rehydrated synchronously during the first client render → hydration mismatch broke ALL interactivity, and the `hydrated` flag was set by a bare mutation (no re-render). Fix: `skipHydration: true` + `<CartHydrator/>` (in order layout) rehydrates after mount; `setHydrated` action via `set()`; resilient storage wrapper (try/catch so private-mode/blocked localStorage can't break the cart).
- **Responsive (was phone-width-only on desktop — founder rightly called out):** order `layout` no longer caps width; each screen sets its own — `MenuScreen` `max-w-md md:max-w-2xl lg:max-w-5xl` with **`lg:grid-cols-2`** menu; cart/status/bill `max-w-md md:max-w-2xl`; sheet `md:max-w-lg`; responsive `px-4 md:px-6 lg:px-8`. Fixed bars match each screen's width.
- **Testing lesson (founder feedback "smoke tests must actually work"):** added **`scripts/verify-customer-ui.mjs`** — real headless Chromium (Playwright) that *clicks* Add/cart/sheet at BOTH phone (390) and desktop (1280) viewports and asserts the desktop layout is multi-column. **12/12 pass, 0 console errors.** Server-only smoke tests (verify-customer.mjs) are NOT enough for client interactivity. `playwright` added as devDep + chromium installed.
- Cleared a leftover active order stuck on the demo table (from manual testing) that was making the cart show "Add to order".

### Session 4c — Phone "not working" diagnosis + desktop polish ✅
- **Phone failure was NOT a code bug.** Proved the customer flow works in **both Chromium AND WebKit (Safari/iOS engine)** at a 390px viewport (12/12 each) via `scripts/verify-customer-ui.mjs` (now `ENGINE=webkit` capable). Root cause = **`npm run dev` flakiness over Wi-Fi to a real device** (huge unminified multi-chunk bundles + HMR socket; a dropped chunk leaves the page non-interactive — works fine on localhost). **Fix = serve a production build** (`next build` + `next start -H 0.0.0.0`), verified reachable on the LAN + 12/12 in both engines. **Lesson: test real-device behaviour against a production build, not dev.**
- **Desktop responsiveness:** founder's screenshots showed the status page timeline cramped-left in a wide column. Reworked status into a **two-pane desktop layout** (`lg:grid-cols-2`: timeline left, items right; `lg:max-w-4xl`), stacked on mobile. Used Playwright screenshots (`scripts/shot.mjs`) to verify. Menu already `lg:grid-cols-2`.
- **Current run state:** PRODUCTION server on `:3000` bound to `0.0.0.0` (task) → founder tests phone at `http://192.168.1.6:3000/order/demo`. Code changes now need a rebuild (not hot-reload).

### Session 4d — Customer nav (tab bar) + desktop two-pane ✅ verified both engines
- **Bottom tab bar** `OrderTabBar` (Menu · Order · Bill), persistent via the order `layout` (now async, reads `qr_token`) — fixes the tracking-screen dead-end. Plus a "Back to menu" link on the status hero. Action bars lifted to `bottom-16` to sit above the tab bar; content padding bumped.
- **Desktop two-pane menu:** `MenuScreen` is now `lg:flex` — menu left (`<main>`), sticky **`CartPanel`** sidebar right (`lg:w-80`, qty steppers + subtotal + "Review & order"); the mobile cart bar is `lg:hidden`. Menu grid is engine-agnostic `repeat(auto-fill,minmax(22rem,1fr))` (fixed a WebKit-vs-Chromium flip at the `xl` boundary). Status page two-pane retained.
- **Verified:** `scripts/verify-customer-ui.mjs` extended (tab-bar nav check; cart trigger differs by layout — "View cart" mobile vs "Review & order" desktop sidebar; desktop viewport 1440). **14/14 in BOTH Chromium AND WebKit.** Build green, lint clean. Production server on `:3000`/LAN.
- **Open Q for founder:** tabs implemented as Menu/Order/Bill (the real screens). Founder recalled "feedback, home, orders, catalog" — Home/Catalog≈Menu, Orders≈Order, Feedback≈the Google-rating prompt (contextual, fires on served). Confirm desired tabs/labels.

### Session 5 — Kitchen Display System + Feedback tab (build-order step 5) ✅ built & e2e-tested
- **Feedback tab** added to `OrderTabBar` (now Menu·Order·Bill·Feedback). `order/[qr_token]/feedback` → `FeedbackScreen`: star rating, ≥4★ → "Rate us on Google" deep-link, ≤3★ → "tell our staff" (no DB; rating storage RPC deferred — would need a migration the founder runs).
- **KDS** at `/kitchen/[restaurant_slug]`:
  - **Auth = Supabase (staff).** `updateSession` now returns `{response, user}`; `proxy` guards `/kitchen/*` (redirect → `.../login`). `login/` (KitchenLoginForm, browser `signInWithPassword`). Board `page.tsx` (server: getUser → profile.restaurant_id → restaurant + initial orders via embeds; RLS-scoped).
  - **`KDSBoard`** (client): Realtime on orders (restaurant filter) + order_items → refetch; **Web Audio beep** on new `placed` order (sound toggle unlocks AudioContext via gesture); tickets (table #, time-ago + urgent >10m, per-item tappable status cycle, table note); big action buttons placed→accept→cooking→ready→served (also mirrors item status); served tickets dimmed; logout. Light theme, tablet grid 1/2/3-col.
- **Demo staff login** (run `node scripts/create-demo-staff.mjs`, idempotent): **`/kitchen/friends-fries-cafe`**, `kitchen@scandine.demo` / `kitchen123` (role=staff, demo restaurant).
- **Verified:** build green, lint clean. `scripts/verify-kitchen.mjs` 8/8 — staff signs in, ticket appears, accept→cooking→ready→served each reflected on the **customer's live status page** (full loop!). Customer flow still 14/14 in Chromium + WebKit; feedback page renders.
- Production server (`:3000` / LAN) running the new build.

### Session 6 — Admin Dashboard (build-order step 6) ✅ built & e2e-tested
- **Auth:** Supabase (role=admin). `proxy` guards `/admin/*` (→ `/admin/login`); `admin/(app)/layout` re-checks `role==='admin'` (staff get a "use the KDS" screen). `admin/login` (AdminLoginForm). `lib/admin/context.ts` (`getAdminContext` → user+profile+restaurant, RLS-scoped). Server actions in `lib/admin/actions.ts` (cookie client → RLS/RPCs enforce tenant+role); `ActionState` in `lib/admin/types.ts`; reads in `lib/admin/data.ts`.
- **Pages** (`admin/(app)/`, nav `AdminNav` = Floor·Billing·Menu·Settings):
  - **Floor/dashboard** — stat cards (occupied, active orders, orders today, revenue today) + table tiles w/ live StatusChip; tap occupied → Billing.
  - **Billing (the gap)** — per open order: GST preview → `generate_bill` (+discount) → "mark paid" cash/upi/card (updates `bills`) → `clear_table` (regenerates qr_token). `BillingCard` client component.
  - **Menu builder** — `MenuManager`: add/edit item (controlled form, lint-safe no modal-close), sold-out toggle, delete (confirm), add category.
  - **Settings** — address, GST number, SGST/CGST %, Google review URL (`updateSettingsAction`).
- **Demo owner login** (`node scripts/create-demo-admin.mjs`): **`/admin`**, `admin@scandine.demo` / `admin123`.
- **Verified:** build green, lint clean. `verify-admin.mjs` 11/11 (login→floor→generate bill→**GST math ₹80→₹2+₹2**→pay→clear→**qr_token regenerated**→empty). `verify-admin-menu.mjs` 5/5 (availability toggle persists, settings fields). **No regressions: customer 14/14, kitchen 8/8.**
- **All four surfaces now work end-to-end.** A café can operate: customer orders → kitchen cooks → owner bills/clears/manages menu.

**Deferred (not blocking a pilot):** admin table/QR management (super-admin does onboarding), order history page, staff management page, analytics, menu photo upload (Supabase Storage), customer rating storage RPC. Step 7+ when pilot feedback warrants.

### Session 7 — Unified login, admin mobile nav, GitHub push ✅
- **Common `/login`** (`src/app/login/`): one form → `unifiedLogin` server action routes by identity (operator email → super admin JWT; Supabase `role=admin` → `/admin`; `role=staff` → that café's `/kitchen/[slug]`). Deleted the 3 per-role login routes; proxy + all layouts/logouts now redirect to `/login`. Verified `verify-login.mjs` 4/4 (3 roles + bad password).
- **Admin mobile nav** is now an **animated hamburger** (`AdminTopBar`, replaces the scroll bar `AdminNav`): morphing burger→X, slide-down drawer, closes on nav. Inline pills on `sm+`. `verify-admin-nav.mjs` 5/5.
- **Repo:** git initialised (identity = PrimeDigitals per §12 reversal), committed, pushed to **`https://github.com/PrimeDigitals001/scandine.git`** `main`. `.env.local` confirmed git-ignored (no secrets pushed).
- **No regressions:** login 4/4, customer 14/14, kitchen 8/8, admin 11/11, menu 5/5, nav 5/5.

### Session 8 — Deployed to Vercel + full credential lifecycle ✅
- **DEPLOYED:** live at **https://scandine-demo.vercel.app** (Vercel, auto-deploys from `main`). Env vars set in Vercel incl. the **strong** super-admin password (`SD-fqY8GeDb-09c0`; `12345678` is local-only). Verified against the live URL: customer 14/14, login 4/4 with strong password, weak password rejected. **Still pending:** set `NEXT_PUBLIC_APP_URL=https://scandine-demo.vercel.app` in Vercel + redeploy so QR codes encode the live URL (until then QRs fall back to localhost; direct URLs work).
- **Credential lifecycle (was the missing half):**
  - **Owner → Staff page** (`/admin/staff`, `StaffManager`): create kitchen logins (one-time temp password shown), reset a staff password, enable/disable, remove. Actions verify admin via `getAdminContext` then use the **service role** scoped to the caller's restaurant. Nav gained "Staff".
  - **Owner self-service:** "Change your password" card in `/admin/settings` (`changeOwnPasswordAction` → `supabase.auth.updateUser`).
  - **Super admin → reset owner password:** `AdminsList` on the restaurant detail (`resetAdminPasswordAction`, one-time temp password).
  - **`is_active` now enforced at login** (`unifiedLogin` rejects disabled accounts).
- **Verified:** build green, lint clean, `verify-admin-staff.mjs` 7/7 (create→login→reset→new-works/old-fails→disabled-blocked→settings). No regressions (login/nav/admin/customer all green). NOTE: the shared Supabase means live testers' data (e.g. a stray table T7 order) shows up locally — clear stray non-cleared orders if a `.first()`-based test trips.

### Session 9 — Owner self-serve tables (offload super-admin) ✅
- Founder wanted less concentrated in super admin. Added **owner table management** (`/admin/tables`, `TablesManager`): add tables (count+prefix), download per-table QR PNG + bulk ZIP, delete. Uses the cookie client + `tables` RLS admin policies (no service role needed). Nav gained "Tables" (now Floor·Billing·Menu·Tables·Staff·Settings).
- **Owner QR endpoints:** `GET /api/admin/qr/[token]` + `/api/admin/qr-zip` — RLS-scoped (the `tables` lookup only succeeds for the caller's restaurant, so a token outside their café → 404). Not proxy-guarded (RLS is the gate).
- Division of labour now: **super admin = onboard tenant + first owner account + suspend + reset owner password**; **owner = everything day-to-day** (menu, tables, staff, billing, settings, own password). Super admin's restaurant-detail table tools stay (still handy at onboarding).
- **Verified:** build green, lint clean, `verify-admin-tables.mjs` 6/6 (add→QR PNG→bulk ZIP→unknown-token-404→delete). No regressions (nav 5/5, login 4/4).

### Session 10 — Detailing pass + menu photos (founder punch-list) ✅
Founder reviewed and flagged a batch of polish + two real gaps:
- **Eye toggle on passwords:** new `PasswordInput` primitive (`components/ui/Input.tsx`) with show/hide eye; used on `/login` and both manual-password forms. ⚠️ its toggle button is labelled `Show`/`Hide` (NOT "Show password") on purpose — Playwright `getByLabel("Password")` does a substring match and would otherwise grab the eye button (broke every login-based test). Keep it that way.
- **Manual passwords:** owner can type a kitchen-staff password (or leave blank to auto-generate) on `/admin/staff`; super admin can do the same when creating an owner login. Optional `password` added to `staffSchema` + `adminAccountSchema`; `ActionState.manualPassword` drives the cred-box wording.
- **Menu item photos (Supabase Storage):** public bucket `menu-images` created via `scripts/setup-storage.mjs` (idempotent — already run on live). `saveItemAction` uploads via the **service role** (after `requireAdmin`) to `menu-images/<restaurantId>/<rand>.<ext>`, stores the public URL on `menu_items.image_url` (only overwrites when a new file is sent). Builder (`MenuManager`) gained a file picker + live preview + row thumbnails; customer `MenuScreen` renders the photo (falls back to the letter-gradient). Plain `<img>` + `eslint-disable @next/next/no-img-element` (deliberate — avoids Vercel image-optimization usage).
- **Landing:** removed the public **Super Admin** portal card (now "Three surfaces, one app", `sm:grid-cols-3`). `/superadmin` still reachable by URL, just unlisted.
- **Admin nav:** inline pills now switch to the hamburger below **`lg`** (was `sm`) — at `sm`–`md` the 6 links overflowed and a button clipped.
- **Tables tab mobile:** grouped the QR-download + delete buttons in a `shrink-0` cluster and let the meta row wrap, so nothing clips at 375px.
- **Real bug fixed:** `itemSchema.category_id` was `z.string().uuid()`, but seeded category ids (`22222222-0000-…`) aren't strict RFC-4122 UUIDs → **zod 4 rejected them, so editing any seeded item silently failed** with "Pick a category." Relaxed to `z.string().min(1)` (the `menu_items→menu_categories` FK is the real guard).
- **Verified:** build green, lint clean. login 4/4, nav 5/5, **staff 9/9** (incl. manual password), **image 5/5** (upload→Storage→public URL→customer renders), tables 6/6, menu 5/5, customer-ui both engines. New scripts: `setup-storage.mjs`, `verify-admin-image.mjs`.

### Session 11 — Stable QR token, live floor, staff reset editor, per-table seats ✅
- **Stable QR token (the big one):** founder spotted that `clear_table` regenerated `qr_token` on every clear — which **breaks a printed sticker**. Reverted: `clear_table` now frees the table but keeps the token constant (migration `005_stable_qr_token`). One sticker per table, forever. Security ("old session dies") is handled by the cleared-order/empty-table reset instead.
- **Live owner floor / "request bill" alert:** `AdminLive` (mounted in the admin `(app)/layout`) subscribes to this restaurant's **`orders`** stream (anon-readable → realtime is reliable, unlike `tables`/`bills`) and `router.refresh()`es the Floor/Billing on any change; pops a dismissible "a table requested the bill" toast. `request_bill` now stamps **`orders.bill_requested_at`** (new column) so that signal rides the reliable `orders` stream. Verified: floor goes 0→1 active orders live with no reload (`verify-admin-live.mjs` 3/3).
- **Staff password reset is now a chooser, not an instant overwrite:** clicking Reset opens an inline `PasswordInput` (eye toggle) to type/see the new password; blank still auto-generates. `resetStaffPasswordAction` takes an optional typed password. `verify-admin-staff.mjs` 9/9 (now resets to a chosen password and confirms it signs in).
- **Per-table seat capacity:** "Add tables" has a "Seats each" field; each table row has an inline seats dropdown that auto-saves (`updateTableCapacityAction`). No more every-table-is-2. Plus mobile fixes: nav drawer no longer clips Sign out; table rows use a compact "Copy customer link" button so nothing overflows at 371px.
- **⚠️ Migration 005 must be applied** (founder runs the SQL in the Supabase SQL editor): it does both the stable-token fix AND adds `bill_requested_at` + updates `request_bill`. Until applied, `verify-admin.mjs`'s "qr_token stays stable" assertion stays red and the bill-request toast won't fire (the live floor refresh still works).

### Session 12 — Printable bill + open/closed toggle ✅
- **Printable bill:** once a bill is generated, a **Print bill** button on `BillingCard` renders a self-contained **80mm thermal-style receipt** (café name, GSTIN, IST timestamp, itemised lines, GST, discount, TOTAL, payment method, footer) into a hidden iframe and opens the OS print dialog — works with any printer the device sees, incl. thermal. `verify-admin-print.mjs` 5/5. Direct ESC/POS auto-cut printing deferred to a pilot with a known printer.
- **Open/closed toggle (`restaurants.is_accepting_orders`, migration 006):** QR links are permanent stickers, so an off-hours scan could drop an order. Added an owner **Open · taking orders / Closed · paused** switch on the Floor (`OpenToggle` + `setAcceptingOrdersAction`). **Enforced server-side:** `place_order` + `add_items_to_order` reject while closed; `resolve_table` returns the flag so the customer PWA shows a "Not taking orders" notice and hides Add buttons + cart. `verify-admin-open.mjs` 8/8 (close → customer blocked + sees closed → server rejects → reopen → orders work). **Sequencing note:** the column must exist before the code that selects it deploys — so migration 006 was applied BEFORE pushing (unlike 005, which the code tolerated).
- **Migrations 005 + 006 are APPLIED to the live DB** (founder ran them). `getAdminContext` now selects `is_accepting_orders` (would 400 without the column).
- No regressions: customer-ui 14/14, admin billing 11/11, floor 4/4, staff 9/9.

### Session 13 — Per-visit table session lock (security: past-link can't touch a new guest) ✅
- **The hole (founder found it):** the qr_token is a permanent sticker, so a past guest's old `/order/<token>` link still worked on the table — they could see/add to the NEXT guest's order. **Fix = decouple identity from session:** keep qr_token permanent, add a per-visit **`tables.session_token`** (migration 007) that rotates on each claim and is released on `clear_table`. To view/modify an order you need the *current* session token.
  - **`resolve_table(qr, session?)`** now CLAIMS a fresh session for a free table (returns it), authorises a matching token, returns `{locked:true}` to anyone else, and auto-expires an abandoned pre-order claim after 45 min. **place_order/add_items/request_bill/get_bill** all require the session token (`_check_session`). **clear_table** nulls it.
  - **Friends join** via an **"Invite table"** share link (`/order/<token>?s=<session>`) — same session, multiple phones.
  - **Owner Floor:** a claimed-but-no-order table shows **"In use · no order yet" + Free table** (`freeTableAction`) for abandoned claims.
- **Customer flow reworked:** the menu now **resolves client-side** (`MenuLoader`) so it can pass the session token + show a **"Table in use"** screen. Session token lives in **localStorage + a cookie keyed by qr_token** (`lib/customer/session.ts`) so the server-rendered status/bill/cart pages can read it. **⚠️ Server pages resolve ONLY with a session cookie** — resolving without one would CLAIM a session server-side and lock the table (a real bug; bots/cold-loads). StatusScreen clears the session on the cleared state so a stale cookie can't re-claim.
- **⚠️ Migration 007 is APPLIED** (founder ran it). It DROPS the old RPC arities and recreates them with the trailing `p_session_token` — so the deploy is coupled (old code breaks the moment the SQL runs; push immediately).
- **Verified live:** `verify-customer-session.mjs` 12/12 (stranger locked out, friend joins via share token, **past guest's old token is dead after clear**, free-table releases). No regressions: customer-ui 14/14, admin 11/11, kitchen 8/8, open 8/8, live 4/4, print 5/5. RPC tests now thread the session (resolve→capture `session_token`→pass to place_order).
- **Deferred:** `setup_hosted.sql` not re-synced to the 005–007 RPCs (migrations are canonical; fresh-install-from-snapshot would need them layered). Old smokes `verify-customer.mjs`/`verify-supabase.mjs` need the same session-threading if re-run.

### Session 14 — AR "see the dish on your table": explored, then SHELVED & reverted ⏹️
- **What happened:** built the full app side (customer `ARViewer` via `<model-viewer>` + native AR, owner `.glb`/`.usdz` upload in `MenuManager`, `menu_items.model_glb_url`/`model_usdz_url` migration, `menu-models` bucket, a Meshy AI pipeline + `verify-ar.mjs`). Then hit the real wall on **sourcing the 3D models**: every *free* image→3D tool (Meshy, Tripo, HF Spaces) paywalls the **export**, and a **local generator** (TripoSR, the only model that fits the founder's 6 GB RTX 4050 Laptop) produces a **flat relief for food** — tested on a burger, a salad, and a well-angled dahi-vada; all collapsed to a coin/disc from the side. Good walk-around food models need a ~16 GB desktop GPU (TRELLIS/Hunyuan3D) or paid cloud, or a real **phone scan** (Polycam/RealityScan — the genuinely-free path, multi-angle, not single-photo).
- **Founder decision:** not worth keeping a half-understood feature they won't use yet → **remove the whole AR/VR thing for now.** All AR code reverted (it was uncommitted on top of `0b829ed`): `ARViewer.tsx`, the `MenuManager`/`MenuScreen`/`saveItemAction`/`data.ts`/`types.ts` AR additions, migration 008, `generate-3d-models.mjs`, `verify-ar.mjs`, the second bucket in `setup-storage.mjs` — all gone. The local TripoSR install (a self-contained `C:\Users\krish\scandine-3d`, ~6.8 GB) was **deleted cleanly** + pip cache purged. **Migration 008 was never applied to live**, so the DB is untouched.
- **KEPT (it's a real fix, not AR):** `next.config.ts` `serverActions.bodySizeLimit: "8mb"` — the default 1 MB would reject a real ≤5 MB dish *photo* (the existing image-upload feature). Reframed for photos only.
- **Leftover note:** the empty public `menu-models` Storage bucket may still exist on live (harmless; created during the experiment). Remove it from the Supabase dashboard if desired.
- **Lesson (so we don't re-try the dead end):** single-photo→3D for *food* is not viable for free on a 6 GB laptop GPU. If AR is ever revisited, the app side was sound — re-introduce it then, and source models via a **phone scan** (free, good) or **paid Meshy credits**, not free single-photo AI.

**Next — founder-driven:** the app is back to the clean post-session-13 state (all four surfaces working end-to-end). Real bottleneck remains **sales — get the working app in front of a café.** Infra still pending: set `NEXT_PUBLIC_APP_URL` in Vercel + redeploy + regenerate QRs. Deferred features (order history, analytics, staff self password-change, in-app rating storage, direct ESC/POS printing) await pilot feedback. AR is parked until the founder wants it and has a model-sourcing path.

### Session 15 — FOOD COURT mode (additive; single-café untouched) — Phase 0 + Phase 1 customer flow ✅
- **Idea (founder):** sell to a whole **food court** (one location, many independent **stores**), not just one café. Scan a court QR → see ALL stores → tap one → the normal order flow, but you can order from **several stores at once** — each a **separate order, separate bill, routed to that store's own kitchen**. Both **counter-pickup (token number)** and **shared-table** fulfillment. Each store bills separately (reuses today's billing). Court ownership/admin **undecided** → super admin sets courts up for now; a "food-court operator" login is **deferred**. **Hard rule: the single-café system stays exactly as-is, in parallel.** Plan: `C:\Users\krish\.claude\plans\whimsical-gathering-charm.md`.
- **Phase 0 — schema (APPLIED to live):** migrations `…20260610120000_food_court.sql` (`food_courts`; nullable `restaurants.food_court_id`; `food_court_tables` access points w/ `mode` enum shared_table|pickup; `orders` gains nullable `table_id` + `food_court_id`/`food_court_table_id`/`pickup_number`/`fc_session_token` + `orders_anchor_chk`; **one-active-order index swapped** to 2a single-café `where table_id is not null` + 2b `(food_court_table_id, restaurant_id)`), `…120200_food_court_rls.sql`. **⚠️ live DB was missing `new_qr_token()`/`set_updated_at()`** (bootstrapped from the old combined script) — the migration now defines them (idempotent). **Founder ran SQL into the WRONG/empty Supabase project first** (cascade of "does not exist") — real project is `vbprbnzuggayymgwlrtl`; fixed via the direct `…/project/vbprbnzuggayymgwlrtl/sql/new` link.
- **Phase 1 RPCs (APPLIED + verified):** `…120100_food_court_functions.sql` — `resolve_food_court`, `resolve_food_court_store`, `place_food_court_order`, `add_items_to_fc_order`, `request_fc_bill`, `get_fc_bill`, `clear_fc_order` (+ `_check_fc_session`/`_check_fc_order_session`). **All NEW names — existing RPCs untouched; reuses `_insert_order_items`.** Both pickup + shared modes written so no Phase-2 SQL trip. Order `restaurant_id` = the store → KDS + `generate_bill` + admin billing work with ZERO change; pickup orders clear via the normal `clear_table` (null table_id = harmless no-op).
- **Phase 1 customer flow (built, NOT touching single-café):** new `src/app/court/[court_token]/` (store list → `[store_slug]` menu → cart → status), `FcMenuLoader`/`FcMenuScreen`/`FcCartScreen`/`FcStatusScreen`, a **separate** `src/lib/cart/fcStore.ts` (carts keyed per `court|store` so simultaneous orders don't collide), `src/lib/customer/fcSession.ts` (seat session + per-order pickup token, localStorage-only — the whole flow resolves client-side), `fcTypes.ts`. **Reuses `ItemSheet`** via a new optional `onAdd` prop (single-café default unchanged). Pickup shows a **#token**; status tracks live via Realtime + request-bill + bill view.
- **Verified:** `npm run build` + `npm run lint` green. `scripts/verify-food-court.mjs` **17/17** (two stores, distinct orders, correct kitchen routing, table_id null, session isolation, add-items, request-bill — self-cleans). Single-café **`verify-customer-session.mjs` 12/12** (untouched). Demo court seeded (`scripts/seed-demo-court.mjs`) at token **`court-demo`** (→ `/court/court-demo`, both cafés as stores) + Desktop QR PNGs.
- **Deferred (Phase 1 remaining + later):** super-admin court-setup UI (`food-courts` pages + `fcActions`/`fcData` + `fc-qr` endpoints) so the founder creates courts without a script; **Phase 2** shared-table UI (locked screen, `?s=` join, per-seat QR — RPCs already support it); **Phase 3** cross-store "your orders at this court" + court tab bar. `setup_hosted.sql` still not re-synced (migrations are canonical).

---

*End of CLAUDE.md — ScanDine. Vision: CONTEXT.md. This file: how we build it.*
