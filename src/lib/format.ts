/**
 * Money & number formatting. Single source of truth so every price across the
 * customer PWA, KDS, admin, and bills renders identically (Indian grouping,
 * tabular figures handled in the component layer via .tnum / tabular-nums).
 */

const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface FormatINROptions {
  /** Show the ₹ symbol (default true). */
  symbol?: boolean;
  /**
   * Force decimals. Default `"auto"`: whole amounts render as ₹150,
   * fractional as ₹150.50. Pass `true` to always show paise (bills),
   * `false` to always drop them.
   */
  decimals?: boolean | "auto";
}

/**
 * Format a rupee amount. Accepts a number or a numeric string
 * (Postgres `decimal(10,2)` arrives as a string over the wire).
 */
export function formatINR(
  amount: number | string,
  { symbol = true, decimals = "auto" }: FormatINROptions = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const n = Number.isFinite(value) ? value : 0;

  const showPaise =
    decimals === "auto" ? !Number.isInteger(n) : Boolean(decimals);
  const body = (showPaise ? INR : INR_WHOLE).format(n);

  return symbol ? `₹${body}` : body;
}
