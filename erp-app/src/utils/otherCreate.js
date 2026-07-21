import { stampUpdatedAt } from "./stampUpdatedAt.js";

export function validateNewOtherDraft(others, draft) {
  var name = String(draft && draft.name || "").trim();
  var phone = String(draft && draft.phone || "").trim();
  var address = String(draft && draft.address || "").trim();
  var note = String(draft && draft.note || "").trim();
  if (!name) {
    return { ok: false, error: "Name is required." };
  }
  var list = Array.isArray(others) ? others : [];
  var key = name.toLowerCase();
  var dup = list.find(function (o) { return String(o.name || "").trim().toLowerCase() === key; });
  if (dup) {
    return { ok: false, error: "Contact \"" + dup.name + "\" already exists.", existing: dup };
  }
  return { ok: true, name: name, phone: phone, address: address, note: note };
}

export function buildOtherRecord(uid, draft) {
  var ts = new Date().toISOString();
  return stampUpdatedAt({
    id: uid(),
    name: draft.name,
    phone: draft.phone || "",
    address: draft.address || "",
    note: draft.note || "",
    createdAt: ts,
  });
}

export function persistNewOther(S, setState, others, created, tcTrialGuard) {
  if (typeof tcTrialGuard === "function" && !tcTrialGuard(others, "others")) {
    return false;
  }
  var nextOthers = (others || []).concat([created]);
  S.set("tc3_others", nextOthers);
  if (typeof setState === "function") {
    setState(function (st) { return Object.assign({}, st, { others: nextOthers }); });
  }
  return true;
}

export function createAndPersistOther(params) {
  var others = params.others;
  var setState = params.setState;
  var S = params.S;
  var uid = params.uid;
  var tcTrialGuard = params.tcTrialGuard;
  var draft = params.draft;

  var validated = validateNewOtherDraft(others, draft);
  if (!validated.ok) {
    return { ok: false, error: validated.error, existing: validated.existing || null };
  }

  var created = buildOtherRecord(uid, validated);
  if (!persistNewOther(S, setState, others, created, tcTrialGuard)) {
    return { ok: false, error: "Unable to add contact." };
  }

  return { ok: true, other: created };
}
