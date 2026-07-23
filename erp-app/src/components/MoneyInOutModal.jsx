import React, { useState } from "react";
import MoneyPartyPicker, { findExactParty } from "./MoneyPartyPicker.jsx";
import { stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import { generateDocumentNumber } from "../utils/docNumbers.js";

var MONEY_IN_TYPES = [
  "Borrowed Money",
  "Bank Loan",
  "Family / Friend Loan",
  "Security Deposit Received",
  "Advance from Customer",
  "Cheque Received (Pending)",
  "Inter-Account Transfer",
  "Other Payable",
];

var MONEY_OUT_TYPES = [
  "Loan Given",
  "Staff Advance",
  "Security Deposit Paid",
  "Advance to Supplier",
  "Cheque Issued (Pending)",
  "Refund Pending",
  "Inter-Account Transfer",
  "Other Receivable",
];

function sumPaymentHistory(ph) {
  if (!Array.isArray(ph)) return 0;
  return ph.reduce(function (a, p) {
    var amt = parseFloat(p && p.amount) || 0;
    return a + (amt > 0 ? amt : 0);
  }, 0);
}

function resolveInitialParty(editRecord, customers, suppliers, others) {
  if (!editRecord) return null;
  var name = editRecord.source || editRecord.person || "";
  var kind = editRecord.partyKind || "";
  var id = editRecord.partyId || "";
  if (id && kind) {
    var list = kind === "customer" ? customers : (kind === "supplier" ? suppliers : others);
    var found = (list || []).find(function (p) { return p && String(p.id) === String(id); });
    if (found) {
      return { id: found.id, name: found.name || name, kind: kind, phone: found.phone || "" };
    }
    return { id: id, name: name, kind: kind, phone: "" };
  }
  if (name) {
    var exact = findExactParty(customers || [], suppliers || [], others || [], name);
    if (exact) return exact;
  }
  return null;
}

/**
 * Shared Money In / Money Out dialog — same save path as Payables / Receivables.
 * mode: "in" (manual payable) | "out" (manual receivable)
 * editRecord: existing manual payable/receivable to update (opens edit mode)
 */
export function MoneyInOutModal(props) {
  var mode = props.mode === "out" ? "out" : "in";
  var isIn = mode === "in";
  var editRecord = props.editRecord || null;
  var isEdit = !!(editRecord && editRecord.id);
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var showAlert = props.showAlert;
  var addAudit = props.addAudit;
  var setState = props.setState;
  var onClose = props.onClose;
  var onSaved = props.onSaved;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var Btn = props.Btn;
  var C = props.C || {};
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var customers = props.customers || [];
  var suppliers = props.suppliers || [];
  var others = props.others || [];

  var types = isIn ? MONEY_IN_TYPES : MONEY_OUT_TYPES;
  var [form, setForm] = useState(function () {
    if (isEdit) {
      var t = editRecord.type || types[0];
      if (types.indexOf(t) < 0) t = types[0];
      return {
        date: editRecord.date || (typeof today === "function" ? today() : ""),
        party: editRecord.source || editRecord.person || "",
        type: t,
        amount: editRecord.amount != null ? String(editRecord.amount) : "",
        paymentMethod: editRecord.paymentMethod || "Cash",
        reference: editRecord.reference || "",
        note: editRecord.note || "",
      };
    }
    return {
      date: typeof today === "function" ? today() : "",
      party: "",
      type: types[0],
      amount: "",
      paymentMethod: "Cash",
      reference: "",
      note: "",
    };
  });
  var [selectedParty, setSelectedParty] = useState(function () {
    return resolveInitialParty(isEdit ? editRecord : null, customers, suppliers, others);
  });

  var resolvePartyForSave = function () {
    if (selectedParty && selectedParty.id && selectedParty.name) {
      return selectedParty;
    }
    var exact = findExactParty(customers, suppliers, others, form.party);
    if (exact) return exact;
    return null;
  };

  var save = function () {
    var partyRow = resolvePartyForSave();
    if (!partyRow) {
      showAlert("Please search and select a party, or add a new one from the list.");
      return;
    }
    var party = partyRow.name;
    var amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      showAlert("Please enter a valid amount.");
      return;
    }

    if (isEdit) {
      if (editRecord._isOpening) {
        showAlert("Opening balance entries are edited from Accounts → Opening Balance.");
        return;
      }
      if (editRecord.thirdPartyRepairId) {
        showAlert("This receipt is linked to a 3rd party repair. Edit it from Repairs.");
        return;
      }
      var alreadyPaid = sumPaymentHistory(editRecord.paymentHistory);
      if (amt + 0.005 < alreadyPaid) {
        showAlert(
          "Amount cannot be less than already " + (isIn ? "paid" : "collected") +
          " (" + getCurrencySymbol() + " " + alreadyPaid.toFixed(2) + ")."
        );
        return;
      }

      var ts = new Date().toISOString();
      var updated = stampTransactionIsoDateTime(Object.assign({}, editRecord, {
        date: form.date,
        type: form.type,
        amount: amt,
        paymentMethod: form.paymentMethod || "Cash",
        reference: form.reference || "",
        note: form.note || "",
        partyKind: partyRow.kind,
        partyId: partyRow.id,
        updatedAt: ts,
      }), editRecord.isoDateTime || editRecord.createdAt || ts);

      if (isIn) {
        updated.source = party;
        delete updated.person;
        var payList = (S.get("tc3_manualPayables", []) || []).map(function (m) {
          return m.id === editRecord.id ? updated : m;
        });
        S.set("tc3_manualPayables", payList);
        if (typeof setState === "function") {
          setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
        }
      } else {
        updated.person = party;
        delete updated.source;
        var recList = (S.get("tc3_manualReceivables", []) || []).map(function (m) {
          return m.id === editRecord.id ? updated : m;
        });
        S.set("tc3_manualReceivables", recList);
        if (typeof setState === "function") {
          setState(function (st) { return Object.assign({}, st, { _recTs: Date.now() }); });
        }
      }

      if (typeof addAudit === "function") {
        addAudit(
          (isIn ? "Edited Money In" : "Edited Money Out") + ": " + getCurrencySymbol() + " " + amt,
          party,
          { type: form.type, method: form.paymentMethod, receiptNo: editRecord.receiptNo || "", id: editRecord.id }
        );
      }
      showAlert((isIn ? "Money In" : "Money Out") + " updated! Receipt " + (editRecord.receiptNo || "") + " saved.");
      if (typeof onSaved === "function") onSaved(updated);
      onClose();
      return;
    }

    if (isIn) {
      var manualPays = S.get("tc3_manualPayables", []);
      if (!tcTrialGuard(manualPays, "manualPayables")) return;
      var payTs = new Date().toISOString();
      var receiptNo = generateDocumentNumber("RCP");
      var payEntry = stampTransactionIsoDateTime({
        id: uid(),
        date: form.date,
        source: party,
        partyKind: partyRow.kind,
        partyId: partyRow.id,
        type: form.type,
        amount: amt,
        paymentMethod: form.paymentMethod || "Cash",
        reference: form.reference || "",
        note: form.note || "",
        receiptNo: receiptNo,
        receiptKind: "in",
        paymentHistory: [],
        createdAt: payTs,
        updatedAt: payTs,
      }, payTs);
      var payListNew = manualPays.concat([payEntry]);
      S.set("tc3_manualPayables", payListNew);
      if (typeof setState === "function") {
        setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });
      }
      if (typeof addAudit === "function") {
        addAudit("Money In: " + getCurrencySymbol() + " " + amt, party, { type: form.type, method: form.paymentMethod, partyKind: partyRow.kind });
      }
      showAlert("Money In recorded! Receipt " + receiptNo + " saved.");
      if (typeof onSaved === "function") onSaved(payEntry);
    } else {
      var manualRecs = S.get("tc3_manualReceivables", []);
      if (!tcTrialGuard(manualRecs, "manualReceivables")) return;
      var recTs = new Date().toISOString();
      var receiptNoOut = generateDocumentNumber("RCP");
      var recEntry = stampTransactionIsoDateTime({
        id: uid(),
        date: form.date,
        person: party,
        partyKind: partyRow.kind,
        partyId: partyRow.id,
        type: form.type,
        amount: amt,
        paymentMethod: form.paymentMethod || "Cash",
        reference: form.reference || "",
        note: form.note || "",
        receiptNo: receiptNoOut,
        receiptKind: "out",
        paymentHistory: [],
        createdAt: recTs,
        updatedAt: recTs,
      }, recTs);
      var recListNew = manualRecs.concat([recEntry]);
      S.set("tc3_manualReceivables", recListNew);
      if (typeof setState === "function") {
        setState(function (st) { return Object.assign({}, st, { _recTs: Date.now() }); });
      }
      if (typeof addAudit === "function") {
        addAudit("Money Out: " + getCurrencySymbol() + " " + amt, party, { type: form.type, method: form.paymentMethod, partyKind: partyRow.kind });
      }
      showAlert("Money Out recorded! Receipt " + receiptNoOut + " saved.");
      if (typeof onSaved === "function") onSaved(recEntry);
    }

    onClose();
  };

  return (
    <Modal
      className={"erp-money-modal" + (isIn ? " is-in" : " is-out")}
      title={isEdit ? (isIn ? "Edit Money In" : "Edit Money Out") : (isIn ? "Money In" : "Money Out")}
      onClose={onClose}
      medium
      closeRound
      zIndex={props.zIndex || (isEdit ? 13000 : undefined)}
    >
      <div className="erp-money">
        <div className={"erp-money-banner" + (isIn ? " is-in" : " is-out")}>
          {isEdit
            ? (isIn
              ? "EDITING MONEY IN RECEIPT — UPDATE DETAILS THEN SAVE."
              : "EDITING MONEY OUT RECEIPT — UPDATE DETAILS THEN SAVE.")
            : (isIn
              ? "MONEY RECEIVED — CASH/BANK BALANCE GOES UP."
              : "MONEY GIVEN — CASH/BANK BALANCE GOES DOWN.")}
        </div>

        {isEdit && editRecord.receiptNo ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>
            Receipt <span style={{ fontFamily: "monospace", color: "#1d4ed8" }}>{editRecord.receiptNo}</span>
          </div>
        ) : null}

        <div className="erp-money-grid-top">
          <Input
            compact
            label="Date *"
            type="date"
            value={form.date}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }}
          />
          <Sel
            label="Reason / Type *"
            value={form.type}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}
          >
            {types.map(function (t) {
              return <option key={t} value={t}>{t}</option>;
            })}
          </Sel>
          <Input
            compact
            label={"Amount (" + getCurrencySymbol() + ") *"}
            type="number"
            value={form.amount}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }}
          />
          <div className="erp-money-method">
            <div className="erp-money-method-label">
              {isIn ? "Received Via *" : "Paid Via *"}
            </div>
            <div className="erp-money-method-row" role="group" aria-label={isIn ? "Received via" : "Paid via"}>
              {[["Cash", "cash"], ["Bank", "bank"]].map(function (opt) {
                var active = (form.paymentMethod || "Cash") === opt[0];
                return (
                  <button
                    key={opt[0]}
                    type="button"
                    className={"erp-money-method-btn is-" + opt[1] + (active ? " is-active" : "")}
                    onClick={function () { setForm(function (x) { return Object.assign({}, x, { paymentMethod: opt[0] }); }); }}
                  >
                    {opt[0]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="erp-money-grid-mid">
          <MoneyPartyPicker
            isIn={isIn}
            label={isIn ? "From (Party) *" : "To (Party) *"}
            placeholder="Search customer, supplier, or other..."
            value={form.party}
            selectedParty={selectedParty}
            onValueChange={function (val) { setForm(function (x) { return Object.assign({}, x, { party: val }); }); }}
            onSelectParty={setSelectedParty}
            customers={customers}
            suppliers={suppliers}
            others={others}
            S={S}
            setState={setState}
            uid={uid}
            tcTrialGuard={tcTrialGuard}
            Modal={Modal}
            Input={Input}
            Btn={Btn}
            C={C}
          />
          <Input
            compact
            label="Reference"
            value={form.reference}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { reference: e.target.value }); }); }}
            placeholder="Optional"
          />
        </div>

        <div className="erp-money-grid-bot">
          <Input
            compact
            label="Note"
            value={form.note}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }}
            placeholder="Optional note"
          />
          <div className="erp-money-footer">
            <button type="button" className="erp-money-btn erp-money-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={"erp-money-btn erp-money-btn-save" + (isIn ? " is-in" : " is-out")}
              onClick={save}
            >
              {isEdit
                ? (isIn ? "Update Money In" : "Update Money Out")
                : (isIn ? "Save Money In" : "Save Money Out")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default MoneyInOutModal;
