#!/usr/bin/env node
/**
 * CustomerId backfill dry-run audit.
 *
 * Read-only:
 * - does NOT write to localStorage / IDB / files
 * - does NOT modify input data
 *
 * Usage:
 *   node scripts/customer-backfill-dry-run.mjs path/to/techon-backup.json
 *   node scripts/customer-backfill-dry-run.mjs path/to/techon-backup.json --json
 *   node scripts/customer-backfill-dry-run.mjs path/to/techon-backup.json --json --out=report.json
 */

import fs from "node:fs";
import path from "node:path";

var TARGET_TABLES = [
  {
    key: "tc3_sales",
    label: "sales",
    getName: function (row) { return row && row.customerName; },
    getPhone: function (row) { return row && row.customerPhone; },
  },
  {
    key: "tc3_quotations",
    label: "quotations",
    getName: function (row) { return row && row.customer; },
    getPhone: function (row) { return row && row.customerPhone; },
  },
  {
    key: "tc3_repairs",
    label: "repairs",
    getName: function (row) { return row && row.customer; },
    getPhone: function (row) { return row && row.phone; },
  },
  {
    key: "tc3_cheques",
    label: "cheques",
    getName: function (row) { return row && row.customerName; },
    getPhone: function () { return ""; },
  },
  {
    key: "tc3_salesReturns",
    label: "salesReturns",
    getName: function (row) { return row && row.customer; },
    getPhone: function () { return ""; },
  },
];

function usage() {
  console.log("CustomerId Backfill Dry Run");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/customer-backfill-dry-run.mjs <backup.json> [--json] [--out=report.json]");
  console.log("");
  console.log("Input:");
  console.log("  A Techon ERP backup JSON with shape { version: 2, data: { ... } }");
  console.log("");
  console.log("Flags:");
  console.log("  --json            Output machine-readable JSON only");
  console.log("  --out=<filename>  Save the generated report to a file");
}

function fail(msg) {
  console.error("ERROR:", msg);
  process.exit(1);
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeNameLoose(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, "");
}

function normalizeNameUnique(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function isBlankCustomerName(value) {
  var txt = String(value || "").trim();
  if (!txt) return true;
  return txt.toLowerCase() === "walk-in";
}

function readBackup(filePath) {
  var raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fail("Cannot read backup file: " + filePath);
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail("Backup file is not valid JSON.");
  }

  if (isObject(parsed) && parsed.version === 2 && isObject(parsed.data)) {
    return parsed.data;
  }
  if (isObject(parsed)) {
    return parsed;
  }
  fail("Backup payload must be an object or { version: 2, data: {...} }.");
}

function buildCustomerIndex(customers) {
  var byUniqueName = Object.create(null);
  var byLooseName = Object.create(null);

  (customers || []).forEach(function (customer) {
    var uniqueName = normalizeNameUnique(customer && customer.name);
    var looseName = normalizeNameLoose(customer && customer.name);
    if (uniqueName) {
      if (!byUniqueName[uniqueName]) byUniqueName[uniqueName] = [];
      byUniqueName[uniqueName].push(customer);
    }
    if (looseName) {
      if (!byLooseName[looseName]) byLooseName[looseName] = [];
      byLooseName[looseName].push(customer);
    }
  });

  return { byUniqueName: byUniqueName, byLooseName: byLooseName };
}

