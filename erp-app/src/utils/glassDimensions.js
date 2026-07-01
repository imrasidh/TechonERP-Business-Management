/**
 * Glass dimension → area conversions. All areas rounded to 4 decimal places internally.
 */

export var GLASS_DIMENSION_UNITS = ["mm", "cm", "inches", "feet"];

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

/** Convert a single length value to inches. */
export function toInches(value, unit) {
  var v = Number(value) || 0;
  var u = String(unit || "mm").toLowerCase();
  if (u === "mm") return v / 25.4;
  if (u === "cm") return v / 2.54;
  if (u === "inches" || u === "inch" || u === "in") return v;
  if (u === "feet" || u === "foot" || u === "ft") return v * 12;
  return v / 25.4;
}

/** Rectangle area from width × height in any supported unit. */
export function calcRectAreas(width, height, unit) {
  var wIn = toInches(width, unit);
  var hIn = toInches(height, unit);
  var sqIn = wIn * hIn;
  if (!(sqIn > 0)) {
    return { sqIn: 0, sqFt: 0, sqM: 0, sqCm: 0, sqMm: 0 };
  }
  var sqFt = sqIn / 144;
  var sqM = sqFt * 0.09290304;
  var sqCm = sqIn * 6.4516;
  var sqMm = sqCm * 100;
  return {
    sqIn: round4(sqIn),
    sqFt: round4(sqFt),
    sqM: round4(sqM),
    sqCm: round4(sqCm),
    sqMm: round4(sqMm),
  };
}

/** Piece / cut totals: area × pieces. */
export function calcCutTotals(length, width, pieces, unit) {
  var p = Math.max(1, parseInt(pieces, 10) || 1);
  var one = calcRectAreas(length, width, unit);
  return {
    piece: one,
    pieces: p,
    totalSqFt: round4(one.sqFt * p),
    totalSqM: round4(one.sqM * p),
    totalSqIn: round4(one.sqIn * p),
    totalSqCm: round4(one.sqCm * p),
    totalSqMm: round4(one.sqMm * p),
  };
}

/** Sheets consumed from total sq ft and per-sheet sq ft. */
export function sheetsFromSqFt(totalSqFt, sheetSqFt) {
  var t = Number(totalSqFt) || 0;
  var s = Number(sheetSqFt) || 0;
  if (!(t > 0) || !(s > 0)) return 0;
  return round4(t / s);
}

export function formatGlassDimensionLine(length, width, unit, pieces) {
  var l = Number(length) || 0;
  var w = Number(width) || 0;
  var u = unit || "mm";
  var p = Math.max(1, parseInt(pieces, 10) || 1);
  if (u === "sqft" || u === "area") {
    return (p > 1 ? p + " \u00d7 " : "") + l + " Sq Ft";
  }
  if (!(l > 0) || !(w > 0)) return String(length || width || "").trim();
  return l + " \u00d7 " + w + " " + u + (p > 1 ? " \u00b7 Pieces: " + p : "");
}

