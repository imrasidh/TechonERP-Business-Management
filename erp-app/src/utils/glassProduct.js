/**
 * Glass & Glazing — per product category (glass_cut workflow), not whole-shop industry.
 */
import { calcRectAreas, calcCutTotals, sheetsFromSqFt, formatGlassDimensionLine, parseGlassCutInput, glassCutInputFromLine } from "./glassDimensions.js";
import { isGlassWorkflowCategory } from "./categoryGroups.js";

export var GLASS_MODULE_CATEGORIES = [
  "Plain Float Glass", "Tempered Glass", "Laminated Glass", "Mirrors",
  "Frosted & Decorative Glass", "Tinted & Reflective Glass", "Insulated Glass (DGU)",
  "Safety & Wire Glass", "Shower Enclosures & Partitions", "Aluminium & uPVC Frames",
  "Glass Fittings & Hardware", "Sealants & Silicones", "Custom Cut Glass", "Glass Blocks & Specialty",
];

function resolveGlassSettings(settingsOrLegacy) {
  if (settingsOrLegacy && typeof settingsOrLegacy === "object" && !Array.isArray(settingsOrLegacy)) {
    return settingsOrLegacy;
  }
  if (String(settingsOrLegacy || "").toLowerCase() === "glass") {
    return { enabledCategoryGroups: { glass_glazing: true } };
  }
  return {};
}

export function isGlassIndustry(businessType) {
  return String(businessType || "").toLowerCase() === "glass";
}

export function isGlassModuleCategory(category) {
  return GLASS_MODULE_CATEGORIES.indexOf(String(category || "").trim()) >= 0;
}

export function isGlassProduct(product, settingsOrLegacy) {
  if (!product) return false;
  if (String(product.type || "stock").toLowerCase() !== "stock") return false;
  return isGlassWorkflowCategory(product.category, resolveGlassSettings(settingsOrLegacy));
}

export function buildGlassSheetFields(width, height, unit) {
  var areas = calcRectAreas(width, height, unit);
  return {
    glassSheetWidth: Number(width) || 0,
    glassSheetHeight: Number(height) || 0,
    glassDimensionUnit: unit || "mm",
    glassAreaSqFt: areas.sqFt,
    glassAreaSqM: areas.sqM,
    glassAreaSqIn: areas.sqIn,
    glassAreaSqCm: areas.sqCm,
    glassAreaSqMm: areas.sqMm,
  };
}

/** Read glass sheet fields from any product form object (Inventory, Purchases, Accounts, etc.). */
export function glassFieldsFromProductForm(form) {
  if (!form) return {};
  return buildGlassSheetFields(form.glassSheetWidth, form.glassSheetHeight, form.glassDimensionUnit || "mm");
}

/** True when form category uses glass_cut workflow and group is enabled. */
export function isGlassStockProductForm(form, settingsOrLegacy) {
  if (!form) return false;
  var pt = form.type != null ? String(form.type).toLowerCase() : "stock";
  if (pt !== "stock") return false;
  return isGlassWorkflowCategory(form.category, resolveGlassSettings(settingsOrLegacy));
}

/** True when base unit is Sheet (glass sheet dimensions apply). */
export function isGlassSheetUnit(form) {
  return String(form && form.unit || "").trim().toLowerCase() === "sheet";
}

/** Glass stock product sold/purchased by full sheet — needs sheet dimensions. */
export function isGlassSheetProductForm(form, settingsOrLegacy) {
  return isGlassStockProductForm(form, settingsOrLegacy) && isGlassSheetUnit(form);
}

/** Clear glass sheet fields when base unit is not Sheet. */
export function glassFormFieldsOnUnitChange(nextUnit) {
  if (String(nextUnit || "").trim().toLowerCase() === "sheet") return {};
  return {
    glassSheetWidth: "",
    glassSheetHeight: "",
    glassDimensionUnit: "mm",
    glassAreaSqFt: 0,
    glassAreaSqM: 0,
    glassAreaSqIn: 0,
    glassAreaSqCm: 0,
    glassAreaSqMm: 0,
  };
}

