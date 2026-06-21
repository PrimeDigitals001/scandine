/**
 * ScanDine — Food Court cross-store "Your orders" overview (real browser).
 * Places pickup orders at TWO stores in the demo court, seeds the browser's
 * court-order index (localStorage), then loads /court/court-demo/orders and
 * asserts BOTH stores' orders show on one screen, live. Self-cleans.
 *
 * Needs a local server + the demo court seeded. Run:
 *   node scripts/verify-food-court-overview.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BASE = process.env.BASE ?? "http://localhost:3000";
const TOKEN = "court-demo";
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

const orderIds = [];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

try {
  const { data: fc } = await anon.rpc("resolve_food_court", { p_token: TOKEN });
  if (!fc || fc.stores.length < 2) {
    ok("demo court has 2 stores (run seed-demo-court.mjs)", false, `${fc?.stores?.length ?? 0}`);
    process.exit(1);
  }

  // place a pickup order at each of two stores
  const ptrs = [];
  for (const s of fc.stores.slice(0, 2)) {
    const { data: r } = await anon.rpc("resolve_food_court_store", { p_token: TOKEN, p_store_slug: s.slug, p_session_token: null });
    const item = r.menu.flatMap((c) => c.items).find((i) => i.is_available);
    const { data: res } = await anon.rpc("place_food_court_order", { p_token: TOKEN, p_store_slug: s.slug, p_items: [{ menu_item_id: item.id, quantity: 1 }], p_session_token: null });
    orderIds.push(res.order_id);
    ptrs.push({ slug: s.slug, name: s.name, orderId: res.order_id, sessionToken: res.session_token });
  }
  ok("placed pickup orders at 2 stores", ptrs.length === 2);

  // seed the browser's court-order index, then open the overview
  await page.goto(`${BASE}/court/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([token, list]) => localStorage.setItem(`sd-fccourt-${token}`, JSON.stringify(list)),
    [TOKEN, ptrs],
  );
  await page.goto(`${BASE}/court/${TOKEN}/orders`, { waitUntil: "domcontentloaded" });

  await page.getByRole("heading", { name: "Your orders" }).waitFor({ timeout: 12000 });
  for (const p of ptrs) {
    await page.getByText(p.name).first().waitFor({ timeout: 10000 });
    ok(`overview shows "${p.name}"`, true);
  }
  ok("overview shows a live status chip", (await page.getByText(/Order placed|Accepted|Cooking|Ready/).count()) >= 1);

  // the "Your orders (N)" banner appears on the store list too
  await page.goto(`${BASE}/court/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Your orders \(2\)/).waitFor({ timeout: 10000 });
  ok("store list shows the 'Your orders (2)' banner", true);

  ok("no console/page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  ok("overview flow crashed", false, e.message);
} finally {
  await b.close();
  if (orderIds.length) await svc.from("orders").delete().in("id", orderIds);
  console.log("🧹 cleaned up overview test orders");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