function normalizeCutUnit(tok) {
  if (!tok) return "";
  var u = String(tok).toLowerCase().replace(/\./g, "").replace(/"/g, "").trim();
  if (!u) return "";
  if (u === "mm" || u === "millimeter" || u === "millimetre") return "mm";
  if (u === "cm" || u === "centimeter" || u === "centimetre") return "cm";
  if (u === "in" || u === "inch" || u === "inches") return "inches";
  if (u === "ft" || u === "foot" || u === "feet") return "feet";
  return u;
}

/**
 * Parse free-text glass cut entry, e.g.:
 *   8*8 FEET, 8 x 8 ft, 40*20 INCHES, 40"*20", 10MM*15MM, 20 SQ FT, 8*8 FEET x 2
 */
export function parseGlassCutInput(raw) {
  var input = String(raw || "").trim();
  if (!input) {
    return { ok: false, raw: input, error: null };
  }

  var pieces = 1;
  var s = input.replace(/\u00d7/g, "x").replace(/"/g, "").replace(/\s+/g, " ").trim();

  var trailPc = s.match(/\s+x\s*(\d+)\s*(?:pc|pcs|pieces?)?\s*$/i);
  if (trailPc) {
    var beforeTrail = s.slice(0, trailPc.index).trim();
    if (/(feet|ft|inch|inches|in|mm|cm|sq\.?\s*ft|sqft|sf)\s*$/i.test(beforeTrail)) {
      pieces = Math.max(1, parseInt(trailPc[1], 10) || 1);
      s = beforeTrail;
    }
  }

  var sqDirect = s.match(/^([\d.]+)\s*sq\.?\s*ft$/i)
    || s.match(/^([\d.]+)\s*sqft$/i)
    || s.match(/^([\d.]+)\s*sf$/i)
    || s.match(/^([\d.]+)sq\s*ft$/i);
  if (sqDirect) {
    var oneSqFt = parseFloat(sqDirect[1]) || 0;
    var totalSqFt = round4(oneSqFt * pieces);
    return {
      ok: oneSqFt > 0,
      mode: "area",
      raw: input,
      glassCutInput: input,
      glassLength: oneSqFt,
      glassWidth: 1,
      glassDimensionUnit: "sqft",
      glassPieces: pieces,
      pieceSqFt: round4(oneSqFt),
      totalSqFt: totalSqFt,
      totalSqM: round4(totalSqFt * 0.09290304),
      displayLine: oneSqFt + " Sq Ft" + (pieces > 1 ? " \u00d7 " + pieces + " pc" : ""),
      error: oneSqFt > 0 ? null : "Enter a positive area like 20 SQ FT",
    };
  }

  var dimM = s.match(/^([\d.]+)\s*(mm|cm|in|inch|inches|ft|feet)?\s*[\*x]\s*([\d.]+)\s*(mm|cm|in|inch|inches|ft|feet)?(?:\s+(mm|cm|in|inch|inches|in|ft|feet))?\s*$/i)
    || s.match(/^([\d.]+)(mm|cm|in|inch|inches|ft|feet)\s*[\*x]\s*([\d.]+)(mm|cm|in|inch|inches|ft|feet)?\s*$/i);
  if (dimM) {
    var length = parseFloat(dimM[1]) || 0;
    var width = parseFloat(dimM[3]) || 0;
    var unit = normalizeCutUnit(dimM[5] || dimM[4] || dimM[2] || "mm") || "mm";
    if (length > 0 && width > 0) {
      var cut = calcCutTotals(length, width, pieces, unit);
      return {
        ok: true,
        mode: "dim",
        raw: input,
        glassCutInput: input,
        glassLength: length,
        glassWidth: width,
        glassDimensionUnit: unit,
        glassPieces: pieces,
        pieceSqFt: cut.piece.sqFt,
        totalSqFt: cut.totalSqFt,
        totalSqM: cut.totalSqM,
        displayLine: formatGlassDimensionLine(length, width, unit, pieces),
        error: null,
      };
    }
  }

  return {
    ok: false,
    raw: input,
    glassCutInput: input,
    error: "Try: 8*8 FEET, 40*20 INCHES, 10MM*15MM, or 20 SQ FT",
  };
}

/** Build cut text from structured line fields (edit / legacy rows). */
export function glassCutInputFromLine(line) {
  if (!line) return "";
  if (line.glassCutInput != null && String(line.glassCutInput).trim()) return String(line.glassCutInput).trim();
  if (line.glassDimensionUnit === "sqft" && Number(line.glassLength) > 0) {
    return line.glassLength + " SQ FT";
  }
  var l = Number(line.glassLength) || 0;
  var w = Number(line.glassWidth) || 0;
  if (l > 0 && w > 0) {
    var u = String(line.glassDimensionUnit || "mm").toUpperCase();
    if (u === "INCHES") u = "INCHES";
    else if (u === "FEET") u = "FEET";
    else if (u === "MM") u = "MM";
    else if (u === "CM") u = "CM";
    var txt = l + "*" + w + " " + u;
    var p = Math.max(1, parseInt(line.glassPieces, 10) || 1);
    if (p > 1) txt += " x " + p;
    return txt;
  }
  return "";
}
