import React, { useEffect, useMemo, useState } from "react";
import {
  createAndPersistParty,
  isPartyKindChoice,
  partyKindLabel,
  resolvePartyKind,
} from "../utils/partyCreate.js";

var EMPTY_FORM = { name: "", phone: "", address: "", email: "", note: "" };

/**
 * Unified Add Customer / Supplier modal for the whole ERP.
 *
 * context (auto kind):
 *   sales, customers, invoices, repairs_customer → Customer
 *   purchase, suppliers, repairs_supplier → Supplier
 *   parties_other, others → Other
 *   money, generic → user chooses Customer, Supplier, or Other
 *
 * partyKind: "customer" | "supplier" | "choice" — overrides context when set
 */
export default function AddPartyModal(props) {
  var open = !!props.open;
  var onClose = props.onClose;
  var onCreate = props.onCreate;
  var onSaved = props.onSaved;
  var customers = Array.isArray(props.customers) ? props.customers : [];
  var suppliers = Array.isArray(props.suppliers) ? props.suppliers : [];
  var initialValues = props.initialValues || EMPTY_FORM;
  var Modal = props.Modal;
  var Input = props.Input;
  var Btn = props.Btn;
  var context = props.context || "generic";
  var partyKindProp = props.partyKind || null;
  var defaultKind = props.defaultKind === "supplier" ? "supplier" : (props.defaultKind === "other" ? "other" : "customer");
  var hint = props.hint || "";
  var allowedKinds = Array.isArray(props.allowedKinds) && props.allowedKinds.length
    ? props.allowedKinds.filter(function (k) { return k === "customer" || k === "supplier" || k === "other"; })
    : null;

  var kindChoice = isPartyKindChoice(context, partyKindProp);
  var lockedKind = kindChoice ? null : resolvePartyKind(context, partyKindProp);
  if (allowedKinds && allowedKinds.length === 1) {
    lockedKind = allowedKinds[0];
    kindChoice = false;
  } else if (allowedKinds && allowedKinds.length > 1) {
    kindChoice = true;
    lockedKind = null;
  }

  var [form, setForm] = useState(EMPTY_FORM);
  var [error, setError] = useState("");
  var [selectedKind, setSelectedKind] = useState(defaultKind);

  var activeKind = lockedKind || selectedKind;

  var title = props.title || (kindChoice
    ? "Add Party"
    : ("Add " + partyKindLabel(activeKind)));

  var saveLabel = "Save " + partyKindLabel(activeKind);

  var contextHint = useMemo(function () {
    if (hint) return hint;
    if (lockedKind === "customer") return "This contact will be saved as a Customer.";
    if (lockedKind === "supplier") return "This contact will be saved as a Supplier.";
    if (lockedKind === "other") return "This contact will be saved as Other (general contact).";
    return "Choose whether this contact is a Customer, Supplier, or Other.";
  }, [hint, lockedKind]);

  useEffect(function () {
    if (!open) return;
    setForm({
      name: String(initialValues.name || "").trim(),
      phone: String(initialValues.phone || "").trim(),
      address: String(initialValues.address || "").trim(),
      email: String(initialValues.email || "").trim(),
      note: String(initialValues.note || "").trim(),
    });
    setError("");
    setSelectedKind(defaultKind);
  }, [
    open,
    initialValues.name,
    initialValues.phone,
    initialValues.address,
    initialValues.email,
    initialValues.note,
    defaultKind,
  ]);

  if (!open || !Modal || !Input) return null;

  var handleClose = function () {
    setError("");
    setForm(EMPTY_FORM);
    if (typeof onClose === "function") onClose();
  };

  var handleSave = function () {
    var draft = {
      name: String(form.name || "").trim(),
      phone: String(form.phone || "").trim(),
      address: String(form.address || "").trim(),
      email: String(form.email || "").trim(),
      note: String(form.note || "").trim(),
    };
    if (!draft.name) {
      setError("Name is required.");
      return;
    }

    var savedKind = activeKind;

    var created = null;
    if (typeof onCreate === "function") {
      created = onCreate(draft, savedKind);
      if (!created) {
        setError("Unable to save " + partyKindLabel(savedKind).toLowerCase() + ". Please try again.");
        return;
      }
    } else if (props.S && props.uid) {
      var result = createAndPersistParty({
        kind: savedKind,
        draft: draft,
        customers: customers,
        suppliers: suppliers,
        others: props.others,
        S: props.S,
        setState: props.setState,
        uid: props.uid,
        tcTrialGuard: props.tcTrialGuard,
      });
      if (!result.ok) {
        setError(result.error || "Unable to save.");
        return;
      }
      created = result.party;
      savedKind = result.kind;
    } else {
      setError("Save handler is not configured.");
      return;
    }

    setForm(EMPTY_FORM);
    setError("");
    if (typeof onSaved === "function") onSaved(created, savedKind);
    if (typeof onClose === "function") onClose();
  };

  return (
    <Modal
      title={title}
      wide
      closeRound
      onClose={handleClose}
      zIndex={props.zIndex || 1100}
      className={"erp-party-modal" + (kindChoice ? " is-choice" : (" is-" + activeKind))}
    >
      <div className="erp-party-modal-body">
        {contextHint ? (
          <div className={"erp-party-modal-hint is-" + (lockedKind || "choice")}>{contextHint}</div>
        ) : null}

        {kindChoice ? (
          <div className={"erp-party-kind-row" + (allowedKinds && allowedKinds.length === 2 ? " is-two" : " is-three")} role="group" aria-label="Contact type">
            {(!allowedKinds || allowedKinds.indexOf("customer") >= 0) ? (
              <button
                type="button"
                className={"erp-party-kind-btn is-customer" + (selectedKind === "customer" ? " is-active" : "")}
                onClick={function () { setSelectedKind("customer"); setError(""); }}
              >
                Customer
              </button>
            ) : null}
            {(!allowedKinds || allowedKinds.indexOf("supplier") >= 0) ? (
              <button
                type="button"
                className={"erp-party-kind-btn is-supplier" + (selectedKind === "supplier" ? " is-active" : "")}
                onClick={function () { setSelectedKind("supplier"); setError(""); }}
              >
                Supplier
              </button>
            ) : null}
            {(!allowedKinds || allowedKinds.indexOf("other") >= 0) ? (
              <button
                type="button"
                className={"erp-party-kind-btn is-other" + (selectedKind === "other" ? " is-active" : "")}
                onClick={function () { setSelectedKind("other"); setError(""); }}
              >
                Other
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="erp-party-modal-error">{error}</div>
        ) : null}

        <div className="erp-party-modal-fields">
          <Input
            compact
            label="Name *"
            autoFocus
            value={form.name}
            onChange={function (e) {
              setError("");
              setForm(function (x) { return Object.assign({}, x, { name: e.target.value }); });
            }}
            placeholder={activeKind === "supplier" ? "Supplier name" : (activeKind === "other" ? "Contact name" : "Customer name")}
          />
          {activeKind === "supplier" ? (
            <div className="erp-party-modal-meta-row is-three">
              <Input
                compact
                label="Phone"
                value={form.phone}
                onChange={function (e) {
                  setError("");
                  setForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); });
                }}
                placeholder="Phone number"
              />
              <Input
                compact
                label="Email"
                value={form.email}
                onChange={function (e) {
                  setForm(function (x) { return Object.assign({}, x, { email: e.target.value }); });
                }}
                placeholder="Email (optional)"
              />
              <Input
                compact
                label="Address"
                value={form.address}
                onChange={function (e) {
                  setForm(function (x) { return Object.assign({}, x, { address: e.target.value }); });
                }}
                placeholder="Address (optional)"
              />
            </div>
          ) : (
            <div className="erp-party-modal-meta-row is-two">
              <Input
                compact
                label="Phone"
                value={form.phone}
                onChange={function (e) {
                  setError("");
                  setForm(function (x) { return Object.assign({}, x, { phone: e.target.value }); });
                }}
                placeholder="Phone number"
              />
              <Input
                compact
                label="Address"
                value={form.address}
                onChange={function (e) {
                  setForm(function (x) { return Object.assign({}, x, { address: e.target.value }); });
                }}
                placeholder="Address (optional)"
              />
            </div>
          )}
          {activeKind === "supplier" || activeKind === "other" ? (
            <Input
              compact
              label="Note"
              value={form.note}
              onChange={function (e) {
                setForm(function (x) { return Object.assign({}, x, { note: e.target.value }); });
              }}
              placeholder="Note (optional)"
            />
          ) : null}
        </div>

        <div className="erp-party-modal-footer">
          {Btn ? (
            <>
              <Btn col="gray" onClick={handleClose}>Cancel</Btn>
              <Btn col="blue" onClick={handleSave} disabled={!String(form.name || "").trim()}>{saveLabel}</Btn>
            </>
          ) : (
            <>
              <button type="button" className="erp-cust-picker-btn" onClick={handleClose}>Cancel</button>
              <button
                type="button"
                className="erp-cust-picker-btn primary"
                onClick={handleSave}
                disabled={!String(form.name || "").trim()}
              >
                {saveLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