function classifyRow(row, tableCfg, customerIndex) {
  var currentId = String(row && row.customerId || "").trim();
  if (currentId) return null;

  var rawName = String(tableCfg.getName(row) || "");
  var rawPhone = String(tableCfg.getPhone(row) || "");
  var normUniqueName = normalizeNameUnique(rawName);
  var normLooseName = normalizeNameLoose(rawName);
  var normPhone = normalizePhone(rawPhone);
  var exactNameMatches = customerIndex.byUniqueName[normUniqueName] || [];
  var looseNameMatches = customerIndex.byLooseName[normLooseName] || [];
  var phoneMatches = [];

  if (isBlankCustomerName(rawName)) {
    return {
      status: "REVIEW_REQUIRED",
      reason: "WALK_IN_OR_BLANK",
      matchRule: "none",
      matchedCustomerId: "",
      matchedCustomerName: "",
      candidateCount: 0,
      sourceName: rawName,
      sourcePhone: rawPhone,
    };
  }

  if (normPhone && looseNameMatches.length > 0) {
    phoneMatches = looseNameMatches.filter(function (customer) {
      return normalizePhone(customer && customer.phone) === normPhone;
    });
    if (phoneMatches.length === 1) {
      return {
        status: "SAFE",
        reason: "SAFE_MATCH",
        matchRule: "name+phone",
        matchedCustomerId: String(phoneMatches[0].id || ""),
        matchedCustomerName: String(phoneMatches[0].name || ""),
        candidateCount: 1,
        sourceName: rawName,
        sourcePhone: rawPhone,
      };
    }
    if (phoneMatches.length > 1) {
      return {
        status: "REVIEW_REQUIRED",
        reason: "PHONE_CONFLICT",
        matchRule: "name+phone",
        matchedCustomerId: "",
        matchedCustomerName: "",
        candidateCount: phoneMatches.length,
        sourceName: rawName,
        sourcePhone: rawPhone,
      };
    }
  }

  if (exactNameMatches.length === 1) {
    return {
      status: "SAFE",
      reason: "SAFE_MATCH",
      matchRule: "unique_name",
      matchedCustomerId: String(exactNameMatches[0].id || ""),
      matchedCustomerName: String(exactNameMatches[0].name || ""),
      candidateCount: 1,
      sourceName: rawName,
      sourcePhone: rawPhone,
    };
  }

  if (exactNameMatches.length > 1) {
    return {
      status: "REVIEW_REQUIRED",
      reason: "DUPLICATE_NAME",
      matchRule: "unique_name",
      matchedCustomerId: "",
      matchedCustomerName: "",
      candidateCount: exactNameMatches.length,
      sourceName: rawName,
      sourcePhone: rawPhone,
    };
  }

  if (looseNameMatches.length === 1) {
    return {
      status: "SAFE",
      reason: "SAFE_MATCH",
      matchRule: "normalized_name",
      matchedCustomerId: String(looseNameMatches[0].id || ""),
      matchedCustomerName: String(looseNameMatches[0].name || ""),
      candidateCount: 1,
      sourceName: rawName,
      sourcePhone: rawPhone,
    };
  }

  if (looseNameMatches.length > 1) {
    return {
      status: "REVIEW_REQUIRED",
      reason: normPhone ? "PHONE_CONFLICT" : "DUPLICATE_NAME",
      matchRule: "normalized_name",
      matchedCustomerId: "",
      matchedCustomerName: "",
      candidateCount: looseNameMatches.length,
      sourceName: rawName,
      sourcePhone: rawPhone,
    };
  }

  return {
    status: "REVIEW_REQUIRED",
    reason: normPhone ? "PHONE_CONFLICT" : "NO_MATCH",
    matchRule: "none",
    matchedCustomerId: "",
    matchedCustomerName: "",
    candidateCount: 0,
    sourceName: rawName,
    sourcePhone: rawPhone,
  };
}

function sampleRows(rows, predicate, limit) {
  return rows.filter(predicate).slice(0, limit);
}

function parseArgs(argv) {
  var opts = { fileArg: "", json: false, out: "" };
  (argv || []).forEach(function (arg) {
    if (!arg) return;
    if (arg === "--json") {
      opts.json = true;
      return;
    }
    if (arg.indexOf("--out=") === 0) {
      opts.out = arg.slice("--out=".length).trim();
      return;
    }
    if (!opts.fileArg && arg !== "--help" && arg !== "-h") {
      opts.fileArg = arg;
    }
  });
  return opts;
}

function summarizeTable(tableCfg, data, customerIndex) {
  var rows = Array.isArray(data[tableCfg.key]) ? data[tableCfg.key] : [];
  var classified = [];

  rows.forEach(function (row, idx) {
    var result = classifyRow(row, tableCfg, customerIndex);
    if (!result) return;
    classified.push({
      table: tableCfg.label,
      recordId: String((row && (row.id || row.invoiceNo || row.returnId || row.quotationNo || row.chequeNo)) || ("row#" + (idx + 1))),
      sourceName: result.sourceName,
      sourcePhone: result.sourcePhone,
      currentCustomerId: String(row && row.customerId || ""),
      status: result.status,
      reason: result.reason,
      matchRule: result.matchRule,
      matchedCustomerId: result.matchedCustomerId,
      matchedCustomerName: result.matchedCustomerName,
      candidateCount: result.candidateCount,
    });
  });

  var safeRows = classified.filter(function (row) { return row.status === "SAFE"; });
  var reviewRows = classified.filter(function (row) { return row.status === "REVIEW_REQUIRED"; });

  return {
    table: tableCfg.label,
    totalRecords: rows.length,
    missingCustomerId: classified.length,
    safeCount: safeRows.length,
    reviewRequiredCount: reviewRows.length,
    samples: {
      SAFE: sampleRows(classified, function (row) { return row.status === "SAFE"; }, 5),
      DUPLICATE_NAME: sampleRows(classified, function (row) { return row.reason === "DUPLICATE_NAME"; }, 5),
      NO_MATCH: sampleRows(classified, function (row) { return row.reason === "NO_MATCH"; }, 5),
      PHONE_CONFLICT: sampleRows(classified, function (row) { return row.reason === "PHONE_CONFLICT"; }, 5),
    },
  };
}

