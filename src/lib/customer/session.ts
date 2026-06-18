/**
 * Per-visit table session token. Separate from the permanent qr_token: it
 * rotates each visit and dies when the table is cleared, so a past guest's old
 * link can't touch the current order. Friends "join" via a ?s= link.
 *
 * Stored in BOTH localStorage (for client RPC calls + the share link) AND a
 * cookie keyed by qr_token (so the server-rendered status/bill pages can read it
 * and pass it to resolve_table). The menu (MenuLoader) is the client-side claim
 * point that establishes both.
 */
const lsKey = (qr: string) => `sd-session-${qr}`;
export const cookieKey = (qr: string) => `sd_session_${qr}`;
const COOKIE_MAX_AGE = 60 * 60 * 6; // 6h — covers a long meal

export function getSessionToken(qr: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lsKey(qr));
  } catch {
    return null;
  }
}

export function setSessionToken(qr: string, token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(lsKey(qr), token);
  } catch {
    /* private mode / blocked storage — non-fatal */
  }
  try {
    document.cookie = `${cookieKey(qr)}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function clearSessionToken(qr: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lsKey(qr));
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${cookieKey(qr)}=; path=/; max-age=0`;
  } catch {
    /* ignore */
  }
}
