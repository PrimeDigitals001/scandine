# CONTEXT.md — Dine-In Digital Ordering System

> Hand this file to Claude at the start of every development session.
> It contains the full product vision, architecture, feature scope, tech stack, and business rules.

---

## 1. What Are We Building

A **SaaS web application** for cafes and restaurants that digitalises dine-in order management and billing. Think of it as a lightweight, zero-hardware alternative to Petpooja or Posist — focused entirely on the dine-in experience.

**The core loop:**
1. Customer sits at a table, scans a QR code sticker on the table
2. A PWA (Progressive Web App) opens in their browser — no app download needed
3. They browse the menu, add items, customise, place order
4. Order goes live to the kitchen instantly (WebSocket push)
5. Chef sees it on a Kitchen Display System (KDS) tablet, updates status
6. Customer sees live status on their phone
7. When done, bill is auto-generated with taxes — admin closes and clears the table

**Target customers:** Small to mid-size cafes, restaurants, food courts — especially Tier 2/3 cities in India that currently rely on paper KOTs and manual billing.

**Competitive positioning:** Not a full POS suite. Not a delivery app. Just dine-in, done digitally — zero hardware requirement, works on any phone, free to start.

---

## 2. The Problem We Solve

- Understaffed cafes lose orders, make mistakes, and slow down service
- Paper KOTs get lost, misread, or duplicated
- Manual billing is slow and error-prone
- No visibility into live order status for customer or owner
- Google Business Profile has no ratings nudge at the right moment

---

## 3. System Actors

| Level | Actor | Interface | Primary Actions |
|---|---|---|---|
| 0 | **You (Super Admin)** | Super Admin Portal | Create restaurants, create admin accounts, manage subscriptions, view all tenants |
| 1 | **Restaurant Owner (Admin)** | Admin Dashboard | Manage their own menu, tables, QRs, staff logins, billing, analytics |
| 2 | **Kitchen Staff** | KDS tablet | View and update order status only |
| 3 | **Waiter (optional)** | Admin app subset | Mark orders served, assist with tables |
| 4 | **Customer** | PWA (mobile browser) | Scan QR, browse menu, order, track status, view bill, rate on Google |
| — | **System** | Backend API | Auto-generate bill, trigger rating prompt, clear table on payment |

---

## 4. Feature Scope by Tier

### Tier 1 — MVP (Build First)
- QR code per table (unique token, links to customer PWA)
- Customer PWA: menu browse, item customisation (add-ons, variants, special note), cart, order placement
- Kitchen Display System (KDS): live incoming orders, accept, start cooking, mark ready
- Live order status tracker on customer device: PLACED → ACCEPTED → COOKING → READY → SERVED → BILLED → TABLE CLEARED
- Table management: floor view, status per table (empty / occupied / billing)
- Menu builder in admin: add/edit/disable items, categories, prices, veg/non-veg badge, item photos
- Auto-generated bill with SGST (2.5%) + CGST (2.5%) applied automatically
- Admin can close bill and mark table as cleared
- Multi-tenant: each restaurant is an isolated tenant with its own menu, tables, and data

### Tier 2 — Growth (3–6 months post-launch)
- Google Business Profile rating tab: appears on customer PWA when order status hits SERVED — deep-links to the restaurant's Google review page in a bottom tab
- Second rating prompt fires at bill request if customer skipped the first
- Waiter call button on customer PWA — pings admin/waiter screen
- Add items to an existing active order (reorder without starting fresh)
- Live item availability toggle: chef or admin marks an item as unavailable — it hides from customer menu instantly via WebSocket
- Online payment: Razorpay integration (UPI, card, QR) with bill split support
- Thermal receipt printing: ESC/POS protocol support for 80mm printers
- POS integration mode: if the cafe already has Petpooja/GoFrugal, our app sends order data via webhook — they handle billing on their side
- Analytics dashboard: daily revenue, top 10 items, peak hours heatmap, avg order value, table turnover time
- Multi-order: customer can place additional orders to the same table while an order is active

