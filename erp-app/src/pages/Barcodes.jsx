import React, { useState, useEffect, useRef } from "react";
import { productMatchesSearch } from "../utils/productSearch.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";

/* ═══════════════════════════════════════════════════════════════════
   UNIFIED BARCODE LABELS COMPONENT
   Merges: BarcodePrinter (sidebar) + Settings Barcode Tab
   
   Two Tabs:
   1. Print Labels - Print single or multiple product labels
   2. Label Design - Visual drag-and-drop designer + cost code config
   ═══════════════════════════════════════════════════════════════════ */

var BarcodePrinter = function (props) {
  var state = props.state;
  var setState = props.setState;

  var S = props.S;
  var uid = props.uid;
  var addAudit = props.addAudit;
  var C = props.C;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var encodeCost = props.encodeCost;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var escapeHtml = props.escapeHtml;
  var fmtSumQty = props.fmtSumQty;
  var showConfirm = props.showConfirm;
  var JsBarcodeWidget = props.JsBarcodeWidget;
  /* ── Tab State ── */
  var [tab, setTab] = useState("print"); // "print" or "design"

  /* ── Designer State ── */
  var GRID = 2; /* mm grid snap */
  var MM_TO_PX = 3.7795; /* 1mm = ~3.78px at 96dpi */

  var DEFAULT_ELEMENTS = [
    { id: "shopname",   type: "shopname",   label: "Shop Name",    x: 2, y: 2,  w: 56, h: 5,  fontSize: 7,  fontWeight: "bold",   color: "#1e3a5f", align: "center", visible: true },
    { id: "name",       type: "name",       label: "Product Name", x: 2, y: 9,  w: 56, h: 7,  fontSize: 9,  fontWeight: "bold",   color: "#000000", align: "center", visible: true },
    { id: "price",      type: "price",      label: "Sell Price",   x: 2, y: 18, w: 30, h: 5,  fontSize: 11, fontWeight: "bold",   color: "#000000", align: "left",   visible: true },
    { id: "cost",       type: "cost",       label: "Cost Code",    x: 34, y: 18, w: 24, h: 5,  fontSize: 7,  fontWeight: "normal", color: "#888888", align: "right",  visible: true },
    { id: "barcode",    type: "barcode",    label: "Barcode",      x: 2, y: 25, w: 56, h: 20, fontSize: 9,  fontWeight: "normal", color: "#000000", align: "center", visible: true },
    { id: "productid",  type: "productid",  label: "Product ID",   x: 2, y: 46, w: 56, h: 4,  fontSize: 7,  fontWeight: "normal", color: "#555555", align: "center", visible: true },
  ];

  var DEFAULT_DESIGN = {
    id: uid(), name: "Default", labelW: 60, labelH: 40,
    bgColor: "#ffffff", borderStyle: "solid",
    elements: DEFAULT_ELEMENTS
  };

  /* Load saved designs */
  var [designs, setDesigns] = useState(function () {
    var saved = S.get("tc3_labelDesigns", null);
    return saved && saved.length ? saved : [DEFAULT_DESIGN];
  });
  var [activeDesignId, setActiveDesignId] = useState(function () {
    var saved = S.get("tc3_labelDesigns", null);
    return saved && saved.length ? saved[0].id : DEFAULT_DESIGN.id;
  });

  var activeDesign = designs.find(function (d) { return d.id === activeDesignId; }) || designs[0];

  var saveDesigns = function (newDesigns) {
    setDesigns(newDesigns);
    S.set("tc3_labelDesigns", newDesigns);
  };

  var updateActiveDesign = function (patch) {
    var nd = designs.map(function (d) {
      return d.id === activeDesignId ? Object.assign({}, d, patch) : d;
    });
    saveDesigns(nd);
  };

  var updateElement = function (elId, patch) {
    updateActiveDesign({
      elements: activeDesign.elements.map(function (el) {
        return el.id === elId ? Object.assign({}, el, patch) : el;
      })
    });
  };

  /* ── Designer Interaction ── */
  var [selectedEl, setSelectedEl] = useState(null);
  var [dragging, setDragging] = useState(null);
  var [zoom, setZoom] = useState(1);         /* 0.5 – 3.0 */
  var [pan, setPan] = useState({ x: 0, y: 0 });
  var [isPanning, setIsPanning] = useState(false);
  var [spaceHeld, setSpaceHeld] = useState(false);
  var [panStart, setPanStart] = useState(null);
  var [newDesignMode, setNewDesignMode] = useState(false); /* true = show inline name input */
  var [newDesignName, setNewDesignName] = useState("");
  var [renameMode, setRenameMode] = useState(false);
  var [renameName, setRenameName] = useState("");
  var [designSaved, setDesignSaved] = useState(false);
  var canvasRef = useRef(null);
  var canvasWrapRef = useRef(null);

  var snap = function (v) { return Math.round(v / GRID) * GRID; };

  /* Zoom helpers */
  var zoomIn  = function () { setZoom(function (z) { return Math.min(3, Math.round((z + 0.25) * 100) / 100); }); };
  var zoomOut = function () { setZoom(function (z) { return Math.max(0.25, Math.round((z - 0.25) * 100) / 100); }); };
  var zoomReset = function () { setZoom(1); setPan({ x: 0, y: 0 }); };

  /* Space + arrow key handler for designer */
  useEffect(function () {
    var onKeyDown = function (e) {
      /* Space = pan mode */
      if (e.code === "Space" && !e.target.matches("input,textarea,select")) {
        e.preventDefault(); setSpaceHeld(true);
      }
      /* Ctrl++ / Ctrl+- zoom (only in designer tab) */
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault(); zoomIn();
      }
      if (e.ctrlKey && (e.key === "-" || e.keyCode === 189 || e.keyCode === 109)) {
        e.preventDefault(); zoomOut();
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault(); zoomReset();
      }
      /* Arrow keys nudge selected element by 0.2px (≈ 0.05mm) */
      if (selectedEl && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
        var nudge = 0.2 / MM_TO_PX; /* 0.2px converted to mm */
        var dx = e.key === "ArrowLeft" ? -nudge : e.key === "ArrowRight" ? nudge : 0;
        var dy = e.key === "ArrowUp"   ? -nudge : e.key === "ArrowDown"  ? nudge : 0;
        var el = activeDesign.elements.find(function (x) { return x.id === selectedEl; });
        if (el) {
          var newX = Math.max(0, Math.min(activeDesign.labelW - el.w, el.x + dx));
          var newY = Math.max(0, Math.min(activeDesign.labelH - el.h, el.y + dy));
          updateElement(selectedEl, { x: Math.round(newX * 1000) / 1000, y: Math.round(newY * 1000) / 1000 });
        }
      }
    };
    var onKeyUp = function (e) {
      if (e.code === "Space") { setSpaceHeld(false); setIsPanning(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return function () { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [selectedEl, activeDesign, zoom]);

  var onCanvasMouseDown = function (e) {
    if (spaceHeld) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }
    if (e.target === canvasRef.current) { setSelectedEl(null); }
  };

  var onCanvasMouseMove = function (e) {
    if (isPanning && panStart) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  var onCanvasMouseUp = function () {
    if (isPanning) { setIsPanning(false); setPanStart(null); }
  };

  var onElMouseDown = function (elId, e) {
    if (spaceHeld) return; /* panning mode — don't select */
    e.stopPropagation();
    setSelectedEl(elId);
    var el = activeDesign.elements.find(function (x) { return x.id === elId; });
    setDragging({ elId: elId, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
  };

  useEffect(function () {
    if (!dragging) return;
    var onMove = function (e) {
      var dx = (e.clientX - dragging.startX) / MM_TO_PX;
      var dy = (e.clientY - dragging.startY) / MM_TO_PX;
      var el = activeDesign.elements.find(function (x) { return x.id === dragging.elId; });
      var newX = snap(Math.max(0, Math.min(activeDesign.labelW - (el ? el.w : 10), dragging.origX + dx)));
      var newY = snap(Math.max(0, Math.min(activeDesign.labelH - (el ? el.h : 5), dragging.origY + dy)));
      updateElement(dragging.elId, { x: newX, y: newY });
    };
    var onUp = function () { setDragging(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return function () { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, activeDesign]);

  /* ── Cost Code Configuration (from Settings) ── */
  var [costCodeWord, setCostCodeWord] = useState(state.settings.costCodeWord || "STARLIGHKZ");

  var saveCostCode = function () {
    var updated = Object.assign({}, state.settings, { costCodeWord: costCodeWord });
    setState(function (s) { return Object.assign({}, s, { settings: updated }); });
    S.set("tc3_settings", updated);
    addAudit("Updated Cost Code Word", "Settings");
  };

  /* ── Printer Tab State ── */
  /* ── Excel-style print queue ── */
  var [printQueue, setPrintQueue] = useState([]); /* [{prod, qty}] */
  var [printSearch, setPrintSearch] = useState("");
  var [printSearchIdx, setPrintSearchIdx] = useState(-1);
  var [showPrintDrop, setShowPrintDrop] = useState(false);
  var [printQty, setPrintQty] = useState("1");
  var [previewItems, setPreviewItems] = useState([]);
  var [msg, setMsg] = useState(null);
  var printSearchRef = useRef(null);

  var filtPrintProds = state.products.filter(function (p) {
    if (p.status === "inactive") return false;
    if (isRepair3pInternalProduct(p)) return false;
    var q = printSearch.toLowerCase();
    if (!q) return false;
    return productMatchesSearch(p, q);
  }).slice(0, 8);

  var addToPrintQueue = function (prod) {
    var qty = parseInt(printQty, 10) || 1;
    setPrintQueue(function (prev) {
      var exists = prev.find(function (r) { return r.prod.id === prod.id; });
      if (exists) {
        return prev.map(function (r) { return r.prod.id === prod.id ? Object.assign({}, r, { qty: r.qty + qty }) : r; });
      }
      return prev.concat([{ prod: prod, qty: qty }]);
    });
    setPrintSearch(""); setPrintQty("1"); setShowPrintDrop(false); setPrintSearchIdx(-1);
    setTimeout(function () { var el = document.getElementById("brc-search"); if (el) el.focus(); }, 50);
  };
  
  /* ── Multi-Product Queue State ── */
  var [productQueue, setProductQueue] = useState([]); // [{product, qty}]
  var [searchTerm, setSearchTerm] = useState("");
  var [queueQty, setQueueQty] = useState(1);
  var [showSuggestions, setShowSuggestions] = useState(false);

  /* ── Sample Product for Preview ── */
  var sampleProduct = state.products.find(function (p) { return p.status !== "inactive"; }) || {
    name: "Sample Product", barcode: "123456789012", productId: "1010",
    cost: 45000, price: 65000
  };

  var buildItemsFromQueue = function () {
    var items = [];
    printQueue.forEach(function (row) {
      for (var i = 0; i < row.qty; i++) {
        items.push({ id: row.prod.id, productId: row.prod.productId, name: row.prod.name,
          barcode: row.prod.barcode || row.prod.id.slice(0, 8), cost: row.prod.cost, sellPrice: row.prod.price });
      }
    });
    return items;
  };

  var handlePreview = function () {
    var items = buildItemsFromQueue();
    if (!items.length) { setMsg({ type: "error", text: "No valid products found." }); return; }
    setPreviewItems(items);
  };

  var handlePrint = function () {
    var items = buildItemsFromQueue();
    if (!items.length) { setMsg({ type: "error", text: "Add products to queue first." }); return; }
    var d = activeDesign;
    var labelWmm = d.labelW; var labelHmm = d.labelH;
    var w = window.open("", "_blank", "width=900,height=700");
    var css = [
      "*{box-sizing:border-box;margin:0;padding:0;}",
      "html,body{background:#fff;font-family:Arial,sans-serif;}",
      "@page{size:" + labelWmm + "mm " + labelHmm + "mm;margin:0;}",
      ".lbl{width:" + labelWmm + "mm;height:" + labelHmm + "mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;}",
      ".lbl:last-child{page-break-after:auto;break-after:auto;}",
      "svg{display:block;max-width:100%;max-height:100%;}"
    ].join("");
    var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Labels</title><style>" + css + "</style></head><body>";
    items.forEach(function (it, idx) {
      var costEncoded = encodeCost(it.cost, state.settings.costCodeWord);
      var shop = state.settings.shopName || "";
      html += "<div class=\"lbl\" style=\"background:" + (d.bgColor || "#fff") + ";border:" + (d.borderStyle === "none" ? "none" : "1px solid #ccc") + ";\">";
      d.elements.forEach(function (el) {
        if (!el.visible) return;
        var val = "";
        if (el.type === "shopname") val = shop;
        else if (el.type === "name") val = it.name;
        else if (el.type === "price") val = getCurrencySymbol() + " " + fmtNum(it.sellPrice || it.price || 0);
        else if (el.type === "cost") val = costEncoded;
        else if (el.type === "productid") val = "ID: " + (it.productId || "");
        else if (el.type === "customtext") val = el.customText || "";
        else if (el.type === "barcode") {
          /* Clamp barcode inside label boundaries */
          var bcX = Math.min(el.x, labelWmm - el.w); var bcY = Math.min(el.y, labelHmm - el.h);
          var bcH = Math.min(el.h, labelHmm - bcY);
          var bcValPrint = it.barcode || it.id.slice(0, 8);
          var boxWmm = Math.max(2, el.w);
          var approxModsP = Math.max(40, String(bcValPrint).length * 11 + 35);
          var barModP = Math.max(0.7, Math.min(3.5, (boxWmm * 3.7795 - 2) / approxModsP));
          var svgId = "bc_" + idx + "_" + Math.random().toString(36).slice(2, 7);
          html += "<div style=\"position:absolute;left:" + (bcX / labelWmm * 100).toFixed(2) + "%;top:" + (bcY / labelHmm * 100).toFixed(2) + "%;width:" + (el.w / labelWmm * 100).toFixed(2) + "%;height:" + (bcH / labelHmm * 100).toFixed(2) + "%;overflow:hidden;display:flex;align-items:center;justify-content:center;\"><svg id=\"" + svgId + "\" style=\"width:100%;height:100%;\" preserveAspectRatio=\"none\" data-val=\"" + escapeHtml(bcValPrint) + "\" data-h=\"" + Math.max(8, Math.round(bcH * 3.7795 - 2)) + "\" data-bw=\"" + barModP.toFixed(2) + "\"></svg></div>";
          return;
        }
        var pct = function(v, total) { return (v / total * 100).toFixed(2) + "%"; };
        html += "<div style=\"position:absolute;left:" + pct(el.x, labelWmm) + ";top:" + pct(el.y, labelHmm) + ";width:" + pct(el.w, labelWmm) + ";height:" + pct(el.h, labelHmm) + ";font-size:" + el.fontSize + "px;font-weight:" + el.fontWeight + ";color:" + el.color + ";overflow:hidden;display:flex;align-items:center;justify-content:" + (el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start") + ";\"><span style=\"width:100%;text-align:" + el.align + "\">" + escapeHtml(val) + "</span></div>";
      });
      html += "</div>";
    });
    html += "<script src=\"https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js\"><\/script>";
    html += "<script>window.onload=function(){setTimeout(function(){document.querySelectorAll('svg[data-val]').forEach(function(s){try{JsBarcode(s,s.getAttribute('data-val'),{format:'CODE128',width:parseFloat(s.getAttribute('data-bw')||1.2),height:parseInt(s.getAttribute('data-h')||20),displayValue:false,margin:0});s.setAttribute('preserveAspectRatio','none');s.style.width='100%';s.style.height='100%';}catch(e){}});setTimeout(function(){window.print();},400);},600);};<\/script>";
    html += "</body></html>";
    w.document.write(html); w.document.close();
  };

  /* ── Render a single label element ── */
  var renderEl = function (el, product, forPrint) {
    if (!el.visible) return null;
    var shop = (state.settings && state.settings.shopName) || "My Shop";
    var bcVal = (product.barcode) || (product.id ? product.id.slice(0,8) : "000000");
    var costEncoded = encodeCost(product.cost || 0, (state.settings && state.settings.costCodeWord) || "STARLIGHKZ");
    var elContent;
    if (el.type === "shopname") elContent = shop;
    else if (el.type === "name") elContent = product.name || "";
    else if (el.type === "price") elContent = getCurrencySymbol() + " " + fmtNum(product.sellPrice || product.price || 0);
    else if (el.type === "cost") elContent = costEncoded;
    else if (el.type === "productid") elContent = "ID: " + (product.productId || "");
    else if (el.type === "customtext") elContent = el.customText || "Custom Text";
    else if (el.type === "barcode") {
      var boxWpx = Math.max(8, el.w * MM_TO_PX);
      var boxHpx = Math.max(10, el.h * MM_TO_PX);
      /* Scale bar module width so the CODE128 graphic tracks element width */
      var approxMods = Math.max(40, String(bcVal).length * 11 + 35);
      var barMod = Math.max(0.7, Math.min(3.5, (boxWpx - 2) / approxMods));
      return (
        <div key={el.id}
          onMouseDown={forPrint ? null : function (e) { onElMouseDown(el.id, e); }}
          style={{ position: "absolute", left: el.x * MM_TO_PX, top: el.y * MM_TO_PX,
            width: boxWpx, height: boxHpx,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: forPrint ? "default" : "move",
            outline: (!forPrint && selectedEl === el.id) ? "2px solid #0077e6" : "none",
            boxSizing: "border-box", overflow: "hidden" }}>
          <JsBarcodeWidget value={bcVal} width={barMod} height={Math.max(8, boxHpx - 2)} fill />
        </div>
      );
    }
    return (
      <div key={el.id}
        onMouseDown={forPrint ? null : function (e) { onElMouseDown(el.id, e); }}
        style={{ position: "absolute", left: el.x * MM_TO_PX, top: el.y * MM_TO_PX,
          width: el.w * MM_TO_PX, height: el.h * MM_TO_PX,
          fontSize: el.fontSize, fontWeight: el.fontWeight, color: el.color,
          textAlign: el.align, display: "flex", alignItems: "center",
          justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
          overflow: "hidden", lineHeight: 1.2, wordBreak: "break-word",
          cursor: forPrint ? "default" : "move",
          outline: (!forPrint && selectedEl === el.id) ? "2px solid #0077e6" : "none",
          boxSizing: "border-box" }}>
        <span style={{ width: "100%", textAlign: el.align }}>{elContent}</span>
      </div>
    );
  };

  var selEl = activeDesign.elements.find(function (e) { return e.id === selectedEl; });
  var ELEMENT_TYPES = [
    { type: "shopname", label: "🏪 Shop Name" },
    { type: "name", label: "📦 Product Name" },
    { type: "price", label: "💰 Sell Price" },
    { type: "cost", label: "🔑 Cost Code" },
    { type: "barcode", label: "▌▌ Barcode" },
    { type: "productid", label: "🔢 Product ID" },
    { type: "customtext", label: "✏️ Custom Text" },
  ];

  var addElement = function (type) {
    var newEl = {
      id: uid(), type: type, label: type, x: 2, y: 2, w: 30, h: type === "barcode" ? 15 : 5,
      fontSize: 8, fontWeight: "normal", color: "#000000", align: "center",
      visible: true, customText: type === "customtext" ? "Custom Text" : ""
    };
    updateActiveDesign({ elements: activeDesign.elements.concat([newEl]) });
    setSelectedEl(newEl.id);
  };

  return (
    <div className="erp-page erp-arap-modern is-bc">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">BC</div>
            <div>
              <h1 className="erp-arap-header-title">Barcodes</h1>
              <p className="erp-arap-header-sub">Print labels · design layout</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Barcode summary">
            <div className="erp-arap-kpi is-blue">
              <span className="erp-arap-kpi-lbl">Queue</span>
              <span className="erp-arap-kpi-val">{printQueue.length}</span>
              <span className="erp-arap-kpi-sub">products</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">Labels</span>
              <span className="erp-arap-kpi-val">{fmtSumQty(printQueue.reduce(function (a, r) { return a + r.qty; }, 0))}</span>
              <span className="erp-arap-kpi-sub">to print</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">Design</span>
              <span className="erp-arap-kpi-val">{activeDesign.labelW}×{activeDesign.labelH}</span>
              <span className="erp-arap-kpi-sub">mm · {activeDesign.name}</span>
            </div>
          </div>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Barcode tools">
          {[["print", "Print Labels"], ["design", "Label Design"]].map(function (t) {
            var active = tab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { setTab(t[0]); setMsg(null); }}
              >
                <span>{t[1]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1: PRINT LABELS
      ══════════════════════════════════════════════════════ */}
      {tab === "print" && (
        <div className="erp-arap-body erp-arap-split">
          {/* LEFT: Excel-style queue */}
          <div className="erp-arap-panel">
            <div className="erp-arap-panel-title">
              <h2>Print queue</h2>
              <span>Search products and set label counts</span>
            </div>

            {msg && (
              <div style={{ margin: "8px 10px 0", background: msg.type === "error" ? C.dangerSoft : "#fef3e2",
                color: msg.type === "error" ? C.red : "#d97706",
                borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600 }}>
                {msg.text}
              </div>
            )}

            {/* Excel grid */}
            <div className="erp-arap-queue" style={{ margin: "8px 10px" }}>
              {/* Header */}
              <div className="erp-arap-queue-head">
                {["PRODUCT", "LABELS", ""].map(function (h, i) {
                  return <span key={i}>{h}</span>;
                })}
              </div>

              {/* Existing rows */}
              {printQueue.map(function (row, idx) {
                return (
                  <div key={row.prod.id} className="erp-arap-queue-row">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: C.text }}>{row.prod.name}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>ID: {row.prod.productId} · {row.prod.barcode}</div>
                    </div>
                    <input type="number" min="1" value={row.qty}
                      onChange={function (e) {
                        var v = parseInt(e.target.value, 10) || 1;
                        setPrintQueue(function (prev) { return prev.map(function (r) { return r.prod.id === row.prod.id ? Object.assign({}, r, { qty: v }) : r; }); });
                      }}
                      style={{ width: "100%", border: "1px solid " + C.border, borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                    <button onClick={function () { setPrintQueue(function (prev) { return prev.filter(function (r) { return r.prod.id !== row.prod.id; }); }); }}
                      style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "#fee2e2", color: C.red, fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                );
              })}

              {/* Input row */}
              <div className="erp-arap-queue-row erp-arap-queue-input">
                <div style={{ position: "relative" }} ref={printSearchRef}>
                  <input id="brc-search" value={printSearch}
                    onChange={function (e) { setPrintSearch(e.target.value); setShowPrintDrop(true); setPrintSearchIdx(-1); }}
                    onFocus={function () { setShowPrintDrop(true); }}
                    onKeyDown={function (e) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setPrintSearchIdx(function (i) { return Math.min(i + 1, filtPrintProds.length - 1); }); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setPrintSearchIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                      if ((e.key === "Enter" || e.key === "Tab") && filtPrintProds.length > 0) {
                        var pick = printSearchIdx >= 0 ? filtPrintProds[printSearchIdx] : filtPrintProds[0];
                        if (pick) { e.preventDefault(); addToPrintQueue(pick); }
                        return;
                      }
                      if (e.key === "Escape") { setShowPrintDrop(false); setPrintSearchIdx(-1); }
                    }}
                    placeholder="Search name, ID, barcode, category..." 
                    style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", fontFamily: "inherit", background: "#fff" }} />
                  {showPrintDrop && filtPrintProds.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 8, zIndex: 9999, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.15)" }}>
                      {filtPrintProds.map(function (p, pidx) {
                        return (
                          <div key={p.id}
                            onClick={function () { addToPrintQueue(p); }}
                            onMouseEnter={function () { setPrintSearchIdx(pidx); }}
                            style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: printSearchIdx === pidx ? C.accentSoft : "#fff" }}>
                            <div>
                              <div style={{ fontWeight: 700, color: C.text }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: C.muted }}>ID: {p.productId} · {p.barcode}</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(p.price)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <input type="number" min="1" value={printQty}
                  onChange={function (e) { setPrintQty(e.target.value); }}
                  onKeyDown={function (e) {
                    if (e.key === "Enter" && filtPrintProds.length > 0) {
                      addToPrintQueue(printSearchIdx >= 0 ? filtPrintProds[printSearchIdx] : filtPrintProds[0]);
                    }
                  }}
                  placeholder="Qty"
                  style={{ width: "100%", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 6px", fontSize: 12, textAlign: "center", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                <div></div>
              </div>
            </div>

            {/* Total & Action */}
            <div className="erp-arap-foot" style={{ borderTop: "none" }}>
              <div style={{ fontSize: 12.5, color: C.muted }}>
                {printQueue.length > 0
                  ? <span><strong style={{ color: C.text }}>{fmtSumQty(printQueue.reduce(function (a, r) { return a + r.qty; }, 0))}</strong> labels · {printQueue.length} product(s)</span>
                  : "Search products above to add to queue"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {printQueue.length > 0 && <Btn sm col="gray" onClick={function () { setPrintQueue([]); setPreviewItems([]); }}>Clear</Btn>}
                <Btn col="blue" onClick={function () {
                  var items = buildItemsFromQueue();
                  if (!items.length) { setMsg({ type: "error", text: "Add products first." }); return; }
                  setMsg(null); setPreviewItems(items);
                }} disabled={printQueue.length === 0}>Preview</Btn>
                <Btn col="green" onClick={handlePrint} disabled={printQueue.length === 0}>
                  Print {printQueue.length > 0 ? "(" + fmtSumQty(printQueue.reduce(function (a, r) { return a + r.qty; }, 0)) + ")" : ""}
                </Btn>
              </div>
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div className="erp-arap-panel">
            <div className="erp-arap-panel-title">
              <h2>Preview</h2>
              <span>{previewItems.length ? previewItems.length + " label(s)" : "No preview yet"}</span>
            </div>
            {previewItems.length > 0 ? (
              <div style={{ maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px 12px" }}>
                {previewItems.slice(0, 15).map(function (item, idx) {
                  return (
                    <div key={idx} style={{ width: activeDesign.labelW * MM_TO_PX, height: activeDesign.labelH * MM_TO_PX, background: activeDesign.bgColor || "#fff",
                      border: activeDesign.borderStyle === "none" ? "1px dashed #ccc" : "1px " + (activeDesign.borderStyle || "solid") + " #ccc",
                      position: "relative", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", flexShrink: 0 }}>
                      {activeDesign.elements.map(function (el) { return renderEl(el, item, true); })}
                    </div>
                  );
                })}
                {previewItems.length > 15 && <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 8 }}>+{previewItems.length - 15} more labels...</div>}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 32, color: C.muted, fontSize: 13 }}>
                Add products and click Preview to see labels
              </div>
            )}
          </div>
        </div>
      )}


      {tab === "design" && (
        <div className="erp-arap-body erp-bc-design">
          
          {/* LEFT: Canvas - Sticky so it stays visible while scrolling right panel */}
          <div className="erp-bc-canvas-wrap">
          <div className="erp-arap-panel erp-bc-panel">
            <div className="erp-arap-panel-title">
              <h2>Designer canvas</h2>
              <span>{activeDesign.labelW}mm × {activeDesign.labelH}mm — drag to reposition</span>
            </div>

            {/* Design selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 10px 10px" }}>
              {/* Row 1: selector + action buttons */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={activeDesignId} onChange={function (e) { setActiveDesignId(e.target.value); setSelectedEl(null); setRenameMode(false); setNewDesignMode(false); }}
                  style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", background: "#fff", flex: 1, minWidth: 120 }}>
                  {designs.map(function (d) { return <option key={d.id} value={d.id}>{d.name}</option>; })}
                </select>
                {/* Save */}
                <button type="button" className={"erp-arap-bc-tool is-save" + (designSaved ? " is-ok" : "")} onClick={function () {
                  var ns = designs.map(function (d) { return d.id === activeDesignId ? Object.assign({}, d) : d; });
                  saveDesigns(ns);
                  setDesignSaved(true);
                  setTimeout(function () { setDesignSaved(false); }, 2000);
                }}>
                  {designSaved ? "✓ Saved!" : "💾 Save"}
                </button>
                {/* Rename */}
                <button type="button" className="erp-arap-bc-tool" onClick={function () { setRenameMode(true); setRenameName(activeDesign.name); setNewDesignMode(false); }}>
                  ✏️ Rename
                </button>
                {/* New */}
                <button type="button" className="erp-arap-bc-tool is-new" onClick={function () { setNewDesignMode(true); setNewDesignName("Design " + (designs.length + 1)); setRenameMode(false); }}>
                  + New
                </button>
                {/* Delete */}
                {designs.length > 1 && (
                  <button type="button" className="erp-arap-bc-tool is-del" onClick={function () {
                    showConfirm("Delete design \"" + activeDesign.name + "\"?", function () {
                      var nd = designs.filter(function (d) { return d.id !== activeDesignId; });
                      saveDesigns(nd); setActiveDesignId(nd[0].id);
                    });
                  }}>
                    🗑 Del
                  </button>
                )}
              </div>

              {/* Inline: New Design name input */}
              {newDesignMode && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#f0f9ff", border: "1.5px solid #93c5fd", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, whiteSpace: "nowrap" }}>New name:</span>
                  <input autoFocus value={newDesignName} onChange={function (e) { setNewDesignName(e.target.value); }}
                    onKeyDown={function (e) {
                      if (e.key === "Enter") {
                        var nm = newDesignName.trim();
                        if (!nm) return;
                        var newD = Object.assign({}, JSON.parse(JSON.stringify(activeDesign)), { id: uid(), name: nm });
                        var nd = designs.concat([newD]); saveDesigns(nd); setActiveDesignId(newD.id); setNewDesignMode(false);
                      }
                      if (e.key === "Escape") setNewDesignMode(false);
                    }}
                    placeholder="Enter design name..."
                    style={{ flex: 1, border: "1.5px solid #93c5fd", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  <button onClick={function () {
                    var nm = newDesignName.trim(); if (!nm) return;
                    var newD = Object.assign({}, JSON.parse(JSON.stringify(activeDesign)), { id: uid(), name: nm });
                    var nd = designs.concat([newD]); saveDesigns(nd); setActiveDesignId(newD.id); setNewDesignMode(false);
                  }} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Create</button>
                  <button type="button" className="erp-arap-bc-mini" onClick={function () { setNewDesignMode(false); }}>Cancel</button>
                </div>
              )}

              {/* Inline: Rename input */}
              {renameMode && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#b45309", whiteSpace: "nowrap" }}>Rename:</span>
                  <input autoFocus value={renameName} onChange={function (e) { setRenameName(e.target.value); }}
                    onKeyDown={function (e) {
                      if (e.key === "Enter") {
                        var nm = renameName.trim(); if (!nm) return;
                        updateActiveDesign({ name: nm }); setRenameMode(false);
                      }
                      if (e.key === "Escape") setRenameMode(false);
                    }}
                    style={{ flex: 1, border: "1.5px solid #fcd34d", borderRadius: 6, padding: "5px 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  <button onClick={function () {
                    var nm = renameName.trim(); if (!nm) return;
                    updateActiveDesign({ name: nm }); setRenameMode(false);
                  }} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                  <button type="button" className="erp-arap-bc-mini" onClick={function () { setRenameMode(false); }}>Cancel</button>
                </div>
              )}
            </div>

            {/* Canvas area — zoom/pan viewport */}
            <div ref={canvasWrapRef}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={onCanvasMouseUp}
              style={{ display: "flex", justifyContent: "center", alignItems: "center",
                padding: "28px 0", background: "#e8ecf0", borderRadius: 10, margin: "0 10px",
                minHeight: 420, overflow: "hidden", position: "relative",
                cursor: spaceHeld ? (isPanning ? "grabbing" : "grab") : "default" }}>
              {/* Zoom controls + indicator */}
              <div style={{ position: "absolute", top: 8, right: 10, display: "flex", gap: 4, alignItems: "center", zIndex: 10 }}>
                <button type="button" className="erp-arap-bc-zoom" onClick={zoomOut}>−</button>
                <button type="button" className="erp-arap-bc-zoom is-pct" onClick={zoomReset}>{Math.round(zoom * 100)}%</button>
                <button type="button" className="erp-arap-bc-zoom" onClick={zoomIn}>+</button>
              </div>
              {/* Zoomable/pannable canvas container */}
              <div style={{ transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")", transformOrigin: "center center", transition: isPanning ? "none" : "transform 0.05s" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>
                    {activeDesign.labelW}mm × {activeDesign.labelH}mm (Actual Size)
                  </div>
                  <div ref={canvasRef}
                    style={{ width: activeDesign.labelW * MM_TO_PX, height: activeDesign.labelH * MM_TO_PX,
                      background: activeDesign.bgColor || "#fff",
                      border: activeDesign.borderStyle === "none" ? "1px dashed #ccc" : "1px " + (activeDesign.borderStyle || "solid") + " #ccc",
                      position: "relative", userSelect: "none",
                      backgroundImage: "linear-gradient(rgba(0,119,230,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,119,230,0.06) 1px,transparent 1px)",
                      backgroundSize: (GRID * MM_TO_PX) + "px " + (GRID * MM_TO_PX) + "px",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                    {activeDesign.elements.map(function (el) { return renderEl(el, sampleProduct, false); })}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>← Preview with sample product data →</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, padding: "0 10px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Add Element</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ELEMENT_TYPES.map(function (et) {
                  var exists = activeDesign.elements.find(function (el) { return el.type === et.type && el.type !== "customtext"; });
                  return (
                    <button key={et.type} type="button" onClick={function () { addElement(et.type); }}
                      style={{ padding: "5px 12px", borderRadius: 6, border: "1.5px solid " + C.border,
                        background: exists && et.type !== "customtext" ? "#f1f5f9" : "#fff",
                        color: exists && et.type !== "customtext" ? C.muted : C.text,
                        fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                      {et.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>

          {/* RIGHT: Properties Panel */}
          <div className="erp-bc-side">
            
            {/* Label Size */}
            <div className="erp-arap-panel erp-bc-panel">
              <div className="erp-arap-panel-title"><h2>Label size</h2></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                {/* Quick sizes */}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Quick Select</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[["25×15","25","15"],["30×20","30","20"],["40×20","40","20"],["50×25","50","25"],["57×32","57","32"],["60×30","60","30"],["60×40","60","40"],["62×29","62","29"],["70×40","70","40"],["80×40","80","40"],["100×50","100","50"]].map(function (sz) {
                    var active = activeDesign.labelW == sz[1] && activeDesign.labelH == sz[2];
                    return <button key={sz[0]} onClick={function () { updateActiveDesign({ labelW: parseInt(sz[1]), labelH: parseInt(sz[2]) }); }}
                      style={{ padding: "4px 9px", borderRadius: 6, border: "1.5px solid " + (active ? C.accent : C.border),
                        background: active ? C.accentSoft : "#fff", color: active ? C.accent : C.text,
                        fontSize: 11, cursor: "pointer", fontWeight: active ? 700 : 500 }}>{sz[0]}mm</button>;
                  })}
                </div>
                {/* Custom size */}
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginTop: 4 }}>Custom Size</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Width (mm)</div>
                    <input type="number" value={activeDesign.labelW} min="20" max="200"
                      onChange={function (e) { updateActiveDesign({ labelW: parseInt(e.target.value) || 60 }); }}
                      style={{ width: 70, border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }} /></div>
                  <span style={{ fontSize: 16, color: C.muted, paddingTop: 16 }}>×</span>
                  <div><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Height (mm)</div>
                    <input type="number" value={activeDesign.labelH} min="10" max="200"
                      onChange={function (e) { updateActiveDesign({ labelH: parseInt(e.target.value) || 40 }); }}
                      style={{ width: 70, border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }} /></div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Background</div>
                    <input type="color" value={activeDesign.bgColor || "#ffffff"}
                      onChange={function (e) { updateActiveDesign({ bgColor: e.target.value }); }}
                      style={{ width: "100%", height: 32, borderRadius: 6, border: "1.5px solid " + C.border, padding: 2, cursor: "pointer" }} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Border</div>
                    <select value={activeDesign.borderStyle || "solid"}
                      onChange={function (e) { updateActiveDesign({ borderStyle: e.target.value }); }}
                      style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                      <option value="none">None</option>
                    </select></div>
                </div>
              </div>
            </div>

            {/* Cost Code Configuration */}
            <div className="erp-arap-panel erp-bc-panel">
              <div className="erp-arap-panel-title"><h2>Cost code</h2></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>
                  Secret 10-letter code word for encoding product costs on labels
                </div>
                <input
                  value={costCodeWord}
                  onChange={function (e) {
                    var raw = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 10);
                    setCostCodeWord(raw);
                  }}
                  maxLength={10}
                  placeholder="e.g. MOTHERLAND"
                  style={{ width: "100%", border: "1.5px solid " + (costCodeWord.length === 10 ? C.accent : C.border), 
                    borderRadius: 7, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", fontWeight: 700, 
                    letterSpacing: "0.15em", textTransform: "uppercase", background: "#fff", color: C.text }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: costCodeWord.length === 10 ? C.green : C.muted, fontWeight: 600 }}>
                    {costCodeWord.length}/10 letters {costCodeWord.length === 10 ? "✓ Valid" : "— must be exactly 10"}
                  </span>
                  <span style={{ fontSize: 10, color: C.muted }}>Digits 1–9, 0 → letters 1st–10th</span>
                </div>
                {costCodeWord.length === 10 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {costCodeWord.split("").map(function (ch, i) {
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", 
                          background: "#fff", border: "1px solid " + C.border, borderRadius: 5, padding: "3px 7px", minWidth: 28 }}>
                          <span style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>{i === 9 ? "0" : String(i + 1)}</span>
                          <span style={{ fontSize: 12, color: C.accent, fontWeight: 800, fontFamily: "monospace" }}>{ch}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {costCodeWord !== state.settings.costCodeWord && (
                  <Btn col="blue" sm onClick={saveCostCode} disabled={costCodeWord.length !== 10}>
                    Save Cost Code
                  </Btn>
                )}
              </div>
            </div>

            {/* Element Properties */}
            {selEl && (
              <div className="erp-arap-panel erp-bc-panel">
                <div className="erp-arap-panel-title">
                  <h2>Element</h2>
                  <span>{selEl.label}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                  {/* Position */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>X (mm)</div>
                      <input type="number" value={selEl.x} min="0" onChange={function (e) { updateElement(selEl.id, { x: snap(parseFloat(e.target.value) || 0) }); }}
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} /></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Y (mm)</div>
                      <input type="number" value={selEl.y} min="0" onChange={function (e) { updateElement(selEl.id, { y: snap(parseFloat(e.target.value) || 0) }); }}
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} /></div>
                  </div>
                  {/* Size */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Width (mm)</div>
                      <input type="number" value={selEl.w} min="5" onChange={function (e) { updateElement(selEl.id, { w: parseFloat(e.target.value) || 10 }); }}
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} /></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Height (mm)</div>
                      <input type="number" value={selEl.h} min="3" onChange={function (e) { updateElement(selEl.id, { h: parseFloat(e.target.value) || 5 }); }}
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} /></div>
                  </div>
                  {/* Font */}
                  {selEl.type !== "barcode" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Font Size</div>
                        <input type="number" value={selEl.fontSize} min="5" max="30"
                          onChange={function (e) { updateElement(selEl.id, { fontSize: parseInt(e.target.value) || 8 }); }}
                          style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} /></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Weight</div>
                        <select value={selEl.fontWeight} onChange={function (e) { updateElement(selEl.id, { fontWeight: e.target.value }); }}
                          style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit" }}>
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                        </select></div>
                    </div>
                  )}
                  {/* Color & Align */}
                  {selEl.type !== "barcode" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Color</div>
                        <input type="color" value={selEl.color || "#000000"}
                          onChange={function (e) { updateElement(selEl.id, { color: e.target.value }); }}
                          style={{ width: "100%", height: 30, borderRadius: 6, border: "1.5px solid " + C.border, padding: 2, cursor: "pointer" }} /></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Align</div>
                        <select value={selEl.align} onChange={function (e) { updateElement(selEl.id, { align: e.target.value }); }}
                          style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit" }}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select></div>
                    </div>
                  )}
                  {/* Custom text field */}
                  {selEl.type === "customtext" && (
                    <div><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Custom Text</div>
                      <input value={selEl.customText || ""} onChange={function (e) { updateElement(selEl.id, { customText: e.target.value }); }}
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} /></div>
                  )}
                  {/* Visibility & Delete */}
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button onClick={function () { updateElement(selEl.id, { visible: !selEl.visible }); }}
                      style={{ flex: 1, padding: "7px", borderRadius: 6, border: "1.5px solid " + C.border,
                        background: selEl.visible ? C.accentSoft : "#fff", color: selEl.visible ? C.accent : C.muted,
                        fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      {selEl.visible ? "👁 Visible" : "👁‍🗨 Hidden"}
                    </button>
                    <button onClick={function () {
                      updateActiveDesign({ elements: activeDesign.elements.filter(function (e) { return e.id !== selEl.id; }) });
                      setSelectedEl(null);
                    }}
                      style={{ padding: "7px 12px", borderRadius: 6, border: "1.5px solid " + C.red,
                        background: "#fff", color: C.red, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default BarcodePrinter;
