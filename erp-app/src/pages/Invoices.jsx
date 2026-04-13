import React, { useState, useEffect } from "react";
import { computeSaleTax } from "../tax/taxCompute.js";

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

  var [qProdSearch, setQProdSearch] = useState("");
  var [qProdDrop, setQProdDrop] = useState(false);
  var [qProdIdx, setQProdIdx] = useState(-1);
  var [qQty, setQQty] = useState("1");
  var [qPrice, setQPrice] = useState("");
  var [custSearch, setCustSearch] = useState(fq.customer || "");
  var [custDrop, setCustDrop] = useState(false);

  var activeProds = (state.products || []).filter(function (p) { return p.status !== "inactive"; });
  var qMatchProds = activeProds.filter(function (p) {
    var s = qProdSearch.toLowerCase();
    return s && (p.name.toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s));
  }).slice(0, 8);

  var custMatches = (state.customers || []).filter(function (c) {
    var s = custSearch.toLowerCase();
    return s.length >= 1 && (c.name.toLowerCase().includes(s) || (c.phone || "").includes(s));
  }).slice(0, 6);

  var addItem = function () {
    var prod = qMatchProds[qProdIdx >= 0 ? qProdIdx : 0];
    if (!prod && qProdSearch.trim()) {
      prod = activeProds.find(function (p) { return p.barcode && p.barcode.toLowerCase() === qProdSearch.toLowerCase(); });
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

        {/* Customer with dropdown */}
        <div style={{ position: "relative" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Customer</label>
          <input
            value={custSearch}
            placeholder="Type customer name..."
            onChange={function (e) { setCustSearch(e.target.value); setFq(Object.assign({}, fq, { customer: e.target.value, customerPhone: "" })); setCustDrop(true); }}
            onFocus={function () { setCustDrop(true); }}
            onBlur={function () { setTimeout(function () { setCustDrop(false); }, 150); }}
            style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
          />
          {custDrop && custMatches.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 9, boxShadow: C.shadow, zIndex: 300, maxHeight: 200, overflowY: "auto", marginTop: 3 }}>
              {custMatches.map(function (c) {
                return (
                  <div key={c.id} onMouseDown={function () {
                    setCustSearch(c.name);
                    setFq(Object.assign({}, fq, { customer: c.name, customerId: c.id, customerPhone: c.phone || "" }));
                    setCustDrop(false);
                  }} style={{ padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid " + C.borderLight }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{c.phone || "—"} &nbsp;·&nbsp; Credit: {getCurrencySymbol()} {fmtNum(c.credit || 0)}</div>
                  </div>
                );
              })}
            </div>
          )}
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
              placeholder="Search product name or barcode..."
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
  var getAllowedInvoiceLangCodes = props.getAllowedInvoiceLangCodes;
  var INVOICE_LANG_NAMES = props.INVOICE_LANG_NAMES;
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
  var C = props.C;
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
  var [quotPrintLang, setQuotPrintLang] = useState(function () { return state.settings.defaultInvoiceLang || "en"; });
  useEffect(function () {
    var allowed = getAllowedInvoiceLangCodes(state.settings);
    var d = state.settings.defaultInvoiceLang || "en";
    setQuotPrintLang(function (c) { return allowed.indexOf(c) >= 0 ? c : d; });
  }, [state.settings]);
  useEffect(function () {
    if (viewQ) setQuotPrintLang(state.settings.defaultInvoiceLang || "en");
  }, [viewQ ? viewQ.id : null, state.settings.defaultInvoiceLang]);

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

  var filteredQ = quotations.slice().reverse().filter(function (q) {
    var sq = search.toLowerCase();
    var matchQ = !sq || (q.customer || "").toLowerCase().includes(sq) || (q.quotationNo || "").toLowerCase().includes(sq);
    var matchS = filterStatus === "All" || q.status === filterStatus;
    return matchQ && matchS;
  });

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

  var printQuotation = function (q, lang) {
    var st = state.settings || {};
    var L = getInvoicePrintLabels(lang || st.defaultInvoiceLang || "en");
    var items = q.items || [];
    var lineSub = formTotal(items);
    var total = quotationGrand(q);
    var qShowTax = (q.totalTax || 0) > 0 && (q.selectedTaxes || []).length > 0;
    var w = window.open("", "_blank", "width=900,height=700");
    var css = "body{font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12px;color:#111;padding:20px;max-width:800px;margin:0 auto;} table{width:100%;border-collapse:collapse;margin-bottom:14px;} th{background:#0d47a1;color:#fff;padding:8px 10px;text-align:left;font-size:11px;} td{padding:7px 10px;border-bottom:1px solid #e8edf8;} .tot{font-weight:800;background:#e8eeff;} .hdr{display:flex;justify-content:space-between;margin-bottom:20px;} .shop{font-size:20px;font-weight:800;color:#0d47a1;} .badge{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:700;background:#e8eeff;color:#1a47c2;border:1px solid #a8bcf0;} .to{background:#f7f9ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;} @media print{@page{size:A4;margin:12mm;}}";
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + escapeHtml(L.quotationTitle) + " " + escapeHtml(q.quotationNo) + "</title><style>" + css + "</style></head><body>");
    w.document.write("<div class='hdr'><div><div class='shop'>" + escapeHtml(st.shopName || "Techon Computers") + "</div><div style='font-size:11px;color:#555;margin-top:2px;'>" + escapeHtml(st.address || "") + "</div><div style='font-size:11px;color:#555;'>" + escapeHtml(st.phone || "") + "</div></div>");
    w.document.write("<div style='text-align:right;'><div style='font-size:22px;font-weight:800;color:#0d47a1;letter-spacing:-1px;'>" + escapeHtml(L.quotationTitle) + "</div><div style='font-size:13px;margin-top:4px;'>" + escapeHtml(L.quotationNoLabel) + " <strong>" + escapeHtml(q.quotationNo || "") + "</strong></div><div style='font-size:12px;color:#555;'>" + escapeHtml(L.quotationDateLabel) + " " + escapeHtml(q.date || "") + "</div><div style='margin-top:5px;'><span class='badge'>" + escapeHtml(q.status || "Draft") + "</span></div></div></div>");
    w.document.write("<div class='to'><strong>" + escapeHtml(L.quotationTo) + "</strong> " + escapeHtml(q.customer || L.walkInCustomer) + (q.customerPhone ? " &nbsp;|&nbsp; ☎ " + escapeHtml(q.customerPhone) : "") + "</div>");
    w.document.write("<table><thead><tr><th>" + escapeHtml(L.tableIndex) + "</th><th>" + escapeHtml(L.productDescription) + "</th><th style='text-align:center;'>" + escapeHtml(L.qty) + "</th><th style='text-align:right;'>" + escapeHtml(L.unitPrice) + "</th><th style='text-align:right;'>" + escapeHtml(L.amount) + "</th></tr></thead><tbody>");
    items.forEach(function (it, i) { w.document.write("<tr><td style='color:#888;'>" + (i + 1) + "</td><td><strong>" + escapeHtml(it.name || "") + "</strong></td><td style='text-align:center;'>" + fmtSumQty(it.qty) + "</td><td style='text-align:right;'>" + getCurrencySymbol() + " " + fmtNum(it.price || 0) + "</td><td style='text-align:right;font-weight:700;'>" + getCurrencySymbol() + " " + fmtNum((it.qty || 0) * (it.price || 0)) + "</td></tr>"); });
    w.document.write("<tr><td colspan='4' style='text-align:right;font-size:12px;color:#555;'>Sub Total</td><td style='text-align:right;font-weight:600;'>" + getCurrencySymbol() + " " + fmtNum(lineSub) + "</td></tr>");
    if (qShowTax) {
      (q.selectedTaxes || []).forEach(function (tl) {
        w.document.write("<tr><td colspan='4' style='text-align:right;font-size:12px;color:#555;'>" + escapeHtml(tl.name || "") + " (" + fmtNum(tl.rate) + "%)</td><td style='text-align:right;'>" + getCurrencySymbol() + " " + fmtNum(tl.amount || 0) + "</td></tr>");
      });
      w.document.write("<tr><td colspan='4' style='text-align:right;font-size:12px;color:#555;'>Total Tax</td><td style='text-align:right;font-weight:600;'>" + getCurrencySymbol() + " " + fmtNum(q.totalTax || 0) + "</td></tr>");
    }
    w.document.write("<tr class='tot'><td colspan='4' style='text-align:right;font-size:13px;'>" + escapeHtml(L.total) + "</td><td style='text-align:right;font-size:16px;color:#0d47a1;'>" + getCurrencySymbol() + " " + fmtNum(total) + "</td></tr></tbody></table>");
    if (q.notes) w.document.write("<div style='margin-top:10px;padding:10px 14px;background:#f7f9ff;border-radius:8px;font-size:12px;border-left:3px solid #2979ff;'><strong>" + escapeHtml(L.notesTerms) + "</strong><br>" + escapeHtml(q.notes) + "</div>");
    w.document.write("<div style='margin-top:30px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;'>" + escapeHtml(L.quotationFooter) + "</div>");
    w.document.write("</body></html>");
    w.document.close();
    setTimeout(function () { w.print(); }, 600);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard label="Total Quotations" money={false} value={quotations.length} accent={C.blue} icon="📋" sub={quotations.filter(function (q) { return q.status === "Draft"; }).length + " drafts"} />
        <StatCard label="Converted" money={false} value={quotations.filter(function (q) { return q.status === "Converted"; }).length} accent={C.green} icon="✅" sub="to invoices" />
        <StatCard label="Pending (Sent)" money={false} value={quotations.filter(function (q) { return q.status === "Sent"; }).length} accent={C.orange} icon="📤" sub="awaiting response" />
        <StatCard label="Pipeline Value" value={quotations.filter(function (q) { return q.status !== "Converted" && q.status !== "Expired"; }).reduce(function (a, q) { return a + quotationGrand(q); }, 0)} accent={C.purple} icon="💰" sub="unconverted value" />
      </div>

      <Card>
        <CardTitle sub={filteredQ.length + " quotations"} action={<Btn sm col="blue" onClick={function () { setF(Object.assign({}, BLANK_Q, { quotationNo: genInvNo("QT") })); setShow(true); }}>+ New Quotation</Btn>}>Quotations</CardTitle>
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
              {filteredQ.map(function (q, i) {
                return (
                  <TR key={q.id} i={i} onClick={function () { setViewQ(q); }}>
                    <TD bold><span style={{ color: C.blue, fontFamily: "monospace" }}>{q.quotationNo || q.id.slice(0, 8)}</span></TD>
                    <TD>{q.customer || "Walk-in"}</TD>
                    <TD color={C.muted}>{q.date}</TD>
                    <TD center color={C.muted}>{(q.items || []).length}</TD>
                    <TD bold>{getCurrencySymbol()} {fmtNum(quotationGrand(q))}</TD>
                    <TD><span style={{ fontWeight: 700, fontSize: 12, color: STATUS_COLORS[q.status] || C.textMd }}>{q.status}</span></TD>
                    <td style={{ padding: "6px 10px" }} onClick={function (e) { e.stopPropagation(); }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn sm col="gray" onClick={function () { setViewQ(q); }}>View</Btn>
                        {q.status !== "Converted" && <Btn sm col="blue" onClick={function () { setEditQ(q); }}>Edit</Btn>}
                        {q.status !== "Converted" && <Btn sm col="green" onClick={function () { convertToSale(q); }}>→ Invoice</Btn>}
                        <Btn sm col="red" onClick={function () { deleteQ(q.id); }}>✕</Btn>
                      </div>
                    </td>
                  </TR>
                );
              })}
              {filteredQ.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: C.muted }}>No quotations yet. Click &quot;+ New Quotation&quot; to create one.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Quotation Modal */}
      {show && (
        <Modal title="New Quotation" onClose={function () { setShow(false); }} wide>
          <QuotationForm fq={f} setFq={setF} onSave={saveNew} title="💾 Save Quotation" state={state} showAlert={showAlert} C={C} Input={Input} TH={TH} TR={TR} TD={TD} Btn={Btn} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} today={today} />
        </Modal>
      )}

      {/* Edit Quotation Modal */}
      {editQ && (
        <Modal title={"Edit — " + (editQ.quotationNo || "")} onClose={function () { setEditQ(null); }} wide>
          <QuotationForm fq={editQ} setFq={setEditQ} onSave={saveEdit} title="💾 Update Quotation" state={state} showAlert={showAlert} C={C} Input={Input} TH={TH} TR={TR} TD={TD} Btn={Btn} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} today={today} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Language</span>
              <select value={quotPrintLang} onChange={function (e) { setQuotPrintLang(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, background: "#fff", color: C.text, cursor: "pointer" }}>
                {getAllowedInvoiceLangCodes(state.settings).map(function (k) {
                  return <option key={k} value={k}>{INVOICE_LANG_NAMES[k] || k}</option>;
                })}
              </select>
            </div>
            <Btn col="gray" onClick={function () { printQuotation(viewQ, quotPrintLang); }}>🖨 Print</Btn>
            <WABtn title="Share Quotation via WhatsApp" onClick={function () { shareAnyReport(function () { printQuotation(viewQ, quotPrintLang); }, "Quotation-" + (viewQ.quotationNo || viewQ.id.slice(0, 8))); }} />
            {viewQ.status !== "Converted" && (
              <React.Fragment>
                {["Draft","Sent","Expired"].filter(function (s) { return s !== viewQ.status; }).map(function (s) {
                  return <Btn key={s} sm col="gray" onClick={function () { updateStatus(viewQ.id, s); }}>Mark {s}</Btn>;
                })}
                <Btn col="blue" onClick={function () { setViewQ(null); setEditQ(viewQ); }}>✏ Edit</Btn>
                <Btn col="green" onClick={function () { convertToSale(viewQ); }}>→ Convert to Invoice</Btn>
              </React.Fragment>
            )}
            <Btn col="red" onClick={function () { deleteQ(viewQ.id); setViewQ(null); }}>🗑 Delete</Btn>
          </div>
        </Modal>
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
  var getAllowedInvoiceLangCodes = props.getAllowedInvoiceLangCodes;
  var INVOICE_LANG_NAMES = props.INVOICE_LANG_NAMES;
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
  var [siTab, setSiTab] = useState("invoices");
  var [search, setSearch] = useState("");
  var [dateFrom, setDateFrom] = useState("");
  var [dateTo, setDateTo] = useState("");
  var [filterStatus, setFilterStatus] = useState("All");
  var [viewSale, setViewSale] = useState(null);
  var [editSale, setEditSale] = useState(null);
  var [payModal, setPayModal] = useState(null);
  var [splitPayModal, setSplitPayModal] = useState(null);
  var [payNote, setPayNote] = useState("");
  var [payMode, setPayMode] = useState("Cash");
  var [siFormat, setSiFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [siWarranty, setSiWarranty] = useState(false);
  var [fullViewSale, setFullViewSale] = useState(null);
  var [fvFormat, setFvFormat] = useState(function () { return state.settings.invoiceDefaultSize || "a4"; });
  var [fvWarranty, setFvWarranty] = useState(false);
  var [siInvoiceLang, setSiInvoiceLang] = useState(function () { return state.settings.defaultInvoiceLang || "en"; });
  var [fvInvoiceLang, setFvInvoiceLang] = useState(function () { return state.settings.defaultInvoiceLang || "en"; });
  useEffect(function () {
    var allowed = getAllowedInvoiceLangCodes(state.settings);
    var d = state.settings.defaultInvoiceLang || "en";
    setSiInvoiceLang(function (c) { return allowed.indexOf(c) >= 0 ? c : d; });
    setFvInvoiceLang(function (c) { return allowed.indexOf(c) >= 0 ? c : d; });
  }, [state.settings]);
  useEffect(function () {
    if (!viewSale) return;
    setSiInvoiceLang(state.settings.defaultInvoiceLang || "en");
  }, [viewSale ? viewSale.id : null, state.settings.defaultInvoiceLang]);
  useEffect(function () {
    if (!fullViewSale) return;
    setFvInvoiceLang(state.settings.defaultInvoiceLang || "en");
  }, [fullViewSale ? fullViewSale.id : null, state.settings.defaultInvoiceLang]);

  var filtered = state.sales.slice().reverse().filter(function (s) {
    var q = search.toLowerCase();
    var matchQ = !q || (s.customerName || s.customer || "").toLowerCase().includes(q) || (s.invoiceNo || "").toLowerCase().includes(q) || (s.customerPhone || "").includes(q);
    var matchFrom = !dateFrom || s.date >= dateFrom;
    var matchTo = !dateTo || s.date <= dateTo;
    var matchStatus = filterStatus === "All" || s.payStatus === filterStatus;
    return matchQ && matchFrom && matchTo && matchStatus;
  });

  var siPager = usePager(filtered, 50);
  var totalShown = filtered.reduce(function (a, s) { return a + s.total; }, 0);
  var paidShown = filtered.reduce(function (a, s) { return a + (s.paid || 0); }, 0);
  var outstandingShown = totalShown - paidShown;

  /* FIX 3 (Gemini): Paid invoices should be Voided rather than deleted to preserve cash audit trail.
     Deletion removes paymentHistory and makes the cash that was collected disappear from accounts. */
  var deleteSale = function (id) {
    var orig = state.sales.find(function (s) { return s.id === id; });
    if (!orig) return;
    var hasCashMoved = (orig.paid || 0) > 0;
    var confirmMsg = hasCashMoved
      ? "⚠ This invoice has " + getCurrencySymbol() + " " + fmtNum(orig.paid) + " recorded as paid.\n\nDeleting it will ERASE that cash record from your accounts (audit risk).\n\nAre you sure you want to permanently delete it? Consider editing it to Rs 0 instead."
      : "Delete this invoice? Stock will be restored.";
    showConfirm(confirmMsg, function () {
      var np = state.products.map(function (p) {
        var ci = (orig.items || []).find(function (it) { return it.id === p.id; });
        return ci ? Object.assign({}, p, { stock: p.stock + (ci.qty || 0) }) : p;
      });
      var nc = state.customers.map(function (c) {
        if (c.id === orig.customerId) { return Object.assign({}, c, { credit: Math.max(0, (c.credit || 0) - (orig.balance || 0)), totalSpent: Math.max(0, (c.totalSpent || 0) - orig.total) }); }
        return c;
      });
      var ns = state.sales.filter(function (s) { return s.id !== id; });
      /* FIX Bug 2: Cancel any pending cheques linked to this sale so they don't orphan.
         Cleared cheques stay as audit trail; only Pending ones are voided. */
      var nch = (state.cheques || []).map(function (ch) {
        if (ch.saleId === id && ch.status === "Pending") {
          return Object.assign({}, ch, { status: "Voided", voidedDate: today(), voidReason: "Linked sale deleted" });
        }
        return ch;
      });
      S.set("tc3_products", np); S.set("tc3_customers", nc); S.set("tc3_sales", ns); S.set("tc3_cheques", nch);
      setState(function (st) { return Object.assign({}, st, { products: np, customers: nc, sales: ns, cheques: nch }); });
      if (viewSale && viewSale.id === id) setViewSale(null);
    });
  };

  var saveEdit = function () {
    if (!editSale) return;
    var orig = state.sales.find(function (s) { return s.id === editSale.id; });
    var editSaleAmtErr = validateTxnAmounts("Edited sale invoice", editSale.total || 0, editSale.paid || 0, editSale.balance || 0);
    if (editSaleAmtErr) { showAlert("❌ " + editSaleAmtErr); return; }
    /* Period close warning */
    checkPeriodClose(orig ? orig.date : null, state.settings, function () {
    // Simulate restored stock (as if original sale was reversed) then check new quantities
    var available = {};
    state.products.forEach(function (p) { available[p.id] = p.stock || 0; });
    if (orig) { (orig.items || []).forEach(function (oi) { if (available[oi.id] !== undefined) available[oi.id] += (oi.qty || 0); }); }
    var stockErr = null;
    (editSale.items || []).forEach(function (ni) {
      if (stockErr) return;
      if (available[ni.id] !== undefined && ni.qty > available[ni.id]) {
        var prod = state.products.find(function (p) { return p.id === ni.id; });
        stockErr = "Not enough stock for \"" + (prod ? prod.name : ni.id) + "\". Available: " + available[ni.id] + ", requested: " + ni.qty + ".";
      }
    });
    if (stockErr) { showAlert(stockErr); return; }
    var np = state.products.slice();
    if (orig) {
      (orig.items || []).forEach(function (oi) {
        np = np.map(function (p) { return p.id === oi.id ? Object.assign({}, p, { stock: p.stock + (oi.qty || 0) }) : p; });
      });
    }
    (editSale.items || []).forEach(function (ni) {
      np = np.map(function (p) { return p.id === ni.id ? Object.assign({}, p, { stock: p.stock - (ni.qty || 0) }) : p; });
    });
    var nc = state.customers.map(function (c) {
      if (c.id === editSale.customerId) {
        var oldBal = orig ? (orig.balance || 0) : 0;
        var newBal = editSale.balance || 0;
        var oldTot = orig ? (orig.total || 0) : 0;
        var newTot = editSale.total || 0;
        return Object.assign({}, c, {
          credit: Math.max(0, (c.credit || 0) - oldBal + newBal),
          totalSpent: Math.max(0, (c.totalSpent || 0) - oldTot + newTot)
        });
      }
      return c;
    });
    var ns = state.sales.map(function (s) { return s.id === editSale.id ? editSale : s; });
    S.set("tc3_products", np); S.set("tc3_customers", nc); S.set("tc3_sales", ns);
    addAudit("Edited Sale Invoice", editSale.invoiceNo || editSale.id.slice(0, 8));
    setState(function (st) { return Object.assign({}, st, { products: np, customers: nc, sales: ns }); });
    setEditSale(null);
    }); /* end checkPeriodClose */
  };

  var recomputeEditSaleTaxAndBalance = function (draft) {
    var newSub = (draft.items || []).reduce(function (a, it) { return a + it.qty * (it.price || 0); }, 0);
    var disc = Math.min(draft.discount || 0, newSub);
    var net = Math.max(0, newSub - disc);
    var tc = computeSaleTax(state.settings, net);
    var finalTotal = tc.grandTotal;
    var paid = draft.paid || 0;
    var safePaid = Math.min(paid, finalTotal);
    var status = safePaid >= finalTotal ? "Paid" : safePaid > 0 ? "Partial" : "Unpaid";
    var taxLinesStore = (tc.selectedTaxes || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; });
    var ph = (draft.paymentHistory || []).slice();
    var diff = safePaid - paid;
    if (diff < 0) {
      var totalCash = 0; var totalBank = 0;
      ph.forEach(function (e) {
        if (!e.cashMethod || e.cashMethod === "Cheque" || (e.amount || 0) === 0) return;
        if (e.cashMethod === "Bank") totalBank += e.amount;
        else totalCash += e.amount;
      });
      var totalReal = totalCash + totalBank;
      if (totalReal <= 0) {
        ph = ph.concat([{ id: uid(), date: today(), amount: diff, cashMethod: "Cash", note: "Correction — invoice total reduced (edit)" }]);
      } else if (totalBank <= 0) {
        ph = ph.concat([{ id: uid(), date: today(), amount: diff, cashMethod: "Cash", note: "Correction — invoice total reduced (edit)" }]);
      } else if (totalCash <= 0) {
        ph = ph.concat([{ id: uid(), date: today(), amount: diff, cashMethod: "Bank", note: "Correction — invoice total reduced (edit)" }]);
      } else {
        var cashCorr = Math.round(diff * (totalCash / totalReal) * 100) / 100;
        var bankCorr = Math.round((diff - cashCorr) * 100) / 100;
        if (cashCorr !== 0) ph = ph.concat([{ id: uid(), date: today(), amount: cashCorr, cashMethod: "Cash", note: "Correction — invoice total reduced (edit)" }]);
        if (bankCorr !== 0) ph = ph.concat([{ id: uid(), date: today(), amount: bankCorr, cashMethod: "Bank", note: "Correction — invoice total reduced (edit)" }]);
      }
    }
    var taxPatch = {};
    if (state.settings && state.settings.taxEnabled) {
      taxPatch.taxMode = tc.taxMode || "exclusive";
      taxPatch.totalTax = tc.totalTax || 0;
      taxPatch.selectedTaxes = taxLinesStore;
    } else {
      taxPatch.taxMode = undefined;
      taxPatch.totalTax = 0;
      taxPatch.selectedTaxes = [];
    }
    return Object.assign({}, draft, taxPatch, { total: finalTotal, subTotal: newSub, discount: disc, payStatus: status, balance: finalTotal - safePaid, paid: safePaid, paymentHistory: ph });
  };

  var recalcTotal = function () {
    if (!editSale) return;
    setEditSale(function (x) { return recomputeEditSaleTaxAndBalance(x); });
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
      {siTab === "quotations" && <Quotations state={state} setState={setState} setActive={setActive} setSiTab={setSiTab} S={S} showAlert={showAlert} showConfirm={showConfirm} tcTrialGuard={tcTrialGuard} addAudit={addAudit} uid={uid} today={today} genInvNo={genInvNo} getCurrencySymbol={getCurrencySymbol} fmtNum={fmtNum} fmtStock={fmtStock} fmtSumQty={fmtSumQty} getInvoicePrintLabels={getInvoicePrintLabels} PRINT_FONT_LINK={PRINT_FONT_LINK} escapeHtml={escapeHtml} shareViaWhatsApp={shareViaWhatsApp} getAllowedInvoiceLangCodes={getAllowedInvoiceLangCodes} INVOICE_LANG_NAMES={INVOICE_LANG_NAMES} StatCard={StatCard} Card={Card} CardTitle={CardTitle} Btn={Btn} Modal={Modal} Input={Input} TH={TH} TR={TR} TD={TD} WABtn={WABtn} C={C} />}
      {siTab === "invoices" && <React.Fragment>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard money={false} label="Invoices" value={filtered.length} accent={C.cyan} icon="🧾" sub="shown" />
        <StatCard label="Total Value" value={totalShown} accent={C.blue} icon="💰" />
        <StatCard label="Collected" value={paidShown} accent={C.green} icon="✅" sub={totalShown > 0 ? Math.round(paidShown / totalShown * 100) + "% rate" : "—"} />
        <StatCard label="Outstanding" value={outstandingShown} accent={outstandingShown > 0 ? C.red : C.green} icon="⚠" />
      </div>

      <Card>
        <CardTitle sub={filtered.length.toLocaleString() + " invoices — Total " + getCurrencySymbol() + " " + fmtNum(totalShown)} action={<Btn sm col="gray" onClick={function () { setSearch(""); setDateFrom(""); setDateTo(""); setFilterStatus("All"); }}>Clear Filters</Btn>}>Sales Invoices</CardTitle>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "2 1 200px", minWidth: 200 }}><Input label="Search" value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Customer, invoice #, phone..." /></div>
          <div style={{ flex: "1 1 140px", minWidth: 140 }}><Input type="date" label="From" value={dateFrom} onChange={function (e) { setDateFrom(e.target.value); }} /></div>
          <div style={{ flex: "1 1 140px", minWidth: 140 }}><Input type="date" label="To" value={dateTo} onChange={function (e) { setDateTo(e.target.value); }} /></div>
          <div style={{ flex: "1 1 130px", minWidth: 130 }}>
            <Sel label="Status" value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }}>
              <option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
            </Sel>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Invoice #</TH><TH>Date</TH><TH>Customer</TH><TH>Items</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH><TH>Last Payment</TH><th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "2px solid " + C.border, whiteSpace: "nowrap", background: "#f7f9ff" }}>Actions</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} style={{ padding: 20, textAlign: "center", color: C.muted }}>No invoices found</td></tr>}
              {siPager.slice.map(function (s, i) {
                var bal = Math.max(0, s.total - (s.paid || 0));
                var lastPay = (s.paymentHistory || []).slice(-1)[0];
                var hasPendingChq = (state.cheques || []).some(function (ch) { return ch.saleId === s.id && ch.status === "Pending"; });
                return (
                  <TR key={s.id} i={i}>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }}
                        title="Click to view invoice"
                        style={{ fontFamily: "monospace", fontSize: 12, color: C.accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
                      >{s.invoiceNo || s.id.slice(0, 8)}</span>
                    </td>
                    <TD>{fmtDate(s.date)}</TD>
                    <TD bold>{s.customerName || s.customer || "Walk-in"}</TD>
                    <TD center>{(s.items || []).length}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(s.total)}</TD>
                    <TD color={C.green}>{getCurrencySymbol()} {fmtNum(s.paid || 0)}</TD>
                    <td style={{ padding: "10px 14px" }}>
                      {bal > 0
                        ? <span style={{ background: C.dangerSoft, color: C.red, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>{getCurrencySymbol()} {fmtNum(bal)}</span>
                        : <span style={{ background: C.successSoft, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>Settled</span>
                      }
                    </td>
                    <td style={{ padding: "10px 14px" }}><Badge status={s.payStatus || "Paid"} /></td>
                    <TD>{lastPay ? fmtDate(lastPay.date) + " · " + getCurrencySymbol() + " " + fmtNum(lastPay.amount) : "—"}</TD>
                    <td style={{ padding: "8px 10px", verticalAlign: "middle", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 6,
                          flexWrap: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            flex: "0 0 22px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                          title={hasPendingChq ? "Has pending cheque(s)" : undefined}
                        >
                          {hasPendingChq ? "🕐" : ""}
                        </span>
                        <Btn sm col="cyan" onClick={function () { setFullViewSale(s); setFvFormat(state.settings.invoiceDefaultSize || "a4"); setFvWarranty(s.includeWarranty || false); }}>🧾</Btn>
                        <Btn sm col="gray" onClick={function () { setViewSale(s); setSiWarranty(s.includeWarranty || false); }}>Details</Btn>
                        <Btn sm col="blue" onClick={function () { setEditSale(Object.assign({}, s)); }}>Edit</Btn>
                        <div style={{ flex: "0 0 66px", width: 66, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 28 }}>
                          {bal > 0 ? <Btn sm col="cyan" onClick={function () { setSplitPayModal(s); }}>Pay</Btn> : null}
                        </div>
                        <Btn sm col="red" onClick={function () { deleteSale(s.id); }}>Del</Btn>
                      </div>
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "10px 14px", borderTop: "2px solid " + C.border, fontSize: 13, fontWeight: 700, background: "#f7f9ff" }}>
          <span>Total: <span style={{ color: C.blue }}>{getCurrencySymbol()} {fmtNum(totalShown)}</span></span>
          <span>Paid: <span style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(paidShown)}</span></span>
          <span>Outstanding: <span style={{ color: outstandingShown > 0 ? C.red : C.green }}>{getCurrencySymbol()} {fmtNum(outstandingShown)}</span></span>
        </div>
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

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(200,220,255,0.75)", textTransform: "uppercase" }}>Language</span>
              <select value={fvInvoiceLang} onChange={function (e) { setFvInvoiceLang(e.target.value); }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "#fff", cursor: "pointer" }}>
                {getAllowedInvoiceLangCodes(state.settings).map(function (k) {
                  return <option key={k} value={k} style={{ color: "#111" }}>{INVOICE_LANG_NAMES[k] || k}</option>;
                })}
              </select>
            </div>

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
                    invoiceLang={fvInvoiceLang}
                    width={fvFormat === "thermal58" ? 218 : 302}
                  />
                : <InvoiceA4
                    inv={Object.assign({}, fullViewSale, { includeWarranty: fvWarranty })}
                    settings={state.settings}
                    invoiceLang={fvInvoiceLang}
                    size={fvFormat}
                  />
              }
            </div>
          </div>
        </div>
      )}

      {viewSale && (
        <Modal title={"Invoice — " + (viewSale.invoiceNo || viewSale.id.slice(0, 8))} onClose={function () { setViewSale(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Customer</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{viewSale.customerName || "Walk-in"}</div>
              <div style={{ color: C.muted, marginTop: 3, fontSize: 13 }}>{viewSale.customerPhone || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{fmtDateFull(viewSale.date)}</div>
            </div>
            <PaymentBreakdown invoice={viewSale} cheques={state.cheques || []} isSale={true} />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead><tr><TH>#</TH><TH>Item</TH><TH>Qty</TH><TH>Unit Price</TH><TH>Total</TH></tr></thead>
            <tbody>
              {(viewSale.items || []).map(function (it, i) {
                return <TR key={i} i={i}><TD color={C.muted}>{i + 1}</TD><TD bold>{it.name || "Unknown Product"}</TD><TD center>{fmtStock(it.qty, it.unit)}</TD><TD>{getCurrencySymbol()} {fmtNum(it.price)}</TD><TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(it.qty * it.price)}</TD></TR>;
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
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Language</span>
                <select value={siInvoiceLang} onChange={function (e) { setSiInvoiceLang(e.target.value); }} style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, background: "#fff", color: C.text, cursor: "pointer" }}>
                  {getAllowedInvoiceLangCodes(state.settings).map(function (k) {
                    return <option key={k} value={k}>{INVOICE_LANG_NAMES[k] || k}</option>;
                  })}
                </select>
              </div>
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
                ? <InvoiceThermal inv={Object.assign({}, viewSale, { includeWarranty: siWarranty })} settings={state.settings} invoiceLang={siInvoiceLang} width={siFormat === "thermal58" ? 218 : 302} />
                : <InvoiceA4 inv={Object.assign({}, viewSale, { includeWarranty: siWarranty })} settings={state.settings} invoiceLang={siInvoiceLang} size={siFormat} />
              }
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Math.max(0, viewSale.total - (viewSale.paid || 0)) > 0 && (
              <Btn col="cyan" onClick={function () { setSplitPayModal(viewSale); }}>+ Record Payment</Btn>
            )}
            <Btn col="blue" onClick={function () { setEditSale(Object.assign({}, viewSale)); setViewSale(null); }}>Edit Invoice</Btn>
            <Btn col="red" onClick={function () { deleteSale(viewSale.id); }}>Delete</Btn>
            <Btn col="gray" onClick={function () { setViewSale(null); }}>Close</Btn>
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
          <div style={{ background: C.successSoft, border: "1px solid #9ee8ce", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: C.green }}>Smart edit: stock and customer balance will be auto-recalculated on save.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 12 }}>
            <Input label="Invoice No" value={editSale.invoiceNo || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }} />
            <Input label="Date" type="date" value={editSale.date} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} />
            <Input label="Customer" value={editSale.customerName || editSale.customer || ""} onChange={function (e) { setEditSale(function (x) { return Object.assign({}, x, { customerName: e.target.value }); }); }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 12 }}>
            <Input label="Paid Amount" type="number" value={editSale.paid || 0} onChange={function (e) {
              var newPaid = parseFloat(e.target.value) || 0;
              setEditSale(function (x) {
                var orig = state.sales.find(function (s) { return s.id === x.id; });
                var origPaid = orig ? (orig.paid || 0) : 0;
                var diff = Math.round((newPaid - origPaid) * 100) / 100;
                /* Rebuild paymentHistory to reflect the new total paid amount.
                   Keep existing entries, add/adjust a correction entry so the
                   total matches the new paid amount — cash balance stays correct. */
                var existingPh = (orig ? (orig.paymentHistory || []) : (x.paymentHistory || [])).slice();
                if (diff !== 0) {
                  /* Distribute adjustment proportionally across Cash and Bank */
                  var adjCash = 0; var adjBank = 0;
                  existingPh.forEach(function (e) {
                    if (!e.cashMethod || e.cashMethod === "Cheque" || (e.amount || 0) === 0) return;
                    if (e.cashMethod === "Bank") adjBank += e.amount;
                    else adjCash += e.amount;
                  });
                  var adjTotal = adjCash + adjBank;
                  if (adjTotal <= 0 || adjBank <= 0) {
                    existingPh = existingPh.concat([{ id: uid(), date: today(), amount: diff, cashMethod: adjBank > 0 ? "Bank" : "Cash", note: "Manual adjustment (edit)" }]);
                  } else if (adjCash <= 0) {
                    existingPh = existingPh.concat([{ id: uid(), date: today(), amount: diff, cashMethod: "Bank", note: "Manual adjustment (edit)" }]);
                  } else {
                    var cCorr = Math.round(diff * (adjCash / adjTotal) * 100) / 100;
                    var bCorr = Math.round((diff - cCorr) * 100) / 100;
                    if (cCorr !== 0) existingPh = existingPh.concat([{ id: uid(), date: today(), amount: cCorr, cashMethod: "Cash", note: "Manual adjustment (edit)" }]);
                    if (bCorr !== 0) existingPh = existingPh.concat([{ id: uid(), date: today(), amount: bCorr, cashMethod: "Bank", note: "Manual adjustment (edit)" }]);
                  }
                }
                var newBal = Math.max(0, (x.total || 0) - newPaid);
                var newStatus = newPaid >= (x.total || 0) ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
                return Object.assign({}, x, { paid: newPaid, balance: newBal, payStatus: newStatus, paymentHistory: existingPh });
              });
            }} />
            <Input label="Discount" type="number" value={editSale.discount || 0} onChange={function (e) {
              var d = parseFloat(e.target.value) || 0;
              setEditSale(function (x) { return recomputeEditSaleTaxAndBalance(Object.assign({}, x, { discount: d })); });
            }} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <Btn col="gray" sm onClick={recalcTotal}>↻ Recalculate Total</Btn>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Line Items</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>Product</TH><TH>Qty</TH><TH>Unit Price</TH><TH>Subtotal</TH><TH></TH></tr></thead>
              <tbody>
                {(editSale.items || []).map(function (it, idx) {
                  return (
                    <tr key={it.id || idx} style={{ borderBottom: "1px solid " + C.border }}>
                      <td style={{ padding: "7px 10px" }}>
                        <select value={it.id || ""} onChange={function (e) {
                          var selProd = state.products.find(function (p) { return p.id === e.target.value; });
                          if (!selProd) return;
                          setEditSale(function (x) { return Object.assign({}, x, { items: x.items.map(function (ii, jj) { return jj === idx ? Object.assign({}, ii, { id: selProd.id, name: selProd.name, cost: selProd.cost, price: selProd.price }) : ii; }) }); });
                        }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff" }}>
                          {state.products.map(function (p) { return <option key={p.id} value={p.id}>{p.name}</option>; })}
                        </select>
                        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, paddingLeft: 2 }}>Cost: {getCurrencySymbol()} {fmtNum(it.cost || 0)}</div>
                      </td>
                      <td style={{ padding: "7px 6px" }}><input type="number" value={it.qty} onChange={function (e) { var v = parseInt(e.target.value) || 1; setEditSale(function (x) { return Object.assign({}, x, { items: x.items.map(function (ii, jj) { return jj === idx ? Object.assign({}, ii, { qty: v }) : ii; }) }); }); }} onFocus={function (e) { e.target.select(); }} style={{ width: 64, border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit", textAlign: "center" }} /></td>
                      <td style={{ padding: "7px 6px" }}><input type="number" value={it.price} onChange={function (e) { var v = parseFloat(e.target.value) || 0; setEditSale(function (x) { return Object.assign({}, x, { items: x.items.map(function (ii, jj) { return jj === idx ? Object.assign({}, ii, { price: v }) : ii; }) }); }); }} onFocus={function (e) { e.target.select(); }} style={{ width: 100, border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} /></td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: C.blue }}>{getCurrencySymbol()} {fmtNum(it.qty * it.price)}</td>
                      <td style={{ padding: "7px 6px" }}><button onClick={function () { setEditSale(function (x) { return Object.assign({}, x, { items: x.items.filter(function (_, jj) { return jj !== idx; }) }); }); }} style={{ background: C.dangerSoft, border: "none", color: C.red, cursor: "pointer", borderRadius: 6, padding: "4px 8px", fontWeight: 700 }}>×</button></td>
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
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="cyan" onClick={saveEdit}>Save Changes</Btn>
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
