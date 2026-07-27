import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { purchaseReturnUiStatus, displayStatusForPurchase } from "../utils/returnDisplay.js";
import { getJsBarcodeInlineScriptTag } from "../utils/jsBarcodeLib.js";

function purchaseStatusMeta(status) {
  var s = String(status || "");
  if (s === "Paid") return { icon: "✓", tone: "paid", label: "Paid" };
  if (s === "Partial") return { icon: "◐", tone: "partial", label: "Partial" };
  if (s === "Unpaid") return { icon: "✕", tone: "unpaid", label: "Unpaid" };
  if (s === "Partially Returned") return { icon: "↩", tone: "return", label: "Part. Return" };
  if (s === "Returned") return { icon: "↻", tone: "returned", label: "Returned" };
  if (s === "Voided") return { icon: "—", tone: "void", label: "Voided" };
  return { icon: "•", tone: "other", label: s || "—" };
}
import { buildVoidPurchaseUpdates, isVoidedTxn, activePurchases, VOID_REASON_OPTIONS, voidPurchaseBlockReason, computeVoidPurchaseRefundHint } from "../utils/voidInvoice.js";
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
  purchaseUnitConversionMissingMessage,
  isPurchaseInputUnitMissingFactor,
  resolvePurchaseInputUnit,
  purchaseLineBaseUnitLooksLikePackTotal,
  purchasePackTotalVsCatalogueMessage,
  catalogSellPricePerBaseFromLine as catalogSellPricePerBaseFromLineCalc,
} from "../utils/purchaseUnitGuard.js";
import { stampProductStock, stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import {
  acquireInvoiceEditLockSynced,
  buildInvoiceEditLockIdentity,
  checkForeignInvoiceEditLock,
  findActiveInvoiceEditLock,
  formatInvoiceEditLockMessage,
  INVOICE_EDIT_LOCK_HEARTBEAT_MS,
  INVOICE_EDIT_LOCK_OWNERSHIP_MS,
  readInvoiceEditLocks,
  refreshInvoiceEditLocksFromServer,
  releaseInvoiceEditLock,
  renewInvoiceEditLockSynced,
} from "../utils/invoiceEditLocks.js";
import { pushKeysNow } from "../utils/concurrencyGuards.js";
import {
  productMatchesSearch,
  productMatchesSearchExact,
  findActiveProductByExactSearch,
} from "../utils/productSearch.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";
import AddNewProductModal, { blankNewProductForm } from "../components/AddNewProductModal.jsx";
import AddPartyModal from "../components/AddPartyModal.jsx";
import { createAndPersistSupplier } from "../utils/supplierCreate.js";
import { COMPUTER_SHOP_EDITION, DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import {
  isGlassProduct,
  isGlassStockProductForm,
  applyGlassProductFields,
  glassFormFieldsOnUnitChange,
  glassPurchaseEconomics,
  formatGlassStockLabel,
} from "../utils/glassProduct.js";
import { getUnitsForSubCategory, hydrateShopSettings, getDefaultProductCategory, getDefaultProductUnit } from "../utils/categoryGroups.js";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { PurchaseInvoiceDoc } from "../components/PurchaseInvoiceDoc.jsx";
import { resolveDefaultPrintFormat } from "../utils/printFormat.js";
import UniversalPrintPreview from "../components/UniversalPrintPreview.jsx";

/* Survives ActivePage remount (purchases → purchase-entry). Do not clear until entry applies it. */
var _purchasePrefillHandoff = null;

function stashPurchasePrefill(S, payload) {
  _purchasePrefillHandoff = payload || null;
  try {
    if (S && typeof S.set === "function") S.set("tc3_purchase_prefill", payload || null);
  } catch (_e) { /* ignore */ }
  try {
    if (payload) sessionStorage.setItem("tc3_purchase_prefill", JSON.stringify(payload));
    else sessionStorage.removeItem("tc3_purchase_prefill");
  } catch (_e2) { /* ignore */ }
}

function peekPurchasePrefill(S) {
  if (_purchasePrefillHandoff && _purchasePrefillHandoff.editingPurchaseId) {
    return _purchasePrefillHandoff;
  }
  try {
    var fromS = S && typeof S.get === "function" ? S.get("tc3_purchase_prefill", null) : null;
    if (fromS && fromS.editingPurchaseId) return fromS;
  } catch (_e) { /* ignore */ }
  try {
    var raw = sessionStorage.getItem("tc3_purchase_prefill");
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.editingPurchaseId) return parsed;
    }
  } catch (_e2) { /* ignore */ }
  return null;
}

function clearPurchasePrefill(S) {
  _purchasePrefillHandoff = null;
  try {
    if (S && typeof S.set === "function") S.set("tc3_purchase_prefill", null);
  } catch (_e) { /* ignore */ }
  try { sessionStorage.removeItem("tc3_purchase_prefill"); } catch (_e2) { /* ignore */ }
}

