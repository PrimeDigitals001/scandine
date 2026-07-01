/**
 * ScanDine — "Ask to join" a table/seat (approve-based join). RPC-level e2e for
 * BOTH single-café tables and food-court shared seats. Needs migration 010.
 * Self-cleans. Run:  node scripts/verify-join.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = "") => {
  console.log(`${c ? "✅" : "❌"}  ${n}${d ? `  —  ${d}` : ""}`);
  if (c) pass++;
  else fail++;
};

let courtId = null;
const attached = [];

try {
  // ============ single-café table ============
  const { data: tbl } = await svc.from("tables").select("id").eq("qr_token", "demo").single();
  await svc.from("join_requests").delete().eq("table_id", tbl.id);
  await svc.from("orders").delete().neq("status", "cleared").eq("table_id", tbl.id);
  await svc.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", tbl.id);

  // primary claims the table
  const prim = await anon.rpc("resolve_table", { p_qr_token: "demo", p_session_token: null });
  const sessA = prim.data.session_token;
  ok("[café] primary claims the table", !!sessA);

  // requester asks to join
  const reqB = "reqtok-" + Math.random().toString(36).slice(2);
  const ask = await anon.rpc("request_to_join", { p_token: "demo", p_request_token: reqB, p_name: "Bob" });
  ok("[café] requester can ask to join an in-use table", !ask.error, ask.error?.message ?? "");

  // primary sees the pending request
  const list = await anon.rpc("list_join_requests", { p_token: "demo", p_session_token: sessA });
  ok("[café] primary sees the pending request", Array.isArray(list.data) && list.data.length === 1 && list.data[0].name === "Bob");

  // a non-holder can't list requests
  const badList = await anon.rpc("list_join_requests", { p_token: "demo", p_session_token: "wrong" });
  ok("[café] non-holder can't list requests", !!badList.error);

  // requester polling before approval → pending
  const poll1 = await anon.rpc("claim_join", { p_token: "demo", p_request_token: reqB });
  ok("[café] requester sees 'pending' before approval", poll1.data?.status === "pending");

  // primary approves
  await anon.rpc("respond_join_request", { p_token: "demo", p_session_token: sessA, p_request_id: list.data[0].id, p_approve: true });
  const poll2 = await anon.rpc("claim_join", { p_token: "demo", p_request_token: reqB });
  ok("[café] approved requester receives the SAME session", poll2.data?.status === "approved" && poll2.data?.session_token === sessA);

  // the joined requester can actually use it (place an order)
  const item = prim.data.menu.flatMap((c) => c.items).find((i) => i.is_available);
  const placed = await anon.rpc("place_order", { p_qr_token: "demo", p_items: [{ menu_item_id: item.id, quantity: 1 }], p_session_token: poll2.data.session_token });
  ok("[café] joined requester can order on the shared session", !placed.error && !!placed.data, placed.error?.message ?? "");

  // decline path
  const reqC = "reqtok-" + Math.random().toString(36).slice(2);
  await anon.rpc("request_to_join", { p_token: "demo", p_request_token: reqC, p_name: "Eve" });
  const list2 = await anon.rpc("list_join_requests", { p_token: "demo", p_session_token: sessA });
  const eve = list2.data.find((r) => r.name === "Eve");
  await anon.rpc("respond_join_request", { p_token: "demo", p_session_token: sessA, p_request_id: eve.id, p_approve: false });
  const pollC = await anon.rpc("claim_join", { p_token: "demo", p_request_token: reqC });
  ok("[café] declined requester sees 'denied'", pollC.data?.status === "denied");

  // cleanup café
  await svc.from("join_requests").delete().eq("table_id", tbl.id);
  await svc.from("orders").delete().neq("status", "cleared").eq("table_id", tbl.id);
  await svc.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", tbl.id);

  // ============ food-court shared seat ============
  const { data: ff } = await svc.from("restaurants").select("id, slug").eq("slug", "friends-fries-cafe").single();
  await svc.from("food_courts").delete().eq("slug", "test-join-court");
  const { data: court } = await svc.from("food_courts").insert({ name: "Join Verify Court", slug: "test-join-court" }).select().single();
  courtId = court.id;
  await svc.from("restaurants").update({ food_court_id: courtId }).eq("id", ff.id);
  attached.push(ff.id);
  const { data: seat } = await svc.from("food_court_tables").insert({ food_court_id: courtId, mode: "shared_table", label: "Table 1", capacity: 4 }).select().single();
  const seatToken = seat.qr_token;

  const primFc = await anon.rpc("resolve_food_court_store", { p_token: seatToken, p_store_slug: ff.slug, p_session_token: null });
  const sessS = primFc.data.session_token;
  ok("[court] primary claims the seat", !!sessS && !primFc.data.locked);

  const reqAnn = "reqtok-" + Math.random().toString(36).slice(2);
  const askFc = await anon.rpc("request_to_join", { p_token: seatToken, p_request_token: reqAnn, p_name: "Ann" });
  ok("[court] requester can ask to join the seat", !askFc.error, askFc.error?.message ?? "");

  const listFc = await anon.rpc("list_join_requests", { p_token: seatToken, p_session_token: sessS });
  ok("[court] primary sees the pending request", Array.isArray(listFc.data) && listFc.data.length === 1);

  await anon.rpc("respond_join_request", { p_token: seatToken, p_session_token: sessS, p_request_id: listFc.data[0].id, p_approve: true });
  const pollFc = await anon.rpc("claim_join", { p_token: seatToken, p_request_token: reqAnn });
  ok("[court] approved requester receives the seat session", pollFc.data?.status === "approved" && pollFc.data?.session_token === sessS);
} catch (e) {
  ok("join flow crashed", false, e.message);
} finally {
  const { data: tbl } = await svc.from("tables").select("id").eq("qr_token", "demo").maybeSingle();
  if (tbl) {
    await svc.from("join_requests").delete().eq("table_id", tbl.id);
    await svc.from("orders").delete().neq("status", "cleared").eq("table_id", tbl.id);
    await svc.from("tables").update({ status: "empty", session_token: null, session_started_at: null }).eq("id", tbl.id);
  }
  if (courtId) await svc.from("orders").delete().eq("food_court_id", courtId);
  for (const id of attached) await svc.from("restaurants").update({ food_court_id: null }).eq("id", id);
  if (courtId) await svc.from("food_courts").delete().eq("id", courtId);
  console.log("🧹 cleaned up join test data");
}

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