### Tier 3 — Advanced (6–12 months)
- WhatsApp bill delivery via WhatsApp Business API
- Loyalty / repeat customer system: phone-based ID, points per visit
- Offers engine: happy hours, combo auto-apply, discount codes
- Inventory alerts: low stock warnings for kitchen staff
- Staff shift tracking: clock in/out, orders handled per staff member
- AI upsell suggestions: recommend add-ons based on order history
- Table reservation / pre-booking with QR pre-assigned
- Multi-restaurant SaaS mode: onboard any cafe via self-signup, subscription billing (Razorpay Subscriptions)

---

## 5. Core Data Model

### Tables (PostgreSQL via Supabase)

```
restaurants
  id            UUID PK
  name          string
  gst_number    string
  address       text
  google_review_url  string        ← used for the rating tab deep-link
  tax_config    JSONB             ← { sgst: 2.5, cgst: 2.5 }
  subscription_plan  enum         ← free | starter | pro
  created_at    timestamp

tables
  id            UUID PK
  restaurant_id UUID FK → restaurants.id
  table_number  string
  qr_token      string UNIQUE     ← embedded in QR code URL
  status        enum              ← empty | occupied | billing
  capacity      int

menu_categories
  id            UUID PK
  restaurant_id UUID FK
  name          string
  sort_order    int
  is_visible    bool

menu_items
  id            UUID PK
  restaurant_id UUID FK
  category_id   UUID FK → menu_categories.id
  name          string
  description   text
  price         decimal(10,2)
  image_url     string            ← Cloudinary
  is_veg        bool
  is_available  bool              ← toggled live, pushes via WebSocket
  addons        JSONB             ← [{ name, price }]
  variants      JSONB             ← [{ name, price_delta }]
  sort_order    int

orders
  id            UUID PK
  restaurant_id UUID FK
  table_id      UUID FK → tables.id
  status        enum              ← placed | accepted | cooking | ready | served | billed | cleared
  table_note    text
  placed_at     timestamp
  served_at     timestamp
  billed_at     timestamp

order_items
  id            UUID PK
  order_id      UUID FK → orders.id
  menu_item_id  UUID FK → menu_items.id
  quantity      int
  unit_price    decimal(10,2)    ← snapshot at time of order
  addons        JSONB            ← selected add-ons
  variant       JSONB            ← selected variant
  item_note     text
  status        enum             ← pending | cooking | ready  ← per-item status for KDS

bills
  id            UUID PK
  order_id      UUID FK → orders.id UNIQUE
  subtotal      decimal(10,2)
  sgst          decimal(10,2)
  cgst          decimal(10,2)
  discount      decimal(10,2)
  total         decimal(10,2)
  payment_method  enum           ← cash | upi | card | pending
  paid_at       timestamp

ratings
  id            UUID PK
  order_id      UUID FK → orders.id
  restaurant_id UUID FK
  stars         int              ← 1–5
  comment       text
  created_at    timestamp
  ← Note: this is optional internal rating; Google review is a deep-link, not stored here
```

---

## 6. Tech Stack

### Customer PWA
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Real-time:** Supabase Realtime client (WebSocket subscription on the order row)
- **Auth:** None required — customer identified by QR token (table session)
- **Hosting:** Vercel (free tier)

### Kitchen Display System (KDS)
- **Framework:** React (Vite)
- **Real-time:** Supabase Realtime — subscribes to `orders` table filtered by `restaurant_id`
- **Auth:** Staff PIN login or simple email/password via Supabase Auth
- **UX:** Tablet-optimised, large touch targets, audio alert (Web Audio API beep) on new order
- **Hosting:** Vercel (free tier)

### Admin Dashboard
- **Framework:** Next.js 14
- **Features:** Menu builder, floor view, analytics, QR generator, bill management
- **Auth:** Supabase Auth (email + password, restaurant owner role)
- **Hosting:** Vercel (free tier)

### Backend / API
- **Runtime:** Node.js + Express (or Next.js API routes if keeping it monorepo)
- **Database:** PostgreSQL via Supabase
- **Real-time:** Supabase Realtime (no separate Socket.io server needed — Supabase handles WebSocket pub/sub via Postgres changes)
- **Auth:** Supabase Auth + JWT
- **File uploads:** Cloudinary (menu item images)
- **Hosting:** Railway (free tier, 500 hrs/month)

### Database & Infrastructure
- **DB:** Supabase (Postgres + Realtime + Auth + Storage — all free tier)
- **Images:** Cloudinary free tier (25 GB)
- **Payments (Tier 2):** Razorpay
- **Thermal print (Tier 2):** ESC/POS over USB/LAN using `escpos` npm package
- **Domain:** Already owned — point to Vercel via DNS

