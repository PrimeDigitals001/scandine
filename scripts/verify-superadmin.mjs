/**
 * ScanDine — Super Admin portal smoke test (requires `npm run dev` running).
 * Verifies the auth guard, session cookie, dashboard render, and QR endpoints.
 *
 * Run:  node scripts/verify-superadmin.mjs
 */
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";

try {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEMO_ID = "11111111-1111-1111-1111-111111111111";

const token = await new SignJWT({
  role: "super_admin",
  email: process.env.SUPER_ADMIN_EMAIL,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.SUPER_ADMIN_SESSION_SECRET));

const cookie = { Cookie: `sd_superadmin=${token}` };
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"}  ${name}${detail ? `  —  ${detail}` : ""}`);
  if (cond) pass++;
  else fail++;
};

// 1. Guard: unauthenticated dashboard → redirect to login
const g = await fetch(`${BASE}/superadmin/dashboard`, { redirect: "manual" });
ok(
  "unauthenticated /superadmin/dashboard redirects to login",
  g.status >= 300 && g.status < 400 && (g.headers.get("location") ?? "").includes("/superadmin/login"),
  `status ${g.status} → ${g.headers.get("location") ?? "?"}`,
);

// 2. Login page renders
const lp = await fetch(`${BASE}/superadmin/login`);
ok("/superadmin/login renders", lp.status === 200);

// 3. QR endpoint blocked without session
const q0 = await fetch(`${BASE}/api/superadmin/qr/demo`, { redirect: "manual" });
ok("QR endpoint blocked without session", q0.status === 401, `status ${q0.status}`);

// 4. QR endpoint returns a PNG with a valid session
const q1 = await fetch(`${BASE}/api/superadmin/qr/demo`, { headers: cookie });
const q1buf = q1.ok ? await q1.arrayBuffer() : new ArrayBuffer(0);
const isPng =
  q1buf.byteLength > 100 && new Uint8Array(q1buf)[0] === 0x89 && new Uint8Array(q1buf)[1] === 0x50;
ok(
  "authenticated QR PNG endpoint returns a real PNG",
  q1.status === 200 && q1.headers.get("content-type") === "image/png" && isPng,
  `${q1.status}, ${q1buf.byteLength} bytes`,
);

// 5. Dashboard renders with session + shows the demo café
const d = await fetch(`${BASE}/superadmin/dashboard`, { headers: cookie });
const dhtml = d.ok ? await d.text() : "";
ok(
  "authenticated dashboard renders + lists the demo café",
  d.status === 200 && dhtml.includes("Friends &amp; Fries"),
  `status ${d.status}`,
);

// 6. Bulk QR ZIP for the demo restaurant
const z = await fetch(`${BASE}/api/superadmin/qr-zip/${DEMO_ID}`, { headers: cookie });
const zbuf = z.ok ? await z.arrayBuffer() : new ArrayBuffer(0);
const isZip = zbuf.byteLength > 100 && new Uint8Array(zbuf)[0] === 0x50 && new Uint8Array(zbuf)[1] === 0x4b;
ok(
  "authenticated bulk QR ZIP returns a real zip",
  z.status === 200 && isZip,
  `${z.status}, ${zbuf.byteLength} bytes`,
);

console.log(`\n${fail === 0 ? "🎉" : "⚠️ "} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
