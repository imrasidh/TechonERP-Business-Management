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



/**

 * Shared Money In / Money Out dialog — same save path as Payables / Receivables.

 * mode: "in" (manual payable) | "out" (manual receivable)

 */

export function MoneyInOutModal(props) {

  var mode = props.mode === "out" ? "out" : "in";

  var isIn = mode === "in";

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



  var types = isIn ? MONEY_IN_TYPES : MONEY_OUT_TYPES;

  var [form, setForm] = useState({

    date: typeof today === "function" ? today() : "",

    party: "",

    type: types[0],

    amount: "",

    paymentMethod: "Cash",

    reference: "",

    note: "",

  });

  var [selectedParty, setSelectedParty] = useState(null);



  var resolvePartyForSave = function () {

    if (selectedParty && selectedParty.id && selectedParty.name) {

      return selectedParty;

    }

    var exact = findExactParty(customers, suppliers, props.others || [], form.party);

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

      var payList = manualPays.concat([payEntry]);

      S.set("tc3_manualPayables", payList);

      if (typeof setState === "function") {

        setState(function (st) { return Object.assign({}, st, { _payTs: Date.now() }); });

      }

      if (typeof addAudit === "function") {

        addAudit("Money In: " + getCurrencySymbol() + " " + amt, party, { type: form.type, method: form.paymentMethod, partyKind: partyRow.kind });

      }

      showAlert("Money In recorded! Receipt " + receiptNo + " saved.");

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

      var recList = manualRecs.concat([recEntry]);

      S.set("tc3_manualReceivables", recList);

      if (typeof setState === "function") {

        setState(function (st) { return Object.assign({}, st, { _recTs: Date.now() }); });

      }

      if (typeof addAudit === "function") {

        addAudit("Money Out: " + getCurrencySymbol() + " " + amt, party, { type: form.type, method: form.paymentMethod, partyKind: partyRow.kind });

      }

      showAlert("Money Out recorded! Receipt " + receiptNoOut + " saved.");

    }



    if (typeof onSaved === "function") onSaved();

    onClose();

  };



  return (

    <Modal

      className={"erp-money-modal" + (isIn ? " is-in" : " is-out")}

      title={isIn ? "Money In" : "Money Out"}

      onClose={onClose}

      medium

      closeRound

    >

      <div className="erp-money">

        <div className={"erp-money-banner" + (isIn ? " is-in" : " is-out")}>

          {isIn

            ? "MONEY RECEIVED — CASH/BANK BALANCE GOES UP."

            : "MONEY GIVEN — CASH/BANK BALANCE GOES DOWN."}

        </div>



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
            placeholder={isIn ? "Search customer, supplier, or other..." : "Search customer, supplier, or other..."}

            value={form.party}

            selectedParty={selectedParty}

            onValueChange={function (val) { setForm(function (x) { return Object.assign({}, x, { party: val }); }); }}

            onSelectParty={setSelectedParty}

            customers={customers}
            suppliers={suppliers}
            others={props.others || []}

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

              {isIn ? "Save Money In" : "Save Money Out"}

            </button>

          </div>

        </div>

      </div>

    </Modal>

  );

}



export default MoneyInOutModal;

