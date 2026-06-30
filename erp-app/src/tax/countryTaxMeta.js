/**
 * Country-aware default tax suggestions (rates are editable in settings).
 * Merging on country change keeps custom taxes and preserves matching non-custom rates when possible.
 */

export var COUNTRY_TAX_META = {
  LK: [
    { name: "SSCL", rate: 2.5, order: 1, appliesOn: "net" },
    { name: "VAT", rate: 15, order: 2, appliesOn: "running" },
    { name: "NBT", rate: 2, order: 3, appliesOn: "net", enabled: false },
  ],
  IN: [{ name: "GST", rate: 18 }],
  PK: [{ name: "Sales Tax", rate: 17 }],
  BD: [{ name: "VAT", rate: 15 }],
  MV: [{ name: "GST", rate: 8 }],
  NP: [{ name: "VAT", rate: 13 }],
  AE: [{ name: "VAT", rate: 5 }],
  SA: [{ name: "VAT", rate: 15 }],
  QA: [{ name: "VAT", rate: 0 }],
  KW: [{ name: "VAT", rate: 0 }],
  BH: [{ name: "VAT", rate: 10 }],
  OM: [{ name: "VAT", rate: 5 }],
  MY: [{ name: "SST", rate: 10 }],
  SG: [{ name: "GST", rate: 9 }],
  ID: [{ name: "PPN", rate: 11 }],
  TH: [{ name: "VAT", rate: 7 }],
  PH: [{ name: "VAT", rate: 12 }],
  VN: [{ name: "VAT", rate: 10 }],
  CN: [{ name: "VAT", rate: 13 }],
  JP: [{ name: "Consumption Tax", rate: 10 }],
  KR: [{ name: "VAT", rate: 10 }],
  US: [{ name: "Sales Tax", rate: 0 }],
  GB: [{ name: "VAT", rate: 20 }],
  CA: [{ name: "GST/HST", rate: 5 }],
  AU: [{ name: "GST", rate: 10 }],
  DE: [{ name: "VAT", rate: 19 }],
  FR: [{ name: "VAT", rate: 20 }],
  IT: [{ name: "VAT", rate: 22 }],
};

function normName(n) {
  return String(n || "").trim().toLowerCase();
}

/**
 * On country change: suggested rows from COUNTRY_TAX_META; preserve prior rate for same name (non-custom);
 * append all previous rows with custom: true (deduped by name).
 */
export function mergeTaxesOnCountryChange(newCountryIso, previousSelectedTaxes) {
  var prev = Array.isArray(previousSelectedTaxes) ? previousSelectedTaxes.filter(Boolean) : [];
  var u = String(newCountryIso || "").toUpperCase();
  var suggested = u ? (COUNTRY_TAX_META[u] || []) : [];
  var customs = prev.filter(function (t) { return t.custom; });

  var merged = suggested.map(function (s) {
    var nm = normName(s.name);
    var old = prev.find(function (p) {
      return p && !p.custom && normName(p.name) === nm;
    });
    var rate = typeof s.rate === "number" ? s.rate : parseFloat(s.rate) || 0;
    if (old && typeof old.rate === "number" && !isNaN(old.rate)) {
      rate = old.rate;
    }
    return { name: s.name, rate: rate, enabled: old ? old.enabled !== false : true, custom: false, order: s.order, appliesOn: s.appliesOn === "running" ? "running" : "net" };
  });

  var seen = {};
  merged.forEach(function (t) {
    seen[normName(t.name)] = true;
  });
  customs.forEach(function (c) {
    var key = normName(c.name);
    if (!key || seen[key]) return;
    merged.push({
      name: String(c.name).trim(),
      rate: typeof c.rate === "number" ? c.rate : parseFloat(c.rate) || 0,
      enabled: c.enabled !== false,
      custom: true,
      order: typeof c.order === "number" ? c.order : merged.length + 1,
      appliesOn: c.appliesOn === "running" ? "running" : "net",
    });
    seen[key] = true;
  });
  return merged;
}

export function normalizeTaxList(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(function (t) {
      if (!t || !String(t.name || "").trim()) return null;
      var rate = typeof t.rate === "number" ? t.rate : parseFloat(t.rate);
      if (isNaN(rate)) rate = 0;
      rate = Math.max(0, Math.min(100, rate));
      return {
        name: String(t.name).trim(),
        rate: rate,
        enabled: t.enabled !== false,
        custom: !!t.custom,
        order: typeof t.order === "number" ? t.order : undefined,
        appliesOn: t.appliesOn === "running" ? "running" : "net",
      };
    })
    .filter(Boolean);
}
