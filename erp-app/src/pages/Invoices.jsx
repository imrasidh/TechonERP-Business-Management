import React, { useState, useEffect, useRef } from "react";
import { computeSaleTax } from "../tax/taxCompute.js";
import { saleReturnUiStatus, displayStatusForSale } from "../utils/returnDisplay.js";
import { buildVoidSaleUpdates, isVoidedTxn, VOID_REASON_OPTIONS, voidSaleBlockReason } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import CustomerPicker from "../components/CustomerPicker.jsx";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { formatInvoiceLinePrice, formatInvoiceLineTotal } from "../utils/posFreeItems.js";
import { quotationToPrintInv } from "../utils/quotationDocument.js";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";

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
    var name = String(draft && draft.name || "").trim();
    var phone = String(draft && draft.phone || "").trim();
    if (!name) return null;
    if (!tcTrialGuard(state.customers || [], "customers")) return null;
    var created = { id: uid(), name: name, phone: phone, address: "", credit: 0, totalSpent: 0 };
    var nextCustomers = (state.customers || []).concat([created]);
    S.set("tc3_customers", nextCustomers);
    setState(function (st) { return Object.assign({}, st, { customers: nextCustomers }); });
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
            duplicateNameKeys={posDupNameKeys}
            normalizeNameKey={normalizePaymentCustomerName}
            C={C}
            Input={Input}
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
                    <button onClick={function () { setFq(Object.assign({}, fq, { items: fq.items.filter(function (_, j) { return j !== i; }) })); }}
                      style={{ background: "#fde8ed", color: C.red, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>✕</button>
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
  var [editQ, setEditQ] = useState(null);
  var [viewQ, setViewQ] = useState(null);
  var [search, setSearch] = useState("");
  var [filterStatus, setFilterStatus] = useState("All");
  var [pendingQuotPrint, setPendingQuotPrint] = useState(null);
  var quotWaPendingRef = useRef(false);

  var quotations = state.quotations || [];
  var STATUSES = ["All", "Draft", "Sent", "Converted", "Expired"];
  var STATUS_COLORS = { Draft: C.textMd, Sent: C.blue, Converted: C.green, Expired: C.red };
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
    var newQ = Object.assign({}, f, { id: uid(), createdAt: today() }, taxExtra);
    if (!tcTrialGuard(quotations, 'quotations')) return;
    var nq = quotations.concat([newQ]);
    S.set("tc3_quotations", nq);
    addAudit("Created Quotation", newQ.quotationNo);
    setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
    setF(Object.assign({}, BLANK_Q, { quotationNo: genInvNo("QT") }));
    setShow(false);
  };

  var saveEdit = function () {
    if (!canEditInvoices) { showPermissionDenied("edit quotations"); return; }
    if (!editQ || !editQ.items.length) { showAlert("Add at least one product."); return; }
    var sub = formTotal(editQ.items);
    var qtc = computeSaleTax(state.settings, sub);
    var taxExtra = {};
    if (state.settings && state.settings.taxEnabled) {
      taxExtra = { subTotal: sub, taxMode: qtc.taxMode, totalTax: qtc.totalTax, selectedTaxes: (qtc.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; }), total: qtc.grandTotal };
    } else {
      taxExtra = { subTotal: sub, total: sub, totalTax: 0, selectedTaxes: [] };
    }
    var mergedEdit = Object.assign({}, editQ, taxExtra);
    var nq = quotations.map(function (q) { return q.id === mergedEdit.id ? mergedEdit : q; });
    S.set("tc3_quotations", nq);
    addAudit("Updated Quotation", editQ.quotationNo);
    setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
    setEditQ(null);
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
      if (viewQ && viewQ.id === id) setViewQ(null);
    });
  };

  var updateStatus = function (id, newStatus) {
    var nq = quotations.map(function (q) { return q.id === id ? Object.assign({}, q, { status: newStatus }) : q; });
    S.set("tc3_quotations", nq);
    setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
    if (viewQ && viewQ.id === id) setViewQ(Object.assign({}, viewQ, { status: newStatus }));
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
      setViewQ(null);
      addAudit("Opening POS from Quotation " + q.quotationNo, q.quotationNo);
      /* Navigate to POS — it will mount fresh, read prefill and populate cart */
      if (setActive) setActive("pos");
    });
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard label="Total Quotations" money={false} value={quotations.length} accent={C.blue} icon="📋" sub={quotations.filter(function (q) { return q.status === "Draft"; }).length + " drafts"} />
        <StatCard label="Converted" money={false} value={quotations.filter(function (q) { return q.status === "Converted"; }).length} accent={C.green} icon="✅" sub="to invoices" />
        <StatCard label="Pending (Sent)" money={false} value={quotations.filter(function (q) { return q.status === "Sent"; }).length} accent={C.orange} icon="📤" sub="awaiting response" />
        <StatCard label="Pipeline Value" value={quotations.filter(function (q) { return q.status !== "Converted" && q.status !== "Expired"; }).reduce(function (a, q) { return a + quotationGrand(q); }, 0)} accent={C.purple} icon="💰" sub="unconverted value" />
      </div>

      <Card>
        <CardTitle sub={filteredQ.length + " quotations — create new from Sales → Quotation"}>Quotations</CardTitle>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Input placeholder="Search customer or quotation number..." value={search} onChange={function (e) { setSearch(e.target.value); }} />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STATUSES.map(function (s) {
              var isA = filterStatus === s;
              return <button key={s} onClick={function () { setFilterStatus(s); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid " + (isA ? C.blue : C.border), background: isA ? C.accentSoft : "#fff", fontWeight: 700, fontSize: 12, color: isA ? C.blue : C.textMd, cursor: "pointer" }}>{s}</button>;
            })}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Quotation #</TH><TH>Customer</TH><TH>Date</TH><TH>Items</TH><TH>Total</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {quotPager.slice.map(function (q, i) {
                return (
                  <TR key={q.id} i={i} onClick={function () { setViewQ(q); }}>
                    <TD bold><span style={{ color: C.blue, fontFamily: "monospace" }}>{q.quotationNo || q.id.slice(0, 8)}</span></TD>
                    <TD>{q.customer || "Walk-in"}</TD>
                    <TD color={C.muted}>{q.date}</TD>
                    <TD center color={C.muted}>{(q.items || []).length}</TD>
                    <TD bold>{getCurrencySymbol()} {fmtNum(quotationGrand(q))}</TD>
                    <TD><span style={{ fontWeight: 700, fontSize: 12, color: STATUS_COLORS[q.status] || C.textMd }}>{q.status}</span></TD>
                    <td style={actBtnCellStyle} onClick={function (e) { e.stopPropagation(); }}>
                      <ActBtnGroup>
                        <ActBtn tone="cyan" title="View quotation" onClick={function () { setViewQ(q); }}>🧾</ActBtn>
                        {q.status !== "Converted" ? (
                          <ActBtn tone="blue" title="Edit quotation" onClick={function () { if (!canEditInvoices) { showPermissionDenied("edit quotations"); return; } setEditQ(q); }}>✎</ActBtn>
                        ) : null}
                        {q.status !== "Converted" ? (
                          <ActBtn tone="green" title="Convert to invoice" wide onClick={function () { convertToSale(q); }}>Invoice</ActBtn>
                        ) : null}
                        <ActBtn tone="red" title="Delete quotation" onClick={function () { deleteQ(q.id); }} disabled={!canDeleteInvoices}>✕</ActBtn>
                      </ActBtnGroup>
                    </td>
                  </TR>
                );
              })}
              {filteredQ.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: C.muted }}>No quotations yet. Create one from <strong>Sales → Quotation</strong>.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pager={quotPager} />
      </Card>

      {/* New Quotation Modal */}
      {show && (
        <Modal title="New Quotation" onClose={function () { setShow(false); }} wide>
          <QuotationForm fq={f} setFq={setF} onSave={saveNew} title="💾 Save Quotation" state={state} setState={setState} S={S} uid={uid} tcTrialGuard={tcTrialGuard} getDuplicateNormalizedNameKeys={getDuplicateNormalizedNameKeys} normalizePaymentCustomerName={normalizePaymentCustomerName} showAlert={showAlert} C={C} Input={Input} TH={TH} TR={TR} TD={TD} Btn={Btn} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} today={today} />
        </Modal>
      )}

      {/* Edit Quotation Modal */}
      {editQ && (
        <Modal title={"Edit — " + (editQ.quotationNo || "")} onClose={function () { setEditQ(null); }} wide>
          <QuotationForm fq={editQ} setFq={setEditQ} onSave={saveEdit} title="💾 Update Quotation" state={state} setState={setState} S={S} uid={uid} tcTrialGuard={tcTrialGuard} getDuplicateNormalizedNameKeys={getDuplicateNormalizedNameKeys} normalizePaymentCustomerName={normalizePaymentCustomerName} showAlert={showAlert} C={C} Input={Input} TH={TH} TR={TR} TD={TD} Btn={Btn} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} today={today} />
        </Modal>
      )}

      {/* View Modal */}
      {viewQ && (
        <Modal title={"Quotation — " + (viewQ.quotationNo || "")} onClose={function () { setViewQ(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16, padding: "12px 16px", background: "#f7f9ff", borderRadius: 10, border: "1px solid " + C.border }}>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Customer</div><div style={{ fontWeight: 700 }}>{viewQ.customer || "Walk-in"}</div>{viewQ.customerPhone && <div style={{ fontSize: 12, color: C.muted }}>{viewQ.customerPhone}</div>}</div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Date</div><div style={{ fontWeight: 700 }}>{viewQ.date}</div></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Status</div><span style={{ fontWeight: 800, color: STATUS_COLORS[viewQ.status] || C.textMd }}>{viewQ.status}</span></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Total</div><div style={{ fontWeight: 800, fontSize: 18, color: C.blue }}>{getCurrencySymbol()} {fmtNum(quotationGrand(viewQ))}</div></div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead><tr><TH>#</TH><TH>Product</TH><TH>Qty</TH><TH>Price</TH><TH>Amount</TH></tr></thead>
            <tbody>
              {(viewQ.items || []).map(function (it, i) {
                return <TR key={it.id || i} i={i}><TD color={C.muted}>{i + 1}</TD><TD bold>{it.name}</TD><TD center>{it.qty}</TD><TD>{getCurrencySymbol()} {fmtNum(it.price)}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(it.qty * it.price)}</TD></TR>;
              })}
            </tbody>
          </table>
          {viewQ.notes && <div style={{ background: "#f7f9ff", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.textMd, borderLeft: "3px solid " + C.blue }}><strong>Notes:</strong> {viewQ.notes}</div>}
          {viewQ.convertedInvoiceId && <div style={{ background: "#e6f7f2", border: "1px solid #9ee8ce", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.green }}>✅ Converted to Invoice: <strong>{viewQ.convertedInvoiceId}</strong> on {viewQ.convertedAt}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Btn col="gray" onClick={function () { printQuotation(viewQ); }}>🖨 Print</Btn>
            <WABtn title="Share Quotation via WhatsApp" onClick={function () { printQuotation(viewQ, null, true); }} />
            {viewQ.status !== "Converted" && (
              <React.Fragment>
                {["Draft","Sent","Expired"].filter(function (s) { return s !== viewQ.status; }).map(function (s) {
                  return <Btn key={s} sm col="gray" onClick={function () { updateStatus(viewQ.id, s); }}>Mark {s}</Btn>;
                })}
                <Btn col="blue" onClick={function () { if (!canEditInvoices) { showPermissionDenied("edit quotations"); return; } setViewQ(null); setEditQ(viewQ); }} disabled={!canEditInvoices}>✏ Edit</Btn>
                <Btn col="green" onClick={function () { convertToSale(viewQ); }}>→ Convert to Invoice</Btn>
              </React.Fragment>
            )}
            <Btn col="red" onClick={function () { deleteQ(viewQ.id); setViewQ(null); }} disabled={!canDeleteInvoices}>🗑 Delete</Btn>
          </div>
        </Modal>
      )}

      {pendingQuotPrint && InvoiceA4 && (
        <div id="quot-print-preview" style={{ position: "fixed", left: -9999, top: -9999, width: 794, pointerEvents: "none", opacity: 0 }}>
          {(pendingQuotPrint.mode === "thermal" || pendingQuotPrint.mode === "thermal58" || pendingQuotPrint.mode === "thermal80")
            ? <InvoiceThermal inv={pendingQuotPrint.inv} settings={pendingQuotPrint.settings} invoiceLang={pendingQuotPrint.lang} width={pendingQuotPrint.mode === "thermal58" ? 218 : 302} documentKind="quotation" />
            : <InvoiceA4 inv={pendingQuotPrint.inv} settings={pendingQuotPrint.settings} invoiceLang={pendingQuotPrint.lang} size={pendingQuotPrint.mode || "a4"} documentKind="quotation" />
          }
        </div>
      )}
    </div>
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
  var [siTab, setSiTab] = useState("invoices");
  var [search, setSearch] = useState("");
  var [dateFrom, setDateFrom] = useState("");
  var [dateTo, setDateTo] = useState("");
  var [filterStatus, setFilterStatus] = useState("Active");
  var [viewSale, setViewSale] = useState(null);
  var [editSale, setEditSale] = useState(null);
  var [voidSaleTarget, setVoidSaleTarget] = useState(null);
  var [voidReason, setVoidReason] = useState("");
  var [payModal, setPayModal] = useState(null);
  var [splitPayModal, setSplitPayModal] = useState(null);
  var [payNote, setPayNote] = useState("");
  var [payMode, setPayMode] = useState("Cash");
  var [siFormat, setSiFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [siWarranty, setSiWarranty] = useState(false);
  var [fullViewSale, setFullViewSale] = useState(null);
  var [fvFormat, setFvFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [fvWarranty, setFvWarranty] = useState(false);

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

  var invThStyle = function (align) {
    return {
      textAlign: align || "left",
      padding: "10px 12px",
      fontWeight: 700,
      color: C.th,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      borderBottom: "2px solid " + C.border,
      whiteSpace: "nowrap",
      background: "#f8fafc",
    };
  };

  var invMoneyTd = function (children, color, bold) {
    return (
      <td style={{ padding: "10px 12px", textAlign: "right", color: color || C.text, fontWeight: bold ? 700 : 500, whiteSpace: "nowrap", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
        {children}
      </td>
    );
  };

  var goSalesReturn = function () {
    try { sessionStorage.setItem("tc3_returns_tab", "salesreturn"); } catch (e) { /* ignore */ }
    if (typeof setActive === "function") setActive("returns");
  };

  var voidSaleInvoice = function (saleId, reason) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void invoices");
      return;
    }
    var result = buildVoidSaleUpdates(state, saleId, reason);
    if (!result.ok) {
      showAlert(result.error);
      return;
    }
    S.set("tc3_products", result.products);
    S.set("tc3_customers", result.customers);
    S.set("tc3_sales", result.sales);
    S.set("tc3_cheques", result.cheques);
    setState(function (st) {
      return Object.assign({}, st, {
        products: result.products,
        customers: result.customers,
        sales: result.sales,
        cheques: result.cheques,
      });
    });
    addAudit("Voided Sale Invoice", (result.voidedSale.invoiceNo || saleId.slice(0, 8)) + (reason ? " — " + reason : ""));
    setVoidSaleTarget(null);
    setVoidReason("");
    if (viewSale && viewSale.id === saleId) setViewSale(null);
    if (fullViewSale && fullViewSale.id === saleId) setFullViewSale(null);
  };

  var promptVoidSale = function (sale) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void invoices");
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

  var saleInvoiceEditAllowed = function (s) {
    if (!s || isVoidedTxn(s)) return false;
    return true;
  };

  /* Invoice edit: metadata only — no line items, totals, or stock (use Sales Return for quantity/amount corrections). */
  var saveEdit = function () {
    if (!canEditInvoices) {
      showPermissionDenied("edit invoices");
      return;
    }
    if (!editSale) return;
    if (isVoidedTxn(editSale)) {
      showAlert("Voided invoices cannot be edited.");
      return;
    }
    var orig = state.sales.find(function (s) { return s.id === editSale.id; });
    if (!orig) return;
    var editSaleAmtErr = validateTxnAmounts("Edited sale invoice", orig.total || 0, orig.paid || 0, orig.balance || 0);
    if (editSaleAmtErr) { showAlert("❌ " + editSaleAmtErr); return; }
    checkPeriodClose(orig.date, state.settings, function () {
      checkPeriodClose(editSale.date, state.settings, function () {
      var merged = Object.assign({}, orig, {
        invoiceNo: editSale.invoiceNo,
        date: editSale.date,
        customerName: editSale.customerName,
        customerPhone: editSale.customerPhone,
        saleNote: editSale.saleNote !== undefined ? editSale.saleNote : orig.saleNote,
      });
      var ns = state.sales.map(function (s) { return s.id === merged.id ? merged : s; });
      S.set("tc3_sales", ns);
      addAudit("Edited Sale Invoice (details)", merged.invoiceNo || merged.id.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { sales: ns }); });
      setEditSale(null);
      });
    });
  };

  var recordPayment = function (saleId, amount, note, mode, __forcedId, __legacyAll) {
    var sale = state.sales.find(function (s) { return s.id === saleId; });
    if (!sale) return;
    /* Cheque: create cheque record — receivable stays open until cleared */
    if (mode === "Cheque") {
      var chequeNo = payModal.chequeNo || "";
      var chequeDueDate = payModal.chequeDueDate || today();
      var chequeBankName = payModal.chequeBankName || "";
      if (!chequeNo) { showAlert("Enter a cheque number."); return; }
      var newCheque = {
        id: uid(), type: "incoming", status: "Pending",
        chequeNo: chequeNo, bankName: chequeBankName,
        amount: amount, dueDate: chequeDueDate, issuedDate: today(),
        customerId: sale.customerId || "", customerName: sale.customerName || "Walk-in",
        saleId: saleId, invoiceNo: sale.invoiceNo || "",
        note: note || "", createdAt: today()
      };
      var nch = (state.cheques || []).concat([newCheque]);
      var ph = (sale.paymentHistory || []).concat([{ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + chequeNo + " (Pending — due " + chequeDueDate + ")" + (note ? " | " + note : ""), chequeId: newCheque.id }]);
      var updSale = Object.assign({}, sale, { paymentHistory: ph });
      var ns = state.sales.map(function (s) { return s.id === saleId ? updSale : s; });
      S.set("tc3_sales", ns); S.set("tc3_cheques", nch);
      addAudit("Cheque Received " + getCurrencySymbol() + " " + fmtNum(amount) + " #" + chequeNo, sale.invoiceNo || saleId.slice(0, 8));
      setState(function (st) { return Object.assign({}, st, { sales: ns, cheques: nch }); });
      if (viewSale && viewSale.id === saleId) setViewSale(updSale);
      setPayModal(null); setPayNote(""); setPayMode("Cash");
      showAlert("✅ Cheque #" + chequeNo + " (" + getCurrencySymbol() + " " + fmtNum(amount) + ") recorded. Go to Cheque Register to mark it cleared when received.");
      return;
    }
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
    var ph = (sale.paymentHistory || []).concat([{ id: uid(), date: today(), amount: amount, cashMethod: (mode === "Bank Transfer" || mode === "Online" || mode === "Cheque" || mode === "Card" ? "Bank" : "Cash"), note: (mode || "Cash") + (note ? ": " + note : "") }]);
    var updSale = Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: ph });
    warnPaymentCustomerMatchSafety(state.customers, sale, "SalesInvoices.recordPayment");
    maybeShowPaymentMatchToasts(sale, res);
    var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - amount) }) : c; });
    var ns = state.sales.map(function (s) { return s.id === saleId ? updSale : s; });
    S.set("tc3_sales", ns); S.set("tc3_customers", nc);
    setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc }); });
    if (viewSale && viewSale.id === saleId) setViewSale(updSale);
    setPayModal(null); setPayNote(""); setPayMode("Cash");
    toastAfterCustomerPaymentApplied(state.customers, res);
  };

  /* Split payment handler for SalesInvoices */
  var processSplitSale = function (saleId, splits, __forcedId, __legacyAll) {
    var sale = state.sales.find(function (s) { return s.id === saleId; });
    if (!sale) return;
    var newPh = (sale.paymentHistory || []).slice();
    var newCheques = (state.cheques || []).slice();
    var totalAdded = 0;
    var totalNonCheque = 0;
    splits.forEach(function (row) {
      var amt = parseFloat(row.amount) || 0;
      if (amt <= 0) return;
      totalAdded += amt;
      if (row.method === "Cheque") {
        var newChq = { id: uid(), type: "incoming", status: "Pending", chequeNo: (row.chequeNo || "").trim(), bankName: (row.chequeBankName || "").trim(), amount: amt, dueDate: row.chequeDueDate || today(), issuedDate: today(), customerId: sale.customerId || "", customerName: sale.customerName || "", saleId: saleId, invoiceNo: sale.invoiceNo || "", note: row.note || "", createdAt: today() };
        newCheques.push(newChq);
        newPh.push({ id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + (row.chequeNo || "") + " " + getCurrencySymbol() + " " + fmtNum(amt) + " (Pending — due " + (row.chequeDueDate || today()) + ")" + (row.note ? " | " + row.note : ""), chequeId: newChq.id });
      } else {
        var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
        totalNonCheque += amt;
        newPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: (row.method || "Cash") + (row.note ? ": " + row.note : "") });
      }
    });
    var newPaid = (sale.paid || 0) + totalNonCheque;
    var newBal = sale.total - newPaid;
    var newStatus = newBal <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
    var updSale = Object.assign({}, sale, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: newPh });
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
    var nc = state.customers.map(function (c) { return res.ids.indexOf(c.id) >= 0 ? Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - totalNonCheque) }) : c; });
    var ns = state.sales.map(function (s) { return s.id === saleId ? updSale : s; });
    S.set("tc3_sales", ns); S.set("tc3_customers", nc); S.set("tc3_cheques", newCheques);
    setState(function (st) { return Object.assign({}, st, { sales: ns, customers: nc, cheques: newCheques }); });
    if (viewSale && viewSale.id === saleId) setViewSale(updSale);
    setSplitPayModal(null);
    addAudit("Payment " + getCurrencySymbol() + " " + fmtNum(totalAdded), sale.invoiceNo || saleId.slice(0, 8));
    toastAfterCustomerPaymentApplied(state.customers, res);
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
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Invoice / Quotation Tab Bar */}
      <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 12, padding: 5, border: "1.5px solid " + C.border, boxShadow: C.shadowCard, alignSelf: "flex-start" }}>
        {[["invoices", "🧾 Invoices"], ["quotations", "📋 Quotations"]].map(function (t) {
          var isA = siTab === t[0];
          return <button key={t[0]} onClick={function () { setSiTab(t[0]); }} style={{ background: isA ? "linear-gradient(135deg,#2979ff,#2255d4)" : "transparent", color: isA ? "#fff" : C.textMd, border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s", fontFamily: "inherit", boxShadow: isA ? "0 2px 8px rgba(41,121,255,0.28)" : "none" }}>{t[1]}</button>;
        })}
      </div>
      {siTab === "quotations" && <Quotations state={state} setState={setState} setActive={setActive} setSiTab={setSiTab} S={S} showAlert={showAlert} showConfirm={showConfirm} tcTrialGuard={tcTrialGuard} addAudit={addAudit} uid={uid} today={today} genInvNo={genInvNo} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} fmtSumQty={fmtSumQty} getInvoicePrintLabels={getInvoicePrintLabels} PRINT_FONT_LINK={PRINT_FONT_LINK} escapeHtml={escapeHtml} shareViaWhatsApp={shareViaWhatsApp} StatCard={StatCard} Card={Card} CardTitle={CardTitle} Btn={Btn} Modal={Modal} Input={Input} TH={TH} TR={TR} TD={TD} WABtn={WABtn} InvoiceA4={InvoiceA4} InvoiceThermal={InvoiceThermal} C={C} usePager={usePager} Pager={Pager} canEditInvoices={canEditInvoices} canDeleteInvoices={canDeleteInvoices} showPermissionDenied={showPermissionDenied} getDuplicateNormalizedNameKeys={getDuplicateNormalizedNameKeys} normalizePaymentCustomerName={normalizePaymentCustomerName} />}
      {siTab === "invoices" && <React.Fragment>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <StatCard money={false} label="Shown" value={filtered.length} accent={C.cyan} icon="🧾" sub="invoices" />
        <StatCard label="Total Value" value={totalShown} accent={C.blue} icon="💰" />
        <StatCard label="Collected" value={paidShown} accent={C.green} icon="✅" sub={totalShown > 0 ? Math.round(paidShown / totalShown * 100) + "% collected" : "—"} />
        <StatCard label="Outstanding" value={outstandingShown} accent={outstandingShown > 0 ? C.red : C.green} icon={outstandingShown > 0 ? "⏳" : "✓"} sub={outstandingShown > 0 ? "due" : "all clear"} />
      </div>

      <Card>
        <CardTitle sub="Search, view, print, and manage customer invoices" action={<Btn sm col="gray" onClick={function () { setSearch(""); setDateFrom(""); setDateTo(""); setFilterStatus("Active"); }}>Clear filters</Btn>}>Sales Invoices</CardTitle>
        <div style={{ background: "#f8fafc", border: "1px solid " + C.borderLight, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 2fr) repeat(3, minmax(120px, 1fr))", gap: 10, alignItems: "end" }}>
            <Input label="Search" value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Customer, invoice #, phone..." />
            <Input type="date" label="From" value={dateFrom} onChange={function (e) { setDateFrom(e.target.value); }} />
            <Input type="date" label="To" value={dateTo} onChange={function (e) { setDateTo(e.target.value); }} />
            <Sel label="Status" value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }}>
              <option>Active</option><option>Voided</option><option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
            </Sel>
          </div>
        </div>
        <div style={{ overflowX: "auto", border: "1px solid " + C.borderLight, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={Object.assign({}, invThStyle(), { width: "14%" })}>Invoice #</th>
                <th style={Object.assign({}, invThStyle(), { width: "7%" })}>Date</th>
                <th style={Object.assign({}, invThStyle(), { width: "11%" })}>Customer</th>
                <th style={Object.assign({}, invThStyle("center"), { width: "5%" })}>Items</th>
                <th style={Object.assign({}, invThStyle("right"), { width: "9%" })}>Total</th>
                <th style={Object.assign({}, invThStyle("right"), { width: "9%" })}>Paid</th>
                <th style={Object.assign({}, invThStyle(), { width: "10%" })}>Status</th>
                <th style={Object.assign({}, invThStyle("right"), { width: "12%" })}>Last payment</th>
                <th style={Object.assign({}, invThStyle("right"), { width: "23%", paddingRight: 14 })}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
                    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🧾</div>
                    No invoices match your filters
                  </td>
                </tr>
              )}
              {siPager.slice.map(function (s, i) {
                var bal = Math.max(0, s.total - (s.paid || 0));
                var lastPay = (s.paymentHistory || []).slice(-1)[0];
                var hasPendingChq = (state.cheques || []).some(function (ch) { return ch.saleId === s.id && ch.status === "Pending"; });
                var saleRet = saleReturnUiStatus(s, state.salesReturns);
                var saleStatusLabel = displayStatusForSale(s, state.salesReturns);
                var saleRowBg = isVoidedTxn(s) ? "#fff5f5" : saleRet.hasReturns ? "#fff7ed" : (i % 2 === 0 ? "#ffffff" : "#fafbff");
                var invNo = s.invoiceNo || s.id.slice(0, 8);
                return (
                  <tr key={s.id} className="table-row-hover" style={{ background: saleRowBg, borderBottom: "1px solid " + C.borderLight }} title={saleRet.hasReturns ? "This invoice has return activity" : undefined}>
                    <td style={{ padding: "10px 12px", maxWidth: 0 }}>
                      <button
                        type="button"
                        onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }}
                        title={invNo + " — View & print"}
                        style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.accent, fontWeight: 700, cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left", textDecoration: "none", lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", width: "100%" }}
                      >{invNo}</button>
                    </td>
                    <TD>{fmtDate(s.date)}</TD>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, fontSize: 13, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.customerName || s.customer || "Walk-in"}>
                      {s.customerName || s.customer || "Walk-in"}
                    </td>
                    <TD center>{(s.items || []).length}</TD>
                    {invMoneyTd(getCurrencySymbol() + " " + fmtNum(s.total), C.blue, true)}
                    {invMoneyTd(getCurrencySymbol() + " " + fmtNum(s.paid || 0), bal > 0 ? C.orange : C.green, false)}
                    <td style={{ padding: "10px 12px", overflow: "hidden", maxWidth: 0 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", minWidth: 0 }}>
                        <Badge status={saleStatusLabel} />
                        {hasPendingChq ? <span title="Pending cheque" style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>🕐</span> : null}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                      {lastPay ? (
                        <span>{fmtDate(lastPay.date)} · <strong style={{ color: C.text, fontWeight: 600 }}>{getCurrencySymbol()} {fmtNum(lastPay.amount)}</strong></span>
                      ) : "—"}
                    </td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup>
                        <ActBtn tone="cyan" title="View & print" onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }}>🧾</ActBtn>
                        {bal > 0 ? <ActBtn tone="green" title="Record payment" wide onClick={function () { setSplitPayModal(s); }}>Pay</ActBtn> : null}
                        {!isVoidedTxn(s) ? (
                          <ActBtn
                            tone="blue"
                            title="Edit invoice"
                            disabled={!canEditInvoices}
                            onClick={function () {
                              if (!saleInvoiceEditAllowed(s)) return;
                              if (!canEditInvoices) { showPermissionDenied("edit invoices"); return; }
                              setEditSale(Object.assign({}, s));
                            }}
                          >✎</ActBtn>
                        ) : null}
                        {!isVoidedTxn(s) ? <ActBtn tone="orange" title="Sales return" onClick={goSalesReturn}>↩</ActBtn> : null}
                        {!isVoidedTxn(s) && canDeleteInvoices ? <ActBtn tone="red" title="Void invoice" onClick={function () { promptVoidSale(s); }}>✕</ActBtn> : null}
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, padding: "12px 14px", borderTop: "1px solid " + C.borderLight, fontSize: 13, fontWeight: 600, background: "#f8fafc", borderRadius: "0 0 10px 10px", marginTop: -1, flexWrap: "wrap" }}>
            <span style={{ color: C.muted }}>Filtered total: <strong style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(totalShown)}</strong></span>
            <span style={{ color: C.muted }}>Collected: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(paidShown)}</strong></span>
            <span style={{ color: C.muted }}>Outstanding: <strong style={{ color: outstandingShown > 0 ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(outstandingShown)}</strong></span>
          </div>
        )}
        <Pager pager={siPager} />
      </Card>

      {/* ── Full Invoice View Modal ── */}
      {fullViewSale && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(10,15,30,0.82)",
          backdropFilter: "blur(6px)",
          display: "flex", flexDirection: "column",
          alignItems: "center",
          height: "100vh",
          overflow: "hidden",
        }}>
          {/* Top bar */}
          <div style={{
            width: "100%", background: C.navBg,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            padding: "10px 20px",
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            flexShrink: 0,
          }}>
            {/* Invoice # + customer */}
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: C.accent }}>
                {fullViewSale.invoiceNo || fullViewSale.id.slice(0, 8)}
              </span>
              <span style={{ color: "rgba(200,220,255,0.6)", fontSize: 12, marginLeft: 10 }}>
                {fullViewSale.customerName || "Walk-in"} · {fmtDate(fullViewSale.date)}
              </span>
            </div>

            {/* Format tabs */}
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              {(function () {
                var paperSize   = state.settings.invoiceDefaultSize  || "a4";
                var thermalSize = state.settings.invoiceThermalSize   || "thermal80";
                var opts = [
                  [paperSize,   paperSize   === "a5"        ? "📋 A5"           : "📄 A4"          ],
                  [thermalSize, thermalSize === "thermal58"  ? "🖨 58mm"         : "🖨 80mm"         ],
                ];
                return opts.map(function (item) {
                  var v = item[0]; var lbl = item[1];
                  var active = fvFormat === v;
                  return (
                    <button key={v} onClick={function () { setFvFormat(v); }}
                      style={{
                        padding: "5px 14px", borderRadius: 7,
                        border: "1.5px solid " + (active ? C.accent : "rgba(255,255,255,0.15)"),
                        background: active ? C.accentSoft : "transparent",
                        color: active ? C.accent : "rgba(200,220,255,0.7)",
                        fontSize: 12, fontWeight: active ? 800 : 600,
                        cursor: "pointer",
                      }}
                    >{active ? "✓ " : ""}{lbl}</button>
                  );
                });
              })()}
            </div>

            {/* Warranty toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "rgba(200,220,255,0.75)", fontWeight: 600, userSelect: "none" }}>
              <input type="checkbox" checked={fvWarranty} onChange={function (e) { setFvWarranty(e.target.checked); }}
                style={{ width: 14, height: 14, cursor: "pointer", accentColor: C.accent }} />
              Warranty
            </label>

            <div style={{ flex: 1 }} />

            {/* Print + WhatsApp buttons */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={function () { printInvoice(Object.assign({}, fullViewSale, { includeWarranty: fvWarranty }), fvFormat); }}
                style={{
                  padding: "7px 18px", borderRadius: 8,
                  background: "linear-gradient(135deg," + C.accent + ",#4f9eff)",
                  color: "#fff", border: "none",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                }}
              >🖨 Print</button>
              <WABtn title="Share as PDF via WhatsApp" onClick={function () { whatsappInvoice(Object.assign({}, fullViewSale, { includeWarranty: fvWarranty }), fvFormat); }} />
            </div>

            {/* Close button */}
            <button
              onClick={function () { setFullViewSale(null); }}
              style={{
                padding: "7px 16px", borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                color: "rgba(200,220,255,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >✕ Close</button>
          </div>

          {saleReturnUiStatus(fullViewSale, state.salesReturns).hasReturns ? (
            <div style={{ flexShrink: 0, padding: "8px 20px", background: "#fff7ed", borderBottom: "1px solid #fed7aa", fontSize: 12, color: "#9a3412", fontWeight: 600 }}>
              <span title="This invoice has return activity">↩ This invoice has sales return activity.</span>
            </div>
          ) : null}

          {/* Invoice document — scrollable area */}
          <div style={{
            flex: 1, overflow: "auto", width: "100%",
            minHeight: 0,
            padding: "28px 16px",
            background: "#e8ecf5",
          }}>
            <div id={"si-inv-preview-" + fullViewSale.id} style={{
              background: "#fff",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              borderRadius: (fvFormat === "thermal58" || fvFormat === "thermal80") ? 8 : 4,
              overflow: "visible",
              width: "fit-content",
              margin: "0 auto",
            }}>
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
              <Btn col="cyan" onClick={function () { setSplitPayModal(viewSale); }}>+ Record Payment</Btn>
            )}
            <Btn
              col="blue"
              disabled={!canEditInvoices}
              onClick={function () {
                if (!saleInvoiceEditAllowed(viewSale)) return;
                if (!canEditInvoices) { showPermissionDenied("edit invoices"); return; }
                setEditSale(Object.assign({}, viewSale));
                setViewSale(null);
              }}
            >Edit Invoice</Btn>
            <Btn col="orange" onClick={goSalesReturn}>Sales Return</Btn>
            {!isVoidedTxn(viewSale) && canDeleteInvoices ? (
              <Btn col="red" onClick={function () { promptVoidSale(viewSale); }}>Void Invoice</Btn>
            ) : null}
            <Btn col="gray" onClick={function () { setViewSale(null); }}>Close</Btn>
          </div>
        </Modal>
        );
      })()}

      {voidSaleTarget && (
        <Modal title={"Void Invoice — " + (voidSaleTarget.invoiceNo || voidSaleTarget.id.slice(0, 8))} onClose={function () { setVoidSaleTarget(null); setVoidReason(""); }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
            This will reverse stock, customer balance, and payments. The invoice stays on record as <strong>Voided</strong>. This cannot be undone.
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn col="red" disabled={!voidReason} onClick={function () { voidSaleInvoice(voidSaleTarget.id, voidReason); }}>Void Invoice</Btn>
            <Btn col="gray" onClick={function () { setVoidSaleTarget(null); setVoidReason(""); }}>Cancel</Btn>
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

      {editSale && (
        <Modal title={"Edit Invoice — " + (editSale.invoiceNo || editSale.id.slice(0, 8))} onClose={function () { setEditSale(null); }} wide>
          <div style={{ background: "#fef3e2", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
            Only invoice header details can be changed here. To adjust quantities, pricing, or stock, use <strong>Sales Return</strong> (sidebar → Returns).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 12 }}>
            <Input label="Invoice No" value={editSale.invoiceNo || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }} />
            <Input label="Date" type="date" value={editSale.date} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
            <Input label="Customer" value={editSale.customerName || editSale.customer || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { customerName: e.target.value }); }); }} />
            <Input label="Phone" value={editSale.customerPhone || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { customerPhone: e.target.value }); }); }} placeholder="Optional" />
          </div>
          <Input label="Note (internal)" value={editSale.saleNote || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { saleNote: e.target.value }); }); }} placeholder="Optional — stored on this invoice" />
          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Line items (read-only)</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>Product</TH><TH>Qty</TH><TH>Unit Price</TH><TH>Subtotal</TH></tr></thead>
              <tbody>
                {(editSale.items || []).map(function (it, idx) {
                  return (
                    <tr key={it.id || idx} style={{ borderBottom: "1px solid " + C.border }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600 }}>{it.name}</td>
                      <td style={{ padding: "7px 10px" }}>{fmtStock(it.qty, it.unit)}</td>
                      <td style={{ padding: "7px 10px" }}>{formatInvoiceLinePrice(it, fmtNum, getCurrencySymbol)}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: C.blue }}>{formatInvoiceLineTotal(it, fmtNum, getCurrencySymbol)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f7f9ff", padding: "12px 14px", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: C.muted }}>Sub: </span><strong>{getCurrencySymbol()} {fmtNum((editSale.items || []).reduce(function (a, it) { return a + it.qty * (it.price || 0); }, 0))}</strong>
              {(editSale.discount || 0) > 0 && <span style={{ color: C.orange, marginLeft: 12 }}>Disc: -{getCurrencySymbol()} {fmtNum(editSale.discount)}</span>}
              {state.settings && state.settings.taxEnabled && (editSale.totalTax || 0) > 0 && <span style={{ color: C.muted, marginLeft: 12 }}>Tax: {getCurrencySymbol()} {fmtNum(editSale.totalTax)}</span>}
            </div>
            <div style={{ fontWeight: 900, fontSize: 16, color: C.blue }}>Total: {getCurrencySymbol()} {fmtNum(editSale.total || 0)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn col="cyan" onClick={saveEdit} disabled={!canEditInvoices}>Save Changes</Btn>
            <Btn col="orange" onClick={goSalesReturn}>Open Sales Return</Btn>
            <Btn col="gray" onClick={function () { setEditSale(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
      </React.Fragment>}
    </div>
  );
});
var Invoices = SalesInvoices;
export default Invoices;