### How Real-Time Works (No Manual Refresh)
Supabase Realtime watches Postgres tables using logical replication.
Any INSERT or UPDATE to `orders` or `order_items` automatically pushes a WebSocket event
to all subscribed clients in that restaurant's channel.

```
Customer places order
  → INSERT into orders table
    → Supabase Realtime broadcasts to restaurant_id channel
      → KDS screen receives new order instantly (no polling)
      → Admin dashboard updates table status instantly
      → Customer's own status tracker updates instantly
```

Client subscription example:
```js
supabase
  .channel(`restaurant-${restaurantId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'orders',
    filter: `restaurant_id=eq.${restaurantId}`
  }, (payload) => {
    // update UI state with payload.new
  })
  .subscribe()
```

---

## 7. Multi-Tenant Architecture

Each restaurant is a completely isolated tenant.

- All tables have `restaurant_id` foreign key
- Supabase Row Level Security (RLS) policies enforce isolation:
  - Restaurant owner can only read/write their own restaurant's data
  - Customer QR token is scoped to a specific `table_id` which belongs to one `restaurant_id`
- One Supabase project can serve all tenants (free tier supports this)
- Each restaurant gets a subdomain or path: `yourdomain.com/r/[restaurant-slug]`

---

## 8. QR Code System

- Each table gets a unique `qr_token` (UUID or short hash) stored in the `tables` table
- QR encodes a URL: `https://yourdomain.com/order/[qr_token]`
- When customer scans, the app resolves `qr_token` → `table_id` → `restaurant_id` → loads that restaurant's menu
- QR is regenerated (new token) when the table is cleared — prevents old sessions from placing orders
- Admin dashboard has a "Download QR" button per table — generates a printable PNG

---

## 9. Order Status State Machine

```
PLACED
  └─ ACCEPTED   (by kitchen — tapping on KDS)
      └─ COOKING  (chef starts — tap on KDS)
          └─ READY    (all items done — tap on KDS)
              └─ SERVED   (waiter/chef marks delivered)
                  └─ BILLED   (admin closes bill, payment taken)
                      └─ CLEARED  (table reset, new session begins)
```

- Each status change is an UPDATE to `orders.status`
- Supabase Realtime broadcasts it immediately to all clients
- Customer sees animated status timeline on their phone in real-time

---

## 10. Google Business Profile Rating Flow

This is NOT an in-app rating system. It is a deep-link to the restaurant's own Google review page.

**Trigger:** When `orders.status` changes to `SERVED`
- Customer PWA receives the WebSocket update
- A bottom sheet / bottom tab appears: "Enjoying your meal? Rate us on Google ⭐"
- Tapping opens: `https://search.google.com/local/writereview?placeid=[PLACE_ID]`
- `google_review_url` is stored per restaurant in the `restaurants` table — admin sets it once during onboarding
- Second prompt appears when customer taps "Request Bill" — catches anyone who skipped the first

**Why Google and not in-app:**
- Builds the restaurant's public Google SEO presence
- Reviews are real and visible to new customers
- No storage or moderation burden on us
- Higher perceived credibility for the restaurant

---

## 11. POS Integration Mode (Tier 2)

Two modes, set as a flag per restaurant in `restaurants.pos_mode`:

| Mode | Description |
|---|---|
| `standalone` | Our app handles full billing. Auto-generates bill with GST. |
| `pos_integrated` | Order data is sent via webhook to their existing POS. We don't generate a bill. |

Webhook payload sent on order PLACED:
```json
{
  "event": "order.placed",
  "table": "T4",
  "restaurant_id": "...",
  "items": [
    { "name": "Nutella Brownie", "qty": 1, "price": 150, "addons": ["OREO"] }
  ],
  "total": 160,
  "timestamp": "2026-06-04T10:30:00Z"
}
```

---

## 12. URL / Route Structure

