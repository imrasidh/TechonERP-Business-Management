export function normalizePhoneKey(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function findCustomerByPhone(customers, phone) {
  var key = normalizePhoneKey(phone);
  if (!key) return null;
  var list = Array.isArray(customers) ? customers : [];
  return list.find(function (c) {
    return normalizePhoneKey(c.phone) === key;
  }) || null;
}

export function validateNewCustomerDraft(customers, draft) {
  var name = String(draft && draft.name || "").trim();
  var phone = String(draft && draft.phone || "").trim();
  var address = String(draft && draft.address || "").trim();
  if (!name) {
    return { ok: false, error: "Name is required." };
  }
  if (phone) {
    var existing = findCustomerByPhone(customers, phone);
    if (existing) {
      return {
        ok: false,
        error: "Phone number already exists for \"" + existing.name + "\".",
        existing: existing,
      };
    }
  }
  return { ok: true, name: name, phone: phone, address: address };
}

export function buildCustomerRecord(uid, draft) {
  var ts = new Date().toISOString();
  return {
    id: uid(),
    name: draft.name,
    phone: draft.phone || "",
    address: draft.address || "",
    credit: 0,
    totalSpent: 0,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function persistNewCustomer(S, setState, customers, created, tcTrialGuard) {
  if (typeof tcTrialGuard === "function" && !tcTrialGuard(customers, "customers")) {
    return false;
  }
  var nextCustomers = (customers || []).concat([created]);
  S.set("tc3_customers", nextCustomers);
  setState(function (st) {
    return Object.assign({}, st, { customers: nextCustomers });
  });
  return true;
}

export function createAndPersistCustomer(params) {
  var customers = params.customers;
  var setState = params.setState;
  var S = params.S;
  var uid = params.uid;
  var tcTrialGuard = params.tcTrialGuard;
  var draft = params.draft;

  var validated = validateNewCustomerDraft(customers, draft);
  if (!validated.ok) {
    return { ok: false, error: validated.error, existing: validated.existing || null };
  }

  var created = buildCustomerRecord(uid, validated);
  if (!persistNewCustomer(S, setState, customers, created, tcTrialGuard)) {
    return { ok: false, error: "Unable to add customer." };
  }

  return { ok: true, customer: created };
}
