import React, { useEffect, useMemo, useRef, useState } from "react";
import MoneyPartyPicker from "./MoneyPartyPicker.jsx";
import { SourceDocLink } from "./SourceDocLink.jsx";
import {
  allocateFifo,
  filterUnsettledForParty,
  sumAllocation,
  sumSelectedBalance,
} from "../utils/arapPartyPay.js";
import { payableEntryNav, receivableEntryNav } from "../utils/sourceDocumentNav.js";

/**
 * Party-scoped payment: select party → unsettled docs → allocate amount → pay (incl. cheque).
 * mode: "receive" (Receivables) | "pay" (Payables)
 */
export function PartyPaymentModal(props) {
  var mode = props.mode === "pay" ? "pay" : "receive";
  var isReceive = mode === "receive";
  var entries = props.entries || [];
  var cheques = props.cheques || [];
  var customers = props.customers || [];
  var suppliers = props.suppliers || [];
  var others = props.others || [];
  var onSave = props.onSave;
  var onClose = props.onClose;
  var showAlert = props.showAlert || function () {};
  var openSourceDocument = props.openSourceDocument;
  var Modal = props.Modal;
  var Btn = props.Btn;
  var today = props.today || function () { return ""; };
  var fmtNum = props.fmtNum || function (n) { return String(n); };
  var fmtDate = props.fmtDate || function (d) { return d || ""; };
  var getCurrencySymbol = props.getCurrencySymbol || function () { return "Rs"; };
  var S = props.S;
  var setState = props.setState;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var Input = props.Input;

  var [partySearch, setPartySearch] = useState("");
  var [selectedParty, setSelectedParty] = useState(null);
  var [payAmount, setPayAmount] = useState("");
  var [method, setMethod] = useState("Cash");
  var [chequeNo, setChequeNo] = useState("");
  var [chequeBank, setChequeBank] = useState("");
  var [chequeDue, setChequeDue] = useState(today());
  var [note, setNote] = useState("");
  var [lines, setLines] = useState([]);
  var [saving, setSaving] = useState(false);
  var lastPartyIdRef = useRef(null);

  var METHODS = isReceive
    ? [["Cash", "Cash"], ["Bank", "Bank"], ["Cheque", "Cheque"], ["Card", "Card"], ["Online", "Online"]]
    : [["Cash", "Cash"], ["Bank", "Bank"], ["Cheque", "Cheque"]];

  var partyLines = useMemo(function () {
    if (!selectedParty) return [];
    return filterUnsettledForParty(entries, selectedParty, mode, cheques);
  }, [entries, selectedParty, mode, cheques]);

  /* Stable key so parent re-renders don't wipe typed amounts */
  var partyLinesKey = useMemo(function () {
    return partyLines.map(function (e) {
      return String(e._type) + ":" + String(e.id) + ":" + String(e.effectiveBalance);
    }).join("|");
  }, [partyLines]);

  useEffect(function () {
    var partyKey = selectedParty
      ? String(selectedParty.kind || "") + ":" + String(selectedParty.id || selectedParty.name || "")
      : "";
    var partyChanged = partyKey !== lastPartyIdRef.current;
    lastPartyIdRef.current = partyKey;

    if (!selectedParty) {
      setLines([]);
      if (partyChanged) setPayAmount("");
      return;
    }

    if (partyChanged) {
      setPayAmount("");
      setNote("");
      setChequeNo("");
      setChequeBank("");
      setChequeDue(typeof today === "function" ? today() : today);
      setMethod("Cash");
    }

    setLines(function (prev) {
      var prevMap = {};
      (prev || []).forEach(function (l) {
        if (!l || !l.entry) return;
        prevMap[String(l.entry._type) + ":" + String(l.entry.id)] = l;
      });
      return partyLines.map(function (e) {
        var key = String(e._type) + ":" + String(e.id);
        var old = !partyChanged ? prevMap[key] : null;
        return {
          entry: e,
          selected: old ? !!old.selected : true,
          effectiveBalance: e.effectiveBalance,
          payAmount: old && old.payAmount != null && old.payAmount !== "" ? old.payAmount : "",
        };
      });
    });
    // partyLines is read when partyLinesKey changes — do not depend on entries array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParty, partyLinesKey]);

  var totalSelectedBal = useMemo(function () { return sumSelectedBalance(lines); }, [lines]);
  var totalAlloc = useMemo(function () { return sumAllocation(lines); }, [lines]);
  var payAmtNum = parseFloat(payAmount) || 0;
  var displayPayAmt = payAmtNum > 0 ? payAmtNum : totalAlloc;
  var unalloc = Math.round((displayPayAmt - totalAlloc) * 100) / 100;

  var toggleLine = function (idx) {
    setLines(function (prev) {
      return prev.map(function (l, i) {
        return i === idx ? Object.assign({}, l, { selected: !l.selected }) : l;
      });
    });
  };

  var setLineAmount = function (idx, val) {
    setLines(function (prev) {
      return prev.map(function (l, i) {
        if (i !== idx) return l;
        return Object.assign({}, l, { payAmount: val, selected: true });
      });
    });
  };

  var runAutoAllocate = function (amount) {
    var amt = amount != null ? amount : payAmtNum;
    if (!(amt > 0)) {
      showAlert("Enter a payment amount first.");
      return;
    }
    setLines(function (prev) {
      return allocateFifo(prev, amt);
    });
  };

  var fillFullOutstanding = function () {
    setPayAmount(String(totalSelectedBal));
    setLines(function (prev) {
      return prev.map(function (l) {
        return l.selected
          ? Object.assign({}, l, { payAmount: String(l.effectiveBalance) })
          : l;
      });
    });
  };

  var selectAll = function (on) {
    setLines(function (prev) {
      return prev.map(function (l) { return Object.assign({}, l, { selected: on !== false }); });
    });
  };

  var handleSave = function () {
    if (!selectedParty) {
      showAlert("Select a party first.");
      return;
    }
    var active = lines.filter(function (l) { return l.selected && (parseFloat(l.payAmount) || 0) > 0; });
    if (!active.length) {
      showAlert("Select at least one document and enter an amount.");
      return;
    }
    if (method === "Cheque" && !String(chequeNo || "").trim()) {
      showAlert("Enter cheque number.");
      return;
    }
    var effectivePayAmt = payAmtNum > 0 ? payAmtNum : totalAlloc;
    var allocGap = Math.round((effectivePayAmt - totalAlloc) * 100) / 100;
    if (Math.abs(allocGap) > 0.02) {
      showAlert("Allocated total must match payment amount. Use Auto-allocate or adjust line amounts.");
      return;
    }
    if (effectivePayAmt <= 0) {
      showAlert("Enter a valid payment amount.");
      return;
    }
    setSaving(true);
    onSave({
      party: selectedParty,
      lines: active.map(function (l) {
        return {
          entry: l.entry,
          amount: parseFloat(l.payAmount) || 0,
        };
      }),
      payment: {
        method: method,
        total: effectivePayAmt,
        chequeNo: chequeNo,
        chequeBankName: chequeBank,
        chequeDueDate: chequeDue,
        note: note,
      },
    }, function () { setSaving(false); });
  };

  var title = isReceive ? "Collect Payment" : "Pay Supplier / Party";
  var partyLabel = isReceive ? "Customer / Other party" : "Supplier / Other party";
  var partyPlaceholder = isReceive
    ? "Type to search customers or other parties…"
    : "Type to search suppliers or other parties…";
  var allowedKinds = useMemo(function () {
    return isReceive ? ["customer", "other"] : ["supplier", "other"];
  }, [isReceive]);

  var entryNav = function (entry) {
    return isReceive ? receivableEntryNav(entry) : payableEntryNav(entry);
  };

  return (
    <Modal title={title} onClose={onClose} wide zIndex={props.zIndex || 1100} className="erp-party-pay-modal">
      <div className="erp-party-pay">
        <div className="erp-party-pay-step">
          <div className="erp-party-pay-step-label">1. Select party</div>
          <p className="erp-party-pay-step-hint">
            {isReceive
              ? "Shows customers and other parties you collect from."
              : "Shows suppliers and other parties you pay."}
          </p>
          <MoneyPartyPicker
            label={partyLabel}
            placeholder={partyPlaceholder}
            value={partySearch}
            selectedParty={selectedParty}
            onValueChange={setPartySearch}
            onSelectParty={setSelectedParty}
            isIn={isReceive}
            searchOnly
            allowedKinds={allowedKinds}
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
          />
        </div>

        {selectedParty ? (
          <>
            <div className="erp-party-pay-summary">
              <div className="erp-party-pay-sum">
                <span>Party</span>
                <strong>{selectedParty.name}</strong>
              </div>
              <div className="erp-party-pay-sum due">
                <span>Outstanding</span>
                <strong>{getCurrencySymbol()} {fmtNum(totalSelectedBal)}</strong>
              </div>
              <div className="erp-party-pay-sum">
                <span>Open documents</span>
                <strong>{partyLines.length}</strong>
              </div>
            </div>

            <div className="erp-party-pay-step">
              <div className="erp-party-pay-step-head">
                <div className="erp-party-pay-step-label">2. Unsettled records</div>
                <div className="erp-party-pay-step-tools">
                  <button type="button" className="erp-party-pay-link" onClick={function () { selectAll(true); }}>All</button>
                  <button type="button" className="erp-party-pay-link" onClick={function () { selectAll(false); }}>None</button>
                  <button type="button" className="erp-party-pay-link" onClick={fillFullOutstanding}>Pay all balances</button>
                </div>
              </div>

              {partyLines.length === 0 ? (
                <div className="erp-party-pay-empty">No unsettled records for this party.</div>
              ) : (
                <div className="erp-party-pay-table-wrap">
                  <table className="erp-party-pay-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }} />
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Type</th>
                        <th style={{ textAlign: "right" }}>Balance</th>
                        <th style={{ textAlign: "right", width: 110 }}>Pay now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(function (line, idx) {
                        var e = line.entry;
                        var nav = entryNav(e);
                        return (
                          <tr key={e.id + "-" + e._type} className={line.selected ? "is-selected" : ""}>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!line.selected}
                                onChange={function () { toggleLine(idx); }}
                                aria-label={"Select " + (e.reference || e.id)}
                              />
                            </td>
                            <td>{fmtDate(e.date)}</td>
                            <td className="is-ref">
                              <SourceDocLink
                                nav={nav}
                                label={e.reference || e.receiptNo || "—"}
                                openSourceDocument={openSourceDocument}
                                className="erp-party-pay-ref"
                                title={"View " + (e.reference || "document")}
                              />
                            </td>
                            <td>{e.type || e._type}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(line.effectiveBalance)}</td>
                            <td>
                              <input
                                type="number"
                                className="erp-party-pay-amt"
                                min="0"
                                step="0.01"
                                value={line.payAmount === 0 || line.payAmount === "0" ? "0" : (line.payAmount || "")}
                                disabled={!line.selected}
                                onChange={function (ev) { setLineAmount(idx, ev.target.value); }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="erp-party-pay-step">
              <div className="erp-party-pay-step-label">3. Payment</div>
              <div className="erp-party-pay-paygrid">
                <div className="erp-split-pay-field">
                  <label>Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payAmount}
                    placeholder="0.00"
                    onChange={function (e) { setPayAmount(e.target.value); }}
                  />
                </div>
                <div className="erp-split-pay-field">
                  <label>Method</label>
                  <select value={method} onChange={function (e) { setMethod(e.target.value); }}>
                    {METHODS.map(function (m) { return <option key={m[0]} value={m[0]}>{m[1]}</option>; })}
                  </select>
                </div>
                <div className="erp-split-pay-field">
                  <label>Note</label>
                  <input value={note} placeholder="Optional" onChange={function (e) { setNote(e.target.value); }} />
                </div>
                <div className="erp-party-pay-auto">
                  <button type="button" className="erp-split-pay-btn accent" onClick={function () { runAutoAllocate(); }}>
                    Auto-allocate (oldest first)
                  </button>
                </div>
              </div>

              {method === "Cheque" ? (
                <div className="erp-split-pay-cheque erp-party-pay-cheque">
                  <div className="erp-split-pay-field">
                    <label>Cheque No *</label>
                    <input value={chequeNo} placeholder="e.g. 001234" onChange={function (e) { setChequeNo(e.target.value); }} />
                  </div>
                  <div className="erp-split-pay-field">
                    <label>Bank</label>
                    <input value={chequeBank} placeholder="Bank name" onChange={function (e) { setChequeBank(e.target.value); }} />
                  </div>
                  <div className="erp-split-pay-field">
                    <label>Due date</label>
                    <input type="date" value={chequeDue || today()} onChange={function (e) { setChequeDue(e.target.value); }} />
                  </div>
                  <div className="erp-split-pay-cheque-hint">
                    {lines.filter(function (l) { return l.selected && (parseFloat(l.payAmount) || 0) > 0; }).length > 1
                      ? "One pending cheque will be created per allocated document."
                      : "Cash/Bank balance updates when cheque is cleared in Cheque Register."}
                  </div>
                </div>
              ) : null}

              <div className="erp-split-pay-status erp-party-pay-status">
                <div>
                  Allocated: <strong className={totalAlloc > displayPayAmt + 0.01 ? "bad" : ""}>{getCurrencySymbol()} {fmtNum(totalAlloc)}</strong>
                  {" / "}{getCurrencySymbol()} {fmtNum(displayPayAmt)}
                </div>
                {unalloc > 0.02 ? <div className="warn">Unallocated: {getCurrencySymbol()} {fmtNum(unalloc)}</div> : null}
                {unalloc < -0.02 ? <div className="bad">Over-allocated: {getCurrencySymbol()} {fmtNum(Math.abs(unalloc))}</div> : null}
                {Math.abs(unalloc) <= 0.02 && totalAlloc > 0 ? <div className="ok">Ready to save</div> : null}
              </div>
            </div>

            <div className="erp-split-pay-footer">
              <button
                type="button"
                className="erp-split-pay-btn primary"
                disabled={saving || totalAlloc <= 0 || Math.abs(unalloc) > 0.02}
                onClick={handleSave}
              >
                {saving ? "Saving…" : (isReceive ? "Record Collection" : "Record Payment") + " (" + getCurrencySymbol() + " " + fmtNum(totalAlloc) + ")"}
              </button>
              <button type="button" className="erp-split-pay-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          String(partySearch || "").trim() ? null : (
            <div className="erp-party-pay-hint">Choose a party to see their open invoices and record payment. Start typing to search.</div>
          )
        )}
      </div>
    </Modal>
  );
}

export default PartyPaymentModal;
