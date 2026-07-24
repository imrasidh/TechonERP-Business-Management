/**
 * Optional module toggles — settings override industry profile defaults.
 * Main PC: admin (mainModuleToggles) and staff/cashier (staffModuleToggles) are separate.
 * Counter PC uses counterModuleToggles.
 * Sales (pos) and Settings always stay on; core ERP screens stay on.
 * Settings → Modules only exposes optional POS / COD extras.
 */
import { hydrateCategoryGroupSettings } from "./categoryGroups.js";
import { COMPUTER_SHOP_EDITION } from "../productionConfig.js";

/** Nav page ids that cannot be disabled. */
export var CORE_NAV_IDS = ["pos", "settings"];

/**
 * Module ids still shown in Settings → Modules.
 * Everything else in MODULE_TOGGLE_DEFS stays permanently enabled.
 */
export var SETTINGS_OPTIONAL_MODULE_IDS = ["freeItems", "coddatabase", "codCostProfit"];

export function isSettingsOptionalModule(moduleId) {
  return SETTINGS_OPTIONAL_MODULE_IDS.indexOf(moduleId) >= 0 || moduleId === "codSalesTrack";
}

/** Every toggleable screen/feature (runtime + Settings). Settings UI filters via SETTINGS_OPTIONAL_MODULE_IDS. */
export var MODULE_TOGGLE_DEFS = [
  { id: "dashboard", label: "Dashboard", group: "Main", blurb: "Business overview — today's sales, stock alerts, and quick stats." },
  { id: "invoices", label: "Invoices", group: "Main", blurb: "Browse, reprint, and edit saved invoices and receipts." },
  { id: "purchases", label: "Purchases", group: "Stock", blurb: "Record supplier purchases and bring stock into inventory." },
  { id: "inventory", label: "Inventory", group: "Stock", blurb: "Products, stock levels, adjustments, and product master data." },
  { id: "parties", label: "Parties", group: "People", blurb: "Customers, suppliers, and other contacts in one place." },
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
  { id: "freeItems", label: "Free items (complimentary)", group: "POS", blurb: "Allow complimentary gift lines on the Sales screen.", navId: null },
  { id: "posLineComments", label: "Line comments (serial / note)", group: "POS options", blurb: "Show a comment field on each Sales cart line for serial numbers, IMEI, or notes.", navId: null },
  { id: "codSalesTrack", label: "COD track (Sales)", group: "POS options", blurb: "Show COD tracking on Sales. Copies sell/cost/profit into COD Database only — intentional separate tracker; does NOT post to main Accounts/GL/cash. COD Database module should stay enabled with this.", navId: null },
  { id: "coddatabase", label: "COD Tracker", group: "COD", blurb: "Separate COD/delivery tracker (status, labels). Parallel to main Accounts — not GL/cash/P&L. Also enables COD fields on Sales.", navId: "coddatabase" },
  { id: "codCostProfit", label: "Costs & profit", group: "COD", blurb: "COD-only costs, partner balances & withdrawals. Locked separate from main Accounts/GL — tracker math only.", navId: null, parentModule: "coddatabase" },
];

function defaultForModule(id, businessType, profile) {
  var def = MODULE_TOGGLE_DEFS.find(function (m) { return m.id === id; });
  if (!def) return true;
  if (id === "freeItems") return String(businessType || "").toLowerCase() !== "glass";
  if (id === "posLineComments") return !!COMPUTER_SHOP_EDITION;
  if (id === "codSalesTrack" || id === "coddatabase" || id === "codCostProfit") return false;
  if (def.profileKey && profile && profile.modules) {
    return !!profile.modules[def.profileKey];
  }
  return true;
}

/** Default counter sidebar when no counterModuleToggles saved yet (matches legacy POS allow-list). */
function defaultCounterModule(id, businessType, profile) {
  if (id === "invoices" || id === "parties" || id === "returns") return true;
  if (id === "repairs") return defaultForModule("repairs", businessType, profile);
  if (id === "freeItems") return defaultForModule("freeItems", businessType, profile);
  if (id === "posLineComments") return defaultForModule("posLineComments", businessType, profile);
  return false;
}

function readLegacyCodCostProfit(stored) {
  if (!stored || typeof stored !== "object") return undefined;
  if (stored.codCostProfit === true || stored.codCostProfit === false) return stored.codCostProfit;
  if (stored.codCostBreakdown === true || stored.codProfitSharing === true) return true;
  if (stored.codCostBreakdown === false && stored.codProfitSharing === false) return false;
  return undefined;
}