export function validateGlassProductForm(form, settingsOrLegacy) {
  if (!isGlassSheetProductForm(form, settingsOrLegacy)) return null;
  var fields = glassFieldsFromProductForm(form);
  if (!(Number(fields.glassSheetWidth) > 0) || !(Number(fields.glassSheetHeight) > 0)) {
    return "Enter sheet width and height for glass products.";
  }
  return null;
}

/** Attach calculated glass fields and force base unit Sheet on a product record. */
export function applyGlassProductFields(product, form, settingsOrLegacy) {
  if (!isGlassSheetProductForm(form, settingsOrLegacy)) return product;
  return Object.assign({}, product, glassFieldsFromProductForm(form), glassSellRateFieldsFromProductForm(form), { unit: "Sheet" });
}

export function glassCostPriceLabels(form, settingsOrLegacy) {
  var glass = isGlassSheetProductForm(form, settingsOrLegacy);
  return {
    cost: glass ? "Cost Price (per Sheet) *" : "Cost Price *",
    sell: glass ? "Sell Price (per Sheet) *" : "Sell Price *",
  };
}

/** Selling rate per Sq Ft — product.price is per sheet for glass; cached on glassSellPricePerSqFt when saved. */
export function getGlassSellRatePerSqFt(product) {
  if (!product) return 0;
  var cached = Number(product.glassSellPricePerSqFt);
  if (cached > 0) return cached;
  var sheetSqFt = getSheetAreaSqFt(product);
  var sell = Number(product.price) || 0;
  var costSheet = Number(product.cost) || 0;
  if (!(sheetSqFt > 0) || !(sell > 0)) return sell;
  if (sell < 2000 && (costSheet <= 0 || sell < costSheet * 0.15)) return sell;
  return Math.round((sell / sheetSqFt) * 10000) / 10000;
}

export function getGlassCostPerSqFt(product) {
  if (!product) return 0;
  var sheetSqFt = getSheetAreaSqFt(product);
  var cost = Number(product.cost) || 0;
  if (!(sheetSqFt > 0) || !(cost > 0)) return 0;
  return Math.round((cost / sheetSqFt) * 10000) / 10000;
}

export function getGlassCostPerSqM(product) {
  if (!product) return 0;
  var sheetSqM = getSheetAreaSqM(product);
  var cost = Number(product.cost) || 0;
  if (!(sheetSqM > 0) || !(cost > 0)) return 0;
  return Math.round((cost / sheetSqM) * 10000) / 10000;
}

export function getGlassSellPerSqM(product) {
  if (!product) return 0;
  var sheetSqM = getSheetAreaSqM(product);
  var rate = getGlassSellRatePerSqFt(product);
  var sheetSqFt = getSheetAreaSqFt(product);
  if (sheetSqM > 0 && sheetSqFt > 0 && rate > 0) {
    return Math.round((rate * sheetSqFt / sheetSqM) * 10000) / 10000;
  }
  var sell = Number(product.price) || 0;
  if (!(sheetSqM > 0) || !(sell > 0)) return 0;
  return Math.round((sell / sheetSqM) * 10000) / 10000;
}

