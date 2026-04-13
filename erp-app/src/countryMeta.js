/**
 * Curated country list only — single source of truth for country ↔ ISO 4217 ↔ invoice language suggestions.
 * tc3_settings.currency stores APP symbols (Rs, ₹, VND, …) via CURRENCY_CODE_TO_APP.
 */
import { INVOICE_LANG_KEYS } from "./config/invoicePrintLabels.js";

function filterKnown(codes) {
  return (codes || []).filter(function (c) {
    return c && INVOICE_LANG_KEYS.indexOf(c) >= 0;
  });
}

/** ISO 4217 → value stored in tc3_settings.currency (matches existing app conventions). */
export var CURRENCY_CODE_TO_APP = {
  LKR: "Rs",
  INR: "₹",
  PKR: "PKR",
  BDT: "BDT",
  MVR: "MVR",
  NPR: "NPR",
  AED: "AED",
  SAR: "SAR",
  QAR: "QAR",
  KWD: "KWD",
  BHD: "BHD",
  OMR: "OMR",
  MYR: "MYR",
  SGD: "SGD",
  IDR: "IDR",
  THB: "฿",
  PHP: "₱",
  VND: "VND",
  CNY: "CNY",
  JPY: "¥",
  KRW: "₩",
  USD: "$",
  GBP: "£",
  CAD: "CAD",
  AUD: "AUD",
  EUR: "€",
};

/**
 * Fixed retail country list (order: South Asia → GCC → SEA → East Asia → Western).
 * currencyCode = ISO 4217; languages = suggested optional invoice print codes (non-English).
 */
export var CURATED_COUNTRIES = [
  { code: "LK", name: "Sri Lanka", currencyCode: "LKR", languages: ["si", "ta"] },
  { code: "IN", name: "India", currencyCode: "INR", languages: ["hi", "ta", "te", "kn", "ml", "ur", "bn"] },
  { code: "PK", name: "Pakistan", currencyCode: "PKR", languages: ["ur"] },
  { code: "BD", name: "Bangladesh", currencyCode: "BDT", languages: ["bn"] },
  { code: "MV", name: "Maldives", currencyCode: "MVR", languages: ["dv"] },
  { code: "NP", name: "Nepal", currencyCode: "NPR", languages: ["ne"] },
  { code: "AE", name: "United Arab Emirates", currencyCode: "AED", languages: ["ar"] },
  { code: "SA", name: "Saudi Arabia", currencyCode: "SAR", languages: ["ar"] },
  { code: "QA", name: "Qatar", currencyCode: "QAR", languages: ["ar"] },
  { code: "KW", name: "Kuwait", currencyCode: "KWD", languages: ["ar"] },
  { code: "BH", name: "Bahrain", currencyCode: "BHD", languages: ["ar"] },
  { code: "OM", name: "Oman", currencyCode: "OMR", languages: ["ar"] },
  { code: "MY", name: "Malaysia", currencyCode: "MYR", languages: ["ms"] },
  { code: "SG", name: "Singapore", currencyCode: "SGD", languages: [] },
  { code: "ID", name: "Indonesia", currencyCode: "IDR", languages: ["id"] },
  { code: "TH", name: "Thailand", currencyCode: "THB", languages: ["th"] },
  { code: "PH", name: "Philippines", currencyCode: "PHP", languages: ["fil"] },
  { code: "VN", name: "Vietnam", currencyCode: "VND", languages: ["vi"] },
  { code: "CN", name: "China", currencyCode: "CNY", languages: ["zh"] },
  { code: "JP", name: "Japan", currencyCode: "JPY", languages: ["ja"] },
  { code: "KR", name: "South Korea", currencyCode: "KRW", languages: ["ko"] },
  { code: "US", name: "United States", currencyCode: "USD", languages: [] },
  { code: "GB", name: "United Kingdom", currencyCode: "GBP", languages: [] },
  { code: "CA", name: "Canada", currencyCode: "CAD", languages: [] },
  { code: "AU", name: "Australia", currencyCode: "AUD", languages: [] },
  { code: "DE", name: "Germany", currencyCode: "EUR", languages: [] },
  { code: "FR", name: "France", currencyCode: "EUR", languages: [] },
  { code: "IT", name: "Italy", currencyCode: "EUR", languages: [] },
];

