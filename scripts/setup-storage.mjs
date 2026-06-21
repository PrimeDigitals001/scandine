/**
 * ScanDine — create the public Storage buckets on hosted Supabase:
 *   menu-images  — dish photos (png/jpg/webp, ≤5 MB)
 *   menu-videos  — short dish clips (mp4/webm, ≤20 MB) shown instead of the photo
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

const BUCKETS = [
  {
    name: "menu-images",
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  {
    name: "menu-videos",
    fileSizeLimit: "20MB",
    allowedMimeTypes: ["video/mp4", "video/webm"],
  },
];

const { data: existing, error: lErr } = await svc.storage.listBuckets();
if (lErr) {
  console.error("listBuckets failed:", lErr.message);
  process.exit(1);
}

for (const b of BUCKETS) {
  if (existing?.some((e) => e.name === b.name)) {
    console.log(`✅ bucket "${b.name}" already exists`);
    continue;
  }
  const { error } = await svc.storage.createBucket(b.name, {
    public: true,
    fileSizeLimit: b.fileSizeLimit,
    allowedMimeTypes: b.allowedMimeTypes,
  });
  if (error) {
    console.error(`createBucket "${b.name}" failed:`, error.message);
    process.exit(1);
  }
  console.log(`✅ created public bucket "${b.name}"`);
}
