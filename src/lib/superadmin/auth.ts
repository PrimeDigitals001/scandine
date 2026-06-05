import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  SUPERADMIN_COOKIE,
  verifySessionToken,
  type SuperAdminSession,
} from "./session";

/**
 * Verify the super-admin email + password against the env credentials.
 * Node-only (bcrypt). Email compared case-insensitively; password via bcrypt.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  const expectedEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const hash = process.env.SUPER_ADMIN_PASSWORD_HASH ?? "";
  if (!expectedEmail || !hash) return false;

  const emailOk = email.trim().toLowerCase() === expectedEmail;
  // Always run bcrypt to keep timing roughly constant whether or not email matched.
  const passOk = await bcrypt.compare(password, hash);
  return emailOk && passOk;
}

/** Read + verify the current super-admin session from cookies (server-side). */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SUPERADMIN_COOKIE)?.value);
}

/** Throw if not a valid super-admin — call at the top of every privileged action. */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await getSuperAdminSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
