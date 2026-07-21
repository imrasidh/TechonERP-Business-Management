import { stampUpdatedAt } from "./stampUpdatedAt.js";

export function validateNewSupplierDraft(suppliers, draft) {
  var name = String(draft && draft.name || "").trim();
  var phone = String(draft && draft.phone || "").trim();
  var address = String(draft && draft.address || "").trim();
  var email = String(draft && draft.email || "").trim();
  if (!name) {
    return { ok: false, error: "Name is required." };
  }
  var list = Array.isArray(suppliers) ? suppliers : [];
  var key = name.toLowerCase();
  var dup = list.find(function (s) { return String(s.name || "").trim().toLowerCase() === key; });
  if (dup) {
    return { ok: false, error: "Supplier \"" + dup.name + "\" already exists.", existing: dup };
  }
  return { ok: true, name: name, phone: phone, address: address, email: email };
}

export function buildSupplierRecord(uid, draft) {
  var ts = new Date().toISOString();
  return stampUpdatedAt({
    id: uid(),
    name: draft.name,
    phone: draft.phone || "",
    email: draft.email || "",
    address: draft.address || "",
    note: draft.note || "",
    payable: 0,
    createdAt: ts,
  });
}

export function persistNewSupplier(S, setState, suppliers, created, tcTrialGuard) {
  if (typeof tcTrialGuard === "function" && !tcTrialGuard(suppliers, "suppliers")) {
    return false;
  }
  var nextSuppliers = (suppliers || []).concat([created]);
  S.set("tc3_suppliers", nextSuppliers);
  if (typeof setState === "function") {
    setState(function (st) { return Object.assign({}, st, { suppliers: nextSuppliers }); });
  }
  return true;
}

export function createAndPersistSupplier(params) {
  var suppliers = params.suppliers;
  var setState = params.setState;
  var S = params.S;
  var uid = params.uid;
  var tcTrialGuard = params.tcTrialGuard;
  var draft = params.draft;

  var validated = validateNewSupplierDraft(suppliers, draft);
  if (!validated.ok) {
    return { ok: false, error: validated.error, existing: validated.existing || null };
  }

  var created = buildSupplierRecord(uid, validated);
  if (!persistNewSupplier(S, setState, suppliers, created, tcTrialGuard)) {
    return { ok: false, error: "Unable to add supplier." };
  }

  return { ok: true, supplier: created };
}