/** Structured cost / sell panel for glass POS popup. */
export function glassProductEconomicsDetails(product, line, fmtNum, getCurrencySymbol) {
  if (!product) return null;
  var sym = getCurrencySymbol ? getCurrencySymbol() : "Rs";
  var fn = typeof fmtNum === "function" ? fmtNum : function (n) { return String(n); };
  var w = Number(product.glassSheetWidth) || 0;
  var h = Number(product.glassSheetHeight) || 0;
  var u = product.glassDimensionUnit || "mm";
  var stock = glassStockDisplay(product);
  var costSheet = Number(product.cost) || 0;
  var sellSheet = Number(product.price) || 0;
  var costSqFt = getGlassCostPerSqFt(product);
  var sellSqFt = getGlassSellRatePerSqFt(product);
  var costSqM = getGlassCostPerSqM(product);
  var sellSqM = getGlassSellPerSqM(product);
  var cut = line && (Number(line.glassWidth) > 0) && (Number(line.glassLength) > 0)
    ? recalcGlassCartLine(line, product)
    : null;
  var cutSqFt = cut ? (Number(cut.glassTotalSqFt) || 0) : 0;
  var cutAmount = cut ? glassLineAmount(cut) : 0;
  var cutCost = cutSqFt > 0 ? Math.round(cutSqFt * costSqFt * 100) / 100 : 0;
  return {
    sym: sym,
    fn: fn,
    name: product.name || "",
    sheetSize: w > 0 && h > 0 ? (w + " × " + h + " " + u) : "—",
    areas: {
      sqFt: Number(product.glassAreaSqFt) || 0,
      sqM: Number(product.glassAreaSqM) || 0,
      sqIn: Number(product.glassAreaSqIn) || 0,
      sqCm: Number(product.glassAreaSqCm) || 0,
      sqMm: Number(product.glassAreaSqMm) || 0,
    },
    cost: { sheet: costSheet, sqFt: costSqFt, sqM: costSqM },
    sell: { sheet: sellSheet, sqFt: sellSqFt, sqM: sellSqM },
    marginSqFt: Math.round((sellSqFt - costSqFt) * 100) / 100,
    stock: stock,
    cut: cut ? {
      size: (Number(line.glassWidth) || 0) + " × " + (Number(line.glassLength) || 0) + " " + (line.glassDimensionUnit || "mm"),
      pieces: cut.glassPieces || 1,
      sqFt: cutSqFt,
      sell: cutAmount,
      cost: cutCost,
      profit: Math.round((cutAmount - cutCost) * 100) / 100,
    } : null,
  };
}

export function glassSellRateFieldsFromProductForm(form) {
  var sellSheet = parseFloat(form.price) || 0;
  var sqFt = Number(form.glassAreaSqFt) || 0;
  if (!(sqFt > 0) || !(sellSheet > 0)) return {};
  if (sellSheet < 2000) return { glassSellPricePerSqFt: sellSheet };
  return { glassSellPricePerSqFt: Math.round((sellSheet / sqFt) * 10000) / 10000 };
}

/** Copy persisted glass fields from a draft row (opening stock, etc.). */
export function glassPersistFieldsFromRow(row) {
  if (!row || !(Number(row.glassSheetWidth) > 0) || !(Number(row.glassSheetHeight) > 0)) return {};
  return {
    glassSheetWidth: Number(row.glassSheetWidth) || 0,
    glassSheetHeight: Number(row.glassSheetHeight) || 0,
    glassDimensionUnit: row.glassDimensionUnit || "mm",
    glassAreaSqFt: Number(row.glassAreaSqFt) || 0,
    glassAreaSqM: Number(row.glassAreaSqM) || 0,
    glassAreaSqIn: Number(row.glassAreaSqIn) || 0,
    glassAreaSqCm: Number(row.glassAreaSqCm) || 0,
    glassAreaSqMm: Number(row.glassAreaSqMm) || 0,
    unit: "Sheet",
  };
}

export function getSheetAreaSqFt(product) {
  if (!product) return 0;
  return Number(product.glassAreaSqFt) || 0;
}

export function getSheetAreaSqM(product) {
  if (!product) return 0;
  return Number(product.glassAreaSqM) || 0;
}

export function glassStockDisplay(product) {
  var sheets = Number(product && product.stock) || 0;
  var sqFt = getSheetAreaSqFt(product);
  var sqM = getSheetAreaSqM(product);
  return {
    sheets: sheets,
    sqFt: Math.round(sheets * sqFt * 100) / 100,
    sqM: Math.round(sheets * sqM * 100) / 100,
  };
}

