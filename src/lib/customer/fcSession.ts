/**
 * Food-court client session state (localStorage only — the whole /court flow
 * resolves client-side, so no server cookie is needed, unlike single-café).
 *
 *  - SEAT session (shared_table mode): one secret per visit, claimed by
 *    resolve_food_court_store, shared across every store the party orders from.
 *  - Per-store ORDER pointer: after placing, we remember {orderId, sessionToken}
 *    for that (court, store) so the status screen knows which order to track.
 *    For pickup the sessionToken is the order's own minted token; for shared it
 *    is the seat session.
 */
const seatKey = (token: string) => `sd-fcseat-${token}`;
const orderKey = (token: string, slug: string) => `sd-fcorder-${token}-${slug}`;
const courtKey = (token: string) => `sd-fccourt-${token}`;

export interface FcOrderPtr {
  orderId: string;
  sessionToken: string;
}

/** One entry per order the customer placed anywhere in this court (for the
 *  cross-store "your orders" overview). */
export interface CourtOrderPtr {
  slug: string;
  name: string;
  orderId: string;
  sessionToken: string;
}

function read<T>(k: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
function remove(k: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// ---- shared-seat session ---------------------------------------------------
export function getSeatSession(token: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(seatKey(token));
  } catch {
    return null;
  }
}
export function setSeatSession(token: string, session: string): void {
  if (typeof window === "undefined" || !session) return;
  try {
    window.localStorage.setItem(seatKey(token), session);
  } catch {
    /* ignore */
  }
}
export function clearSeatSession(token: string): void {
  remove(seatKey(token));
}

// ---- per-store current order pointer ---------------------------------------
export function getFcOrder(token: string, slug: string): FcOrderPtr | null {
  return read<FcOrderPtr>(orderKey(token, slug));
}
export function setFcOrder(token: string, slug: string, ptr: FcOrderPtr): void {
  write(orderKey(token, slug), ptr);
}
export function clearFcOrder(token: string, slug: string): void {
  remove(orderKey(token, slug));
}

// ---- court-wide order index (cross-store overview) --------------------------
export function getCourtOrders(token: string): CourtOrderPtr[] {
  return read<CourtOrderPtr[]>(courtKey(token)) ?? [];
}
export function addCourtOrder(token: string, ptr: CourtOrderPtr): void {
  const list = getCourtOrders(token).filter((o) => o.orderId !== ptr.orderId);
  list.push(ptr);
  write(courtKey(token), list);
}
export function removeCourtOrder(token: string, orderId: string): void {
  write(
    courtKey(token),
    getCourtOrders(token).filter((o) => o.orderId !== orderId),
  );
}
