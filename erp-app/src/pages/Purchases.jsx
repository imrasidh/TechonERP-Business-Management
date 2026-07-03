import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { purchaseReturnUiStatus, displayStatusForPurchase } from "../utils/returnDisplay.js";
import { buildVoidPurchaseUpdates, isVoidedTxn, activePurchases, VOID_REASON_OPTIONS, voidPurchaseBlockReason } from "../utils/voidInvoice.js";
import ReturnDetailsPanel from "../components/ReturnDetailsPanel.jsx";
import CloseIconButton from "../components/CloseIconButton.jsx";
import { ensureUniqueDocumentNumber } from "../utils/docNumbers.js";
import { validateExtraUnits, buildUnitsPersistFields, getProductUnitRows, factorForNamedUnit, isProductBaseUnitLabel } from "../units/productUnits.js";
import {
  normalizePurchaseLineItem,
  normalizePurchaseLineEconomics,
  sumPurchaseLinesStockTotal,
  costPerInputUnitFromBase,
  unitCostBaseFromInputCost,
  purchaseLineStockTotal,
  defaultCostInputMode,
  COST_INPUT_PER_INPUT,
  COST_INPUT_PER_BASE,
  lineEconomicValue,
} from "../utils/purchaseValuation.js";
import { computeSaleTax } from "../tax/taxCompute.js";
import {
  RAW_MATERIAL_PRICE_COST_HINT,
  isRawMaterialGuardBaseUnit,
  rawMaterialEnteredLooksLikePackTotal,
  rawMaterialPackPricingConfirmMessage,
} from "../utils/rawMaterialPricingGuard.js";
import {
  purchaseUnitConversionMissingMessage,
  isPurchaseInputUnitMissingFactor,
  resolvePurchaseInputUnit,
  purchaseLineBaseUnitLooksLikePackTotal,
  purchasePackTotalVsCatalogueMessage,
  catalogSellPricePerBaseFromLine as catalogSellPricePerBaseFromLineCalc,
} from "../utils/purchaseUnitGuard.js";
import {
  productMatchesSearch,
  productMatchesSearchExact,
  findActiveProductByExactSearch,
} from "../utils/productSearch.js";
import { evaluateProductNameMatch } from "../utils/productNameMatch.js";
import ProductNameDuplicateHint, { useProductNameHintControls } from "../components/ProductNameDuplicateHint.jsx";
import GlassSheetInfo from "../components/GlassSheetInfo.jsx";
import { COMPUTER_SHOP_EDITION, DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import {
  isGlassProduct,
  isGlassStockProductForm,
  validateGlassProductForm,
  applyGlassProductFields,
  glassCostPriceLabels,
  glassFormFieldsOnUnitChange,
  glassPurchaseEconomics,
  formatGlassStockLabel,
} from "../utils/glassProduct.js";
import { getUnitsForSubCategory, hydrateShopSettings, getDefaultProductCategory, getDefaultProductUnit } from "../utils/categoryGroups.js";
import CategorySelect from "../components/CategorySelect.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";

var Purchases = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var genPurNo = props.genPurNo;
  var today = props.today;
  var S = props.S;
  var shopSettings = hydrateShopSettings(state.settings, S.get("tc3_businessType", null));
  var onProductCategoryChange = function (setForm, cat) {
    var units = getUnitsForSubCategory(cat, shopSettings);
    setForm(function (x) {
      var nextUnit = units.indexOf(x.unit) >= 0 ? x.unit : (units[0] || "Pcs");
      return Object.assign({}, x, { category: cat, unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit));
    });
  };
  var blankNewProd = function (extra) {
    var cat = getDefaultProductCategory(shopSettings);
    var unit = getDefaultProductUnit(shopSettings, cat);
    return Object.assign({
      name: "", barcode: genBarcode(), category: cat, unit: unit, type: "stock",
      cost: "", price: "", description: "", stock: "0", extraUnits: [],
      require_comment: true, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL,
    }, extra || {});
  };
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var C = props.C;
  var StatCard = props.StatCard;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var Pager = props.Pager;
  var usePager = props.usePager;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var getBusinessProfile = props.getBusinessProfile;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var genBarcode = props.genBarcode;
  var nextProductId = props.nextProductId;
  var checkProductName = props.checkProductName;
  var fmtSumQty = props.fmtSumQty;
  var getCats = props.getCats;
  var fmtStock = props.fmtStock;
  var encodeCost = props.encodeCost;
  var escapeHtml = props.escapeHtml;
  var validateTxnAmounts = props.validateTxnAmounts;
  var toProductBaseQty = props.toProductBaseQty;
  var isDecimalUnit = props.isDecimalUnit;
  var getUnitCostPrice = props.getUnitCostPrice;
  var getUnitSellPrice = props.getUnitSellPrice;
  var checkPeriodClose = props.checkPeriodClose;
  var setActive = props.setActive;
  var SplitPaymentModal = props.SplitPaymentModal;
  var PaymentBreakdown = props.PaymentBreakdown;
  var BarcodeLabelSheet = props.BarcodeLabelSheet;
  var canDeleteInvoices = props.canDeleteInvoices === true;
  var showPermissionDenied = typeof props.showPermissionDenied === "function"
    ? props.showPermissionDenied
    : function () { showAlert("You do not have permission for this action."); };
  var COST_KEY = props.COST_KEY;
  var BLANK = { supplier: "", invoiceNo: genPurNo(), date: today(), payMode: "unpaid", paidAmount: "", cashMethod: "Cash", items: [], chequeList: [], splitRows: [], purchaseTaxAmount: "" };
  var [purChqForm, setPurChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [show, setShow] = useState(false);
  var [f, setF] = useState(BLANK);
  var [editPur, setEditPur] = useState(null);
  var [viewPur, setViewPur] = useState(null);
  var [barcodeItems, setBarcodeItems] = useState(null);
  var [labelQtyModal, setLabelQtyModal] = useState(null);
  var [purSplitModal, setPurSplitModal] = useState(false);
  /* newProd declared here so the Ctrl++ useEffect below can safely reference setNewProd */
  var [newProd, setNewProd] = useState(null);

  var [newProdKey, setNewProdKey] = useState(0);
  var newProductNameMatch = useMemo(function () {
    if (!newProd || !String(newProd.name || "").trim()) return null;
    return evaluateProductNameMatch(newProd.name, state.products, null);
  }, [newProd, state.products]);
  var newProductNameExactDup = !!(newProductNameMatch && newProductNameMatch.type === "exact");
  var newNameHint = useProductNameHintControls(newProd ? newProd.name : "");

  /* Ctrl++ shortcut — open Add New Product */
  useEffect(function () {
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        if (!show) return; /* only active when New Purchase modal is open */
        e.preventDefault();
        setNewProd(null); setTimeout(function () { setNewProd(blankNewProd());; }, 30);
      }
    };
    window.addEventListener("keydown", handler);
    return function () { window.removeEventListener("keydown", handler); };
  }, [show]); /* new purchase split payment modal */ /* [{id,name,purchaseQty,printQty}] */
  var [ps, setPs] = useState("");
  var [pq, setPq] = useState(1);
  var [pUnit, setPUnit] = useState("Pcs");
  var [pBaseUnit, setPBaseUnit] = useState("Pcs");
  var [pPickedProduct, setPPickedProduct] = useState(null);
  var [pc, setPc] = useState("");
  var [pSell, setPSell] = useState("");
  /** Cost entry: per purchase unit (sack) vs per storage base unit (kg) */
  var [pCostInputMode, setPCostInputMode] = useState(COST_INPUT_PER_BASE);
  var [search, setSearch] = useState("");
  var [filterStatus, setFilterStatus] = useState("Active");
  var [voidPurTarget, setVoidPurTarget] = useState(null);
  var [voidReason, setVoidReason] = useState("");
  var purSearchRef = useRef(null);
  var pendingPurFocusRef = useRef(null);
  var [showPurDrop, setShowPurDrop] = useState(false);
  var [purDropIdx, setPurDropIdx] = useState(-1);

  useEffect(function () {
    var pick = pPickedProduct || (ps.trim() ? findActiveProductByExactSearch(state.products, ps) : null);
    if (!pick) return;
    var bu = pick.unit || "Pcs";
    setPBaseUnit(bu);
    setPUnit(function (prev) { return resolvePurchaseInputUnit(pick, prev); });
  }, [ps, pPickedProduct, state.products]);

  var purSearchId = function (mode) { return mode === "edit" ? "pur-edit-search" : "pur-search-input"; };
  var purAddFieldId = function (mode, field) { return (mode === "edit" ? "pur-edit-" : "pur-new-") + field; };

  var focusPurSearch = useCallback(function (mode) {
    setTimeout(function () {
      try {
        var el = document.getElementById(purSearchId(mode || "new"));
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 50);
  }, []);

  var focusPurAddField = useCallback(function (mode, field) {
    setTimeout(function () {
      try {
        var el = document.getElementById(purAddFieldId(mode, field));
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 50);
  }, []);

  var focusPurLineField = useCallback(function (mode, row, col) {
    setTimeout(function () {
      if (col < 0) {
        focusPurSearch(mode);
        return;
      }
      var el = document.querySelector("[data-purmode='" + mode + "'][data-purrow='" + row + "'][data-purcol='" + col + "']");
      if (el) {
        el.focus();
        if (typeof el.select === "function") el.select();
        return;
      }
      if (col < 2) {
        var nextCol = document.querySelector("[data-purmode='" + mode + "'][data-purrow='" + row + "'][data-purcol='" + (col + 1) + "']");
        if (nextCol) {
          nextCol.focus();
          if (typeof nextCol.select === "function") nextCol.select();
          return;
        }
      }
      if (col >= 2) {
        focusPurSearch(mode);
        return;
      }
      var nextRow = document.querySelector("[data-purmode='" + mode + "'][data-purrow='" + (row + 1) + "'][data-purcol='0']");
      if (nextRow) {
        nextRow.focus();
        if (typeof nextRow.select === "function") nextRow.select();
      } else {
        focusPurSearch(mode);
      }
    }, 0);
  }, [focusPurSearch]);

  var handlePurLineFieldKey = useCallback(function (e, mode, row, col) {
    if (e.key === "ArrowUp") { e.preventDefault(); focusPurLineField(mode, row - 1, col); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); focusPurLineField(mode, row + 1, col); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); focusPurLineField(mode, row, col - 1); return; }
    if (e.key === "ArrowRight" || e.key === "Tab") {
      if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); focusPurLineField(mode, row, col - 1); return; }
      e.preventDefault();
      focusPurLineField(mode, row, col + 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (col === 0) focusPurLineField(mode, row, 1);
      else if (col === 1) focusPurLineField(mode, row, 2);
      else focusPurSearch(mode);
    }
  }, [focusPurLineField, focusPurSearch]);

  useEffect(function () {
    if (!pendingPurFocusRef.current) return;
    var pending = pendingPurFocusRef.current;
    pendingPurFocusRef.current = null;
    var t = setTimeout(function () {
      focusPurLineField(pending.mode, pending.row, pending.col);
    }, 60);
    return function () { clearTimeout(t); };
  }, [f.items, editPur ? editPur.items : null, focusPurLineField]);

  useEffect(function () {
    if (!show && !editPur) return;
    var onKey = function (e) {
      var mode = editPur ? "edit" : "new";
      var tag = String((e.target && e.target.tagName) || "").toLowerCase();
      var isTextInput = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextInput) {
        e.preventDefault();
        focusPurSearch(mode);
      }
      if (e.key === "Escape" && !isTextInput) {
        setShowPurDrop(false);
        setPurDropIdx(-1);
        focusPurSearch(mode);
      }
    };
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [show, editPur, focusPurSearch]);

  useEffect(function () {
    if (show) focusPurSearch("new");
  }, [show, focusPurSearch]);

  useEffect(function () {
    if (editPur) focusPurSearch("edit");
  }, [editPur ? editPur.id : null, focusPurSearch]);
  var [showNewSupp, setShowNewSupp] = useState(false);
  var [newSuppF, setNewSuppF] = useState({ name: "", phone: "", email: "", address: "", note: "" });
  useEffect(function () {
    var handler = function (e) { if (purSearchRef.current && !purSearchRef.current.contains(e.target)) { setShowPurDrop(false); } };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, []);

  var saveNewSupplier = function () {
    if (!newSuppF.name) return;
    var ns = { id: uid(), name: newSuppF.name, phone: newSuppF.phone || "", email: newSuppF.email || "", address: newSuppF.address || "", note: newSuppF.note || "", payable: 0 };
    if (!tcTrialGuard(state.suppliers, 'suppliers')) return;
    var updated = state.suppliers.concat([ns]);
    S.set("tc3_suppliers", updated);
    setState(function (st) { return Object.assign({}, st, { suppliers: updated }); });
    setF(function (x) { return Object.assign({}, x, { supplier: ns.name }); });
    setNewSuppF({ name: "", phone: "", email: "", address: "", note: "" });
    setShowNewSupp(false);
  };

  var printBarcodeLabels = function () {
    var items = barcodeItems || [];
    if (!items.length) return;
    /* Always use the first saved design from the visual designer */
    var savedDesigns = S.get("tc3_labelDesigns", null);
    var d = (savedDesigns && savedDesigns.length > 0) ? savedDesigns[0] : {
      labelW: 60, labelH: 40, bgColor: "#ffffff", borderStyle: "solid",
      elements: [
        { id: "shopname",  type: "shopname",  x: 2, y: 2,  w: 56, h: 5,  fontSize: 7,  fontWeight: "bold",   color: "#1e3a5f", align: "center", visible: true },
        { id: "name",      type: "name",      x: 2, y: 9,  w: 56, h: 7,  fontSize: 9,  fontWeight: "bold",   color: "#000000", align: "center", visible: true },
        { id: "price",     type: "price",     x: 2, y: 18, w: 30, h: 5,  fontSize: 11, fontWeight: "bold",   color: "#000000", align: "left",   visible: true },
        { id: "cost",      type: "cost",      x: 34,y: 18, w: 24, h: 5,  fontSize: 7,  fontWeight: "normal", color: "#888888", align: "right",  visible: true },
        { id: "barcode",   type: "barcode",   x: 2, y: 25, w: 56, h: 12, fontSize: 9,  fontWeight: "normal", color: "#000000", align: "center", visible: true },
        { id: "productid", type: "productid", x: 2, y: 37, w: 56, h: 4,  fontSize: 7,  fontWeight: "normal", color: "#555555", align: "center", visible: true }
      ]
    };
    var labelWmm = d.labelW || 60;
    var labelHmm = d.labelH || 40;
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
      (d.elements || []).forEach(function (el) {
        if (!el.visible) return;
        var val = "";
        if (el.type === "shopname") val = shop;
        else if (el.type === "name") val = it.name;
        else if (el.type === "price") val = getCurrencySymbol() + " " + fmtNum(it.sellPrice || it.price || 0);
        else if (el.type === "cost") val = costEncoded;
        else if (el.type === "productid") val = "ID: " + (it.productId || "");
        else if (el.type === "customtext") val = el.customText || "";
        else if (el.type === "barcode") {
          var bcX = Math.min(el.x, labelWmm - el.w);
          var bcY = Math.min(el.y, labelHmm - el.h);
          var bcH = Math.min(el.h, labelHmm - bcY);
          var svgId = "bc_" + idx + "_" + Math.random().toString(36).slice(2, 7);
          var bcVal = it.barcode || (it.id ? it.id.slice(0, 8) : "000000");
          html += "<div style=\"position:absolute;left:" + (bcX / labelWmm * 100).toFixed(2) + "%;top:" + (bcY / labelHmm * 100).toFixed(2) + "%;width:" + (el.w / labelWmm * 100).toFixed(2) + "%;height:" + (bcH / labelHmm * 100).toFixed(2) + "%;overflow:hidden;display:flex;align-items:center;justify-content:center;\"><svg id=\"" + svgId + "\" data-val=\"" + escapeHtml(bcVal) + "\" data-h=\"" + Math.max(8, Math.round(bcH * 3.7795 - 4)) + "\"></svg></div>";
          return;
        }
        var pct = function (v, total) { return (v / total * 100).toFixed(2) + "%"; };
        html += "<div style=\"position:absolute;left:" + pct(el.x, labelWmm) + ";top:" + pct(el.y, labelHmm) + ";width:" + pct(el.w, labelWmm) + ";height:" + pct(el.h, labelHmm) + ";font-size:" + el.fontSize + "px;font-weight:" + el.fontWeight + ";color:" + el.color + ";overflow:hidden;display:flex;align-items:center;justify-content:" + (el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start") + ";\"><span style=\"width:100%;text-align:" + el.align + "\">" + escapeHtml(val) + "</span></div>";
      });
      html += "</div>";
    });
    html += "<script src=\"https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js\"><\/script>";
    html += "<script>window.onload=function(){setTimeout(function(){document.querySelectorAll('svg[data-val]').forEach(function(s){try{JsBarcode(s,s.getAttribute('data-val'),{format:'CODE128',width:1.2,height:parseInt(s.getAttribute('data-h')||20),displayValue:false,margin:0});}catch(e){}});setTimeout(function(){window.print();},400);},600);};<\/script>";
    html += "</body></html>";
    w.document.write(html);
    w.document.close();
  };

  var fp = state.products.filter(function (p) {
    /* FIX 8: Exclude inactive (soft-deleted) products from purchase search */
    return p.status !== "inactive" && productMatchesSearch(p, ps);
  });

  var formTotal = sumPurchaseLinesStockTotal(f.items);
  var purTaxInclusive = !!(state.settings && state.settings.taxEnabled && state.settings.taxMode === "inclusive");
  var purTaxInput = (state.settings && state.settings.taxEnabled) ? Math.round((parseFloat(f.purchaseTaxAmount) || 0) * 100) / 100 : 0;
  var invoiceTotal = purTaxInclusive
    ? formTotal
    : (purTaxInput > 0.005 ? Math.round((formTotal + purTaxInput) * 100) / 100 : formTotal);
  var formPaid = f.payMode === "paid" ? invoiceTotal : (f.payMode === "partial" ? parseFloat(f.paidAmount) || 0 : 0);
  var formBal = invoiceTotal - formPaid;
  var formStatus = formPaid >= invoiceTotal ? "Paid" : formPaid > 0 ? "Partial" : "Unpaid";

  /* Edit purchase computed totals */
  var editLineTotal = editPur ? sumPurchaseLinesStockTotal(editPur.items || []) : 0;
  var editTaxAmt = editPur && state.settings && state.settings.taxEnabled ? Math.round((parseFloat(editPur.totalTax) || 0) * 100) / 100 : 0;
  var editPurInclusive = !!(editPur && state.settings && state.settings.taxEnabled && (editPur.taxMode === "inclusive" || (editPur.taxMode !== "exclusive" && state.settings.taxMode === "inclusive")));
  var editTotal = editPur ? (editPurInclusive ? editLineTotal : (editTaxAmt > 0.005 ? Math.round((editLineTotal + editTaxAmt) * 100) / 100 : editLineTotal)) : 0;
  var editPaid = editPur ? (editPur.payMode === "paid" ? editTotal : (editPur.payMode === "partial" ? parseFloat(editPur.paidAmount) || 0 : 0)) : 0;
  var editBal = editTotal - editPaid;
  var editStatus = editPaid >= editTotal ? "Paid" : editPaid > 0 ? "Partial" : "Unpaid";

  /* Purchase entry helpers (UI only — uses existing getUnitCostPrice / toProductBaseQty) */
  var purUnitConversionHint = function (prod, unitName) {
    if (!prod || !unitName) return "";
    var f = factorForNamedUnit(prod, unitName);
    var bu = prod.unit || "Pcs";
    if (f == null || f <= 0) return "";
    return "1 " + unitName + " = " + f + " " + bu;
  };
  var purCostSeemsLow = function (prod, unitName, enteredCost, costMode) {
    if (!prod) return false;
    var baseU = prod.unit || "Pcs";
    var un = unitName || baseU;
    var mode = costMode || defaultCostInputMode(prod, un);
    var exp =
      mode === COST_INPUT_PER_BASE
        ? getUnitCostPrice(prod, baseU)
        : getUnitCostPrice(prod, un);
    var ent = parseFloat(enteredCost) || 0;
    if (exp <= 0.001 || ent <= 0) return false;
    return ent < exp * 0.3;
  };

  /** Table row: cost input matches costInputMode (per-base stored in it.cost). */
  var purchaseLineCostFieldShown = function (it, rowProd) {
    if (!rowProd) return Number(it.cost) || 0;
    var iu = it.inputUnit || it.unit || rowProd.unit || "Pcs";
    var mode = it.costInputMode || defaultCostInputMode(rowProd, iu);
    if (mode === COST_INPUT_PER_BASE) return Math.round((Number(it.cost) || 0) * 10000) / 10000;
    return costPerInputUnitFromBase(it.cost || 0, iu, rowProd, toProductBaseQty);
  };

  var syncCostModeAndDefaultsForUnit = function (prod, unitName) {
    if (!prod) return;
    var mode = defaultCostInputMode(prod, unitName);
    setPCostInputMode(mode);
    setPc(String(mode === COST_INPUT_PER_BASE ? getUnitCostPrice(prod, prod.unit || "Pcs") : getUnitCostPrice(prod, unitName)));
  };

  /** Catalogue `product.price` is sell Rs per base unit; line `sellPrice` is per selected purchase unit */
  var catalogSellPricePerBaseFromLine = function (it, product) {
    return catalogSellPricePerBaseFromLineCalc(it, product, toProductBaseQty, getUnitCostPrice, getUnitSellPrice);
  };

  var addEditItem = function () {
    var match = findActiveProductByExactSearch(state.products, ps);
    if (!match) return;
    var unit = match.unit || "Pcs";
    var qtyInput = parseFloat(pq) || 1;
    var selU = resolvePurchaseInputUnit(match, pUnit);
    var inputCostPerUnit = parseFloat(pc);
    if (!isFinite(inputCostPerUnit) || inputCostPerUnit <= 0) {
      inputCostPerUnit =
        pCostInputMode === COST_INPUT_PER_BASE
          ? getUnitCostPrice(match, unit) || 0
          : getUnitCostPrice(match, selU) || 0;
    }
    var econ = normalizePurchaseLineEconomics(qtyInput, selU, inputCostPerUnit, match, toProductBaseQty, pCostInputMode);
    var qty = econ.baseQty;
    var it = {
      id: match.id, name: match.name, barcode: match.barcode || "", unit: unit,
      qty: Math.round(qty * 1000000) / 1000000,
      inputUnit: selU, inputQty: qtyInput,
      cost: econ.unitCostBase,
      lineStockValue: econ.lineStockValue,
      costInputMode: econ.costInputMode,
      sellPrice: parseFloat(pSell) || match.price || 0,
    };
    var iuEdit = selU;
    if (isPurchaseInputUnitMissingFactor(match, iuEdit)) {
      showAlert("X " + purchaseUnitConversionMissingMessage(iuEdit));
      return;
    }
    var pushEditLine = function () {
    var curItems = (editPur && editPur.items) || [];
    var existsIdx = curItems.findIndex(function (i) { return i.id === match.id; });
    pendingPurFocusRef.current = { mode: "edit", row: existsIdx >= 0 ? existsIdx : curItems.length, col: 1 };
    setEditPur(function (x) {
      var items = x.items || [];
      var exists = items.find(function (i) { return i.id === match.id; });
      if (exists) {
        var newQty = Math.round((exists.qty + qty) * 1000000) / 1000000;
        var mergedMoney = lineEconomicValue(exists, match, toProductBaseQty) + lineEconomicValue(it, match, toProductBaseQty);
        var mergedCost = newQty > 0 ? mergedMoney / newQty : it.cost;
        return Object.assign({}, x, {
          items: items.map(function (i) {
            return i.id === match.id ? Object.assign({}, i, {
              qty: newQty,
              cost: Math.round(mergedCost * 10000) / 10000,
              lineStockValue: Math.round(mergedMoney * 100) / 100,
              inputQty: i.inputUnit === it.inputUnit ? Math.round(((Number(i.inputQty) || 0) + qtyInput) * 1000000) / 1000000 : i.inputQty,
              sellPrice: it.sellPrice,
              costInputMode: i.inputUnit === it.inputUnit ? (i.costInputMode || it.costInputMode) : i.costInputMode,
            }) : i;
          }),
        });
      }
      return Object.assign({}, x, { items: items.concat([it]) });
    });
    setPs(""); setPq(1); setPc(""); setPSell(""); setPPickedProduct(null);
    };
    if (purchaseLineBaseUnitLooksLikePackTotal(match, it, getUnitCostPrice, getUnitSellPrice)) {
      showConfirm(purchasePackTotalVsCatalogueMessage(), pushEditLine);
      return;
    }
    pushEditLine();
  };

  var addItem = function (p) {
    var unit = p.unit || "Pcs";
    var qtyInput = parseFloat(pq) || 1;
    var selU = resolvePurchaseInputUnit(p, pUnit);
    var inputCostPerUnit = parseFloat(pc);
    if (!isFinite(inputCostPerUnit) || inputCostPerUnit <= 0) {
      inputCostPerUnit =
        pCostInputMode === COST_INPUT_PER_BASE
          ? getUnitCostPrice(p, unit) || 0
          : getUnitCostPrice(p, selU) || 0;
    }
    var econ = normalizePurchaseLineEconomics(qtyInput, selU, inputCostPerUnit, p, toProductBaseQty, pCostInputMode);
    var qty = econ.baseQty;
    var it = {
      id: p.id, name: p.name, barcode: p.barcode || "", unit: unit,
      qty: Math.round(qty * 1000000) / 1000000,
      inputUnit: selU, inputQty: qtyInput,
      cost: econ.unitCostBase,
      lineStockValue: econ.lineStockValue,
      costInputMode: econ.costInputMode,
      sellPrice: parseFloat(pSell) || p.price || 0,
    };
    var iuAdd = selU;
    if (isPurchaseInputUnitMissingFactor(p, iuAdd)) {
      showAlert("X " + purchaseUnitConversionMissingMessage(iuAdd));
      return;
    }
    var pushPurLine = function () {
    var curItems = f.items || [];
    var existsIdx = curItems.findIndex(function (i) { return i.id === p.id; });
    pendingPurFocusRef.current = { mode: "new", row: existsIdx >= 0 ? existsIdx : curItems.length, col: 1 };
    setF(function (x) {
      var exists = x.items.find(function (i) { return i.id === p.id; });
      if (exists) {
        var newQty = Math.round((exists.qty + qty) * 1000000) / 1000000;
        var mergedMoney = lineEconomicValue(exists, p, toProductBaseQty) + lineEconomicValue(it, p, toProductBaseQty);
        var mergedCost = newQty > 0 ? mergedMoney / newQty : it.cost;
        return Object.assign({}, x, {
          items: x.items.map(function (i) {
            return i.id === p.id ? Object.assign({}, i, {
              qty: newQty,
              cost: Math.round(mergedCost * 10000) / 10000,
              lineStockValue: Math.round(mergedMoney * 100) / 100,
              inputQty: i.inputUnit === it.inputUnit ? Math.round(((Number(i.inputQty) || 0) + qtyInput) * 1000000) / 1000000 : i.inputQty,
              sellPrice: it.sellPrice,
              costInputMode: i.inputUnit === it.inputUnit ? (i.costInputMode || it.costInputMode) : i.costInputMode,
            }) : i;
          }),
        });
      }
      return Object.assign({}, x, { items: x.items.concat([it]) });
    });
    setPs(""); setPq(1); setPc(""); setPSell(""); setPPickedProduct(null);
    };
    if (purchaseLineBaseUnitLooksLikePackTotal(p, it, getUnitCostPrice, getUnitSellPrice)) {
      showConfirm(purchasePackTotalVsCatalogueMessage(), pushPurLine);
      return;
    }
    pushPurLine();
  };

  var addMatchedItem = function () {
    var match = findActiveProductByExactSearch(state.products, ps);
    if (match) addItem(match);
  };

  var purLineTableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" };

  var renderPurLineColgroup = function () {
    return (
      <colgroup>
        <col />
        <col style={{ width: 68 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 108 }} />
        <col style={{ width: 88 }} />
        <col style={{ width: 76 }} />
        <col style={{ width: 34 }} />
      </colgroup>
    );
  };

  var renderPurAddTfoot = function (mode) {
    var qtyId = purAddFieldId(mode, "qty");
    var costId = purAddFieldId(mode, "cost");
    var sellId = purAddFieldId(mode, "sell");
    var searchId = purSearchId(mode);
    var onAdd = mode === "edit" ? addEditItem : addMatchedItem;
    var typedPick = pPickedProduct || findActiveProductByExactSearch(state.products, ps);
    var selU = typedPick ? resolvePurchaseInputUnit(typedPick, pUnit || pBaseUnit) : "Pcs";
    var bu2 = typedPick ? (typedPick.unit || "Pcs") : "Pcs";
    var selU2 = selU;
    var showCostToggle = typedPick && !isProductBaseUnitLabel(typedPick, selU2);
    var unitOpts = typedPick ? getProductUnitRows(typedPick).map(function (r) { return r.name; }) : [];
    var unitRows = typedPick ? getProductUnitRows(typedPick) : [];
    var hint = typedPick ? purUnitConversionHint(typedPick, selU) : null;
    var addBase = typedPick ? toProductBaseQty(parseFloat(pq) || 0, selU, typedPick) : 0;
    var curSt = typedPick ? (typedPick.stock || 0) : 0;
    var afterSt = curSt + addBase;
    var lowCost = typedPick ? purCostSeemsLow(typedPick, selU, pc, pCostInputMode) : false;
    var expCost = typedPick && pCostInputMode === COST_INPUT_PER_BASE ? getUnitCostPrice(typedPick, typedPick.unit || "Pcs") : (typedPick ? getUnitCostPrice(typedPick, selU) : 0);
    var expLbl = typedPick && pCostInputMode === COST_INPUT_PER_BASE ? (typedPick.unit || "base") : selU;
    var glassPur = typedPick && isGlassProduct(typedPick, shopSettings);
    var glassEcon = glassPur ? glassPurchaseEconomics(parseFloat(pq) || 0, parseFloat(pc) || 0, typedPick) : null;
    var inputStyle = { width: "100%", boxSizing: "border-box", border: "1.5px solid #93c5fd", borderRadius: 6, padding: "4px 6px", fontSize: 12, outline: "none", fontFamily: "inherit", background: "#fff" };
    return (
      <tfoot>
        <tr style={{ background: "#f7fbff" }}>
          <td colSpan={7} style={{ padding: "6px 8px", borderTop: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: "uppercase" }}>Add product</div>
            <div style={{ position: "relative" }} ref={purSearchRef}>
              <input value={ps}
                onChange={function (e) { setPs(e.target.value); setShowPurDrop(true); setPurDropIdx(-1); }}
                onFocus={function () { setShowPurDrop(true); }}
                onKeyDown={function (e) {
                  var list = fp.slice(0, 7);
                  if (e.key === "ArrowDown") { e.preventDefault(); setPurDropIdx(function (i) { return Math.min(i + 1, list.length - 1); }); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setPurDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                  if ((e.key === "Enter" || e.key === "Tab") && list.length > 0) {
                    var pick = purDropIdx >= 0 ? list[purDropIdx] : (list.find(function (p) { return productMatchesSearchExact(p, ps); }) || list[0]);
                    if (pick) {
                      var bu = pick.unit || "Pcs";
                      setPs(pick.name); setPBaseUnit(bu); setPUnit(bu); setPPickedProduct(pick);
                      syncCostModeAndDefaultsForUnit(pick, bu); setPSell(String(getUnitSellPrice(pick, bu)));
                      setShowPurDrop(false); setPurDropIdx(-1);
                      e.preventDefault();
                      focusPurAddField(mode, "qty");
                    } else { e.preventDefault(); }
                    return;
                  }
                  if (e.key === "Escape") { setShowPurDrop(false); setPurDropIdx(-1); }
                }}
                placeholder="Search name, ID, barcode, category... (/ or Esc to focus)" id={searchId}
                style={Object.assign({}, inputStyle, { textAlign: "left" })} />
              {showPurDrop && ps.trim().length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 8, zIndex: 9999, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.15)" }}>
                  {fp.slice(0, 7).map(function (p, pidx) {
                    return (
                      <div key={p.id} onClick={function () { var bu = p.unit || "Pcs"; setPs(p.name); setPBaseUnit(bu); setPUnit(bu); setPPickedProduct(p); syncCostModeAndDefaultsForUnit(p, bu); setPSell(String(getUnitSellPrice(p, bu))); setShowPurDrop(false); setPurDropIdx(-1); }} onMouseEnter={function () { setPurDropIdx(pidx); }} onMouseLeave={function () { setPurDropIdx(-1); }} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: purDropIdx === pidx ? C.accentSoft : "#fff" }}>
                        <div>
                          <div style={{ fontWeight: 700, color: C.text }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>{p.category} · {fmtStock(p.stock, p.unit)} in stock</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: C.muted }}>Cost / Sell</div>
                          <div style={{ fontWeight: 700, color: C.blue, fontSize: 12 }}>{getCurrencySymbol()} {fmtNum(p.cost)} / {fmtNum(p.price)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {fp.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>No matching products</div>}
                  <div onClick={function () { setShowPurDrop(false); setNewProdKey(function (k) { return k + 1; }); setNewProd(blankNewProd());; }} style={{ padding: "10px 12px", cursor: "pointer", fontSize: 12, color: C.cyan, fontWeight: 700, borderTop: "1.5px dashed " + C.border, display: "flex", alignItems: "center", gap: 6 }}>
                    + Create "{ps}" as new product
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
        <tr style={{ background: "#f0f9ff", borderTop: "1.5px dashed " + C.border }}>
          <td style={{ padding: "6px 6px 8px" }} />
          <td style={{ padding: "6px 6px 8px", verticalAlign: "bottom" }}>
            <input id={qtyId} type="number" value={pq} min="0"
              step={isDecimalUnit(pUnit || pBaseUnit) ? "0.001" : "1"}
              onChange={function (e) { setPq(e.target.value); }}
              onKeyDown={function (e) {
                if (e.key === "Enter") { e.preventDefault(); focusPurAddField(mode, "cost"); return; }
                if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusPurAddField(mode, "cost"); }
              }}
              style={Object.assign({}, inputStyle, { textAlign: "right", fontWeight: 700 })} />
          </td>
          <td style={{ padding: "6px 6px 8px", verticalAlign: "bottom" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "2px 3px", background: "#f1f5f9", borderRadius: 6, border: "1px solid " + C.borderLight, maxWidth: "100%" }}>
                {(unitOpts.length ? unitOpts : [pBaseUnit || "Pcs"]).map(function (uOpt) {
                  var activeUnit = (pUnit || pBaseUnit) === uOpt;
                  return (
                    <button key={uOpt} type="button"
                      onClick={function () {
                        if (!typedPick) return;
                        setPUnit(uOpt); setPPickedProduct(typedPick);
                        syncCostModeAndDefaultsForUnit(typedPick, uOpt);
                        setPSell(String(getUnitSellPrice(typedPick, uOpt)));
                      }}
                      style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, border: "none", cursor: typedPick ? "pointer" : "default", fontFamily: "inherit", fontWeight: 700, background: activeUnit ? C.accent : "transparent", color: activeUnit ? "#fff" : C.textMd }}>
                      {uOpt}
                    </button>
                  );
                })}
              </div>
              {typedPick && unitRows.filter(function (r) { return r.factor > 1; }).map(function (r) {
                return (
                  <button key={"q-" + mode + "-" + r.name} type="button"
                    onClick={function () { setPUnit(r.name); setPPickedProduct(typedPick); syncCostModeAndDefaultsForUnit(typedPick, r.name); setPSell(String(getUnitSellPrice(typedPick, r.name))); setPq(String((parseFloat(pq) || 0) + 1)); }}
                    style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, border: "1px solid " + C.border, background: "#fff", color: C.accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    +1 {r.name}
                  </button>
                );
              })}
            </div>
          </td>
          <td style={{ padding: "6px 6px 8px", verticalAlign: "bottom" }}>
            {showCostToggle ? (
              <div style={{ display: "flex", gap: 3, marginBottom: 4, flexWrap: "wrap" }}>
                <button type="button" onClick={function () { setPCostInputMode(COST_INPUT_PER_INPUT); }}
                  style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, border: "1px solid " + C.border, background: pCostInputMode === COST_INPUT_PER_INPUT ? C.accentSoft : "#fff", color: C.text, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  /{selU2}
                </button>
                <button type="button" onClick={function () { setPCostInputMode(COST_INPUT_PER_BASE); }}
                  style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, border: "1px solid " + C.border, background: pCostInputMode === COST_INPUT_PER_BASE ? C.accentSoft : "#fff", color: C.text, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  /{bu2}
                </button>
              </div>
            ) : null}
            <input id={costId} type="number" value={pc}
              onChange={function (e) { setPc(e.target.value); }}
              onKeyDown={function (e) {
                if (e.key === "Enter") { e.preventDefault(); focusPurAddField(mode, "sell"); return; }
                if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusPurAddField(mode, "sell"); }
              }}
              placeholder="Cost"
              style={Object.assign({}, inputStyle, { textAlign: "right" })} />
          </td>
          <td style={{ padding: "6px 6px 8px", verticalAlign: "bottom" }}>
            <input id={sellId} type="number" value={pSell}
              onChange={function (e) { setPSell(e.target.value); }}
              onKeyDown={function (e) {
                if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                  e.preventDefault();
                  if (ps.trim()) onAdd();
                }
              }}
              placeholder="Sell"
              style={Object.assign({}, inputStyle, { textAlign: "right" })} />
          </td>
          <td style={{ padding: "6px 6px 8px" }} />
          <td style={{ padding: "6px 4px 8px", verticalAlign: "bottom" }}>
            <button type="button" onClick={function () { onAdd(); }} disabled={!ps.trim()}
              style={{ width: 30, height: 30, borderRadius: 6, border: "none", background: ps.trim() ? "linear-gradient(135deg,#0077e6,#2255d4)" : C.border, color: "#fff", fontWeight: 800, fontSize: 15, cursor: ps.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </td>
        </tr>
        {typedPick ? (
          <tr style={{ background: "#f0f9ff" }}>
            <td colSpan={7} style={{ padding: "0 8px 8px", fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
              {hint ? <div>{hint}</div> : null}
              <div>Current stock: <strong style={{ color: C.text }}>{glassPur ? formatGlassStockLabel(typedPick, fmtNum) : fmtStock(curSt, typedPick.unit || "Pcs")}</strong> · After purchase: <strong style={{ color: C.green }}>{glassPur ? formatGlassStockLabel(Object.assign({}, typedPick, { stock: (typedPick.stock || 0) + (parseFloat(pq) || 0) }), fmtNum) : fmtStock(afterSt, typedPick.unit || "Pcs")}</strong></div>
              {glassPur && glassEcon && (parseFloat(pq) || 0) > 0 && (parseFloat(pc) || 0) > 0 ? (
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 6 }}>
                  {[
                    { label: "Area / Sheet", val: glassEcon.sheetSqFt + " Sq Ft" },
                    { label: "Total Sq Ft", val: fmtNum(glassEcon.totalSqFt) },
                    { label: "Total Sq M", val: fmtNum(glassEcon.totalSqM) },
                    { label: "Cost / Sq Ft", val: getCurrencySymbol() + " " + fmtNum(glassEcon.costPerSqFt) },
                    { label: "Cost / Sq M", val: getCurrencySymbol() + " " + fmtNum(glassEcon.costPerSqM) },
                  ].map(function (row) {
                    return (
                      <div key={row.label} style={{ background: "#f0f4ff", border: "1px solid #dbe3f5", borderRadius: 6, padding: "6px 8px" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>{row.label}</div>
                        <div style={{ fontWeight: 700, color: C.text, marginTop: 2 }}>{row.val}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {lowCost ? <div style={{ color: "#b45309", fontWeight: 700, marginTop: 2 }}>(!) Cost seems low vs catalogue (expected ~{getCurrencySymbol()} {fmtNum(expCost)} per {expLbl})</div> : null}
            </td>
          </tr>
        ) : null}
      </tfoot>
    );
  };

  var doSavePurchase = function (withBarcode, forceSave, skipPackWarn) {
    if (!f.supplier || !f.items.length) return;
    var purInvNo = ensureUniqueDocumentNumber(f.invoiceNo, "PUR", state, {
      excludePurchaseId: editPur ? editPur.id : null,
    });
    var vi, vIt, vPr, vIu;
    for (vi = 0; vi < f.items.length; vi++) {
      vIt = f.items[vi];
      vPr = state.products.find(function (p) { return p.id === vIt.id; });
      if (!vPr) continue;
      vIu = vIt.inputUnit || vIt.unit || vPr.unit || "Pcs";
      if (isPurchaseInputUnitMissingFactor(vPr, vIu)) {
        showAlert("X " + purchaseUnitConversionMissingMessage(vIu));
        return;
      }
    }
    if (!skipPackWarn) {
      for (vi = 0; vi < f.items.length; vi++) {
        vIt = f.items[vi];
        vPr = state.products.find(function (p) { return p.id === vIt.id; });
        if (!vPr) continue;
        var normPack = normalizePurchaseLineItem(vIt, vPr, toProductBaseQty);
        if (purchaseLineBaseUnitLooksLikePackTotal(vPr, normPack, getUnitCostPrice, getUnitSellPrice)) {
          showConfirm(purchasePackTotalVsCatalogueMessage(), function () { doSavePurchase(withBarcode, forceSave, true); });
          return;
        }
      }
    }
    /* Build payment history from splitRows if present, else use legacy single method */
    var splitRows = f.splitRows && f.splitRows.length > 0 ? f.splitRows : null;
    var isCheque = !splitRows && f.cashMethod === "Cheque";
    var effPaid, effBal, effStatus, initPurPh = [];
    var normalizedSaveItems = f.items.map(function (it) {
      var pr = state.products.find(function (p) { return p.id === it.id; });
      return pr ? normalizePurchaseLineItem(it, pr, toProductBaseQty) : it;
    });
    var stockLineTotal = sumPurchaseLinesStockTotal(normalizedSaveItems);
    var taxModeSave = (state.settings && state.settings.taxEnabled)
      ? (state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive")
      : undefined;
    var purTaxSave = (state.settings && state.settings.taxEnabled) ? Math.round((parseFloat(f.purchaseTaxAmount) || 0) * 100) / 100 : 0;
    if (taxModeSave === "inclusive" && purTaxSave <= 0.005 && stockLineTotal > 0) {
      purTaxSave = Math.round((computeSaleTax(state.settings, stockLineTotal).totalTax || 0) * 100) / 100;
    }
    var invoiceTotalSave = taxModeSave === "inclusive"
      ? stockLineTotal
      : (purTaxSave > 0.005 ? Math.round((stockLineTotal + purTaxSave) * 100) / 100 : stockLineTotal);
    var purNetFactor = (taxModeSave === "inclusive" && stockLineTotal > 0 && purTaxSave > 0)
      ? (stockLineTotal - purTaxSave) / stockLineTotal
      : 1;
    if (splitRows) {
      var nonChequePaid = splitRows.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
      var totalSplit = splitRows.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
      effPaid = nonChequePaid;
      effBal = invoiceTotalSave - nonChequePaid;
      effStatus = totalSplit >= invoiceTotalSave ? "Paid" : nonChequePaid > 0 || totalSplit > 0 ? "Partial" : "Unpaid";
      splitRows.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0; if (amt <= 0) return;
        if (row.method !== "Cheque") {
          var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          initPurPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: row.method + (row.note ? ": " + row.note : "") });
        }
      });
    } else {
      effPaid = isCheque ? 0 : formPaid;
      effBal = invoiceTotalSave - effPaid;
      effStatus = effPaid >= invoiceTotalSave ? "Paid" : effPaid > 0 ? "Partial" : "Unpaid";
      if (!isCheque && formPaid > 0) {
        initPurPh = [{ id: uid(), date: today(), amount: formPaid, cashMethod: f.cashMethod || "Cash" }];
      }
    }
    var purAmtErr = validateTxnAmounts("Purchase invoice", invoiceTotalSave, effPaid, effBal);
    if (purAmtErr) { showAlert("X " + purAmtErr); return; }
    var purObj = { id: uid(), supplier: f.supplier, invoiceNo: purInvNo, date: f.date, payMode: f.payMode, items: normalizedSaveItems, total: invoiceTotalSave, paidAmount: effPaid, balance: effBal, status: effStatus, paymentHistory: initPurPh, totalTax: purTaxSave, taxMode: taxModeSave, createdAt: new Date().toISOString() };
    var np = state.products.slice();
    normalizedSaveItems.forEach(function (it) {
      var idx = np.findIndex(function (p) { return p.id === it.id; });
      if (idx >= 0) {
          var oldStock = np[idx].stock || 0;
          var oldCost  = np[idx].cost  || 0;
          var newStock = oldStock + it.qty;
          var lineCostForWac = Math.round((it.cost || 0) * purNetFactor * 100) / 100;
          /* FIX 3: WAC safety — if stock was zero/negative before, or result is zero/negative,
             reset cost to the latest purchase price instead of computing invalid WAC */
          var newAvgCost;
          if (newStock <= 0) {
            /* Stock still zero or negative after purchase — use latest purchase price */
            newAvgCost = lineCostForWac;
          } else if (oldStock <= 0) {
            /* Stock was zero or negative; now positive — reset WAC to this purchase price */
            newAvgCost = lineCostForWac;
          } else {
            /* Normal WAC: both old and new stock are positive */
            newAvgCost = ((oldStock * oldCost) + (it.qty * lineCostForWac)) / newStock;
          }
          var catSell = catalogSellPricePerBaseFromLine(it, np[idx]);
          np[idx] = Object.assign({}, np[idx], {
            stock: newStock,
            cost:  Math.round(newAvgCost * 100) / 100,
            price: catSell != null ? Math.round(catSell * 100) / 100 : np[idx].price
          });
        }
    });
    /* Supplier payable is computed dynamically from purchases via getSupplierPayable(),
       so no need to update s.payable here — prevents drift between static and dynamic values. */
    if (!tcTrialGuard(state.purchases, 'purchases')) return;
    var np2 = state.purchases.concat([purObj]);
    S.set("tc3_products", np); S.set("tc3_purchases", np2);
    addAudit("Created Purchase Invoice", purObj.invoiceNo || purObj.id.slice(0, 8));
    /* Create cheque records from splitRows or legacy chequeList */
    var purStateUpdate = { products: np, purchases: np2 };
    var chequeRowsToCreate = [];
    if (splitRows) {
      splitRows.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0; if (amt <= 0 || row.method !== "Cheque") return;
        chequeRowsToCreate.push({ no: row.chequeNo || "", bank: row.chequeBankName || "", amount: amt, due: row.chequeDueDate || today() });
      });
    } else if (isCheque) {
      chequeRowsToCreate = (f.chequeList || []).filter(function (c) { return c.no.trim() && parseFloat(c.amount) > 0; }).map(function (c) {
        return { no: c.no, bank: c.bank || "", amount: parseFloat(c.amount), due: c.due || today() };
      });
    }
    if (chequeRowsToCreate.length > 0) {
      var newPurCheques = chequeRowsToCreate.map(function (c) {
        return { id: uid(), type: "outgoing", status: "Pending", chequeNo: c.no.trim(), bankName: c.bank.trim(), amount: c.amount, dueDate: c.due, issuedDate: today(), supplierName: f.supplier, purchaseId: purObj.id, purchaseNo: purObj.invoiceNo || "", note: "", createdAt: today() };
      });
      var chqPurPh = newPurCheques.map(function (ch) { return { id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending — due " + ch.dueDate + ")", chequeId: ch.id }; });
      var updPurObj = Object.assign({}, purObj, { paymentHistory: initPurPh.concat(chqPurPh) });
      var np2WithCheque = np2.map(function (p) { return p.id === purObj.id ? updPurObj : p; });
      var nchPur = (state.cheques || []).concat(newPurCheques);
      S.set("tc3_cheques", nchPur); S.set("tc3_purchases", np2WithCheque);
      purStateUpdate = { products: np, purchases: np2WithCheque, cheques: nchPur };
      addAudit(newPurCheques.length + " Cheque(s) Issued " + getCurrencySymbol() + " " + fmtNum(newPurCheques.reduce(function (a, c) { return a + c.amount; }, 0)), purObj.invoiceNo || "");
    }
    setState(function (st) { return Object.assign({}, st, purStateUpdate); });
    if (withBarcode) {
      /* Option C: show label qty popup so user can adjust before printing */
      var qtyRows = normalizedSaveItems.map(function (it) {
        var prod = np.find(function (p) { return p.id === it.id; });
        return {
          id: it.id, name: it.name,
          barcode: prod ? prod.barcode : it.barcode,
          cost: it.cost, sellPrice: it.sellPrice || it.cost,
          productId: prod ? prod.productId : "",
          purchaseQty: parseInt(it.qty, 10) || 1,
          printQty: parseInt(it.qty, 10) || 1
        };
      });
      setLabelQtyModal(qtyRows);
    }
    sessionStorage.removeItem("tc3_dirty");
    setShow(false); setF(BLANK); setPurSplitModal(false);
  };

  var goPurchaseReturn = function () {
    try { sessionStorage.setItem("tc3_returns_tab", "purchasereturn"); } catch (e) { /* ignore */ }
    if (typeof setActive === "function") setActive("returns");
  };

  var voidPurchaseInvoice = function (purchaseId, reason) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void purchases");
      return;
    }
    var result = buildVoidPurchaseUpdates(state, purchaseId, reason);
    if (!result.ok) {
      showAlert(result.error);
      return;
    }
    S.set("tc3_products", result.products);
    S.set("tc3_purchases", result.purchases);
    S.set("tc3_cheques", result.cheques);
    setState(function (st) {
      return Object.assign({}, st, {
        products: result.products,
        purchases: result.purchases,
        cheques: result.cheques,
      });
    });
    addAudit("Voided Purchase Invoice", (result.voidedPurchase.invoiceNo || purchaseId.slice(0, 8)) + (reason ? " — " + reason : ""));
    setVoidPurTarget(null);
    setVoidReason("");
    if (viewPur && viewPur.id === purchaseId) setViewPur(null);
  };

  var promptVoidPurchase = function (pur) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void purchases");
      return;
    }
    var block = voidPurchaseBlockReason(pur, state);
    if (block) {
      showAlert(block);
      return;
    }
    setVoidReason("");
    setVoidPurTarget(pur);
  };

  var saveEditPur = function (skipPackWarn) {
    if (!editPur) return;
    /* Recalculate totals from current items/payment state before saving */
    var normalizedEditItems = (editPur.items || []).map(function (it) {
      var pr = state.products.find(function (p) { return p.id === it.id; });
      return pr ? normalizePurchaseLineItem(it, pr, toProductBaseQty) : it;
    });
    var ei, eraw, epr, eiu;
    for (ei = 0; ei < (editPur.items || []).length; ei++) {
      eraw = editPur.items[ei];
      epr = state.products.find(function (p) { return p.id === eraw.id; });
      if (!epr) continue;
      eiu = eraw.inputUnit || eraw.unit || epr.unit || "Pcs";
      if (isPurchaseInputUnitMissingFactor(epr, eiu)) {
        showAlert("X " + purchaseUnitConversionMissingMessage(eiu));
        return;
      }
    }
    if (!skipPackWarn) {
      for (ei = 0; ei < normalizedEditItems.length; ei++) {
        epr = state.products.find(function (p) { return p.id === normalizedEditItems[ei].id; });
        if (!epr) continue;
        if (purchaseLineBaseUnitLooksLikePackTotal(epr, normalizedEditItems[ei], getUnitCostPrice, getUnitSellPrice)) {
          showConfirm(purchasePackTotalVsCatalogueMessage(), function () { saveEditPur(true); });
          return;
        }
      }
    }
    var eLine = sumPurchaseLinesStockTotal(normalizedEditItems);
    var eTaxMode = (state.settings && state.settings.taxEnabled)
      ? (editPur.taxMode || (state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive"))
      : undefined;
    var eTax = state.settings && state.settings.taxEnabled ? Math.round((parseFloat(editPur.totalTax) || 0) * 100) / 100 : 0;
    if (eTaxMode === "inclusive" && eTax <= 0.005 && eLine > 0) {
      eTax = Math.round((computeSaleTax(state.settings, eLine).totalTax || 0) * 100) / 100;
    }
    var eTot = eTaxMode === "inclusive"
      ? eLine
      : (eTax > 0.005 ? Math.round((eLine + eTax) * 100) / 100 : eLine);
    var ePurNetFactor = (eTaxMode === "inclusive" && eLine > 0 && eTax > 0) ? (eLine - eTax) / eLine : 1;
    var ePaid = editPur.payMode === "paid" ? eTot : (editPur.payMode === "partial" ? parseFloat(editPur.paidAmount) || 0 : 0);
    var eBal = eTot - ePaid;
    var eStat = ePaid >= eTot ? "Paid" : ePaid > 0 ? "Partial" : "Unpaid";
    var purToSave = Object.assign({}, editPur, { items: normalizedEditItems, total: eTot, totalTax: eTax, taxMode: eTaxMode, paidAmount: ePaid, balance: eBal, status: eStat, updatedAt: new Date().toISOString() });
    var editPurAmtErr = validateTxnAmounts("Edited purchase invoice", eTot, ePaid, eBal);
    if (editPurAmtErr) { showAlert("X " + editPurAmtErr); return; }
    var orig = state.purchases.find(function (p) { return p.id === purToSave.id; });
    checkPeriodClose(orig ? orig.date : null, state.settings, function () {

    /* Validate and apply stock rollback when purchase items are edited */
    if (orig && orig.items && purToSave.items) {
      /* Cannot reduce purchase qty below units already sold (conservative bound from current stock). */
      var origQtyByPid = {};
      (orig.items || []).forEach(function (oi) {
        var pid = oi.id;
        origQtyByPid[pid] = (origQtyByPid[pid] || 0) + (Number(oi.qty) || 0);
      });
      var newQtyByPid = {};
      (purToSave.items || []).forEach(function (ni) {
        var pid = ni.id;
        newQtyByPid[pid] = (newQtyByPid[pid] || 0) + (Number(ni.qty) || 0);
      });
      var soldBlock = null;
      Object.keys(origQtyByPid).forEach(function (pid) {
        if (soldBlock) return;
        var origSum = origQtyByPid[pid];
        var newSum = newQtyByPid[pid] || 0;
        if (newSum + 1e-9 >= origSum) return;
        var prod = state.products.find(function (p) { return p.id === pid; });
        var Sstk = prod ? (Number(prod.stock) || 0) : 0;
        var minAllowed = Math.max(0, Math.min(origSum, 2 * origSum - Sstk));
        if (newSum + 1e-9 < minAllowed) {
          soldBlock = "Cannot reduce quantity below already sold amount.";
        }
      });
      if (soldBlock) { showAlert(soldBlock); return; }

      /* Simulate post-edit stock: current stock already includes orig purchase receipt.
         Undo orig lines (subtract old qty), then apply new lines (add new qty). */
      var stockSim = {};
      state.products.forEach(function (p) { stockSim[p.id] = p.stock || 0; });
      (orig.items || []).forEach(function (oi) {
        if (stockSim[oi.id] !== undefined) stockSim[oi.id] -= (oi.qty || 0);
      });
      var stockErr = null;
      (purToSave.items || []).forEach(function (ni) {
        if (stockErr) return;
        if (stockSim[ni.id] !== undefined) {
          stockSim[ni.id] += (ni.qty || 0);
          if (stockSim[ni.id] < 0) {
            var prod = state.products.find(function (p) { return p.id === ni.id; });
            stockErr = "Cannot reduce quantity below already sold amount. (" + (prod ? prod.name : ni.id) + ")";
          }
        }
      });
      if (stockErr) { showAlert(stockErr); return; }

      /* Apply stock rollback then reapply new quantities with CORRECT WAC.
         FIX: Un-blend cost before reapplying to avoid progressive WAC distortion.
         Formula: pre_cost = (currentStock*currentCost - oldQty*oldCost) / (currentStock - oldQty)
         Then apply new purchase on top of pre_cost base. */
      var np = state.products.slice();
      /* Build a map of original purchase costs per product for un-blending */
      var origCostMap = {};
      (orig.items || []).forEach(function (oi) { origCostMap[oi.id] = oi.cost || 0; });

      /* Step 1: Reverse old purchase — un-blend cost AND stock */
      (orig.items || []).forEach(function (oi) {
        np = np.map(function (p) {
          if (p.id !== oi.id) return p;
          var curS = p.stock || 0;
          var curC = p.cost || 0;
          var oldQty = oi.qty || 0;
          var oidCost = oi.cost || 0;
          var preS = curS - oldQty;  /* stock before this purchase was made */
          var preC;
          if (preS <= 0) {
            preC = curC; /* can't un-blend further — keep current cost as base */
          } else {
            /* un-blend: remove old purchase value from total value */
            var totalVal = curS * curC;
            var oldVal = oidCost * oldQty;
            preC = (totalVal - oldVal) / preS;
            if (preC < 0) preC = curC; /* safety: never negative cost */
          }
          return Object.assign({}, p, { stock: preS, cost: Math.round(preC * 100) / 100 });
        });
      });
      /* Step 2: Apply new purchase stock with correct WAC from pre-purchase base */
      (purToSave.items || []).forEach(function (ni) {
        np = np.map(function (p) {
          if (p.id !== ni.id) return p;
          var oldS = p.stock || 0;  /* stock AFTER step 1 = pre-purchase stock */
          var oldC = p.cost || 0;   /* cost AFTER step 1 = pre-purchase cost */
          var newS = oldS + (ni.qty || 0);
          var newC;
          if (newS <= 0) {
            newC = ni.cost || oldC;
          } else if (oldS <= 0) {
            newC = ni.cost || oldC; /* base was empty — just use new purchase cost */
          } else {
            newC = ((oldS * oldC) + ((ni.qty || 0) * (ni.cost || 0))) / newS;
          }
          var catSellEd = catalogSellPricePerBaseFromLine(ni, p);
          return Object.assign({}, p, {
            stock: newS,
            cost: Math.round(newC * 100) / 100,
            price: catSellEd != null ? Math.round(catSellEd * 100) / 100 : p.price
          });
        });
      });
      S.set("tc3_products", np);
      setState(function (st) { return Object.assign({}, st, { products: np }); });
    }

    /* FIX: Reconcile paymentHistory with final paidAmount.
       When payMode is changed to "paid", add a payment entry for the difference so
       getCashBalances deducts the correct cash. When changed to "unpaid", warn user. */
    if (orig) {
      var origPhSum = (orig.paymentHistory || []).reduce(function (a, ph) { return a + (ph.amount || 0); }, 0);
      var diff = Math.round((ePaid - origPhSum) * 100) / 100;
      if (diff !== 0) {
        /* Use most recent real payment method (skip cheque-pending entries with amount=0) */
        var lastMeth = (orig.cashMethod) || "Cash";
        var phList = orig.paymentHistory || [];
        for (var mi = phList.length - 1; mi >= 0; mi--) {
          if (phList[mi].cashMethod && phList[mi].cashMethod !== "Cheque" && (phList[mi].amount || 0) !== 0) {
            lastMeth = phList[mi].cashMethod; break;
          }
        }
        var corrPh = (orig.paymentHistory || []).concat([{
          id: uid(), date: today(), amount: diff, cashMethod: lastMeth,
          note: diff > 0 ? "Payment on edit (payMode: " + editPur.payMode + ")" : "Correction — invoice edited (edit)"
        }]);
        purToSave = Object.assign({}, purToSave, { paymentHistory: corrPh });
      }
    }
    /* FIX 3: Removed stale supplier payable mutation — payable is calculated dynamically
       via getTotalSupplierPayable(). Mutating s.payable here would store stale values in DB. */
    var np2 = state.purchases.map(function (p) { return p.id === purToSave.id ? purToSave : p; });
    S.set("tc3_purchases", np2);
    addAudit("Edited Purchase Invoice", purToSave.invoiceNo || purToSave.id.slice(0, 8));
    setState(function (st) { return Object.assign({}, st, { purchases: np2 }); });
    setEditPur(null);
    }); /* end checkPeriodClose */
  };

  var saveNewProduct = function () {
    if (!newProd) return;
    var nameStr = String(newProd.name == null ? "" : newProd.name).trim();
    if (!nameStr || !newProd.price) return;
    var nameCheck = checkProductName(nameStr, state.products, null);
    if (nameCheck && nameCheck.type === "exact") {
      showAlert("A product named \"" + nameCheck.match + "\" already exists.\nPlease use a different name.");
      return;
    }
    if (newProd.barcode && state.products.find(function (p) { return p.barcode === newProd.barcode; })) {
      showAlert("A product with barcode \"" + newProd.barcode + "\" already exists.");
      return;
    }
    var performPurNewSave = function () {
      /* Force stock=0: purchase qty will add stock when saved — avoids double-counting */
      var glassErr = validateGlassProductForm(newProd, shopSettings);
      if (glassErr) { showAlert(glassErr); return; }
      var unitErr = validateExtraUnits(newProd.unit, newProd.extraUnits || []);
      if (unitErr) { showAlert(unitErr); return; }
      var unitFields = buildUnitsPersistFields({
        unit: newProd.unit,
        cost: newProd.cost,
        price: newProd.price,
        extraUnits: newProd.extraUnits || [],
      });
      var prod = applyGlassProductFields(Object.assign(
        {
          id: uid(),
          productId: nextProductId(state.products),
          name: nameStr,
          barcode: newProd.barcode || genBarcode(),
          category: newProd.category || "General",
          description: newProd.description || "",
          type: (function () { var pt = String(newProd.type || "stock").toLowerCase(); return (pt === "service" || pt === "raw_material") ? pt : "stock"; })(),
          cost: parseFloat(newProd.cost) || 0,
          price: parseFloat(newProd.price) || 0,
          stock: 0,
          damaged: 0,
          require_comment: true,
          comment_label: String(newProd.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
        },
        unitFields
      ), newProd, shopSettings);
      if (!tcTrialGuard(state.products, 'products')) return;
      var np = state.products.concat([prod]);
      S.set("tc3_products", np);
      setState(function (st) { return Object.assign({}, st, { products: np }); });
      setNewProd(null);
      setNewProdKey(function (k) { return k + 1; });
      /* Auto-fill the purchase row with saved product details */
      setPs(""); setPc(String(prod.cost)); setPSell(String(prod.price));
      /* Small delay then set name so product appears in search */
      setTimeout(function () { setPs(prod.name); }, 100);
    };
    var maybeGuardThenPurSave = function () {
      var pt = String(newProd.type || "stock").toLowerCase();
      var isRm = pt === "raw_material";
      if (
        isRm &&
        isRawMaterialGuardBaseUnit(newProd.unit) &&
        rawMaterialEnteredLooksLikePackTotal(newProd.cost, newProd.price, newProd.unit)
      ) {
        showConfirm(rawMaterialPackPricingConfirmMessage(newProd.cost, newProd.price, newProd.unit), performPurNewSave);
        return;
      }
      performPurNewSave();
    };
    if (nameCheck && (nameCheck.type === "likely_same" || nameCheck.type === "reordered")) {
      var dupNamesPur = (nameCheck.matches || []).map(function (m) { return "\"" + m.name + "\""; }).join(", ");
      showConfirm("This looks like a product you already have:\n" + dupNamesPur + "\n\nCreate \"" + nameStr + "\" as a new product anyway?", maybeGuardThenPurSave);
    } else {
      maybeGuardThenPurSave();
    }
  };

  var totalPaid = activePurchases(state.purchases).reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
  var totalBal = activePurchases(state.purchases).reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0);
  var filtered = sortNewestFirst(state.purchases).filter(function (p) {
    var q = search.toLowerCase();
    var mQ = !q || String(p.supplier == null ? "" : p.supplier).toLowerCase().includes(q) || (p.invoiceNo || "").toLowerCase().includes(q);
    var voided = isVoidedTxn(p);
    if (filterStatus === "Active" && voided) return false;
    if (filterStatus === "Voided" && !voided) return false;
    if (filterStatus === "Paid" || filterStatus === "Partial" || filterStatus === "Unpaid") {
      if (voided) return false;
      if (p.status !== filterStatus) return false;
    }
    return mQ;
  });

  var purPager = usePager(filtered, LIST_PAGE_SIZE);
  /* CATS is getCats() — see global */;

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <StatCard money={false} label="Total Purchases" value={state.purchases.length} accent={C.blue} icon="🛒" sub="orders" />
        <StatCard label="Total Paid" value={totalPaid} accent={C.green} icon="OK" />
        <StatCard label="Outstanding" value={totalBal} accent={C.red} icon="!" />
      </div>
      <Card>
        <CardTitle sub={filtered.length.toLocaleString() + " records"} action={<Btn sm col="cyan" onClick={function () { setShow(true); setF(BLANK); }}>+ New Purchase</Btn>}>Purchases</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 2 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search supplier or invoice #..." /></div>
          <div style={{ flex: 1 }}>
            <Sel value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }}>
              <option>Active</option><option>Voided</option><option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
            </Sel>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 960 }}>
            <thead><tr style={{ background: "#f8fafc" }}>
              <TH style={{ width: "8%" }}>Date</TH>
              <TH style={{ width: "14%" }}>Supplier</TH>
              <TH style={{ width: "14%" }}>Invoice #</TH>
              <TH center style={{ width: "5%" }}>Items</TH>
              <TH right style={{ width: "10%" }}>Total</TH>
              <TH right style={{ width: "10%" }}>Paid</TH>
              <TH right style={{ width: "10%" }}>Balance</TH>
              <TH style={{ width: "11%" }}>Status</TH>
              <TH right style={{ width: "18%" }}>Actions</TH>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: C.muted }}>No purchases yet</td></tr>}
              {purPager.slice.map(function (p, i) {
                var purRet = purchaseReturnUiStatus(p, state.purchaseReturns);
                var statusLabel = displayStatusForPurchase(p, state.purchaseReturns);
                var rowBg = isVoidedTxn(p) ? "#fff5f5" : purRet.hasReturns ? "#fff7ed" : (i % 2 === 0 ? "#ffffff" : "#f8fbff");
                return (
                  <tr key={p.id} className="table-row-hover" style={{ background: rowBg, borderBottom: "1px solid " + C.borderLight }} title={purRet.hasReturns ? "This invoice has return activity" : undefined}>
                    <TD>{fmtDate(p.date)}</TD>
                    <TD bold style={{ maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{p.supplier}</TD>
                    <td style={{ padding: "9px 12px", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.invoiceNo || p.id.slice(0, 8)}><span style={{ fontFamily: "monospace", fontSize: 12, color: C.cyan }}>{p.invoiceNo || p.id.slice(0, 8)}</span></td>
                    <TD center>{(p.items || []).length}</TD>
                    <TD bold color={C.blue} right>{getCurrencySymbol()} {fmtNum(p.total)}</TD>
                    <TD color={C.green} right>{getCurrencySymbol()} {fmtNum(p.paidAmount || 0)}</TD>
                    <TD color={Math.max(0, (p.total || 0) - (p.paidAmount || 0)) > 0 ? C.red : C.muted} right>{getCurrencySymbol()} {fmtNum(Math.max(0, (p.total || 0) - (p.paidAmount || 0)))}</TD>
                    <td style={{ padding: "9px 12px", overflow: "hidden", maxWidth: 0 }}>
                      <Badge status={statusLabel} />
                    </td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup>
                        <ActBtn tone="cyan" title="View purchase" onClick={function () { setViewPur(p); }}>🧾</ActBtn>
                        {!isVoidedTxn(p) ? <ActBtn tone="blue" title="Edit purchase" onClick={function () { setEditPur(Object.assign({}, p)); }}>✎</ActBtn> : null}
                        {!isVoidedTxn(p) ? <ActBtn tone="orange" title="Use Purchase Return to reverse stock" onClick={goPurchaseReturn}>↩</ActBtn> : null}
                        {!isVoidedTxn(p) && canDeleteInvoices ? <ActBtn tone="red" title="Void mistaken purchase" onClick={function () { promptVoidPurchase(p); }}>✕</ActBtn> : null}
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager pager={purPager} />
      </Card>

      {/* New Purchase Modal */}
      {show && (
        <Modal title="New Purchase" onClose={function () { setShow(false); setF(BLANK); }} wide>
          {/* ── Row 1: Supplier / Invoice / Date ── */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Supplier *</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={f.supplier} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { supplier: e.target.value }); }); }} style={{ flex: 1, border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none", fontFamily: "inherit" }}>
                  <option value="">Select supplier...</option>
                  {state.suppliers.map(function (s) { return <option key={s.id}>{s.name}</option>; })}
                </select>
                <button onClick={function () { setShowNewSupp(true); setNewSuppF({ name: "", phone: "", email: "", address: "", note: "" }); }} style={{ flexShrink: 0, padding: "9px 14px", background: "linear-gradient(135deg," + C.green + ",#0d9066)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ New Supplier</button>
              </div>
            </div>
            <Input label="Purchase Invoice #" value={f.invoiceNo} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }} />
            <Input label="Date" type="date" value={f.date} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} applyPeriodLockMin={!!props.periodLockTransactionMinDate} periodLockTransactionMinDate={props.periodLockTransactionMinDate} />
          </div>

          {/* ── Row 2: Two columns — Product Search LEFT, Payment RIGHT ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, marginBottom: 18 }}>

            {/* LEFT: Add Products */}
            <div style={{ background: "#f8faff", borderRadius: 12, padding: "16px 18px", border: "1.5px solid " + C.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add Products</div>
                <button onClick={function () { setNewProdKey(function(k){return k+1;}); setNewProd(blankNewProd());; }} style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#0077e6,#2255d4)", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + New Product
                </button>
              </div>

              {/* ── Product lines + add row (compact table) ── */}
              <div style={{ border: "1.5px solid " + C.border, borderRadius: 10, overflow: "hidden" }}>
                <table style={purLineTableStyle}>
                  {renderPurLineColgroup()}
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      {["Product", "Qty", "Unit", "Cost", "Sell", "Total", ""].map(function (h, hi) {
                        return (
                          <th key={hi} style={{ textAlign: hi >= 3 && hi <= 5 ? "right" : "left", padding: "5px 6px", fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid " + C.borderLight }}>{h}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(f.items || []).map(function (it, idx) {
                      var lineU = it.inputUnit || it.unit || "Pcs";
                      var rowProd = state.products.find(function (p) { return p.id === it.id; });
                      var lineTot = purchaseLineStockTotal(it);
                      var costField = purchaseLineCostFieldShown(it, rowProd);
                      return (
                        <tr key={it.id || idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafbff", borderBottom: "1px solid " + C.borderLight }}>
                          <td style={{ padding: "4px 6px", fontWeight: 600, color: C.text, maxWidth: 200 }}>{it.name}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right", width: 72 }}>
                            <input type="number" value={it.qty} min="0" step="any"
                              data-purmode="new"
                              data-purrow={idx}
                              data-purcol={0}
                              onChange={function (e) {
                                var v = parseFloat(e.target.value); if (isNaN(v)) v = 0;
                                setF(function (x) {
                                  return Object.assign({}, x, {
                                    items: (x.items || []).map(function (r, i) {
                                      if (i !== idx) return r;
                                      var pr = state.products.find(function (p) { return p.id === r.id; });
                                      var iu = r.inputUnit || r.unit || (pr && pr.unit) || "Pcs";
                                      var factor = pr ? toProductBaseQty(1, iu, pr) : 1;
                                      var newInputQty = factor > 0 ? Math.round((v / factor) * 1000000) / 1000000 : r.inputQty;
                                      var ucb = Number(r.cost) || 0;
                                      var lsv = Math.round(v * ucb * 100) / 100;
                                      return Object.assign({}, r, { qty: v, inputQty: newInputQty != null ? newInputQty : r.inputQty, lineStockValue: lsv });
                                    }),
                                  });
                                });
                              }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "new", idx, 0); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px", fontSize: 11, color: C.accent, fontWeight: 700, whiteSpace: "nowrap" }} title="Storage base unit qty">{lineU}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <input type="number" value={costField}
                              data-purmode="new"
                              data-purrow={idx}
                              data-purcol={1}
                              onChange={function (e) {
                                var raw = parseFloat(e.target.value) || 0;
                                setF(function (x) {
                                  return Object.assign({}, x, {
                                    items: (x.items || []).map(function (r, i) {
                                      if (i !== idx) return r;
                                      var pr = state.products.find(function (p) { return p.id === r.id; });
                                      if (!pr) return Object.assign({}, r, { cost: raw, lineStockValue: Math.round((Number(r.qty) || 0) * raw * 100) / 100 });
                                      var iu = r.inputUnit || r.unit || pr.unit || "Pcs";
                                      var cm = r.costInputMode || defaultCostInputMode(pr, iu);
                                      var qb = Number(r.qty) || 0;
                                      var ucb;
                                      var lsv;
                                      if (cm === COST_INPUT_PER_BASE) {
                                        ucb = raw;
                                        lsv = Math.round(qb * ucb * 100) / 100;
                                      } else {
                                        ucb = unitCostBaseFromInputCost(raw, iu, pr, toProductBaseQty);
                                        lsv = Math.round(qb * ucb * 100) / 100;
                                      }
                                      return Object.assign({}, r, { cost: ucb, lineStockValue: lsv, costInputMode: cm });
                                    }),
                                  });
                                });
                              }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "new", idx, 1); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", minWidth: 72, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px" }}>
                            <input type="number" value={it.sellPrice}
                              data-purmode="new"
                              data-purrow={idx}
                              data-purcol={2}
                              onChange={function (e) { setF(function (x) { return Object.assign({}, x, { items: (x.items || []).map(function (r, i) { return i === idx ? Object.assign({}, r, { sellPrice: parseFloat(e.target.value) || 0 }) : r; }) }); }); }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "new", idx, 2); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", minWidth: 72, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: C.blue, fontSize: 12, whiteSpace: "nowrap" }}>{getCurrencySymbol()} {fmtNum(lineTot)}</td>
                          <td style={{ padding: "4px 4px", width: 30 }}>
                            <CloseIconButton size={26} borderRadius={5} tone="danger" onClick={function () { setF(function (x) { return Object.assign({}, x, { items: (x.items || []).filter(function (_, i) { return i !== idx; }) }); }); }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {renderPurAddTfoot("new")}
                </table>
              </div>
              {ps.trim().length > 0 && fp.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>"{ps}" not found.</span>
                  <button onClick={function () { setNewProdKey(function(k){return k+1;}); setNewProd(blankNewProd());; }} style={{ background: C.accentSoft, color: C.accent, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Create as new product</button>
                </div>
              )}
            </div>

            {/* RIGHT: Payment Panel */}
            <div style={{ background: "#f0f9ff", borderRadius: 12, padding: "16px 18px", border: "1.5px solid #bae6fd", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.07em" }}>Payment</div>

              {/* Radio-style payment options */}
              {[["paid", "Fully Paid", C.green, "#dcfce7", "#86efac"], ["partial", "Partially Paid", "#d97706", "#fef3c7", "#fcd34d"], ["unpaid", "Not Paid", C.red, "#fee2e2", "#fca5a5"]].map(function (opt) {
                var v = opt[0]; var lbl = opt[1]; var clr = opt[2]; var bg = opt[3]; var bdr = opt[4];
                var active = f.payMode === v;
                return (
                  <div key={v} onClick={function () { setF(function (x) { return Object.assign({}, x, { payMode: v, paidAmount: "" }); }); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 9, border: "2px solid " + (active ? bdr : C.border), background: active ? bg : "#fff", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (active ? clr : C.border), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {active && <div style={{ width: 9, height: 9, borderRadius: "50%", background: clr }}></div>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? clr : C.textMd }}>{lbl}</span>
                  </div>
                );
              })}

              {/* Partial amount input */}
              {f.payMode === "partial" && (
                <div>
                  <Input label="Amount Paid (Rs)" type="number" value={f.paidAmount} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { paidAmount: e.target.value }); }); }} placeholder="0" />
                </div>
              )}

              {/* Single Pay button — opens SplitPaymentModal */}
              {f.payMode !== "unpaid" && (
                <div>
                  {(f.splitRows && f.splitRows.length > 0) ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", marginBottom: 6 }}>Payment Method</div>
                      <div style={{ background: "#f0f9f4", borderRadius: 9, padding: "10px 12px", border: "1px solid #9ee8ce", marginBottom: 6 }}>
                        {f.splitRows.map(function (r, i) {
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                              <span style={{ color: C.textMd }}>{r.method === "Cheque" ? "🏷 " : r.method === "Bank" ? "🏦 " : "💵 "}{r.method}{r.method === "Cheque" && r.chequeNo ? " #" + r.chequeNo : ""}</span>
                              <strong style={{ color: r.method === "Cheque" ? "#d97706" : C.green }}>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}{r.method === "Cheque" ? " (pending)" : ""}</strong>
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={function () { setPurSplitModal(true); }} style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1.5px dashed #0369a1", background: "#e0f2fe", color: "#0369a1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏️ Edit Payment</button>
                    </div>
                  ) : (
                    <button onClick={function () { setPurSplitModal(true); }}
                      style={{ width: "100%", padding: "11px", borderRadius: 9, border: "2px solid #0369a1", background: "#0369a1", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      💰 Set Payment Method
                    </button>
                  )}
                </div>
              )}

              {/* Summary box */}
              <div style={{ borderTop: "1.5px solid #bae6fd", paddingTop: 12, display: "flex", flexDirection: "column", gap: 7, marginTop: "auto" }}>
                {state.settings && state.settings.taxEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Input VAT (optional — for GL VAT Receivable)</div>
                    <Input label="" type="number" min="0" step="0.01" value={f.purchaseTaxAmount || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { purchaseTaxAmount: e.target.value }); }); }} placeholder="0.00" />
                  </div>
                )}
                {purTaxInput > 0.005 ? (
                  <React.Fragment>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                      <span>Lines (stock value)</span>
                      <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(formTotal)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                      <span>Input VAT</span>
                      <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(purTaxInput)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                      <span>Invoice total</span>
                      <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(invoiceTotal)}</strong>
                    </div>
                  </React.Fragment>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                    <span>Total</span>
                    <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(formTotal)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                  <span>Paid</span>
                  <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(formPaid)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px dashed #bae6fd", paddingTop: 7 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>Balance</span>
                  <strong style={{ color: formBal > 0 ? C.red : C.green, fontSize: 15 }}>{getCurrencySymbol()} {fmtNum(formBal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}><Badge status={formStatus} /></div>
              </div>
            </div>
          </div>

          {f.items.length === 0 && (
            <div style={{ textAlign: "center", padding: "22px 0", color: C.muted, fontSize: 13, marginBottom: 16, background: "#f8faff", borderRadius: 10, border: "1.5px dashed " + C.border }}>
              No products added yet — search and add products above
            </div>
          )}

          {/* ── Footer Actions ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1.5px solid " + C.border }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {f.items.length > 0 ? f.items.length + " product(s) · " + fmtSumQty(f.items.reduce(function (a, it) { return a + it.qty; }, 0)) + " units" : "Add products to continue"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn col="gray" onClick={function () { setShow(false); setF(BLANK); }}>Cancel</Btn>
              <Btn col="blue" onClick={function () { doSavePurchase(false); }} disabled={!f.supplier || !f.items.length}>Save Purchase</Btn>
              <Btn col="cyan" onClick={function () { doSavePurchase(true); }} disabled={!f.supplier || !f.items.length}>Save + Print Barcodes</Btn>
            </div>
          </div>
        </Modal>
      )}

      {viewPur && (function () {
        var viewPurRet = purchaseReturnUiStatus(viewPur, state.purchaseReturns);
        var viewPurStatus = displayStatusForPurchase(viewPur, state.purchaseReturns);
        return (
        <Modal title={"Purchase - " + (viewPur.invoiceNo || viewPur.id.slice(0, 8))} onClose={function () { setViewPur(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Purchase Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                <div><strong>Supplier:</strong> {viewPur.supplier}</div>
                <div><strong>PO No:</strong> <span style={{ fontFamily: "monospace", color: C.accent }}>{viewPur.invoiceNo}</span></div>
                <div><strong>Date:</strong> {fmtDateFull(viewPur.date)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>Status:</strong> <Badge status={viewPurStatus} />
                  {viewPurRet.hasReturns ? <span title="This invoice has return activity" style={{ fontSize: 10, fontWeight: 800, color: "#c2410c" }}>↩ Returns linked</span> : null}
                </div>
              </div>
            </div>
            <PaymentBreakdown invoice={Object.assign({}, viewPur, { paid: viewPur.paidAmount || 0 })} cheques={state.cheques || []} isSale={false} />
          </div>
          {viewPurRet.hasReturns ? (
            <ReturnDetailsPanel
              mode="purchase"
              rows={viewPurRet.rows}
              originalId={viewPur.id}
              C={C}
              getCurrencySymbol={getCurrencySymbol}
              fmtNum={fmtNum}
              fmtDateFull={fmtDateFull}
            />
          ) : null}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8fafc" }}><TH>Product</TH><TH>Qty</TH><TH>Cost</TH><TH>Sell Price</TH><TH>Total</TH></tr></thead>
            <tbody>
              {(viewPur.items || []).map(function (it, i) {
                var vp = state.products.find(function (p) { return p.id === it.id; });
                var vu = it.inputUnit || it.unit || (vp && vp.unit) || "Pcs";
                var showCost = vp ? costPerInputUnitFromBase(Number(it.cost) || 0, vu, vp, toProductBaseQty) : (Number(it.cost) || 0);
                var lineAmt = purchaseLineStockTotal(it);
                return (
                  <TR key={i} i={i}>
                    <TD bold>{it.name || "Unknown Product"}</TD>
                    <TD center title="Base storage qty">{fmtNum(it.qty)}{it.inputQty != null ? <span style={{ fontSize: 10, color: C.muted }}><br />({fmtNum(it.inputQty)} {vu})</span> : null}</TD>
                    <TD>{getCurrencySymbol()} {fmtNum(showCost)} <span style={{ fontSize: 10, color: C.muted }}>/ {vu}</span></TD>
                    <TD>{it.sellPrice ? getCurrencySymbol() + " " + fmtNum(it.sellPrice) : "-"}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(lineAmt)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {!isVoidedTxn(viewPur) && canDeleteInvoices ? (
              <Btn col="red" onClick={function () { promptVoidPurchase(viewPur); }}>Void Purchase</Btn>
            ) : null}
            <Btn col="gray" onClick={function () { setViewPur(null); }}>Close</Btn>
          </div>
        </Modal>
        );
      })()}

      {editPur && (
        <Modal title={"Update Purchase — " + (editPur.invoiceNo || editPur.id.slice(0, 8))} onClose={function () { setEditPur(null); }} wide>
          {/* ── Row 1: Supplier / Invoice / Date ── */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Supplier *</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={editPur.supplier || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { supplier: e.target.value }); }); }} style={{ flex: 1, border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none", fontFamily: "inherit" }}>
                  <option value="">Select supplier...</option>
                  {state.suppliers.map(function (s) { return <option key={s.id}>{s.name}</option>; })}
                </select>
                <button onClick={function () { setShowNewSupp(true); setNewSuppF({ name: "", phone: "", email: "", address: "", note: "" }); }} style={{ flexShrink: 0, padding: "9px 14px", background: "linear-gradient(135deg," + C.green + ",#0d9066)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ New Supplier</button>
              </div>
            </div>
            <Input label="Purchase Invoice #" value={editPur.invoiceNo || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }} />
            <Input label="Date" type="date" value={editPur.date || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} applyPeriodLockMin={!!props.periodLockTransactionMinDate} periodLockTransactionMinDate={props.periodLockTransactionMinDate} />
          </div>

          {/* ── Row 2: Product Search LEFT, Payment RIGHT ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, marginBottom: 18 }}>

            {/* LEFT: Add Products */}
            <div style={{ background: "#f8faff", borderRadius: 12, padding: "16px 18px", border: "1.5px solid " + C.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add Products</div>
                <button onClick={function () { setNewProdKey(function(k){return k+1;}); setNewProd(blankNewProd());; }} style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#0077e6,#2255d4)", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + New Product
                </button>
              </div>

              {/* ── Product lines + add row (Edit — same layout as new purchase) ── */}
              <div style={{ border: "1.5px solid " + C.border, borderRadius: 10, overflow: "hidden" }}>
                <table style={purLineTableStyle}>
                  {renderPurLineColgroup()}
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      {["Product", "Qty", "Unit", "Cost", "Sell", "Total", ""].map(function (h, hi) {
                        return (
                          <th key={hi} style={{ textAlign: hi >= 3 && hi <= 5 ? "right" : "left", padding: "5px 6px", fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid " + C.borderLight }}>{h}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(editPur.items || []).map(function (it, idx) {
                      var lineTotEd = purchaseLineStockTotal(it);
                      var lineUEd = it.inputUnit || it.unit || "Pcs";
                      var rowProdEd = state.products.find(function (p) { return p.id === it.id; });
                      var costFieldEd = purchaseLineCostFieldShown(it, rowProdEd);
                      return (
                        <tr key={it.id || idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafbff", borderBottom: "1px solid " + C.borderLight }}>
                          <td style={{ padding: "4px 6px", fontWeight: 600, color: C.text, maxWidth: 200 }}>{it.name}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right", width: 72 }}>
                            <input type="number" value={it.qty} min="0" step="any"
                              data-purmode="edit"
                              data-purrow={idx}
                              data-purcol={0}
                              onChange={function (e) {
                                var v = parseFloat(e.target.value); if (isNaN(v)) v = 0;
                                setEditPur(function (x) {
                                  return Object.assign({}, x, {
                                    items: x.items.map(function (r, i) {
                                      if (i !== idx) return r;
                                      var pr = state.products.find(function (p) { return p.id === r.id; });
                                      var iu = r.inputUnit || r.unit || (pr && pr.unit) || "Pcs";
                                      var factor = pr ? toProductBaseQty(1, iu, pr) : 1;
                                      var newInputQty = factor > 0 ? Math.round((v / factor) * 1000000) / 1000000 : r.inputQty;
                                      var ucb = Number(r.cost) || 0;
                                      var lsv = Math.round(v * ucb * 100) / 100;
                                      return Object.assign({}, r, { qty: v, inputQty: newInputQty != null ? newInputQty : r.inputQty, lineStockValue: lsv });
                                    }),
                                  });
                                });
                              }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "edit", idx, 0); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px", fontSize: 11, color: C.accent, fontWeight: 700, whiteSpace: "nowrap" }} title="Purchase unit">{lineUEd}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <input type="number" value={costFieldEd}
                              data-purmode="edit"
                              data-purrow={idx}
                              data-purcol={1}
                              onChange={function (e) {
                                var raw = parseFloat(e.target.value) || 0;
                                setEditPur(function (x) {
                                  return Object.assign({}, x, {
                                    items: x.items.map(function (r, i) {
                                      if (i !== idx) return r;
                                      var pr = state.products.find(function (p) { return p.id === r.id; });
                                      if (!pr) return Object.assign({}, r, { cost: raw, lineStockValue: Math.round((Number(r.qty) || 0) * raw * 100) / 100 });
                                      var iu = r.inputUnit || r.unit || pr.unit || "Pcs";
                                      var cm = r.costInputMode || defaultCostInputMode(pr, iu);
                                      var qb = Number(r.qty) || 0;
                                      var ucb;
                                      var lsv;
                                      if (cm === COST_INPUT_PER_BASE) {
                                        ucb = raw;
                                        lsv = Math.round(qb * ucb * 100) / 100;
                                      } else {
                                        ucb = unitCostBaseFromInputCost(raw, iu, pr, toProductBaseQty);
                                        lsv = Math.round(qb * ucb * 100) / 100;
                                      }
                                      return Object.assign({}, r, { cost: ucb, lineStockValue: lsv, costInputMode: cm });
                                    }),
                                  });
                                });
                              }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "edit", idx, 1); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", minWidth: 72, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px" }}>
                            <input type="number" value={it.sellPrice}
                              data-purmode="edit"
                              data-purrow={idx}
                              data-purcol={2}
                              onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { items: x.items.map(function (r, i) { return i === idx ? Object.assign({}, r, { sellPrice: parseFloat(e.target.value) || 0 }) : r; }) }); }); }}
                              onKeyDown={function (e) { handlePurLineFieldKey(e, "edit", idx, 2); }}
                              onFocus={function (e) { e.target.select(); }}
                              style={{ width: "100%", minWidth: 72, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }} />
                          </td>
                          <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: C.blue, fontSize: 12, whiteSpace: "nowrap" }}>{getCurrencySymbol()} {fmtNum(lineTotEd)}</td>
                          <td style={{ padding: "4px 4px", width: 30 }}>
                            <CloseIconButton size={26} borderRadius={5} tone="danger" onClick={function () { setEditPur(function (x) { return Object.assign({}, x, { items: x.items.filter(function (_, i) { return i !== idx; }) }); }); }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {renderPurAddTfoot("edit")}
                </table>
              </div>
              {ps.trim().length > 0 && fp.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>"{ps}" not found.</span>
                  <button onClick={function () { setNewProdKey(function(k){return k+1;}); setNewProd(blankNewProd());; }} style={{ background: C.accentSoft, color: C.accent, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Create as new product</button>
                </div>
              )}
            </div>

            {/* RIGHT: Payment Panel */}
            <div style={{ background: "#f0f9ff", borderRadius: 12, padding: "16px 18px", border: "1.5px solid #bae6fd", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.07em" }}>Payment</div>
              {[["paid", "Fully Paid", C.green, "#dcfce7", "#86efac"], ["partial", "Partially Paid", "#d97706", "#fef3c7", "#fcd34d"], ["unpaid", "Not Paid", C.red, "#fee2e2", "#fca5a5"]].map(function (opt) {
                var v = opt[0]; var lbl = opt[1]; var clr = opt[2]; var bg = opt[3]; var bdr = opt[4];
                var active = editPur.payMode === v;
                return (
                  <div key={v} onClick={function () { setEditPur(function (x) { return Object.assign({}, x, { payMode: v, paidAmount: "" }); }); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 9, border: "2px solid " + (active ? bdr : C.border), background: active ? bg : "#fff", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (active ? clr : C.border), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {active && <div style={{ width: 9, height: 9, borderRadius: "50%", background: clr }}></div>}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: active ? clr : C.text }}>{lbl}</span>
                  </div>
                );
              })}
              {state.settings && state.settings.taxEnabled && (
                <Input label="Input VAT (optional)" type="number" min="0" step="0.01" value={editPur.totalTax != null && editPur.totalTax !== "" ? editPur.totalTax : ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { totalTax: e.target.value }); }); }} placeholder="0" />
              )}
              {editPur.payMode === "partial" && (
                <Input label="Amount Paid" type="number" value={editPur.paidAmount || ""} onChange={function (e) {
                  var newPaid = parseFloat(e.target.value) || 0;
                  setEditPur(function (x) {
                    var orig = (typeof state !== "undefined" ? state : {purchases: []}).purchases
                      ? (state.purchases || []).find(function (p) { return p.id === x.id; })
                      : null;
                    var origPaid = orig ? (orig.paidAmount || 0) : 0;
                    var diff = Math.round((newPaid - origPaid) * 100) / 100;
                    var existingPh = (orig ? (orig.paymentHistory || []) : (x.paymentHistory || [])).slice();
                    if (diff !== 0) {
                      /* Distribute adjustment proportionally across Cash and Bank */
                      var pCash = 0; var pBank = 0;
                      existingPh.forEach(function (e) {
                        if (!e.cashMethod || e.cashMethod === "Cheque" || (e.amount || 0) === 0) return;
                        if (e.cashMethod === "Bank") pBank += e.amount; else pCash += e.amount;
                      });
                      var pTotal = pCash + pBank;
                      if (pTotal <= 0 || pBank <= 0) {
                        existingPh = existingPh.concat([{ id: uid(), date: today(), amount: diff, cashMethod: pBank > 0 ? "Bank" : "Cash", note: "Manual adjustment (edit)" }]);
                      } else if (pCash <= 0) {
                        existingPh = existingPh.concat([{ id: uid(), date: today(), amount: diff, cashMethod: "Bank", note: "Manual adjustment (edit)" }]);
                      } else {
                        var pcCorr = Math.round(diff * (pCash / pTotal) * 100) / 100;
                        var pbCorr = Math.round((diff - pcCorr) * 100) / 100;
                        if (pcCorr !== 0) existingPh = existingPh.concat([{ id: uid(), date: today(), amount: pcCorr, cashMethod: "Cash", note: "Manual adjustment (edit)" }]);
                        if (pbCorr !== 0) existingPh = existingPh.concat([{ id: uid(), date: today(), amount: pbCorr, cashMethod: "Bank", note: "Manual adjustment (edit)" }]);
                      }
                    }
                    return Object.assign({}, x, { paidAmount: newPaid, paymentHistory: existingPh });
                  });
                }} placeholder="0.00" />
              )}
              <div style={{ borderTop: "1.5px solid #bae6fd", paddingTop: 12, display: "flex", flexDirection: "column", gap: 7, marginTop: "auto" }}>
                {editTaxAmt > 0.005 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                    <span>Lines (stock)</span>
                    <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(editLineTotal)}</strong>
                  </div>
                )}
                {editTaxAmt > 0.005 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                    <span>Input VAT</span>
                    <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(editTaxAmt)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                  <span>{editTaxAmt > 0.005 ? "Invoice total" : "Total"}</span>
                  <strong style={{ color: C.text }}>{getCurrencySymbol()} {fmtNum(editTotal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}>
                  <span>Paid</span>
                  <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(editPaid)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px dashed #bae6fd", paddingTop: 7 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>Balance</span>
                  <strong style={{ color: editBal > 0 ? C.red : C.green, fontSize: 15 }}>{getCurrencySymbol()} {fmtNum(editBal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}><Badge status={editStatus} /></div>
              </div>
            </div>
          </div>

          {(editPur.items || []).length === 0 && (
            <div style={{ textAlign: "center", padding: "22px 0", color: C.muted, fontSize: 13, marginBottom: 16, background: "#f8faff", borderRadius: 10, border: "1.5px dashed " + C.border }}>
              No products added yet — search and add products above
            </div>
          )}

          {/* ── Footer Actions ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1.5px solid " + C.border }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              {(editPur.items || []).length > 0 ? (editPur.items || []).length + " product(s) · " + fmtSumQty((editPur.items || []).reduce(function (a, it) { return a + it.qty; }, 0)) + " units" : "Add products to continue"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn col="gray" onClick={function () { setEditPur(null); }}>Cancel</Btn>
              <Btn col="blue" onClick={saveEditPur} disabled={!editPur.supplier || !(editPur.items || []).length}>Update Purchase</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* New Purchase split payment modal */}
      {purSplitModal && (
        <SplitPaymentModal
          title={"Set Payment — " + (f.invoiceNo || "New Purchase")}
          invoiceTotal={invoiceTotal}
          alreadyPaid={0}
          isSale={false}
          onSave={function (splits) {
            setF(function (x) {
              var totalNonCheque = splits.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
              var totalAll = splits.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
              var newPayMode = totalAll >= invoiceTotal ? "paid" : totalNonCheque > 0 || totalAll > 0 ? "partial" : "unpaid";
              return Object.assign({}, x, { splitRows: splits, payMode: newPayMode, paidAmount: String(totalNonCheque) });
            });
            setPurSplitModal(false);
          }}
          onClose={function () { setPurSplitModal(false); }}
        />
      )}
      {labelQtyModal && (
        <Modal title="Barcode Labels — Set Print Quantity" onClose={function () { setLabelQtyModal(null); }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
            Adjust how many labels to print per product. Default = purchase quantity.
          </div>
          <div style={{ border: "1.5px solid " + C.border, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", background: "#f1f5f9", padding: "8px 12px", gap: 8 }}>
              {["PRODUCT", "PURCHASED", "PRINT QTY"].map(function (h) {
                return <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>;
              })}
            </div>
            {labelQtyModal.map(function (row, idx) {
              return (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", padding: "9px 12px", gap: 8, alignItems: "center", borderTop: "1px solid " + C.borderLight, background: idx % 2 === 0 ? "#fff" : "#fafbff" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{row.name}</div>
                  <div style={{ textAlign: "center", fontSize: 13, color: C.muted, fontWeight: 700 }}>{row.purchaseQty}</div>
                  <input type="number" min="0" value={row.printQty}
                    onChange={function (e) {
                      var v = parseInt(e.target.value, 10) || 0;
                      setLabelQtyModal(function (prev) { return prev.map(function (r) { return r.id === row.id ? Object.assign({}, r, { printQty: v }) : r; }); });
                    }}
                    style={{ width: "100%", border: "1.5px solid " + C.accent, borderRadius: 6, padding: "6px 8px", fontSize: 13, textAlign: "center", outline: "none", fontFamily: "inherit", fontWeight: 700, color: C.accent }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              Total labels: <strong style={{ color: C.text }}>{labelQtyModal.reduce(function (a, r) { return a + r.printQty; }, 0)}</strong>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn col="gray" onClick={function () { setLabelQtyModal(null); }}>Cancel</Btn>
              <Btn col="cyan" onClick={function () {
                var labels = [];
                labelQtyModal.forEach(function (row) {
                  for (var i = 0; i < row.printQty; i++) {
                    labels.push({ id: row.id, name: row.name, barcode: row.barcode, cost: row.cost, sellPrice: row.sellPrice, productId: row.productId });
                  }
                });
                setLabelQtyModal(null);
                setBarcodeItems(labels);
              }} disabled={labelQtyModal.reduce(function (a, r) { return a + r.printQty; }, 0) === 0}>
                🖨️ Print {labelQtyModal.reduce(function (a, r) { return a + r.printQty; }, 0)} Labels
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {barcodeItems && (
        <Modal title={"Print Barcode Labels — " + barcodeItems.length + " labels"} onClose={function () { setBarcodeItems(null); }} wide>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }} className="no-print">
            <Btn col="cyan" onClick={printBarcodeLabels}>Print Labels</Btn>
            <Btn col="gray" sm onClick={function () { setBarcodeItems(null); }}>Close</Btn>
            <div style={{ marginLeft: "auto", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 7, padding: "8px 14px", fontSize: 12, color: "#0369a1" }}>Cipher key: <strong>{state.settings.costCodeWord || COST_KEY}</strong> (digits 1–9,0 → letters 1st–10th)</div>
          </div>
          <BarcodeLabelSheet items={barcodeItems} shopName={state.settings.shopName} barcodeSettings={state.settings} />
        </Modal>
      )}

      {newProd && (
        <Modal key={"newprod-" + newProdKey} title={"Add New Product — ID: " + nextProductId(state.products)} onClose={function () { setNewProd(null); }} wide>
          <div style={{ background: C.accentSoft, borderRadius: 8, padding: "9px 14px", fontSize: 12, color: C.accent, marginBottom: 12 }}>Product will be added to inventory. Stock will be updated when the purchase is saved.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Product Name *" value={newProd.name} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} onFocus={newNameHint.onNameFocus} onBlur={newNameHint.onNameBlur} />
            <ProductNameDuplicateHint name={newProd.name} products={state.products} C={C} visible={newNameHint.visible} onDismiss={newNameHint.onDismiss} />
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Product ID</label>
                <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, background: "#f3f4f6", color: C.accent, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.05em" }}>{nextProductId(state.products)}</div>
              </div>
              <Input label="Barcode" value={newProd.barcode || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
            </div>
            <CategorySelect Sel={Sel} value={newProd.category || "General"} settings={shopSettings} onChange={function (e) { onProductCategoryChange(setNewProd, e.target.value); }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label={glassCostPriceLabels(newProd, shopSettings).cost} type="number" value={newProd.cost || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
              <Input label={glassCostPriceLabels(newProd, shopSettings).sell} type="number" value={newProd.price || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} />
              <Sel label="Product Type" value={newProd.type || "stock"} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
                <option value="stock">Stock</option>
                <option value="service">Service</option>
                <option value="raw_material">Raw Material</option>
              </Sel>
              <Sel label="Base Unit" value={newProd.unit || getDefaultProductUnit(shopSettings, newProd.category)} onChange={function (e) {
                var nextUnit = e.target.value;
                setNewProd(function (x) { return Object.assign({}, x, { unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit)); });
              }}>{getUnitsForSubCategory(newProd.category, shopSettings).map(function (u) { return <option key={u}>{u}</option>; })}</Sel>
            </div>
            {isGlassStockProductForm(newProd, shopSettings) && (
              <GlassSheetInfo form={newProd} setForm={setNewProd} C={C} Input={Input} Sel={Sel} />
            )}
            {!isGlassStockProductForm(newProd, shopSettings) && newProd.category && (
              <div style={{ fontSize: 11, color: C.muted }}>
                Units for this category: {getUnitsForSubCategory(newProd.category, shopSettings).join(", ")}
              </div>
            )}
            <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, marginBottom: 4 }}>Additional units (optional)</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Each <strong>factor</strong> is how many <strong>{newProd.unit || "Pcs"}</strong> (base) are in one of that unit. Stock is always kept in base units.</div>
              {(newProd.extraUnits || []).map(function (row, idx) {
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(80px,1fr) 88px minmax(72px,1fr) minmax(72px,1fr) 34px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                    <Input label="Unit name" value={row.name || ""} onChange={function (e) { var v = e.target.value; setNewProd(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { name: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="Strip / Box" />
                    <Input label="Factor" type="number" value={row.factor || ""} onChange={function (e) { var v = e.target.value; setNewProd(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { factor: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="e.g. 12" />
                    <Input label="Sell (opt.)" type="number" value={row.sellPrice || ""} onChange={function (e) { var v = e.target.value; setNewProd(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { sellPrice: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <Input label="Cost (opt.)" type="number" value={row.cost || ""} onChange={function (e) { var v = e.target.value; setNewProd(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { cost: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <button type="button" onClick={function () { setNewProd(function (x) { var next = (x.extraUnits || []).filter(function (_, j) { return j !== idx; }); return Object.assign({}, x, { extraUnits: next }); }); }} style={{ height: 36, borderRadius: 8, border: "1.5px solid " + C.border, background: "#fff", cursor: "pointer", fontSize: 14, color: C.red }} title="Remove">✕</button>
                  </div>
                );
              })}
              <button type="button" onClick={function () { setNewProd(function (x) { return Object.assign({}, x, { extraUnits: (x.extraUnits || []).concat([{ name: "", factor: "", sellPrice: "", cost: "" }]) }); }); }} style={{ marginTop: 4, padding: "6px 12px", borderRadius: 8, border: "1.5px dashed " + C.accent, background: C.accentSoft, color: C.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Add Unit</button>
            </div>
            {String(newProd.type || "").toLowerCase() === "raw_material" ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
                {RAW_MATERIAL_PRICE_COST_HINT}
              </div>
            ) : null}
            {newProd.cost && newProd.price && (
              <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 16 }}>
                <span>Profit/unit: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum((parseFloat(newProd.price) || 0) - (parseFloat(newProd.cost) || 0))}</strong></span>
                <span>Margin: <strong style={{ color: C.accent }}>{(parseFloat(newProd.price) || 0) > 0 ? Math.round(((parseFloat(newProd.price) || 0) - (parseFloat(newProd.cost) || 0)) / (parseFloat(newProd.price) || 1) * 100) : 0}%</strong></span>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes (optional)</label>
              <textarea value={newProd.description || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Product specs, features, notes..." />
            </div>
            {getBusinessProfile().name === "Jewelry & Watches" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Weight (grams)" type="number" value={newProd.weightGrams || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { weightGrams: e.target.value }); }); }} placeholder="e.g. 5.25" />
                <Input label="Making Charge" type="number" value={newProd.makingCharge || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { makingCharge: e.target.value }); }); }} placeholder="e.g. 500" />
              </div>
            )}
            {getBusinessProfile().modules.expiry && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Expiry Date" type="date" value={newProd.expiryDate || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { expiryDate: e.target.value }); }); }} />
                <Input label="Batch / Lot Number (optional)" value={newProd.batchNo || ""} onChange={function (e) { setNewProd(function (x) { return Object.assign({}, x, { batchNo: e.target.value }); }); }} placeholder="e.g. BATCH-2025-001" />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Btn col="cyan" onClick={saveNewProduct} disabled={!newProd.name || !newProd.price || newProductNameExactDup}>Save Product</Btn>
              <Btn col="gray" onClick={function () { setNewProd(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      {showNewSupp && (
        <Modal title="Add New Supplier" onClose={function () { setShowNewSupp(false); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#2e7d32" }}>
              This supplier will be saved and automatically selected in the current purchase.
            </div>
            <Input label="Name *" value={newSuppF.name} onChange={function (e) { setNewSuppF(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Phone" value={newSuppF.phone} onChange={function (e) { setNewSuppF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
              <Input label="Email" value={newSuppF.email} onChange={function (e) { setNewSuppF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} />
            </div>
            <Input label="Address" value={newSuppF.address} onChange={function (e) { setNewSuppF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} />
            <Input label="Note (optional)" value={newSuppF.note} onChange={function (e) { setNewSuppF(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn col="green" onClick={saveNewSupplier} disabled={!newSuppF.name}>Save Supplier</Btn>
              <Btn col="gray" onClick={function () { setShowNewSupp(false); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      {voidPurTarget && (
        <Modal title={"Void Purchase — " + (voidPurTarget.invoiceNo || voidPurTarget.id.slice(0, 8))} onClose={function () { setVoidPurTarget(null); setVoidReason(""); }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
            This will remove stock added by this purchase and reverse payments. The record stays as <strong>Voided</strong>. Cannot void if units were already sold.
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn col="red" disabled={!voidReason} onClick={function () { voidPurchaseInvoice(voidPurTarget.id, voidReason); }}>Void Purchase</Btn>
            <Btn col="gray" onClick={function () { setVoidPurTarget(null); setVoidReason(""); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
});

export default Purchases;


