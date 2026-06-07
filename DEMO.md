# ScanDine — the perfect end-to-end flow

A single walkthrough that exercises **every** surface, the way a real café would.
Live app: **https://scandine-demo.vercel.app** · Demo café: **Friends & Fries Café**

> Tip: open the customer link on your **phone** and the admin/kitchen on a **laptop**
> side by side — that's how the live updates feel real.

---

## Logins (demo)

| Who | URL | Email | Password |
|---|---|---|---|
| **Super admin** (you) | `/superadmin` or `/login` | `primedigitals.business@gmail.com` | *(your strong Vercel password)* |
| **Café owner** | `/login` | `admin@scandine.demo` | `admin123` |
| **Kitchen staff** | `/login` | `kitchen@scandine.demo` | `kitchen123` |
| **Customer** | `/order/demo` | — no login — | — |

Everyone signs in at the **same** `/login`; it routes each person to the right place.

---

## The flow (≈5 minutes)

### 1 · Super admin onboards a café  *(you, once per café)*
1. Go to **`/login`** → sign in as the super admin → lands on `/superadmin`.
2. **Restaurants → New** → enter the café's name, slug, GST %. Create it.
3. Open the café → **Create owner login**: type the owner's email. Either set a
   password yourself or leave it blank to auto-generate. Copy the credentials and
   hand them to the owner.
4. *(Optional)* add a few tables + download their QR codes here — or let the owner
   do it themselves in step 2.

> After this you're done. Everything below is the **owner's** day-to-day — you
> don't touch it again unless they forget their password.

### 2 · Owner sets up the café  *(`admin@scandine.demo`)*
1. **`/login`** as the owner → lands on the **Floor**.
2. **Tables** → add tables (e.g. 6, prefix `T`) → **Download all QRs (.zip)** →
   print and stick one on each table.
3. **Menu** → add categories and items. For each item set a price, veg/non-veg,
   and **upload a photo** (it shows up on the customer's phone). Toggle anything
   that's run out to **Sold out**.
4. **Staff** → **Add a kitchen login** for each cook. Set a password or
   auto-generate; hand them the credentials.
5. **Settings** → address, GST number, GST %, and your **Google review URL**
   (used by the feedback prompt). You can also change your own password here.

### 3 · Customer orders  *(phone — scan a table QR, or open `/order/demo`)*
1. The menu opens instantly — no app, no login. Table number is shown up top.
2. Browse by category, tap **Add** (items with options open a sheet for size /
   add-ons / notes). The cart bar slides up with a running total.
3. **View cart** → review, add a table note → **Place order**.
4. You're moved to the **live status** screen. Leave it open.

### 4 · Kitchen cooks  *(`kitchen@scandine.demo`, tablet/laptop)*
1. **`/login`** as kitchen staff → lands on the **Kitchen Display**.
2. The new ticket appears (with a beep if sound is on). Tap through:
   **Accept → Start cooking → Mark ready → Mark served.**
3. Watch the customer's phone — each tap updates their status **live**.

### 5 · Customer feedback  *(phone)*
- When the order hits **served**, the **Feedback** tab prompts a rating. 4–5★ →
  "Rate us on Google" (your review URL). 3★ or less → quietly routed to staff.

### 6 · Owner bills & clears  *(`admin@scandine.demo`)*
1. **Billing** → the open table is listed. **Generate bill** (GST is added
   automatically; add a discount if needed).
2. Take payment → **Mark paid** (cash / UPI / card).
3. **Clear table** → the table frees up **and its QR token is regenerated**, so the
   old phone session can't reorder. Ready for the next guest.

---

## What to show off in a sales demo
- **Zero hardware** — a printed QR is the entire install.
- **Live sync** — order on the phone, watch it land in the kitchen and bill in real time.
- **Self-serve** — the owner runs menu, tables, staff, billing, passwords without you.
- **Photos + veg marks + GST** — looks finished, not a prototype.

## One pending setup (you)
In Vercel, set `NEXT_PUBLIC_APP_URL=https://scandine-demo.vercel.app` and redeploy,
then re-download the QR codes — so a scanned QR opens the **live** site (until then
direct links work, but generated QRs may encode localhost).
