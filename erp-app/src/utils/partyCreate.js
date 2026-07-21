import { createAndPersistCustomer } from "./customerCreate.js";
import { createAndPersistSupplier } from "./supplierCreate.js";
import { createAndPersistOther } from "./otherCreate.js";

/** Map page context → fixed party kind, or null when user must choose. */
export function resolvePartyKind(context, partyKind) {
  if (partyKind === "customer" || partyKind === "supplier" || partyKind === "other") return partyKind;
  var ctx = String(context || "").toLowerCase();
  if (ctx === "sales" || ctx === "customers" || ctx === "parties_customer" || ctx === "invoices" || ctx === "repairs_customer") return "customer";
  if (ctx === "purchase" || ctx === "suppliers" || ctx === "parties_supplier" || ctx === "repairs_supplier") return "supplier";
  if (ctx === "parties_other" || ctx === "others") return "other";
  return null;
}

export function isPartyKindChoice(context, partyKind) {
  if (partyKind === "choice") return true;
  return resolvePartyKind(context, partyKind) === null;
}

export function partyKindLabel(kind) {
  if (kind === "supplier") return "Supplier";
  if (kind === "other") return "Other";
  return "Customer";
}

export function createAndPersistParty(params) {
  var kind = params.kind;
  var draft = params.draft || {};
  if (kind === "customer") {
    var cResult = createAndPersistCustomer({
      customers: params.customers,
      setState: params.setState,
      S: params.S,
      uid: params.uid,
      tcTrialGuard: params.tcTrialGuard,
      draft: draft,
    });
    if (!cResult.ok) return cResult;
    return { ok: true, kind: "customer", party: cResult.customer };
  }
  if (kind === "supplier") {
    var sResult = createAndPersistSupplier({
      suppliers: params.suppliers,
      setState: params.setState,
      S: params.S,
      uid: params.uid,
      tcTrialGuard: params.tcTrialGuard,
      draft: draft,
    });
    if (!sResult.ok) return sResult;
    return { ok: true, kind: "supplier", party: sResult.supplier };
  }
  if (kind === "other") {
    var oResult = createAndPersistOther({
      others: params.others,
      setState: params.setState,
      S: params.S,
      uid: params.uid,
      tcTrialGuard: params.tcTrialGuard,
      draft: draft,
    });
    if (!oResult.ok) return oResult;
    return { ok: true, kind: "other", party: oResult.other };
  }
  return { ok: false, error: "Please select Customer, Supplier, or Other." };
}
