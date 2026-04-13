/**
 * Optional invoice languages + persistence helpers.
 * Country → language suggestions come from countryMeta.js (single source of truth).
 */
import { INVOICE_LANG_KEYS, normalizeOptionalInvoiceLangs } from "./invoicePrintLabels.js";
import { getCountryMeta, CURATED_COUNTRIES } from "../countryMeta.js";

export { CURATED_COUNTRIES };

function filterKnown(codes) {
  return (codes || []).filter(function (c) {
    return c && INVOICE_LANG_KEYS.indexOf(c) >= 0;
  });
}

export function getSuggestedOptionalLangsForCountry(iso2) {
  var m = getCountryMeta(iso2);
  if (!m) return [];
  return filterKnown(m.languages || []);
}

export function mergeOptionalForCountryChange(defaultLang, newCountryIso, customInvoiceLangs) {
  var cust = Array.isArray(customInvoiceLangs) ? customInvoiceLangs.filter(Boolean) : [];
  var sugg = getSuggestedOptionalLangsForCountry(newCountryIso);
  return normalizeOptionalInvoiceLangs(defaultLang || "en", cust.concat(sugg));
}

function uniq(arr) {
  var seen = {};
  return (arr || []).filter(function (x) {
    if (!x || seen[x]) return false;
    seen[x] = true;
    return true;
  });
}

export function sanitizePersistedInvoiceLangs(defaultLang, optionalArr, customArr) {
  var d = defaultLang || "en";
  function valid(x) {
    return x && INVOICE_LANG_KEYS.indexOf(x) >= 0 && x !== d;
  }
  var c = uniq((Array.isArray(customArr) ? customArr : []).filter(valid));
  var o = uniq((Array.isArray(optionalArr) ? optionalArr : []).filter(valid));
  var merged = uniq(c.concat(o));
  return {
    optionalInvoiceLangs: normalizeOptionalInvoiceLangs(d, merged),
    customInvoiceLangs: c.filter(function (x) {
      return normalizeOptionalInvoiceLangs(d, merged).indexOf(x) >= 0;
    }),
  };
}