var Purchases = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var genPurNo = props.genPurNo;
  var today = props.today;
  var S = props.S;
  var shopSettings = hydrateShopSettings(state.settings, S.get("tc3_businessType", null));
  var blankNewProd = function (extra) {
    return blankNewProductForm(shopSettings, genBarcode, Object.assign({ stock: "0" }, extra || {}));
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
  var openSourceDocument = props.openSourceDocument;
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
  var openNewPurchase = typeof props.openNewPurchase === "function"
    ? props.openNewPurchase
    : function () { if (typeof setActive === "function") setActive("purchase-entry"); };
  var viewMode = props.viewMode === "entry" ? "entry" : "list";
  var goPurchasesList = function () {
    clearPurchasePrefill(S);
    if (typeof setActive === "function") setActive("purchases");
  };
  var onUnsavedPurchaseLeave = typeof props.onUnsavedPurchaseLeave === "function"
    ? props.onUnsavedPurchaseLeave
    : null;
  var SplitPaymentModal = props.SplitPaymentModal;
  var PaymentBreakdown = props.PaymentBreakdown;
  var BarcodeLabelSheet = props.BarcodeLabelSheet;
  var canDeleteInvoices = props.canDeleteInvoices === true;
  var showPermissionDenied = typeof props.showPermissionDenied === "function"
    ? props.showPermissionDenied
    : function () { showAlert("You do not have permission for this action."); };
  var lockIdentity = buildInvoiceEditLockIdentity({
    currentUser: props.currentUser || null,
    clientMachineLabel: String(props.clientMachineLabel || "").trim(),
  });
  var COST_KEY = props.COST_KEY;
  var BLANK = { supplier: "", invoiceNo: genPurNo(), date: today(), payMode: "unpaid", paidAmount: "", cashMethod: "Cash", items: [], chequeList: [], splitRows: [], purchaseTaxAmount: "", note: "", attachments: [], invDiscount: "0.00", invDiscountType: "%" };
  var purchaseToEntryForm = function (pur) {
    var paid = Number(pur.paidAmount) || 0;
    var tot = Number(pur.total) || 0;
    var payMode = pur.payMode || (tot > 0 && paid >= tot - 0.005 ? "paid" : (paid > 0.005 ? "partial" : "unpaid"));
    return {
      supplier: pur.supplier || "",
      invoiceNo: pur.invoiceNo || "",
      date: pur.date || today(),
      payMode: payMode,
      paidAmount: paid ? String(paid) : "",
      cashMethod: pur.cashMethod || "Cash",
      items: (pur.items || []).map(function (it) { return Object.assign({}, it); }),
      chequeList: [],
      splitRows: [],
      purchaseTaxAmount: pur.totalTax != null ? String(pur.totalTax) : "",
      note: pur.note || "",
      attachments: (pur.attachments || []).slice(),
      invDiscount: pur.discountValue != null ? String(pur.discountValue) : (pur.invDiscount != null ? String(pur.invDiscount) : "0.00"),
      invDiscountType: pur.discountType || pur.invDiscountType || "%",
    };
  };
  var PUR_CART_ICON = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3949AB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
  var [purChqForm, setPurChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [show, setShow] = useState(false);
  var [editingPurchaseId, setEditingPurchaseId] = useState(function () {
    if (viewMode !== "entry") return "";
    var pf = peekPurchasePrefill(S);
    return pf && pf.editingPurchaseId ? String(pf.editingPurchaseId) : "";
  });
  var [f, setF] = useState(function () {
    if (viewMode !== "entry") return BLANK;
    var pf = peekPurchasePrefill(S);
    if (pf && pf.form) return pf.form;
    return BLANK;
  });
  var [editPur, setEditPur] = useState(null);
  var [editLockBusy, setEditLockBusy] = useState(false);
  var [lockTick, setLockTick] = useState(0);
  var [viewPur, setViewPur] = useState(null);
  var [viewPurFmt, setViewPurFmt] = useState(function () {
    return resolveDefaultPrintFormat(state.settings || {});
  });
  var openPurchaseDoc = function (p) {
    if (!p) return;
    if (typeof openSourceDocument === "function") {
      openSourceDocument({ sourceKind: "purchase", sourceId: p.id });
      return;
    }
    setViewPur(p);
  };
  var WABtn = props.WABtn;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK || "";
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var [barcodeItems, setBarcodeItems] = useState(null);
  var [labelQtyModal, setLabelQtyModal] = useState(null);
  var [purSplitModal, setPurSplitModal] = useState(false);
  /* newProd declared here so the Ctrl++ useEffect below can safely reference setNewProd */
  var [newProd, setNewProd] = useState(null);

  var [newProdKey, setNewProdKey] = useState(0);

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
  var [dateFrom, setDateFrom] = useState("");
  var [dateTo, setDateTo] = useState("");
  var [filterSupplier, setFilterSupplier] = useState("");
  var [filterPayStatus, setFilterPayStatus] = useState("");
  var [sideDatePreset, setSideDatePreset] = useState("all");
  var [sideSupplier, setSideSupplier] = useState("");
  var [sideStatus, setSideStatus] = useState("Active");
  var [sidePayStatus, setSidePayStatus] = useState("");
  var [voidPurTarget, setVoidPurTarget] = useState(null);
  var [voidReason, setVoidReason] = useState("");
  var [voidRefundConfirm, setVoidRefundConfirm] = useState(false);
  var purSearchRef = useRef(null);
  var suppSearchRef = useRef(null);
  var purDateRef = useRef(null);
  var pendingPurFocusRef = useRef(null);
  var [showPurDrop, setShowPurDrop] = useState(false);
  var [purDropIdx, setPurDropIdx] = useState(-1);
  var [purDropPos, setPurDropPos] = useState(null);
  var [suppSearch, setSuppSearch] = useState(function () {
    if (viewMode !== "entry") return "";
    var pf = peekPurchasePrefill(S);
    return pf && pf.suppSearch ? String(pf.suppSearch) : (pf && pf.form && pf.form.supplier ? String(pf.form.supplier) : "");
  });
  var [showSuppDrop, setShowSuppDrop] = useState(false);
  var [suppDropIdx, setSuppDropIdx] = useState(-1);
  var [suppDropPos, setSuppDropPos] = useState(null);
  var [heldPurchases, setHeldPurchases] = useState(function () {
    try { return S.get("tc3_held_purchases", []) || []; } catch (_e) { return []; }
  });
  var [activeHeldPurId, setActiveHeldPurId] = useState(null);
  var [showHoldModal, setShowHoldModal] = useState(false);
  var PUR_PROD_DROP_LIMIT = 20;
  var PUR_SUPP_DROP_LIMIT = 20;

  var openPurDatePicker = useCallback(function () {
    var el = purDateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return; } catch (_e) { /* fall through */ }
    }
    el.focus();
    el.click();
  }, []);

  var updatePurDropPos = useCallback(function () {
    try {
      var wrap = purSearchRef.current;
      if (!wrap) return;
      var el = wrap.querySelector("input") || wrap;
      var r = el.getBoundingClientRect();
      setPurDropPos({
        top: Math.round(r.bottom + 4),
        left: Math.round(r.left),
        width: Math.round(Math.max(r.width, 360)),
      });
    } catch (_e) { /* ignore */ }
  }, []);

  var updateSuppDropPos = useCallback(function () {
    try {
      var wrap = suppSearchRef.current;
      if (!wrap) return;
      var el = wrap.querySelector("input") || wrap;
      var r = el.getBoundingClientRect();
      setSuppDropPos({
        top: Math.round(r.bottom + 4),
        left: Math.round(r.left),
        width: Math.round(r.width),
      });
    } catch (_e) { /* ignore */ }
  }, []);

  useEffect(function () {
    if (!showPurDrop) return;
    updatePurDropPos();
    var onWin = function () { updatePurDropPos(); };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return function () {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [showPurDrop, ps, updatePurDropPos]);

  useEffect(function () {
    if (!showSuppDrop) return;
    updateSuppDropPos();
    var onWin = function () { updateSuppDropPos(); };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return function () {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [showSuppDrop, suppSearch, updateSuppDropPos]);

  var resolvedPurPick = pPickedProduct || (ps.trim() ? findActiveProductByExactSearch(state.products, ps) : null);
  var resolvedPurPickKey = resolvedPurPick
    ? String(resolvedPurPick.id || "") + ":" + String(resolvedPurPick.unit || "Pcs")
    : "";

  useEffect(function () {
    if (!resolvedPurPick) return;
    var bu = resolvedPurPick.unit || "Pcs";
    setPBaseUnit(bu);
    setPUnit(function (prev) { return resolvePurchaseInputUnit(resolvedPurPick, prev); });
  }, [resolvedPurPickKey]);

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
    if (viewMode !== "entry") return;
    var pf = peekPurchasePrefill(S);
    if (pf && pf.editingPurchaseId && pf.form) {
      setEditingPurchaseId(String(pf.editingPurchaseId));
      setF(pf.form);
      setSuppSearch(pf.suppSearch || pf.form.supplier || "");
    } else if (!editingPurchaseId) {
      resetPurchaseEntryForm();
    }
    refreshHeldPurchases();
    focusSupplierInput();
    /* Delay clear so React remount can re-read the same handoff. */
    var t = setTimeout(function () { clearPurchasePrefill(S); }, 600);
    return function () { clearTimeout(t); };
  }, [viewMode]);

  /* Drop any leftover edit handoff when returning to the list. */
  useEffect(function () {
    if (viewMode !== "list") return;
    clearPurchasePrefill(S);
  }, [viewMode]);

  /* Keep leave-hold snapshot + dirty flag in sync (same pattern as Sales) */
  useEffect(function () {
    if (viewMode !== "entry") {
      if (window._techon_pur_snapshot) window._techon_pur_snapshot = null;
      return;
    }
    var itemCount = (f.items || []).length;
    window._techon_pur_snapshot = {
      form: f,
      suppSearch: suppSearch,
      activeHeldPurId: activeHeldPurId,
      items: f.items || [],
      invoiceNo: f.invoiceNo || "",
      supplier: f.supplier || "",
      _activeHeldId: activeHeldPurId,
    };
    try {
      if (itemCount > 0) sessionStorage.setItem("tc3_dirty", "purchase");
      else if (sessionStorage.getItem("tc3_dirty") === "purchase") sessionStorage.removeItem("tc3_dirty");
    } catch (_e) { /* ignore */ }
  }, [viewMode, f, suppSearch, activeHeldPurId]);

  useEffect(function () {
    if (viewMode !== "entry") return;
    return function () {
      window._techon_pur_snapshot = null;
    };
  }, [viewMode]);

  useEffect(function () {
    if (viewMode !== "entry") return;
    var onBeforeUnload = function (e) {
      if ((f.items || []).length > 0) {
        e.preventDefault();
        e.returnValue = "You have an unsaved purchase. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return function () { window.removeEventListener("beforeunload", onBeforeUnload); };
  }, [viewMode, f.items]);

  useEffect(function () {
    if (show) {
      setSuppSearch(f.supplier || "");
      setShowSuppDrop(false);
      focusPurSearch("new");
    }
  }, [show, focusPurSearch]);

  useEffect(function () {
    if (editPur) {
      setSuppSearch(editPur.supplier || "");
      setShowSuppDrop(false);
      focusPurSearch("edit");
    }
  }, [editPur ? editPur.id : null, focusPurSearch]);
  var [showAddParty, setShowAddParty] = useState(false);
  var [addPartyInitial, setAddPartyInitial] = useState({ name: "", phone: "", address: "", email: "", note: "" });

  /* Entry shortcuts: F4/F6 split, F7 save, F8 barcodes, F9 hold, Esc cancel.
     F11 (new purchase) / F12 (add product) are handled globally in App.jsx. */
  useEffect(function () {
    var openNewProductModal = function () {
      if (purSplitModal || showAddParty || labelQtyModal || barcodeItems) return;
      if (newProd) return;
      setNewProdKey(function (k) { return k + 1; });
      setNewProd(blankNewProd());
    };
    var onAddProduct = function () { openNewProductModal(); };
    window.addEventListener("tc3-add-product", onAddProduct);
    try {
      if (viewMode === "entry" && sessionStorage.getItem("tc3_pending_add_product") === "1") {
        sessionStorage.removeItem("tc3_pending_add_product");
        openNewProductModal();
      }
    } catch (_e) { /* ignore */ }

    var handler = function (e) {
      if (viewMode !== "entry") {
        if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
          if (!show) return;
          e.preventDefault();
          openNewProductModal();
        }
        return;
      }

      var modalOpen = !!(purSplitModal || newProd || showAddParty || labelQtyModal || barcodeItems);
      var key = e.key;
      var code = e.keyCode;

      if (key === "F4" || code === 115) {
        if (modalOpen) return;
        e.preventDefault();
        setPurSplitModal(true);
        return;
      }
      if (key === "F6" || code === 117) {
        if (modalOpen) return;
        e.preventDefault();
        setPurSplitModal(true);
        return;
      }
      if (key === "F7" || code === 118) {
        if (modalOpen) return;
        e.preventDefault();
        if (f.supplier && (f.items || []).length && typeof doSavePurchase === "function") doSavePurchase(false);
        return;
      }
      if (key === "F8" || code === 119) {
        if (modalOpen) return;
        e.preventDefault();
        if (f.supplier && (f.items || []).length && typeof doSavePurchase === "function") doSavePurchase(true);
        return;
      }
      if (key === "F9" || code === 120) {
        if (modalOpen) return;
        e.preventDefault();
        if (typeof holdCurrentPurchase === "function") holdCurrentPurchase();
        return;
      }
      if (key === "Escape" || code === 27) {
        if (showPurDrop || showSuppDrop) {
          e.preventDefault();
          setShowPurDrop(false);
          setPurDropIdx(-1);
          setShowSuppDrop(false);
          setSuppDropIdx(-1);
          return;
        }
        if (purSplitModal) { e.preventDefault(); setPurSplitModal(false); return; }
        if (newProd) { e.preventDefault(); setNewProd(null); return; }
        if (showAddParty) { e.preventDefault(); setShowAddParty(false); return; }
        if (labelQtyModal || barcodeItems) return;
        e.preventDefault();
        if (typeof requestLeavePurchaseEntry === "function") requestLeavePurchaseEntry("purchases");
        return;
      }
      if (e.ctrlKey && (key === "=" || key === "+" || code === 187 || code === 107)) {
        if (modalOpen) return;
        e.preventDefault();
        openNewProductModal();
      }
    };
    window.addEventListener("keydown", handler);
    return function () {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("tc3-add-product", onAddProduct);
    };
  }, [show, viewMode, f, activeHeldPurId, purSplitModal, newProd, showAddParty, labelQtyModal, barcodeItems, showPurDrop, showSuppDrop]);

  useEffect(function () {
    var handler = function (e) {
      if (purSearchRef.current && !purSearchRef.current.contains(e.target)) setShowPurDrop(false);
      if (suppSearchRef.current && !suppSearchRef.current.contains(e.target)) setShowSuppDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, []);

  var handleCreatePurchaseSupplier = function (draft) {
    var result = createAndPersistSupplier({
      suppliers: state.suppliers,
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    try { pushKeysNow([["tc3_suppliers", (state.suppliers || []).concat([result.supplier])]]); } catch (_e) { /* ignore */ }
    return result.supplier;
  };

  var handlePurchaseSupplierSaved = function (created) {
    if (!created) return;
    setF(function (x) { return Object.assign({}, x, { supplier: created.name }); });
    if (editPur) setEditPur(function (x) { return Object.assign({}, x, { supplier: created.name }); });
    setSuppSearch(created.name);
    setShowSuppDrop(false);
    setShowAddParty(false);
  };

  var filteredSuppliers = useMemo(function () {
    var q = String(suppSearch || "").toLowerCase().trim();
    var list = state.suppliers || [];
    if (!q) return list.slice(0, PUR_SUPP_DROP_LIMIT);
    return list.filter(function (s) {
      var name = String(s.name || "").toLowerCase();
      var phone = String(s.phone || "").toLowerCase();
      var email = String(s.email || "").toLowerCase();
      return name.indexOf(q) >= 0 || phone.indexOf(q) >= 0 || email.indexOf(q) >= 0;
    }).slice(0, PUR_SUPP_DROP_LIMIT);
  }, [state.suppliers, suppSearch]);

  var pickSupplier = function (name) {
    var n = name || "";
    setSuppSearch(n);
    setShowSuppDrop(false);
    setSuppDropIdx(-1);
    if (editPur) setEditPur(function (x) { return Object.assign({}, x, { supplier: n }); });
    else setF(function (x) { return Object.assign({}, x, { supplier: n }); });
    focusPurSearch(editPur ? "edit" : "new");
  };

  var focusSupplierInput = useCallback(function () {
    setTimeout(function () {
      try {
        var el = document.querySelector(".erp-pur-entry .erp-pur-supp-search-input")
          || document.querySelector(".erp-pur-supp-search-input");
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 80);
  }, []);

  var renderSupplierPicker = function () {
    var current = editPur ? (editPur.supplier || "") : (f.supplier || "");
    var purMode = editPur ? "edit" : "new";
    return (
      <div className="erp-pur-mock-supplier-row">
        <div className="erp-pur-supp-search" ref={suppSearchRef}>
          <span className="erp-pur-supp-search-ico" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="text"
            className="erp-pur-supp-search-input"
            id="pur-supplier-search"
            value={suppSearch}
            placeholder="Search supplier..."
            autoComplete="off"
            onChange={function (e) {
              var v = e.target.value;
              setSuppSearch(v);
              setShowSuppDrop(true);
              setSuppDropIdx(-1);
              updateSuppDropPos();
              if (editPur) setEditPur(function (x) { return Object.assign({}, x, { supplier: "" }); });
              else setF(function (x) { return Object.assign({}, x, { supplier: "" }); });
            }}
            onFocus={function () {
              /* Keep dropdown closed on focus/autofocus — open only when typing or ArrowDown */
              if (!suppSearch && current) setSuppSearch(current);
            }}
            onKeyDown={function (e) {
              var list = filteredSuppliers;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!showSuppDrop) {
                  setShowSuppDrop(true);
                  updateSuppDropPos();
                  setSuppDropIdx(list.length > 0 ? 0 : -1);
                } else {
                  setSuppDropIdx(function (i) { return Math.min(i + 1, list.length - 1); });
                }
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (showSuppDrop) setSuppDropIdx(function (i) { return Math.max(i - 1, -1); });
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (suppDropIdx >= 0 && list[suppDropIdx]) {
                  pickSupplier(list[suppDropIdx].name);
                  return;
                }
                if (list.length === 1) {
                  pickSupplier(list[0].name);
                  return;
                }
                if (list.length > 0 && suppSearch.trim()) {
                  var exact = list.find(function (s) { return String(s.name || "").toLowerCase() === suppSearch.trim().toLowerCase(); });
                  if (exact) {
                    pickSupplier(exact.name);
                    return;
                  }
                }
                if (current && String(suppSearch || "").trim().toLowerCase() === String(current).toLowerCase()) {
                  setShowSuppDrop(false);
                  focusPurSearch(purMode);
                }
                return;
              }
              if (e.key === "Tab" && !e.shiftKey && current) {
                setShowSuppDrop(false);
              }
              if (e.key === "Escape") { setShowSuppDrop(false); setSuppDropIdx(-1); }
            }}
          />
          {showSuppDrop ? (
            <div
              className="erp-pur-supp-drop is-fixed"
              style={suppDropPos ? { top: suppDropPos.top + "px", left: suppDropPos.left + "px", width: suppDropPos.width + "px" } : undefined}
            >
              {filteredSuppliers.map(function (s, si) {
                return (
                  <div
                    key={s.id || s.name}
                    className={"erp-pur-supp-drop-item" + (suppDropIdx === si ? " is-active" : "") + (current === s.name ? " is-selected" : "")}
                    onMouseEnter={function () { setSuppDropIdx(si); }}
                    onMouseDown={function (e) { e.preventDefault(); pickSupplier(s.name); }}
                  >
                    <div className="erp-pur-supp-drop-name">{s.name}</div>
                    {(s.phone || s.email) ? <div className="erp-pur-supp-drop-meta">{[s.phone, s.email].filter(Boolean).join(" · ")}</div> : null}
                  </div>
                );
              })}
              {filteredSuppliers.length === 0 ? (
                <div className="erp-pur-supp-drop-empty">No suppliers match "{suppSearch}"</div>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="erp-pur-mock-btn-outline" onClick={function () { setAddPartyInitial({ name: String(suppSearch || "").trim(), phone: "", email: "", address: "", note: "" }); setShowAddParty(true); }}>+ New Supplier</button>
      </div>
    );
  };

  /** Same row shape as Save + Print Barcodes — reusable for reprint from saved purchase. */
  var buildLabelQtyRowsFromPurchaseItems = function (items, products) {
    return (items || []).map(function (it) {
      var prod = (products || []).find(function (p) { return p.id === it.id; });
      var qty = parseInt(it.qty, 10) || 1;
      return {
        id: it.id,
        name: it.name || (prod && prod.name) || "Unknown Product",
        barcode: prod ? prod.barcode : it.barcode,
        cost: it.cost,
        sellPrice: it.sellPrice || it.cost,
        productId: prod ? prod.productId : (it.productId || ""),
        purchaseQty: qty,
        printQty: qty,
      };
    });
  };

  var openPrintBarcodesFromPurchase = function (pur) {
    if (!pur || !(pur.items || []).length) {
      showAlert("No products on this purchase invoice to print.");
      return;
    }
    if (isVoidedTxn(pur)) {
      showAlert("Cannot print barcodes for a voided purchase invoice.");
      return;
    }
    /* Close View & Print so the qty/label modals are not hidden under it. */
    setViewPur(null);
    setLabelQtyModal(buildLabelQtyRowsFromPurchaseItems(pur.items, state.products));
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
    var safeCssMm = function (n, fallback) {
      var x = parseFloat(n);
      if (!isFinite(x) || x < 10 || x > 300) return fallback || 60;
      return Math.round(x * 100) / 100;
    };
    var labelWmm = safeCssMm(d.labelW, 60);
    var labelHmm = safeCssMm(d.labelH, 40);
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
      html += "<div class=\"lbl\" style=\"background:" + (function () {
        var s = String(d.bgColor == null ? "" : d.bgColor).trim();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
        if (/^[a-zA-Z]{1,20}$/.test(s)) return s.toLowerCase();
        return "#ffffff";
      })() + ";border:" + (d.borderStyle === "none" ? "none" : "1px solid #ccc") + ";\">";
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
        var _c = String(el.color == null ? "" : el.color).trim();
        var safeColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(_c) || /^[a-zA-Z]{1,20}$/.test(_c) ? _c : "#000000";
        var _fs = parseFloat(el.fontSize); if (!isFinite(_fs) || _fs < 4 || _fs > 72) _fs = 8;
        var _fw = String(el.fontWeight == null ? "400" : el.fontWeight).trim().toLowerCase();
        if (!/^(normal|bold|bolder|lighter|[1-9]00)$/.test(_fw)) _fw = "400";
        var _al = String(el.align || "left").toLowerCase();
        if (_al !== "center" && _al !== "right" && _al !== "left") _al = "left";
        var justify = _al === "center" ? "center" : _al === "right" ? "flex-end" : "flex-start";
        html += "<div style=\"position:absolute;left:" + pct(el.x, labelWmm) + ";top:" + pct(el.y, labelHmm) + ";width:" + pct(el.w, labelWmm) + ";height:" + pct(el.h, labelHmm) + ";font-size:" + _fs + "px;font-weight:" + _fw + ";color:" + safeColor + ";overflow:hidden;display:flex;align-items:center;justify-content:" + justify + ";\"><span style=\"width:100%;text-align:" + _al + "\">" + escapeHtml(val) + "</span></div>";
      });
      html += "</div>";
    });
    html += getJsBarcodeInlineScriptTag();
    html += "<script>window.onload=function(){setTimeout(function(){document.querySelectorAll('svg[data-val]').forEach(function(s){try{JsBarcode(s,s.getAttribute('data-val'),{format:'CODE128',width:1.2,height:parseInt(s.getAttribute('data-h')||20),displayValue:false,margin:0});}catch(e){}});setTimeout(function(){window.print();},400);},600);};<\/script>";
    html += "</body></html>";
    w.document.write(html);
    w.document.close();
  };

  var fp = state.products.filter(function (p) {
    /* FIX 8: Exclude inactive (soft-deleted) products from purchase search */
    return p.status !== "inactive" && !isRepair3pInternalProduct(p) && productMatchesSearch(p, ps);
  });

  var formTotal = sumPurchaseLinesStockTotal(f.items);
  var formDiscRaw = parseFloat(f.invDiscount) || 0;
  var formDiscAmt = f.invDiscountType === "Rs"
    ? Math.min(formTotal, Math.round(formDiscRaw * 100) / 100)
    : Math.round(formTotal * formDiscRaw / 100 * 100) / 100;
  var formAfterDisc = Math.max(0, Math.round((formTotal - formDiscAmt) * 100) / 100);
  var purTaxInclusive = !!(state.settings && state.settings.taxEnabled && state.settings.taxMode === "inclusive");
  var purTaxInput = (state.settings && state.settings.taxEnabled) ? Math.round((parseFloat(f.purchaseTaxAmount) || 0) * 100) / 100 : 0;
  var invoiceTotal = purTaxInclusive
    ? formAfterDisc
    : (purTaxInput > 0.005 ? Math.round((formAfterDisc + purTaxInput) * 100) / 100 : formAfterDisc);
  var formPaid = f.payMode === "paid" ? invoiceTotal : (f.payMode === "partial" ? parseFloat(f.paidAmount) || 0 : 0);
  var formBal = invoiceTotal - formPaid;
  var formStatus = formPaid >= invoiceTotal ? "Paid" : formPaid > 0 ? "Partial" : "Unpaid";
  var purDiscPctDisplay = f.invDiscountType === "%"
    ? (f.invDiscount === "" || f.invDiscount == null ? "" : String(f.invDiscount))
    : (formTotal > 0 && formDiscAmt > 0 ? String(Number(((formDiscAmt / formTotal) * 100).toFixed(2))) : "");
  var purDiscAmtDisplay = f.invDiscountType === "Rs"
    ? (f.invDiscount === "" || f.invDiscount == null ? "" : String(f.invDiscount))
    : (formDiscAmt > 0 ? String(formDiscAmt) : "");
  var applyPurDiscountPercent = function (raw) {
    var pct = parseFloat(raw);
    if (!isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    setF(function (x) {
      return Object.assign({}, x, { invDiscountType: "%", invDiscount: raw === "" ? "" : String(pct) });
    });
  };
  var applyPurDiscountAmount = function (raw) {
    var amt = parseFloat(raw);
    if (!isFinite(amt) || amt < 0) amt = 0;
    setF(function (x) {
      return Object.assign({}, x, { invDiscountType: "Rs", invDiscount: raw === "" ? "" : String(amt) });
    });
  };
  var selectPurPayMethod = function (method) {
    setF(function (x) {
      var next = Object.assign({}, x, {
        cashMethod: method,
        splitRows: [],
        chequeList: method === "Cheque" ? (x.chequeList || []) : [],
      });
      if (method === "Cheque") return next;
      return Object.assign({}, next, { payMode: "paid", paidAmount: "" });
    });
    if (method === "Cheque") setPurSplitModal(true);
  };

  /* Edit purchase computed totals */
  var editLineTotal = editPur ? sumPurchaseLinesStockTotal(editPur.items || []) : 0;
  var editDiscRaw = editPur ? (parseFloat(editPur.invDiscount != null ? editPur.invDiscount : editPur.discountValue) || 0) : 0;
  var editDiscType = editPur ? (editPur.invDiscountType || editPur.discountType || "%") : "%";
  var editDiscAmt = editDiscType === "Rs"
    ? Math.min(editLineTotal, Math.round(editDiscRaw * 100) / 100)
    : Math.round(editLineTotal * editDiscRaw / 100 * 100) / 100;
  var editAfterDisc = Math.max(0, Math.round((editLineTotal - editDiscAmt) * 100) / 100);
  var editTaxAmt = editPur && state.settings && state.settings.taxEnabled ? Math.round((parseFloat(editPur.totalTax) || 0) * 100) / 100 : 0;
  var editPurInclusive = !!(editPur && state.settings && state.settings.taxEnabled && (editPur.taxMode === "inclusive" || (editPur.taxMode !== "exclusive" && state.settings.taxMode === "inclusive")));
  var editTotal = editPur ? (editPurInclusive ? editAfterDisc : (editTaxAmt > 0.005 ? Math.round((editAfterDisc + editTaxAmt) * 100) / 100 : editAfterDisc)) : 0;
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
    focusPurSearch("edit");
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
    focusPurSearch("new");
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
        <col style={{ width: 36 }} />
        <col />
        <col style={{ width: 64 }} />
        <col style={{ width: 72 }} />
        <col style={{ width: 112 }} />
        <col style={{ width: 112 }} />
        <col style={{ width: 72 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 44 }} />
      </colgroup>
    );
  };

  var renderPurProductToolbar = function (mode) {
    var qtyId = purAddFieldId(mode, "qty");
    var costId = purAddFieldId(mode, "cost");
    var sellId = purAddFieldId(mode, "sell");
    var searchId = purSearchId(mode);
    var onAdd = mode === "edit" ? addEditItem : addMatchedItem;
    var typedPick = pPickedProduct || findActiveProductByExactSearch(state.products, ps);
    var selU = typedPick ? resolvePurchaseInputUnit(typedPick, pUnit || pBaseUnit) : "Pcs";
    var bu2 = typedPick ? (typedPick.unit || "Pcs") : "Pcs";
    var showCostToggle = typedPick && !isProductBaseUnitLabel(typedPick, selU);
    var unitOpts = typedPick ? getProductUnitRows(typedPick).map(function (r) { return r.name; }) : [];
    var hint = typedPick ? purUnitConversionHint(typedPick, selU) : null;
    var addBase = typedPick ? toProductBaseQty(parseFloat(pq) || 0, selU, typedPick) : 0;
    var curSt = typedPick ? (typedPick.stock || 0) : 0;
    var afterSt = curSt + addBase;
    var lowCost = typedPick ? purCostSeemsLow(typedPick, selU, pc, pCostInputMode) : false;
    var expCost = typedPick && pCostInputMode === COST_INPUT_PER_BASE ? getUnitCostPrice(typedPick, typedPick.unit || "Pcs") : (typedPick ? getUnitCostPrice(typedPick, selU) : 0);
    var expLbl = typedPick && pCostInputMode === COST_INPUT_PER_BASE ? (typedPick.unit || "base") : selU;
    var glassPur = typedPick && isGlassProduct(typedPick, shopSettings);
    var glassEcon = glassPur ? glassPurchaseEconomics(parseFloat(pq) || 0, parseFloat(pc) || 0, typedPick) : null;
    return (
      <div className="erp-pur-add-wrap">
        <div className="erp-pur-add-bar">
          <div className="erp-pur-add-search" ref={purSearchRef}>
            <span className="erp-pur-add-search-ico" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
            <input
              id={searchId}
              value={ps}
              onChange={function (e) { setPs(e.target.value); setShowPurDrop(true); setPurDropIdx(-1); updatePurDropPos(); }}
              onFocus={function () { setShowPurDrop(true); updatePurDropPos(); }}
              onKeyDown={function (e) {
                var list = fp.slice(0, PUR_PROD_DROP_LIMIT);
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
              placeholder="Search product by name, ID, barcode..."
              className="erp-pur-add-search-input"
              aria-label="Search products"
            />
            {showPurDrop && ps.trim().length > 0 && (
              <div
                className="erp-pur-add-drop is-fixed"
                style={purDropPos ? { top: purDropPos.top + "px", left: purDropPos.left + "px", width: purDropPos.width + "px" } : undefined}
              >
                {fp.slice(0, PUR_PROD_DROP_LIMIT).map(function (p, pidx) {
                  return (
                    <div
                      key={p.id}
                      className={"erp-pur-add-drop-item" + (purDropIdx === pidx ? " is-active" : "")}
                      onClick={function () {
                        var bu = p.unit || "Pcs";
                        setPs(p.name); setPBaseUnit(bu); setPUnit(bu); setPPickedProduct(p);
                        syncCostModeAndDefaultsForUnit(p, bu); setPSell(String(getUnitSellPrice(p, bu)));
                        setShowPurDrop(false); setPurDropIdx(-1);
                        focusPurAddField(mode, "qty");
                      }}
                      onMouseDown={function (e) { e.preventDefault(); }}
                      onMouseEnter={function () { setPurDropIdx(pidx); }}
                      onMouseLeave={function () { setPurDropIdx(-1); }}
                    >
                      <div>
                        <div className="erp-pur-add-drop-name">{p.name}</div>
                        <div className="erp-pur-add-drop-meta">{p.category} · {fmtStock(p.stock, p.unit)} in stock</div>
                      </div>
                      <div className="erp-pur-add-drop-price">{getCurrencySymbol()} {fmtNum(p.cost)} / {fmtNum(p.price)}</div>
                    </div>
                  );
                })}
                {fp.length === 0 && <div className="erp-pur-add-drop-empty">No matching products</div>}
                {fp.length > PUR_PROD_DROP_LIMIT ? (
                  <div className="erp-pur-add-drop-empty">Showing top {PUR_PROD_DROP_LIMIT} — type more to narrow</div>
                ) : null}
                <div className="erp-pur-add-drop-create" onClick={function () { setShowPurDrop(false); setNewProdKey(function (k) { return k + 1; }); setNewProd(blankNewProd()); }}>
                  + Create "{ps}" as new product
                </div>
              </div>
            )}
          </div>
          <input
            id={qtyId}
            type="number"
            className="erp-pur-add-qty"
            value={pq}
            min="0"
            step={isDecimalUnit(pUnit || pBaseUnit) ? "0.001" : "1"}
            onChange={function (e) { setPq(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === "Enter") { e.preventDefault(); focusPurAddField(mode, "unit"); return; }
              if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusPurAddField(mode, "unit"); }
            }}
            placeholder="Qty"
            title="Quantity"
            aria-label="Quantity"
          />
          <select
            id={purAddFieldId(mode, "unit")}
            className="erp-pur-add-unit"
            value={pUnit || pBaseUnit || "Pcs"}
            onChange={function (e) {
              var uOpt = e.target.value;
              if (!typedPick) { setPUnit(uOpt); return; }
              setPUnit(uOpt); setPPickedProduct(typedPick);
              syncCostModeAndDefaultsForUnit(typedPick, uOpt);
              setPSell(String(getUnitSellPrice(typedPick, uOpt)));
            }}
            onKeyDown={function (e) {
              if (e.key === "Enter") { e.preventDefault(); focusPurAddField(mode, "cost"); return; }
              if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusPurAddField(mode, "cost"); }
            }}
            title="Unit"
            aria-label="Unit"
          >
            {(unitOpts.length ? unitOpts : [pBaseUnit || "Pcs"]).map(function (uOpt) {
              return <option key={uOpt} value={uOpt}>{uOpt}</option>;
            })}
          </select>
          {showCostToggle ? (
            <div className="erp-pur-add-cost-mode">
              <button type="button" className={pCostInputMode === COST_INPUT_PER_INPUT ? "is-on" : ""} onClick={function () { setPCostInputMode(COST_INPUT_PER_INPUT); }}>/{selU}</button>
              <button type="button" className={pCostInputMode === COST_INPUT_PER_BASE ? "is-on" : ""} onClick={function () { setPCostInputMode(COST_INPUT_PER_BASE); }}>/{bu2}</button>
            </div>
          ) : null}
          <input
            id={costId}
            type="number"
            className="erp-pur-add-cost"
            value={pc}
            onChange={function (e) { setPc(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === "Enter") { e.preventDefault(); focusPurAddField(mode, "sell"); return; }
              if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); focusPurAddField(mode, "sell"); }
            }}
            placeholder="Cost"
          />
          <input
            id={sellId}
            type="number"
            className="erp-pur-add-sell"
            value={pSell}
            onChange={function (e) { setPSell(e.target.value); }}
            onKeyDown={function (e) {
              if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                if (ps.trim()) onAdd();
              }
            }}
            placeholder="Sell"
          />
          <button type="button" className="erp-pur-add-plus" onClick={function () { onAdd(); }} disabled={!ps.trim()} aria-label="Add product">+</button>
        </div>
        {typedPick ? (
          <div className="erp-pur-add-hint">
            {hint ? <div>{hint}</div> : null}
            <div>Current stock: <strong>{glassPur ? formatGlassStockLabel(typedPick, fmtNum) : fmtStock(curSt, typedPick.unit || "Pcs")}</strong> · After purchase: <strong className="ok">{glassPur ? formatGlassStockLabel(Object.assign({}, typedPick, { stock: (typedPick.stock || 0) + (parseFloat(pq) || 0) }), fmtNum) : fmtStock(afterSt, typedPick.unit || "Pcs")}</strong></div>
            {glassPur && glassEcon && (parseFloat(pq) || 0) > 0 && (parseFloat(pc) || 0) > 0 ? (
              <div className="erp-pur-add-glass">
                {[
                  { label: "Area / Sheet", val: glassEcon.sheetSqFt + " Sq Ft" },
                  { label: "Total Sq Ft", val: fmtNum(glassEcon.totalSqFt) },
                  { label: "Total Sq M", val: fmtNum(glassEcon.totalSqM) },
                  { label: "Cost / Sq Ft", val: getCurrencySymbol() + " " + fmtNum(glassEcon.costPerSqFt) },
                  { label: "Cost / Sq M", val: getCurrencySymbol() + " " + fmtNum(glassEcon.costPerSqM) },
                ].map(function (row) {
                  return (
                    <div key={row.label} className="erp-pur-add-glass-cell">
                      <div className="lbl">{row.label}</div>
                      <div className="val">{row.val}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {lowCost ? <div className="erp-pur-add-warn">(!) Cost seems low vs catalogue (expected ~{getCurrencySymbol()} {fmtNum(expCost)} per {expLbl})</div> : null}
          </div>
        ) : null}
      </div>
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
                      <div key={p.id} onClick={function () {
                        var bu = p.unit || "Pcs";
                        setPs(p.name); setPBaseUnit(bu); setPUnit(bu); setPPickedProduct(p);
                        syncCostModeAndDefaultsForUnit(p, bu); setPSell(String(getUnitSellPrice(p, bu)));
                        setShowPurDrop(false); setPurDropIdx(-1);
                        focusPurAddField(mode, "qty");
                      }} onMouseDown={function (e) { e.preventDefault(); }} onMouseEnter={function () { setPurDropIdx(pidx); }} onMouseLeave={function () { setPurDropIdx(-1); }} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: purDropIdx === pidx ? C.accentSoft : "#fff" }}>
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
    if (editingPurchaseId) {
      var origEdit = state.purchases.find(function (p) { return p.id === editingPurchaseId; });
      if (!origEdit) {
        showAlert("Original purchase not found. Cannot update.");
        return;
      }
      var builtEdit = Object.assign({}, origEdit, {
        supplier: f.supplier,
        invoiceNo: f.invoiceNo,
        date: f.date,
        payMode: f.payMode,
        paidAmount: f.paidAmount,
        cashMethod: f.cashMethod || "Cash",
        items: (f.items || []).map(function (it) { return Object.assign({}, it); }),
        note: f.note || "",
        attachments: (f.attachments || []).slice(),
        invDiscount: f.invDiscount,
        invDiscountType: f.invDiscountType || "%",
        discountValue: f.invDiscount,
        discountType: f.invDiscountType || "%",
        totalTax: f.purchaseTaxAmount,
        taxMode: (state.settings && state.settings.taxEnabled)
          ? (origEdit.taxMode || (state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive"))
          : undefined,
      });
      saveEditPur(builtEdit, skipPackWarn);
      return;
    }
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
    var discRawSave = parseFloat(f.invDiscount) || 0;
    var discAmtSave = f.invDiscountType === "Rs"
      ? Math.min(stockLineTotal, Math.round(discRawSave * 100) / 100)
      : Math.round(stockLineTotal * discRawSave / 100 * 100) / 100;
    var stockAfterDisc = Math.max(0, Math.round((stockLineTotal - discAmtSave) * 100) / 100);
    var taxModeSave = (state.settings && state.settings.taxEnabled)
      ? (state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive")
      : undefined;
    var purTaxSave = (state.settings && state.settings.taxEnabled) ? Math.round((parseFloat(f.purchaseTaxAmount) || 0) * 100) / 100 : 0;
    if (taxModeSave === "inclusive" && purTaxSave <= 0.005 && stockAfterDisc > 0) {
      purTaxSave = Math.round((computeSaleTax(state.settings, stockAfterDisc).totalTax || 0) * 100) / 100;
    }
    var invoiceTotalSave = taxModeSave === "inclusive"
      ? stockAfterDisc
      : (purTaxSave > 0.005 ? Math.round((stockAfterDisc + purTaxSave) * 100) / 100 : stockAfterDisc);
    var purNetFactor = (taxModeSave === "inclusive" && stockAfterDisc > 0 && purTaxSave > 0)
      ? (stockAfterDisc - purTaxSave) / stockAfterDisc
      : 1;
    if (splitRows) {
      var nonChequePaid = splitRows.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
      var totalSplit = splitRows.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
      if (totalSplit > invoiceTotalSave + 0.009) {
        showAlert("Payment total exceeds purchase invoice total.");
        return;
      }
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
      if (isCheque) {
        var purChqList = (f.chequeList || []).filter(function (c) { return c.no && String(c.no).trim() && parseFloat(c.amount) > 0; });
        var purChqSum = purChqList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
        if (purChqList.length === 0) {
          showAlert("Add at least one cheque before saving a cheque payment.");
          return;
        }
        if (purChqSum > invoiceTotalSave + 0.009) {
          showAlert("Cheque total exceeds purchase invoice total.");
          return;
        }
      }
      effPaid = isCheque ? 0 : formPaid;
      effBal = invoiceTotalSave - effPaid;
      effStatus = effPaid >= invoiceTotalSave ? "Paid" : effPaid > 0 ? "Partial" : "Unpaid";
      if (!isCheque && formPaid > 0) {
        initPurPh = [{ id: uid(), date: today(), amount: formPaid, cashMethod: f.cashMethod || "Cash" }];
      }
    }
    var purAmtErr = validateTxnAmounts("Purchase invoice", invoiceTotalSave, effPaid, effBal);
    if (purAmtErr) { showAlert("X " + purAmtErr); return; }
    var suppRow = (state.suppliers || []).find(function (s) { return s.name === f.supplier; });
    var purTs = new Date().toISOString();
    var purObj = stampTransactionIsoDateTime({ id: uid(), supplier: f.supplier, supplierId: suppRow ? suppRow.id : "", invoiceNo: purInvNo, date: f.date, payMode: f.payMode, items: normalizedSaveItems, total: invoiceTotalSave, paidAmount: effPaid, balance: effBal, status: effStatus, paymentHistory: initPurPh, totalTax: purTaxSave, taxMode: taxModeSave, note: f.note || "", discount: discAmtSave, discountType: f.invDiscountType || "%", discountValue: discRawSave, createdAt: purTs, updatedAt: purTs }, purTs);
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
          var prevProd = np[idx];
          np[idx] = stampProductStock(Object.assign({}, prevProd, {
            stock: newStock,
            cost:  Math.round(newAvgCost * 100) / 100,
            price: catSell != null ? Math.round(catSell * 100) / 100 : prevProd.price
          }), null, prevProd);
        }
    });
    /* Supplier payable is computed dynamically from purchases via getSupplierPayable(),
       so no need to update s.payable here — prevents drift between static and dynamic values. */
    if (!tcTrialGuard(state.purchases, 'purchases')) return;
    var np2 = state.purchases.concat([purObj]);
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
        var chTs = new Date().toISOString();
        return stampTransactionIsoDateTime({ id: uid(), type: "outgoing", status: "Pending", chequeNo: c.no.trim(), bankName: c.bank.trim(), amount: c.amount, dueDate: c.due, issuedDate: today(), supplierName: f.supplier, purchaseId: purObj.id, purchaseNo: purObj.invoiceNo || "", note: "", createdAt: chTs, updatedAt: chTs }, chTs);
      });
      var chqPurPh = newPurCheques.map(function (ch) { return { id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending — due " + ch.dueDate + ")", chequeId: ch.id }; });
      var updPurObj = Object.assign({}, purObj, { paymentHistory: initPurPh.concat(chqPurPh) });
      var np2WithCheque = np2.map(function (p) { return p.id === purObj.id ? updPurObj : p; });
      var nchPur = (state.cheques || []).concat(newPurCheques);
      if (S.setMany) {
        S.setMany([["tc3_products", np], ["tc3_purchases", np2WithCheque], ["tc3_cheques", nchPur]]);
      } else {
        S.set("tc3_products", np); S.set("tc3_purchases", np2WithCheque); S.set("tc3_cheques", nchPur);
      }
      purStateUpdate = { products: np, purchases: np2WithCheque, cheques: nchPur };
      addAudit("Created Purchase Invoice", purObj.invoiceNo || purObj.id.slice(0, 8));
      addAudit(newPurCheques.length + " Cheque(s) Issued " + getCurrencySymbol() + " " + fmtNum(newPurCheques.reduce(function (a, c) { return a + c.amount; }, 0)), purObj.invoiceNo || "");
    } else {
      if (S.setMany) {
        S.setMany([["tc3_products", np], ["tc3_purchases", np2]]);
      } else {
        S.set("tc3_products", np); S.set("tc3_purchases", np2);
      }
      addAudit("Created Purchase Invoice", purObj.invoiceNo || purObj.id.slice(0, 8));
    }
    try {
      var pushPairs = [["tc3_products", purStateUpdate.products], ["tc3_purchases", purStateUpdate.purchases]];
      if (purStateUpdate.cheques) pushPairs.push(["tc3_cheques", purStateUpdate.cheques]);
      pushKeysNow(pushPairs);
    } catch (_e) { /* ignore */ }
    setState(function (st) { return Object.assign({}, st, purStateUpdate); });
    if (withBarcode) {
      setLabelQtyModal(buildLabelQtyRowsFromPurchaseItems(normalizedSaveItems, np));
    }
    sessionStorage.removeItem("tc3_dirty");
    if (activeHeldPurId) {
      deleteHeldPurchase(activeHeldPurId);
    }
    setShow(false); setF(BLANK); setPurSplitModal(false); setSuppSearch(""); setShowSuppDrop(false);
    setActiveHeldPurId(null);
    if (viewMode === "entry") goPurchasesList();
  };

  var goPurchaseReturn = function () {
    try { sessionStorage.setItem("tc3_returns_tab", "purchasereturn"); } catch (e) { /* ignore */ }
    if (typeof setActive === "function") setActive("returns");
  };

  var blankPurchaseForm = function () {
    return {
      supplier: "", invoiceNo: genPurNo(), date: today(), payMode: "unpaid", paidAmount: "", cashMethod: "Cash",
      items: [], chequeList: [], splitRows: [], purchaseTaxAmount: "", note: "", attachments: [], invDiscount: "0.00", invDiscountType: "%",
    };
  };

  var resetPurchaseEntryForm = function () {
    clearPurchasePrefill(S);
    setF(blankPurchaseForm());
    setSuppSearch("");
    setShowSuppDrop(false);
    setPs("");
    setPq(1);
    setPc("");
    setPSell("");
    setPPickedProduct(null);
    setActiveHeldPurId(null);
    setPurSplitModal(false);
    setEditingPurchaseId("");
    try {
      if (sessionStorage.getItem("tc3_dirty") === "purchase") sessionStorage.removeItem("tc3_dirty");
    } catch (_e) { /* ignore */ }
    focusPurSearch("new");
  };

  var holdCurrentPurchase = function (opts) {
    var silent = !!(opts && opts.silent);
    if (editingPurchaseId) {
      if (!silent) showAlert("Finish or cancel the purchase edit before holding.");
      return false;
    }
    if (!(f.items || []).length) {
      if (!silent) showAlert("Add at least one product before holding.");
      return false;
    }
    var held = S.get("tc3_held_purchases", []) || [];
    var entry = {
      form: Object.assign({}, f, {
        items: (f.items || []).map(function (it) { return Object.assign({}, it); }),
        splitRows: (f.splitRows || []).map(function (r) { return Object.assign({}, r); }),
        attachments: (f.attachments || []).slice(),
      }),
      suppSearch: suppSearch || f.supplier || "",
      label: (f.supplier || "No supplier") + " — " + (f.invoiceNo || "") + " — " + (f.items || []).length + " item(s)",
      heldAt: new Date().toISOString(),
    };
    if (activeHeldPurId) {
      entry.id = activeHeldPurId;
      held = held.map(function (h) { return h.id === activeHeldPurId ? entry : h; });
      if (!held.find(function (h) { return h.id === activeHeldPurId; })) held = held.concat([entry]);
    } else {
      entry.id = "held_pur_" + Date.now();
      held = held.concat([entry]);
    }
    S.set("tc3_held_purchases", held);
    setHeldPurchases(held);
    addAudit("Held Purchase", f.invoiceNo || entry.id.slice(0, 12));
    resetPurchaseEntryForm();
    if (!silent) showAlert("Purchase held. Open it anytime from On Hold below.");
    return true;
  };

  var requestLeavePurchaseEntry = function (dest) {
    var target = dest || "purchases";
    if (!(f.items || []).length) {
      try {
        if (sessionStorage.getItem("tc3_dirty") === "purchase") sessionStorage.removeItem("tc3_dirty");
      } catch (_e) { /* ignore */ }
      window._techon_pur_snapshot = null;
      resetPurchaseEntryForm();
      if (typeof setActive === "function") setActive(target);
      return;
    }
    try { sessionStorage.setItem("tc3_dirty", "purchase"); } catch (_e) { /* ignore */ }
    if (onUnsavedPurchaseLeave) {
      onUnsavedPurchaseLeave(target);
      return;
    }
    showConfirm("You have an unsaved purchase. Discard and leave?", function () {
      resetPurchaseEntryForm();
      if (typeof setActive === "function") setActive(target);
    });
  };

  var loadHeldPurchase = function (h) {
    if (!h || !h.form) return;
    setF(Object.assign({}, blankPurchaseForm(), h.form, {
      items: (h.form.items || []).map(function (it) { return Object.assign({}, it); }),
      splitRows: (h.form.splitRows || []).map(function (r) { return Object.assign({}, r); }),
      attachments: (h.form.attachments || []).slice(),
    }));
    setSuppSearch(h.suppSearch || h.form.supplier || "");
    setActiveHeldPurId(h.id);
    setPs("");
    setShowPurDrop(false);
    focusPurSearch("new");
  };

  var deleteHeldPurchase = function (id) {
    var updated = (S.get("tc3_held_purchases", []) || []).filter(function (x) { return x.id !== id; });
    S.set("tc3_held_purchases", updated);
    setHeldPurchases(updated);
    if (activeHeldPurId === id) setActiveHeldPurId(null);
  };

  var refreshHeldPurchases = function () {
    setHeldPurchases(S.get("tc3_held_purchases", []) || []);
  };

  var foreignEditLockFor = function (purchaseId) {
    var lock = findActiveInvoiceEditLock(readInvoiceEditLocks(S), purchaseId);
    if (!lock) return null;
    if (String(lock.deviceId || "") === String(lockIdentity.deviceId || "")) return null;
    return lock;
  };

  var tryOpenPurchaseEdit = function (pur) {
    if (!pur || isVoidedTxn(pur)) return;
    var retMeta = purchaseReturnUiStatus(pur, state.purchaseReturns);
    if (retMeta && retMeta.hasReturns) {
      showAlert("This purchase has return records. Use Purchase Return instead of editing the original invoice.");
      return;
    }
    var fl = foreignEditLockFor(pur.id);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl));
      return;
    }
    var form = purchaseToEntryForm(pur);
    stashPurchasePrefill(S, {
      editingPurchaseId: pur.id,
      form: form,
      suppSearch: pur.supplier || "",
    });
    setViewPur(null);
    addAudit("Opening purchase entry to edit " + (pur.invoiceNo || pur.id.slice(0, 8)), pur.invoiceNo || "");
    openNewPurchase();
  };

  useEffect(function () {
    if (!editingPurchaseId) return;
    var purchaseId = editingPurchaseId;
    var alive = true;
    var clearEditUi = function () {
      setEditingPurchaseId("");
      resetPurchaseEntryForm();
      goPurchasesList();
    };
    acquireInvoiceEditLockSynced(S, purchaseId, lockIdentity)
      .then(function (acquired) {
        if (!alive) return;
        if (!acquired || !acquired.ok) {
          showAlert((acquired && acquired.message) || formatInvoiceEditLockMessage(acquired && acquired.conflict));
          clearEditUi();
          return;
        }
      })
      .catch(function () {
        if (!alive) return;
        showAlert("Could not lock this purchase for editing. Check network and try again.");
        clearEditUi();
      });
    var renew = function () {
      renewInvoiceEditLockSynced(S, purchaseId, lockIdentity).then(function (r) {
        if (!alive) return;
        if (r && r.ok) return;
        showAlert((r && r.message) || formatInvoiceEditLockMessage(r && r.conflict));
        clearEditUi();
      }).catch(function () { /* ignore */ });
    };
    var hb = setInterval(renew, INVOICE_EDIT_LOCK_HEARTBEAT_MS);
    var own = setInterval(function () {
      checkForeignInvoiceEditLock(S, purchaseId, lockIdentity).then(function (foreign) {
        if (!alive || !foreign) return;
        showAlert(formatInvoiceEditLockMessage(foreign));
        clearEditUi();
      }).catch(function () { /* ignore */ });
    }, INVOICE_EDIT_LOCK_OWNERSHIP_MS);
    return function () {
      alive = false;
      clearInterval(hb);
      clearInterval(own);
      releaseInvoiceEditLock(S, purchaseId, lockIdentity);
    };
  }, [editingPurchaseId, lockIdentity.deviceId]);

  useEffect(function () {
    if (!editPur || !editPur.id) return;
    var purchaseId = editPur.id;
    var alive = true;
    var renew = function () {
      renewInvoiceEditLockSynced(S, purchaseId, lockIdentity).then(function (r) {
        if (!alive) return;
        if (r && r.ok) return;
        showAlert((r && r.message) || formatInvoiceEditLockMessage(r && r.conflict));
        setEditPur(null);
      }).catch(function () { /* ignore */ });
    };
    renew();
    var hb = setInterval(renew, INVOICE_EDIT_LOCK_HEARTBEAT_MS);
    var own = setInterval(function () {
      checkForeignInvoiceEditLock(S, purchaseId, lockIdentity).then(function (foreign) {
        if (!alive || !foreign) return;
        showAlert(formatInvoiceEditLockMessage(foreign));
        setEditPur(null);
      }).catch(function () { /* ignore */ });
    }, INVOICE_EDIT_LOCK_OWNERSHIP_MS);
    return function () {
      alive = false;
      clearInterval(hb);
      clearInterval(own);
      releaseInvoiceEditLock(S, purchaseId, lockIdentity);
    };
  }, [editPur && editPur.id, lockIdentity.deviceId]);

  useEffect(function () {
    var t = setInterval(function () {
      refreshInvoiceEditLocksFromServer(S).finally(function () {
        setLockTick(function (n) { return n + 1; });
      });
    }, 4000);
    return function () { clearInterval(t); };
  }, []);

  var voidPurchaseInvoice = function (purchaseId, reason) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void purchases");
      return;
    }
    var result = buildVoidPurchaseUpdates(state, purchaseId, reason, null, { confirmRefund: voidRefundConfirm === true });
    if (!result.ok) {
      showAlert(result.error);
      return;
    }
    if (S.setMany) {
      S.setMany([
        ["tc3_products", result.products],
        ["tc3_purchases", result.purchases],
        ["tc3_cheques", result.cheques],
      ]);
    } else {
      S.set("tc3_products", result.products);
      S.set("tc3_purchases", result.purchases);
      S.set("tc3_cheques", result.cheques);
    }
    releaseInvoiceEditLock(S, purchaseId, lockIdentity, { force: true });
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
    setVoidRefundConfirm(false);
    if (viewPur && viewPur.id === purchaseId) setViewPur(null);
  };

  var promptVoidPurchase = function (pur) {
    if (!canDeleteInvoices) {
      showPermissionDenied("void purchases");
      return;
    }
    var fl = foreignEditLockFor(pur && pur.id);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl) + " Cannot void until they finish.");
      return;
    }
    var block = voidPurchaseBlockReason(pur, state);
    if (block) {
      showAlert(block);
      return;
    }
    setVoidReason("");
    setVoidRefundConfirm(false);
    setVoidPurTarget(pur);
  };

  var saveEditPur = function (purSource, skipPackWarn) {
    /* Modal passes nothing → use editPur; entry edit passes built object as first arg */
    if (typeof purSource === "boolean") {
      skipPackWarn = purSource;
      purSource = null;
    }
    var editSrc = purSource || editPur;
    if (!editSrc) return;
    /* Recalculate totals from current items/payment state before saving */
    var normalizedEditItems = (editSrc.items || []).map(function (it) {
      var pr = state.products.find(function (p) { return p.id === it.id; });
      return pr ? normalizePurchaseLineItem(it, pr, toProductBaseQty) : it;
    });
    var ei, eraw, epr, eiu;
    for (ei = 0; ei < (editSrc.items || []).length; ei++) {
      eraw = editSrc.items[ei];
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
          showConfirm(purchasePackTotalVsCatalogueMessage(), function () { saveEditPur(editSrc, true); });
          return;
        }
      }
    }
    var eLine = sumPurchaseLinesStockTotal(normalizedEditItems);
    var eDiscRaw = parseFloat(editSrc.invDiscount != null ? editSrc.invDiscount : editSrc.discountValue) || 0;
    var eDiscType = editSrc.invDiscountType || editSrc.discountType || "%";
    var eDiscAmt = eDiscType === "Rs"
      ? Math.min(eLine, Math.round(eDiscRaw * 100) / 100)
      : Math.round(eLine * eDiscRaw / 100 * 100) / 100;
    var eAfterDisc = Math.max(0, Math.round((eLine - eDiscAmt) * 100) / 100);
    var eTaxMode = (state.settings && state.settings.taxEnabled)
      ? (editSrc.taxMode || (state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive"))
      : undefined;
    var eTax = state.settings && state.settings.taxEnabled ? Math.round((parseFloat(editSrc.totalTax) || 0) * 100) / 100 : 0;
    if (eTaxMode === "inclusive" && eTax <= 0.005 && eAfterDisc > 0) {
      eTax = Math.round((computeSaleTax(state.settings, eAfterDisc).totalTax || 0) * 100) / 100;
    }
    var eTot = eTaxMode === "inclusive"
      ? eAfterDisc
      : (eTax > 0.005 ? Math.round((eAfterDisc + eTax) * 100) / 100 : eAfterDisc);
    var ePurNetFactor = (eTaxMode === "inclusive" && eAfterDisc > 0 && eTax > 0) ? (eAfterDisc - eTax) / eAfterDisc : 1;
    var ePaid = editSrc.payMode === "paid" ? eTot : (editSrc.payMode === "partial" ? parseFloat(editSrc.paidAmount) || 0 : 0);
    var eBal = eTot - ePaid;
    var eStat = ePaid >= eTot ? "Paid" : ePaid > 0 ? "Partial" : "Unpaid";
    var purToSave = Object.assign({}, editSrc, {
      items: normalizedEditItems,
      total: eTot,
      totalTax: eTax,
      taxMode: eTaxMode,
      paidAmount: ePaid,
      balance: eBal,
      status: eStat,
      note: editSrc.note || "",
      discount: eDiscAmt,
      discountType: eDiscType,
      discountValue: eDiscRaw,
      updatedAt: new Date().toISOString(),
    });
    var editPurAmtErr = validateTxnAmounts("Edited purchase invoice", eTot, ePaid, eBal);
    if (editPurAmtErr) { showAlert("X " + editPurAmtErr); return; }
    var orig = state.purchases.find(function (p) { return p.id === purToSave.id; });
    checkPeriodClose(orig ? orig.date : null, state.settings, function () {
    var editProductsNp = null;

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
          return stampProductStock(Object.assign({}, p, { stock: preS, cost: Math.round(preC * 100) / 100 }), null, p);
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
          return stampProductStock(Object.assign({}, p, {
            stock: newS,
            cost: Math.round(newC * 100) / 100,
            price: catSellEd != null ? Math.round(catSellEd * 100) / 100 : p.price
          }), null, p);
        });
      });
      /* Defer persist until purchase row is ready — atomic with tc3_purchases below. */
      editProductsNp = np;
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
          note: diff > 0 ? "Payment on edit (payMode: " + editSrc.payMode + ")" : "Correction — invoice edited (edit)"
        }]);
        purToSave = Object.assign({}, purToSave, { paymentHistory: corrPh });
      }
    }
    /* FIX 3: Removed stale supplier payable mutation — payable is calculated dynamically
       via getTotalSupplierPayable(). Mutating s.payable here would store stale values in DB. */
    var np2 = state.purchases.map(function (p) { return p.id === purToSave.id ? purToSave : p; });
    if (editProductsNp && S.setMany) {
      S.setMany([["tc3_products", editProductsNp], ["tc3_purchases", np2]]);
    } else if (editProductsNp) {
      S.set("tc3_products", editProductsNp);
      S.set("tc3_purchases", np2);
    } else {
      S.set("tc3_purchases", np2);
    }
    try {
      var editPush = [["tc3_purchases", np2]];
      if (editProductsNp) editPush.push(["tc3_products", editProductsNp]);
      pushKeysNow(editPush);
    } catch (_e) { /* ignore */ }
    addAudit("Edited Purchase Invoice", purToSave.invoiceNo || purToSave.id.slice(0, 8));
    setState(function (st) {
      var next = Object.assign({}, st, { purchases: np2 });
      if (editProductsNp) next.products = editProductsNp;
      return next;
    });
    setEditPur(null);
    setEditingPurchaseId("");
    sessionStorage.removeItem("tc3_dirty");
    if (viewMode === "entry") {
      setF(blankPurchaseForm());
      setSuppSearch("");
      setPurSplitModal(false);
      goPurchasesList();
    }
    }); /* end checkPeriodClose */
  };

  var saveNewProduct = function (form) {
    if (!form) return;
    var nameStr = String(form.name == null ? "" : form.name).trim();
    if (!nameStr || !form.price) return;
    /* Force stock=0: purchase qty will add stock when saved — avoids double-counting */
    var unitFields = buildUnitsPersistFields({
      unit: form.unit,
      cost: form.cost,
      price: form.price,
      extraUnits: form.extraUnits || [],
    });
    var prod = applyGlassProductFields(Object.assign(
      {
        id: uid(),
        productId: nextProductId(state.products),
        name: nameStr,
        barcode: form.barcode || genBarcode(),
        category: form.category || "General",
        description: form.description || "",
        type: (function () { var pt = String(form.type || "stock").toLowerCase(); return (pt === "service" || pt === "raw_material") ? pt : "stock"; })(),
        cost: parseFloat(form.cost) || 0,
        price: parseFloat(form.price) || 0,
        stock: 0,
        damaged: 0,
        require_comment: false,
        comment_label: String(form.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
        weightGrams: form.weightGrams,
        makingCharge: form.makingCharge,
        expiryDate: form.expiryDate,
        batchNo: form.batchNo,
      },
      unitFields
    ), form, shopSettings);
    if (!tcTrialGuard(state.products, "products")) return;
    var np = state.products.concat([prod]);
    S.set("tc3_products", np);
    setState(function (st) { return Object.assign({}, st, { products: np }); });
    setNewProd(null);
    setNewProdKey(function (k) { return k + 1; });
    /* Auto-fill the purchase row with saved product details */
    setPs(""); setPc(String(prod.cost)); setPSell(String(prod.price));
    setTimeout(function () { setPs(prod.name); }, 100);
  };

  var purInDateRange = function (p, from, to) {
    var d = String(p.date || "");
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    return true;
  };
  var monthStart = (function () {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
  })();
  var monthEnd = (function () {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10);
  })();
  var lastMonthStart = (function () {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth() - 1, 1).toISOString().slice(0, 10);
  })();
  var lastMonthEnd = (function () {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 0).toISOString().slice(0, 10);
  })();
  var activePurList = activePurchases(state.purchases);
  var kpiList = activePurList.filter(function (p) { return purInDateRange(p, monthStart, monthEnd); });
  var kpiPaid = kpiList.reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
  var kpiBal = kpiList.reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0);
  var pctTrend = function (curr, prev) {
    if (!prev) return curr ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  };
  var thisMonthOrders = activePurList.filter(function (p) { return purInDateRange(p, monthStart, monthEnd); }).length;
  var lastMonthOrders = activePurList.filter(function (p) { return purInDateRange(p, lastMonthStart, lastMonthEnd); }).length;
  var thisMonthPaid = activePurList.filter(function (p) { return purInDateRange(p, monthStart, monthEnd); }).reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
  var lastMonthPaid = activePurList.filter(function (p) { return purInDateRange(p, lastMonthStart, lastMonthEnd); }).reduce(function (a, p) { return a + (p.paidAmount || 0); }, 0);
  var thisMonthBal = activePurList.filter(function (p) { return purInDateRange(p, monthStart, monthEnd); }).reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0);
  var lastMonthBal = activePurList.filter(function (p) { return purInDateRange(p, lastMonthStart, lastMonthEnd); }).reduce(function (a, p) { return a + Math.max(0, (p.total || 0) - (p.paidAmount || 0)); }, 0);
  var ordersTrend = pctTrend(thisMonthOrders, lastMonthOrders);
  var paidTrend = pctTrend(thisMonthPaid, lastMonthPaid);
  var balTrend = pctTrend(thisMonthBal, lastMonthBal);
  var applySidebarFilters = function () {
    setFilterStatus(sideStatus || "Active");
    setFilterSupplier(sideSupplier || "");
    setFilterPayStatus(sidePayStatus || "");
    if (sideDatePreset === "month") {
      setDateFrom(monthStart);
      setDateTo(monthEnd);
    } else if (sideDatePreset === "last_month") {
      setDateFrom(lastMonthStart);
      setDateTo(lastMonthEnd);
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };
  var clearSidebarFilters = function () {
    setSideDatePreset("all");
    setSideSupplier("");
    setSideStatus("Active");
    setSidePayStatus("");
    setFilterStatus("Active");
    setFilterSupplier("");
    setFilterPayStatus("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };
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
    if (filterSupplier && p.supplier !== filterSupplier) return false;
    if (filterPayStatus && p.status !== filterPayStatus) return false;
    if (!purInDateRange(p, dateFrom, dateTo)) return false;
    return mQ;
  });

  var purPager = usePager(filtered, LIST_PAGE_SIZE);
  var unpaidInView = filtered.filter(function (p) { return !isVoidedTxn(p) && p.status === "Unpaid"; }).length;
  var kpiTotal = kpiList.reduce(function (a, p) { return a + (p.total || 0); }, 0);
  var trendSub = function (t) { return (t >= 0 ? "▲ " : "▼ ") + Math.abs(t) + "% vs last month"; };
  var purchaseListKpis = [
    { label: "This month", value: String(kpiList.length), sub: trendSub(ordersTrend), tone: "indigo", icon: "🛒" },
    { label: "Spend", value: getCurrencySymbol() + " " + fmtNum(kpiTotal), sub: "Purchase value", tone: "blue", icon: "💰" },
    { label: "Paid", value: getCurrencySymbol() + " " + fmtNum(kpiPaid), sub: trendSub(paidTrend), tone: "green", icon: "✅" },
    { label: "Outstanding", value: getCurrencySymbol() + " " + fmtNum(kpiBal), sub: trendSub(balTrend), tone: kpiBal > 0 ? "orange" : "teal", icon: kpiBal > 0 ? "⏳" : "✓" },
  ];
  /* CATS is getCats() — see global */;


  var entryPage = viewMode !== "entry" ? null : (
      <div className="erp-pos-shell erp-pur-entry-shell">
          <form
            className="erp-pos erp-pos-modern erp-pur-entry"
            noValidate
            onSubmit={function (e) { e.preventDefault(); }}
          >
            <div className="erp-pos-left">
              <div className="erp-pos-main-card">
                <Card pad={4}>
                  {editingPurchaseId ? (
                    <div className="erp-pos-edit-banner">
                      <span>You are editing purchase <b>{f.invoiceNo}</b>. Save to apply changes or cancel.</span>
                      <button
                        type="button"
                        onClick={function () {
                          clearPurchasePrefill(S);
                          resetPurchaseEntryForm();
                        }}
                        className="erp-pos-seg-btn"
                      >Cancel Edit</button>
                    </div>
                  ) : null}
                  <div className="erp-sale-panel erp-sale-panel-entry" style={{ position: "relative" }}>
                    <div className="erp-sale-box-title erp-sale-entry-title-bar">
                      <button
                        type="button"
                        className="erp-pur-entry-back"
                        onClick={function () { requestLeavePurchaseEntry("purchases"); }}
                      >
                        ← Back
                      </button>
                      <span className="erp-pos-header-doc erp-pos-header-doc-in-title">
                        <span className="erp-pos-header-doc-label">{editingPurchaseId ? "Edit Purchase" : "New Purchase"}</span>
                        <span className="erp-pos-header-doc-sep" aria-hidden="true">·</span>
                        <span className="erp-pos-header-doc-no">{f.invoiceNo}</span>
                        {editingPurchaseId ? <span className="erp-pos-edit-badge">EDITING</span> : null}
                        {activeHeldPurId ? <span className="erp-pos-edit-badge">HELD</span> : null}
                        <span className="erp-pos-header-doc-sep" aria-hidden="true">·</span>
                        <span className="erp-pos-header-doc-date-wrap">
                          <input
                            ref={purDateRef}
                            type="date"
                            className="erp-pos-header-doc-date-input"
                            value={f.date}
                            onChange={function (e) { setF(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }}
                            onClick={openPurDatePicker}
                            aria-label="Purchase date"
                          />
                          <span className="erp-pos-header-doc-date-arrow" aria-hidden="true" onClick={openPurDatePicker}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3 4.5L6 7.5L9 4.5" stroke="#2a5298" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </span>
                      </span>
                    </div>

                    <div className="erp-sale-entry-body">
                      <div className="erp-sale-cust-top erp-sale-cust-inline erp-pur-entry-supplier">
                        <div className="erp-sale-field erp-sale-field-name" style={{ flex: 1, minWidth: 0 }}>
                          <label className="erp-pur-entry-field-lbl">Supplier *</label>
                          {renderSupplierPicker()}
                        </div>
                        <div className="erp-sale-field erp-pur-entry-inv-field">
                          <label className="erp-pur-entry-field-lbl">Invoice #</label>
                          <input
                            type="text"
                            className="erp-sale-cust-input"
                            id="pur-invoice-no"
                            value={f.invoiceNo}
                            onChange={function (e) { setF(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }}
                            onKeyDown={function (e) {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                focusPurSearch("new");
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="erp-sale-product-bar erp-pur-entry-product-bar">
                        <div className="erp-pur-entry-product-main">
                          {renderPurProductToolbar("new")}
                        </div>
                        <div className="erp-sale-product-actions erp-pur-entry-product-actions">
                          <button
                            type="button"
                            className="erp-sale-outline-btn erp-pur-entry-new-prod"
                            onClick={function () { setNewProdKey(function (k) { return k + 1; }); setNewProd(blankNewProd()); }}
                            title="Add New Product (F12)"
                          >
                            + New Product <kbd>F12</kbd>
                          </button>
                          <button
                            type="button"
                            className="erp-sale-outline-btn danger"
                            disabled={!(f.items || []).length && !ps}
                            onClick={function () {
                              setPs(""); setPq(1); setPc(""); setPSell(""); setPPickedProduct(null); setShowPurDrop(false);
                              if ((f.items || []).length) {
                                showConfirm("Clear all products from this purchase?", function () {
                                  setF(function (x) { return Object.assign({}, x, { items: [] }); });
                                });
                              }
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={"erp-pos-cart-area" + (!(f.items || []).length ? " is-empty" : "")}>
                    <div className="erp-sale-items-hdr">
                      <span className="erp-sale-items-hdr-title">Products {(f.items || []).length ? ("(" + f.items.length + ")") : ""}</span>
                    </div>
                    <div className="erp-pur-mock-table-wrap erp-pur-entry-cart">
                      <table className="erp-pur-mock-table erp-sale-excel-table erp-pur-entry-grid" style={purLineTableStyle}>
                        {renderPurLineColgroup()}
                        <thead>
                          <tr>
                            {["#", "PRODUCT", "QTY", "UNIT", "COST", "SELL", "DISCOUNT", "TOTAL", "ACTION"].map(function (h, hi) {
                              var right = hi >= 2 && hi <= 7;
                              return <th key={h} style={{ textAlign: right ? "right" : (hi === 8 ? "center" : "left") }}>{h}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {(f.items || []).length === 0 ? null : (f.items || []).map(function (it, idx) {
                            var lineU = it.inputUnit || it.unit || "Pcs";
                            var rowProd = state.products.find(function (p) { return p.id === it.id; });
                            var lineTot = purchaseLineStockTotal(it);
                            var costField = purchaseLineCostFieldShown(it, rowProd);
                            return (
                              <tr key={it.id || idx}>
                                <td className="num">{idx + 1}</td>
                                <td className="prod">{it.name}</td>
                                <td>
                                  <input type="number" value={it.qty} min="0" step="any"
                                    data-purmode="new" data-purrow={idx} data-purcol={0}
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
                                    className="erp-pur-line-input" />
                                </td>
                                <td className="unit">{lineU}</td>
                                <td>
                                  <input type="number" value={costField}
                                    data-purmode="new" data-purrow={idx} data-purcol={1}
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
                                            var ucb; var lsv;
                                            if (cm === COST_INPUT_PER_BASE) { ucb = raw; lsv = Math.round(qb * ucb * 100) / 100; }
                                            else { ucb = unitCostBaseFromInputCost(raw, iu, pr, toProductBaseQty); lsv = Math.round(qb * ucb * 100) / 100; }
                                            return Object.assign({}, r, { cost: ucb, lineStockValue: lsv, costInputMode: cm });
                                          }),
                                        });
                                      });
                                    }}
                                    onKeyDown={function (e) { handlePurLineFieldKey(e, "new", idx, 1); }}
                                    onFocus={function (e) { e.target.select(); }}
                                    className="erp-pur-line-input" />
                                </td>
                                <td>
                                  <input type="number" value={it.sellPrice}
                                    data-purmode="new" data-purrow={idx} data-purcol={2}
                                    onChange={function (e) { setF(function (x) { return Object.assign({}, x, { items: (x.items || []).map(function (r, i) { return i === idx ? Object.assign({}, r, { sellPrice: parseFloat(e.target.value) || 0 }) : r; }) }); }); }}
                                    onKeyDown={function (e) { handlePurLineFieldKey(e, "new", idx, 2); }}
                                    onFocus={function (e) { e.target.select(); }}
                                    className="erp-pur-line-input" />
                                </td>
                                <td className="disc">—</td>
                                <td className="tot">{getCurrencySymbol()} {fmtNum(lineTot)}</td>
                                <td className="act">
                                  <CloseIconButton size={26} borderRadius={5} tone="danger" onClick={function () { setF(function (x) { return Object.assign({}, x, { items: (x.items || []).filter(function (_, i) { return i !== idx; }) }); }); }} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {!(f.items || []).length ? (
                        <div className="erp-pur-mock-empty erp-pos-empty-cart">
                          <div className="erp-sale-empty-ico" aria-hidden="true">🛒</div>
                          <div className="erp-pos-empty-title">No items added</div>
                          <div className="erp-pos-empty-sub">Search or scan products above to build the purchase</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="erp-pur-mock-notes-row erp-pur-entry-notes">
                      <div className="erp-pur-mock-card">
                        <div className="erp-pur-mock-card-head"><span>Notes</span></div>
                        <textarea
                          placeholder="Enter notes about this purchase..."
                          value={f.note || ""}
                          onChange={function (e) { setF(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }}
                          rows={2}
                        />
                      </div>
                      <div className="erp-pur-mock-card">
                        <div className="erp-pur-mock-card-head"><span>Attachments</span></div>
                        <label className="erp-pur-mock-attach">
                          <input
                            type="file"
                            multiple
                            accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                            onChange={function (e) {
                              var files = Array.prototype.slice.call(e.target.files || []);
                              var next = files.map(function (file) { return { name: file.name, size: file.size }; });
                              setF(function (x) { return Object.assign({}, x, { attachments: (x.attachments || []).concat(next) }); });
                              e.target.value = "";
                            }}
                          />
                          <div className="erp-pur-mock-attach-inner">
                            <div className="erp-pur-mock-attach-text">
                              <strong>Click to attach</strong>
                              <span>JPG, PNG, PDF, DOC</span>
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="erp-pos-right">
              <div className="erp-pos-checkout-panel">
                <div className="erp-sale-checkout">
                  <div className="erp-sale-checkout-hdr">Checkout</div>
                  <div className="erp-sale-checkout-body">
                    <div className="erp-sale-disc-row">
                      <div className="erp-sale-field">
                        <label>Discount %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={purDiscPctDisplay}
                          onChange={function (e) { applyPurDiscountPercent(e.target.value); }}
                          placeholder="0"
                        />
                      </div>
                      <div className="erp-sale-field">
                        <label>Discount ({getCurrencySymbol()})</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={purDiscAmtDisplay}
                          onChange={function (e) { applyPurDiscountAmount(e.target.value); }}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="erp-sale-checkout-totals erp-pur-entry-totals">
                      <div className="erp-pos-total-row"><span>Sub Total</span><span>{getCurrencySymbol()} {fmtNum(formTotal)}</span></div>
                      {formDiscAmt > 0 ? (
                        <div className="erp-pos-total-row" style={{ color: "#e03151" }}>
                          <span>Discount</span>
                          <span>- {getCurrencySymbol()} {fmtNum(formDiscAmt)}</span>
                        </div>
                      ) : null}
                      {state.settings && state.settings.taxEnabled ? (
                        <div className="erp-pos-total-row erp-pur-entry-tax-row">
                          <span>Tax</span>
                          <span className="erp-pur-entry-tax-ctrl">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={f.purchaseTaxAmount || ""}
                              onChange={function (e) { setF(function (x) { return Object.assign({}, x, { purchaseTaxAmount: e.target.value }); }); }}
                              placeholder="0"
                              aria-label="Tax amount"
                            />
                            <em>{getCurrencySymbol()} {fmtNum(purTaxInput)}</em>
                          </span>
                        </div>
                      ) : null}
                      <div className="erp-pos-total-row grand"><span>Grand Total</span><span>{getCurrencySymbol()} {fmtNum(invoiceTotal)}</span></div>
                    </div>

                    <div className="erp-pos-pay-meta">
                      <div className="erp-pos-field-label">Payment mode</div>
                      <div className={"erp-pos-pay-status " + (formStatus === "Paid" ? "paid" : formStatus === "Partial" ? "partial" : "unpaid")}>
                        {formStatus === "Paid" ? "Fully Paid" : formStatus === "Partial" ? "Partial" : "Unpaid"}
                      </div>
                    </div>

                    <div>
                      <div className="erp-pos-field-label" style={{ marginBottom: 4 }}>Pay via</div>
                      <div className="erp-sale-pay-methods">
                        {[["Cash", "Cash"], ["Card", "Card"], ["Cheque", "Cheque"], ["Bank", "Bank Transfer"]].map(function (row) {
                          var method = row[0];
                          var label = row[1];
                          var active = f.payMode !== "unpaid" && (f.cashMethod || "Cash") === method && !(f.splitRows && f.splitRows.length > 0);
                          return (
                            <button
                              key={method}
                              type="button"
                              className={"erp-sale-pay-method" + (active ? " active" : "")}
                              onClick={function () { selectPurPayMethod(method); }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="erp-sale-split-wrap">
                        <button
                          type="button"
                          className="erp-sale-split-btn"
                          disabled={!(f.items || []).length}
                          title={(f.splitRows && f.splitRows.length > 0) ? "Edit Split Payment (F4)" : "Split Payment (F4)"}
                          onClick={function () {
                            if (!(f.items || []).length) return;
                            setPurSplitModal(true);
                            setF(function (x) {
                              if (x.payMode === "unpaid") return Object.assign({}, x, { payMode: "partial" });
                              return x;
                            });
                          }}
                        >
                          <span>{(f.splitRows && f.splitRows.length > 0) ? "Edit Split" : "Split Payment"}</span>
                          <kbd>F4</kbd>
                        </button>
                      </div>
                    </div>

                    {(f.splitRows && f.splitRows.length > 0) ? (
                      <div className="erp-pos-split-panel" onClick={function () { setPurSplitModal(true); }}>
                        {f.splitRows.map(function (r, i) {
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                              <span style={{ color: "#475569" }}>{r.method}{r.method === "Cheque" && r.chequeNo ? " #" + r.chequeNo : ""}</span>
                              <strong style={{ color: r.method === "Cheque" ? "#d97706" : "#059669" }}>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="erp-sale-paid-grid">
                      <div className="erp-sale-field">
                        <label>Paid Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={f.splitRows && f.splitRows.length > 0 ? formPaid : (f.payMode === "paid" ? invoiceTotal : f.paidAmount)}
                          disabled={!!(f.splitRows && f.splitRows.length > 0)}
                          onChange={function (e) {
                            setF(function (x) {
                              return Object.assign({}, x, { payMode: "partial", paidAmount: e.target.value });
                            });
                          }}
                          onFocus={function () {
                            if (f.payMode === "paid") {
                              setF(function (x) {
                                return Object.assign({}, x, { payMode: "partial", paidAmount: String(invoiceTotal) });
                              });
                            }
                          }}
                        />
                      </div>
                      <div className="erp-sale-field">
                        <label>Balance</label>
                        <input type="text" value={getCurrencySymbol() + " " + fmtNum(Math.max(0, formBal))} disabled />
                      </div>
                    </div>

                    <div className="erp-sale-action-stack">
                      <button type="button" className="erp-sale-action-btn print" disabled={!f.supplier || !f.items.length} onClick={function () { doSavePurchase(true); }} title={editingPurchaseId ? "Update + Print Barcodes (F8)" : "Save + Print Barcodes (F8)"}>
                        <span>{editingPurchaseId ? "Update + Print Barcodes" : "Save + Print Barcodes"}</span><kbd>F8</kbd>
                      </button>
                      <button type="button" className="erp-sale-action-btn save" disabled={!f.supplier || !f.items.length} onClick={function () { doSavePurchase(false); }} title={editingPurchaseId ? "Update Purchase (F7)" : "Save Only (F7)"}>
                        <span>{editingPurchaseId ? "Update Purchase" : "Save Only"}</span><kbd>F7</kbd>
                      </button>
                      <button type="button" className="erp-sale-action-btn hold" disabled={!f.items.length} onClick={function () { holdCurrentPurchase(); }} title="Hold Purchase (F9)">
                        <span>Hold</span><kbd>F9</kbd>
                      </button>
                      <button type="button" className="erp-sale-action-btn preview" onClick={function () { requestLeavePurchaseEntry("purchases"); }} title="Cancel (Esc)">
                        <span>Cancel</span><kbd>Esc</kbd>
                      </button>
                    </div>
                  </div>
                </div>

                {heldPurchases.length > 0 ? (
                  <button
                    type="button"
                    className="erp-sale-hold-trigger erp-pur-entry-hold-trigger"
                    onClick={function () { setShowHoldModal(true); }}
                    title="View all on-hold purchases"
                  >
                    <span className="erp-sale-hold-trigger-ico" aria-hidden="true">⏸</span>
                    <span className="erp-sale-hold-trigger-text">
                      <span className="erp-sale-hold-trigger-label">On Hold</span>
                      <span className="erp-sale-hold-trigger-sub">{heldPurchases.length} saved — click to view</span>
                    </span>
                    <span className="erp-pos-held-count" aria-label={heldPurchases.length + " on hold"}>{heldPurchases.length}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        </div>
  );

  var holdListModal = showHoldModal ? (
    <Modal
      className="erp-hold-list-modal"
      title={"On Hold (" + heldPurchases.length + ")"}
      medium
      closeRound
      onClose={function () { setShowHoldModal(false); }}
    >
      <p className="erp-hold-list-modal-hint">These purchases are saved on hold. Continue to load one into the form, or delete to remove it.</p>
      <div className="erp-hold-list-modal-body">
        {heldPurchases.length === 0 ? (
          <div className="erp-hold-list-empty">No held purchases.</div>
        ) : heldPurchases.map(function (h) {
          var hTime = h.heldAt ? new Date(h.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
          var hDate = h.heldAt ? new Date(h.heldAt).toLocaleDateString() : "";
          var itemCount = ((h.form && h.form.items) || []).length;
          var itemTotal = sumPurchaseLinesStockTotal((h.form && h.form.items) || []);
          return (
            <div key={h.id} className="erp-pos-held-row erp-hold-list-row">
              <div className="erp-sale-hold-info">
                <div className="erp-sale-hold-name-row">
                  <span className="erp-sale-hold-name">{h.label || (h.form && h.form.supplier) || "Purchase"}</span>
                  <span className="erp-pos-held-pill pur">Purchase</span>
                  {activeHeldPurId === h.id ? <span className="erp-pos-held-pill active">Active</span> : null}
                </div>
                <div className="erp-sale-hold-meta">
                  {itemCount} item{itemCount !== 1 ? "s" : ""} · {getCurrencySymbol()} {fmtNum(itemTotal)} · {hDate} {hTime}
                </div>
              </div>
              <div className="erp-sale-hold-actions">
                <button
                  type="button"
                  className="erp-sale-hold-btn continue"
                  onClick={function () {
                    var go = function () {
                      loadHeldPurchase(h);
                      setShowHoldModal(false);
                    };
                    if ((f.items || []).length) {
                      showConfirm("Loading this held purchase will replace your current form. Continue?", go);
                    } else {
                      go();
                    }
                  }}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="erp-sale-hold-btn delete"
                  title="Delete"
                  onClick={function () {
                    showConfirm("Delete this held purchase?", function () {
                      var remaining = heldPurchases.length - 1;
                      deleteHeldPurchase(h.id);
                      if (remaining <= 0) setShowHoldModal(false);
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="erp-hold-list-modal-footer">
        <Btn col="gray" onClick={function () { setShowHoldModal(false); }}>Close</Btn>
      </div>
    </Modal>
  ) : null;

  var purToneAccent = function (tone) {
    if (tone === "green") return C.green;
    if (tone === "red") return C.red;
    if (tone === "orange") return C.orange;
    if (tone === "purple" || tone === "indigo") return C.purple;
    if (tone === "cyan" || tone === "teal") return C.cyan;
    return C.blue;
  };

  var PurKpiStrip = function (stripProps) {
    var items = stripProps.items || [];
    return (
      <div className={"erp-pur-stat-row" + (stripProps.compact ? " is-compact" : "")}>
        {items.map(function (k) {
          var accent = purToneAccent(k.tone);
          return (
            <StatCard
              key={k.label}
              money={false}
              label={k.label}
              value={k.value}
              accent={accent}
              valueColor={accent}
              icon={k.icon}
              sub={k.sub}
            />
          );
        })}
      </div>
    );
  };

  return (
    <React.Fragment>
    {entryPage}
    {holdListModal}
    {viewMode === "list" ? (
    <div className="erp-page erp-pur-modern">
      <div className="erp-pur-chrome">
        <div className="erp-pur-topbar-pro">
          <div className="erp-pur-topbar-brand">
            <h2 className="erp-pur-header-title">Purchases</h2>
            <p className="erp-pur-header-sub">Supplier orders, payables &amp; stock intake</p>
          </div>
          <div className="erp-pur-health" aria-label="Purchase summary">
            <span className="erp-pur-health-pill is-ok">{activePurList.length.toLocaleString()} active</span>
            <span className="erp-pur-health-pill">{filtered.length.toLocaleString()} in view</span>
            {unpaidInView > 0 ? <span className="erp-pur-health-pill is-warn">{unpaidInView.toLocaleString()} unpaid</span> : null}
          </div>
          <button type="button" className="erp-pur-btn-primary erp-pur-btn-add" onClick={function () { clearPurchasePrefill(S); openNewPurchase(); }} title="New Purchase (F11)">+ New Purchase <kbd>F11</kbd></button>
        </div>
        <PurKpiStrip items={purchaseListKpis} />
      </div>

      <div className="erp-pur-body">
        <div className="erp-pur-main">
          <div className="erp-pur-panel erp-pur-datatab-pro">
            <div className="erp-pur-panel-head erp-pur-panel-head-gradient">
              <div className="erp-pur-panel-head-left">
                <span className="erp-pur-panel-icon" aria-hidden="true">📋</span>
                <div className="erp-pur-panel-head-text">
                  <span className="erp-pur-panel-title">Purchase register</span>
                  <span className="erp-pur-panel-count">{filtered.length.toLocaleString()} records</span>
                </div>
              </div>
              <div className="erp-pur-panel-head-right">
                <span className="erp-pur-status-legend" aria-label="Status icon meanings">
                  <span className="erp-pur-legend-item"><span className="erp-pur-status-ico paid" aria-hidden="true">✓</span> Paid</span>
                  <span className="erp-pur-legend-item"><span className="erp-pur-status-ico partial" aria-hidden="true">◐</span> Partial</span>
                  <span className="erp-pur-legend-item"><span className="erp-pur-status-ico unpaid" aria-hidden="true">✕</span> Unpaid</span>
                  <span className="erp-pur-legend-item"><span className="erp-pur-status-ico return" aria-hidden="true">↩</span> Part. Return</span>
                </span>
              </div>
            </div>
            <div className="erp-pur-toolbar erp-pur-toolbar-pro">
              <div className="erp-pur-search-wrap erp-pur-search-wrap-pro">
                <input className="erp-pur-field-ctrl" value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search supplier or invoice #..." aria-label="Search purchases" />
              </div>
              <select className="erp-pur-field-ctrl erp-pur-toolbar-status" value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }}>
                <option>Active</option><option>Voided</option><option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
              </select>
              <div className="erp-pur-date-range">
                <input type="date" className="erp-pur-field-ctrl" value={dateFrom} onChange={function (e) { setDateFrom(e.target.value); }} aria-label="From date" />
                <span className="erp-pur-date-sep">–</span>
                <input type="date" className="erp-pur-field-ctrl" value={dateTo} onChange={function (e) { setDateTo(e.target.value); }} aria-label="To date" />
              </div>
              <button type="button" className="erp-pur-date-refresh erp-pur-icon-btn" title="Clear date range" onClick={function () { setDateFrom(""); setDateTo(""); }}>↻</button>
            </div>
            <div className="erp-pur-table-wrap">
              <table className="erp-pur-table">
                <thead>
                  <tr>
                    <th style={{ width: "9%" }}>Date</th>
                    <th style={{ width: "16%" }}>Supplier</th>
                    <th style={{ width: "15%" }}>Invoice #</th>
                    <th className="ctr" style={{ width: "6%" }}>Items</th>
                    <th className="num" style={{ width: "11%" }}>Total</th>
                    <th className="num" style={{ width: "11%" }}>Paid</th>
                    <th className="num" style={{ width: "11%" }}>Balance</th>
                    <th className="ctr" style={{ width: "8%" }}>Status</th>
                    <th className="num" style={{ width: "13%" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="erp-pur-empty-row">No purchases yet</td></tr>
                  ) : null}
                  {purPager.slice.map(function (p) {
                    var purRet = purchaseReturnUiStatus(p, state.purchaseReturns);
                    var statusLabel = displayStatusForPurchase(p, state.purchaseReturns);
                    var statusMeta = purchaseStatusMeta(statusLabel);
                    var bal = Math.max(0, (p.total || 0) - (p.paidAmount || 0));
                    var rowClass = isVoidedTxn(p) ? "row-void" : (purRet.hasReturns ? "row-return" : "");
                    return (
                      <tr key={p.id} className={rowClass} title={purRet.hasReturns ? "This invoice has return activity" : undefined}>
                        <td>{fmtDate(p.date)}</td>
                        <td className="erp-pur-supplier">{p.supplier}</td>
                        <td>
                          <button type="button" className="erp-pur-inv erp-pur-inv-link" title={p.invoiceNo || p.id.slice(0, 8)} onClick={function () { openPurchaseDoc(p); }}>
                            {p.invoiceNo || p.id.slice(0, 8)}
                          </button>
                        </td>
                        <td className="ctr">{(p.items || []).length}</td>
                        <td className="num erp-pur-amt-bold">{getCurrencySymbol()} {fmtNum(p.total)}</td>
                        <td className={"num " + ((p.paidAmount || 0) > 0 ? "erp-pur-amt-paid" : "erp-pur-amt-zero")}>{getCurrencySymbol()} {fmtNum(p.paidAmount || 0)}</td>
                        <td className={"num " + (bal > 0 ? "erp-pur-amt-due" : "erp-pur-amt-zero")}>{getCurrencySymbol()} {fmtNum(bal)}</td>
                        <td className="ctr erp-pur-status-cell">
                          <span className={"erp-pur-status-ico " + statusMeta.tone} title={statusMeta.label} aria-label={statusMeta.label}>{statusMeta.icon}</span>
                        </td>
                        <td className="num">
                          <div className="erp-pur-actions">
                            <ActBtnGroup gap={4}>
                              <ActBtn tone="cyan" title="View purchase" onClick={function () { openPurchaseDoc(p); }} />
                              {!isVoidedTxn(p) ? (function () {
                                var foreignLock = foreignEditLockFor(p.id);
                                void lockTick;
                                return (
                                  <ActBtn
                                    tone="blue"
                                    title={foreignLock ? formatInvoiceEditLockMessage(foreignLock) : "Edit purchase invoice"}
                                    disabled={!!foreignLock}
                                    onClick={function () { tryOpenPurchaseEdit(p); }}
                                  />
                                );
                              })() : null}
                              {!isVoidedTxn(p) ? <ActBtn tone="orange" icon="return" title="Use Purchase Return to reverse stock" onClick={goPurchaseReturn} /> : null}
                              {!isVoidedTxn(p) && canDeleteInvoices ? <ActBtn tone="red" title="Void mistaken purchase" onClick={function () { promptVoidPurchase(p); }} /> : null}
                            </ActBtnGroup>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {purPager.totalPages > 1 ? (
              <div className="erp-pur-pager">
                <div className="erp-pur-pager-info">
                  Showing {purPager.start.toLocaleString()}-{purPager.end.toLocaleString()} of {purPager.total.toLocaleString()} records
                </div>
                <div className="erp-pur-pager-btns">
                  <button type="button" className="erp-pur-pager-btn" onClick={function () { purPager.setPage(Math.max(1, purPager.page - 1)); }} disabled={purPager.page === 1}>{"< Prev"}</button>
                  {(function () {
                    var total = purPager.totalPages;
                    var cur = purPager.page;
                    var pages = [];
                    if (total <= 7) {
                      for (var i = 1; i <= total; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (cur > 3) pages.push("…");
                      for (var p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) {
                        if (pages.indexOf(p) === -1) pages.push(p);
                      }
                      if (cur < total - 2) pages.push("…");
                      pages.push(total);
                    }
                    return pages.map(function (pg, idx) {
                      if (pg === "…") return <span key={"gap-" + idx} className="erp-pur-pager-gap">…</span>;
                      return (
                        <button key={pg} type="button" className={"erp-pur-pager-btn" + (pg === cur ? " active" : "")} onClick={function () { purPager.setPage(pg); }}>{pg}</button>
                      );
                    });
                  })()}
                  <button type="button" className="erp-pur-pager-btn" onClick={function () { purPager.setPage(Math.min(purPager.totalPages, purPager.page + 1)); }} disabled={purPager.page === purPager.totalPages}>{"Next >"}</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="erp-pur-sidebar">
          <div className="erp-pur-side-card erp-pur-side-filters erp-pur-side-card--filters">
            <div className="erp-pur-side-title"><span className="erp-pur-side-title-ico" aria-hidden="true">🔍</span> Filters</div>
            <div className="erp-pur-side-field">
              <label>Date Range</label>
              <select className="erp-pur-field-ctrl" value={sideDatePreset} onChange={function (e) { setSideDatePreset(e.target.value); }}>
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="last_month">Last Month</option>
              </select>
            </div>
            <div className="erp-pur-side-field">
              <label>Supplier</label>
              <select className="erp-pur-field-ctrl" value={sideSupplier} onChange={function (e) { setSideSupplier(e.target.value); }}>
                <option value="">All Suppliers</option>
                {state.suppliers.map(function (s) { return <option key={s.id} value={s.name}>{s.name}</option>; })}
              </select>
            </div>
            <div className="erp-pur-side-field">
              <label>Status</label>
              <select className="erp-pur-field-ctrl" value={sideStatus} onChange={function (e) { setSideStatus(e.target.value); }}>
                <option>Active</option><option>Voided</option><option>All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
              </select>
            </div>
            <div className="erp-pur-side-field">
              <label>Payment Status</label>
              <select className="erp-pur-field-ctrl" value={sidePayStatus} onChange={function (e) { setSidePayStatus(e.target.value); }}>
                <option value="">All</option><option>Paid</option><option>Partial</option><option>Unpaid</option>
              </select>
            </div>
            <button type="button" className="erp-pur-btn-apply" onClick={applySidebarFilters}>Apply Filters</button>
            <button type="button" className="erp-pur-btn-clear" onClick={clearSidebarFilters}>Clear</button>
          </div>
          <div className="erp-pur-side-card erp-pur-side-quick erp-pur-side-card--quick">
            <div className="erp-pur-side-title">
              <span className="erp-pur-side-title-ico" aria-hidden="true">⚡</span>
              <span className="erp-pur-side-title-main">Quick Actions</span>
            </div>
            <div className="erp-pur-quick-list">
              <button type="button" className="erp-pur-quick erp-pur-quick--primary" onClick={function () { clearPurchasePrefill(S); openNewPurchase(); }} title="New Purchase (F11)">
                <span className="erp-pur-quick-ico" aria-hidden="true">＋</span>
                <span className="erp-pur-quick-label">New Purchase</span>
                <kbd className="erp-pur-quick-kbd">F11</kbd>
              </button>
              <button
                type="button"
                className="erp-pur-quick erp-pur-quick--product"
                onClick={function () { setNewProdKey(function (k) { return k + 1; }); setNewProd(blankNewProd()); }}
                title="Add New Product (F12)"
              >
                <span className="erp-pur-quick-ico" aria-hidden="true">📦</span>
                <span className="erp-pur-quick-label">New Product</span>
                <kbd className="erp-pur-quick-kbd">F12</kbd>
              </button>
              <button type="button" className="erp-pur-quick erp-pur-quick--return" onClick={goPurchaseReturn} title="Purchase Return">
                <span className="erp-pur-quick-ico" aria-hidden="true">↩</span>
                <span className="erp-pur-quick-label">Purchase Return</span>
                <span className="erp-pur-quick-kbd erp-pur-quick-kbd--spacer" aria-hidden="true" />
              </button>
              <button type="button" className="erp-pur-quick erp-pur-quick--report" onClick={function () { if (typeof setActive === "function") setActive("reports"); }} title="View Purchase Report">
                <span className="erp-pur-quick-ico" aria-hidden="true">📊</span>
                <span className="erp-pur-quick-label">Purchase Report</span>
                <span className="erp-pur-quick-kbd erp-pur-quick-kbd--spacer" aria-hidden="true" />
              </button>
              <button type="button" className="erp-pur-quick erp-pur-quick--supplier" onClick={function () { if (typeof setActive === "function") setActive("suppliers"); }} title="Supplier Statement">
                <span className="erp-pur-quick-ico" aria-hidden="true">👤</span>
                <span className="erp-pur-quick-label">Supplier Statement</span>
                <span className="erp-pur-quick-kbd erp-pur-quick-kbd--spacer" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
    ) : null}

      {/* New Purchase uses shared full-page route purchase-entry */}

      {/* View & Print — universal invoice preview (same chrome as Sales) */}
      {viewMode === "list" && viewPur && (function () {
        var viewPurRet = purchaseReturnUiStatus(viewPur, state.purchaseReturns);
        var docNo = viewPur.invoiceNo || viewPur.id.slice(0, 8);
        var sheetSize = (viewPurFmt === "thermal58" || viewPurFmt === "thermal80") ? "a4" : viewPurFmt;
        var belowBar = (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
            {viewPurRet.hasReturns ? <span>↩ Returns linked to this purchase</span> : null}
            <span style={{ flex: 1 }} />
            {!isVoidedTxn(viewPur) ? (
              <Btn col="blue" onClick={function () { tryOpenPurchaseEdit(viewPur); }}>Edit Purchase</Btn>
            ) : null}
            {!isVoidedTxn(viewPur) && (viewPur.items || []).length > 0 ? (
              <Btn col="cyan" onClick={function () { openPrintBarcodesFromPurchase(viewPur); }}>Print Barcodes</Btn>
            ) : null}
            {!isVoidedTxn(viewPur) && canDeleteInvoices ? (
              <Btn col="red" onClick={function () { promptVoidPurchase(viewPur); }}>Void Purchase</Btn>
            ) : null}
          </div>
        );
        return (
          <UniversalPrintPreview
            open
            badge="PUR"
            kicker="View & Print"
            title={"Purchase " + docNo}
            subtitle={(viewPur.supplier || "Supplier") + (viewPur.date ? (" · " + fmtDateFull(viewPur.date)) : "")}
            filename={"Purchase-" + docNo}
            settings={state.settings}
            WABtn={WABtn}
            showAlert={showAlert}
            shareViaWhatsApp={shareViaWhatsApp}
            PRINT_FONT_LINK={PRINT_FONT_LINK}
            escapeHtml={escapeHtml}
            showFormats
            format={viewPurFmt}
            onFormatChange={setViewPurFmt}
            previewElId={"pur-view-preview-" + viewPur.id}
            belowBar={belowBar}
            onClose={function () { setViewPur(null); }}
          >
            <PurchaseInvoiceDoc
              pur={viewPur}
              settings={state.settings}
              size={sheetSize}
              fmtDateFull={fmtDateFull}
              fmtNum={fmtNum}
              getCurrencySymbol={getCurrencySymbol}
              fmtStock={fmtStock}
            />
          </UniversalPrintPreview>
        );
      })()}

      {viewMode === "list" && editPur && (
        <Modal
          title={"Update Purchase — " + (editPur.invoiceNo || editPur.id.slice(0, 8))}
          subtitle="Edit purchase invoice details"
          headerIcon={PUR_CART_ICON}
          headerBg="#3949AB"
          closeRound
          onClose={function () { setEditPur(null); }}
          wide
          className="erp-pur-form-modal erp-pur-mock"
          bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          <div className="erp-pur-mock-scroll">
            <div className="erp-pur-mock-layout">
              <div className="erp-pur-mock-main">
                <div className="erp-pur-mock-top">
                  <div className="erp-pur-mock-field erp-pur-mock-supplier">
                    <label>Supplier <span className="req">*</span></label>
                    {renderSupplierPicker()}
                  </div>
                  <div className="erp-pur-mock-field">
                    <label>Purchase Invoice #</label>
                    <input type="text" value={editPur.invoiceNo || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { invoiceNo: e.target.value }); }); }} />
                  </div>
                  <div className="erp-pur-mock-field">
                    <label>Date <span className="req">*</span></label>
                    <Input label="" compact type="date" value={editPur.date || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { date: e.target.value }); }); }} applyPeriodLockMin={!!props.periodLockTransactionMinDate} periodLockTransactionMinDate={props.periodLockTransactionMinDate} />
                  </div>
                </div>

                <div className="erp-pur-mock-products">
                  <div className="erp-pur-mock-sec-head">
                    <div>
                      <div className="erp-pur-mock-sec-title">Products</div>
                      <div className="erp-pur-mock-sec-sub">Add products to this purchase</div>
                    </div>
                    <button type="button" className="erp-pur-mock-btn-outline" onClick={function () { setNewProdKey(function (k) { return k + 1; }); setNewProd(blankNewProd()); }} title="Add New Product (F12)">+ New Product <kbd>F12</kbd></button>
                  </div>
                  {renderPurProductToolbar("edit")}
                  <div className="erp-pur-mock-table-wrap">
                    <table className="erp-pur-mock-table" style={purLineTableStyle}>
                      {renderPurLineColgroup()}
                      <thead>
                        <tr>
                          {["#", "PRODUCT", "QTY", "UNIT", "COST", "SELL", "DISCOUNT", "TOTAL", "ACTION"].map(function (h, hi) {
                            var right = hi >= 2 && hi <= 7;
                            return <th key={h} style={{ textAlign: right ? "right" : (hi === 8 ? "center" : "left") }}>{h}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {(editPur.items || []).length === 0 ? (
                          <tr className="erp-pur-mock-empty-row">
                            <td colSpan={9}>
                              <div className="erp-pur-mock-empty erp-pos-empty-cart">
                                <div className="erp-sale-empty-ico" aria-hidden="true">🛒</div>
                                <div className="erp-pos-empty-title">No items added</div>
                                <div className="erp-pos-empty-sub">Search or scan products above to build the purchase</div>
                              </div>
                            </td>
                          </tr>
                        ) : (editPur.items || []).map(function (it, idx) {
                          var lineTotEd = purchaseLineStockTotal(it);
                          var lineUEd = it.inputUnit || it.unit || "Pcs";
                          var rowProdEd = state.products.find(function (p) { return p.id === it.id; });
                          var costFieldEd = purchaseLineCostFieldShown(it, rowProdEd);
                          return (
                            <tr key={it.id || idx}>
                              <td className="num">{idx + 1}</td>
                              <td className="prod">{it.name}</td>
                              <td>
                                <input type="number" value={it.qty} min="0" step="any"
                                  data-purmode="edit" data-purrow={idx} data-purcol={0}
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
                                  className="erp-pur-line-input" />
                              </td>
                              <td className="unit">{lineUEd}</td>
                              <td>
                                <input type="number" value={costFieldEd}
                                  data-purmode="edit" data-purrow={idx} data-purcol={1}
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
                                          var ucb; var lsv;
                                          if (cm === COST_INPUT_PER_BASE) { ucb = raw; lsv = Math.round(qb * ucb * 100) / 100; }
                                          else { ucb = unitCostBaseFromInputCost(raw, iu, pr, toProductBaseQty); lsv = Math.round(qb * ucb * 100) / 100; }
                                          return Object.assign({}, r, { cost: ucb, lineStockValue: lsv, costInputMode: cm });
                                        }),
                                      });
                                    });
                                  }}
                                  onKeyDown={function (e) { handlePurLineFieldKey(e, "edit", idx, 1); }}
                                  onFocus={function (e) { e.target.select(); }}
                                  className="erp-pur-line-input" />
                              </td>
                              <td>
                                <input type="number" value={it.sellPrice}
                                  data-purmode="edit" data-purrow={idx} data-purcol={2}
                                  onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { items: x.items.map(function (r, i) { return i === idx ? Object.assign({}, r, { sellPrice: parseFloat(e.target.value) || 0 }) : r; }) }); }); }}
                                  onKeyDown={function (e) { handlePurLineFieldKey(e, "edit", idx, 2); }}
                                  onFocus={function (e) { e.target.select(); }}
                                  className="erp-pur-line-input" />
                              </td>
                              <td className="disc">—</td>
                              <td className="tot">{getCurrencySymbol()} {fmtNum(lineTotEd)}</td>
                              <td className="act">
                                <CloseIconButton size={26} borderRadius={5} tone="danger" onClick={function () { setEditPur(function (x) { return Object.assign({}, x, { items: x.items.filter(function (_, i) { return i !== idx; }) }); }); }} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="erp-pur-mock-notes-row">
                  <div className="erp-pur-mock-card">
                    <div className="erp-pur-mock-card-head"><span className="ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span><span>Notes</span></div>
                    <textarea placeholder="Enter notes about this purchase..." value={editPur.note || ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} rows={4} />
                  </div>
                  <div className="erp-pur-mock-card">
                    <div className="erp-pur-mock-card-head"><span className="ico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></span><span>Attachments</span></div>
                    <label className="erp-pur-mock-attach">
                      <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={function (e) {
                        var files = Array.prototype.slice.call(e.target.files || []);
                        var next = files.map(function (file) { return { name: file.name, size: file.size }; });
                        setEditPur(function (x) { return Object.assign({}, x, { attachments: (x.attachments || []).concat(next) }); });
                        e.target.value = "";
                      }} />
                      <div className="erp-pur-mock-attach-inner">
                        <div className="erp-pur-mock-attach-text">
                          <strong>Drag & drop files here or click to browse</strong>
                          <span>JPG, PNG, PDF or DOC (Max 5MB)</span>
                        </div>
                        <span className="erp-pur-mock-attach-up" aria-hidden="true">⬆</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <aside className="erp-pur-mock-side">
                <div className="erp-pur-mock-pay-card">
                  <div className="erp-pur-mock-sec-title">Payment</div>
                  <div className="erp-pur-mock-sec-sub">Select payment status for this purchase</div>
                  <div className="erp-pur-mock-pay-opts">
                    {[["paid", "Fully Paid", "paid"], ["partial", "Partially Paid", "partial"], ["unpaid", "Not Paid", "unpaid"]].map(function (opt) {
                      var v = opt[0]; var lbl = opt[1]; var tone = opt[2];
                      var active = editPur.payMode === v;
                      return (
                        <button key={v} type="button" className={"erp-pur-mock-pay-opt tone-" + tone + (active ? " is-active" : "")}
                          onClick={function () { setEditPur(function (x) { return Object.assign({}, x, { payMode: v, paidAmount: "" }); }); }}>
                          <span className="radio" /><span>{lbl}</span>
                        </button>
                      );
                    })}
                  </div>
                  {editPur.payMode === "partial" ? (
                    <div className="erp-pur-mock-partial">
                      <Input label="Amount Paid" type="number" value={editPur.paidAmount || ""} onChange={function (e) {
                        var newPaid = parseFloat(e.target.value) || 0;
                        setEditPur(function (x) {
                          var orig = (state.purchases || []).find(function (p) { return p.id === x.id; });
                          var origPaid = orig ? (orig.paidAmount || 0) : 0;
                          var diff = Math.round((newPaid - origPaid) * 100) / 100;
                          var existingPh = (orig ? (orig.paymentHistory || []) : (x.paymentHistory || [])).slice();
                          if (diff !== 0) {
                            var pCash = 0; var pBank = 0;
                            existingPh.forEach(function (ph) {
                              if (!ph.cashMethod || ph.cashMethod === "Cheque" || (ph.amount || 0) === 0) return;
                              if (ph.cashMethod === "Bank") pBank += ph.amount; else pCash += ph.amount;
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
                    </div>
                  ) : null}
                </div>

                <div className="erp-pur-mock-sum-card">
                  <div className="erp-pur-mock-sec-title">Summary</div>
                  <div className="erp-pur-mock-sum-row"><span>Total Amount</span><strong>{getCurrencySymbol()} {fmtNum(editLineTotal)}</strong></div>
                  <div className="erp-pur-mock-sum-row disc">
                    <span>Discount</span>
                    <div className="erp-pur-mock-disc-ctrl">
                      <input type="number" min="0" step="0.01" value={editPur.invDiscount != null ? editPur.invDiscount : "0.00"} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { invDiscount: e.target.value }); }); }} />
                      <select value={editPur.invDiscountType || "%"} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { invDiscountType: e.target.value }); }); }}>
                        <option value="%">%</option>
                        <option value="Rs">Rs</option>
                      </select>
                      <em>- {getCurrencySymbol()} {fmtNum(editDiscAmt)}</em>
                    </div>
                  </div>
                  <div className="erp-pur-mock-sum-row tax">
                    <span>Tax</span>
                    <div className="erp-pur-mock-tax-ctrl">
                      {state.settings && state.settings.taxEnabled ? (
                        <input type="number" min="0" step="0.01" value={editPur.totalTax != null && editPur.totalTax !== "" ? editPur.totalTax : ""} onChange={function (e) { setEditPur(function (x) { return Object.assign({}, x, { totalTax: e.target.value }); }); }} placeholder="0.00" />
                      ) : null}
                      <strong>{getCurrencySymbol()} {fmtNum(editTaxAmt)}</strong>
                    </div>
                  </div>
                  <div className="erp-pur-mock-sum-row net"><span>Net Total</span><strong>{getCurrencySymbol()} {fmtNum(editTotal)}</strong></div>
                  <div className="erp-pur-mock-sum-row paid"><span>Paid Amount</span><strong className="green">{getCurrencySymbol()} {fmtNum(editPaid)}</strong></div>
                  <div className="erp-pur-mock-balance"><span>Balance Due</span><strong>{getCurrencySymbol()} {fmtNum(editBal)}</strong></div>
                </div>
              </aside>
            </div>
          </div>
          <div className="erp-pur-mock-footer">
            <button type="button" className="erp-pur-mock-btn-cancel" onClick={function () { setEditPur(null); }}>Cancel</button>
            <div className="erp-pur-mock-footer-right">
              <button type="button" className="erp-pur-mock-btn-save" disabled={!editPur.supplier || !(editPur.items || []).length} onClick={function () { saveEditPur(); }}>Update Purchase</button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Purchase split payment modal */}
      {purSplitModal && (
        <SplitPaymentModal
          title={"Split Payment — " + (f.invoiceNo || "New Purchase")}
          invoiceTotal={invoiceTotal}
          alreadyPaid={0}
          isSale={false}
          onSave={function (splits) {
            setF(function (x) {
              var totalNonCheque = splits.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
              var totalAll = splits.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
              var newPayMode = totalAll >= invoiceTotal ? "paid" : totalNonCheque > 0 || totalAll > 0 ? "partial" : "unpaid";
              var primaryMethod = (splits[0] && splits[0].method) || x.cashMethod || "Cash";
              return Object.assign({}, x, {
                splitRows: splits,
                payMode: newPayMode,
                paidAmount: String(totalNonCheque),
                cashMethod: primaryMethod,
              });
            });
            setPurSplitModal(false);
          }}
          onClose={function () { setPurSplitModal(false); }}
        />
      )}
      {labelQtyModal && (
        <Modal title="Barcode Labels — Set Print Quantity" onClose={function () { setLabelQtyModal(null); }} zIndex={13000}>
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
        <Modal title={"Print Barcode Labels — " + barcodeItems.length + " labels"} onClose={function () { setBarcodeItems(null); }} wide zIndex={13000}>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }} className="no-print">
            <Btn col="cyan" onClick={printBarcodeLabels}>Print Labels</Btn>
            <Btn col="gray" sm onClick={function () { setBarcodeItems(null); }}>Close</Btn>
            <div style={{ marginLeft: "auto", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 7, padding: "8px 14px", fontSize: 12, color: "#0369a1" }}>Cipher key: <strong>{state.settings.costCodeWord || COST_KEY}</strong> (digits 1–9,0 → letters 1st–10th)</div>
          </div>
          <BarcodeLabelSheet items={barcodeItems} shopName={state.settings.shopName} barcodeSettings={state.settings} />
        </Modal>
      )}

      {newProd && (
        <AddNewProductModal
          mode="purchase"
          remountKey={newProdKey}
          initial={newProd}
          productIdLabel={nextProductId(state.products)}
          shopSettings={shopSettings}
          products={state.products}
          Modal={Modal}
          Input={Input}
          Sel={Sel}
          Btn={Btn}
          C={C}
          genBarcode={genBarcode}
          getBusinessProfile={getBusinessProfile}
          getCurrencySymbol={getCurrencySymbol}
          fmtNum={fmtNum}
          showAlert={showAlert}
          showConfirm={showConfirm}
          checkProductName={checkProductName}
          onClose={function () { setNewProd(null); }}
          onSubmit={function (form) { saveNewProduct(form); }}
        />
      )}
      {showAddParty && (
        <AddPartyModal
          open={showAddParty}
          onClose={function () { setShowAddParty(false); }}
          onCreate={handleCreatePurchaseSupplier}
          onSaved={handlePurchaseSupplierSaved}
          suppliers={state.suppliers}
          context="purchase"
          partyKind="supplier"
          initialValues={addPartyInitial}
          hint="This supplier will be saved and automatically selected in the current purchase."
          Modal={Modal}
          Input={Input}
          Btn={Btn}
        />
      )}
      {voidPurTarget && (
        <Modal title={"Void Purchase — " + (voidPurTarget.invoiceNo || voidPurTarget.id.slice(0, 8))} onClose={function () { setVoidPurTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
            This will remove stock added by this purchase and reverse payments. The record stays as <strong>Voided</strong>. Cannot void if units were already sold.
            {(function () {
              var hint = computeVoidPurchaseRefundHint(voidPurTarget, state.cheques || []);
              if (!hint.message) return null;
              return <div style={{ marginTop: 8, color: "#7f1d1d" }}>{hint.message}</div>;
            })()}
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          {(function () {
            var hint = computeVoidPurchaseRefundHint(voidPurTarget, state.cheques || []);
            var paidCash = (voidPurTarget.paymentHistory || []).reduce(function (a, ph) {
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
                <span>I confirm cash/bank paid on this purchase will be collected back (books will post a reversing payment).</span>
              </label>
            );
          })()}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn col="red" disabled={!voidReason} onClick={function () { voidPurchaseInvoice(voidPurTarget.id, voidReason); }}>Void Purchase</Btn>
            <Btn col="gray" onClick={function () { setVoidPurTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </React.Fragment>
  );
});

export default Purchases;


