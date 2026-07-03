/**
 * Optional module toggles — settings override industry profile defaults.
 * Main PC and Counter PC have separate toggle maps.
 * Sales (pos) and Settings always stay on; every other sidebar screen is toggleable.
 */
import { hydrateCategoryGroupSettings } from "./categoryGroups.js";

/** Nav page ids that cannot be disabled. */
export var CORE_NAV_IDS = ["pos", "settings"];

/** Every toggleable screen/feature with a short description for Settings → Modules. */
export var MODULE_TOGGLE_DEFS = [
  { id: "dashboard", label: "Dashboard", group: "Main", blurb: "Business overview — today's sales, stock alerts, and quick stats." },
  { id: "invoices", label: "Invoices", group: "Main", blurb: "Browse, reprint, and edit saved invoices and receipts." },
  { id: "purchases", label: "Purchases", group: "Stock", blurb: "Record supplier purchases and bring stock into inventory." },
  { id: "inventory", label: "Inventory", group: "Stock", blurb: "Products, stock levels, adjustments, and product master data." },
  { id: "customers", label: "Customers", group: "People", blurb: "Customer directory, contact details, and running balances." },
  { id: "suppliers", label: "Suppliers", group: "People", blurb: "Supplier directory and links to purchase history." },
  { id: "statements", label: "Statements", group: "People", blurb: "Printable customer and supplier account statements." },
  { id: "receivables", label: "Receivables", group: "Finance", blurb: "Money customers owe you — track and collect outstanding amounts." },
  { id: "payables", label: "Payables", group: "Finance", blurb: "Money you owe suppliers — track bills and record payments." },
  { id: "accounts", label: "Accounts", group: "Finance", blurb: "Chart of accounts, journal, opening balances, assets, and capital." },
  { id: "cheques", label: "Cheques", group: "Finance", blurb: "Cheque register for issued and received cheques and clearing status." },
  { id: "repairs", label: "Repairs", group: "Operations", blurb: "Repair and service job tickets with status tracking.", profileKey: "repairs" },
  { id: "expenses", label: "Expenses", group: "Operations", blurb: "Day-to-day business expenses and petty cash outflows." },
  { id: "returns", label: "Returns", group: "Operations", blurb: "Sales returns and purchase returns with stock and ledger reversal." },
  { id: "reports", label: "Reports", group: "Insight", blurb: "Profit, stock, tax, and other business analytics reports." },
  { id: "barcodeprint", label: "Barcodes", group: "Insight", blurb: "Design label layouts and print product barcode stickers.", profileKey: "barcode" },
  { id: "auditlog", label: "Audit Log", group: "Insight", blurb: "Who changed what and when — security and traceability." },
  { id: "freeItems", label: "Free items (complimentary)", group: "POS options", blurb: "Allow complimentary gift lines on the Sales screen.", navId: null },
];

function defaultForModule(id, businessType, profile) {
  var def = MODULE_TOGGLE_DEFS.find(function (m) { return m.id === id; });
  if (!def) return true;
  if (id === "freeItems") return String(businessType || "").toLowerCase() !== "glass";
  if (def.profileKey && profile && profile.modules) {
    return !!profile.modules[def.profileKey];
  }
  return true;
}

/** Default counter sidebar when no counterModuleToggles saved yet (matches legacy POS allow-list). */
function defaultCounterModule(id, businessType, profile) {
  if (id === "invoices" || id === "customers" || id === "returns") return true;
  if (id === "repairs") return defaultForModule("repairs", businessType, profile);
  if (id === "freeItems") return defaultForModule("freeItems", businessType, profile);
  return false;
}

function buildToggleMap(stored, businessType, profile, defaultFn) {
  var out = {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (stored[m.id] === true || stored[m.id] === false) {
      out[m.id] = stored[m.id];
      return;
    }
    if (m.id === "freeItems" && stored.freeItems !== undefined) {
      out[m.id] = stored.freeItems === true;
      return;
    }
    out[m.id] = defaultFn ? defaultFn(m.id, businessType, profile) : defaultForModule(m.id, businessType, profile);
  });
  return out;
}

function readStoredMap(settings, primaryKey, legacyKey) {
  if (!settings || typeof settings !== "object") return {};
  var primary = settings[primaryKey];
  if (primary && typeof primary === "object" && !Array.isArray(primary)) {
    var hasVal = false;
    Object.keys(primary).forEach(function (k) {
      if (primary[k] === true || primary[k] === false) hasVal = true;
    });
    if (hasVal) return primary;
  }
  if (legacyKey && settings[legacyKey] && typeof settings[legacyKey] === "object") {
    return settings[legacyKey];
  }
  return {};
}