```
Super Admin Portal  (/superadmin/*)   ← YOU only, protected by separate env credentials
  /superadmin/login                   ← hardcoded super admin login, NOT Supabase Auth
  /superadmin/dashboard               ← all restaurants, order counts, subscription status
  /superadmin/restaurants             ← list all tenants
  /superadmin/restaurants/new         ← create new restaurant tenant
  /superadmin/restaurants/[id]        ← edit restaurant details, plan, status
  /superadmin/restaurants/[id]/admins ← create / reset admin accounts for that restaurant
  /superadmin/restaurants/[id]/tables ← view/manage tables, regenerate QRs
  /superadmin/system                  ← health check, active sessions, error logs

Customer PWA  (/order/*)
  /order/[qr_token]              ← table landing page, loads menu
  /order/[qr_token]/cart         ← cart review
  /order/[qr_token]/status       ← live order tracker
  /order/[qr_token]/bill         ← bill view + request bill CTA

Kitchen Display  (/kitchen/*)
  /kitchen/[restaurant_slug]     ← KDS, staff login required

Admin Dashboard  (/admin/*)      ← restaurant owner, scoped to their restaurant only
  /admin/dashboard               ← overview + floor view
  /admin/menu                    ← menu builder
  /admin/tables                  ← table + QR management
  /admin/orders                  ← order history
  /admin/billing                 ← open bills + payment
  /admin/analytics               ← sales reports
  /admin/settings                ← restaurant profile, Google URL, GST config
  /admin/staff                   ← create/manage kitchen staff PINs
```

---

## 13. Business Rules & Edge Cases

- A table can only have ONE active order at a time (status not CLEARED)
- Items can be added to an active order before status reaches READY
- If an item is toggled unavailable mid-session, it is hidden from new orders but stays on existing active orders
- Bill is calculated from `order_items.unit_price` (price snapshot at order time) — not live `menu_items.price`
- GST is calculated on subtotal: SGST = subtotal × 0.025, CGST = subtotal × 0.025
- Table is ONLY cleared after payment is confirmed — admin action
- QR token is regenerated on table clear — old sessions become invalid
- Rating prompt fires max once per order (not re-shown after dismissed)
- All timestamps stored in UTC, displayed in IST (UTC+5:30)

---

## 14. Free Hosting Stack (Zero Cost for Pilot)

| Service | Usage | Free Limit |
|---|---|---|
| Supabase | DB + Auth + Realtime | 500MB DB, 2 projects |
| Vercel | Customer PWA + Admin | Unlimited deployments |
| Railway | Node.js API (if needed) | 500 hrs/month |
| Cloudinary | Menu item images | 25 GB storage |
| Domain | Already owned | — |
| **Total monthly cost** | | **₹0** |

Upgrade triggers: >2 restaurant tenants on Supabase Pro ($25/mo), or traffic exceeds Vercel hobby limits.

---

## 15. What NOT to Build (Scope Boundaries)

- No delivery / takeaway flow (dine-in only)
- No customer login / account system in MVP
- No inventory management in MVP
- No payroll or HR features
- No WhatsApp ordering bot
- No third-party aggregator integration (Swiggy/Zomato)

---

## 16. Development Priorities

When asking Claude to build, work in this order:

1. **Supabase setup** — schema, RLS policies, seed data for one test restaurant
2. **Super Admin portal** — create restaurants, create admins, manage tables, download QRs
3. **Customer PWA** — QR resolution → menu → cart → order placement → status tracker
4. **Kitchen Display System** — order queue, status updates
5. **Admin Dashboard** — floor view, menu builder, QR generator, bill close
6. **Billing module** — auto-generate bill, tax calculation, table clear
7. **Google rating tab** — trigger on SERVED, deep-link setup
8. **Analytics** — read-only queries, no complex infrastructure needed
9. **Tier 2 features** — only after pilot feedback

---

## 17. Tone & Code Conventions

- Language: TypeScript everywhere
- Styling: Tailwind CSS utility classes, no CSS modules
- State: React Context or Zustand for client state, Supabase for server state
- Error handling: always handle loading/error/empty states in UI
- Mobile-first: customer PWA must be flawless on a 375px screen
- Naming: snake_case for DB columns, camelCase for JS/TS variables
- Comments: explain the "why" not the "what"
- Primary colour: `#E85D26` (orange — matches the reference app screenshots)
- Veg indicator: green square dot (FSSAI standard), non-veg: brown dot

---

## 18. Super Admin Portal — Full Spec