export function formatGlassStockLabel(product, fmtNum) {
  var d = glassStockDisplay(product);
  var fn = typeof fmtNum === "function" ? fmtNum : function (n) { return String(n); };
  return d.sheets + " Sheet" + (d.sheets === 1 ? "" : "s") + " / " + fn(d.sqFt) + " Sq Ft / " + fn(d.sqM) + " Sq M";
}

export function recalcGlassCartLine(line, product) {
  if (!line || !product) return line;
  var glassLength = line.glassLength;
  var glassWidth = line.glassWidth;
  var glassDimensionUnit = line.glassDimensionUnit || "mm";
  var glassPieces = line.glassPieces != null ? line.glassPieces : 1;
  var cut = calcCutTotals(glassLength, glassWidth, glassPieces, glassDimensionUnit);

  var sheetSqFt = getSheetAreaSqFt(product);
  var sheets = sheetsFromSqFt(cut.totalSqFt, sheetSqFt);
  var defaultRate = getGlassSellRatePerSqFt(product);
  var rate = line.customGlassRate
    ? (Number(line.glassRatePerSqFt != null ? line.glassRatePerSqFt : line.price) || defaultRate)
    : defaultRate;
  var amount = Math.round(cut.totalSqFt * rate * 100) / 100;
  return Object.assign({}, line, {
    isGlassLine: true,
    glassLength: glassLength,
    glassWidth: glassWidth,
    glassDimensionUnit: glassDimensionUnit,
    glassTotalSqFt: cut.totalSqFt,
    glassTotalSqM: cut.totalSqM,
    glassPieceSqFt: cut.piece.sqFt,
    glassPieces: cut.pieces,
    glassRatePerSqFt: rate,
    glassParseOk: cut.totalSqFt > 0 && (Number(glassLength) > 0) && (Number(glassWidth) > 0),
    glassDisplayLine: cut.totalSqFt > 0
      ? (Number(glassWidth) || 0) + " \u00d7 " + (Number(glassLength) || 0) + " " + glassDimensionUnit
      : "",
    price: rate,
    qty: sheets,
    saleUnit: "Sq Ft",
    unit: product.unit || "Sheet",
    lineAmount: amount,
  });
}

export function glassLineAmount(line) {
  if (!line) return 0;
  if (line.lineAmount != null && isFinite(line.lineAmount)) return Number(line.lineAmount);
  var sqFt = Number(line.glassTotalSqFt) || 0;
  var rate = Number(line.glassRatePerSqFt != null ? line.glassRatePerSqFt : line.price) || 0;
  return Math.round(sqFt * rate * 100) / 100;
}

export function glassAvailableSqFt(product) {
  var d = glassStockDisplay(product);
  return d.sqFt;
}

export function glassPurchaseEconomics(qtySheets, costPerSheet, product) {
  var qty = Number(qtySheets) || 0;
  var cost = Number(costPerSheet) || 0;
  var sheetSqFt = getSheetAreaSqFt(product);
  var sheetSqM = getSheetAreaSqM(product);
  var totalSqFt = Math.round(qty * sheetSqFt * 100) / 100;
  var totalSqM = Math.round(qty * sheetSqM * 100) / 100;
  var costPerSqFt = sheetSqFt > 0 ? Math.round((cost / sheetSqFt) * 10000) / 10000 : 0;
  var costPerSqM = sheetSqM > 0 ? Math.round((cost / sheetSqM) * 10000) / 10000 : 0;
  return {
    qtySheets: qty,
    costPerSheet: cost,
    sheetSqFt: sheetSqFt,
    sheetSqM: sheetSqM,
    totalSqFt: totalSqFt,
    totalSqM: totalSqM,
    costPerSqFt: costPerSqFt,
    costPerSqM: costPerSqM,
    lineStockValue: Math.round(qty * cost * 100) / 100,
  };
}

