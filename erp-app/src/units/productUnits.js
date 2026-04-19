/**
 * Multi-level product units: units[] = { name, factor, sellPrice?, cost? }
 * factor = how many base (smallest) units equal one of this unit.
 * Stock is always stored in the base unit (factor === 1).
 * Legacy bulkUnit/bulkConversion/bulkPrice/bulkCost used when units is absent.
 */

function legacyBulkToRows(product) {
  var baseU = product.unit || "Pcs";
  var basePrice = parseFloat(product.price) || 0;
  var baseCost = parseFloat(product.cost) || 0;
  var rows = [{ name: baseU, factor: 1, sellPrice: basePrice, cost: baseCost }];
  var bulkU = String(product.bulkUnit || "").trim();
  var conv = parseFloat(product.bulkConversion) || 0;
  if (product.bulkEnabled !== false && bulkU && conv > 0) {
    rows.push({
      name: bulkU,
      factor: conv,
      sellPrice: parseFloat(product.bulkPrice) || 0,
      cost: parseFloat(product.bulkCost) || 0,
    });
  }
  rows.sort(function (a, b) {
    return a.factor - b.factor;
  });
  return rows;
}

function normalizeStoredUnits(arr, product) {
  var basePrice = parseFloat(product.price) || 0;
  var baseCost = parseFloat(product.cost) || 0;
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i] || {};
    var name = String(r.name || "").trim();
    var factor = parseFloat(r.factor) || 0;
    if (!name || factor <= 0) continue;
    var sellPrice = parseFloat(r.sellPrice) || 0;
    var cost = parseFloat(r.cost) || 0;
    if (factor === 1) {
      if (sellPrice <= 0) sellPrice = basePrice;
      if (cost <= 0) cost = baseCost;
    }
    out.push({ name: name, factor: factor, sellPrice: sellPrice, cost: cost });
  }
  if (out.length === 0) return legacyBulkToRows(product);
  out.sort(function (a, b) {
    return a.factor - b.factor;
  });
  return out;
}

export function isProductsUnitsArray(product) {
  return !!(product && Array.isArray(product.units) && product.units.length > 0);
}

export function getProductUnitRows(product) {
  if (!product) return [{ name: "Pcs", factor: 1, sellPrice: 0, cost: 0 }];
  if (isProductsUnitsArray(product)) return normalizeStoredUnits(product.units, product);
  return legacyBulkToRows(product);
}

export function productHasMultipleSaleUnits(product) {
  return getProductUnitRows(product).length > 1;
}

export function factorForNamedUnit(product, unitName) {
  var rows = getProductUnitRows(product);
  var u = unitName || product.unit || "Pcs";
  var ul = String(u).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name || "").trim().toLowerCase() === ul) return rows[i].factor;
  }
  return null;
}

/** True if `unitName` is the product's base (storage) unit — case-insensitive. */
export function isProductBaseUnitLabel(product, unitName) {
  if (!product) return true;
  var base = String(product.unit != null && String(product.unit).trim() !== "" ? product.unit : "Pcs").trim();
  var u = String(unitName != null && String(unitName).trim() !== "" ? unitName : base).trim();
  return base.toLowerCase() === u.toLowerCase();
}

export function getUnitSellPriceFromRows(product, unit) {
  var rows = getProductUnitRows(product);
  var basePrice = parseFloat(product.price) || 0;
  var u = unit || product.unit || "Pcs";
  var ul = String(u).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row.name || "").trim().toLowerCase() !== ul) continue;
    if (row.factor <= 1) return row.sellPrice > 0 ? row.sellPrice : basePrice;
    if (row.sellPrice > 0) return row.sellPrice;
    return Math.round(basePrice * row.factor * 100) / 100;
  }
  return basePrice;
}

export function getUnitCostFromRows(product, unit) {
  var rows = getProductUnitRows(product);
  var baseCost = parseFloat(product.cost) || 0;
  var u = unit || product.unit || "Pcs";
  var ul = String(u).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row.name || "").trim().toLowerCase() !== ul) continue;
    if (row.factor <= 1) return row.cost > 0 ? row.cost : baseCost;
    if (row.cost > 0) return row.cost;
    return Math.round(baseCost * row.factor * 10000) / 10000;
  }
  return baseCost;
}

export function validateExtraUnits(baseUnit, extraUnits) {
  var base = String(baseUnit == null || baseUnit === "" ? "Pcs" : baseUnit).trim();
  var seen = {};
  seen[base.toLowerCase()] = 1;
  var prevFactor = 1;
  for (var i = 0; i < (extraUnits || []).length; i++) {
    var row = extraUnits[i] || {};
    var name = String(row.name || "").trim();
    var factor = parseFloat(row.factor) || 0;
    if (!name && factor <= 0) continue;
    if (!name) return "Please enter a unit name for each row, or remove empty rows.";
    if (seen[name.toLowerCase()]) return "Duplicate unit name: \"" + name + "\".";
    seen[name.toLowerCase()] = 1;
    if (factor <= prevFactor) {
      return "Each larger unit needs a higher conversion factor than the previous tier (base = 1 " + base + ").";
    }
    prevFactor = factor;
  }
  return null;
}

/**
 * Persist fragment: units array + cleared legacy bulk fields (new multi-unit products).
 */
export function buildUnitsPersistFields(form) {
  var base = String((form && form.unit) == null || form.unit === "" ? "Pcs" : form.unit).trim();
  var baseCost = parseFloat(form.cost) || 0;
  var basePrice = parseFloat(form.price) || 0;
  var units = [{ name: base, factor: 1, sellPrice: basePrice, cost: baseCost }];
  var extra = form.extraUnits || [];
  for (var i = 0; i < extra.length; i++) {
    var row = extra[i] || {};
    var n = String(row.name || "").trim();
    var f = parseFloat(row.factor) || 0;
    if (!n && f <= 0) continue;
    if (!n || f <= 1) continue;
    units.push({
      name: n,
      factor: f,
      sellPrice: parseFloat(row.sellPrice) || 0,
      cost: parseFloat(row.cost) || 0,
    });
  }
  units.sort(function (a, b) {
    return a.factor - b.factor;
  });
  return {
    unit: units[0].name,
    units: units,
    bulkEnabled: false,
    bulkUnit: "",
    bulkConversion: 0,
    bulkPrice: 0,
    bulkCost: 0,
  };
}

export function formExtraUnitsFromProduct(product) {
  if (!product) return [];
  if (Array.isArray(product.units) && product.units.length > 1) {
    return product.units.slice(1).map(function (r) {
      return {
        name: r.name || "",
        factor: r.factor != null ? String(r.factor) : "",
        sellPrice: r.sellPrice != null ? String(r.sellPrice) : "",
        cost: r.cost != null ? String(r.cost) : "",
      };
    });
  }
  if (product.bulkEnabled && product.bulkUnit && (parseFloat(product.bulkConversion) || 0) > 0) {
    return [
      {
        name: product.bulkUnit,
        factor: String(product.bulkConversion),
        sellPrice: product.bulkPrice != null ? String(product.bulkPrice) : "",
        cost: product.bulkCost != null ? String(product.bulkCost) : "",
      },
    ];
  }
  return [];
}