function buildToggleMap(stored, businessType, profile, defaultFn, inheritFrom) {
  var out = {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (m.id === "codCostProfit") {
      var legacy = readLegacyCodCostProfit(stored);
      if (legacy === true || legacy === false) {
        out[m.id] = legacy;
        return;
      }
    }
    if (stored[m.id] === true || stored[m.id] === false) {
      out[m.id] = stored[m.id];
      return;
    }
    if (inheritFrom && (inheritFrom[m.id] === true || inheritFrom[m.id] === false)) {
      out[m.id] = inheritFrom[m.id];
      return;
    }
    if (m.id === "freeItems" && stored.freeItems !== undefined) {
      out[m.id] = stored.freeItems === true;
      return;
    }
    out[m.id] = defaultFn ? defaultFn(m.id, businessType, profile) : defaultForModule(m.id, businessType, profile);
  });
  if (out.parties === undefined) {
    if (stored.parties === true || stored.parties === false) {
      out.parties = stored.parties;
    } else if (stored.customers === false && stored.suppliers === false) {
      out.parties = false;
    } else if (stored.customers === true || stored.suppliers === true) {
      out.parties = true;
    }
  }
  return out;
}

function storedMapHasValues(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  var hasVal = false;
  Object.keys(stored).forEach(function (k) {
    if (stored[k] === true || stored[k] === false) hasVal = true;
  });
  return hasVal;
}

function normalizeUserRole(userRole) {
  var r = String(userRole || "").toLowerCase();
  if (r === "admin" || r === "manager" || r === "cashier") return r;
  return "admin";
}

function readStoredMap(settings, primaryKey, legacyKey) {
  if (!settings || typeof settings !== "object") return {};
  var primary = settings[primaryKey];
  if (primary && typeof primary === "object" && !Array.isArray(primary)) {
    if (storedMapHasValues(primary)) return primary;
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
  var legacyPosComments = settings && settings.posLineCommentsEnabled;
  var out = buildToggleMap(stored, businessType, profile, null);
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (stored[m.id] === true || stored[m.id] === false) return;
    if (m.id === "freeItems" && legacyFree !== undefined && stored.freeItems === undefined) {
      out[m.id] = legacyFree === true;
    }
    if (m.id === "repairs" && legacyRepairs !== undefined && stored.repairs === undefined) {
      out[m.id] = legacyRepairs === true;
    }
    if (m.id === "posLineComments" && legacyPosComments !== undefined && stored.posLineComments === undefined) {
      out[m.id] = legacyPosComments === true;
    }
    if (stored[m.id] === undefined && out[m.id] === undefined) {
      out[m.id] = defaultForModule(m.id, businessType, profile);
    }
  });
  return out;
}

