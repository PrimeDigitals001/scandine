/**
 * ScanDine — create the public `menu-images` Storage bucket on hosted Supabase.
 * Idempotent: safe to run repeatedly. Run once after setting up the project.
 *
 * Run:  node scripts/setup-storage.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const BUCKET = "menu-images";
const { data: buckets, error: lErr } = await svc.storage.listBuckets();
if (lErr) {
  console.error("listBuckets failed:", lErr.message);
  process.exit(1);
}

if (buckets?.some((b) => b.name === BUCKET)) {
  console.log(`✅ bucket "${BUCKET}" already exists`);
  process.exit(0);
}

const { error } = await svc.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: "5MB",
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
});
if (error) {
  console.error("createBucket failed:", error.message);
  process.exit(1);
}
console.log(`✅ created public bucket "${BUCKET}"`);
