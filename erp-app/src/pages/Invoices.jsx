import React, { useState, useEffect, useRef } from "react";
import { computeSaleTax } from "../tax/taxCompute.js";
import { saleReturnUiStatus, displayStatusForSale } from "../utils/returnDisplay.js";
import { buildVoidSaleUpdates, isVoidedTxn, VOID_REASON_OPTIONS, voidSaleBlockReason, computeVoidSaleRefundHint } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import CustomerPicker from "../components/CustomerPicker.jsx";
import { createAndPersistCustomer } from "../utils/customerCreate.js";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { formatInvoiceLinePrice, formatInvoiceLineTotal, splitSaleItemsByFree } from "../utils/posFreeItems.js";
import { quotationToPrintInv } from "../utils/quotationDocument.js";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import {
  buildInvoiceEditLockIdentity,
  findActiveInvoiceEditLock,
  formatInvoiceEditLockMessage,
  readInvoiceEditLocks,
  refreshInvoiceEditLocksFromServer,
  releaseInvoiceEditLock,
} from "../utils/invoiceEditLocks.js";
import { stampUpdatedAt, stampCustomerBalance, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import { rollbackRepairDevicesOnVoidSale } from "../utils/repairVoidRollback.js";
import {
  assertPaymentFitsSaleBalance,
  loadFreshSaleForPayment,
  pushKeysNow,
} from "../utils/concurrencyGuards.js";
import PrintFormatChooser from "../components/PrintFormatChooser.jsx";
import { resolveThermalFormat } from "../utils/printFormat.js";

/** Map stored sale/quotation lines into POS cart shape (prefer input qty/unit/price). */
var mapDocItemToPosCartLine = function (it) {
  if (!it) return null;
  var saleUnit = it.inputUnit || it.saleUnit || it.unit || "Pcs";
  var qty = it.inputQty != null ? it.inputQty : it.qty;
  var price = it.inputPrice != null ? it.inputPrice : it.price;
  return Object.assign({}, it, {
    qty: qty,
    saleUnit: saleUnit,
    unit: saleUnit,
    price: Number(price) || 0,
  });
};

function saleStatusMeta(status) {
  var s = String(status || "");
  if (s === "Paid") return { icon: "✓", tone: "paid", label: "Paid" };
  if (s === "Partial") return { icon: "◐", tone: "partial", label: "Partial" };
  if (s === "Unpaid") return { icon: "✕", tone: "unpaid", label: "Unpaid" };
  if (s === "Partially Returned") return { icon: "↩", tone: "return", label: "Part. Return" };
  if (s === "Returned") return { icon: "↻", tone: "returned", label: "Returned" };
  if (s === "Voided") return { icon: "—", tone: "void", label: "Voided" };
  return { icon: "•", tone: "other", label: s || "—" };
}

/* ─── QUOTATION FORM (top-level to prevent cursor loss on re-render) ──────── */
var QuotationForm = function (props) {
  var fq = props.fq;
  var setFq = props.setFq;
  var onSave = props.onSave;
  var title = props.title;
  var state = props.state;
  var showAlert = props.showAlert;
  var C = props.C;
  var Input = props.Input;
  var Modal = props.Modal;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Btn = props.Btn;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtStock = props.fmtStock;
  var today = props.today;
  var uid = props.uid;
  var S = props.S;
  var setState = props.setState;
  var tcTrialGuard = props.tcTrialGuard;
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;

  var [qProdSearch, setQProdSearch] = useState("");
  var [qProdDrop, setQProdDrop] = useState(false);
  var [qProdIdx, setQProdIdx] = useState(-1);
  var [qQty, setQQty] = useState("1");
  var [qPrice, setQPrice] = useState("");
  var [custSearch, setCustSearch] = useState(fq.customer || "");
  useEffect(function () {
    setCustSearch(fq.customer || "");
  }, [fq.customer]);

  var activeProds = (state.products || []).filter(function (p) { return p.status !== "inactive"; });
  var qMatchProds = activeProds.filter(function (p) {
    var s = qProdSearch.toLowerCase();
    return s && productMatchesSearch(p, s);
  }).slice(0, 8);

  var posDupNameKeys = typeof getDuplicateNormalizedNameKeys === "function"
    ? getDuplicateNormalizedNameKeys(state.customers || [])
    : {};
  var saveInlineCustomer = function (draft) {
    var result = createAndPersistCustomer({
      customers: state.customers || [],
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    var created = result.customer;
    setCustSearch(created.name);
    setFq(Object.assign({}, fq, { customer: created.name, customerId: created.id, customerPhone: created.phone || "" }));
    return created;
  };

  var addItem = function () {
    var prod = qMatchProds[qProdIdx >= 0 ? qProdIdx : 0];
    if (!prod && qProdSearch.trim()) {
      prod = activeProds.find(function (p) { return productMatchesSearchExact(p, qProdSearch); });
    }
    if (!prod) { showAlert("Select a product first."); return; }
    var qty = parseInt(qQty) || 1;
    var price = parseFloat(qPrice) || prod.price || 0;
    if (qty <= 0) { showAlert("Quantity must be at least 1."); return; }
    var existing = (fq.items || []).findIndex(function (it) { return it.id === prod.id; });
    var newItems;
    if (existing >= 0) {
      newItems = fq.items.map(function (it, i) { return i === existing ? Object.assign({}, it, { qty: it.qty + qty, price: price }) : it; });
    } else {
      newItems = (fq.items || []).concat([{ id: prod.id, name: prod.name, qty: qty, price: price, cost: prod.cost || 0 }]);
    }
    setFq(Object.assign({}, fq, { items: newItems }));
    setQProdSearch(""); setQQty("1"); setQPrice(""); setQProdDrop(false); setQProdIdx(-1);
  };

  var formTotal = (fq.items || []).reduce(function (a, it) { return a + it.qty * it.price; }, 0);
  var qTax = computeSaleTax(state.settings, formTotal);

  return (
    <div>
      {/* Header fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Input label="Quotation No" value={fq.quotationNo || ""} onChange={function (e) { setFq(Object.assign({}, fq, { quotationNo: e.target.value })); }} />

        {/* Customer picker */}
        <div style={{ position: "relative" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Customer</label>
          <CustomerPicker
            customers={state.customers || []}
            value={custSearch}
            selectedCustomerId={fq.customerId || ""}
            onValueChange={function (nextValue) {
              setCustSearch(nextValue);
              setFq(Object.assign({}, fq, { customer: nextValue, customerId: "", customerPhone: "" }));
            }}
            onSelectCustomer={function (c) {
              setCustSearch(c.name);
              setFq(Object.assign({}, fq, { customer: c.name, customerId: c.id, customerPhone: c.phone || "" }));
            }}
            onCreateCustomer={saveInlineCustomer}
            context="invoices"
            duplicateNameKeys={posDupNameKeys}
            normalizeNameKey={normalizePaymentCustomerName}
            C={C}
            Input={Input}
            Modal={Modal}
            Btn={Btn}
          />
        </div>

        <Input label="Customer Phone" value={fq.customerPhone || ""} onChange={function (e) { setFq(Object.assign({}, fq, { customerPhone: e.target.value })); }} />
        <Input label="Date" type="date" value={fq.date || today()} onChange={function (e) { setFq(Object.assign({}, fq, { date: e.target.value })); }} />

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Status</label>
          <select value={fq.status || "Draft"} onChange={function (e) { setFq(Object.assign({}, fq, { status: e.target.value })); }}
            style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}>
            {["Draft", "Sent", "Expired"].map(function (s) { return <option key={s} value={s}>{s}</option>; })}
          </select>
        </div>

        <Input label="Notes / Terms" value={fq.notes || ""} onChange={function (e) { setFq(Object.assign({}, fq, { notes: e.target.value })); }} />
      </div>

      {/* Add Product row */}
      <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 14px", marginBottom: 12, border: "1px solid " + C.border }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.th, textTransform: "uppercase", marginBottom: 8 }}>Add Product to Quotation</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 2, position: "relative" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Product</label>
            <input
              placeholder="Search name, ID, barcode, or category..."
              value={qProdSearch}
              onChange={function (e) { setQProdSearch(e.target.value); setQProdDrop(true); setQProdIdx(-1); }}
              onFocus={function () { setQProdDrop(true); }}
              onBlur={function () { setTimeout(function () { setQProdDrop(false); }, 150); }}
              onKeyDown={function (e) {
                if (e.key === "ArrowDown") { e.preventDefault(); setQProdIdx(function (i) { return Math.min(i + 1, qMatchProds.length - 1); }); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setQProdIdx(function (i) { return Math.max(i - 1, 0); }); }
                else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addItem(); }
                else if (e.key === "Escape") { setQProdDrop(false); }
              }}
              style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
            />
            {qProdDrop && qMatchProds.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 9, boxShadow: C.shadow, zIndex: 200, maxHeight: 220, overflowY: "auto", marginTop: 3 }}>
                {qMatchProds.map(function (p, i) {
                  return (
                    <div key={p.id} onMouseDown={function () { setQProdSearch(p.name); setQPrice(String(p.price || "")); setQProdIdx(i); setQProdDrop(false); }}
                      style={{ padding: "9px 14px", cursor: "pointer", background: i === qProdIdx ? C.accentSoft : "#fff", borderBottom: "1px solid " + C.borderLight }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{getCurrencySymbol()} {fmtNum(p.price)} &nbsp;·&nbsp; Stock: {fmtStock(p.stock, p.unit)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ flex: "0 0 80px" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Qty</label>
            <input type="number" min="1" value={qQty} onChange={function (e) { setQQty(e.target.value); }}
              style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }} />
          </div>
          <div style={{ flex: "0 0 120px" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Unit Price</label>
            <input type="number" min="0" value={qPrice} onChange={function (e) { setQPrice(e.target.value); }}
              style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }} />
          </div>
          <Btn col="cyan" onClick={addItem}>+ Add</Btn>
        </div>
      </div>

      {/* Items table */}
      {(fq.items || []).length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead><tr><TH>Product</TH><TH>Qty</TH><TH>Unit Price</TH><TH>Amount</TH><TH></TH></tr></thead>
          <tbody>
            {(fq.items || []).map(function (it, i) {
              return (
                <TR key={it.id || i} i={i}>
                  <TD bold>{it.name}</TD>
                  <TD center>{it.qty}</TD>
                  <TD>{getCurrencySymbol()} {fmtNum(it.price)}</TD>
                  <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(it.qty * it.price)}</TD>
                  <td style={{ padding: "6px 10px" }}>
                    <button type="button" className="erp-si-row-x" onClick={function () { setFq(Object.assign({}, fq, { items: fq.items.filter(function (_, j) { return j !== i; }) })); }}>✕</button>
                  </td>
                </TR>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "13px 18px", background: "#e8eeff", borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}><span>Sub Total</span><span>{getCurrencySymbol()} {fmtNum(formTotal)}</span></div>
        {state.settings && state.settings.taxEnabled && (qTax.selectedTaxes || []).length > 0 && (qTax.selectedTaxes || []).map(function (tl, qi) {
          return (
            <div key={"qt-" + qi} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
              <span>{tl.name} ({fmtNum(tl.rate)}%)</span><span>{getCurrencySymbol()} {fmtNum(tl.amount)}</span>
            </div>
          );
        })}
        {state.settings && state.settings.taxEnabled && (qTax.totalTax || 0) > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}><span>Total Tax</span><span>{getCurrencySymbol()} {fmtNum(qTax.totalTax)}</span></div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid " + C.border, paddingTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Quotation Total</span>
          <span style={{ fontWeight: 900, fontSize: 20, color: C.blue }}>{getCurrencySymbol()} {fmtNum(qTax.grandTotal)}</span>
        </div>
      </div>
      <Btn col="blue" full onClick={onSave}>{title}</Btn>
    </div>
  );
};

/* ─── QUOTATIONS COMPONENT ────────────────────────────────────────────────── */
var Quotations = function (props) {
  var state = props.state;
  var setState = props.setState;
  var setActive = props.setActive;
  var setSiTab = props.setSiTab;
  var S = props.S;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var tcTrialGuard = props.tcTrialGuard;
  var addAudit = props.addAudit;
  var uid = props.uid;
  var today = props.today;
  var genInvNo = props.genInvNo;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtStock = props.fmtStock;
  var fmtSumQty = props.fmtSumQty;
  var getInvoicePrintLabels = props.getInvoicePrintLabels;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var WABtn = props.WABtn;
  var InvoiceA4 = props.InvoiceA4;
  var InvoiceThermal = props.InvoiceThermal;
  var C = props.C;
  var usePager = props.usePager;
  var Pager = props.Pager;
  var canEditInvoices = props.canEditInvoices === true;
  var canDeleteInvoices = props.canDeleteInvoices === true;
  var showPermissionDenied = typeof props.showPermissionDenied === "function"
    ? props.showPermissionDenied
    : function () { showAlert("You do not have permission for this action."); };
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var fmtDate = props.fmtDate || function (d) { return d || ""; };
  /* setSiTab switches the SalesInvoices tab from "quotations" → "invoices" */
  /* eslint-disable-next-line no-unused-vars */

  var shareAnyReport = function (printFn, filename) {
    var captured = "";
    var origOpen = window.open;
    window.open = function () {
      return {
        document: { write: function (s) { captured += s; }, close: function () {} },
        focus: function () {}, print: function () {}
      };
    };
    try { printFn(); } catch (e) {}
    window.open = origOpen;
    if (!captured) { showAlert("Nothing to share. Please generate the report first."); return; }
    var body = captured.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
    shareViaWhatsApp(body || captured, filename || "TechonReport", "");
  };

  var BLANK_Q = { customer: "", customerId: "", customerPhone: "", items: [], notes: "", status: "Draft", date: today(), quotationNo: genInvNo("QT") };
  var [show, setShow] = useState(false);
  var [f, setF] = useState(BLANK_Q);
  var [fullViewQ, setFullViewQ] = useState(null);
  var [fqFormat, setFqFormat] = useState(function () { return (state.settings && state.settings.invoiceDefaultSize) || "a4"; });
  var [qPrintFmtOpen, setQPrintFmtOpen] = useState(false);
  var [qPendingPrintFmt, setQPendingPrintFmt] = useState(null);
  var thermalFmt = resolveThermalFormat(state.settings || {});
  var printFmtOptions = [
    ["a4", "A4"],
    ["a5", "A5"],
    [thermalFmt, thermalFmt === "thermal58" ? "58mm" : "80mm"],
  ];

  useEffect(function () {
    if (!qPendingPrintFmt || !fullViewQ) return undefined;
    var fmt = qPendingPrintFmt;
    var t = setTimeout(function () {
      printFullQuotation(fullViewQ, fmt);
      setQPendingPrintFmt(null);
    }, 120);
    return function () { clearTimeout(t); };
  }, [qPendingPrintFmt, fqFormat, fullViewQ]);
  var [search, setSearch] = useState("");
  var [filterStatus, setFilterStatus] = useState("All");
  var [pendingQuotPrint, setPendingQuotPrint] = useState(null);
  var quotWaPendingRef = useRef(false);

  var openFullViewQ = function (q) {
    setFqFormat((state.settings && state.settings.invoiceDefaultSize) || "a4");
    setFullViewQ(q);
  };

  var quotations = state.quotations || [];
  var STATUSES = ["All", "Draft", "Sent", "Accepted", "Converted", "Expired"];
  var STATUS_COLORS = { Draft: C.textMd, Sent: C.blue, Accepted: C.green, Converted: C.green, Expired: C.red };
  var quotStatusMeta = function (status) {
    var s = String(status || "Draft");
    if (s === "Sent") return { icon: "↗", tone: "sent", label: "Sent" };
    if (s === "Accepted") return { icon: "✓", tone: "accepted", label: "Accepted" };
    if (s === "Converted") return { icon: "✔", tone: "converted", label: "Converted" };
    if (s === "Expired") return { icon: "✕", tone: "expired", label: "Expired" };
    return { icon: "•", tone: "draft", label: s || "Draft" };
  };
  var formTotal = function (items) { return (items || []).reduce(function (a, it) { return a + it.qty * it.price; }, 0); };
  var quotationGrand = function (q) {
    if (!q) return 0;
    if (q.total != null && !isNaN(q.total)) return q.total;
    var sub = formTotal(q.items);
    return computeSaleTax(state.settings, sub).grandTotal;
  };

  var filteredQ = sortNewestFirst(quotations).filter(function (q) {
    var sq = search.toLowerCase();
    var matchQ = !sq || (q.customer || "").toLowerCase().includes(sq) || (q.quotationNo || "").toLowerCase().includes(sq);
    var matchS = filterStatus === "All" || q.status === filterStatus;
    return matchQ && matchS;
  });
  var quotPager = usePager(filteredQ, LIST_PAGE_SIZE);

  var saveNew = function () {
    if (!f.items.length) { showAlert("Add at least one product to the quotation."); return; }
    var sub = formTotal(f.items);
    var qtc = computeSaleTax(state.settings, sub);
    var taxExtra = {};
    if (state.settings && state.settings.taxEnabled) {
      taxExtra = { subTotal: sub, taxMode: qtc.taxMode, totalTax: qtc.totalTax, selectedTaxes: (qtc.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; }), total: qtc.grandTotal };
    } else {
      taxExtra = { subTotal: sub, total: sub, totalTax: 0, selectedTaxes: [] };
    }
    var newQ = stampTransactionIsoDateTime(Object.assign({}, f, {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, taxExtra), new Date().toISOString());
    if (!tcTrialGuard(quotations, 'quotations')) return;
    var nq = quotations.concat([newQ]);
    S.set("tc3_quotations", nq);
    addAudit("Created Quotation", newQ.quotationNo);
    setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
    setF(Object.assign({}, BLANK_Q, { quotationNo: genInvNo("QT") }));
    setShow(false);
  };

  var openEditQuotationOnPos = function (q) {
    if (!canEditInvoices) { showPermissionDenied("edit quotations"); return; }
    if (!q) return;
    var prefill = {
      posPageTab: "quotation",
      editingQuotationId: q.id,
      quotationNo: q.quotationNo || "",
      quotationNotes: q.notes || "",
      customerName: q.customer || "",
      customerPhone: q.customerPhone || "",
      customerId: q.customerId || "",
      items: (q.items || []).map(function (it) { return mapDocItemToPosCartLine(it); }).filter(Boolean),
      discount: q.discount ? String(q.discount) : "",
      recordDate: q.date || today(),
    };
    S.set("tc3_repair_prefill", prefill);
    setFullViewQ(null);
    addAudit("Opening POS to edit Quotation " + (q.quotationNo || q.id.slice(0, 8)), q.quotationNo || "");
    if (setActive) setActive("pos");
  };

  var deleteQ = function (id) {
    if (!canDeleteInvoices) { showPermissionDenied("delete quotations"); return; }
    var q = quotations.find(function (q) { return q.id === id; });
    if (!q) return;
    showConfirm("Delete quotation " + (q.quotationNo || "") + "? This cannot be undone.", function () {
      var nq = quotations.filter(function (q) { return q.id !== id; });
      S.set("tc3_quotations", nq);
      addAudit("Deleted Quotation", q.quotationNo || id.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
      if (fullViewQ && fullViewQ.id === id) setFullViewQ(null);
    });
  };

  var updateStatus = function (id, newStatus) {
    var nq = quotations.map(function (q) {
      return q.id === id ? Object.assign({}, q, { status: newStatus, updatedAt: new Date().toISOString() }) : q;
    });
    S.set("tc3_quotations", nq);
    setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
    if (fullViewQ && fullViewQ.id === id) setFullViewQ(Object.assign({}, fullViewQ, { status: newStatus }));
  };

  var convertToSale = function (q) {
    if (q.status === "Converted") { showAlert("This quotation has already been converted to an invoice."); return; }
    showConfirm("Open Sales page with this quotation pre-loaded?\n\nYou can adjust prices, choose payment method and save the invoice.", function () {
      /* Pre-load POS with quotation items — same mechanism used by Repairs */
      var prefill = {
        customerName: q.customer || "",
        customerPhone: q.customerPhone || "",
        customerId: q.customerId || "",
        items: q.items.map(function (it) { return Object.assign({}, it); }),
        fromQuotationId: q.id
      };
      S.set("tc3_repair_prefill", prefill);
      setFullViewQ(null);
      addAudit("Opening POS from Quotation " + q.quotationNo, q.quotationNo);
      /* Navigate to POS — it will mount fresh, read prefill and populate cart */
      if (setActive) setActive("pos");
    });
  };

  var printFullQuotation = function (q, fmt) {
    var el = document.getElementById("si-quot-preview-" + q.id);
    if (!el) return;
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + " portrait;margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) {
      showAlert("Popup blocked. Please allow popups for this window and try again.");
      return;
    }
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Quotation " + escapeHtml(q.quotationNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  var whatsappFullQuotation = function (q, fmt) {
    var el = document.getElementById("si-quot-preview-" + q.id);
    if (!el) { showAlert("Quotation preview not ready. Please try again."); return; }
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + (isThermal ? "" : " portrait") + ";margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var pageFormat = isThermal ? (fmt === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
    shareViaWhatsApp(el.innerHTML, "Quotation-" + (q.quotationNo || q.id.slice(0, 8)), q.customerPhone || "", { headStyles: css, pageFormat: pageFormat });
  };

  var printQuotation = function (q, lang, waShare) {
    if (waShare) quotWaPendingRef.current = true;
    setPendingQuotPrint({
      inv: quotationToPrintInv(q),
      lang: "en",
      mode: (state.settings && state.settings.invoiceDefaultSize) || "a4",
      settings: state.settings || {},
      phone: q.customerPhone || "",
      docNo: q.quotationNo || q.id,
    });
  };

  useEffect(function () {
    if (!pendingQuotPrint) return;
    var timer = setTimeout(function () {
      var el = document.getElementById("quot-print-preview");
      if (!el) {
        setPendingQuotPrint(null);
        return;
      }
      var mode = pendingQuotPrint.mode || "a4";
      var isThermal = mode === "thermal" || mode === "thermal58" || mode === "thermal80";
      var isA5 = mode === "a5";
      var thermalBodyW = mode === "thermal58" ? "218px" : "302px";
      var pgSize = isThermal ? (mode === "thermal58" ? "58mm auto" : "80mm auto") : (isA5 ? "A5" : "A4");
      var pgMargin = isThermal ? "3mm" : "8mm";
      var bodyW = isThermal
        ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}"
        : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
      var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pgSize + (isThermal ? "" : " portrait") + ";margin:" + pgMargin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
      var pageFormat = isThermal ? (mode === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
      if (quotWaPendingRef.current) {
        quotWaPendingRef.current = false;
        var filename = "Quotation-" + (pendingQuotPrint.docNo || "");
        shareViaWhatsApp(el.innerHTML, filename, pendingQuotPrint.phone || "", { headStyles: css, pageFormat: pageFormat });
      } else {
        var w = window.open("", "_blank", "width=900,height=760");
        if (!w) {
          showAlert("Popup blocked. Please allow popups for this window and try again.");
        } else {
          w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Quotation " + escapeHtml(pendingQuotPrint.docNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
          w.document.close();
          setTimeout(function () { w.focus(); w.print(); }, 500);
        }
      }
      setPendingQuotPrint(null);
    }, 300);
    return function () { clearTimeout(timer); };
  }, [pendingQuotPrint]);

  return (
    <React.Fragment>
      <div className="erp-si-panel is-quotations" style={{ height: "100%" }}>
      <div className="erp-si-panel-head">
        <div className="erp-si-panel-head-left">
          <span className="erp-si-panel-ico" aria-hidden="true">📋</span>
          <div>
            <div className="erp-si-panel-title">Quotation register</div>
            <div className="erp-si-panel-count">{filteredQ.length.toLocaleString()} shown · {quotations.length.toLocaleString()} total</div>
          </div>
        </div>
        <div className="erp-si-panel-head-right">
          <span className="erp-si-status-legend" aria-label="Status icon meanings">
            <span className="erp-si-legend-item"><span className="erp-si-status-ico draft" aria-hidden="true">•</span> Draft</span>
            <span className="erp-si-legend-item"><span className="erp-si-status-ico sent" aria-hidden="true">↗</span> Sent</span>
            <span className="erp-si-legend-item"><span className="erp-si-status-ico accepted" aria-hidden="true">✓</span> Accepted</span>
            <span className="erp-si-legend-item"><span className="erp-si-status-ico converted" aria-hidden="true">✔</span> Converted</span>
            <span className="erp-si-legend-item"><span className="erp-si-status-ico expired" aria-hidden="true">✕</span> Expired</span>
          </span>
        </div>
      </div>
      <div className="erp-si-toolbar">
        <div className="erp-si-search-wrap">
          <input className="erp-si-field" value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search customer or quotation #…" aria-label="Search quotations" />
        </div>
        <div className="erp-si-status-chips">
          {STATUSES.map(function (s) {
            var isA = filterStatus === s;
            return <button key={s} type="button" className={"erp-si-chip" + (isA ? " is-active" : "")} onClick={function () { setFilterStatus(s); }}>{s}</button>;
          })}
        </div>
        <button type="button" className="erp-si-btn-clear" onClick={function () { setSearch(""); setFilterStatus("All"); }}>Clear</button>
      </div>
      <div className="erp-si-table-wrap">
        <table className="erp-si-table">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>Quotation #</th>
              <th style={{ width: "22%" }}>Customer</th>
              <th style={{ width: "11%" }}>Date</th>
              <th className="ctr" style={{ width: "7%" }}>Items</th>
              <th className="num" style={{ width: "14%" }}>Total</th>
              <th className="ctr" style={{ width: "12%" }}>Status</th>
              <th className="num" style={{ width: "18%" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotPager.slice.map(function (q) {
              var qMeta = quotStatusMeta(q.status);
              return (
                <tr key={q.id} onClick={function () { openFullViewQ(q); }} style={{ cursor: "pointer" }}>
                  <td>
                    <span
                      role="button"
                      tabIndex={0}
                      className="erp-si-inv-link"
                      onClick={function (e) { e.stopPropagation(); openFullViewQ(q); }}
                      onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openFullViewQ(q); } }}
                      title={(q.quotationNo || q.id.slice(0, 8)) + " — View & print"}
                    >
                      {q.quotationNo || q.id.slice(0, 8)}
                    </span>
                  </td>
                  <td>
                    <span className="erp-si-cust" title={q.customer || "Walk-in"}>{q.customer || "Walk-in"}</span>
                    {q.customerPhone ? <div className="erp-si-muted">{q.customerPhone}</div> : null}
                  </td>
                  <td className="erp-si-muted">{q.date}</td>
                  <td className="ctr erp-si-muted">{(q.items || []).length}</td>
                  <td className="num"><span className="erp-si-money is-total">{getCurrencySymbol()} {fmtNum(quotationGrand(q))}</span></td>
                  <td className="ctr">
                    <span className="erp-si-status-cell" title={qMeta.label}>
                      <span className={"erp-si-status-ico " + qMeta.tone} title={qMeta.label} aria-label={qMeta.label}>{qMeta.icon}</span>
                    </span>
                  </td>
                  <td className="num erp-si-actions-cell" onClick={function (e) { e.stopPropagation(); }}>
                    <ActBtnGroup>
                      <ActBtn tone="cyan" title="View & print" onClick={function () { openFullViewQ(q); }} />
                      {q.status !== "Converted" ? (
                        <ActBtn tone="blue" title="Edit quotation" onClick={function () { openEditQuotationOnPos(q); }} />
                      ) : null}
                      {q.status !== "Converted" ? (
                        <ActBtn tone="green" icon="restore" title="Convert to invoice" onClick={function () { convertToSale(q); }} />
                      ) : null}
                      <ActBtn tone="red" title="Delete quotation" onClick={function () { deleteQ(q.id); }} disabled={!canDeleteInvoices} />
                    </ActBtnGroup>
                  </td>
                </tr>
              );
            })}
            {filteredQ.length === 0 && (
              <tr>
                <td colSpan={7} className="erp-si-empty">
                  No quotations match your filters. Create quotations from Sales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="erp-si-footer">
        <div className="erp-si-footer-pager">
          <Pager pager={quotPager} />
        </div>
      </div>

      {/* New Quotation Modal */}
      {show && (
        <Modal title="New Quotation" onClose={function () { setShow(false); }} wide>
          <QuotationForm fq={f} setFq={setF} onSave={saveNew} title="💾 Save Quotation" state={state} setState={setState} S={S} uid={uid} tcTrialGuard={tcTrialGuard} getDuplicateNormalizedNameKeys={getDuplicateNormalizedNameKeys} normalizePaymentCustomerName={normalizePaymentCustomerName} showAlert={showAlert} C={C} Input={Input} Modal={Modal} TH={TH} TR={TR} TD={TD} Btn={Btn} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} today={today} />
        </Modal>
      )}
      </div>

      {/* View & Print Quotation (same chrome as invoices) */}
      {fullViewQ && (
        <div className="erp-si-fv is-quot" role="dialog" aria-modal="true" aria-label="View and print quotation">
          <div className="erp-si-fv-bar">
            <div className="erp-si-fv-bar-left">
              <span className="erp-si-fv-badge" aria-hidden="true">QT</span>
              <div className="erp-si-fv-meta">
                <span className="erp-si-fv-kicker">View &amp; Print</span>
                <div className="erp-si-fv-meta-main">
                  <span className="erp-si-fv-inv">{fullViewQ.quotationNo || fullViewQ.id.slice(0, 8)}</span>
                  <span className="erp-si-fv-sub">{fullViewQ.customer || "Walk-in"} · {fmtDate(fullViewQ.date)}</span>
                </div>
              </div>
            </div>

            <div className="erp-si-fv-tools">
              <span className="erp-si-fv-tool-label">Format</span>
              <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                {printFmtOptions.map(function (item) {
                  var v = item[0]; var lbl = item[1];
                  var active = fqFormat === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      className={"erp-si-fv-fmt" + (active ? " is-active" : "")}
                      onClick={function () { setFqFormat(v); }}
                    >{lbl}</button>
                  );
                })}
              </div>
            </div>

            <div className="erp-si-fv-actions">
              {fullViewQ.status !== "Converted" ? (
                <button
                  type="button"
                  className="erp-si-fv-btn is-convert"
                  onClick={function () { convertToSale(fullViewQ); }}
                >→ Invoice</button>
              ) : null}
              <button
                type="button"
                className="erp-si-fv-btn is-print"
                onClick={function () { setQPrintFmtOpen(true); }}
              >Print</button>
              <WABtn title="Share Quotation via WhatsApp" onClick={function () { whatsappFullQuotation(fullViewQ, fqFormat); }} />
              <button
                type="button"
                className="erp-si-fv-btn is-close"
                onClick={function () { setFullViewQ(null); }}
                aria-label="Close"
              >✕</button>
            </div>
          </div>

          <div className="erp-si-fv-stage">
            <div
              id={"si-quot-preview-" + fullViewQ.id}
              className={"erp-si-fv-sheet" + ((fqFormat === "thermal58" || fqFormat === "thermal80") ? " is-thermal" : " is-paper")}
            >
              {(fqFormat === "thermal58" || fqFormat === "thermal80")
                ? <InvoiceThermal
                    inv={quotationToPrintInv(fullViewQ)}
                    settings={state.settings}
                    invoiceLang="en"
                    width={fqFormat === "thermal58" ? 218 : 302}
                    documentKind="quotation"
                  />
                : <InvoiceA4
                    inv={quotationToPrintInv(fullViewQ)}
                    settings={state.settings}
                    invoiceLang="en"
                    size={fqFormat}
                    documentKind="quotation"
                  />
              }
            </div>
          </div>
        </div>
      )}

      <PrintFormatChooser
        open={qPrintFmtOpen}
        settings={state.settings}
        thermalId={thermalFmt}
        title="Print quotation"
        hint="Choose A4, A5, or Thermal for your printer."
        onClose={function () { setQPrintFmtOpen(false); }}
        onSelect={function (fmt) {
          setQPrintFmtOpen(false);
          setFqFormat(fmt);
          setQPendingPrintFmt(fmt);
        }}
        zIndex={13000}
      />

      {pendingQuotPrint && InvoiceA4 && (
        <div id="quot-print-preview" style={{ position: "fixed", left: -9999, top: -9999, width: 794, pointerEvents: "none", opacity: 0 }}>
          {(pendingQuotPrint.mode === "thermal" || pendingQuotPrint.mode === "thermal58" || pendingQuotPrint.mode === "thermal80")
            ? <InvoiceThermal inv={pendingQuotPrint.inv} settings={pendingQuotPrint.settings} invoiceLang={pendingQuotPrint.lang} width={pendingQuotPrint.mode === "thermal58" ? 218 : 302} documentKind="quotation" />
            : <InvoiceA4 inv={pendingQuotPrint.inv} settings={pendingQuotPrint.settings} invoiceLang={pendingQuotPrint.lang} size={pendingQuotPrint.mode || "a4"} documentKind="quotation" />
          }
        </div>
      )}
    </React.Fragment>
  );
};
var SalesInvoices = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var setActive = props.setActive;
  var C = props.C;
  var S = props.S;
  var uid = props.uid;
  var today = props.today;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var fmtStock = props.fmtStock;
  var StatCard = props.StatCard;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Input = props.Input;
  var Sel = props.Sel;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var Pager = props.Pager;
  var usePager = props.usePager;
  var validateTxnAmounts = props.validateTxnAmounts;
  var checkPeriodClose = props.checkPeriodClose;
  var SplitPaymentModal = props.SplitPaymentModal;
  var resolvePaymentCreditTargetIds = props.resolvePaymentCreditTargetIds;
  var warnPaymentCustomerMatchSafety = props.warnPaymentCustomerMatchSafety;
  var maybeShowPaymentMatchToasts = props.maybeShowPaymentMatchToasts;
  var showPaymentDupPick = props.showPaymentDupPick;
  var toastAfterCustomerPaymentApplied = props.toastAfterCustomerPaymentApplied;
  var PaymentBreakdown = props.PaymentBreakdown;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var WABtn = props.WABtn;
  var InvoiceThermal = props.InvoiceThermal;
  var InvoiceA4 = props.InvoiceA4;
  var tcTrialGuard = props.tcTrialGuard;
  var genInvNo = props.genInvNo;
  var fmtSumQty = props.fmtSumQty;
  var getInvoicePrintLabels = props.getInvoicePrintLabels;
  var canEditInvoices = props.canEditInvoices === true;
  var canDeleteInvoices = props.canDeleteInvoices === true;
  var showPermissionDenied = typeof props.showPermissionDenied === "function"
    ? props.showPermissionDenied
    : function () { showAlert("You do not have permission for this action."); };
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var currentUser = props.currentUser || null;
  var clientMachineLabel = String(props.clientMachineLabel || "").trim();
  var lockIdentity = buildInvoiceEditLockIdentity({
    currentUser: currentUser,
    clientMachineLabel: clientMachineLabel,
  });
  var [siTab, setSiTab] = useState("invoices");
  var [search, setSearch] = useState("");
  var [dateFrom, setDateFrom] = useState("");
  var [dateTo, setDateTo] = useState("");
  var [filterStatus, setFilterStatus] = useState("Active");
  var [viewSale, setViewSale] = useState(null);
  var [lockTick, setLockTick] = useState(0);
  var [voidSaleTarget, setVoidSaleTarget] = useState(null);
  var [voidReason, setVoidReason] = useState("");
  var [voidRefundConfirm, setVoidRefundConfirm] = useState(false);
  var [payModal, setPayModal] = useState(null);
  var [splitPayModal, setSplitPayModal] = useState(null);
  var [payNote, setPayNote] = useState("");
  var [payMode, setPayMode] = useState("Cash");
  var [siFormat, setSiFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [siWarranty, setSiWarranty] = useState(false);
  var [fullViewSale, setFullViewSale] = useState(null);
  var [fvFormat, setFvFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [fvWarranty, setFvWarranty] = useState(false);
  var [printFmtOpen, setPrintFmtOpen] = useState(false);
  var [pendingPrintFmt, setPendingPrintFmt] = useState(null);
  var invThermalFmt = resolveThermalFormat(state.settings || {});
  var invPrintFmtOptions = [
    ["a4", "A4"],
    ["a5", "A5"],
    [invThermalFmt, invThermalFmt === "thermal58" ? "58mm" : "80mm"],
  ];

  useEffect(function () {
    if (!pendingPrintFmt || !fullViewSale) return undefined;
    var fmt = pendingPrintFmt;
    var t = setTimeout(function () {
      printInvoice(Object.assign({}, fullViewSale, { includeWarranty: fvWarranty }), fmt);
      setPendingPrintFmt(null);
    }, 120);
    return function () { clearTimeout(t); };
  }, [pendingPrintFmt, fvFormat, fullViewSale, fvWarranty]);

  var quotationsAll = state.quotations || [];
  var qDraftCount = quotationsAll.filter(function (q) { return q.status === "Draft"; }).length;
  var qSentCount = quotationsAll.filter(function (q) { return q.status === "Sent"; }).length;
  var qConvertedCount = quotationsAll.filter(function (q) { return q.status === "Converted"; }).length;
  var qPipelineValue = quotationsAll.filter(function (q) {
    return q.status !== "Converted" && q.status !== "Expired";
  }).reduce(function (a, q) {
    var t = q && q.total != null && !isNaN(q.total)
      ? Number(q.total)
      : (q.items || []).reduce(function (sum, it) { return sum + (it.qty || 0) * (it.price || 0); }, 0);
    return a + t;
  }, 0);

  var filtered = sortNewestFirst(state.sales).filter(function (s) {
    var q = search.toLowerCase();
    var matchQ = !q || (s.customerName || s.customer || "").toLowerCase().includes(q) || (s.invoiceNo || "").toLowerCase().includes(q) || (s.customerPhone || "").includes(q);
    var matchFrom = !dateFrom || s.date >= dateFrom;
    var matchTo = !dateTo || s.date <= dateTo;
    var voided = isVoidedTxn(s);
    if (filterStatus === "Active" && voided) return false;
    if (filterStatus === "Voided" && !voided) return false;
    if (filterStatus === "Paid" || filterStatus === "Partial" || filterStatus === "Unpaid") {
      if (voided) return false;
      if (s.payStatus !== filterStatus) return false;
    }
    return matchQ && matchFrom && matchTo;
  });

  var siPager = usePager(filtered, LIST_PAGE_SIZE);
  var totalShown = filtered.reduce(function (a, s) { return a + s.total; }, 0);
  var paidShown = filtered.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
  var outstandingShown = totalShown - paidShown;

  var goSalesReturn = function () {
    try { sessionStorage.setItem("tc3_returns_tab", "salesreturn"); } catch (e) { /* ignore */ }
    if (typeof setActive === "function") setActive("returns");
  };

  var voidSaleInvoice = function (saleId, reason) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void invoices");
      return;
    }
    var fl = foreignEditLockFor(saleId);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl) + " Cannot void until they finish.");
      return;
    }
    var voidState = Object.assign({}, state, { codRecords: S.get("tc3_codRecords", []) });
    var result = buildVoidSaleUpdates(voidState, saleId, reason, null, { confirmRefund: voidRefundConfirm === true });
    if (!result.ok) {
      showAlert(result.error);
      return;
    }
    S.set("tc3_products", result.products);
    S.set("tc3_customers", result.customers);
    S.set("tc3_sales", result.sales);
    S.set("tc3_cheques", result.cheques);
    if (result.codRecords) S.set("tc3_codRecords", result.codRecords);
    var repairs = rollbackRepairDevicesOnVoidSale(state.repairs || [], result.voidedSale, today());
    if (repairs !== (state.repairs || [])) S.set("tc3_repairs", repairs);
    setState(function (st) {
      return Object.assign({}, st, {
        products: result.products,
        customers: result.customers,
        sales: result.sales,
        cheques: result.cheques,
        repairs: repairs,
      });
    });
    addAudit("Voided Sale Invoice", (result.voidedSale.invoiceNo || saleId.slice(0, 8)) + (reason ? " — " + reason : ""));
    releaseInvoiceEditLock(S, saleId, lockIdentity, { force: true });
    setVoidSaleTarget(null);
    setVoidReason("");
    setVoidRefundConfirm(false);
    if (viewSale && viewSale.id === saleId) setViewSale(null);
    if (fullViewSale && fullViewSale.id === saleId) setFullViewSale(null);
    if (result.refundHint && result.refundHint.message) {
      showAlert("Invoice voided.\n\n" + result.refundHint.message);
    }
  };

  var promptVoidSale = function (sale) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void invoices");
      return;
    }
    var fl = foreignEditLockFor(sale && sale.id);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl) + " Cannot void until they finish.");
      return;
    }
    var block = voidSaleBlockReason(sale, state);
    if (block) {
      showAlert(block);
      return;
    }
    setVoidReason("");
    setVoidSaleTarget(sale);
  };

  var assertInvoiceUnlockedForMoney = function (saleId, actionLabel) {
    var fl = foreignEditLockFor(saleId);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl) + " Cannot " + actionLabel + " until they finish.");
      return false;
    }
    return true;
  };

  var saleInvoiceEditAllowed = function (s) {
    if (!s || isVoidedTxn(s)) return false;
    return true;
  };

  var foreignEditLockFor = function (saleId) {
    var lock = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
    if (!lock) return null;
    if (String(lock.deviceId || "") === String(lockIdentity.deviceId || "")) return null;
    return lock;
  };

  var tryOpenInvoiceEdit = function (sale) {
    if (!saleInvoiceEditAllowed(sale)) return;
    if (!canEditInvoices) { showPermissionDenied("edit invoices"); return; }
    var fl = foreignEditLockFor(sale.id);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl));
      return;
    }
    var split = splitSaleItemsByFree(sale.items || []);
    var paid = Number(sale.paid) || 0;
    var bal = Number(sale.balance);
    if (!isFinite(bal)) bal = Math.max(0, (Number(sale.total) || 0) - paid);
    var prefill = {
      posPageTab: "sale",
      editingSaleId: sale.id,
      invoiceNo: sale.invoiceNo || "",
      customerName: sale.customerName || sale.customer || "",
      customerPhone: sale.customerPhone || "",
      customerId: sale.customerId || "",
      items: (split.paid || []).map(function (it) { return mapDocItemToPosCartLine(it); }).filter(Boolean),
      freeItems: (split.free || []).map(function (it) { return mapDocItemToPosCartLine(it); }).filter(Boolean),
      discount: sale.discount ? String(sale.discount) : "",
      includeWarranty: !!sale.includeWarranty,
      saleNotes: sale.saleNote || "",
      recordDate: sale.date || today(),
      paidAmt: paid ? String(paid) : "",
      payMode: bal <= 0.005 ? "full" : (paid > 0.005 ? "partial" : "full"),
      fromRepairId: sale.fromRepairId || "",
      fromRepairDeviceIndexes: Array.isArray(sale.fromRepairDeviceIndexes) ? sale.fromRepairDeviceIndexes.slice() : [],
      fromQuotationId: sale.fromQuotationId || "",
    };
    S.set("tc3_repair_prefill", prefill);
    setViewSale(null);
    setFullViewSale(null);
    addAudit("Opening POS to edit Invoice " + (sale.invoiceNo || sale.id.slice(0, 8)), sale.invoiceNo || "");
    if (setActive) setActive("pos");
  };

  useEffect(function () {
    var t = setInterval(function () {
      refreshInvoiceEditLocksFromServer(S).finally(function () {
        setLockTick(function (n) { return n + 1; });
      });
    }, 5000);
    return function () { clearInterval(t); };
  }, []);

  var recordPayment = function (saleId, amount, note, mode, __forcedId, __legacyAll) {
    var applyPay = function (sale, salesBase) {
      if (!sale) return;
      if (isVoidedTxn(sale)) { showAlert("Cannot record payment on a voided invoice."); return; }
      if (!assertInvoiceUnlockedForMoney(saleId, "record payment")) return;
      /* Cheque: create cheque record — receivable stays open until cleared */
      if (mode === "Cheque") {
        var chequeNo = payModal.chequeNo || "";
        var chequeDueDate = payModal.chequeDueDate || today();
        var chequeBankName = payModal.chequeBankName || "";
        if (!chequeNo) { showAlert("Enter a cheque number."); return; }
        var chTs = new Date().toISOString();
        var newCheque = stampTransactionIsoDateTime({
          id: uid(), type: "incoming", status: "Pending",
          chequeNo: chequeNo, bankName: chequeBankName,
          amount: amount, dueDate: chequeDueDate, issuedDate: today(),
          customerId: sale.customerId || "", customerName: sale.customerName || "Walk-in",
          saleId: saleId, invoiceNo: sale.invoiceNo || "",
          note: note || "", createdAt: chTs, updatedAt: chTs
        }, chTs);
        var nch = (state.cheques || []).concat([newCheque]);
        var ph = (sale.paymentHistory || []).concat([{ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + chequeNo + " (Pending — due " + chequeDueDate + ")" + (note ? " | " + note : ""), chequeId: newCheque.id }]);
        var updSale = stampUpdatedAt(Object.assign({}, sale, { paymentHistory: ph }));
        var ns = (salesBase || state.sales).map(function (s) { return s.id === saleId ? updSale : s; });
      S.set("tc3_sales", ns); S.set("tc3_cheques", nch);
      try { pushKeysNow([["tc3_sales", ns], ["tc3_cheques", nch]]); } catch (_e) { /* ignore */ }
      addAudit("Cheque Received " + getCurrencySymbol() + " " + fmtNum(amount) + " #" + chequeNo, sale.invoiceNo || saleId.slice(0, 8));
        setState(function (st) { return Object.assign({}, st, { sales: ns, cheques: nch }); });
        if (viewSale && viewSale.id === saleId) setViewSale(updSale);
        setPayModal(null); setPayNote(""); setPayMode("Cash");
        showAlert("✅ Cheque #" + chequeNo + " (" + getCurrencySymbol() + " " + fmtNum(amount) + ") recorded. Go to Cheque Register to mark it cleared when received.");
        return;
      }
      var fit = assertPaymentFitsSaleBalance(sale, amount);
      if (!fit.ok) { showAlert(fit.message); return; }
      var res = resolvePaymentCreditTargetIds(state.customers, sale, { forcedCustomerId: __forcedId, legacyApplyAllNameMatches: __legacyAll });
      if (res.needPicker && res.candidates.length) {
        maybeShowPaymentMatchToasts(sale, res);
        showPaymentDupPick({
          candidates: res.candidates,
          onSelect: function (id) { recordPayment(saleId, amount, note, mode, id, false); },
          onSkip: function () { recordPayment(saleId, amount, note, mode, null, true); }
        });
        return;
      }
      var newPaid = (sale.paid || 0) + amount;
      var newBal = sale.total - newPaid;
      var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
      var ph2 = (sale.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amount, cashMethod: (mode === "Bank Transfer" || mode === "Online" || mode === "Cheque" || mode === "Card" ? "Bank" : "Cash"), note: (mode || "Cash") + (note ? ": " + note : "") }]);
      var updSale2 = stampUpdatedAt(Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: ph2 }));
      warnPaymentCustomerMatchSafety(state.customers, sale, "SalesInvoices.recordPayment");
      maybeShowPaymentMatchToasts(sale, res);
      var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - amount) }), null, c) : c; });
      var ns2 = (salesBase || state.sales).map(function (s) { return s.id === saleId ? updSale2 : s; });
      S.set("tc3_sales", ns2); S.set("tc3_customers", nc);
      try { pushKeysNow([["tc3_sales", ns2], ["tc3_customers", nc]]); } catch (_e) { /* ignore */ }
      setState(function (st) { return Object.assign({}, st, { sales: ns2, customers: nc }); });
      if (viewSale && viewSale.id === saleId) setViewSale(updSale2);
      setPayModal(null); setPayNote(""); setPayMode("Cash");
      toastAfterCustomerPaymentApplied(state.customers, res);
    };

    loadFreshSaleForPayment(S, saleId)
      .then(function (fresh) {
        var sale = fresh.sale || state.sales.find(function (s) { return s.id === saleId; });
        if (!sale) { showAlert("Invoice not found. Refresh and try again."); return; }
        if (fresh.sales) setState(function (st) { return Object.assign({}, st, { sales: fresh.sales }); });
        return checkForeignInvoiceEditLock(S, saleId, lockIdentity).then(function (fl) {
          if (fl) {
            showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
            return;
          }
          applyPay(sale, fresh.sales || state.sales);
        });
      })
      .catch(function () {
        applyPay(state.sales.find(function (s) { return s.id === saleId; }), state.sales);
      });
  };

  /* Split payment handler for SalesInvoices */
  var processSplitSale = function (saleId, splits, __forcedId, __legacyAll) {
    var applySplit = function (sale, salesBase) {
      if (!sale) return;
      if (!assertInvoiceUnlockedForMoney(saleId, "record payment")) return;
      var newPh = (sale.paymentHistory || []).slice();
      var newCheques = (state.cheques || []).slice();
      var totalAdded = 0;
      var totalNonCheque = 0;
      splits.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0;
        if (amt <= 0) return;
        totalAdded += amt;
        if (row.method === "Cheque") {
          var splitChTs = new Date().toISOString();
          var newChq = stampTransactionIsoDateTime({ id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), customerId: sale.customerId || "", customerName: sale.customerName || "", saleId: saleId, invoiceNo: sale.invoiceNo || "", note: row.note || "", createdAt: splitChTs, updatedAt: splitChTs }, splitChTs);
          newCheques.push(newChq);
          newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: newChq.id });
        } else {
          var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          totalNonCheque += amt;
          newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
        }
      });
      var fit = assertPaymentFitsSaleBalance(sale, totalAdded, {
        includePendingCheques: true,
        cheques: state.cheques || [],
      });
      if (!fit.ok) { showAlert(fit.message); return; }
      var newPaid = (sale.paid || 0) + totalNonCheque;
      var newBal = sale.total - newPaid;
      var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
      var updSale = stampUpdatedAt(Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: newPh }));
      var res = resolvePaymentCreditTargetIds(state.customers, sale, { forcedCustomerId: __forcedId, legacyApplyAllNameMatches: __legacyAll });
      if (res.needPicker && res.candidates.length) {
        maybeShowPaymentMatchToasts(sale, res);
        showPaymentDupPick({
          candidates: res.candidates,
          onSelect: function (id) { processSplitSale(saleId, splits, id, false); },
          onSkip: function () { processSplitSale(saleId, splits, null, true); }
        });
        return;
      }
      warnPaymentCustomerMatchSafety(state.customers, sale, "SalesInvoices.processSplitSale");
      maybeShowPaymentMatchToasts(sale, res);
      var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? stampCustomerBalance(Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - totalNonCheque) }), null, c) : c; });
      var ns = (salesBase || state.sales).map(function (s) { return s.id === saleId ? updSale : s; });
      S.set("tc3_sales", ns); S.set("tc3_customers", nc); S.set("tc3_cheques", newCheques);
      try { pushKeysNow([["tc3_sales", ns], ["tc3_customers", nc], ["tc3_cheques", newCheques]]); } catch (_e) { /* ignore */ }
      setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc, cheques: newCheques }); });
      if (viewSale && viewSale.id === saleId) setViewSale(updSale);
      setSplitPayModal(null);
      addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), sale.invoiceNo || saleId.slice(0, 8));
      toastAfterCustomerPaymentApplied(state.customers, res);
    };

    loadFreshSaleForPayment(S, saleId)
      .then(function (fresh) {
        var sale = fresh.sale || state.sales.find(function (s) { return s.id === saleId; });
        if (!sale) { showAlert("Invoice not found. Refresh and try again."); return; }
        if (fresh.sales) setState(function (st) { return Object.assign({}, st, { sales: fresh.sales }); });
        return checkForeignInvoiceEditLock(S, saleId, lockIdentity).then(function (fl) {
          if (fl) {
            showAlert(formatInvoiceEditLockMessage(fl) + " Cannot record payment until they finish.");
            return;
          }
          applySplit(sale, fresh.sales || state.sales);
        });
      })
      .catch(function () {
        applySplit(state.sales.find(function (s) { return s.id === saleId; }), state.sales);
      });
  };

  var printInvoice = function (sale, fmt) {
    var el = document.getElementById("si-inv-preview-" + sale.id);
    if (!el) return;
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + " portrait;margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Invoice " + escapeHtml(sale.invoiceNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  var whatsappInvoice = function (sale, fmt) {
    var el = document.getElementById("si-inv-preview-" + sale.id);
    if (!el) { showAlert("Invoice preview not ready. Please try again."); return; }
    var isA5 = fmt === "a5";
    var isThermal = fmt === "thermal" || fmt === "thermal58" || fmt === "thermal80";
    var thermalBodyW = fmt === "thermal58" ? "218px" : "302px";
    var pageSize = fmt === "thermal58" ? "58mm auto" : (fmt === "thermal80" || fmt === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var margin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pageSize + (isThermal ? "" : " portrait") + ";margin:" + margin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var pageFormat = isThermal ? (fmt === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
    var filename = "Invoice-" + (sale.invoiceNo || sale.id.slice(0, 8));
    var phone = sale.customerPhone || "";
    shareViaWhatsApp(el.innerHTML, filename, phone, { headStyles: css, pageFormat: pageFormat });
  };

  return (
    <div className={"erp-page erp-si-modern" + (siTab === "quotations" ? " is-tab-quotations" : " is-tab-invoices")}>
      <div className="erp-si-chrome">
        <div className="erp-si-topbar">
          <div className="erp-si-topbar-brand">
            <h2 className="erp-si-header-title">{siTab === "quotations" ? "Quotations" : "Invoices"}</h2>
            <p className="erp-si-header-sub">Sales invoices &amp; quotations</p>
          </div>
          <div className="erp-si-tabs" role="tablist" aria-label="Invoice views">
            <button type="button" role="tab" aria-selected={siTab === "invoices"} className={"erp-si-tab is-invoices" + (siTab === "invoices" ? " is-active" : "")} onClick={function () { setSiTab("invoices"); }}>
              <span className="erp-si-tab-ico" aria-hidden="true">🧾</span>
              <span>Invoices</span>
              <span className="erp-si-tab-count">{filtered.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={siTab === "quotations"} className={"erp-si-tab is-quotations" + (siTab === "quotations" ? " is-active" : "")} onClick={function () { setSiTab("quotations"); }}>
              <span className="erp-si-tab-ico" aria-hidden="true">📋</span>
              <span>Quotations</span>
              <span className="erp-si-tab-count">{quotationsAll.length}</span>
            </button>
          </div>
          {siTab === "invoices" ? (
            <div className="erp-si-health" aria-label="Invoice summary">
              <span className="erp-si-health-pill is-ok">{filtered.length.toLocaleString()} shown</span>
              {outstandingShown > 0
                ? <span className="erp-si-health-pill is-warn">{getCurrencySymbol()} {fmtNum(outstandingShown)} due</span>
                : <span className="erp-si-health-pill is-good">All clear</span>}
            </div>
          ) : (
            <div className="erp-si-health" aria-label="Quotation summary">
              <span className="erp-si-health-pill is-ok">{quotationsAll.length.toLocaleString()} total</span>
              {qSentCount > 0 ? <span className="erp-si-health-pill is-warn">{qSentCount} sent</span> : null}
              <span className="erp-si-health-pill is-good">{qConvertedCount} converted</span>
            </div>
          )}
        </div>
        {siTab === "invoices" ? (
          <div className="erp-si-stat-row">
            <StatCard money={false} label="Shown" value={filtered.length} accent={C.cyan} icon="🧾" sub="invoices in view" />
            <StatCard label="Total Value" value={totalShown} accent={C.blue} icon="💰" sub="filtered total" />
            <StatCard label="Collected" value={paidShown} accent={C.green} icon="✅" sub={totalShown > 0 ? Math.round(paidShown / totalShown * 100) + "% collected" : "—"} />
            <StatCard label="Outstanding" value={outstandingShown} accent={outstandingShown > 0 ? C.red : C.green} icon={outstandingShown > 0 ? "⏳" : "✓"} sub={outstandingShown > 0 ? "still due" : "all clear"} />
          </div>
        ) : (
          <div className="erp-si-stat-row">
            <StatCard money={false} label="Total Quotations" value={quotationsAll.length} accent={C.blue} icon="📋" sub={qDraftCount + " drafts"} />
            <StatCard money={false} label="Converted" value={qConvertedCount} accent={C.green} icon="✅" sub="to invoices" />
            <StatCard money={false} label="Pending (Sent)" value={qSentCount} accent={C.orange} icon="📤" sub="awaiting response" />
            <StatCard label="Pipeline Value" value={qPipelineValue} accent={C.purple || "#7c3aed"} icon="💰" sub="unconverted value" />
          </div>
        )}
      </div>

      <div className="erp-si-body">
      {siTab === "quotations" && <Quotations state={state} setState={setState} setActive={setActive} setSiTab={setSiTab} S={S} showAlert={showAlert} showConfirm={showConfirm} tcTrialGuard={tcTrialGuard} addAudit={addAudit} uid={uid} today={today} genInvNo={genInvNo} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtDate={fmtDate} fmtStock={fmtStock} fmtSumQty={fmtSumQty} getInvoicePrintLabels={getInvoicePrintLabels} PRINT_FONT_LINK={PRINT_FONT_LINK} escapeHtml={escapeHtml} shareViaWhatsApp={shareViaWhatsApp} StatCard={StatCard} Card={Card} CardTitle={CardTitle} Btn={Btn} Modal={Modal} Input={Input} TH={TH} TR={TR} TD={TD} WABtn={WABtn} InvoiceA4={InvoiceA4} InvoiceThermal={InvoiceThermal} C={C} usePager={usePager} Pager={Pager} canEditInvoices={canEditInvoices} canDeleteInvoices={canDeleteInvoices} showPermissionDenied={showPermissionDenied} getDuplicateNormalizedNameKeys={getDuplicateNormalizedNameKeys} normalizePaymentCustomerName={normalizePaymentCustomerName} />}
      {siTab === "invoices" && <React.Fragment>
      <div className="erp-si-panel">
        <div className="erp-si-panel-head">
          <div className="erp-si-panel-head-left">
            <span className="erp-si-panel-ico" aria-hidden="true">🧾</span>
            <div>
              <div className="erp-si-panel-title">Sales invoice register</div>
              <div className="erp-si-panel-count">{filtered.length.toLocaleString()} records</div>
            </div>
          </div>
          <div className="erp-si-panel-head-right">
            <span className="erp-si-status-legend" aria-label="Status icon meanings">
              <span className="erp-si-legend-item"><span className="erp-si-status-ico paid" aria-hidden="true">✓</span> Paid</span>
              <span className="erp-si-legend-item"><span className="erp-si-status-ico partial" aria-hidden="true">◐</span> Partial</span>
              <span className="erp-si-legend-item"><span className="erp-si-status-ico unpaid" aria-hidden="true">✕</span> Unpaid</span>
              <span className="erp-si-legend-item"><span className="erp-si-status-ico return" aria-hidden="true">↩</span> Part. Return</span>
              <span className="erp-si-legend-item"><span className="erp-si-status-ico cheque" aria-hidden="true">🕐</span> Pend. Cheque</span>
            </span>
          </div>
        </div>
        <div className="erp-si-toolbar">
          <div className="erp-si-search-wrap">
            <input className="erp-si-field" value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search customer, invoice #, phone…" aria-label="Search invoices" />
          </div>
          <select className="erp-si-field" value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }} aria-label="Status filter">
            <option>Active</option><option>Voided</option><option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
          </select>
          <div className="erp-si-date-range">
            <input type="date" className="erp-si-field" value={dateFrom} onChange={function (e) { setDateFrom(e.target.value); }} aria-label="From date" />
            <span className="erp-si-date-sep">–</span>
            <input type="date" className="erp-si-field" value={dateTo} onChange={function (e) { setDateTo(e.target.value); }} aria-label="To date" />
          </div>
          <button type="button" className="erp-si-btn-clear" onClick={function () { setSearch(""); setDateFrom(""); setDateTo(""); setFilterStatus("Active"); }}>Clear</button>
        </div>
        <div className="erp-si-table-wrap">
          <table className="erp-si-table">
            <thead>
              <tr>
                <th style={{ width: "13%" }}>Invoice #</th>
                <th style={{ width: "8%" }}>Date</th>
                <th style={{ width: "13%" }}>Customer</th>
                <th className="ctr" style={{ width: "5%" }}>Items</th>
                <th className="num" style={{ width: "10%" }}>Total</th>
                <th className="num" style={{ width: "10%" }}>Paid</th>
                <th className="ctr" style={{ width: "14%" }}>Status</th>
                <th className="num" style={{ width: "11%" }}>Last payment</th>
                <th className="num" style={{ width: "16%" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="erp-si-empty">No invoices match your filters</td>
                </tr>
              )}
              {siPager.slice.map(function (s) {
                var bal = Math.max(0, s.total - (s.paid || 0));
                var lastPay = (s.paymentHistory || []).slice(-1)[0];
                var hasPendingChq = (state.cheques || []).some(function (ch) { return ch.saleId === s.id && ch.status === "Pending"; });
                var saleRet = saleReturnUiStatus(s, state.salesReturns);
                var saleStatusLabel = displayStatusForSale(s, state.salesReturns);
                var statusIcons = [];
                if (isVoidedTxn(s)) {
                  statusIcons.push(saleStatusMeta("Voided"));
                } else {
                  statusIcons.push(saleStatusMeta(s.payStatus || "Unpaid"));
                  if (saleRet.hasReturns) statusIcons.push(saleStatusMeta(saleRet.label));
                }
                var invNo = s.invoiceNo || s.id.slice(0, 8);
                var foreignLock = foreignEditLockFor(s.id);
                void lockTick;
                var rowClass = isVoidedTxn(s) ? "row-void" : (saleRet.hasReturns ? "row-return" : "");
                return (
                  <tr key={s.id} className={rowClass} title={saleRet.hasReturns ? "This invoice has return activity" : undefined}>
                    <td>
                      <span
                        role="button"
                        tabIndex={0}
                        className="erp-si-inv-link"
                        onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }}
                        onKeyDown={function (e) {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFullViewSale(s);
                            setFvFormat(state.settings.invoiceDefaultSize || "a4");
                            setFvWarranty(s.includeWarranty || false);
                          }
                        }}
                        title={invNo + " — View & print"}
                      >{invNo}</span>
                    </td>
                    <td className="erp-si-muted">{fmtDate(s.date)}</td>
                    <td><span className="erp-si-cust" title={s.customerName || s.customer || "Walk-in"}>{s.customerName || s.customer || "Walk-in"}</span></td>
                    <td className="ctr erp-si-muted">{(s.items || []).length}</td>
                    <td className="num"><span className="erp-si-money is-total">{getCurrencySymbol()} {fmtNum(s.total)}</span></td>
                    <td className="num"><span className={"erp-si-money " + (bal > 0 ? "is-due" : "is-paid")}>{getCurrencySymbol()} {fmtNum(s.paid || 0)}</span></td>
                    <td className="ctr">
                      <span className="erp-si-status-cell" title={saleStatusLabel}>
                        {statusIcons.map(function (meta, idx) {
                          return (
                            <React.Fragment key={meta.tone + "-" + idx}>
                              {idx > 0 ? <span className="erp-si-status-sep" aria-hidden="true">|</span> : null}
                              <span className={"erp-si-status-ico " + meta.tone} title={meta.label} aria-label={meta.label}>{meta.icon}</span>
                            </React.Fragment>
                          );
                        })}
                        {hasPendingChq ? (
                          <React.Fragment>
                            <span className="erp-si-status-sep" aria-hidden="true">|</span>
                            <span className="erp-si-status-ico cheque" title="Pending cheque" aria-label="Pending cheque">🕐</span>
                          </React.Fragment>
                        ) : null}
                        {foreignLock ? (
                          <React.Fragment>
                            <span className="erp-si-status-sep" aria-hidden="true">|</span>
                            <span title={formatInvoiceEditLockMessage(foreignLock)} aria-label="Locked">🔒</span>
                          </React.Fragment>
                        ) : null}
                      </span>
                    </td>
                    <td className="num erp-si-muted">
                      {lastPay ? (
                        <span>{fmtDate(lastPay.date)} · <strong style={{ color: "#0f172a", fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(lastPay.amount)}</strong></span>
                      ) : "—"}
                    </td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup>
                        <ActBtn tone="cyan" title="View & print" onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }} />
                        {bal > 0 ? <ActBtn tone="green" icon="pay" title={foreignLock ? formatInvoiceEditLockMessage(foreignLock) : "Record payment"} wide disabled={!!foreignLock} onClick={function () {
                          if (!assertInvoiceUnlockedForMoney(s.id, "record payment")) return;
                          setSplitPayModal(s);
                        }}>Pay</ActBtn> : null}
                        {!isVoidedTxn(s) ? (
                          <ActBtn
                            tone="blue"
                            title={foreignLock ? formatInvoiceEditLockMessage(foreignLock) : "Edit invoice on Sales"}
                            disabled={!canEditInvoices || !!foreignLock}
                            onClick={function () {
                              if (!saleInvoiceEditAllowed(s)) return;
                              if (foreignLock) {
                                showAlert(formatInvoiceEditLockMessage(foreignLock));
                                return;
                              }
                              tryOpenInvoiceEdit(s);
                            }}
                          />
                        ) : null}
                        {!isVoidedTxn(s) ? <ActBtn tone="orange" icon="return" title="Sales return" onClick={goSalesReturn} /> : null}
                        {!isVoidedTxn(s) && canDeleteInvoices ? <ActBtn tone="red" title={foreignLock ? formatInvoiceEditLockMessage(foreignLock) : "Void invoice"} disabled={!!foreignLock} onClick={function () { promptVoidSale(s); }} /> : null}
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="erp-si-footer">
          <div className="erp-si-footer-pager">
            <Pager pager={siPager} />
          </div>
        </div>
      </div>

      {/* ── Full Invoice View Modal ── */}
      {fullViewSale && (
        <div className="erp-si-fv" role="dialog" aria-modal="true" aria-label="View and print invoice">
          <div className="erp-si-fv-bar">
            <div className="erp-si-fv-bar-left">
              <span className="erp-si-fv-badge" aria-hidden="true">VP</span>
              <div className="erp-si-fv-meta">
                <span className="erp-si-fv-kicker">View &amp; Print</span>
                <div className="erp-si-fv-meta-main">
                  <span className="erp-si-fv-inv">{fullViewSale.invoiceNo || fullViewSale.id.slice(0, 8)}</span>
                  <span className="erp-si-fv-sub">{fullViewSale.customerName || "Walk-in"} · {fmtDate(fullViewSale.date)}</span>
                </div>
              </div>
            </div>

            <div className="erp-si-fv-tools">
              <span className="erp-si-fv-tool-label">Format</span>
              <div className="erp-si-fv-formats" role="group" aria-label="Print format">
                {invPrintFmtOptions.map(function (item) {
                  var v = item[0]; var lbl = item[1];
                  var active = fvFormat === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      className={"erp-si-fv-fmt" + (active ? " is-active" : "")}
                      onClick={function () { setFvFormat(v); }}
                    >{lbl}</button>
                  );
                })}
              </div>
              <label className="erp-si-fv-warranty">
                <input type="checkbox" checked={fvWarranty} onChange={function (e) { setFvWarranty(e.target.checked); }} />
                <span>Warranty</span>
              </label>
            </div>

            <div className="erp-si-fv-actions">
              <button
                type="button"
                className="erp-si-fv-btn is-print"
                onClick={function () { setPrintFmtOpen(true); }}
              >Print</button>
              <WABtn title="Share as PDF via WhatsApp" onClick={function () { whatsappInvoice(Object.assign({}, fullViewSale, { includeWarranty: fvWarranty }), fvFormat); }} />
              <button
                type="button"
                className="erp-si-fv-btn is-close"
                onClick={function () { setFullViewSale(null); }}
                aria-label="Close"
              >✕</button>
            </div>
          </div>

          {saleReturnUiStatus(fullViewSale, state.salesReturns).hasReturns ? (
            <div className="erp-si-fv-return">
              <span title="This invoice has return activity">↩ Returns linked to this invoice</span>
            </div>
          ) : null}

          <div className="erp-si-fv-stage">
            <div
              id={"si-inv-preview-" + fullViewSale.id}
              className={"erp-si-fv-sheet" + ((fvFormat === "thermal58" || fvFormat === "thermal80") ? " is-thermal" : " is-paper")}
            >
              {(fvFormat === "thermal58" || fvFormat === "thermal80")
                ? <InvoiceThermal
                    inv={Object.assign({}, fullViewSale, { includeWarranty: fvWarranty })}
                    settings={state.settings}
                    invoiceLang="en"
                    width={fvFormat === "thermal58" ? 218 : 302}
                  />
                : <InvoiceA4
                    inv={Object.assign({}, fullViewSale, { includeWarranty: fvWarranty })}
                    settings={state.settings}
                    invoiceLang="en"
                    size={fvFormat}
                  />
              }
            </div>
          </div>
        </div>
      )}

      <PrintFormatChooser
        open={printFmtOpen}
        settings={state.settings}
        thermalId={invThermalFmt}
        title="Print invoice"
        hint="Choose A4, A5, or Thermal for your printer."
        onClose={function () { setPrintFmtOpen(false); }}
        onSelect={function (fmt) {
          setPrintFmtOpen(false);
          setFvFormat(fmt);
          setPendingPrintFmt(fmt);
        }}
        zIndex={13000}
      />

      {viewSale && (function () {
        var vr = saleReturnUiStatus(viewSale, state.salesReturns);
        var vsDisp = displayStatusForSale(viewSale, state.salesReturns);
        return (
        <Modal title={"Invoice — " + (viewSale.invoiceNo || viewSale.id.slice(0, 8))} onClose={function () { setViewSale(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Customer</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{viewSale.customerName || "Walk-in"}</div>
              <div style={{ color: C.muted, marginTop: 3, fontSize: 13 }}>{viewSale.customerPhone || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{fmtDateFull(viewSale.date)}</div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Status:</span>
                <Badge status={vsDisp} />
                {vr.hasReturns ? <span title="This invoice has return activity" style={{ fontSize: 10, fontWeight: 800, color: "#9f1239" }}>↩ Returns on file</span> : null}
              </div>
            </div>
            <PaymentBreakdown invoice={viewSale} cheques={state.cheques || []} isSale={true} />
          </div>
          {vr.hasReturns ? (
            <ReturnDetailsPanel
              mode="sale"
              rows={vr.rows}
              originalId={viewSale.id}
              C={C}
              getCurrencySymbol={getCurrencySymbol}
              fmtNum={fmtNum}
              fmtDateFull={fmtDateFull}
            />
          ) : null}

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead><tr><TH>#</TH><TH>Item</TH><TH>Qty</TH><TH>Unit Price</TH><TH>Total</TH></tr></thead>
            <tbody>
              {(viewSale.items || []).map(function (it, i) {
                var cmt = String(it.comment != null ? it.comment : it.itemNote || "").trim();
                return (
                  <TR key={i} i={i}>
                    <TD color={C.muted}>{i + 1}</TD>
                    <TD bold>
                      <div>{it.name || "Unknown Product"}</div>
                      {cmt ? <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginTop: 3 }}>{cmt}</div> : null}
                    </TD>
                    <TD center>{fmtStock(it.qty, it.unit)}</TD>
                    <TD>{getCurrencySymbol()} {fmtNum(it.price)}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(it.qty * it.price)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </table>

          {(viewSale.totalTax || 0) > 0 && (viewSale.selectedTaxes || []).length > 0 && (
            <div style={{ background: "#fafbff", borderRadius: 8, padding: "10px 14px", marginBottom: 14, border: "1px solid " + C.borderLight, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: C.muted }}>Sub total</span><span>{getCurrencySymbol()} {fmtNum(viewSale.subTotal != null ? viewSale.subTotal : 0)}</span></div>
              {(viewSale.discount || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: C.orange }}><span>Discount</span><span>-{getCurrencySymbol()} {fmtNum(viewSale.discount)}</span></div>}
              {(viewSale.selectedTaxes || []).map(function (tl, ti) {
                return <div key={"vs-" + ti} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}><span>{tl.name} ({fmtNum(tl.rate)}%)</span><span>{getCurrencySymbol()} {fmtNum(tl.amount)}</span></div>;
              })}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, marginTop: 6, borderTop: "1px solid " + C.border, paddingTop: 6 }}><span>Invoice total</span><span style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(viewSale.total)}</span></div>
            </div>
          )}

          {(viewSale.paymentHistory || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Payment History</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(viewSale.paymentHistory || []).map(function (ph, idx) {
                  return (
                    <div key={ph.id || idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: "#f0f9f5", borderRadius: 8, border: "1px solid #9ee8ce" }}>
                      <div>
                        <span style={{ fontWeight: 800, color: C.green, fontSize: 14 }}>{getCurrencySymbol()} {fmtNum(ph.amount)}</span>
                        {ph.note ? <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>— {ph.note}</span> : null}
                      </div>
                      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{fmtDateFull(ph.date)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Print controls ── */}
          <div style={{ background: "#f0f4ff", border: "1px solid " + C.borderLight, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Print Format</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {(function () {
                var paperSize = state.settings.invoiceDefaultSize || "a4";
                var thermalSize = state.settings.invoiceThermalSize || "thermal80";
                var opts = [
                  [paperSize, paperSize === "a5" ? "📋 A5" : "📄 A4"],
                  [thermalSize, thermalSize === "thermal58" ? "🖨 Thermal 58mm" : "🖨 Thermal 80mm"]
                ];
                return opts.map(function (item) {
                  var v = item[0]; var lbl = item[1];
                  var active = siFormat === v;
                  return (
                    <button key={v} onClick={function () { setSiFormat(v); }}
                      style={{ padding: "8px 18px", borderRadius: 8, border: "2px solid " + (active ? C.accent : C.border), background: active ? C.accentSoft : "#fff", color: active ? C.accent : C.textMd, fontSize: 12, fontWeight: active ? 800 : 600, cursor: "pointer", transition: "all .15s" }}>
                      {active ? "✓ " : ""}{lbl}
                    </button>
                  );
                });
              })()}
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: C.textMd, fontWeight: 600, userSelect: "none" }}>
                <input type="checkbox" checked={siWarranty} onChange={function (e) { setSiWarranty(e.target.checked); }} style={{ width: 15, height: 15, cursor: "pointer", accentColor: C.accent }} />
                Include Warranty
              </label>
              <Btn col="blue" onClick={function () { printInvoice(Object.assign({}, viewSale, { includeWarranty: siWarranty }), siFormat); }}>🖨 Print Invoice</Btn>
              <WABtn title="Share as PDF via WhatsApp" onClick={function () { whatsappInvoice(Object.assign({}, viewSale, { includeWarranty: siWarranty }), siFormat); }} />
            </div>
          </div>

          {/* Live invoice preview */}
          <div style={{ border: "1.5px solid " + C.border, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: C.navBg, padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "rgba(200,220,255,0.8)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Preview — {siFormat === "thermal58" ? "Thermal 58mm" : siFormat === "thermal80" ? "Thermal 80mm" : siFormat === "a5" ? "A5 Half Page" : "A4 Full Page"}
            </div>
            <div id={"si-inv-preview-" + viewSale.id} style={{ background: "#fff", maxHeight: 480, overflowY: "auto", padding: (siFormat === "thermal58" || siFormat === "thermal80") ? "12px" : "0" }}>
              {(siFormat === "thermal58" || siFormat === "thermal80")
                ? <InvoiceThermal inv={Object.assign({}, viewSale, { includeWarranty: siWarranty })} settings={state.settings} invoiceLang="en" width={siFormat === "thermal58" ? 218 : 302} />
                : <InvoiceA4 inv={Object.assign({}, viewSale, { includeWarranty: siWarranty })} settings={state.settings} invoiceLang="en" size={siFormat} />
              }
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Math.max(0, viewSale.total - (viewSale.paid || 0)) > 0 && (
              <Btn
                col="cyan"
                disabled={!!foreignEditLockFor(viewSale.id)}
                title={foreignEditLockFor(viewSale.id) ? formatInvoiceEditLockMessage(foreignEditLockFor(viewSale.id)) : undefined}
                onClick={function () {
                  if (!assertInvoiceUnlockedForMoney(viewSale.id, "record payment")) return;
                  setSplitPayModal(viewSale);
                }}
              >+ Record Payment</Btn>
            )}
            <Btn
              col="blue"
              disabled={!canEditInvoices || !!foreignEditLockFor(viewSale.id)}
              title={foreignEditLockFor(viewSale.id) ? formatInvoiceEditLockMessage(foreignEditLockFor(viewSale.id)) : "Edit invoice on Sales"}
              onClick={function () {
                if (!saleInvoiceEditAllowed(viewSale)) return;
                var fl = foreignEditLockFor(viewSale.id);
                if (fl) {
                  showAlert(formatInvoiceEditLockMessage(fl));
                  return;
                }
                setViewSale(null);
                tryOpenInvoiceEdit(viewSale);
              }}
            >Edit Invoice</Btn>
            <Btn col="orange" onClick={goSalesReturn}>Sales Return</Btn>
            {!isVoidedTxn(viewSale) && canDeleteInvoices ? (
              <Btn
                col="red"
                disabled={!!foreignEditLockFor(viewSale.id)}
                onClick={function () { promptVoidSale(viewSale); }}
              >Void Invoice</Btn>
            ) : null}
            <Btn col="gray" onClick={function () { setViewSale(null); }}>Close</Btn>
          </div>
        </Modal>
        );
      })()}

      {voidSaleTarget && (
        <Modal title={"Void Invoice — " + (voidSaleTarget.invoiceNo || voidSaleTarget.id.slice(0, 8))} onClose={function () { setVoidSaleTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
            This will reverse stock and customer balance. The invoice stays on record as <strong>Voided</strong>. This cannot be undone.
            {(function () {
              var hint = computeVoidSaleRefundHint(voidSaleTarget, state.cheques || []);
              if (!hint.message) return null;
              return <div style={{ marginTop: 8, color: "#7f1d1d" }}>{hint.message}</div>;
            })()}
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          {(function () {
            var hint = computeVoidSaleRefundHint(voidSaleTarget, state.cheques || []);
            var paidCash = (voidSaleTarget.paymentHistory || []).reduce(function (a, ph) {
              var amt = Number(ph.amount) || 0;
              if (amt <= 0) return a;
              var m = ph.cashMethod || "Cash";
              if (m === "Cheque" || m === "Adjustment") return a;
              return a + amt;
            }, 0);
            if (paidCash <= 0.005 && !(hint.cashBankRefund > 0)) return null;
            return (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, color: "#7f1d1d", fontWeight: 600 }}>
                <input type="checkbox" checked={voidRefundConfirm} onChange={function (e) { setVoidRefundConfirm(e.target.checked); }} style={{ marginTop: 3 }} />
                <span>I confirm cash/bank received on this invoice will be refunded to the customer (books will post a reversing payment).</span>
              </label>
            );
          })()}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn col="red" disabled={!voidReason} onClick={function () { voidSaleInvoice(voidSaleTarget.id, voidReason); }}>Void Invoice</Btn>
            <Btn col="gray" onClick={function () { setVoidSaleTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {splitPayModal && (
        <SplitPaymentModal
          title={"Record Payment — " + (splitPayModal.invoiceNo || splitPayModal.id.slice(0, 8)) + (splitPayModal.customerName ? " · " + splitPayModal.customerName : "")}
          invoiceTotal={splitPayModal.total}
          alreadyPaid={splitPayModal.paid || 0}
          isSale={true}
          onSave={function (splits) { processSplitSale(splitPayModal.id, splits); }}
          onClose={function () { setSplitPayModal(null); }}
        />
      )}

      </React.Fragment>}
      </div>
    </div>
  );
});
var Invoices = SalesInvoices;
export default Invoices;
