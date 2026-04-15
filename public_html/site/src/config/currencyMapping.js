/** Aligned with erp-app `countryMeta.js` (CURATED_COUNTRIES + CURRENCY_CODE_TO_APP). */
export const CURRENCY_BY_COUNTRY = {
  LK: { code: "LKR", symbol: "Rs" },
  IN: { code: "INR", symbol: "₹" },
  PK: { code: "PKR", symbol: "PKR" },
  BD: { code: "BDT", symbol: "BDT" },
  MV: { code: "MVR", symbol: "MVR" },
  NP: { code: "NPR", symbol: "NPR" },
  AE: { code: "AED", symbol: "AED" },
  SA: { code: "SAR", symbol: "SAR" },
  QA: { code: "QAR", symbol: "QAR" },
  KW: { code: "KWD", symbol: "KWD" },
  BH: { code: "BHD", symbol: "BHD" },
  OM: { code: "OMR", symbol: "OMR" },
  MY: { code: "MYR", symbol: "MYR" },
  SG: { code: "SGD", symbol: "SGD" },
  ID: { code: "IDR", symbol: "IDR" },
  TH: { code: "THB", symbol: "฿" },
  PH: { code: "PHP", symbol: "₱" },
  VN: { code: "VND", symbol: "VND" },
  CN: { code: "CNY", symbol: "CNY" },
  JP: { code: "JPY", symbol: "¥" },
  KR: { code: "KRW", symbol: "₩" },
  US: { code: "USD", symbol: "$" },
  GB: { code: "GBP", symbol: "£" },
  CA: { code: "CAD", symbol: "CAD" },
  AU: { code: "AUD", symbol: "AUD" },
  DE: { code: "EUR", symbol: "€" },
  FR: { code: "EUR", symbol: "€" },
  IT: { code: "EUR", symbol: "€" },
};

export const DEFAULT_CURRENCY = { code: "USD", symbol: "$" };

function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    if (
      obj[prop] &&
      typeof obj[prop] === "object" &&
      !Object.isFrozen(obj[prop])
    ) {
      deepFreeze(obj[prop]);
    }
  });
  return Object.freeze(obj);
}

/** Dev server, or `localStorage.setItem("debugPricing", "1")` — checked each call (no reload). */
export function isDebugPricing() {
  return (
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.localStorage.getItem("debugPricing") === "1")
  );
}

/** Single source for region tier multipliers (import from here or via pricingConfig re-export). */
export const REGION_MULTIPLIERS = deepFreeze({
  SOUTH_ASIA: 1,
  SEA: 2,
  GCC: 3,
  JP_SG_KR: 3,
  WEST: 4,
});

/** Minimum display amount per currency (after primary rounding). Unlisted → 0 (no floor). */
export const MIN_PRICE = deepFreeze({
  USD: 5,
  AED: 20,
  INR: 200,
  LKR: 500,
});

/** Hard cap on any displayed price (safety). */
export const MAX_PRICE = 100000;

/**
 * Pricing pipeline (all sections use `convertLkrNominalToDisplay` via App.jsx):
 * 1. lkrValue = baseLKR × regionMultiplier
 * 2. If currency === LKR → skip FX; else converted = lkrValue / safeDivisor (USD fallback; divisor ≥ 1)
 * 3. Unknown currency code → USD rate. Non-finite converted → fallback: round lkrValue (LKR units).
 * 4. display = roundToNearest10(converted or lkrValue for LKR branch)
 * 5. display = clamp to MIN_PRICE[currency] and MAX_PRICE
 * 6. UI: integer + comma format (no decimals)
 */

/**
 * Round **up** to next multiple of 10: 36 → 40, 41 → 50, 100 → 100.
 */
export function roundToNearest10(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value / 10) * 10;
}

/**
 * Optional future tiered rounding (not used in production yet — swap in place of roundToNearest10 if needed).
 */
export function smartRoundUp(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value < 100) return Math.ceil(value / 10) * 10;
  if (value < 1000) return Math.ceil(value / 50) * 50;
  return Math.ceil(value / 100) * 100;
}

/**
 * Future per-currency rounding (not wired into production — use roundToNearest10 today).
 */