var BY_ISO = {};
CURATED_COUNTRIES.forEach(function (r) {
  BY_ISO[r.code] = r;
});

/** Canonical ISO2 when user picks this app currency symbol (€ → Germany). */
export var PRIMARY_COUNTRY_BY_APP_SYMBOL = {};
CURATED_COUNTRIES.forEach(function (r) {
  var sym = CURRENCY_CODE_TO_APP[r.currencyCode];
  if (sym === "€") return;
  if (!PRIMARY_COUNTRY_BY_APP_SYMBOL[sym]) PRIMARY_COUNTRY_BY_APP_SYMBOL[sym] = r.code;
});
PRIMARY_COUNTRY_BY_APP_SYMBOL["€"] = "DE";

/** Legacy export name used by App.jsx */
export var PRIMARY_COUNTRY_BY_CURRENCY = PRIMARY_COUNTRY_BY_APP_SYMBOL;

/** Full meta map: ISO2 → { name, currencyCode, currency (app), languages } */
export var COUNTRY_META = {};
CURATED_COUNTRIES.forEach(function (r) {
  COUNTRY_META[r.code] = {
    name: r.name,
    currencyCode: r.currencyCode,
    currency: CURRENCY_CODE_TO_APP[r.currencyCode],
    languages: filterKnown(r.languages || []),
  };
});

/**
 * @returns {{ name: string, currencyCode: string, currency: string, languages: string[] } | null}
 */
export function getCountryMeta(iso2) {
  if (!iso2) return null;
  var u = String(iso2).toUpperCase();
  return COUNTRY_META[u] ? Object.assign({}, COUNTRY_META[u]) : null;
}

export function getPrimaryCountryForCurrency(appCurrencySymbol) {
  if (!appCurrencySymbol) return "";
  return PRIMARY_COUNTRY_BY_APP_SYMBOL[appCurrencySymbol] || "";
}

/** Curated currencies only (deduped), for Language & Currency settings. */
export var APP_CURRENCY_OPTIONS = (function () {
  var seen = {};
  var out = [];
  CURATED_COUNTRIES.forEach(function (r) {
    var sym = CURRENCY_CODE_TO_APP[r.currencyCode];
    if (seen[sym]) return;
    seen[sym] = true;
    var labelMap = {
      Rs: "Sri Lankan Rupee (LKR / Rs)",
      "₹": "Indian Rupee (INR / ₹)",
      PKR: "Pakistani Rupee (PKR)",
      BDT: "Bangladeshi Taka (BDT)",
      MVR: "Maldivian Rufiyaa (MVR)",
      NPR: "Nepali Rupee (NPR)",
      AED: "UAE Dirham (AED)",
      SAR: "Saudi Riyal (SAR)",
      QAR: "Qatari Riyal (QAR)",
      KWD: "Kuwaiti Dinar (KWD)",
      BHD: "Bahraini Dinar (BHD)",
      OMR: "Omani Rial (OMR)",
      MYR: "Malaysian Ringgit (MYR)",
      SGD: "Singapore Dollar (SGD)",
      IDR: "Indonesian Rupiah (IDR)",
      "฿": "Thai Baht (THB / ฿)",
      "₱": "Philippine Peso (PHP / ₱)",
      VND: "Vietnamese Dong (VND)",
      CNY: "Chinese Yuan (CNY)",
      "¥": "Japanese Yen (JPY / ¥)",
      "₩": "South Korean Won (KRW / ₩)",
      $: "US Dollar (USD / $)",
      "£": "British Pound (GBP / £)",
      CAD: "Canadian Dollar (CAD)",
      AUD: "Australian Dollar (AUD)",
      "€": "Euro (EUR / €)",
    };
    out.push({ value: sym, label: labelMap[sym] || sym });
  });
  return out;
})();
