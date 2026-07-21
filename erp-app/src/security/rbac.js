export var ROLE_ADMIN = "admin";
export var ROLE_MANAGER = "manager";
export var ROLE_CASHIER = "cashier";

export var ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
};

/** Shown in Settings → User Management when creating a cashier account. */
export var CASHIER_ACCESS_SUMMARY =
  "POS and day-to-day screens; void/edit invoice details and settings are admin-only (enforced in storage writes)";

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

/** Live session actor for storage-level permission checks (set on login). */
export function getSessionActor() {
  try {
    if (typeof window !== "undefined" && window._tcSessionUser) return window._tcSessionUser;
  } catch (_e) { /* ignore */ }
  try {
    if (typeof sessionStorage === "undefined") return null;
    var raw = sessionStorage.getItem("tc3_current_user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e2) {
    return null;
  }
}

export function setSessionActor(user) {
  try {
    if (typeof window !== "undefined") window._tcSessionUser = user || null;
  } catch (_e) { /* ignore */ }
}

function isVoidedRow(row) {
  if (!row) return false;
  if (row.voided) return true;
  var st = String(row.status || row.payStatus || "").toLowerCase();
  return st === "voided";
}

function indexById(rows) {
  var map = {};
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (r && r.id != null) map[String(r.id)] = r;
  });
  return map;
}

/**
 * Payment-only sale/purchase updates are allowed for cashiers (collect money).
 * Meta edits (items/total/customer/date/invoiceNo) and voids require permissions.
 */
function isPaymentOnlyDocChange(oldRow, newRow) {
  if (!oldRow || !newRow) return false;
  var oldCopy = Object.assign({}, oldRow);
  var newCopy = Object.assign({}, newRow);
  delete oldCopy.paid;
  delete oldCopy.paidAmount;
  delete oldCopy.balance;
  delete oldCopy.payStatus;
  delete oldCopy.status;
  delete oldCopy.paymentHistory;
  delete oldCopy.updatedAt;
  delete oldCopy.overpaidAmount;
  delete newCopy.paid;
  delete newCopy.paidAmount;
  delete newCopy.balance;
  delete newCopy.payStatus;
  delete newCopy.status;
  delete newCopy.paymentHistory;
  delete newCopy.updatedAt;
  delete newCopy.overpaidAmount;
  /* Status may flip Paid/Partial/Unpaid with payments — allow if not voiding. */
  try {
    return JSON.stringify(oldCopy) === JSON.stringify(newCopy);
  } catch (_e) {
    return false;
  }
}

/**
 * Storage-level RBAC: blocks privileged writes even if UI is bypassed.
 * Sync hydration / silent GL paths should skip via _glSilentDepth (caller).
 * @returns {{ ok: boolean, message?: string }}
 */
export function assertRoleAllowsStorageMutation(user, key, newV, oldV) {
  /* No session yet (startup seed) — allow. */
  if (!user) return { ok: true };
  var role = normalizeRole(user.role);
  if (role === ROLE_ADMIN) return { ok: true };

  if (key === "tc3_users" && !hasPermission(user, "users.manage")) {
    return { ok: false, message: "Permission denied: only admin can manage users." };
  }

  if (key === "tc3_settings" && !hasPermission(user, "settings.view")) {
    return { ok: false, message: "Permission denied: settings changes require admin/manager access." };
  }

  if (key === "tc3_apppass" || key === "tc3_admin_name") {
    return { ok: false, message: "Permission denied: admin credentials cannot be changed by this role." };
  }

  if ((key === "tc3_sales" || key === "tc3_purchases") && Array.isArray(newV)) {
    var oldMap = indexById(oldV);
    var canEdit = hasPermission(user, "invoices.edit");
    var canDelete = hasPermission(user, "invoices.delete");
    for (var i = 0; i < newV.length; i++) {
      var row = newV[i];
      if (!row || row.id == null) continue;
      var prev = oldMap[String(row.id)];
      if (!prev) continue; /* new docs (POS/purchase create) allowed */
      if (isVoidedRow(row) && !isVoidedRow(prev) && !canDelete) {
        return { ok: false, message: "Permission denied: voiding invoices requires admin." };
      }
      if (!canEdit && !isPaymentOnlyDocChange(prev, row)) {
        return { ok: false, message: "Permission denied: editing invoice details requires admin." };
      }
    }
  }

  if (key === "tc3_quotations" && Array.isArray(newV) && !hasPermission(user, "invoices.edit")) {
    var oq = indexById(oldV);
    var nq = Array.isArray(newV) ? newV : [];
    /* Allow status-only / no-op; block create/edit/delete of quotation body without edit perm.
       Cashiers cannot create quotations (UI already gates); enforce here too. */
    if (nq.length !== (Array.isArray(oldV) ? oldV.length : 0)) {
      return { ok: false, message: "Permission denied: quotations require invoice-edit permission." };
    }
    for (var qi = 0; qi < nq.length; qi++) {
      var qr = nq[qi];
      if (!qr || qr.id == null) continue;
      var qp = oq[String(qr.id)];
      if (!qp) {
        return { ok: false, message: "Permission denied: quotations require invoice-edit permission." };
      }
      var qOld = Object.assign({}, qp);
      var qNew = Object.assign({}, qr);
      delete qOld.status;
      delete qNew.status;
      delete qOld.updatedAt;
      delete qNew.updatedAt;
      try {
        if (JSON.stringify(qOld) !== JSON.stringify(qNew)) {
          return { ok: false, message: "Permission denied: editing quotations requires admin." };
        }
      } catch (_qe) {
        return { ok: false, message: "Permission denied: editing quotations requires admin." };
      }
    }
  }

  return { ok: true };
}

/**
 * Block doc meta edits while another counter holds the soft edit lock.
 * Payment-only updates still allowed (receivables/payables).
 */
export function assertNoForeignLockOnDocMetaWrite(getLocks, deviceId, key, newV, oldV) {
  if (key !== "tc3_sales" && key !== "tc3_purchases") return { ok: true };
  if (!Array.isArray(newV)) return { ok: true };
  var locks = typeof getLocks === "function" ? getLocks() : [];
  if (!Array.isArray(locks) || !locks.length) return { ok: true };
  var oldMap = indexById(oldV);
  var now = Date.now();
  var myDev = String(deviceId || "");

  function activeForeign(docId) {
    var id = String(docId);
    var best = null;
    for (var i = 0; i < locks.length; i++) {
      var row = locks[i];
      if (!row || String(row.id) !== id) continue;
      if (row.active === false) continue;
      var exp = row.expiresAt ? Date.parse(String(row.expiresAt)) : NaN;
      if (!isNaN(exp) && exp <= now) continue;
      if (!best) best = row;
      else if (String(row.updatedAt || row.at || "") >= String(best.updatedAt || best.at || "")) best = row;
    }
    if (!best) return null;
    if (String(best.deviceId || "") === myDev) return null;
    return best;
  }

  for (var i = 0; i < newV.length; i++) {
    var row = newV[i];
    if (!row || row.id == null) continue;
    var prev = oldMap[String(row.id)];
    if (!prev) continue;
    if (isPaymentOnlyDocChange(prev, row)) continue;
    var foreign = activeForeign(row.id);
    if (foreign) {
      var who = String(foreign.by || foreign.byUser || "another counter");
      return {
        ok: false,
        message: "Being edited by " + who + ". Save blocked until they finish (or the lock expires).",
      };
    }
  }
  return { ok: true };
}