export function roundByCurrency(value, currency) {
  const c = String(currency).toUpperCase();
  if (c === "JPY") return Math.ceil(value / 100) * 100;
  return Math.ceil(value / 10) * 10;
}

function applyMinMaxFloor(display, currencyCode) {
  const code = String(currencyCode).toUpperCase();
  let d = display;
  d = Math.max(d, MIN_PRICE[code] ?? 0);
  d = Math.min(d, MAX_PRICE);
  return d;
}

/**
 * LKR per 1 unit of target currency (LKR needed to buy 1 unit of foreign currency).
 * Indicative mid-market reference — Apr 2026 tier (update periodically; not live FX).
 * Derived from USD/LKR ~316 and cross-rates vs USD.
 */
export const LKR_PER_ONE_UNIT = deepFreeze({
  LKR: 1,
  USD: 316,
  AED: 86,
  SAR: 84,
  QAR: 87,
  KWD: 1033,
  BHD: 840,
  OMR: 821,
  INR: 3.78,
  PKR: 1.13,
  BDT: 2.61,
  NPR: 2.34,
  MVR: 20.5,
  MYR: 71,
  SGD: 234,
  IDR: 0.0195,
  THB: 9.35,
  PHP: 5.62,
  VND: 0.0125,
  CNY: 44,
  JPY: 2.1,
  KRW: 0.228,
  EUR: 366,
  GBP: 421,
  CAD: 229,
  AUD: 204,
});

if (import.meta.env.DEV) {
  Object.entries(LKR_PER_ONE_UNIT).forEach(([code, rate]) => {
    if (!rate || rate <= 0) {
      console.warn(`Invalid currency rate for ${code}:`, rate);
    }
  });
}

/**
 * Single source of truth for standalone, LAN/client, and cloud display amounts.
 *
 * @param {number} amountLkr - Must be baseLKR × multiplier only (never convert before multiplier).
 * @param {string} currencyCode - ISO 4217; missing key → USD divisor.
 * @param {{ baseLKR?: number, multiplier?: number } | null} [debugCtx] - Optional; logs when isDebugPricing() is true.
 * @returns {number} Whole number, ready for comma formatting (no decimals).
 */
export function convertLkrNominalToDisplay(amountLkr, currencyCode = "USD", debugCtx = null) {
  if (!Number.isFinite(amountLkr) || amountLkr < 0) return 0;

  const code = String(currencyCode).toUpperCase();
  let display;
  /** Pre-FX converted rate (units of target currency), for dev log */
  let convertedRaw = null;

  if (code === "LKR") {
    display = roundToNearest10(amountLkr);
  } else {
    const divisor = LKR_PER_ONE_UNIT[code] ?? LKR_PER_ONE_UNIT.USD;
    const safeDivisor =
      typeof divisor === "number" && divisor > 0 ? divisor : 1;
    const converted = amountLkr / safeDivisor;
    convertedRaw = converted;
    if (!Number.isFinite(converted)) {
      display = roundToNearest10(amountLkr);
    } else {
      display = roundToNearest10(converted);
    }
  }

  display = applyMinMaxFloor(display, code);

  if (isDebugPricing() && debugCtx) {
    const lkrValue = amountLkr;
    const currency = code;
    const converted = convertedRaw;
    console.log("[pricing]", {
      baseLKR: debugCtx?.baseLKR ?? null,
      multiplier: debugCtx?.multiplier ?? null,
      lkrValue,
      currency,
      converted,
      final: display,
    });
  }

  return display;
}

/** Same order as erp-app `CURATED_COUNTRIES` / marketing `regionSupport`. */
export const COUNTRY_OPTIONS = [
  { code: "LK", name: "Sri Lanka" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "MV", name: "Maldives" },
  { code: "NP", name: "Nepal" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
];

/** ISO codes accepted for `forceCountry` / dev `setCountry` — mirrors COUNTRY_OPTIONS. */
export const SUPPORTED_FORCE_COUNTRY_CODES = deepFreeze(
  COUNTRY_OPTIONS.map(({ code }) => code)
);

export const getCurrencyByCountry = (countryCode = "") =>
  CURRENCY_BY_COUNTRY[countryCode.toUpperCase()] || DEFAULT_CURRENCY;