export function getMainModuleToggles(settings, businessType, profile) {
  var stored = readStoredMap(settings, "mainModuleToggles", "moduleToggles");
  var legacyFree = settings && settings.freeItemsEnabled;
  var legacyRepairs = settings && settings.repairsModuleEnabled;
  var out = buildToggleMap(stored, businessType, profile, null);
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (stored[m.id] === true || stored[m.id] === false) return;
    if (m.id === "freeItems" && legacyFree !== undefined && stored.freeItems === undefined) {
      out[m.id] = legacyFree === true;
    }
    if (m.id === "repairs" && legacyRepairs !== undefined && stored.repairs === undefined) {
      out[m.id] = legacyRepairs === true;
    }
    if (stored[m.id] === undefined && out[m.id] === undefined) {
      out[m.id] = defaultForModule(m.id, businessType, profile);
    }
  });
  return out;
}

export function getCounterModuleToggles(settings, businessType, profile) {
  var stored = readStoredMap(settings, "counterModuleToggles", null);
  return buildToggleMap(stored, businessType, profile, defaultCounterModule);
}

/** @deprecated use getMainModuleToggles */
export function getModuleToggles(settings, businessType, profile) {
  return getMainModuleToggles(settings, businessType, profile);
}

export function isCounterTerminal(netRole) {
  return netRole === "network_client" || (typeof window !== "undefined" && window._tcNetRole === "network_client");
}

export function getModuleTogglesForTerminal(settings, businessType, profile, netRole) {
  if (isCounterTerminal(netRole)) {
    return getCounterModuleToggles(settings, businessType, profile);
  }
  return getMainModuleToggles(settings, businessType, profile);
}

export function isModuleEnabled(settings, businessType, profile, moduleId, netRole) {
  var toggles = getModuleTogglesForTerminal(settings, businessType, profile, netRole);
  return toggles[moduleId] === true;
}

export function isNavModuleEnabled(settings, businessType, profile, navId, netRole) {
  if (CORE_NAV_IDS.indexOf(navId) >= 0) return true;
  var mod = MODULE_TOGGLE_DEFS.find(function (m) {
    return m.id === navId || m.navId === navId;
  });
  if (!mod) return true;
  return isModuleEnabled(settings, businessType, profile, mod.id, netRole);
}

/** First sidebar page to open when Dashboard is off (logo click, auto-lock, etc.). */
export function getDefaultLandingNavId(settings, businessType, profile, netRole) {
  if (isNavModuleEnabled(settings, businessType, profile, "dashboard", netRole)) return "dashboard";
  return "pos";
}

export function isFreeItemsEnabled(settings, businessType, netRole) {
  return isModuleEnabled(settings, businessType, null, "freeItems", netRole);
}

export function isRepairsModuleEnabled(settings, businessType, profile, netRole) {
  return isModuleEnabled(settings, businessType, profile, "repairs", netRole);
}

export function hydrateFeatureFlagDefaults(settings, businessType, profile) {
  var next = Object.assign({}, settings || {});
  var mainToggles = getMainModuleToggles(next, businessType, profile);
  var counterToggles = getCounterModuleToggles(next, businessType, profile);
  next.mainModuleToggles = mainToggles;
  next.counterModuleToggles = counterToggles;
  next.moduleToggles = mainToggles;
  next.freeItemsEnabled = mainToggles.freeItems === true;
  next.repairsModuleEnabled = mainToggles.repairs === true;
  return hydrateCategoryGroupSettings(next, businessType);
}

function packToggleForm(formToggles) {
  var toggles = {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    toggles[m.id] = formToggles[m.id] === true;
  });
  return toggles;
}

export function persistMainModuleToggles(formToggles) {
  var toggles = packToggleForm(formToggles);
  return {
    moduleToggles: toggles,
    mainModuleToggles: toggles,
    freeItemsEnabled: toggles.freeItems === true,
    repairsModuleEnabled: toggles.repairs === true,
  };
}

export function persistCounterModuleToggles(formToggles) {
  return { counterModuleToggles: packToggleForm(formToggles) };
}

/** @deprecated use persistMainModuleToggles */
export function persistModuleToggles(formToggles) {
  return persistMainModuleToggles(formToggles);
}

export function listEnabledNavIds(settings, businessType, profile, netRole) {
  var ids = CORE_NAV_IDS.slice();
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (m.navId === null) return;
    if (isModuleEnabled(settings, businessType, profile, m.id, netRole) && ids.indexOf(m.id) < 0) {
      ids.push(m.id);
    }
  });
  return ids;
}
