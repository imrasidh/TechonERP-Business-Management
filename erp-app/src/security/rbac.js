export var ROLE_ADMIN = "admin";
export var ROLE_MANAGER = "manager";
export var ROLE_CASHIER = "cashier";

export var ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
};

/** Shown in Settings → User Management when creating a cashier account. */
export var CASHIER_ACCESS_SUMMARY = "Same screens as admin; staff modules on/off separately under Settings → Modules";

var ROLE_PERMISSIONS = {
  admin: {
    "reports.view": true,
    "settings.view": true,
    "invoices.edit": true,
    "invoices.delete": true,
    "users.manage": true,
  },
  manager: {
    "reports.view": true,
    "settings.view": true,
    "invoices.edit": false,
    "invoices.delete": false,
    "users.manage": false,
  },
  cashier: {
    "reports.view": false,
    "settings.view": false,
    "invoices.edit": false,
    "invoices.delete": false,
    "users.manage": false,
  },
};

export function normalizeRole(role) {
  var r = String(role || "").toLowerCase();
  if (r === ROLE_ADMIN || r === ROLE_MANAGER || r === ROLE_CASHIER) return r;
  return ROLE_CASHIER;
}

export function hasPermission(user, permission) {
  var role = normalizeRole(user && user.role);
  return !!(ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role][permission]);
}

export function canAccessPageByRole(user, pageId) {
  var role = normalizeRole(user && user.role);
  if (role === ROLE_ADMIN || role === ROLE_CASHIER) return true;
  if (role === ROLE_MANAGER) {
    if (pageId === "auditlog" || pageId === "accounts") return false;
    return true;
  }
  return true;
}