This is YOUR private control panel. It is the tool you use every time a new cafe signs up.
It lives at `/superadmin/*` and is protected by a hardcoded credential stored in environment variables — completely separate from Supabase Auth so no restaurant admin can ever reach it.

### What Super Admin Can Do

| Action | Detail |
|---|---|
| Create restaurant tenant | Name, slug, address, GST number, Google review URL, plan, POS mode |
| Create restaurant admin account | Email + temporary password via Supabase Auth with `admin` role assigned |
| Reset admin password | Generate new temp password, send or display it |
| Suspend / reactivate restaurant | Flip `is_active` flag — hides all their QRs and blocks logins |
| View all tenants | Table: name, plan, tables count, orders this month, last active |
| Manage subscription plan | free / starter / pro per restaurant |
| View system health | Active WebSocket connections, recent errors, DB size |
| Add tables for a restaurant | Instead of making restaurant owner do it — useful for initial setup |
| Download all QR codes for a restaurant | Bulk ZIP of all table QR PNGs, ready to print |

### Super Admin DB Table

```
super_admin_sessions
  id            UUID PK
  created_at    timestamp
  ip_address    string
  ← simple audit log of super admin logins

restaurants table gets two new columns:
  is_active     bool DEFAULT true    ← super admin can suspend
  onboarded_by  string               ← your name/note for reference
  onboarded_at  timestamp
```

### Super Admin Auth (Separate from Supabase)

Super admin login is NOT through Supabase Auth. It uses a hardcoded check against env vars:

```
SUPER_ADMIN_EMAIL=you@yourdomain.com
SUPER_ADMIN_PASSWORD_HASH=bcrypt_hash_here
SUPER_ADMIN_SESSION_SECRET=random_long_secret
```

On login, a signed JWT is issued with role: `super_admin`. All `/superadmin/*` routes check for this JWT in a middleware. No restaurant user can ever get this role — it is not in Supabase at all.

### New Restaurant Onboarding Workflow (Step by Step)

This is exactly what you do when a cafe says yes:

```
Step 1 — Collect from cafe owner:
  - Restaurant name
  - Number of tables
  - GST number (or skip if they don't have one yet)
  - Google Business Profile URL (from their Google Maps listing → Share → Copy link)
  - Their email address (for admin login)
  - Their menu (WhatsApp photo, PDF, or typed list — anything works)

Step 2 — You log into /superadmin
  - Create restaurant → fills restaurants table
  - System auto-generates restaurant slug (e.g. "friends-fries-cafe")
  - Create admin account → enters their email → system creates Supabase Auth user
    with role=admin, restaurant_id assigned → generates temp password → show to you

Step 3 — Set up tables
  - In /superadmin/restaurants/[id]/tables → add N tables (T1, T2... or custom names)
  - System generates unique qr_token for each
  - Click "Download all QRs" → get ZIP of PNG files, one per table

Step 4 — Build their menu
  - You (or optionally the restaurant admin) go to /admin/menu
  - Add categories, add items, set prices, upload photos, mark veg/non-veg
  - Toggle items available
  - Takes ~30–60 mins for a typical 30-item menu

Step 5 — Hand over
  - Print QR codes (cardstock or standees from local print shop, ₹30–50 each)
  - Share admin login URL + credentials with restaurant owner
  - Open /kitchen/[slug] on their kitchen tablet, log in with staff PIN
  - 15-min walkthrough of KDS — that's all training needed

Step 6 — Go live
  - Place QRs on tables
  - Done. Customers can order from minute 1.
```

### RLS Policy for Super Admin

Super admin bypasses RLS using the service role key (never exposed to frontend):

```js
// In super admin API routes only — server-side, never client-side
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // bypasses all RLS
)
```

All other roles (restaurant admin, kitchen staff, customer) use the anon key and are fully restricted by RLS policies.

---

## 19. Role-Based Access Summary

| Role | How Created | Auth Method | Can See |
|---|---|---|---|
| Super Admin | Hardcoded in env | Custom JWT | Everything |
| Restaurant Admin | Super admin creates via portal | Supabase Auth email+password | Only their restaurant |
| Kitchen Staff | Restaurant admin creates | Supabase Auth PIN / simple password | Only KDS for their restaurant |
| Customer | No account — QR token is identity | None (anonymous) | Only their table's menu + order |

---

*End of CONTEXT.md — v2.0 — Dine-In Digital Ordering System*
