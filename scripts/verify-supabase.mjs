/**
 * ScanDine — Supabase security & functionality smoke test.
 *
 * Proves over the network (REST/RPC, no direct DB connection) that:
 *   • the schema, seed, and RPCs are live
 *   • an anonymous customer CAN load the menu + place an order via the QR token
 *   • an anonymous customer CANNOT read qr_tokens / bills / profiles, and
 *     CANNOT write to tables directly
 *   • tenant isolation holds: a café-A admin cannot see café B's rows
 *
 * Run:  node scripts/verify-supabase.mjs       (auto-loads .env.local)
 * It creates a little throwaway data and cleans it up in a finally block.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- tiny .env.local loader (Node doesn't read it automatically) ------------
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local — rely on real env */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_ID = "11111111-1111-1111-1111-111111111111";

if (!url || !anonKey || !secretKey) {
  console.error("✗ Missing Supabase env vars in .env.local");
  process.exit(1);
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0;
let fail = 0;
const line = (ok, name, detail) => {
  console.log(`${ok ? "✅" : "❌"}  ${name}${detail ? `  —  ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

// Resources to clean up no matter what.
const cleanup = { orderId: null, userId: null, cafeBId: null };

try {
  // ---- 1. resolve_table('demo') ------------------------------------------
  const r1 = await anon.rpc("resolve_table", { p_qr_token: "demo" });
  if (r1.error) {
    if (/does not exist|schema cache|not find/i.test(r1.error.message)) {
      console.error(
        "\n⚠️  The database isn't set up yet — run supabase/setup_hosted.sql in the SQL Editor first.\n",
      );
      console.error("   (error:", r1.error.message, ")");
      process.exit(1);
    }
  }
  const menu = r1.data?.menu ?? [];
  line(
    !r1.error && r1.data?.restaurant?.name && menu.length > 0,
    'anon resolve_table("demo") loads the café + menu',
    r1.error?.message ?? `${r1.data?.restaurant?.name}, ${menu.length} categories`,
  );

  // grab a known item with a variant for the order test
  const chai = menu
    .flatMap((c) => c.items)
    .find((i) => i.name === "Kullad Masala Chai");

  // ---- 2. anon CANNOT read tables (qr_token is a capability secret) -------
  const r2 = await anon.from("tables").select("id, qr_token");
  line(
    !r2.error && Array.isArray(r2.data) && r2.data.length === 0,
    "anon CANNOT read tables (qr_token stays secret)",
    r2.error ? `error: ${r2.error.message}` : `rows visible: ${r2.data.length}`,
  );

  // ---- 3. anon CANNOT read bills -----------------------------------------
  const r3 = await anon.from("bills").select("id");
  line(
    !r3.error && r3.data.length === 0,
    "anon CANNOT read bills",
    r3.error ? `error: ${r3.error.message}` : `rows visible: ${r3.data.length}`,
  );

  // ---- 4. anon CANNOT read profiles --------------------------------------
  const r4 = await anon.from("profiles").select("id");
  line(
    !r4.error && r4.data.length === 0,
    "anon CANNOT read profiles",
    r4.error ? `error: ${r4.error.message}` : `rows visible: ${r4.data.length}`,
  );

  // ---- 5. anon CAN read the menu -----------------------------------------
  const r5 = await anon.from("menu_items").select("id, name");
  line(
    !r5.error && r5.data.length > 0,
    "anon CAN read the public menu",
    r5.error ? `error: ${r5.error.message}` : `${r5.data.length} items`,
  );

  // ---- 6. anon CANNOT insert an order directly (must use the RPC) --------
  const r6 = await anon
    .from("orders")
    .insert({ restaurant_id: DEMO_ID, table_id: DEMO_ID, status: "placed" });
  line(
    !!r6.error,
    "anon CANNOT write orders directly (RLS blocks it)",
    r6.error ? `blocked: ${r6.error.message}` : "INSERT was allowed (BAD)",
  );

  // ---- 7. place_order via the RPC works + snapshots variant price ---------
  const r7 = await anon.rpc("place_order", {
    p_qr_token: "demo",
    p_items: [{ menu_item_id: chai?.id, quantity: 2, variant: "Large" }],
    p_table_note: "verify-script",
  });
  cleanup.orderId = r7.data ?? null;
  // re-resolve to inspect the active order it created
  const after = await anon.rpc("resolve_table", { p_qr_token: "demo" });
  const ao = after.data?.active_order;
  const unit = ao?.items?.[0]?.unit_price;
  line(
    !r7.error && ao && Number(unit) === 55, // chai 40 + Large 15
    "anon place_order works (server-side price snapshot 40+15=₹55)",
    r7.error ? r7.error.message : `unit_price snapshot = ₹${unit}`,
  );

  // ---- 8. one active order per table -------------------------------------
  const r8 = await anon.rpc("place_order", {
    p_qr_token: "demo",
    p_items: [{ menu_item_id: chai?.id, quantity: 1 }],
  });
  line(
    !!r8.error && /active order/i.test(r8.error.message),
    "second order on the same table is rejected (one active order)",
    r8.error ? `blocked: ${r8.error.message}` : "second order allowed (BAD)",
  );

  // ---- 9. tenant isolation: café-A admin cannot see café B ---------------
  const cafeB = await admin
    .from("restaurants")
    .insert({ name: "Test Bistro (verify)", slug: "test-bistro-verify" })
    .select()
    .single();
  cleanup.cafeBId = cafeB.data?.id ?? null;
  await admin
    .from("tables")
    .insert({ restaurant_id: cafeB.data.id, table_number: "B1" });

  const email = `verify-${Date.now()}@scandine.test`;
  const password = "Verify-123456!";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  cleanup.userId = created.data?.user?.id ?? null;
  await admin.from("profiles").insert({
    id: created.data.user.id,
    restaurant_id: DEMO_ID,
    role: "admin",
    full_name: "Verify Admin",
  });

  const asUser = createClient(url, anonKey, { auth: { persistSession: false } });
  const signin = await asUser.auth.signInWithPassword({ email, password });

  const tA = await asUser.from("tables").select("id, restaurant_id");
  const onlyOwn =
    !tA.error &&
    tA.data.length === 6 &&
    tA.data.every((t) => t.restaurant_id === DEMO_ID);
  line(
    !signin.error && onlyOwn,
    "café-A admin sees ONLY café A's 6 tables (café B hidden)",
    signin.error
      ? signin.error.message
      : `saw ${tA.data?.length} tables, none from café B`,
  );

  const rsts = await asUser.from("restaurants").select("id");
  line(
    !rsts.error && rsts.data.length === 1 && rsts.data[0].id === DEMO_ID,
    "café-A admin sees ONLY its own restaurant row",
    rsts.error ? rsts.error.message : `saw ${rsts.data?.length} restaurant(s)`,
  );
  await asUser.auth.signOut();
} finally {
  // ---- cleanup: leave the demo café exactly as we found it ---------------
  if (cleanup.orderId) await admin.from("orders").delete().eq("id", cleanup.orderId);
  await admin.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("qr_token", "demo");
  if (cleanup.userId) await admin.auth.admin.deleteUser(cleanup.userId);
  if (cleanup.cafeBId) await admin.from("restaurants").delete().eq("id", cleanup.cafeBId);
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
