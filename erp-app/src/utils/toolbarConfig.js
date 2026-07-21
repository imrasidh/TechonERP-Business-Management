/**
 * Editable icon toolbar — catalog + order persisted on tc3_settings.toolbarKeys.
 * Module toggles still gate whether a nav page is allowed; toolbar only picks shortcuts.
 */

/** Full catalog of placeable toolbar buttons (unique key per slot). */
export var TOOLBAR_CATALOG = [
  { key: "dashboard", navId: "dashboard", label: "Dashboard", icon: "📊", bg: "#dce8ff", group: "main" },
  { key: "pos", navId: "pos", label: "Sales", icon: "🛒", bg: "#cfefff", group: "main" },
  { key: "invoices", navId: "invoices", label: "Invoices", icon: "🧾", bg: "#e8e0ff", group: "main" },
  { key: "purchases", navId: "purchases", label: "Purchases", icon: "📦", bg: "#ffe4c4", group: "main" },
  { key: "inventory", navId: "inventory", label: "Inventory", icon: "🏪", bg: "#d9f5dc", group: "main" },
  { key: "returns", navId: "returns", label: "Returns", icon: "↩️", bg: "#ffe8d6", group: "main" },
  { key: "expenses", navId: "expenses", label: "Expenses", icon: "🧾", bg: "#fde7f3", group: "main" },
  { key: "accounts", navId: "accounts", label: "Accounts", icon: "💰", bg: "#fff0b8", group: "main" },
  { key: "receivables", navId: "receivables", label: "Receivables", icon: "📥", bg: "#d9f5dc", group: "finance" },
  { key: "payables", navId: "payables", label: "Payables", icon: "📤", bg: "#ffe3e3", group: "finance" },
  { key: "cheques", navId: "cheques", label: "Cheques", icon: "🏦", bg: "#e0f2fe", group: "finance" },
  { key: "money_in", action: "money_in", label: "Money In", icon: "💵", bg: "#d9f5dc", group: "cash" },
  { key: "money_out", action: "money_out", label: "Money Out", icon: "💸", bg: "#ffe3e3", group: "cash" },
  { key: "parties", navId: "parties", label: "Parties", icon: "👥", bg: "#d6ebff", group: "people" },
  { key: "statements", navId: "statements", label: "Statements", icon: "📄", bg: "#e8eef8", group: "people" },
  { key: "repairs", navId: "repairs", label: "Repairs", icon: "🔧", bg: "#fef3c7", group: "ops" },
  { key: "coddatabase", navId: "coddatabase", label: "COD", icon: "🚚", bg: "#ecfeff", group: "ops" },
  { key: "reports", navId: "reports", label: "Reports", icon: "📈", bg: "#dde2f7", group: "tools" },
  { key: "barcodeprint", navId: "barcodeprint", label: "Barcodes", icon: "🏷️", bg: "#f3e8ff", group: "tools" },
  { key: "auditlog", navId: "auditlog", label: "Audit Log", icon: "📋", bg: "#e2e8f0", group: "tools" },
  { key: "backup", navId: "settings", pageId: "settings", label: "Backup", icon: "💾", bg: "#e8ecef", group: "tools" },
  { key: "calc", action: "calc", label: "Calculator", icon: "🧮", bg: "#f2f2f2", group: "sys" },
  { key: "exit", action: "exit", label: "Exit", icon: "🚪", bg: "#ffe3e3", group: "sys", exit: true },
];

/** Default order when settings have no toolbarKeys yet. */
export var DEFAULT_TOOLBAR_KEYS = [
  "dashboard",
  "pos",
  "invoices",
  "purchases",
  "inventory",
  "accounts",
  "money_in",
  "money_out",
  "parties",
  "reports",
  "backup",
  "calc",
  "exit",
];

/** Keys that cannot be removed from the toolbar. */
export var TOOLBAR_PINNED_KEYS = ["exit"];

var CATALOG_BY_KEY = null;
function catalogMap() {
  if (!CATALOG_BY_KEY) {
    CATALOG_BY_KEY = {};
    TOOLBAR_CATALOG.forEach(function (item) {
      CATALOG_BY_KEY[item.key] = item;
    });
  }
  return CATALOG_BY_KEY;
}

export function getToolbarCatalogItem(key) {
  return catalogMap()[key] || null;
}

function sanitizeToolbarKeys(keys) {
  var map = catalogMap();
  var seen = {};
  var out = [];
  (Array.isArray(keys) ? keys : []).forEach(function (k) {
    var key = String(k || "");
    if (!key || !map[key] || seen[key]) return;
    seen[key] = true;
    out.push(key);
  });
  TOOLBAR_PINNED_KEYS.forEach(function (pk) {
    if (!seen[pk] && map[pk]) out.push(pk);
  });
  return out;
}

