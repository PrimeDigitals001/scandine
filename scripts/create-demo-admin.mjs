/**
 * Create (idempotent) an OWNER/admin login for the demo café, to test the
 * Admin Dashboard at /admin.
 *
 * Run:  node scripts/create-demo-admin.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const DEMO_ID = "11111111-1111-1111-1111-111111111111";
const EMAIL = "admin@scandine.demo";
const PASSWORD = "admin123";

let userId;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "Demo Owner" },
});

if (created.error) {
  const { data } = await admin.auth.admin.listUsers();
  const existing = data.users.find((u) => u.email === EMAIL);
  if (!existing) throw created.error;
  userId = existing.id;
  await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
} else {
  userId = created.data.user.id;
}

await admin.from("profiles").upsert(
  {
    id: userId,
    restaurant_id: DEMO_ID,
    role: "admin",
    full_name: "Demo Owner",
    is_active: true,
  },
  { onConflict: "id" },
);

console.log("✅ Demo owner/admin ready");
console.log(`   URL:      /admin`);
console.log(`   email:    ${EMAIL}`);
console.log(`   password: ${PASSWORD}`);
