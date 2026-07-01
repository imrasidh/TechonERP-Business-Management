/**
 * Optional module toggles — settings override industry profile defaults.
 * Only Sales (pos) and Settings always stay on; every other sidebar screen is toggleable.
 */

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
  { id: "freeItems", label: "Free items (complimentary)", group: "Sales", blurb: "Allow complimentary gift lines on the Sales screen.", navId: null },
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

export function defaultFreeItemsEnabled(businessType) {
  return defaultForModule("freeItems", businessType, null);
}

export function defaultRepairsModuleEnabled(profile) {
  return defaultForModule("repairs", null, profile);
}

export function getModuleToggles(settings, businessType, profile) {
  var out = {};
  var stored = (settings && settings.moduleToggles) || {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    if (stored[m.id] === true || stored[m.id] === false) {
      out[m.id] = stored[m.id];
      return;
    }
    if (m.id === "freeItems" && settings && settings.freeItemsEnabled !== undefined) {
      out[m.id] = settings.freeItemsEnabled === true;
      return;
    }
    if (m.id === "repairs" && settings && settings.repairsModuleEnabled !== undefined) {
      out[m.id] = settings.repairsModuleEnabled === true;
      return;
    }
    out[m.id] = defaultForModule(m.id, businessType, profile);
  });
  return out;
}

export function isModuleEnabled(settings, businessType, profile, moduleId) {
  var toggles = getModuleToggles(settings, businessType, profile);
  return toggles[moduleId] === true;
}

export function isNavModuleEnabled(settings, businessType, profile, navId) {
  if (CORE_NAV_IDS.indexOf(navId) >= 0) return true;
  var mod = MODULE_TOGGLE_DEFS.find(function (m) {
    return m.id === navId || m.navId === navId;
  });
  if (!mod) return true;
  return isModuleEnabled(settings, businessType, profile, mod.id);
}

/** First sidebar page to open when Dashboard is off (logo click, auto-lock, etc.). */
export function getDefaultLandingNavId(settings, businessType, profile) {
  if (isNavModuleEnabled(settings, businessType, profile, "dashboard")) return "dashboard";
  return "pos";
}

export function isFreeItemsEnabled(settings, businessType) {
  return isModuleEnabled(settings, businessType, null, "freeItems");
}

export function isRepairsModuleEnabled(settings, businessType, profile) {
  return isModuleEnabled(settings, businessType, profile, "repairs");
}

export function hydrateFeatureFlagDefaults(settings, businessType, profile) {
  var next = Object.assign({}, settings || {});
  var toggles = getModuleToggles(next, businessType, profile);
  next.moduleToggles = toggles;
  next.freeItemsEnabled = toggles.freeItems === true;
  next.repairsModuleEnabled = toggles.repairs === true;
  return next;
}

export function persistModuleToggles(formToggles) {
  var toggles = {};
  MODULE_TOGGLE_DEFS.forEach(function (m) {
    toggles[m.id] = formToggles[m.id] === true;
  });
  return {
    moduleToggles: toggles,
    freeItemsEnabled: toggles.freeItems === true,
    repairsModuleEnabled: toggles.repairs === true,
  };
}