export function getDefaultToolbarKeys() {
  return DEFAULT_TOOLBAR_KEYS.slice();
}

export function getToolbarKeys(settings) {
  var raw = settings && Array.isArray(settings.toolbarKeys) ? settings.toolbarKeys : null;
  if (!raw || !raw.length) return getDefaultToolbarKeys();
  return sanitizeToolbarKeys(raw);
}

export function persistToolbarKeys(keys) {
  return { toolbarKeys: sanitizeToolbarKeys(keys) };
}

/**
 * Build shell toolbar items from settings.
 * @param {object} settings
 * @param {{ isNavAllowed?: (navId: string) => boolean }} [opts]
 */
export function resolveToolbarItems(settings, opts) {
  var isNavAllowed = opts && typeof opts.isNavAllowed === "function" ? opts.isNavAllowed : function () { return true; };
  var includeCustomize = !(opts && opts.includeCustomize === false);
  var keys = getToolbarKeys(settings);
  var map = catalogMap();
  var items = [];
  var exitItem = null;
  keys.forEach(function (key) {
    var cat = map[key];
    if (!cat) return;
    if (cat.navId && !cat.action) {
      if (!isNavAllowed(cat.navId)) return;
    }
    var item = {
      id: cat.navId || ("__" + cat.key),
      key: cat.key,
      label: cat.label,
      icon: cat.icon,
      bg: cat.bg,
      group: cat.group,
      action: cat.action || undefined,
      pageId: cat.pageId || undefined,
      exit: !!cat.exit,
    };
    if (cat.exit) {
      exitItem = item;
      return;
    }
    items.push(item);
  });
  if (includeCustomize) {
    items.push({
      id: "__customize",
      key: "customize",
      label: "Customize",
      icon: "⚙️",
      bg: "#eef2ff",
      group: "sys",
      action: "customize_toolbar",
    });
  }
  if (exitItem) items.push(exitItem);
  else if (map.exit) {
    items.push({
      id: "__exit",
      key: "exit",
      label: map.exit.label,
      icon: map.exit.icon,
      bg: map.exit.bg,
      group: map.exit.group,
      action: "exit",
      exit: true,
    });
  }
  return items;
}

export function moveToolbarKey(keys, index, dir) {
  var list = sanitizeToolbarKeys(keys);
  var exitIdx = list.indexOf("exit");
  if (exitIdx >= 0 && exitIdx !== list.length - 1) {
    list.splice(exitIdx, 1);
    list.push("exit");
  }
  var nextIdx = index + dir;
  if (index < 0 || index >= list.length || nextIdx < 0 || nextIdx >= list.length) return list;
  if (list[index] === "exit" || list[nextIdx] === "exit") return list;
  var copy = list.slice();
  var tmp = copy[index];
  copy[index] = copy[nextIdx];
  copy[nextIdx] = tmp;
  return copy;
}

/** Drag-and-drop reorder. Exit stays last and cannot be dragged. */
export function reorderToolbarKeys(keys, fromIndex, toIndex) {
  var list = sanitizeToolbarKeys(keys);
  if (fromIndex === toIndex) return list;
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return list;
  if (list[fromIndex] === "exit" || list[toIndex] === "exit") return list;
  var copy = list.slice();
  var [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  var exitIdx = copy.indexOf("exit");
  if (exitIdx >= 0 && exitIdx !== copy.length - 1) {
    copy.splice(exitIdx, 1);
    copy.push("exit");
  }
  return sanitizeToolbarKeys(copy);
}

export function addToolbarKey(keys, key) {
  var list = sanitizeToolbarKeys(keys);
  if (list.indexOf(key) >= 0) return list;
  if (!catalogMap()[key]) return list;
  var exitIdx = list.indexOf("exit");
  if (exitIdx >= 0) {
    list.splice(exitIdx, 0, key);
  } else {
    list.push(key);
  }
  return sanitizeToolbarKeys(list);
}

export function removeToolbarKey(keys, key) {
  if (TOOLBAR_PINNED_KEYS.indexOf(key) >= 0) return sanitizeToolbarKeys(keys);
  return sanitizeToolbarKeys((keys || []).filter(function (k) { return k !== key; }));
}

export function availableToolbarKeys(currentKeys) {
  var used = {};
  sanitizeToolbarKeys(currentKeys).forEach(function (k) { used[k] = true; });
  return TOOLBAR_CATALOG.filter(function (c) { return !used[c.key]; }).map(function (c) { return c.key; });
}