export function mapGlassLineToSaleItem(it, product) {
  var line = recalcGlassCartLine(it, product);
  var lineTotal = glassInvoiceLineTotal({
    isGlassLine: true,
    glassTotalSqFt: line.glassTotalSqFt,
    glassRatePerSqFt: line.glassRatePerSqFt,
    price: line.glassRatePerSqFt,
    qty: line.qty,
  });
  return {
    id: line.id,
    name: line.name,
    barcode: line.barcode || "",
    qty: line.qty,
    inputQty: line.glassPieces,
    inputUnit: line.glassDimensionUnit,
    price: line.glassRatePerSqFt,
    cost: product ? (Number(product.cost) || 0) : 0,
    unit: product ? (product.unit || "Sheet") : "Sheet",
    saleUnit: "Sq Ft",
    product_id: line.id,
    isGlassLine: true,
    lineTotal: lineTotal,
    glassLength: line.glassLength,
    glassWidth: line.glassWidth,
    glassPieces: line.glassPieces,
    glassDimensionUnit: line.glassDimensionUnit,
    glassTotalSqFt: line.glassTotalSqFt,
    glassTotalSqM: line.glassTotalSqM,
    glassPieceSqFt: line.glassPieceSqFt,
    glassRatePerSqFt: line.glassRatePerSqFt,
    comment: "",
    commentLabel: "",
  };
}

export function formatGlassInvoiceDescription(it) {
  if (!it || !it.isGlassLine) return null;
  var w = Number(it.glassWidth) || 0;
  var h = Number(it.glassLength) || 0;
  var u = it.glassDimensionUnit || "mm";
  var dim = w + " \u00d7 " + h + " " + u;
  var lines = [dim];
  if (it.glassTotalSqFt > 0) lines.push("Area: " + it.glassTotalSqFt + " Sq Ft");
  if (it.glassPieces > 1) lines.push("Pieces: " + it.glassPieces);
  return lines.join("\n");
}

export function glassInvoiceLineTotal(it) {
  if (!it || !it.isGlassLine) return (Number(it.qty) || 0) * (Number(it.price) || 0);
  var sqFt = Number(it.glassTotalSqFt) || 0;
  var rate = Number(it.glassRatePerSqFt != null ? it.glassRatePerSqFt : it.price) || 0;
  return Math.round(sqFt * rate * 100) / 100;
}

export function glassInvoiceRateLabel(it, getCurrencySymbol, fmtNum) {
  var sym = getCurrencySymbol ? getCurrencySymbol() : "Rs";
  var fn = fmtNum || function (n) { return String(n); };
  var rate = Number(it.glassRatePerSqFt != null ? it.glassRatePerSqFt : it.price) || 0;
  return sym + " " + fn(rate) + " / Sq Ft";
}

export function invoiceHasGlassLines(items) {
  return (items || []).some(function (it) { return it && it.isGlassLine; });
}

/** Cut-size column: e.g. 50*50mm × 3 */
export function glassInvoiceCutSizeCol(it) {
  if (!it || !it.isGlassLine) return "";
  var w = Number(it.glassWidth) || 0;
  var h = Number(it.glassLength) || 0;
  var u = it.glassDimensionUnit || "mm";
  var p = Math.max(1, parseInt(it.glassPieces, 10) || 1);
  if (!(w > 0) || !(h > 0)) return "";
  var size = w + "*" + h + u;
  if (p > 1) size += " \u00d7 " + p;
  return size;
}

/** Qty column for glass: total Sq Ft */
export function glassInvoiceQtyCol(it, fmtNum) {
  if (!it || !it.isGlassLine) return "";
  var sqFt = Number(it.glassTotalSqFt) || 0;
  var fn = typeof fmtNum === "function" ? fmtNum : function (n) { return String(n); };
  return fn(sqFt) + " Sq Ft";
}

export function glassInvoiceCutText(it) {
  return glassInvoiceCutSizeCol(it);
}
