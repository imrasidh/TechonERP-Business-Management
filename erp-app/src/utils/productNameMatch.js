/**
 * Product name duplicate detection — exact, same-core fingerprint, subset tokens.
 * Live similar-product suggestions while typing a new product name.
 */

import { productMatchesSearch } from "./productSearch.js";

var PRODUCT_NAME_STOP_WORDS = {
  laptop: 1, laptops: 1, notebook: 1, notebooks: 1,
  computer: 1, computers: 1, pc: 1, desktop: 1, desktops: 1,
  monitor: 1, monitors: 1, display: 1, displays: 1,
  printer: 1, printers: 1,
  mouse: 1, keyboard: 1, bag: 1, bags: 1, case: 1, cases: 1,
  new: 1, used: 1, refurbished: 1, original: 1, genuine: 1,
  thinkpad: 1, ideapad: 1, latitude: 1, inspiron: 1, pavilion: 1,
  victus: 1, nitro: 1, aspire: 1, vivobook: 1, zenbook: 1,
  macbook: 1, surface: 1, elitebook: 1, probook: 1, legion: 1,
  yoga: 1, envy: 1, spectre: 1, chromebook: 1, ultrabook: 1,
};

function normalizeProductNameText(name) {
  return String(name == null ? "" : name).trim().toLowerCase();
}

function tokenizeProductName(name) {
  return normalizeProductNameText(name)
    .split(/[\s/|,;:()\-+]+/)
    .map(function (t) { return t.replace(/[^a-z0-9]/g, ""); })
    .filter(function (t) {
      if (!t || PRODUCT_NAME_STOP_WORDS[t]) return false;
      return t.length >= 2 || /\d/.test(t);
    });
}

export function productNameFingerprint(name) {
  var tokens = tokenizeProductName(name);
  if (!tokens.length) return "";
  return tokens.slice().sort().join("|");
}

function activeProducts(products, excludeId) {
  return (products || []).filter(function (p) {
    return p && p.status !== "inactive" && (!excludeId || p.id !== excludeId);
  });
}

function toMatchRow(p, relation) {
  return {
    id: p.id,
    name: p.name,
    barcode: p.barcode || "",
    category: p.category || "",
    productId: p.productId || "",
    relation: relation || "",
  };
}

/** How two product names relate (null if unrelated). */
export function getProductNameRelation(nameA, nameB) {
  var na = normalizeProductNameText(nameA);
  var nb = normalizeProductNameText(nameB);
  if (!na || !nb) return null;
  if (na === nb) return "exact";

  var fpA = productNameFingerprint(nameA);
  var fpB = productNameFingerprint(nameB);
  if (fpA && fpA === fpB) return "same_core";

  var tokA = tokenizeProductName(nameA);
  var tokB = tokenizeProductName(nameB);
  if (!tokA.length || !tokB.length) return null;

  var modelsA = tokA.filter(function (t) { return /\d/.test(t); });
  var modelsB = tokB.filter(function (t) { return /\d/.test(t); });
  if (modelsA.length && modelsB.length) {
    var sharedModels = modelsA.filter(function (m) { return modelsB.indexOf(m) >= 0; });
    if (!sharedModels.length) return null;
  }

  var smaller = tokA.length <= tokB.length ? tokA : tokB;
  var larger = tokA.length <= tokB.length ? tokB : tokA;
  var subset = smaller.every(function (t) { return larger.indexOf(t) >= 0; });
  if (subset && smaller.length >= 1) return "subset";

  return null;
}

function scoreProductNameCandidate(query, product) {
  var relation = getProductNameRelation(query, product.name);
  var score = 0;
  if (relation === "exact") score = 100;
  else if (relation === "same_core") score = 85;
  else if (relation === "subset") score = 75;
  else if (productMatchesSearch(product, query)) score = 45;
  else {
    var qTok = tokenizeProductName(query);
    var pTok = tokenizeProductName(product.name);
    var common = qTok.filter(function (t) { return pTok.indexOf(t) >= 0; });
    if (common.length) score = common.length * 12;
  }
  return { score: score, relation: relation || (score >= 40 ? "search" : "") };
}

/** Live suggestions while typing — ranked list of similar existing products. */
export function findSimilarProductNameCandidates(name, products, excludeId, limit) {
  var trimmed = normalizeProductNameText(name);
  var max = limit != null ? limit : 5;
  if (trimmed.length < 2) return [];

  var list = activeProducts(products, excludeId);
  var ranked = [];

  list.forEach(function (p) {
    var scored = scoreProductNameCandidate(trimmed, p);
    if (scored.score <= 0) return;
    ranked.push({
      score: scored.score,
      relation: scored.relation,
      match: toMatchRow(p, scored.relation),
    });
  });

  ranked.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.match.name).localeCompare(String(b.match.name));
  });

  var seen = {};
  var out = [];
  ranked.forEach(function (row) {
    if (seen[row.match.id]) return;
    seen[row.match.id] = 1;
    out.push(row);
  });
  return out.slice(0, max);
}

export function evaluateProductNameMatch(name, products, excludeId) {
  var trimmed = normalizeProductNameText(name);
  if (!trimmed) return null;

  var list = activeProducts(products, excludeId);
  var exactMatches = [];
  var likelyMatches = [];

  list.forEach(function (p) {
    var rel = getProductNameRelation(trimmed, p.name);
    if (rel === "exact") exactMatches.push(toMatchRow(p, rel));
    else if (rel === "same_core" || rel === "subset") likelyMatches.push(toMatchRow(p, rel));
  });

  if (exactMatches.length) {
    return { type: "exact", matches: exactMatches };
  }
  if (likelyMatches.length) {
    return { type: "likely_same", matches: likelyMatches.slice(0, 5) };
  }

  var live = findSimilarProductNameCandidates(trimmed, products, excludeId, 5).filter(function (row) {
    return row.relation === "search" && row.score >= 40;
  });
  if (live.length) {
    return { type: "search_hint", matches: live.map(function (row) { return row.match; }) };
  }

  return null;
}

/** Back-compat wrapper used by save handlers. */
export function checkProductName(name, products, excludeId) {
  var result = evaluateProductNameMatch(name, products, excludeId);
  if (!result) return null;
  if (result.type === "search_hint") return null;
  return {
    type: result.type === "likely_same" ? "likely_same" : result.type,
    match: result.matches[0] ? result.matches[0].name : "",
    matches: result.matches,
  };
}