function printSampleBlock(title, rows) {
  console.log("  " + title + ": " + rows.length);
  rows.forEach(function (row) {
    console.log(
      "    - id=" + row.recordId +
      " | rule=" + row.matchRule +
      " | reason=" + row.reason +
      " | source=\"" + row.sourceName + "\"" +
      (row.sourcePhone ? " | phone=" + row.sourcePhone : "") +
      (row.matchedCustomerId ? " | match=" + row.matchedCustomerId + " (" + row.matchedCustomerName + ")" : "") +
      " | candidates=" + row.candidateCount
    );
  });
}

function buildJsonReport(tableReports) {
  var summary = {};
  var overall = {
    totalMissing: 0,
    safe: 0,
    review: 0,
    safePercentage: 0,
  };
  var samples = {
    safe: [],
    duplicate_name: [],
    no_match: [],
    phone_conflict: [],
  };

  tableReports.forEach(function (report) {
    summary[report.table] = {
      total: report.totalRecords,
      missing: report.missingCustomerId,
      safe: report.safeCount,
      review: report.reviewRequiredCount,
    };
    overall.totalMissing += report.missingCustomerId;
    overall.safe += report.safeCount;
    overall.review += report.reviewRequiredCount;
    samples.safe = samples.safe.concat(report.samples.SAFE);
    samples.duplicate_name = samples.duplicate_name.concat(report.samples.DUPLICATE_NAME);
    samples.no_match = samples.no_match.concat(report.samples.NO_MATCH);
    samples.phone_conflict = samples.phone_conflict.concat(report.samples.PHONE_CONFLICT);
  });
  overall.safePercentage = overall.totalMissing > 0
    ? (overall.safe / overall.totalMissing) * 100
    : 100;

  return {
    overall: overall,
    summary: summary,
    samples: {
      safe: samples.safe.slice(0, 10),
      duplicate_name: samples.duplicate_name.slice(0, 10),
      no_match: samples.no_match.slice(0, 10),
      phone_conflict: samples.phone_conflict.slice(0, 10),
    },
  };
}

function writeReportFile(outPath, content) {
  if (!outPath) return;
  try {
    fs.writeFileSync(outPath, content, "utf8");
  } catch (e) {
    fail("Cannot write report file: " + outPath);
  }
}

function main() {
  var rawArgs = process.argv.slice(2);
  if (!rawArgs.length || rawArgs.indexOf("--help") >= 0 || rawArgs.indexOf("-h") >= 0) {
    usage();
    process.exit(rawArgs.length ? 0 : 1);
  }
  var opts = parseArgs(rawArgs);
  if (!opts.fileArg) fail("Missing backup.json path.");

  var backupPath = path.resolve(process.cwd(), opts.fileArg);
  var data = readBackup(backupPath);
  var customers = Array.isArray(data.tc3_customers) ? data.tc3_customers : [];
  var customerIndex = buildCustomerIndex(customers);
  var tableReports = TARGET_TABLES.map(function (tableCfg) {
    return summarizeTable(tableCfg, data, customerIndex);
  });
  var jsonReport = buildJsonReport(tableReports);

  if (opts.json) {
    var jsonText = JSON.stringify(jsonReport, null, 2);
    if (opts.out) writeReportFile(path.resolve(process.cwd(), opts.out), jsonText);
    console.log(jsonText);
    return;
  }

  console.log("CustomerId Backfill Dry Run Report");
  console.log("Backup:", backupPath);
  console.log("Customers:", customers.length);
  console.log("");

  tableReports.forEach(function (report) {
    console.log("Table:", report.table);
    console.log("  total records:", report.totalRecords);
    console.log("  missing customerId:", report.missingCustomerId);
    console.log("  SAFE:", report.safeCount);
    console.log("  REVIEW_REQUIRED:", report.reviewRequiredCount);
    printSampleBlock("Sample SAFE matches", report.samples.SAFE);
    printSampleBlock("Sample DUPLICATE_NAME", report.samples.DUPLICATE_NAME);
    printSampleBlock("Sample NO_MATCH", report.samples.NO_MATCH);
    printSampleBlock("Sample PHONE_CONFLICT", report.samples.PHONE_CONFLICT);
    console.log("");
  });

  var totals = tableReports.reduce(function (acc, report) {
    acc.totalRecords += report.totalRecords;
    acc.missingCustomerId += report.missingCustomerId;
    acc.safe += report.safeCount;
    acc.review += report.reviewRequiredCount;
    return acc;
  }, { totalRecords: 0, missingCustomerId: 0, safe: 0, review: 0 });

  console.log("Overall Summary");
  console.log("  total records:", totals.totalRecords);
  console.log("  missing customerId:", totals.missingCustomerId);
  console.log("  SAFE:", totals.safe);
  console.log("  REVIEW_REQUIRED:", totals.review);
  if (opts.out) {
    writeReportFile(path.resolve(process.cwd(), opts.out), JSON.stringify(jsonReport, null, 2));
    console.log("");
    console.log("JSON report saved to:", path.resolve(process.cwd(), opts.out));
  }
}

main();
