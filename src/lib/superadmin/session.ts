import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Super-admin session token (signed JWT in an httpOnly cookie). Deliberately
 * SEPARATE from Supabase Auth — no Supabase user ever holds super_admin.
 * This module is edge-safe (jose + Web Crypto only) so the proxy/middleware
 * can verify it; password hashing (bcrypt) lives in the Node-only auth.ts.
 */

export const SUPERADMIN_COOKIE = "sd_superadmin";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h

function secretKey() {
  const secret = process.env.SUPER_ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("SUPER_ADMIN_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SuperAdminSession extends JWTPayload {
  role: "super_admin";
  email: string;
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ role: "super_admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SuperAdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.role !== "super_admin") return null;
    return payload as SuperAdminSession;
  } catch {
    return null; // expired / tampered / wrong secret
  }
}
