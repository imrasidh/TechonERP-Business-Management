#!/usr/bin/env node
import assert from "node:assert/strict";
import { calcRectAreas, calcCutTotals, sheetsFromSqFt, toInches, parseGlassCutInput } from "../../src/utils/glassDimensions.js";
import { buildGlassSheetFields, glassPurchaseEconomics, recalcGlassCartLine, getGlassSellRatePerSqFt, glassInvoiceCutSizeCol, glassInvoiceQtyCol, invoiceHasGlassLines } from "../../src/utils/glassProduct.js";

export function runGlassDimensionsTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  try {
    var sheetAreas = calcRectAreas(3660, 2440, "mm");
    assert.ok(sheetAreas.sqFt > 96 && sheetAreas.sqFt < 97, "3660x2440 mm sheet sq ft");

    var feetSheet = calcRectAreas(12, 8, "feet");
    assert.ok(Math.abs(feetSheet.sqFt - 96) < 0.01, "12x8 ft = 96 sq ft");

    var cut = calcCutTotals(1200, 800, 2, "mm");
    assert.ok(cut.totalSqFt > 20 && cut.totalSqFt < 21, "1200x800mm x2 sq ft range");

    var ratePerSqFt = 350;
    var product = Object.assign(buildGlassSheetFields(3660, 2440, "mm"), {
      id: "g1",
      name: "Test Glass",
      category: "Tempered Glass",
      type: "stock",
      unit: "Sheet",
      price: Math.round(ratePerSqFt * sheetAreas.sqFt),
      cost: 22500,
      stock: 10,
      glassAreaSqFt: sheetAreas.sqFt,
      glassAreaSqM: sheetAreas.sqM,
      glassSellPricePerSqFt: ratePerSqFt,
    });

    var line = recalcGlassCartLine({
      isGlassLine: true,
      glassLength: 1200,
      glassWidth: 800,
      glassPieces: 2,
      glassDimensionUnit: "mm",
    }, product);
    assert.ok(line.qty > 0 && line.qty < 1, "fractional sheets consumed");
    assert.ok(Math.abs(line.lineAmount - cut.totalSqFt * ratePerSqFt) < 1, "line amount from sq ft rate");
    assert.equal(line.glassDisplayLine, "800 × 1200 mm", "display width × height with unit");

    assert.equal(glassInvoiceCutSizeCol(line), "800*1200mm × 2", "invoice cut size column");
    assert.ok(glassInvoiceQtyCol(line, function (n) { return String(n); }).indexOf("Sq Ft") >= 0, "invoice qty column sq ft");
    assert.ok(invoiceHasGlassLines([line]), "detect glass invoice lines");

    var econ = glassPurchaseEconomics(10, 22500, product);
    assert.equal(econ.totalSqFt, Math.round(10 * sheetAreas.sqFt * 100) / 100);
    assert.ok(econ.costPerSqFt > 0);

    assert.ok(Math.abs(toInches(25.4, "mm") - 1) < 0.001);
    assert.ok(Math.abs(toInches(2.54, "cm") - 1) < 0.001);

    var p1 = parseGlassCutInput("8*8 FEET");
    assert.ok(p1.ok && p1.totalSqFt === 64, "8*8 feet = 64 sq ft");

    var p2 = parseGlassCutInput('40*20 INCHES');
    assert.ok(p2.ok && p2.totalSqFt > 5 && p2.totalSqFt < 6, "40x20 inches sq ft");

    var p3 = parseGlassCutInput("10MM*15MM");
    assert.ok(p3.ok && p3.totalSqFt > 0, "10mm x 15mm");

    var p4 = parseGlassCutInput("20 SQ FT");
    assert.ok(p4.ok && p4.totalSqFt === 20, "direct 20 sq ft");

    var p5 = parseGlassCutInput("8*8 FEET x 2");
    assert.ok(p5.ok && p5.totalSqFt === 128 && p5.glassPieces === 2, "8*8 feet x 2 pieces");

    var line2 = recalcGlassCartLine({
      isGlassLine: true,
      glassLength: 8,
      glassWidth: 8,
      glassDimensionUnit: "feet",
      glassPieces: 1,
    }, product);
    assert.ok(line2.glassTotalSqFt === 64, "cart line from width × height");
    assert.ok(getGlassSellRatePerSqFt(product) === ratePerSqFt, "sell rate derived from sheet price");
  } catch (e) {
    return fail("glass dimensions", e && e.message ? e.message : e);
  }

  pass("glass dimensions");
}