export function getStaffModuleToggles(settings, businessType, profile) {
  var main = getMainModuleToggles(settings, businessType, profile);
  var stored = readStoredMap(settings, "staffModuleToggles", null);
  if (!storedMapHasValues(stored)) {
    return main;
  }
  /* Unset staff keys inherit admin main toggles (fixes COD on POS when only enabled under Admin modules). */
  return buildToggleMap(stored, businessType, profile, null, main);
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

export function getModuleTogglesForTerminal(settings, businessType, profile, netRole, userRole) {
  if (isCounterTerminal(netRole)) {
    return getCounterModuleToggles(settings, businessType, profile);
  }
  if (normalizeUserRole(userRole) === "admin") {
    return getMainModuleToggles(settings, businessType, profile);
  }
  return getStaffModuleToggles(settings, businessType, profile);
}

export function isModuleEnabled(settings, businessType, profile, moduleId, netRole, userRole) {
  /* Core ERP screens are always available — Settings only toggles POS/COD extras. */
  if (!isSettingsOptionalModule(moduleId) && moduleId !== "posLineComments") return true;
  if (moduleId === "posLineComments") {
    var togglesPc = getModuleTogglesForTerminal(settings, businessType, profile, netRole, userRole);
    if (togglesPc.posLineComments === true || togglesPc.posLineComments === false) return togglesPc.posLineComments === true;
    return !!COMPUTER_SHOP_EDITION;
  }
  var toggles = getModuleTogglesForTerminal(settings, businessType, profile, netRole, userRole);
  return toggles[moduleId] === true;
}

export function isNavModuleEnabled(settings, businessType, profile, navId, netRole, userRole) {
  if (CORE_NAV_IDS.indexOf(navId) >= 0) return true;
  if (navId === "customers" || navId === "suppliers") navId = "parties";
  var mod = MODULE_TOGGLE_DEFS.find(function (m) {
    return m.id === navId || m.navId === navId;
  });
  if (!mod) return true;
  return isModuleEnabled(settings, businessType, profile, mod.id, netRole, userRole);
}

/** First sidebar page to open when Dashboard is off (logo click, auto-lock, etc.). */
export function getDefaultLandingNavId(settings, businessType, profile, netRole, userRole) {
  if (isNavModuleEnabled(settings, businessType, profile, "dashboard", netRole, userRole)) return "dashboard";
  return "pos";
}

export function isFreeItemsEnabled(settings, businessType, netRole, userRole) {
  return isModuleEnabled(settings, businessType, null, "freeItems", netRole, userRole);
}

export function isPosLineCommentsEnabled(settings, businessType, netRole, userRole) {
  return isModuleEnabled(settings, businessType, null, "posLineComments", netRole, userRole);
}

export function isCodSalesTrackEnabled(settings, businessType, netRole, userRole) {
  if (isModuleEnabled(settings, businessType, null, "codSalesTrack", netRole, userRole)) return true;
  /* Enabling COD Database implies POS tracking — users often toggle only the sidebar module. */
  if (isModuleEnabled(settings, businessType, null, "coddatabase", netRole, userRole)) return true;
  return false;
}

export function isCodDatabaseEnabled(settings, businessType, profile, netRole, userRole) {
  return isModuleEnabled(settings, businessType, profile, "coddatabase", netRole, userRole);
}

export function isCodCostProfitEnabled(settings, businessType, profile, netRole, userRole) {
  if (!isCodDatabaseEnabled(settings, businessType, profile, netRole, userRole)) return false;
  return isModuleEnabled(settings, businessType, profile, "codCostProfit", netRole, userRole);
}

/** @deprecated use isCodCostProfitEnabled */
export function isCodCostBreakdownEnabled(settings, businessType, profile, netRole, userRole) {
  return isCodCostProfitEnabled(settings, businessType, profile, netRole, userRole);
}

/** @deprecated use isCodCostProfitEnabled */
export function isCodProfitSharingEnabled(settings, businessType, profile, netRole, userRole) {
  return isCodCostProfitEnabled(settings, businessType, profile, netRole, userRole);
}

export function isRepairsModuleEnabled(settings, businessType, profile, netRole, userRole) {
  return isModuleEnabled(settings, businessType, profile, "repairs", netRole, userRole);
}

export function hydrateFeatureFlagDefaults(settings, businessType, profile) {
  var next = Object.assign({}, settings || {});
  var mainToggles = getMainModuleToggles(next, businessType, profile);
  var counterToggles = getCounterModuleToggles(next, businessType, profile);
  var staffStored = readStoredMap(next, "staffModuleToggles", null);
  var staffToggles = storedMapHasValues(staffStored)
    ? buildToggleMap(staffStored, businessType, profile, null)
    : Object.assign({}, mainToggles);
  next.mainModuleToggles = mainToggles;
  next.counterModuleToggles = counterToggles;
  next.staffModuleToggles = staffToggles;
  next.moduleToggles = mainToggles;
  next.freeItemsEnabled = mainToggles.freeItems === true;
  next.repairsModuleEnabled = mainToggles.repairs === true;
  next.posLineCommentsEnabled = mainToggles.posLineComments === true;
  return hydrateCategoryGroupSettings(next, businessType);
}

function packToggleForm(formToggles) {
  var toggles = {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (isSettingsOptionalModule(m.id)) {
      toggles[m.id] = formToggles[m.id] === true;
    } else if (m.id === "posLineComments") {
      /* Hidden from Settings — keep computer-shop default / existing value. */
      if (formToggles[m.id] === true || formToggles[m.id] === false) toggles[m.id] = formToggles[m.id] === true;
      else toggles[m.id] = !!COMPUTER_SHOP_EDITION;
    } else {
      toggles[m.id] = true;
    }
  });
  /* COD Tracker without POS track is useless — keep both aligned on save. */
  if (toggles.coddatabase) toggles.codSalesTrack = true;
  if (!toggles.coddatabase) toggles.codCostProfit = false;
  return toggles;
}

export function persistMainModuleToggles(formToggles) {
  var toggles = packToggleForm(formToggles);
  return {
    moduleToggles: toggles,
    mainModuleToggles: toggles,
    freeItemsEnabled: toggles.freeItems === true,
    repairsModuleEnabled: toggles.repairs === true,
    posLineCommentsEnabled: toggles.posLineComments === true,
  };
}

export function persistStaffModuleToggles(formToggles) {
  return { staffModuleToggles: packToggleForm(formToggles) };
}

export function persistCounterModuleToggles(formToggles) {
  return { counterModuleToggles: packToggleForm(formToggles) };
}

/** @deprecated use persistMainModuleToggles */
export function persistModuleToggles(formToggles) {
  return persistMainModuleToggles(formToggles);
}

export function listEnabledNavIds(settings, businessType, profile, netRole, userRole) {
  var ids = CORE_NAV_IDS.slice();
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (m.navId === null) return;
    if (isModuleEnabled(settings, businessType, profile, m.id, netRole, userRole) && ids.indexOf(m.id) < 0) {
      ids.push(m.id);
    }
  });
  return ids;
}
