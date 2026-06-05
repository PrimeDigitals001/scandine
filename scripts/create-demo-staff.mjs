/**
 * Create (idempotent) a kitchen staff login for the demo café, so the KDS
 * can be tested at /kitchen/friends-fries-cafe.
 *
 * Run:  node scripts/create-demo-staff.mjs
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
const EMAIL = "kitchen@scandine.demo";
const PASSWORD = "kitchen123";

let userId;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "Demo Kitchen" },
});

if (created.error) {
  // already exists — find them and reset the password so login is deterministic
  const { data } = await admin.auth.admin.listUsers();
  const existing = data.users.find((u) => u.email === EMAIL);
  if (!existing) throw created.error;
  userId = existing.id;
  await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
} else {
  userId = created.data.user.id;
}

// upsert the profile (role=staff, scoped to the demo restaurant)
await admin
  .from("profiles")
  .upsert(
    {
      id: userId,
      restaurant_id: DEMO_ID,
      role: "staff",
      full_name: "Demo Kitchen",
      is_active: true,
    },
    { onConflict: "id" },
  );

console.log("✅ Demo kitchen staff ready");
console.log(`   URL:      /kitchen/friends-fries-cafe`);
console.log(`   email:    ${EMAIL}`);
console.log(`   password: ${PASSWORD}`);
