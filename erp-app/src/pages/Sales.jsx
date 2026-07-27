import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { computeSaleTax } from "../tax/taxCompute.js";
import { getProductUnitRows, factorForNamedUnit } from "../units/productUnits.js";
import {
  netPurchasedBaseQtyForDate,
  rawMaterialOpeningQty,
} from "../utils/rawMaterialQty.js";
import CustomerPicker from "../components/CustomerPicker.jsx";
import { createAndPersistCustomer } from "../utils/customerCreate.js";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { isRepair3pInternalProduct, markRepair3pSoldAfterStockDeduct } from "../utils/repair3pProduct.js";
import { splitSaleItemsByFree, baseQtyInCartLines, FREE_ITEM_LABEL } from "../utils/posFreeItems.js";
import { UI } from "../utils/uiIcons.js";
import { ensureUniqueDocumentNumber } from "../utils/docNumbers.js";
import { DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import {
  buildQuotationTaxExtras,
  mapCartLineToQuotationItem,
  quotationToPrintInv,
} from "../utils/quotationDocument.js";
import { GlassRateInput, glassCartFieldStyle, GlassCutFields, GlassLineExtras, GLASS_CART_FIELD_H } from "../components/GlassCartLine.jsx";
import { buildPrintFmtOptions, resolveDefaultPrintFormat, resolveThermalFormat } from "../utils/printFormat.js";
import UniversalPrintPreview from "../components/UniversalPrintPreview.jsx";
import {
  isGlassProduct,
  recalcGlassCartLine,
  glassLineAmount,
  mapGlassLineToSaleItem,
  glassAvailableSqFt,
  getSheetAreaSqFt,
  getGlassSellRatePerSqFt,
  getGlassCostPerSqFt,
} from "../utils/glassProduct.js";
import { isFreeItemsEnabled, isPosLineCommentsEnabled, isCodSalesTrackEnabled } from "../utils/featureFlags.js";
import { emptyCodTrackForm, buildCodRecordFromSale, shouldPersistCodRecord, COD_SALE_TYPES, validateCodCheckout, isCodCustomerReady } from "../utils/codTracking.js";
import {
  acquireInvoiceEditLockSynced,
  buildInvoiceEditLockIdentity,
  checkForeignInvoiceEditLock,
  formatInvoiceEditLockMessage,
  INVOICE_EDIT_LOCK_HEARTBEAT_MS,
  INVOICE_EDIT_LOCK_OWNERSHIP_MS,
  releaseInvoiceEditLock,
  renewInvoiceEditLockSynced,
  tryAcquireInvoiceEditLock,
} from "../utils/invoiceEditLocks.js";
import { stampProductStock, stampUpdatedAt, stampCustomerBalance, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import { loadFreshProductsForStock, pushKeysNow, assertCartStockAvailable } from "../utils/concurrencyGuards.js";
import { normalizeCashMethodForStorage } from "../accounting/generalLedger.js";

/* ??? POS / SALES ??????????????????????????????????? */
var POS = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var isAdminMode = props.isAdminMode || false;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var tcTrialGuard = props.tcTrialGuard;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var genInvNo = props.genInvNo;
  var roundQty = props.roundQty;
  var C = props.C;
  var getBulkDisplayParts = props.getBulkDisplayParts;
  var fmtStockDual = props.fmtStockDual;
  var fmtStock = props.fmtStock;
  var fmtSumQty = props.fmtSumQty;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var validateTxnAmounts = props.validateTxnAmounts;
  var toProductBaseQty = props.toProductBaseQty;
  var isDecimalUnit = props.isDecimalUnit;
  var getPosCostPerSaleUnit = props.getPosCostPerSaleUnit;
  var getPosSellPricePerSaleUnit = props.getPosSellPricePerSaleUnit;
  var getBaseSellPcsPrice = props.getBaseSellPcsPrice;
  var getBaseCostPcsPrice = props.getBaseCostPcsPrice;
  var SplitPaymentModal = props.SplitPaymentModal;
  var resolvePaymentCreditTargetIds = props.resolvePaymentCreditTargetIds;
  var warnPaymentCustomerMatchSafety = props.warnPaymentCustomerMatchSafety;
  var maybeShowPaymentMatchToasts = props.maybeShowPaymentMatchToasts;
  var showPaymentDupPick = props.showPaymentDupPick;
  var toastAfterCustomerPaymentApplied = props.toastAfterCustomerPaymentApplied;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var WABtn = props.WABtn;
  var fmtDate = props.fmtDate || function (d) { return d || ""; };
  var openPrintWindow = props.openPrintWindow;
  var getDuplicateNormalizedNameKeys = props.getDuplicateNormalizedNameKeys;
  var normalizePaymentCustomerName = props.normalizePaymentCustomerName;
  var InvoiceThermal = props.InvoiceThermal;
  var InvoiceA4 = props.InvoiceA4;
  var getQuickAmounts = props.getQuickAmounts;
  var remainingPcsAfterCartForProduct = props.remainingPcsAfterCartForProduct;
  var fmtDualFromPcs = props.fmtDualFromPcs;
  var fmtQtyUnit = props.fmtQtyUnit;
  var posSetupBlocksCriticalActions = props.posSetupBlocksCriticalActions;
  var validateCoreStartupIdentity = props.validateCoreStartupIdentity;
  var getCoreStartupIdentityAlertMessage = props.getCoreStartupIdentityAlertMessage;
  var TC_SETUP_DISABLE_TITLE = props.TC_SETUP_DISABLE_TITLE;
  var canEditInvoices = props.canEditInvoices === true;
  var canOverrideDiscount = props.canOverrideDiscount === true;
  var currentUser = props.currentUser || null;
  var currentUserRole = String(props.currentUserRole || "cashier");
  var currentUserName = String((currentUser && (currentUser.name || currentUser.username)) || "Staff");
  var clientMachineLabel = String(props.clientMachineLabel || "").trim();
  var invoiceLockIdentity = buildInvoiceEditLockIdentity({
    currentUser: currentUser,
    clientMachineLabel: clientMachineLabel,
  });
  var showPermissionDenied = typeof props.showPermissionDenied === "function"
    ? props.showPermissionDenied
    : function () { showAlert("You do not have permission for this action."); };
  var TH = props.TH;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var [search, setSearch] = useState("");
  var businessType = String(S.get("tc3_businessType", "") || "").toLowerCase();
  var isRestaurant = businessType === "restaurant";
  var shopSettings = state.settings || {};
  var netRole = (props.systemConfig && props.systemConfig.role) || "standalone";
  var freeItemsEnabled = isFreeItemsEnabled(state.settings, businessType, netRole, currentUserRole);
  var codSalesTrackEnabled = isCodSalesTrackEnabled(state.settings, businessType, netRole, currentUserRole);
  var posLineCommentsEnabled = isPosLineCommentsEnabled(state.settings, businessType, netRole, currentUserRole);
  var [posPageTab, setPosPageTab] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.posPageTab === "quotation" ? "quotation" : "sale";
  });
  var isQuotationMode = posPageTab === "quotation" && !isRestaurant;
  var [restaurantProductFilter, setRestaurantProductFilter] = useState("all");
  var getProductType = function (p) { return String((p && p.type) || "stock").toLowerCase(); };
  var isServiceProduct = function (p) { return getProductType(p) === "service"; };
  var isRawMaterialProduct = function (p) { return getProductType(p) === "raw_material"; };
  var isRestaurantServiceProduct = function (p) { return isRestaurant && isServiceProduct(p); };
  var normalizeRestaurantTableName = function (raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  };
  var nextRestaurantTableStableId = function (used) {
    var n = 1;
    while (used["tbl_" + n]) n += 1;
    return "tbl_" + n;
  };
  var createDefaultRestaurantTables = function () {
    return ["T1", "T2", "T3", "T4", "T5", "T6"].map(function (name, idx) {
      return { id: "tbl_" + (idx + 1), name: name, status: "free" };
    });
  };
  var normalizeRestaurantTableCollection = function (rawTables) {
    var base = Array.isArray(rawTables) && rawTables.length > 0 ? rawTables : createDefaultRestaurantTables();
    var used = {};
    var legacyToStable = {};
    var tables = base.map(function (table, idx) {
      var hasSeparateName = !!(table && table.name != null && String(table.name).trim());
      var displayName = normalizeRestaurantTableName(table && (table.name || table.id) || ("T" + (idx + 1))) || ("T" + (idx + 1));
      var rawId = String(table && table.id || "").trim();
      var stableId = rawId;
      if (!hasSeparateName || !stableId || used[stableId]) {
        stableId = nextRestaurantTableStableId(used);
      }
      used[stableId] = 1;
      legacyToStable[displayName] = stableId;
      if (rawId) legacyToStable[rawId] = stableId;
      return {
        id: stableId,
        name: displayName,
        status: String(table && table.status || "free"),
      };
    });
    return { tables: tables, legacyToStable: legacyToStable };
  };
  var normalizeRestaurantOrderCollection = function (rawOrders, legacyToStable, tables) {
    var list = Array.isArray(rawOrders) ? rawOrders : [];
    return list.map(function (order) {
      var rawTableId = String(order && order.tableId || "").trim();
      if (!rawTableId) return order;
      var nextTableId = legacyToStable[rawTableId] || rawTableId;
      if (!legacyToStable[rawTableId] && Array.isArray(tables) && tables.length > 0) {
        var matchedTable = tables.find(function (t) {
          return t && (t.id === rawTableId || t.name === rawTableId);
        });
        if (matchedTable && matchedTable.id) nextTableId = matchedTable.id;
      }
      return nextTableId === rawTableId ? order : Object.assign({}, order, { tableId: nextTableId });
    });
  };
  var DEFAULT_RESTAURANT_TABLES = createDefaultRestaurantTables();
  var [restaurantOrders, setRestaurantOrders] = useState(function () {
    var saved = S.get("tc3_restaurant_orders", []);
    var savedTables = S.get("tc3_restaurant_tables", null);
    var normalizedTables = normalizeRestaurantTableCollection(savedTables);
    return normalizeRestaurantOrderCollection(saved, normalizedTables.legacyToStable, normalizedTables.tables);
  });
  var [restaurantTables, setRestaurantTables] = useState(function () {
    var saved = S.get("tc3_restaurant_tables", null);
    return normalizeRestaurantTableCollection(saved).tables;
  });
  var [showRestaurantTableManager, setShowRestaurantTableManager] = useState(false);
  var [newRestaurantTableName, setNewRestaurantTableName] = useState("");
  var restaurantTableInputWrapRef = useRef(null);
  var [selectedTableId, setSelectedTableId] = useState(function () {
    var saved = S.get("tc3_restaurant_tables", null);
    var normalized = normalizeRestaurantTableCollection(saved).tables;
    if (Array.isArray(normalized) && normalized.length > 0 && normalized[0] && normalized[0].id) return normalized[0].id;
    return "tbl_1";
  });
  var [restaurantDefaultOrderType, setRestaurantDefaultOrderType] = useState(function () {
    var saved = S.get("tc3_restaurant_default_order_type", "takeaway");
    return saved === "dine-in" || saved === "delivery" ? saved : "takeaway";
  });
  var [restaurantOrderType, setRestaurantOrderType] = useState(function () {
    var saved = S.get("tc3_restaurant_default_order_type", "takeaway");
    return saved === "dine-in" || saved === "delivery" ? saved : "takeaway";
  });
  var [restaurantDeliveryDetails, setRestaurantDeliveryDetails] = useState({ name: "", phone: "", address: "" });
  var [billingOrderId, setBillingOrderId] = useState("");
  var [restaurantOrderNote, setRestaurantOrderNote] = useState("");
  var [restaurantToast, setRestaurantToast] = useState("");
  var [restaurantUndo, setRestaurantUndo] = useState(null);
  var [restaurantRecentItems, setRestaurantRecentItems] = useState([]);
  var [restaurantWorkflowTab, setRestaurantWorkflowTab] = useState("overview");
  var [restaurantOrderDetailId, setRestaurantOrderDetailId] = useState("");
  var [splitOrderId, setSplitOrderId] = useState("");
  var [itemSplitPick, setItemSplitPick] = useState({});
  var restaurantQuickSellNames = ["Tea", "Coffee", "Water", "Fried Rice", "Kottu"];
  var restaurantCategoryPriority = ["Main Course", "Rice & Noodles", "Beverages", "Snacks", "Breakfast", "Lunch", "Dinner", "Desserts", "Ingredients"];

  var [cart, setCart] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    if (pf && Array.isArray(pf.items)) {
      return pf.items.slice().reverse().map(function (it) { return mapPrefillItemToCartLine(it, uid); }).filter(Boolean);
    }
    var draft = S.get("tc3_pos_cart_draft", null);
    if (draft && Array.isArray(draft.cart) && draft.cart.length) {
      return draft.cart.map(function (it) {
        return Object.assign({}, it, { cartLineId: it.cartLineId || uid() });
      });
    }
    return [];
  });
  var [freeCart, setFreeCart] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    if (pf && Array.isArray(pf.freeItems) && pf.freeItems.length) {
      return pf.freeItems.map(function (it) {
        return Object.assign(mapPrefillItemToCartLine(it, uid) || {}, { isFree: true, price: 0 });
      }).filter(function (it) { return it && it.id; });
    }
    var draft = S.get("tc3_pos_cart_draft", null);
    if (draft && Array.isArray(draft.freeCart) && draft.freeCart.length) {
      return draft.freeCart.map(function (it) {
        return Object.assign({}, it, { cartLineId: it.cartLineId || uid(), isFree: true, price: 0 });
      });
    }
    return [];
  });
  var [codTrack, setCodTrack] = useState(function () { return emptyCodTrackForm(); });
  var [freeSearch, setFreeSearch] = useState("");
  var [freeDropPos, setFreeDropPos] = useState(null);
  var [freeDropIdx, setFreeDropIdx] = useState(-1);
  var freeSearchRef = useRef(null);
  var cartLineKey = function (it) { return it.cartLineId != null ? it.cartLineId : it.id; };
  /** POS cart: index 0 = newest (top of screen). Invoices/quotations: oldest-first. */
  var cartChronological = function (lines) {
    return (lines || cart).slice().reverse();
  };
  var cartHasGlassLine = cart.some(function (x) { return x && x.isGlassLine; });
  var cartHasNonGlassLine = cart.some(function (x) { return x && !x.isGlassLine; });
  var cartMixedGlassLayout = cartHasGlassLine && cartHasNonGlassLine;
  var glassCartLayout = cartHasGlassLine;
  useEffect(function () {
    if (!cart.length && !freeCart.length) {
      S.set("tc3_pos_cart_draft", null);
      return;
    }
    var tmr = setTimeout(function () {
      S.set("tc3_pos_cart_draft", {
        cart: cart,
        freeCart: freeCart,
        updatedAt: new Date().toISOString(),
      });
    }, 400);
    return function () { clearTimeout(tmr); };
  }, [cart, freeCart]);
  var [custMode, setCustMode] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    if (pf && pf.customerId) return "existing";
    if (pf && pf.customerName) return "walkin";
    return "walkin";
  });
  var [custFocusKey, setCustFocusKey] = useState(0);
  var [productFocusKey, setProductFocusKey] = useState(0);
  var focusCustomerPicker = useCallback(function () {
    setCustFocusKey(function (k) { return k + 1; });
  }, []);
  var requestProductSearchFocus = useCallback(function () {
    setProductFocusKey(function (k) { return k + 1; });
  }, []);
  var openRecordDatePicker = useCallback(function () {
    var el = recordDateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch (e) { /* fall through */ }
    }
    el.focus();
    el.click();
  }, []);
  var [custSearch, setCustSearch] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.customerName || "") : "";
  });
  /* BUG5 FIX: Capture fromRepairId so it can be stored on the sale object.
     This lets P&L reports identify which sales originated from repairs and
     avoid double-counting repair revenue. */
  var [fromRepairId, setFromRepairId] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.fromRepairId || "") : "";
  });
  var [fromRepairDeviceIndexes, setFromRepairDeviceIndexes] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && Array.isArray(pf.fromRepairDeviceIndexes) ? pf.fromRepairDeviceIndexes : [];
  });
  var [fromQuotationId, setFromQuotationId] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.fromQuotationId || "") : "";
  });
  var [custId, setCustId] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.customerId || "") : "";
  });
  var [newCust, setNewCust] = useState({ name: "", phone: "", address: "" });
  var [discount, setDiscount] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.discount != null && pf.discount !== "" ? String(pf.discount) : "";
  });
  var [discountPct, setDiscountPct] = useState("");
  var normalizeDiscountNumber = function (raw) {
    if (raw === null || raw === undefined) return 0;
    var txt = String(raw).trim();
    if (!txt) return 0;
    var num = Number(txt);
    if (!isFinite(num) || isNaN(num)) return 0;
    if (num > 1000000000) num = 1000000000;
    if (num < -1000000000) num = -1000000000;
    return num;
  };
  var [payMode, setPayMode] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return (pf && pf.payMode) || "full";
  });
  var [paidAmt, setPaidAmt] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.paidAmt != null && pf.paidAmt !== "" ? String(pf.paidAmt) : "";
  });
  var [posSplitModal, setPosSplitModal] = useState(false);
  var [posSplitRows, setPosSplitRows] = useState([]);
  var [includeWarranty, setIncludeWarranty] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return !!(pf && pf.includeWarranty);
  });
  var [posCashMethod, setPosCashMethod] = useState("Cash");
  var [posChequeList, setPosChequeList] = useState([]);
  var [posChqForm, setPosChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [posChqModal, setPosChqModal] = useState(false);
  var [invoiceNo, setInvoiceNo] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return (pf && pf.invoiceNo) ? String(pf.invoiceNo) : genInvNo();
  });
  var [quotationNo, setQuotationNo] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return (pf && pf.quotationNo) ? String(pf.quotationNo) : genInvNo("QT");
  });
  var [quotationNotes, setQuotationNotes] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.quotationNotes != null ? String(pf.quotationNotes) : "";
  });
  var [saleNotes, setSaleNotes] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.saleNotes != null ? String(pf.saleNotes) : "";
  });
  var [paymentTerms, setPaymentTerms] = useState("Due on Receipt");
  var [priceLevel, setPriceLevel] = useState("");
  var [salesPerson, setSalesPerson] = useState("");
  var [recordDate, setRecordDate] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return (pf && pf.recordDate) ? String(pf.recordDate) : today();
  });
  var [showRecentItems, setShowRecentItems] = useState(false);
  var [isSavingQuotation, setIsSavingQuotation] = useState(false);
  var [printMode, setPrintMode] = useState(null);
  var [invoice, setInvoice] = useState(null);
  var [waSharePicker, setWaSharePicker] = useState(false);
  var [waSharePickerKind, setWaSharePickerKind] = useState("sale");
  var [posPrintPicker, setPosPrintPicker] = useState(false);
  var [posPrintPickerKind, setPosPrintPickerKind] = useState("sale");
  var [posPrintPickerIntent, setPosPrintPickerIntent] = useState("save"); /* save | preview */
  var [dropPos, setDropPos] = useState(null);
  var [pendingPrint, setPendingPrint] = useState(null);
  var [posDropIdx, setPosDropIdx] = useState(-1);
  var searchRef = useRef(null);
  var recordDateRef = useRef(null);
  var pendingCartFocusRef = useRef(null);
  var waPendingRef = useRef(false); /* true when Save+WhatsApp was clicked */
  var posShortcutRef = useRef({});
  var custModeRef = useRef("walkin");
  var posPageTabRef = useRef("sale");
  var isRestaurantRef = useRef(false);
  var switchPosPageTabRef = useRef(null);
  var lastBeepAtRef = useRef(0);
  var isNetworkClientPos = props.isNetworkClient === true;
  var focusPosSearch = useCallback(function () {
    setTimeout(function () {
      try {
        var el = searchRef.current;
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 0);
  }, []);

  useEffect(function () {
    if (!productFocusKey) return;
    var t1 = setTimeout(function () {
      try {
        var el = searchRef.current;
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 30);
    var t2 = setTimeout(function () {
      try {
        var el = searchRef.current;
        if (el && document.activeElement !== el) {
          el.focus();
          if (typeof el.select === "function") el.select();
        }
      } catch (e) { /* ignore */ }
    }, 120);
    return function () {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [productFocusKey]);

  var focusCartField = useCallback(function (row, col) {
    setTimeout(function () {
      if (col < 0) {
        focusPosSearch();
        return;
      }
      var c;
      for (c = col; c <= 4; c++) {
        var el = document.querySelector("[data-cartrow='" + row + "'][data-cartcol='" + c + "']");
        if (el) {
          el.focus();
          if (typeof el.select === "function") el.select();
          return;
        }
      }
      if (col === 0) {
        var qtyEl = document.querySelector("[data-cartrow='" + row + "'][data-cartcol='1']");
        if (qtyEl) { qtyEl.focus(); if (typeof qtyEl.select === "function") qtyEl.select(); return; }
      }
      if (col === 1) {
        var commentEl = document.querySelector("[data-cartrow='" + row + "'][data-cartcol='2']");
        if (commentEl) { commentEl.focus(); return; }
        focusPosSearch();
        return;
      }
      if (col === 2) {
        focusPosSearch();
        return;
      }
      /* Newest line (row 0): after last field, add next product — not older rows */
      if (row === 0) {
        focusPosSearch();
        return;
      }
      var nextRow = row + 1;
      var nextPrice = document.querySelector("[data-cartrow='" + nextRow + "'][data-cartcol='0']");
      if (nextPrice) {
        nextPrice.focus();
        if (typeof nextPrice.select === "function") nextPrice.select();
        return;
      }
      var nextGlass = document.querySelector("[data-cartrow='" + nextRow + "'][data-cartcol='1']");
      if (nextGlass) {
        nextGlass.focus();
        if (typeof nextGlass.select === "function") nextGlass.select();
        return;
      }
      focusPosSearch();
    }, 0);
  }, [focusPosSearch]);

  var handleCartFieldKey = useCallback(function (e, row, col) {
    if (e.key === "ArrowUp") { e.preventDefault(); focusCartField(row - 1, col); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); focusCartField(row + 1, col); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); focusCartField(row, col - 1); return; }
    if (e.key === "ArrowRight" || e.key === "Tab") {
      if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); focusCartField(row, col - 1); return; }
      e.preventDefault();
      focusCartField(row, col + 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      var line = cart[row];
      var isGlass = !!(line && line.isGlassLine);
      if (col === 0) {
        focusCartField(row, 1);
      } else if (col === 1 && !isGlass) {
        /* Standard product: price → qty → add next product */
        focusPosSearch();
      } else if (isGlass && col >= 1 && col < 4) {
        focusCartField(row, col + 1);
      } else if (isGlass && col === 4) {
        focusPosSearch();
      } else {
        focusPosSearch();
      }
      return;
    }
  }, [focusCartField, focusPosSearch, cart]);

  useEffect(function () {
    if (!freeItemsEnabled && freeCart.length) setFreeCart([]);
  }, [freeItemsEnabled]);

  useEffect(function () {
    if (!codSalesTrackEnabled && codTrack.trackInCod) setCodTrack(emptyCodTrackForm());
  }, [codSalesTrackEnabled]);

  var codCustomerReady = isCodCustomerReady(custMode, custId, newCust, state.customers);

  useEffect(function () {
    if (codTrack.saleType === "COD" && !codCustomerReady) {
      setCodTrack(function (x) {
        if (x.saleType !== "COD") return x;
        return Object.assign({}, x, { saleType: "Direct Sale" });
      });
    }
  }, [codCustomerReady, codTrack.saleType]);

  useEffect(function () {
    if (!pendingCartFocusRef.current) return;
    var pending = pendingCartFocusRef.current;
    pendingCartFocusRef.current = null;
    var t = setTimeout(function () {
      focusCartField(pending.row, pending.col);
    }, 60);
    return function () { clearTimeout(t); };
  }, [cart, focusCartField]);

  /* ?? Held invoices: load from IDB ?? */
  var [heldInvoices, setHeldInvoices] = useState(function () {
    var saved = S.get("tc3_held_invoices", []);
    return Array.isArray(saved) ? saved : [];
  });
  var [activeHeldId, setActiveHeldId] = useState(null); /* ID of the currently loaded held invoice */
  var [showHoldModal, setShowHoldModal] = useState(false);

  var [editingSaleId,  setEditingSaleId]  = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf && pf.editingSaleId ? String(pf.editingSaleId) : "";
  });      /* non-empty when POS is in edit mode */
  var [editingQuotationId, setEditingQuotationId] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    /* Consume prefill once all mount initializers have read it */
    if (pf) { S.set("tc3_repair_prefill", null); }
    return pf && pf.editingQuotationId ? String(pf.editingQuotationId) : "";
  });

  useEffect(function () {
    if (!editingSaleId) return;
    var saleId = editingSaleId;
    var alive = true;
    var clearEditUi = function () {
      setEditingSaleId("");
      setInvoiceNo(genInvNo());
      setCart([]);
      setCustMode("walkin");
      setCustSearch("");
      setCustId("");
      setDiscount("");
    };
    acquireInvoiceEditLockSynced(S, saleId, invoiceLockIdentity)
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
        showAlert("Could not lock this invoice for editing. Check network and try again.");
        clearEditUi();
      });
    var tick = function () {
      renewInvoiceEditLockSynced(S, saleId, invoiceLockIdentity).then(function (r) {
        if (!alive) return;
        if (r && r.ok) return;
        showAlert((r && r.message) || formatInvoiceEditLockMessage(r && r.conflict));
        clearEditUi();
      }).catch(function () { /* ignore */ });
    };
    var hb = setInterval(tick, INVOICE_EDIT_LOCK_HEARTBEAT_MS);
    var own = setInterval(function () {
      checkForeignInvoiceEditLock(S, saleId, invoiceLockIdentity).then(function (foreign) {
        if (!alive || !foreign) return;
        showAlert(formatInvoiceEditLockMessage(foreign));
        clearEditUi();
      }).catch(function () { /* ignore */ });
    }, INVOICE_EDIT_LOCK_OWNERSHIP_MS);
    return function () {
      alive = false;
      clearInterval(hb);
      clearInterval(own);
      releaseInvoiceEditLock(S, saleId, invoiceLockIdentity);
    };
  }, [editingSaleId, invoiceLockIdentity.deviceId]);

  var clearPosSaleEdit = function () {
    setEditingSaleId("");
    setEditingQuotationId("");
    setInvoiceNo(genInvNo());
    setCart([]);
    setFreeCart([]);
    setCustMode("walkin");
    setCustSearch("");
    setCustId("");
    setDiscount("");
    setRecordDate(today());
  };

  /* ?? Keep window snapshot current so Hold Invoice modal can capture it ?? */
  useEffect(function () {
    window._techon_pos_snapshot = {
      cart: cart, freeCart: freeCart, custId: custId, custMode: custMode, custSearch: custSearch,
      newCust: newCust, discount: discount, fromRepairId: fromRepairId, fromRepairDeviceIndexes: fromRepairDeviceIndexes,
      fromQuotationId: fromQuotationId, invoiceNo: invoiceNo,
      quotationNo: quotationNo, quotationNotes: quotationNotes,
      posPageTab: isQuotationMode ? "quotation" : "sale",
      holdKind: isQuotationMode ? "quotation" : "sale",
      includeWarranty: includeWarranty, posSplitRows: posSplitRows,
      paidAmt: paidAmt, payMode: payMode,
      editingSaleId: editingSaleId,
      recordDate: recordDate,
      codTrack: codTrack,
      _activeHeldId: activeHeldId
    };
  }, [cart, freeCart, custId, custMode, custSearch, newCust, discount, includeWarranty, posSplitRows, invoiceNo, quotationNo, quotationNotes, isQuotationMode, paidAmt, payMode, editingSaleId, fromRepairId, fromRepairDeviceIndexes, fromQuotationId, activeHeldId, codTrack, recordDate]);

  /* Clear snapshot on unmount, refresh held invoices on mount */
  useEffect(function () {
    /* Re-read held invoices from IDB every time POS mounts */
    var saved = S.get("tc3_held_invoices", []);
    setHeldInvoices(Array.isArray(saved) ? saved : []);
    return function () { window._techon_pos_snapshot = null; };
  }, []);

  useEffect(function () {
    if (!isRestaurant) return;
    S.set("tc3_restaurant_orders", restaurantOrders);
  }, [isRestaurant, restaurantOrders, S]);

  useEffect(function () {
    if (!isRestaurant) return;
    S.set("tc3_restaurant_tables", restaurantTables);
  }, [isRestaurant, restaurantTables, S]);

  useEffect(function () {
    if (!isRestaurant) return;
    if (restaurantTables.length > 0) return;
    setRestaurantTables(DEFAULT_RESTAURANT_TABLES.slice());
  }, [isRestaurant, restaurantTables]);

  useEffect(function () {
    if (!isRestaurant) return;
    if (!showRestaurantTableManager) return;
    setNewRestaurantTableName(function (prev) {
      return normalizeRestaurantTableName(prev) ? prev : getNextRestaurantTableName();
    });
  }, [isRestaurant, showRestaurantTableManager, restaurantTables]);

  useEffect(function () {
    if (!isRestaurant) return;
    if (!restaurantToast) return;
    var t = setTimeout(function () { setRestaurantToast(""); }, 1800);
    return function () { clearTimeout(t); };
  }, [isRestaurant, restaurantToast]);

  useEffect(function () {
    if (!isRestaurant) return;
    S.set("tc3_restaurant_default_order_type", restaurantDefaultOrderType);
  }, [isRestaurant, restaurantDefaultOrderType, S]);

  useEffect(function () {
    if (!isRestaurant) return;
    if (!restaurantUndo) return;
    var t = setTimeout(function () { setRestaurantUndo(null); }, 3000);
    return function () { clearTimeout(t); };
  }, [isRestaurant, restaurantUndo]);

  useEffect(function () {
    custModeRef.current = custMode;
  }, [custMode]);

  useEffect(function () {
    posPageTabRef.current = posPageTab;
  }, [posPageTab]);

  useEffect(function () {
    isRestaurantRef.current = isRestaurant;
  }, [isRestaurant]);

  useEffect(function () {
    var onKey = function (e) {
      var tag = String((e.target && e.target.tagName) || "").toLowerCase();
      var isTextInput = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isTextInput) {
          e.preventDefault();
          focusPosSearch();
        }
      }
      if (e.key === "Escape" && !isTextInput) {
        focusPosSearch();
      }
    };
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [focusPosSearch]);

  /* Alt alone: Walk-in ↔ Customer. Ctrl alone: Sales ↔ Quotation. */
  useEffect(function () {
    var altAlone = false;
    var ctrlAlone = false;
    var onDown = function (e) {
      if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
        altAlone = true;
        return;
      }
      if (e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight") {
        ctrlAlone = true;
        return;
      }
      if (e.altKey) altAlone = false;
      if (e.ctrlKey) ctrlAlone = false;
    };
    var onUp = function (e) {
      var isAlt = e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight";
      var isCtrl = e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight";
      if (!isAlt && !isCtrl) return;

      if (isAlt) {
        var wasAltAlone = altAlone;
        altAlone = false;
        if (!wasAltAlone) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        if (custModeRef.current === "walkin") {
          setCustMode("existing");
          setCustId("");
          setCustFocusKey(function (k) { return k + 1; });
        } else {
          setCustMode("walkin");
          setCustId("");
          setCustSearch("");
          setNewCust({ name: "", phone: "", address: "" });
          requestProductSearchFocus();
        }
        return;
      }

      var wasCtrlAlone = ctrlAlone;
      ctrlAlone = false;
      if (!wasCtrlAlone) return;
      if (e.altKey || e.metaKey || e.shiftKey) return;
      if (isRestaurantRef.current) return;
      e.preventDefault();
      var nextTab = posPageTabRef.current === "quotation" ? "sale" : "quotation";
      if (typeof switchPosPageTabRef.current === "function") {
        switchPosPageTabRef.current(nextTab);
      }
    };
    document.addEventListener("keydown", onDown, true);
    document.addEventListener("keyup", onUp, true);
    return function () {
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
    };
  }, [requestProductSearchFocus]);

  /* Auto-focus product / barcode field for fast scanning */
  useEffect(function () {
    focusPosSearch();
  }, [focusPosSearch]);

  /* Client POS: warn before closing / refresh with a non-empty cart */
  useEffect(function () {
    if (!isNetworkClientPos) return;
    var onBeforeUnload = function (e) {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = "Items are in the cart. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return function () { window.removeEventListener("beforeunload", onBeforeUnload); };
  }, [cart.length, isNetworkClientPos]);



  var filteredProds = useMemo(function () {
    if (!search) return [];
    var q = search.toLowerCase();
    return state.products.filter(function (p) {
      /* FIX 8: Exclude inactive (soft-deleted) products from POS selection */
      if (p.status === "inactive") return false;
      if (isRepair3pInternalProduct(p)) return false;
      if (!productMatchesSearch(p, q)) return false;
      if (isRawMaterialProduct(p)) return false;
      if (!isRestaurant) return true;
      var isService = isServiceProduct(p);
      if (restaurantProductFilter === "service" && !isService) return false;
      if (restaurantProductFilter === "stock" && isService) return false;
      return isService || (p.stock || 0) > 0;
    }).sort(function (a, b) {
      /* exact barcode / product ID matches first */
      var aExact = productMatchesSearchExact(a, q);
      var bExact = productMatchesSearchExact(b, q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return (b.stock || 0) - (a.stock || 0);
    });
  }, [search, state.products, isRestaurant, restaurantProductFilter]);
  var filteredFreeProds = useMemo(function () {
    if (!freeSearch || isRestaurant) return [];
    var q = freeSearch.toLowerCase();
    return state.products.filter(function (p) {
      if (p.status === "inactive") return false;
      if (isRepair3pInternalProduct(p)) return false;
      if (!productMatchesSearch(p, q)) return false;
      if (isRawMaterialProduct(p)) return false;
      return (p.stock || 0) > 0 || isServiceProduct(p);
    }).sort(function (a, b) {
      var aExact = productMatchesSearchExact(a, q);
      var bExact = productMatchesSearchExact(b, q);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return (b.stock || 0) - (a.stock || 0);
    });
  }, [freeSearch, state.products, isRestaurant]);
  var posDupNameKeys = getDuplicateNormalizedNameKeys(state.customers);
  var savePosInlineCustomer = function (draft) {
    var result = createAndPersistCustomer({
      customers: state.customers,
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    var created = result.customer;
    setCustMode("existing");
    setCustId(created.id);
    setCustSearch(created.name + (created.phone ? (" - " + created.phone) : ""));
    setNewCust({ name: "", phone: "", address: "" });
    return created;
  };
  var getCartBaseQty = function (it) {
    var prod = state.products.find(function (p) { return p.id === it.id; });
    if (!prod) return it.qty || 0;
    return toProductBaseQty(it.qty || 0, it.saleUnit || it.unit || "Pcs", prod);
  };
  /** Line total = qty ? price (or baseQty ? baseSellPcs); cents via toFixed(2) to avoid float noise */
  var posLineAmount = function (it) {
    if (it && it.isGlassLine) return glassLineAmount(it);
    var prod = state.products.find(function (p) { return p.id === it.id; });
    var raw;
    if (!prod) raw = (Number(it.qty) || 0) * (Number(it.price) || 0);
    else if (it.customPrice) raw = (Number(it.qty) || 0) * (Number(it.price) || 0);
    else {
      var baseQty = toProductBaseQty(it.qty || 0, it.saleUnit || it.unit || "Pcs", prod);
      raw = baseQty * getBaseSellPcsPrice(prod);
    }
    return Number(raw.toFixed(2));
  };
  var subTotal = Number(cart.reduce(function (a, it) { return a + posLineAmount(it); }, 0).toFixed(2));
  var safeDiscountInput = normalizeDiscountNumber(discount);
  var discAmt = Math.min(safeDiscountInput, subTotal);
  var taxableNet = Math.max(0, subTotal - discAmt);
  var taxApplyBase = (state.settings && state.settings.taxApplyBase) || "after_discount";
  var useTaxBeforeDisc = taxApplyBase === "before_discount" && state.settings && state.settings.taxEnabled && state.settings.taxMode === "exclusive";
  var taxCalcInput = useTaxBeforeDisc ? subTotal : taxableNet;
  var posTaxCalc = computeSaleTax(state.settings, taxCalcInput);
  var total = useTaxBeforeDisc
    ? Number((subTotal - discAmt + (posTaxCalc.totalTax || 0)).toFixed(2))
    : Number((posTaxCalc.grandTotal != null ? posTaxCalc.grandTotal : 0).toFixed(2));
  var posTaxLines = posTaxCalc.selectedTaxes || [];
  var posTotalTax = posTaxCalc.totalTax || 0;
  /* Live paid/balance: use splitRows non-cheque total when splits are set */
  var splitNonChequeTotal = (posSplitRows && posSplitRows.length > 0)
    ? posSplitRows.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0)
    : 0;
  var splitAllTotal = (posSplitRows && posSplitRows.length > 0)
    ? posSplitRows.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0)
    : 0;
  var paidNum = (posSplitRows && posSplitRows.length > 0)
    ? splitNonChequeTotal
    : (payMode === "full" ? total : (payMode === "partial" ? Math.min(parseFloat(paidAmt) || 0, total) : 0));
  var balanceDue = total - paidNum;
  var payStatus = (posSplitRows && posSplitRows.length > 0)
    ? (splitAllTotal >= total ? "Paid" : splitNonChequeTotal > 0 || splitAllTotal > 0 ? "Partial" : "Unpaid")
    : (paidNum >= total ? "Paid" : paidNum > 0 ? "Partial" : "Unpaid");
  var cartTotalQty = Number(cart.reduce(function (a, it) { return a + (Number(it.qty) || 0); }, 0).toFixed(2));
  var selectedPosCustomer = (custMode === "existing" && custId)
    ? (state.customers || []).find(function (c) { return c.id === custId; }) || null
    : null;
  var posDisplayPhone = custMode === "walkin"
    ? ""
    : (custMode === "new" ? (newCust.phone || "") : (selectedPosCustomer ? (selectedPosCustomer.phone || "") : ""));
  var recentPosProducts = useMemo(function () {
    var ids = [];
    (state.sales || []).slice(-40).reverse().forEach(function (s) {
      (s.items || []).forEach(function (it) {
        if (it && it.id && ids.indexOf(it.id) < 0) ids.push(it.id);
      });
    });
    return ids.slice(0, 12).map(function (id) {
      return (state.products || []).find(function (p) { return p.id === id; });
    }).filter(Boolean);
  }, [state.sales, state.products]);
  var applyDiscountAmount = function (raw) {
    var nextNum = normalizeDiscountNumber(raw);
    if (!canOverrideDiscount && nextNum > 0) {
      showPermissionDenied("apply discount overrides");
      return;
    }
    setDiscount(raw);
    if (!subTotal) { setDiscountPct(""); return; }
    var pct = Math.max(0, Math.min(100, (nextNum / subTotal) * 100));
    setDiscountPct(nextNum > 0 ? String(Number(pct.toFixed(2))) : "");
  };
  var applyDiscountPercent = function (raw) {
    var pct = normalizeDiscountNumber(raw);
    if (!canOverrideDiscount && pct > 0) {
      showPermissionDenied("apply discount overrides");
      return;
    }
    if (pct > 100) pct = 100;
    setDiscountPct(raw);
    var amt = Number(((subTotal * pct) / 100).toFixed(2));
    setDiscount(pct > 0 ? String(amt) : "");
  };
  var selectPosPayMethod = function (method) {
    if (posSetupBlocksCriticalActions() || isCheckingOut) return;
    setPosCashMethod(method);
    if (method === "Cheque") {
      setPosChqModal(true);
      return;
    }
    setPosChequeList([]);
    if (!(posSplitRows && posSplitRows.length > 0)) {
      setPayMode("full");
      setPaidAmt("");
    }
  };
  var removeLastCartRow = function () {
    if (!cart.length) return;
    var last = cart[0];
    if (!last) return;
    updateQty(cartLineKey(last), 0);
  };

  function findOpenOrderForTable(tableId) {
    if (!tableId) return null;
    return restaurantOrders.find(function (o) { return o.tableId === tableId && !isOrderFullyBilled(o); }) || null;
  }

  var getReservedBaseQtyForProduct = function (p) {
    return baseQtyInCartLines(p, cart, toProductBaseQty) + baseQtyInCartLines(p, freeCart, toProductBaseQty);
  };

  var buildFreeCartLine = function (p, qty) {
    var su = p.unit || "Pcs";
    var lbl = String(p.comment_label || "").trim();
    return {
      cartLineId: uid(),
      id: p.id,
      name: p.name,
      barcode: p.barcode || "",
      unit: su,
      saleUnit: su,
      qty: qty,
      price: 0,
      cost: getPosCostPerSaleUnit(p, su),
      stock: p.stock,
      description: p.description || "",
      comment: "",
      commentLabel: lbl || "Comment",
      requireComment: posLineCommentsEnabled,
      itemNote: "",
      customPrice: true,
      isFree: true,
    };
  };

  var addToFreeCart = function (p) {
    if (isRestaurant) return;
    if (!cart.length) {
      showAlert("Add at least one paid sale item before adding free gifts.");
      return;
    }
    var isService = isServiceProduct(p);
    var reserved = getReservedBaseQtyForProduct(p);
    if (!isQuotationMode && !isService && (p.stock || 0) === 0) { showAlert("\"" + p.name + "\" is out of stock."); setFreeSearch(""); return; }
    if (!isQuotationMode && !isService && reserved >= (p.stock || 0)) {
      var leftMsg = getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit);
      showAlert("Not enough stock for \"" + p.name + "\". Only " + leftMsg + " left.");
      setFreeSearch("");
      return;
    }
    try { sessionStorage.setItem("tc3_dirty", "pos"); } catch (e) { }
    var step = isDecimalUnit(p.unit) ? 0.5 : 1;
    var needLinePerUnit = posLineCommentsEnabled;
    setFreeCart(function (prev) {
      if (!needLinePerUnit) {
        var ex = prev.find(function (x) { return x.id === p.id; });
        if (ex) return prev.map(function (x) {
          if (x.id !== p.id) return x;
          return Object.assign({}, x, {
            cartLineId: x.cartLineId || uid(),
            qty: Math.round((x.qty + step) * 10000) / 10000,
          });
        });
      }
      return prev.concat([buildFreeCartLine(p, step)]);
    });
    setFreeSearch("");
    focusPosSearch();
  };

  var updateFreeQty = function (lineKey, q) {
    if (q <= 0) {
      setFreeCart(function (prev) { return prev.filter(function (x) { return cartLineKey(x) !== lineKey; }); });
      return;
    }
    var item = freeCart.find(function (x) { return cartLineKey(x) === lineKey; });
    if (item) {
      var prod = state.products.find(function (p) { return p.id === item.id; });
      if (prod && !isServiceProduct(prod)) {
        var curBase = toProductBaseQty(item.qty || 0, item.saleUnit || item.unit || "Pcs", prod);
        var newBase = toProductBaseQty(q, item.saleUnit || item.unit || "Pcs", prod);
        var reserved = getReservedBaseQtyForProduct(prod) - curBase + newBase;
        if (reserved > (prod.stock || 0)) {
          var leftMsg = getBulkDisplayParts(prod) ? fmtStockDual(prod) : fmtStock(prod.stock, prod.unit);
          showAlert("Not enough stock for \"" + item.name + "\". Only " + leftMsg + " left.");
          return;
        }
      }
    }
    setFreeCart(function (prev) {
      return prev.map(function (x) { return cartLineKey(x) === lineKey ? Object.assign({}, x, { qty: q }) : x; });
    });
  };

  var removeFreeLine = function (lineKey) {
    setFreeCart(function (prev) { return prev.filter(function (x) { return cartLineKey(x) !== lineKey; }); });
  };

  var mapCartLineToSaleItem = function (it) {
    var prod = state.products.find(function (p) { return p.id === it.id; });
    if (it && it.isGlassLine && prod) return mapGlassLineToSaleItem(it, prod);
    var saleUnit = it.saleUnit || it.unit || "Pcs";
    var baseQty = prod ? toProductBaseQty(it.qty || 0, saleUnit, prod) : (it.qty || 0);
    var baseCost = prod ? getBaseCostPcsPrice(prod) : (Number(it.cost) || 0);
    var basePrice;
    var inputPrice = Number(it.price) || 0;
    if (it.customPrice) {
      var lineAmt = posLineAmount(it);
      basePrice = baseQty > 0 ? Number((lineAmt / baseQty).toFixed(4)) : inputPrice;
    } else {
      basePrice = prod ? getBaseSellPcsPrice(prod) : inputPrice;
      inputPrice = prod ? getPosSellPricePerSaleUnit(prod, saleUnit) : inputPrice;
    }
    var comm = String(it.comment || "").trim();
    var lineLbl = prod ? (String(prod.comment_label || "").trim() || "Comment") : "Comment";
    var row = Object.assign({}, it, {
      qty: baseQty,
      cost: baseCost,
      price: basePrice,
      inputQty: it.qty,
      inputUnit: saleUnit,
      inputPrice: inputPrice,
      product_id: it.id,
    });
    delete row.comment;
    delete row.commentLabel;
    delete row.requireComment;
    delete row.itemNote;
    if (comm) {
      row.comment = comm;
      row.commentLabel = lineLbl;
    }
    return row;
  };

  var updateGlassCartItem = function (lineKey, nextLine) {
    var prod = state.products.find(function (p) { return p.id === nextLine.id; });
    if (!prod) return;
    var recalc = recalcGlassCartLine(nextLine, prod);
    if (!isQuotationMode && (Number(recalc.glassTotalSqFt) || 0) > 0) {
      var otherBase = cart.filter(function (x) { return cartLineKey(x) !== lineKey && x.id === prod.id; }).reduce(function (a, x) { return a + (Number(x.qty) || 0); }, 0);
      var needSheets = (Number(recalc.qty) || 0) + otherBase;
      if (needSheets > (prod.stock || 0) + 1e-9) {
        showAlert("Not enough glass stock for \"" + prod.name + "\". Available: " + fmtNum(glassAvailableSqFt(prod)) + " Sq Ft.");
        return;
      }
    }
    setCart(function (prev) {
      return prev.map(function (x) { return cartLineKey(x) === lineKey ? recalc : x; });
    });
  };

  var addToCart = function (p, opts) {
    opts = opts || {};
    var focusAfterAdd = opts.focusAfterAdd !== false;
    var latestForTable = isRestaurantDineIn ? findOpenOrderForTable(selectedTableId) : null;
    var orderClosed = !!(latestForTable && isOrderFullyBilled(latestForTable));
    if (orderClosed) {
      showAlert("Order Closed for this table. Start/use another table.");
      return;
    }
    var isService = isServiceProduct(p);
    var isGlass = isGlassProduct(p, shopSettings);
    if (isGlass && !(getSheetAreaSqFt(p) > 0)) {
      showAlert("\"" + p.name + "\" has no sheet size configured.\nEdit the product and enter sheet width and height first.");
      setSearch("");
      return;
    }
    var inCartBaseQty = getReservedBaseQtyForProduct(p);
    if (!isQuotationMode && !isService && (p.stock || 0) === 0) { showAlert("\"" + p.name + "\" is out of stock."); setSearch(""); return; }
    if (!isQuotationMode && !isService && inCartBaseQty >= (p.stock || 0)) {
      var leftMsg = getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit);
      showAlert("Not enough stock for \"" + p.name + "\". Only " + leftMsg + " left.");
      setSearch("");
      return;
    }
    try { sessionStorage.setItem("tc3_dirty", "pos"); } catch (e) { }
    var step = isDecimalUnit(p.unit) ? 0.5 : 1;
    var needLinePerUnit = posLineCommentsEnabled;
    var prevSnapshot = cart.map(function (x) { return Object.assign({}, x); });
    setCart(function (prev) {
      if (!needLinePerUnit && !isGlass) {
        var exIdx = prev.findIndex(function (x) { return x.id === p.id && !x.isGlassLine; });
        if (exIdx >= 0) {
          if (focusAfterAdd) pendingCartFocusRef.current = { row: exIdx, col: 0 };
          return prev.map(function (x) {
            if (x.id !== p.id) return x;
            return Object.assign({}, x, {
              cartLineId: x.cartLineId || uid(),
              qty: Math.round((x.qty + step) * 10000) / 10000,
            });
          });
        }
      }
      if (focusAfterAdd) pendingCartFocusRef.current = { row: 0, col: isGlass ? 1 : 0 };
      if (isGlass) {
        return [recalcGlassCartLine({
          cartLineId: uid(),
          id: p.id,
          name: p.name,
          barcode: p.barcode || "",
          unit: p.unit || "Sheet",
          saleUnit: "Sq Ft",
          qty: 0,
          price: getGlassSellRatePerSqFt(p),
          glassRatePerSqFt: getGlassSellRatePerSqFt(p),
          customGlassRate: false,
          cost: getPosCostPerSaleUnit(p, p.unit || "Sheet"),
          stock: p.stock,
          description: p.description || "",
          comment: "",
          commentLabel: String(p.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
          requireComment: false,
          itemNote: "",
          customPrice: true,
          isGlassLine: true,
          glassLength: "",
          glassWidth: "",
          glassPieces: 1,
          glassDimensionUnit: "mm",
        }, p)].concat(prev);
      }
      var su = p.unit || "Pcs";
      var lbl = String(p.comment_label || "").trim();
      var linePrice = getPosSellPricePerSaleUnit(p, su);
      var serviceNeedsPrice = isServiceProduct(p) && !(Number(linePrice) > 0);
      return [{
        cartLineId: uid(),
        id: p.id,
        name: p.name,
        barcode: p.barcode || "",
        unit: su,
        saleUnit: su,
        qty: step,
        price: linePrice,
        cost: getPosCostPerSaleUnit(p, su),
        stock: p.stock,
        description: p.description || "",
        comment: "",
        commentLabel: lbl || DEFAULT_PRODUCT_COMMENT_LABEL,
        requireComment: needLinePerUnit,
        itemNote: "",
        customPrice: serviceNeedsPrice,
      }].concat(prev);
    });
    if (isRestaurant) {
      setRestaurantUndo({ cart: prevSnapshot, msg: "Item added" });
      setRestaurantRecentItems(function (prev) {
        var next = [p.id].concat(prev.filter(function (id) { return id !== p.id; }));
        return next.slice(0, 5);
      });
    }
    setSearch("");
    if (!focusAfterAdd) focusPosSearch();
  };
  var duplicateCartItem = function (lineKey) {
    if (!isRestaurant || selectedTableLocked) return;
    var item = cart.find(function (x) { return cartLineKey(x) === lineKey; });
    if (!item) return;
    var rowIdx = cart.findIndex(function (x) { return cartLineKey(x) === lineKey; });
    var step = isDecimalUnit(item.saleUnit || item.unit || "Pcs") ? 0.5 : 1;
    updateQty(lineKey, (Number(item.qty) || 0) + step);
    if (rowIdx >= 0) pendingCartFocusRef.current = { row: rowIdx, col: 0 };
  };
  var clearCurrentCart = function () {
    if (!cart.length) return;
    var prevSnapshot = cart.map(function (x) { return Object.assign({}, x); });
    var doClear = function () {
      setCart([]);
      setFreeCart([]);
      if (isRestaurant) {
        setRestaurantUndo({ cart: prevSnapshot, msg: "Cart cleared" });
      }
      focusPosSearch();
    };
    if (typeof showConfirm === "function") {
      showConfirm("Are you sure you want to clear all items from the cart?", doClear);
      return;
    }
    doClear();
  };
  var setCartItemRestaurantNote = function (lineKey, note) {
    setCart(function (prev) {
      return prev.map(function (x) {
        return cartLineKey(x) === lineKey ? Object.assign({}, x, { restaurantNote: note }) : x;
      });
    });
  };

  /* Simple qty update ? one unit, decimals handle g/ml etc. */
  var updateQty = function (lineKey, qty) {
    var q = Math.round(qty * 10000) / 10000;
    var prevSnapshot = cart.map(function (x) { return Object.assign({}, x); });
    if (q <= 0) {
      setCart(function (prev) { return prev.filter(function (x) { return cartLineKey(x) !== lineKey; }); });
      if (isRestaurant) setRestaurantUndo({ cart: prevSnapshot, msg: "Item removed" });
      return;
    }
    setCart(function (prev) {
      return prev.map(function (x) { return cartLineKey(x) === lineKey ? Object.assign({}, x, { qty: q }) : x; });
    });
  };

  var posIsSavingRef = useRef(false);  /* synchronous re-entry guard (same event-loop tick) */
  var isCheckingOutSt = useState(false);
  var isCheckingOut = isCheckingOutSt[0];
  var setIsCheckingOut = isCheckingOutSt[1];
  var posSetupBlocked = posSetupBlocksCriticalActions();

  /* Single atomic burst so sync/network cannot interleave sale vs inventory vs ledger.
     New sales: prefer setMany with the full sales array; fall back to appendRecord when setMany is unavailable. */
  var flushPosCheckoutToStorage = function (nextState, heldIdToRemove, editingId, primarySaleId) {
    var pairs = [
      ["tc3_products", nextState.products],
      ["tc3_customers", nextState.customers],
      ["tc3_repairs", nextState.repairs],
      ["tc3_quotations", nextState.quotations || []],
      ["tc3_cheques", nextState.cheques || []],
    ];
    if (nextState.codRecords) {
      pairs.push(["tc3_codRecords", nextState.codRecords]);
    }
    var salesArr = nextState.sales;
    if (!editingId && S.appendRecord && primarySaleId && !S.setMany) {
      var saleRow = (nextState.sales || []).find(function (s) { return s.id === primarySaleId; });
      if (saleRow) {
        S.appendRecord("tc3_sales", saleRow, { prepend: true });
        salesArr = null;
      }
    }
    if (salesArr) pairs.unshift(["tc3_sales", salesArr]);
    if (heldIdToRemove) {
      var cleanHeld = (S.get("tc3_held_invoices", []) || []).filter(function (x) { return x.id !== heldIdToRemove; });
      pairs.push(["tc3_held_invoices", cleanHeld]);
    }
    if (S.setMany) {
      var smRes = S.setMany(pairs);
      if (smRes && smRes.ok === false) {
        try { showAlert(smRes.message || "Could not save sale — please try again."); } catch (_eSm) {}
        return false;
      }
    } else {
      pairs.forEach(function (p) { S.set(p[0], p[1]); });
    }
    try {
      var pushPairs = [
        ["tc3_products", nextState.products],
        ["tc3_sales", nextState.sales],
        ["tc3_customers", nextState.customers],
        ["tc3_cheques", nextState.cheques || []],
        ["tc3_quotations", nextState.quotations || []],
        ["tc3_repairs", nextState.repairs],
      ];
      if (nextState.codRecords) pushPairs.push(["tc3_codRecords", nextState.codRecords]);
      pushKeysNow(pushPairs);
    } catch (_pushNow) { /* ignore */ }
    return true;
  };

  var saveAndFinishRef = useRef(function () {});
  saveAndFinishRef.current = function (withPrint, mode, onSaved) {
    if (!cart.length) return;
    if (posIsSavingRef.current || isCheckingOut) return;
    var glassIncomplete = cart.find(function (it) {
      if (!it.isGlassLine) return false;
      var pr = state.products.find(function (p) { return p.id === it.id; });
      var row = pr ? recalcGlassCartLine(it, pr) : it;
      return !(Number(row.glassWidth) > 0) || !(Number(row.glassLength) > 0) || !(Number(row.glassTotalSqFt) > 0);
    });
    if (glassIncomplete) {
      showAlert("Enter width and height for all glass cut sizes.");
      return;
    }
    if (!editingSaleId && posSetupBlocksCriticalActions()) {
      showAlert(getCoreStartupIdentityAlertMessage(validateCoreStartupIdentity(S.get("tc3_settings")).missing));
      return;
    }
    posIsSavingRef.current = true;
    setIsCheckingOut(true);
    var runPosCheckout = function (productsSnap) {
    try {
    productsSnap = Array.isArray(productsSnap) && productsSnap.length ? productsSnap : state.products;
    /* Trial guard: block new sales if trial limit reached (editing existing sales is allowed).
       Pass cart.length > 0 as isActiveCheckout so a mid-sale server dropout gets cart grace. */
    if (!editingSaleId && !tcTrialGuard(state.sales, 'sales', cart.length > 0)) return;
    if (codSalesTrackEnabled && shouldPersistCodRecord(codTrack)) {
      var codCheckoutErr = validateCodCheckout(codTrack, custMode, custId, newCust, state.customers);
      if (codCheckoutErr) {
        showAlert(codCheckoutErr);
        return;
      }
    }
    /* Block walk-in customers from making unpaid or partial invoices.
       Cheque is not "paid" until cleared — walk-in cheque must cover the full total with real cheque rows. */
    var isWalkIn = custMode === "walkin" || (custMode === "existing" && !custId) || (custMode === "new" && !newCust.name);
    var walkInChequePayment = posCashMethod === "Cheque" && !(posSplitRows && posSplitRows.length > 0);
    if (isWalkIn) {
      if (walkInChequePayment) {
        var walkInChqSum = (posChequeList || []).reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
        if (!(posChequeList && posChequeList.length > 0) || walkInChqSum + 0.009 < total) {
          showAlert("Walk-in cheque payment requires cheque(s) totaling the full invoice amount (" + getCurrencySymbol() + " " + fmtNum(total) + ").\n\nAdd cheques first, or pay with Cash/Bank.");
          return;
        }
      } else {
        var splitTotal = (posSplitRows && posSplitRows.length > 0)
          ? posSplitRows.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0)
          : 0;
        var isFullyPaid = (posSplitRows && posSplitRows.length > 0)
          ? splitTotal >= total
          : payMode === "full";
        if (!isFullyPaid) {
          showAlert("Walk-in customers must pay in full.\n\nTo make a partial or unpaid invoice, please select or create a customer first.");
          return;
        }
      }
    }
    var stockErr = null;
    var mergeWarn = null;
    var seenStockPid = {};
    cart.concat(freeCart).forEach(function (item) {
      if (stockErr || mergeWarn) return;
      if (seenStockPid[item.id]) return;
      seenStockPid[item.id] = 1;
      var prod = productsSnap.find(function (p) { return p.id === item.id; });
      if (!prod) return;
      if (prod.stockMergeWarning === "concurrent_oversell") {
        mergeWarn = "\"" + item.name + "\" was oversold on another terminal — stock was clamped. Verify quantity before checkout.";
        return;
      }
      if (isServiceProduct(prod)) return;
      if (!isNetworkClientPos) {
        var totalReq = getReservedBaseQtyForProduct(prod);
        if (totalReq > (prod.stock || 0)) {
          var availMsg = getBulkDisplayParts(prod) ? fmtStockDual(prod) : fmtStock(prod.stock || 0, prod.unit || "Pcs");
          stockErr = "Not enough stock for \"" + item.name + "\". Available: " + availMsg + ", requested (all lines): " + fmtStock(totalReq, prod.unit || "Pcs") + ".";
        }
      }
    });
    if (mergeWarn) { showAlert(mergeWarn); return; }
    if (isNetworkClientPos) {
      var stockAssert = assertCartStockAvailable(cart.concat(freeCart), productsSnap, getReservedBaseQtyForProduct, isServiceProduct);
      if (!stockAssert.ok) { showAlert(stockAssert.message); return; }
    } else if (stockErr) { showAlert(stockErr); return; }
    var missingServicePrice = cart.find(function (item) {
      var pr = productsSnap.find(function (p) { return p.id === item.id; });
      return isServiceProduct(pr) && !(Number(item.price) > 0);
    });
    if (missingServicePrice) {
      showAlert("Enter a selling price for \"" + missingServicePrice.name + "\" before checkout.");
      return;
    }
    /* Block selling below cost */
    var belowCostItem = cart.find(function (item) {
      var pr = productsSnap.find(function (p) { return p.id === item.id; });
      var lc = item.isGlassLine && pr
        ? getGlassCostPerSqFt(pr)
        : (pr ? getPosCostPerSaleUnit(pr, item.saleUnit || item.unit || "Pcs") : (item.cost || 0));
      var sell = item.isGlassLine
        ? (item.customGlassRate ? (item.glassRatePerSqFt != null ? item.glassRatePerSqFt : item.price) : getGlassSellRatePerSqFt(pr))
        : item.price;
      return (sell || 0) < lc;
    });
    if (belowCostItem) {
      var pr2 = productsSnap.find(function (p) { return p.id === belowCostItem.id; });
      var minCost = pr2 ? getPosCostPerSaleUnit(pr2, belowCostItem.saleUnit || belowCostItem.unit || "Pcs") : (belowCostItem.cost || 0);
      showAlert("\u274C Cannot sell below cost price.\n\n\"" + belowCostItem.name + "\" is priced at " + getCurrencySymbol() + " " + fmtNum(belowCostItem.price) + " but cost is " + getCurrencySymbol() + " " + fmtNum(minCost) + " per " + (belowCostItem.saleUnit || belowCostItem.unit || "Pcs") + ".\n\nPlease increase the price to at least " + getCurrencySymbol() + " " + fmtNum(minCost) + ".");
      return;
    }
    var finalInvNo = ensureUniqueDocumentNumber(invoiceNo, "INV", state, { excludeSaleId: editingSaleId });
    var custName = custMode === "existing" ? (function () { var c = state.customers.find(function (c) { return c.id === custId; }); return c ? c.name : "Walk-in"; }()) : (custMode === "new" ? newCust.name || "New Customer" : "Walk-in");
    var custPhone = custMode === "existing" ? (function () { var c = state.customers.find(function (c) { return c.id === custId; }); return c ? (c.phone || "") : ""; })() : (custMode === "new" ? newCust.phone || "" : "");
    /* Cheque: paidNum=0 until cheques clear; cheque records created after save */
    var isChequePayment = posCashMethod === "Cheque" && !(posSplitRows && posSplitRows.length > 0);
    /* For split: effective paid = sum of non-cheque splits */
    var effectivePaid;
    if (posSplitRows && posSplitRows.length > 0) {
      effectivePaid = posSplitRows.reduce(function (a, r) {
        return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a;
      }, 0);
    } else {
      effectivePaid = isChequePayment ? 0 : paidNum;
    }
    var effectiveBalance = total - effectivePaid;
    var effectiveStatus = effectivePaid >= total ? "Paid" : effectivePaid > 0 ? "Partial" : "Unpaid";
    if (posSplitRows && posSplitRows.length > 0) {
      var splitCents = Math.round(splitAllTotal * 100);
      var totalCents = Math.round(total * 100);
      if (splitCents > totalCents + 1) {
        showAlert("Split payment total exceeds invoice grand total.");
        return;
      }
    }
    if (isChequePayment) {
      var posChqSum = (posChequeList || []).reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
      if (!(posChequeList && posChequeList.length > 0)) {
        showAlert("Add at least one cheque before completing a cheque payment.");
        return;
      }
      if (posChqSum > total + 0.009) {
        showAlert("Cheque total (" + getCurrencySymbol() + " " + fmtNum(posChqSum) + ") exceeds invoice total (" + getCurrencySymbol() + " " + fmtNum(total) + ").");
        return;
      }
    }
    var saleAmtErr = validateTxnAmounts("Sale invoice", total, effectivePaid, effectiveBalance);
    if (saleAmtErr) { showAlert("" + saleAmtErr); return; }
    var initPh = [];
    if (posSplitRows && posSplitRows.length > 0) {
      /* Split payment mode ? build ph from split rows */
      posSplitRows.forEach(function (row) {
        var amt = parseFloat(row.amount) || 0;
        if (amt <= 0) return;
        if (row.method === "Cheque") {
          /* Cheque ph entries added after save with cheque records */
        } else {
          var cm = (row.method === "Bank" || row.method === "Online" || row.method === "Card") ? "Bank" : "Cash";
          initPh.push({ id: uid(), date: today(), amount: amt, cashMethod: cm, note: row.method + (row.note ? ": " + row.note : "") });
        }
      });
    } else if (!isChequePayment && paidNum > 0) {
      initPh = [{ id: uid(), date: today(), amount: paidNum, note: "Initial payment", cashMethod: normalizeCashMethodForStorage(posCashMethod) }];
    }
    var chronoCart = cartChronological();
    var saleItems = chronoCart.map(mapCartLineToSaleItem).concat(freeCart.map(mapCartLineToSaleItem));
    if (state.settings && state.settings.taxEnabled && posTotalTax > 0 && subTotal > 0.005) {
      var lineAmts = chronoCart.map(function (it) { return posLineAmount(it); });
      var subSum = lineAmts.reduce(function (a, b) { return a + b; }, 0);
      var remTax = posTotalTax;
      var paidLineCount = cart.length;
      saleItems = saleItems.map(function (it, sidx) {
        if (sidx >= paidLineCount) return it;
        var lt;
        if (sidx === paidLineCount - 1) {
          lt = Number(remTax.toFixed(2));
        } else if (subSum > 0.005) {
          lt = Number((posTotalTax * (lineAmts[sidx] / subSum)).toFixed(2));
          remTax = Number((remTax - lt).toFixed(2));
        } else {
          lt = 0;
        }
        return Object.assign({}, it, { lineTax: lt });
      });
    }
    var saleTs = new Date().toISOString();
    var txnDate = recordDate || today();
    var saleObj = { id: editingSaleId || uid(), invoiceNo: finalInvNo, date: txnDate, isoDateTime: saleTs, customerId: custId || "", customerName: custName, customerPhone: custPhone, items: saleItems, subTotal: subTotal, discount: discAmt, total: total, paid: effectivePaid, balance: effectiveBalance, payStatus: effectiveStatus, includeWarranty: includeWarranty, paymentHistory: initPh, cashMethod: normalizeCashMethodForStorage(posCashMethod), fromRepairId: fromRepairId || undefined, fromRepairDeviceIndexes: (fromRepairDeviceIndexes || []).slice(), fromQuotationId: fromQuotationId || undefined, createdAt: saleTs, updatedAt: saleTs };
    if (editingSaleId) {
      var _origMeta = state.sales.find(function (s) { return s.id === editingSaleId; });
      if (_origMeta) {
        if (_origMeta.createdAt) saleObj.createdAt = _origMeta.createdAt;
        saleObj.paymentHistory = Array.isArray(_origMeta.paymentHistory) ? _origMeta.paymentHistory.slice() : [];
        saleObj.paid = Number(_origMeta.paid) || 0;
        saleObj.balance = Math.max(0, Number(((saleObj.total || 0) - saleObj.paid).toFixed(2)));
        saleObj.payStatus = saleObj.balance <= 0.005 ? "Paid" : (saleObj.paid > 0.005 ? "Partial" : "Unpaid");
        if (_origMeta.cashMethod) saleObj.cashMethod = _origMeta.cashMethod;
      }
      if (saleNotes) saleObj.saleNote = String(saleNotes).trim();
      else if (_origMeta && _origMeta.saleNote) saleObj.saleNote = _origMeta.saleNote;
    } else if (saleNotes) {
      saleObj.saleNote = String(saleNotes).trim();
    }
    if (isNetworkClientPos) {
      var li = props.licenseInfo || (typeof window !== "undefined" ? window._tcLicInfo : null) || {};
      var oid = li.terminalDeviceId || li.deviceId || "";
      if (oid) {
        saleObj.originDeviceId = oid;
        var otl = String(li.clientLabel || "").trim();
        if (otl) saleObj.originTerminalLabel = otl;
      }
    }
    if (state.settings && state.settings.taxEnabled && (posTotalTax > 0 || (posTaxLines && posTaxLines.length > 0))) {
      saleObj.taxMode = posTaxCalc.taxMode || "exclusive";
      saleObj.taxCompoundMode = posTaxCalc.taxCompoundMode || state.settings.taxCompoundMode || "parallel";
      saleObj.totalTax = posTotalTax;
      saleObj.taxApplyBase = taxApplyBase;
      saleObj.selectedTaxes = (posTaxLines || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; });
    } else if (state.settings && state.settings.taxEnabled) {
      saleObj.taxMode = (state.settings.taxMode === "inclusive") ? "inclusive" : "exclusive";
      saleObj.totalTax = 0;
      saleObj.taxApplyBase = taxApplyBase;
      saleObj.selectedTaxes = [];
    }
    /* When editing, first restore stock deducted by the original sale, then deduct the updated cart */
    var _baseProds = productsSnap;
    if (editingSaleId) {
      var _origSale = state.sales.find(function (s) { return s.id === editingSaleId; });
      if (_origSale) {
        _baseProds = productsSnap.map(function (p) {
          var back = (_origSale.items || []).filter(function (x) { return x.id === p.id; }).reduce(function (a, oi) { return a + (oi.qty || 0); }, 0);
          if (!back) return p;
          var restored = (p.stock || 0) + back;
          var patched = isRepair3pInternalProduct(p)
            ? markRepair3pSoldAfterStockDeduct(p, restored)
            : Object.assign({}, p, { stock: restored });
          return stampProductStock(patched, saleTs, p);
        });
      }
    }
    var np = _baseProds.map(function (p) {
      var lines = cart.filter(function (x) { return x.id === p.id; }).concat(freeCart.filter(function (x) { return x.id === p.id; }));
      if (!lines.length) return p;
      if (isServiceProduct(p)) return p;
      var deductQty = lines.reduce(function (acc, ci) {
        if (ci && ci.isGlassLine) return acc + (Number(ci.qty) || 0);
        return acc + toProductBaseQty(ci.qty || 0, ci.saleUnit || ci.unit || "Pcs", p);
      }, 0);
      var nextStock = (p.stock || 0) - deductQty;
      var patched = markRepair3pSoldAfterStockDeduct(p, nextStock);
      if (patched !== p) {
        return stampProductStock(patched, saleTs, p);
      }
      return stampProductStock(Object.assign({}, p, { stock: nextStock }), saleTs, p);
    });
    var nc = state.customers.slice();
    if (editingSaleId) {
      var _origSaleCr = state.sales.find(function (s) { return s.id === editingSaleId; });
      if (_origSaleCr && custMode === "existing" && custId) {
        var oldOut = Math.max(0, (_origSaleCr.total || 0) - (_origSaleCr.paid || 0));
        nc = nc.map(function (c) {
          if (c.id !== custId) return c;
          return stampCustomerBalance(Object.assign({}, c, {
            credit: Math.max(0, (c.credit || 0) - oldOut),
            totalSpent: Math.max(0, (c.totalSpent || 0) - (_origSaleCr.total || 0)),
          }), saleTs, c);
        });
      }
    }
    /* FIX2: use effectiveBalance (not balanceDue) ? for cheque payments effectivePaid=0 so full balance should be credited */
    if (custMode === "new" && newCust.name) { nc.push(stampCustomerBalance({ id: uid(), name: newCust.name, phone: newCust.phone || "", address: newCust.address || "", credit: effectiveBalance, totalSpent: total }, saleTs, { credit: 0, totalSpent: 0, updatedAt: "" })); }
    else if (custMode === "existing" && custId) { nc = nc.map(function (c) { return c.id === custId ? stampCustomerBalance(Object.assign({}, c, { credit: (c.credit || 0) + effectiveBalance, totalSpent: (c.totalSpent || 0) + total }), saleTs, c) : c; }); }
    /* Auto-update repair status to Delivered when this sale originated from a repair ticket */
    var nr = state.repairs;
    if (fromRepairId) {
      var deriveRepairStatus = function (devices) {
        var list = Array.isArray(devices) && devices.length ? devices : [{ status: "Accepted" }];
        var counts = list.reduce(function (acc, d) {
          var k = (d && d.status) || "Accepted";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});
        var total = list.length;
        if ((counts.Delivered || 0) === total) return "Delivered";
        if ((counts.Returned || 0) === total) return "Returned";
        if ((counts.Accepted || 0) > 0) return "Accepted";
        if ((counts.Ready || 0) > 0) return "Ready";
        if ((counts.Delivered || 0) > 0 || (counts.Returned || 0) > 0) return "Delivered";
        return "Accepted";
      };
      nr = state.repairs.map(function (rep) {
        if (rep.id !== fromRepairId) return rep;
        var devices = Array.isArray(rep.devices) && rep.devices.length ? rep.devices.slice() : [{
          deviceType: rep.deviceType || "Laptop",
          brand: rep.brand || "",
          modelNo: rep.modelNo || "",
          problem: rep.problem || "",
          status: rep.status || "Accepted"
        }];
        (fromRepairDeviceIndexes || []).forEach(function (idx) {
          if (idx < 0 || idx >= devices.length) return;
          var prev = devices[idx] || {};
          var deliveredDay = (function () {
            var n = new Date();
            var y = n.getFullYear();
            var m = String(n.getMonth() + 1);
            var day = String(n.getDate());
            if (m.length < 2) m = "0" + m;
            if (day.length < 2) day = "0" + day;
            return y + "-" + m + "-" + day;
          })();
          devices[idx] = Object.assign({}, prev, {
            status: "Delivered",
            timeline: Object.assign({}, prev.timeline || {}, { deliveredAt: deliveredDay })
          });
        });
        var nextStatus = deriveRepairStatus(devices);
        var first = devices[0] || {};
        return Object.assign({}, rep, {
          devices: devices,
          deviceType: first.deviceType || rep.deviceType,
          brand: first.brand || rep.brand,
          modelNo: first.modelNo || rep.modelNo,
          problem: first.problem || rep.problem,
          status: nextStatus,
          dateOut: nextStatus === "Delivered" ? today() : (rep.dateOut || "")
        });
      });
    }
    /* Mark quotation as Converted when this sale was created from a quotation */
    var nq = state.quotations || [];
    if (fromQuotationId) {
      nq = (state.quotations || []).map(function (q) {
        return q.id === fromQuotationId ? Object.assign({}, q, { status: "Converted", convertedInvoiceId: saleObj.invoiceNo, convertedAt: today() }) : q;
      });
    }
    var newState = Object.assign({}, state, {
      products: np, customers: nc,
      sales: editingSaleId
        ? state.sales.map(function (s) { return s.id === editingSaleId ? saleObj : s; })
        : [saleObj].concat(state.sales),
      repairs: nr, quotations: nq,
    });

    var codRecords = state.codRecords || S.get("tc3_codRecords", []) || [];
    /* COD track: copy sell/cost/profit into COD Database only.
       LOCKED SEPARATE — do not journal COD records/withdrawals into main GL/cash/P&L. */
    if (codSalesTrackEnabled && shouldPersistCodRecord(codTrack) && !codRecords.find(function (r) { return r.saleId === saleObj.id; })) {
      if (!tcTrialGuard(codRecords, "codRecords")) return;
    }
    if (codSalesTrackEnabled) {
      if (shouldPersistCodRecord(codTrack)) {
        var existingCod = codRecords.find(function (r) { return r.saleId === saleObj.id; });
        var codRec = buildCodRecordFromSale({
          form: codTrack,
          sale: saleObj,
          cart: chronoCart,
          freeCart: freeCart,
          products: np,
          getCostPerUnit: getPosCostPerSaleUnit,
          uid: uid,
          existing: existingCod || null,
        });
        var nextCod = codRecords.slice();
        var cix = nextCod.findIndex(function (r) { return r.saleId === saleObj.id; });
        if (cix >= 0) nextCod[cix] = codRec;
        else nextCod.unshift(codRec);
        codRecords = nextCod;
      } else if (editingSaleId) {
        var filteredCod = codRecords.filter(function (r) { return r.saleId !== saleObj.id; });
        if (filteredCod.length !== codRecords.length) {
          codRecords = filteredCod;
        }
      }
    }
    newState = Object.assign({}, newState, { codRecords: codRecords });
    /* If split mode has cheque rows, create cheque records */
    if (posSplitRows && posSplitRows.length > 0) {
      var splitChequeRows = posSplitRows.filter(function (r) { return r.method === "Cheque" && parseFloat(r.amount) > 0; });
      if (splitChequeRows.length > 0) {
        var splitChqs = splitChequeRows.map(function (r) {
          var chTs = saleTs;
          return stampTransactionIsoDateTime({ id: uid(), type: "incoming", status: "Pending", chequeNo: (r.chequeNo || "").trim(), bankName: (r.chequeBankName || "").trim(), amount: parseFloat(r.amount), dueDate: r.chequeDueDate || today(), issuedDate: today(), customerId: custId || "", customerName: custName, saleId: saleObj.id, invoiceNo: saleObj.invoiceNo, note: r.note || "", createdAt: chTs, updatedAt: chTs }, chTs);
        });
        var splitChqPh = splitChqs.map(function (ch) { return { id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending - due " + ch.dueDate + ")", chequeId: ch.id }; });
        var saleWithSplitChq = Object.assign({}, saleObj, { paymentHistory: initPh.concat(splitChqPh) });
        var nchqSplit = (newState.cheques || []).concat(splitChqs);
        var nsalesSplit = newState.sales.map(function (s) { return s.id === saleObj.id ? saleWithSplitChq : s; });
        newState = Object.assign({}, newState, { cheques: nchqSplit, sales: nsalesSplit });
      }
    }

    /* If paid by cheque, create cheque records and attach to sale paymentHistory */
    if (isChequePayment && posChequeList.length > 0) {
      var newCheques = posChequeList.filter(function (c) { return c.no.trim() && parseFloat(c.amount) > 0; }).map(function (c) {
        var chTs = saleTs;
        return stampTransactionIsoDateTime({ id: uid(), type: "incoming", status: "Pending", chequeNo: c.no.trim(), bankName: (c.bank || "").trim(), amount: parseFloat(c.amount), dueDate: c.due || today(), issuedDate: today(), customerId: custId || "", customerName: custName, saleId: saleObj.id, invoiceNo: saleObj.invoiceNo, note: "", createdAt: chTs, updatedAt: chTs }, chTs);
      });
      var chqPh = newCheques.map(function (ch) { return { id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending - due " + ch.dueDate + ")", chequeId: ch.id }; });
      var saleWithCheques = Object.assign({}, saleObj, { paymentHistory: chqPh });
      var nchq = (newState.cheques || []).concat(newCheques);
      var nsalesCheque = newState.sales.map(function (s) { return s.id === saleObj.id ? saleWithCheques : s; });
      newState = Object.assign({}, newState, { cheques: nchq, sales: nsalesCheque });
      setPosChequeList([]); setPosChqForm({ no: "", bank: "", amount: "", due: today() });
    }

    if (flushPosCheckoutToStorage(newState, activeHeldId, editingSaleId, saleObj.id) === false) {
      posIsSavingRef.current = false;
      setIsCheckingOut(false);
      return;
    }
    if (!editingSaleId) {
      newState = Object.assign({}, newState, { sales: S.get("tc3_sales", []) });
    }
    if (activeHeldId) {
      setHeldInvoices(S.get("tc3_held_invoices", []) || []);
      setActiveHeldId(null);
    }
    addAudit(editingSaleId ? "Edited Sale Invoice" : "Created Sale Invoice", saleObj.invoiceNo || saleObj.id.slice(0, 8));
    setState(newState);
    if (isRestaurant && restaurantOrderType === "dine-in" && selectedTableId) {
      var billedCartItems = cart.map(function (it) {
        return {
          id: it.id,
          name: it.name,
          qty: Number(it.qty) || 0,
          price: Number(it.price) || 0,
          saleUnit: it.saleUnit || it.unit || "Pcs",
          note: it.restaurantNote || "",
        };
      }).filter(function (it) { return it.qty > 0; });
      var restaurantSaleLinked = false;
      setRestaurantOrders(function (prev) {
        var targetOrder = prev.find(function (o) {
          return o && o.tableId === selectedTableId && !isOrderFullyBilled(o);
        });
        if (!targetOrder) return prev;
        restaurantSaleLinked = true;
        return prev.map(function (o) {
          if (!targetOrder || o.id !== targetOrder.id) return o;
          var nextSplitBills = (o.splitBills || []).concat([{
            items: billedCartItems.map(function (x) { return Object.assign({}, x); }),
            invoicedSaleId: saleObj.id,
            mode: "full",
          }]);
          return Object.assign({}, o, {
            status: "billed",
            invoicedSaleId: saleObj.id,
            splitBills: nextSplitBills,
            billedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
      });
      if (restaurantSaleLinked) {
        setRestaurantTables(function (prev) {
          return prev.map(function (t) {
            if (t.id !== selectedTableId) return t;
            return Object.assign({}, t, { status: "free" });
          });
        });
      }
    }
    if (editingSaleId) setEditingSaleId("");
    try {
      sessionStorage.removeItem("tc3_dirty"); sessionStorage.removeItem("tc3_held_pos"); sessionStorage.removeItem("tc3_invoice_held"); window._techon_pos_snapshot = null;
      S.set("tc3_pos_cart_draft", null);
    } catch (e) { }

    var finalSaleForPrint = (newState.sales || []).find(function (s) { return s.id === saleObj.id; }) || saleObj;
    if (withPrint) {
      setPendingPrint({ sale: finalSaleForPrint, mode: mode || "thermal", settings: Object.assign({}, state.settings), warranty: includeWarranty, invoiceLang: "en" });
      setCart([]); setFreeCart([]); setCodTrack(emptyCodTrackForm()); setCustMode("walkin"); setCustSearch(""); setCustId(""); setNewCust({ name: "", phone: "", address: "" }); setDiscount(""); setPayMode("full"); setPaidAmt(""); setPosSplitRows([]); setPosSplitModal(false); setInvoiceNo(genInvNo()); setFromRepairId(""); setFromRepairDeviceIndexes([]); setFreeSearch(""); setRecordDate(today());
      try { sessionStorage.removeItem("tc3_dirty"); } catch (e2) { }
      focusPosSearch();
    } else {
      resetForm();
    }
    if (typeof onSaved === "function") onSaved(saleObj, newState);
    } finally {
      posIsSavingRef.current = false;
      setIsCheckingOut(false);
    }
    };

    loadFreshProductsForStock(S)
      .then(function (fresh) {
        if (fresh && fresh.length) {
          try { setState(function (st) { return Object.assign({}, st, { products: fresh }); }); } catch (_e) { /* ignore */ }
        }
        runPosCheckout(fresh && fresh.length ? fresh : state.products);
      })
      .catch(function () {
        runPosCheckout(state.products);
      });
  };

  var saveAndFinish = useCallback(function (withPrint, mode, onSaved) {
    return saveAndFinishRef.current(withPrint, mode, onSaved);
  }, []);

  /* Save invoice then share via WhatsApp using selected format from settings. */
  var saveAndWhatsApp = function () {
    if (!cart.length) return;
    if (posIsSavingRef.current || isCheckingOut) return;
    if (posSetupBlocksCriticalActions()) return;
    setWaSharePickerKind("sale");
    setWaSharePicker(true);
  };
  var saveAndWhatsAppWithMode = function (mode) {
    if (posIsSavingRef.current || isCheckingOut) return;
    if (posSetupBlocksCriticalActions()) {
      setWaSharePicker(false);
      showAlert(getCoreStartupIdentityAlertMessage(validateCoreStartupIdentity(S.get("tc3_settings")).missing));
      return;
    }
    waPendingRef.current = true; /* signal useEffect to share instead of print */
    setWaSharePicker(false);
    saveAndFinish(true, mode);
  };

  var openQuotationWhatsApp = function () {
    if (!cart.length || isSavingQuotation) return;
    if (!canEditInvoices) return;
    setWaSharePickerKind("quotation");
    setWaSharePicker(true);
  };
  var saveQuotationWhatsAppWithMode = function (mode) {
    if (isSavingQuotation) return;
    setWaSharePicker(false);
    waPendingRef.current = true;
    saveQuotation(true, mode, true);
  };

  var openPosPrintPicker = function () {
    if (!cart.length) return;
    if (posIsSavingRef.current || isCheckingOut) return;
    if (posSetupBlocksCriticalActions()) return;
    setPosPrintPickerKind("sale");
    setPosPrintPickerIntent("save");
    setPosPrintPicker(true);
  };
  var openPosPreviewPicker = function () {
    if (!cart.length) return;
    setPosPrintPickerKind("sale");
    setPosPrintPickerIntent("preview");
    setPosPrintPicker(true);
  };
  var openQuotationPrintPicker = function () {
    if (!cart.length || isSavingQuotation) return;
    if (!canEditInvoices) return;
    setPosPrintPickerKind("quotation");
    setPosPrintPickerIntent("save");
    setPosPrintPicker(true);
  };
  var openQuotationPreviewPicker = function () {
    if (!cart.length) return;
    setPosPrintPickerKind("quotation");
    setPosPrintPickerIntent("preview");
    setPosPrintPicker(true);
  };
  var buildPosPreviewSale = function () {
    var cust = resolvePosCustomer();
    var chronoCart = cartChronological();
    var saleItems = chronoCart.map(mapCartLineToSaleItem).concat(freeCart.map(mapCartLineToSaleItem));
    if (state.settings && state.settings.taxEnabled && posTotalTax > 0 && subTotal > 0.005) {
      var lineAmts = chronoCart.map(function (it) { return posLineAmount(it); });
      var subSum = lineAmts.reduce(function (a, b) { return a + b; }, 0);
      var remTax = posTotalTax;
      var paidLineCount = cart.length;
      saleItems = saleItems.map(function (it, sidx) {
        if (sidx >= paidLineCount) return it;
        var lt;
        if (sidx === paidLineCount - 1) lt = Number(remTax.toFixed(2));
        else if (subSum > 0.005) {
          lt = Number((posTotalTax * (lineAmts[sidx] / subSum)).toFixed(2));
          remTax = Number((remTax - lt).toFixed(2));
        } else lt = 0;
        return Object.assign({}, it, { lineTax: lt });
      });
    }
    var previewPaid = (posSplitRows && posSplitRows.length > 0)
      ? posSplitRows.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0)
      : (posCashMethod === "Cheque" ? 0 : paidNum);
    var previewBal = Math.max(0, total - previewPaid);
    var draft = {
      id: "preview-" + Date.now(),
      invoiceNo: invoiceNo || "PREVIEW",
      date: recordDate || today(),
      isoDateTime: new Date().toISOString(),
      customerId: cust.custId || "",
      customerName: cust.custName,
      customerPhone: cust.custPhone,
      items: saleItems,
      subTotal: subTotal,
      discount: discAmt,
      total: total,
      paid: previewPaid,
      balance: previewBal,
      payStatus: previewPaid >= total ? "Paid" : previewPaid > 0 ? "Partial" : "Unpaid",
      includeWarranty: includeWarranty,
      paymentHistory: [],
      cashMethod: posCashMethod,
      notes: saleNotes || "",
      paymentTerms: paymentTerms || "",
    };
    if (state.settings && state.settings.taxEnabled) {
      draft.taxMode = posTaxCalc.taxMode || "exclusive";
      draft.totalTax = posTotalTax;
      draft.taxApplyBase = taxApplyBase;
      draft.selectedTaxes = (posTaxLines || []).map(function (t) { return { name: t.name, rate: t.rate, amount: t.amount }; });
    }
    return draft;
  };
  var buildPosPreviewQuotation = function () {
    var cust = resolvePosCustomer();
    var items = cartChronological().map(mapCartLineToQuotationItem);
    var taxExtra = buildQuotationTaxExtras(
      state.settings,
      subTotal,
      discAmt,
      null,
      posTaxCalc,
      total,
      posTaxLines,
      posTotalTax
    );
    var q = Object.assign({
      id: "preview-qt-" + Date.now(),
      quotationNo: quotationNo || "PREVIEW",
      date: recordDate || today(),
      customerId: cust.custId || "",
      customer: cust.custName,
      customerName: cust.custName,
      customerPhone: cust.custPhone,
      items: items,
      notes: quotationNotes || "",
      paymentTerms: paymentTerms || "",
      status: "Draft",
    }, taxExtra);
    return quotationToPrintInv(q);
  };
  var previewWithMode = function (mode) {
    setPosPrintPicker(false);
    var sale = posPrintPickerKind === "quotation" ? buildPosPreviewQuotation() : buildPosPreviewSale();
    setPendingPrint({
      sale: sale,
      mode: mode || "a4",
      settings: Object.assign({}, state.settings),
      warranty: includeWarranty,
      invoiceLang: "en",
      kind: posPrintPickerKind === "quotation" ? "quotation" : "invoice",
      previewOnly: true,
    });
  };
  var saveAndPrintWithMode = function (mode) {
    if (posPrintPickerIntent === "preview") {
      previewWithMode(mode);
      return;
    }
    if (posPrintPickerKind === "quotation") {
      if (isSavingQuotation) return;
      setPosPrintPicker(false);
      saveQuotation(true, mode, false);
      return;
    }
    if (posIsSavingRef.current || isCheckingOut) return;
    if (posSetupBlocksCriticalActions()) {
      setPosPrintPicker(false);
      showAlert(getCoreStartupIdentityAlertMessage(validateCoreStartupIdentity(S.get("tc3_settings")).missing));
      return;
    }
    setPosPrintPicker(false);
    saveAndFinish(true, mode);
  };

  var resolvePosCustomer = function () {
    var custName = custMode === "existing"
      ? (function () { var c = state.customers.find(function (c) { return c.id === custId; }); return c ? c.name : "Walk-in"; }())
      : (custMode === "new" ? newCust.name || "New Customer" : "Walk-in");
    var custPhone = custMode === "existing"
      ? (function () { var c = state.customers.find(function (c) { return c.id === custId; }); return c ? (c.phone || "") : ""; })()
      : (custMode === "new" ? newCust.phone || "" : "");
    return { custId: custId || "", custName: custName, custPhone: custPhone };
  };

  var resetQuotationForm = function () {
    setCart([]);
    setFreeCart([]);
    setDiscount("");
    setPaidAmt("");
    setPayMode("full");
    setPosSplitRows([]);
    setPosSplitModal(false);
    setIncludeWarranty(false);
    setFromQuotationId("");
    setFromRepairId("");
    setFromRepairDeviceIndexes([]);
    setActiveHeldId(null);
    setEditingQuotationId("");
    setQuotationNotes("");
    setQuotationNo(genInvNo("QT"));
    setCustMode("walkin");
    setCustSearch("");
    setCustId("");
    setNewCust({ name: "", phone: "", address: "" });
    setRecordDate(today());
    try {
      sessionStorage.removeItem("tc3_dirty");
      sessionStorage.removeItem("tc3_held_pos");
      sessionStorage.removeItem("tc3_invoice_held");
      window._techon_pos_snapshot = null;
    } catch (e) { /* ignore */ }
    focusPosSearch();
  };

  var switchPosPageTab = function (tab) {
    if (tab === posPageTab) return;
    var applySwitch = function () {
      setCart([]);
      setFreeCart([]);
      setDiscount("");
      setEditingSaleId("");
      setEditingQuotationId("");
      setRecordDate(today());
      if (tab === "quotation") {
        setQuotationNo(genInvNo("QT"));
        setQuotationNotes("");
      } else {
        setInvoiceNo(genInvNo());
      }
      setPosPageTab(tab);
      focusPosSearch();
    };
    if (cart.length || freeCart.length) {
      showConfirm("Switching will clear the current cart. Continue?", applySwitch);
    } else {
      applySwitch();
    }
  };
  switchPosPageTabRef.current = switchPosPageTab;

  var saveQuotation = function (withPrint, printMode, waShare) {
    if (!canEditInvoices) {
      showPermissionDenied(editingQuotationId ? "edit quotations" : "create quotations");
      return;
    }
    if (!cart.length) {
      showAlert("Add at least one product to the quotation.");
      return;
    }
    var glassIncompleteQ = cart.find(function (it) {
      if (!it.isGlassLine) return false;
      var pr = state.products.find(function (p) { return p.id === it.id; });
      var row = pr ? recalcGlassCartLine(it, pr) : it;
      return !(Number(row.glassWidth) > 0) || !(Number(row.glassLength) > 0) || !(Number(row.glassTotalSqFt) > 0);
    });
    if (glassIncompleteQ) {
      showAlert("Enter width and height for all glass cut sizes.");
      return;
    }
    if (isSavingQuotation) return;
    if (!editingQuotationId && !tcTrialGuard(state.quotations || [], "quotations")) return;
    setIsSavingQuotation(true);
    var wasEditingQuotation = !!editingQuotationId;
    try {
      var finalQtNo = ensureUniqueDocumentNumber(quotationNo, "QT", state, wasEditingQuotation ? { excludeQuotationId: editingQuotationId } : undefined);
      var cust = resolvePosCustomer();
      var items = cartChronological().map(mapCartLineToQuotationItem);
      var taxExtra = buildQuotationTaxExtras(
        state.settings,
        subTotal,
        discAmt,
        taxCalcInput,
        posTaxCalc,
        total,
        posTaxLines,
        posTotalTax
      );
      var qtTs = new Date().toISOString();
      var origQ = editingQuotationId
        ? (state.quotations || []).find(function (q) { return q.id === editingQuotationId; })
        : null;
      var newQ = stampTransactionIsoDateTime(Object.assign({}, {
        id: editingQuotationId || uid(),
        quotationNo: finalQtNo,
        customer: cust.custName,
        customerId: cust.custId,
        customerPhone: cust.custPhone,
        items: items,
        notes: String(quotationNotes || "").trim(),
        status: (origQ && origQ.status) ? origQ.status : "Sent",
        date: recordDate || today(),
        createdAt: (origQ && origQ.createdAt) ? origQ.createdAt : qtTs,
        updatedAt: qtTs,
        createdBy: (origQ && origQ.createdBy) ? origQ.createdBy : currentUserName,
      }, taxExtra, origQ && origQ.convertedInvoiceId ? {
        convertedInvoiceId: origQ.convertedInvoiceId,
        convertedAt: origQ.convertedAt,
      } : {}), qtTs);
      var nq = editingQuotationId
        ? (state.quotations || []).map(function (q) { return q.id === editingQuotationId ? newQ : q; })
        : (state.quotations || []).concat([newQ]);
      S.set("tc3_quotations", nq);
      try { pushKeysNow([["tc3_quotations", nq]]); } catch (_e) { /* ignore */ }
      addAudit(wasEditingQuotation ? "Updated Quotation" : "Created Quotation", newQ.quotationNo);
      setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
      var heldIdToClear = activeHeldId;
      setEditingQuotationId("");
      resetQuotationForm();
      if (heldIdToClear) deleteHeldInvoice(heldIdToClear);
      if (withPrint || waShare) {
        if (waShare) waPendingRef.current = true;
        setPendingPrint({
          kind: "quotation",
          sale: quotationToPrintInv(newQ),
          mode: printMode || resolveDefaultPrintFormat(state.settings || {}),
          settings: Object.assign({}, state.settings),
          invoiceLang: "en",
        });
      } else {
        showAlert("Quotation " + finalQtNo + (wasEditingQuotation ? " updated" : " saved") + ". View it under Invoices → Quotations.");
      }
    } finally {
      setIsSavingQuotation(false);
    }
  };

  var resetForm = function () {
    setCart([]); setFreeCart([]); setFreeSearch(""); setCodTrack(emptyCodTrackForm()); setCustMode("walkin"); setCustSearch(""); setCustId(""); setNewCust({ name: "", phone: "", address: "" }); setDiscount(""); setPayMode("full"); setPaidAmt(""); setInvoice(null); setPrintMode(null); setInvoiceNo(genInvNo()); setFromRepairId(""); setFromRepairDeviceIndexes([]);
    setEditingSaleId("");
    setRecordDate(today());
    focusPosSearch();
  };

  /* ?? Load a held invoice ? keeps it in IDB until completed or manually deleted ?? */
  var loadHeldInvoice = function (h) {
    var isQuotHold = h.holdKind === "quotation" || h.posPageTab === "quotation";
    setPosPageTab(isQuotHold ? "quotation" : "sale");
    setCart(cartChronological(h.cart || []).map(function (it) { return Object.assign({}, it, { cartLineId: it.cartLineId || uid() }); }));
    setFreeCart((h.freeCart || []).map(function (it) { return Object.assign({}, it, { cartLineId: it.cartLineId || uid(), isFree: true, price: 0 }); }));
    setCustMode(h.custMode || "existing");
    setCustSearch(h.custSearch || "");
    setCustId(h.custId || "");
    setNewCust(h.newCust || { name: "", phone: "", address: "" });
    setDiscount(h.discount || "");
    setIncludeWarranty(h.includeWarranty || false);
    setPosSplitRows(h.posSplitRows || []);
    setPaidAmt(h.paidAmt || "");
    setPayMode(h.payMode || "full");
    if (isQuotHold) {
      setQuotationNo(h.quotationNo || genInvNo("QT"));
      setQuotationNotes(h.quotationNotes || "");
    } else if (h.invoiceNo) {
      setInvoiceNo(h.invoiceNo);
    }
    if (h.fromRepairId) setFromRepairId(h.fromRepairId);
    if (Array.isArray(h.fromRepairDeviceIndexes)) setFromRepairDeviceIndexes(h.fromRepairDeviceIndexes);
    if (h.fromQuotationId) setFromQuotationId(h.fromQuotationId);
    if (h.editingSaleId) setEditingSaleId(h.editingSaleId);
    setRecordDate(h.recordDate || today());
    if (h.codTrack) setCodTrack(Object.assign(emptyCodTrackForm(), h.codTrack));
    else setCodTrack(emptyCodTrackForm());
    setActiveHeldId(h.id);
    try { sessionStorage.setItem("tc3_dirty", "pos"); } catch (e) {}
    focusPosSearch();
  };

  var clearCartAfterHold = function (wasQuotation) {
    setCart([]);
    setFreeCart([]);
    setDiscount("");
    setPaidAmt("");
    setPayMode("full");
    setPosSplitRows([]);
    setIncludeWarranty(false);
    setEditingSaleId("");
    setRecordDate(today());
    setFromQuotationId("");
    setFromRepairId("");
    setFromRepairDeviceIndexes([]);
    setActiveHeldId(null);
    if (wasQuotation) {
      setQuotationNotes("");
      setQuotationNo(genInvNo("QT"));
    } else {
      setInvoiceNo(genInvNo());
    }
    setCustMode("walkin");
    setCustSearch("");
    setCustId("");
    setNewCust({ name: "", phone: "", address: "" });
    try { sessionStorage.removeItem("tc3_dirty"); } catch (e) {}
    focusPosSearch();
  };

  var holdCurrentCart = function () {
    if (!cart.length && !freeCart.length) {
      showAlert("Add at least one item before holding.");
      return;
    }
    var isQuot = isQuotationMode;
    var custLabel = custMode === "existing"
      ? (custSearch || "Customer")
      : (custMode === "new" ? (newCust.name || "New Customer") : "Walk-in");
    var docNo = isQuot ? quotationNo : invoiceNo;
    var kindLabel = isQuot ? "Quotation" : "Invoice";
    var itemCount = (cart || []).length + (freeCart || []).length;
    var held = S.get("tc3_held_invoices", []) || [];
    var entry = {
      cart: cartChronological().map(function (it) { return Object.assign({}, it); }),
      cartDisplayOrder: "chrono",
      freeCart: freeCart.map(function (it) { return Object.assign({}, it); }),
      custId: custId,
      custMode: custMode,
      custSearch: custSearch,
      newCust: Object.assign({}, newCust),
      discount: discount,
      fromRepairId: fromRepairId,
      fromRepairDeviceIndexes: (fromRepairDeviceIndexes || []).slice(),
      fromQuotationId: fromQuotationId,
      invoiceNo: invoiceNo,
      quotationNo: quotationNo,
      quotationNotes: quotationNotes,
      posPageTab: isQuot ? "quotation" : "sale",
      holdKind: isQuot ? "quotation" : "sale",
      includeWarranty: includeWarranty,
      posSplitRows: (posSplitRows || []).map(function (r) { return Object.assign({}, r); }),
      paidAmt: paidAmt,
      payMode: payMode,
      editingSaleId: editingSaleId,
      recordDate: recordDate,
      label: custLabel + " - " + kindLabel + (docNo ? (" " + docNo) : "") + " - " + itemCount + " item(s)",
      heldAt: new Date().toISOString(),
    };
    if (activeHeldId) {
      entry.id = activeHeldId;
      held = held.map(function (h) { return h.id === activeHeldId ? entry : h; });
      if (!held.find(function (h) { return h.id === activeHeldId; })) held = held.concat([entry]);
    } else {
      entry.id = "held_" + Date.now();
      held = held.concat([entry]);
    }
    S.set("tc3_held_invoices", held);
    setHeldInvoices(held);
    addAudit("Held " + kindLabel, docNo || entry.id.slice(0, 12));
    clearCartAfterHold(isQuot);
    showAlert(kindLabel + " held. Open it anytime from On Hold below.");
  };

  posShortcutRef.current = {
    isQuotationMode: isQuotationMode,
    isRestaurant: isRestaurant,
    cartLength: cart.length,
    freeCartLength: freeCart.length,
    canCheckout: cart.length > 0 && !posSetupBlocksCriticalActions() && !isCheckingOut && !posIsSavingRef.current,
    canQuotationAction: cart.length > 0 && !isSavingQuotation && canEditInvoices,
    posPrintPicker: posPrintPicker,
    posPrintPickerIntent: posPrintPickerIntent,
    waSharePicker: waSharePicker,
    saveOnly: function () { saveAndFinish(false); },
    saveAndPrint: function () { openPosPrintPicker(); },
    saveQuotationOnly: function () { saveQuotation(false); },
    openPrintPicker: openPosPrintPicker,
    openPreviewPicker: openPosPreviewPicker,
    openQuotationPrintPicker: openQuotationPrintPicker,
    openQuotationPreviewPicker: openQuotationPreviewPicker,
    openWhatsApp: saveAndWhatsApp,
    openQuotationWhatsApp: openQuotationWhatsApp,
    openSplitPayment: function () {
      if (posSetupBlocksCriticalActions() || isCheckingOut || !cart.length) return;
      setPosSplitModal(true);
      setPayMode("partial");
    },
    holdCart: holdCurrentCart,
    focusSearch: focusPosSearch,
    clearCart: clearCurrentCart,
    removeLastRow: removeLastCartRow,
    printA4: function () { saveAndPrintWithMode("a4"); },
    printA5: function () { saveAndPrintWithMode("a5"); },
    printThermal: function () { saveAndPrintWithMode(resolveThermalFormat(state.settings)); },
    previewA4: function () {
      setPosPrintPickerIntent("preview");
      previewWithMode("a4");
    },
    previewA5: function () {
      setPosPrintPickerIntent("preview");
      previewWithMode("a5");
    },
    previewThermal: function () {
      setPosPrintPickerIntent("preview");
      previewWithMode(resolveThermalFormat(state.settings));
    },
    waShareA4: function () {
      if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode("a4");
      else saveAndWhatsAppWithMode("a4");
    },
    waShareA5: function () {
      if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode("a5");
      else saveAndWhatsAppWithMode("a5");
    },
    waShareThermal: function () {
      var mode = resolveThermalFormat(state.settings);
      if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode(mode);
      else saveAndWhatsAppWithMode(mode);
    },
    closePrintPicker: function () { setPosPrintPicker(false); },
    closeWaSharePicker: function () { setWaSharePicker(false); },
    waSharePickerKind: waSharePickerKind,
  };

  useEffect(function () {
    var onKey = function (e) {
      var s = posShortcutRef.current;
      if (s.posPrintPicker) {
        var pk = e.key.toLowerCase();
        if (pk === "1" || pk === "a") {
          e.preventDefault();
          if (s.posPrintPickerIntent === "preview") s.previewA4();
          else s.printA4();
        } else if (pk === "2" || pk === "5") {
          e.preventDefault();
          if (s.posPrintPickerIntent === "preview") s.previewA5();
          else s.printA5();
        } else if (pk === "3" || pk === "t") {
          e.preventDefault();
          if (s.posPrintPickerIntent === "preview") s.previewThermal();
          else s.printThermal();
        } else if (pk === "escape") {
          e.preventDefault();
          s.closePrintPicker();
        }
        return;
      }
      if (s.waSharePicker) {
        var wk = e.key.toLowerCase();
        if (wk === "1" || wk === "a") {
          e.preventDefault();
          s.waShareA4();
        } else if (wk === "2" || wk === "5") {
          e.preventDefault();
          s.waShareA5();
        } else if (wk === "3" || wk === "t") {
          e.preventDefault();
          s.waShareThermal();
        } else if (wk === "escape") {
          e.preventDefault();
          s.closeWaSharePicker();
        }
        return;
      }
      if (!s.isRestaurant) {
        if (e.key === "F9") {
          e.preventDefault();
          if ((s.cartLength > 0 || s.freeCartLength > 0) && s.holdCart) s.holdCart();
          return;
        }
        if (e.key === "F2") {
          e.preventDefault();
          if (s.focusSearch) s.focusSearch();
          return;
        }
        if (e.key === "F3") {
          e.preventDefault();
          if (s.focusSearch) s.focusSearch();
          return;
        }
        if (e.key === "F4") {
          e.preventDefault();
          if (!s.isQuotationMode && s.cartLength > 0 && s.openSplitPayment) s.openSplitPayment();
          return;
        }
        if (e.key === "F5") {
          e.preventDefault();
          if (s.isQuotationMode) {
            if (s.canQuotationAction) s.openQuotationPrintPicker();
          } else if (s.canCheckout) {
            s.saveAndPrint();
          }
          return;
        }
        if (e.key === "F6") {
          e.preventDefault();
          if (s.isQuotationMode) {
            if (s.canQuotationAction) s.saveQuotationOnly();
          } else if (s.canCheckout) {
            s.saveOnly();
          }
          return;
        }
        if (e.key === "F7") {
          e.preventDefault();
          if (s.isQuotationMode) {
            if (s.cartLength > 0 && s.openQuotationPreviewPicker) s.openQuotationPreviewPicker();
          } else if (s.cartLength > 0 && s.openPreviewPicker) {
            s.openPreviewPicker();
          }
          return;
        }
        if (e.key === "F8") {
          e.preventDefault();
          if (s.isQuotationMode) {
            if (s.canQuotationAction) s.openQuotationWhatsApp();
          } else if (s.canCheckout) {
            s.openWhatsApp();
          }
          return;
        }
        if (e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          var tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : "";
          var typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
          if (!typing && s.cartLength > 0 && s.removeLastRow) {
            e.preventDefault();
            s.removeLastRow();
            return;
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, []);

  var deleteHeldInvoice = function (id) {
    var updated = S.get("tc3_held_invoices", []).filter(function (x) { return x.id !== id; });
    S.set("tc3_held_invoices", updated);
    setHeldInvoices(updated);
    if (activeHeldId === id) setActiveHeldId(null);
  };

  var doPopupPrint = function (docNo, mode, kind) {
    var el = document.getElementById("pos-print-preview");
    if (!el) { showAlert("Print preview not ready. Please try again."); return; }
    var w = window.open("", "_blank", "width=900,height=760");
    if (!w) { showAlert("Popup blocked. Please allow popups for this window and try again."); setPendingPrint(null); return; /* FIX #4: clear stuck state when popup is blocked */ }
    var isThermal = mode === "thermal" || mode === "thermal58" || mode === "thermal80";
    var isA5 = mode === "a5";
    var thermalBodyW = mode === "thermal58" ? "218px" : "302px"; /* 58mm=218px, 80mm=302px at 96dpi */
    var pgSize = mode === "thermal58" ? "58mm auto" : (mode === "thermal80" || mode === "thermal") ? "80mm auto" : isA5 ? "A5" : "A4";
    var pgMargin = isThermal ? "3mm" : "8mm";
    var bodyW = isThermal ? "body{background:#fff;font-family:'Courier New',monospace;width:" + thermalBodyW + ";}" : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
    var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pgSize + " portrait;margin:" + pgMargin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
    var docLabel = kind === "quotation" ? "Quotation" : "Invoice";
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>" + docLabel + " " + escapeHtml(docNo || "") + "</title>" + css + "</head><body>" + el.innerHTML + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  };

  /* WhatsApp share path: render off-screen then share. Print/preview stays in universal modal. */
  useEffect(function () {
    if (!pendingPrint || !waPendingRef.current) return;
    var timer = setTimeout(function () {
      var el = document.getElementById("pos-print-preview");
      if (!el) {
        waPendingRef.current = false;
        setPendingPrint(null);
        return;
      }
      waPendingRef.current = false;
      var isA5 = pendingPrint.mode === "a5";
      var isThermal = pendingPrint.mode === "thermal" || pendingPrint.mode === "thermal58" || pendingPrint.mode === "thermal80";
      var bodyW = isThermal
        ? "body{background:#fff;font-family:'Courier New',monospace;width:" + (pendingPrint.mode === "thermal58" ? "218px" : "302px") + ";}"
        : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
      var pgSize = isThermal ? (pendingPrint.mode === "thermal58" ? "58mm auto" : "80mm auto") : (isA5 ? "A5" : "A4");
      var pgMargin = isThermal ? "3mm" : "8mm";
      var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pgSize + (isThermal ? "" : " portrait") + ";margin:" + pgMargin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
      var pageFormat = isThermal ? (pendingPrint.mode === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
      var isQuot = pendingPrint.kind === "quotation";
      var filename = (isQuot ? "Quotation-" : "Invoice-") + (pendingPrint.sale.invoiceNo || pendingPrint.sale.id.slice(0, 8));
      var phone = pendingPrint.sale.customerPhone || "";
      setPendingPrint(null);
      shareViaWhatsApp(el.innerHTML, filename, phone, { headStyles: css, pageFormat: pageFormat });
    }, 300);
    return function () { clearTimeout(timer); };
  }, [pendingPrint]);

  var activeRestaurantProfile = isRestaurant && typeof props.getBusinessProfile === "function"
    ? (props.getBusinessProfile() || {})
    : {};
  var restaurantCategoryDisplay = Array.isArray(activeRestaurantProfile.categories)
    ? activeRestaurantProfile.categories.slice().sort(function (a, b) {
      var ai = restaurantCategoryPriority.indexOf(a);
      var bi = restaurantCategoryPriority.indexOf(b);
      ai = ai < 0 ? 999 : ai;
      bi = bi < 0 ? 999 : bi;
      if (ai !== bi) return ai - bi;
      return String(a).localeCompare(String(b));
    })
    : [];
  var restaurantQuickSellProducts = isRestaurant
    ? restaurantQuickSellNames.map(function (nm) {
      return state.products.find(function (p) {
        if (p.status === "inactive") return false;
        return String(p.name || "").toLowerCase() === nm.toLowerCase();
      });
    }).filter(Boolean)
    : [];
  var restaurantStatusLabel = function (st) {
    if (st === "pending") return "Pending";
    if (st === "preparing") return "Preparing";
    if (st === "ready") return "Ready";
    if (st === "served") return "Served";
    if (st === "billed") return "Billed";
    return "Pending";
  };
  var restaurantTableStatusUi = function (st) {
    if (st === "free") return { label: "Free", bg: "#dcfce7", fg: "#166534", dot: "#22c55e" };
    if (st === "occupied") return { label: "Occupied", bg: "#fee2e2", fg: "#991b1b", dot: "#ef4444" };
    return { label: "Pending", bg: "#fef3c7", fg: "#92400e", dot: "#eab308" };
  };
  var restaurantTableNameExists = function (name, excludeId) {
    var key = normalizeRestaurantTableName(name).toLowerCase();
    if (!key) return false;
    return restaurantTables.some(function (t) {
      if (!t || !t.id) return false;
      if (excludeId && t.id === excludeId) return false;
      return normalizeRestaurantTableName(t.name || t.id).toLowerCase() === key;
    });
  };
  var addRestaurantTable = function () {
    if (!isRestaurant) return;
    var tableName = normalizeRestaurantTableName(newRestaurantTableName);
    if (!tableName) { showAlert("Enter a table name."); return; }
    if (restaurantTableNameExists(tableName)) { showAlert("Table name already exists."); return; }
    var used = {};
    restaurantTables.forEach(function (t) { if (t && t.id) used[t.id] = 1; });
    var stableId = nextRestaurantTableStableId(used);
    setRestaurantTables(function (prev) {
      return prev.concat([{ id: stableId, name: tableName, status: "free" }]);
    });
    setSelectedTableId(stableId);
    setNewRestaurantTableName("");
    requestAnimationFrame(function () {
      try {
        var wrap = restaurantTableInputWrapRef.current;
        var input = wrap && wrap.querySelector ? wrap.querySelector("input") : null;
        if (input && typeof input.focus === "function") {
          input.focus();
          if (typeof input.select === "function") input.select();
        }
      } catch (e) {}
    });
    setRestaurantToast("Table added");
  };
  var renameRestaurantTable = function (tableId, nextName) {
    if (!isRestaurant) return;
    var cleanName = normalizeRestaurantTableName(nextName);
    var currentTable = restaurantTables.find(function (t) { return t.id === tableId; });
    if (!cleanName || cleanName === normalizeRestaurantTableName(currentTable && currentTable.name || currentTable && currentTable.id)) return;
    if (restaurantTableNameExists(cleanName, tableId)) {
      showAlert("Table name already exists.");
      return;
    }
    setRestaurantTables(function (prev) {
      return prev.map(function (t) {
        if (t.id !== tableId) return t;
        return Object.assign({}, t, { name: cleanName });
      });
    });
    setRestaurantToast("Table renamed");
  };
  var deleteRestaurantTable = function (tableId) {
    if (!isRestaurant) return;
    var target = restaurantTables.find(function (t) { return t.id === tableId; });
    if (!target) return;
    if (getRestaurantTableComputedStatus(target.id, target.status) !== "free") {
      showAlert("Cannot delete active table");
      return;
    }
    setRestaurantTables(function (prev) {
      return prev.filter(function (t) { return t.id !== tableId; });
    });
    setSelectedTableId(function (prev) { return prev === tableId ? "" : prev; });
    setRestaurantToast("Table deleted");
  };
  var getNextRestaurantTableName = function () {
    var maxNum = 0;
    restaurantTables.forEach(function (t) {
      var label = normalizeRestaurantTableName(t && (t.name || t.id));
      var m = /^t\s*(\d+)$/i.exec(label);
      if (!m) return;
      var n = parseInt(m[1], 10);
      if (isFinite(n) && n > maxNum) maxNum = n;
    });
    return "T" + (maxNum + 1);
  };
  var isRestaurantUsingDefaultTables = restaurantTables.length === DEFAULT_RESTAURANT_TABLES.length && restaurantTables.every(function (t, idx) {
    var d = DEFAULT_RESTAURANT_TABLES[idx];
    return !!t && !!d && t.name === d.name && getRestaurantTableComputedStatus(t.id, t.status) === d.status;
  });
  var getRestaurantTableDisplayName = function (tableId) {
    var match = restaurantTables.find(function (t) { return t.id === tableId; });
    if (match) return match.name || match.id;
    return tableId || "";
  };
  function getRestaurantTableComputedStatus(tableId, fallbackStatus) {
    var hasActiveOrder = restaurantOrders.some(function (o) {
      return o && o.tableId === tableId && !isOrderFullyBilled(o);
    });
    if (hasActiveOrder) return "occupied";
    return fallbackStatus === "pending" ? "pending" : "free";
  }
  var tableOrderStats = function (tableId) {
    var list = restaurantOrders.filter(function (o) {
      return o && o.tableId === tableId && !isOrderFullyBilled(o);
    });
    if (!list.length) return { count: 0, lastAt: null };
    var lastAt = list.reduce(function (acc, o) {
      var ts = o.updatedAt || o.billedAt || o.createdAt || null;
      if (!ts) return acc;
      if (!acc) return ts;
      return new Date(ts).getTime() > new Date(acc).getTime() ? ts : acc;
    }, null);
    return { count: list.length, lastAt: lastAt };
  };
  var restaurantTableNeedsAttention = function (tableId) {
    var readyOrder = restaurantOrders.find(function (o) {
      return o.tableId === tableId && String(o.status || "").toLowerCase() === "ready" && !isOrderFullyBilled(o);
    });
    if (!readyOrder) return false;
    var baseTs = readyOrder.updatedAt || readyOrder.createdAt;
    if (!baseTs) return false;
    return (Date.now() - new Date(baseTs).getTime()) >= 10 * 60000;
  };
  var restaurantTableCounts = restaurantTables.reduce(function (acc, t) {
    var tableStatus = getRestaurantTableComputedStatus(t.id, t.status);
    if (tableStatus === "free") acc.free += 1;
    else if (tableStatus === "occupied") acc.occupied += 1;
    else acc.pending += 1;
    return acc;
  }, { free: 0, occupied: 0, pending: 0 });
  var minutesAgoLabel = function (isoTs) {
    if (!isoTs) return "-";
    var diffMin = Math.max(0, Math.floor((Date.now() - new Date(isoTs).getTime()) / 60000));
    if (diffMin < 1) return "just now";
    if (diffMin === 1) return "1 min ago";
    return diffMin + " min ago";
  };
  var uiBeep = function () {
    try {
      if (typeof window === "undefined") return;
      if (Date.now() - (lastBeepAtRef.current || 0) < 200) return;
      lastBeepAtRef.current = Date.now();
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.06);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 120);
    } catch (e) {}
  };
  var sanitizeRestaurantPhone = function (raw) {
    return String(raw || "").replace(/[^0-9+]/g, "");
  };
  var openDeliveryCall = function (phone) {
    if (!phone) return;
    try { window.location.href = "tel:" + phone; } catch (e) {}
  };
  var openDeliveryMap = function (address) {
    if (!address) return;
    try { window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address), "_blank"); } catch (e) {}
  };
  var copyDeliveryDetails = function (info) {
    if (!info) return;
    var text = [info.name || "", info.phone || "", info.address || ""].filter(Boolean).join("\n");
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        setRestaurantToast("Delivery details copied");
      }
    } catch (e) {}
  };
  var selectedTableLatestOrder = isRestaurant ? findOpenOrderForTable(selectedTableId) : null;
  var selectedRestaurantOrderDetail = restaurantOrderDetailId
    ? restaurantOrders.find(function (o) { return o.id === restaurantOrderDetailId; }) || null
    : null;
  var isRestaurantDineIn = isRestaurant && restaurantOrderType === "dine-in";
  var restaurantBillingAllowed = !isRestaurant || currentUserRole === "cashier" || currentUserRole === "admin";
  var selectedTableLocked = !!(isRestaurantDineIn && selectedTableLatestOrder && isOrderFullyBilled(selectedTableLatestOrder));
  var selectedTableReopenOrder = isRestaurantOrderReopenable(selectedTableLatestOrder) ? selectedTableLatestOrder : null;
  var restaurantStatusStyle = function (st) {
    if (st === "pending") return { bg: "#fef3c7", fg: "#92400e" };
    if (st === "preparing") return { bg: "#dbeafe", fg: "#1e40af" };
    if (st === "ready") return { bg: "#dcfce7", fg: "#166534" };
    if (st === "served") return { bg: "#f3f4f6", fg: "#374151" };
    if (st === "billed") return { bg: "#dcfce7", fg: "#166534" };
    return { bg: "#fef3c7", fg: "#92400e" };
  };
  var restaurantStatusClass = function (st) {
    if (st === "preparing") return "preparing";
    if (st === "ready") return "ready";
    if (st === "served") return "served";
    if (st === "billed") return "billed";
    return "pending";
  };
  var sendToKitchen = function () {
    if (!isRestaurant) return;
    if (isRestaurantDineIn && selectedTableLocked) {
      showAlert("Order Closed for this table. Start/use another table.");
      return;
    }
    if (!cart.length) { showAlert("Add items before sending to kitchen."); return; }
    if (isRestaurantDineIn && !selectedTableId) { showAlert("Select a table first."); return; }
    var activeTableId = isRestaurantDineIn ? selectedTableId : null;
    var deliveryDetails = restaurantOrderType === "delivery"
      ? {
          name: String(restaurantDeliveryDetails.name || "").trim(),
          phone: String(restaurantDeliveryDetails.phone || "").trim(),
          address: String(restaurantDeliveryDetails.address || "").trim(),
        }
      : null;
    var mappedItems = cart.map(function (it) {
      return {
        id: it.id,
        name: it.name,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        saleUnit: it.saleUnit || it.unit || "Pcs",
        note: String(it.restaurantNote || "").trim(),
      };
    });
    if (isRestaurantDineIn && selectedTableReopenOrder) {
      var reopenOrderId = selectedTableReopenOrder.id;
      var qtyDeltaKey = function (it) { return [it.id, it.saleUnit || "Pcs"].join("::"); };
      var baseQtyMap = {};
      getOrderRemainingItems(selectedTableReopenOrder).forEach(function (it) {
        var k = qtyDeltaKey(it);
        baseQtyMap[k] = (baseQtyMap[k] || 0) + (Number(it.qty) || 0);
      });
      var liveQtyMap = {};
      mappedItems.forEach(function (it) {
        var k = qtyDeltaKey(it);
        liveQtyMap[k] = (liveQtyMap[k] || 0) + (Number(it.qty) || 0);
      });
      var deltaItems = [];
      Object.keys(liveQtyMap).forEach(function (k) {
        var deltaQty = (liveQtyMap[k] || 0) - (baseQtyMap[k] || 0);
        if (deltaQty <= 0) return;
        var sample = mappedItems.find(function (it) { return qtyDeltaKey(it) === k; });
        if (!sample) return;
        deltaItems.push(Object.assign({}, sample, { qty: Number(deltaQty.toFixed(4)) }));
      });
      if (!deltaItems.length) {
        showAlert("No new items to send. Increase qty or add a new item first.");
        return;
      }
      setRestaurantOrders(function (prev) {
        return prev.map(function (o) {
          if (o.id !== reopenOrderId) return o;
          var nextOrder = Object.assign({}, o, {
            items: (o.items || []).concat(deltaItems),
            note: String(restaurantOrderNote || "").trim() || o.note || "",
            updatedAt: new Date().toISOString(),
          });
          if (restaurantOrderType === "delivery") nextOrder.deliveryDetails = deliveryDetails;
          return nextOrder;
        });
      });
      addAudit("Restaurant order appended", reopenOrderId, { tableId: activeTableId, itemCount: deltaItems.length, orderType: restaurantOrderType });
      setRestaurantOrderNote("");
      setRestaurantOrderType(restaurantDefaultOrderType);
      uiBeep();
      showAlert("New items sent to kitchen" + (activeTableId ? (" for table " + getRestaurantTableDisplayName(activeTableId)) : "") + ".");
      return;
    }
    var order = {
      id: uid(),
      tableId: activeTableId,
      type: restaurantOrderType,
      createdBy: currentUserName,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      note: String(restaurantOrderNote || "").trim(),
      items: mappedItems.map(function (it) {
        return {
          id: it.id,
          name: it.name,
          qty: Number(it.qty) || 0,
          price: Number(it.price) || 0,
          saleUnit: it.saleUnit || it.unit || "Pcs",
          note: it.note || "",
        };
      }),
    };
    if (restaurantOrderType === "delivery") order.deliveryDetails = deliveryDetails;
    setRestaurantOrders(function (prev) { return [order].concat(prev); });
    if (activeTableId) {
      setRestaurantTables(function (prev) {
        return prev.map(function (t) {
          if (t.id !== activeTableId) return t;
          return Object.assign({}, t, { status: "occupied" });
        });
      });
    }
    addAudit("Restaurant order sent to kitchen", order.id, { tableId: activeTableId, itemCount: order.items.length, orderType: restaurantOrderType });
    setRestaurantOrderNote("");
    setRestaurantOrderType(restaurantDefaultOrderType);
    setRestaurantDeliveryDetails({ name: "", phone: "", address: "" });
    uiBeep();
    showAlert("Order sent to kitchen" + (activeTableId ? (" for table " + getRestaurantTableDisplayName(activeTableId)) : (" (" + restaurantOrderType + ")")) + ".");
  };
  var setRestaurantOrderStatus = function (orderId, nextStatus) {
    if (!isRestaurant) return;
    setRestaurantOrders(function (prev) {
      return prev.map(function (o) {
        if (o.id !== orderId) return o;
        if (o.status === "billed" || o.invoicedSaleId) return o;
        return Object.assign({}, o, { status: nextStatus, updatedAt: new Date().toISOString() });
      });
    });
  };
  function orderItemKey(it) {
    return [it.id, it.saleUnit || "Pcs", Number(it.price) || 0].join("::");
  }
  function getOrderRemainingItems(order) {
    if (!order || order.invoicedSaleId) return [];
    var billedMap = {};
    (order.splitBills || []).forEach(function (sb) {
      (sb.items || []).forEach(function (it) {
        var k = orderItemKey(it);
        billedMap[k] = (billedMap[k] || 0) + (Number(it.qty) || 0);
      });
    });
    return (order.items || []).map(function (it) {
      var k = orderItemKey(it);
      var remain = Number(it.qty) - (billedMap[k] || 0);
      if (remain < 0.0001) return null;
      return Object.assign({}, it, { qty: Number(remain.toFixed(4)) });
    }).filter(Boolean);
  }
  var handleRestaurantTablePick = function (tableId) {
    if (!isRestaurant) return;
    setSelectedTableId(tableId);
    var latest = findOpenOrderForTable(tableId);
    if (!latest) {
      setCart([]);
      setSearch("");
      focusPosSearch();
      return;
    }
    var nextCart = getOrderRemainingItems(latest).map(function (it) {
      var p = state.products.find(function (x) { return x.id === it.id; });
      var su = it.saleUnit || (p && p.unit) || "Pcs";
      return {
        cartLineId: uid(),
        id: it.id,
        name: it.name || (p && p.name) || "Item",
        barcode: (p && p.barcode) || "",
        unit: (p && p.unit) || su,
        saleUnit: su,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        cost: p ? getPosCostPerSaleUnit(p, su) : 0,
        stock: p ? p.stock : 0,
        description: (p && p.description) || "",
        comment: "",
        commentLabel: (p && String(p.comment_label || "").trim()) || "Comment",
        requireComment: posLineCommentsEnabled,
        itemNote: "",
        customPrice: true,
        restaurantNote: it.note || "",
      };
    }).filter(function (it) { return it.qty > 0; });
    setCart(nextCart);
    setSearch("");
    focusPosSearch();
  };
  useEffect(function () {
    if (!isRestaurant) return;
    if (restaurantOrderType !== "dine-in") return;
    if (!restaurantTables.length) return;
    var hasSelected = !!selectedTableId && restaurantTables.some(function (t) { return t.id === selectedTableId; });
    if (hasSelected) return;
    var preferred = restaurantTables.find(function (t) { return getRestaurantTableComputedStatus(t.id, t.status) === "free"; }) || restaurantTables[0];
    handleRestaurantTablePick(preferred.id);
  }, [isRestaurant, restaurantTables, selectedTableId, restaurantOrderType]);
  function isOrderFullyBilled(order) {
    if (!order) return false;
    return getOrderRemainingItems(order).length === 0 || order.status === "billed";
  }
  var billRestaurantItems = function (orderId, itemsToBill, meta) {
    if (!isRestaurant) return;
    if (billingOrderId) { setRestaurantToast("Billing in progress"); return; }
    var order = restaurantOrders.find(function (o) { return o.id === orderId; });
    if (!order) { showAlert("Order not found."); return; }
    if (!itemsToBill || !itemsToBill.length) { showAlert("No items selected for billing."); return; }
    if (order.invoicedSaleId || isOrderFullyBilled(order)) { setRestaurantToast("Order already billed"); return; }
    var nextCart = itemsToBill.map(function (it) {
      var p = state.products.find(function (x) { return x.id === it.id; });
      var su = it.saleUnit || (p && p.unit) || "Pcs";
      return {
        cartLineId: uid(),
        id: it.id,
        name: it.name || (p && p.name) || "Item",
        barcode: (p && p.barcode) || "",
        unit: (p && p.unit) || su,
        saleUnit: su,
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        cost: p ? getPosCostPerSaleUnit(p, su) : 0,
        stock: p ? p.stock : 0,
        description: (p && p.description) || "",
        comment: "",
        commentLabel: (p && String(p.comment_label || "").trim()) || "Comment",
        requireComment: posLineCommentsEnabled,
        itemNote: "",
        customPrice: true,
      };
    }).filter(function (it) { return it.qty > 0; });
    if (!nextCart.length) { showAlert("Order has no billable items."); return; }
    var hasMissing = nextCart.some(function (it) {
      return !state.products.find(function (p) { return p.id === it.id; });
    });
    if (hasMissing) {
      showAlert("Some order items no longer exist in products. Please update the order.");
      return;
    }
    var billTotal = nextCart.reduce(function (a, it) {
      return a + (Number(it.qty) || 0) * (Number(it.price) || 0);
    }, 0);
    var billConfirmThreshold = 50000;
    if (billTotal > billConfirmThreshold && !(meta && meta._confirmedLargeBill)) {
      showConfirm("Confirm billing this order?", function () {
        billRestaurantItems(orderId, itemsToBill, Object.assign({}, meta, { _confirmedLargeBill: true }));
      });
      return;
    }
    setBillingOrderId(orderId);
    setCart(nextCart);
    setCustMode("walkin");
    setCustSearch("");
    setCustId("");
    setNewCust({ name: "", phone: "", address: "" });
    setDiscount("");
    setPayMode("full");
    setPaidAmt("");
    setPosSplitRows([]);
    setPosSplitModal(false);
    setPosCashMethod("Cash");
    setPosChequeList([]);
    setPosChqForm({ no: "", bank: "", amount: "", due: today() });
    setEditingSaleId("");
    setInvoiceNo(genInvNo());
    setFromRepairId("");
    setFromRepairDeviceIndexes([]);
    setFromQuotationId("");
    setTimeout(function () {
      saveAndFinish(false, undefined, function (saleObj) {
        var billedOrder = null;
        setRestaurantOrders(function (prev) {
          return prev.map(function (o) {
            if (o.id !== orderId) return o;
            var nextSplitBills = (o.splitBills || []).concat([{
              items: itemsToBill.map(function (x) { return Object.assign({}, x); }),
              invoicedSaleId: saleObj.id,
              mode: meta && meta.mode ? meta.mode : "item",
            }]);
            var nextOrder = Object.assign({}, o, {
              splitBills: nextSplitBills,
              billedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            if (meta && meta.mode === "equal" && meta.totalPeople) {
              var curPlan = nextOrder.equalSplitPlan || { totalPeople: meta.totalPeople, billedPeople: 0 };
              nextOrder.equalSplitPlan = {
                totalPeople: meta.totalPeople,
                billedPeople: (curPlan.billedPeople || 0) + 1,
              };
            }
            var remainingAfterBilling = getOrderRemainingItems(nextOrder);
            if (remainingAfterBilling.length === 0) {
              nextOrder.status = "billed";
              nextOrder.invoicedSaleId = saleObj.id;
            }
            billedOrder = nextOrder;
            return nextOrder;
          });
        });
        setRestaurantTables(function (prev) {
          return prev.map(function (t) {
            if (t.id !== order.tableId) return t;
            var finalOrder = billedOrder || order;
            return Object.assign({}, t, {
              status: (getOrderRemainingItems(finalOrder).length === 0 || finalOrder.status === "billed") ? "free" : "occupied",
            });
          });
        });
        addAudit("Restaurant split/order billed", order.id, { tableId: order.tableId, saleId: saleObj.id, invoiceNo: saleObj.invoiceNo });
        setItemSplitPick({});
        uiBeep();
        setRestaurantToast("Order billed successfully");
      });
      setBillingOrderId("");
    }, 0);
  };
  var billRestaurantEqualSplit = function (orderId, peopleCount) {
    if (!isRestaurant) return;
    var order = restaurantOrders.find(function (o) { return o.id === orderId; });
    if (!order) { setRestaurantToast("Order not found"); return; }
    if (order.invoicedSaleId || isOrderFullyBilled(order)) { setRestaurantToast("Order already billed"); return; }
    var remaining = getOrderRemainingItems(order);
    if (!remaining.length) { setRestaurantToast("No items to bill"); return; }
    var plan = order.equalSplitPlan;
    if (!plan || plan.totalPeople !== peopleCount) {
      if ((order.splitBills || []).length > 0) {
        showAlert("Equal split can only start before any split bills are created.");
        return;
      }
      plan = { totalPeople: peopleCount, billedPeople: 0 };
      setRestaurantOrders(function (prev) {
        return prev.map(function (o) {
          return o.id === orderId ? Object.assign({}, o, { equalSplitPlan: plan }) : o;
        });
      });
    }
    var remainingPeople = Math.max(1, (plan.totalPeople || peopleCount) - (plan.billedPeople || 0));
    var thisItems = remaining.map(function (it) {
      var qty = remainingPeople === 1 ? Number(it.qty) : Number((Number(it.qty) / remainingPeople).toFixed(4));
      return Object.assign({}, it, { qty: qty });
    }).filter(function (it) { return it.qty > 0; });
    billRestaurantItems(orderId, thisItems, { mode: "equal", totalPeople: plan.totalPeople || peopleCount });
  };
  var toggleItemSplitPick = function (orderId, idx) {
    var key = orderId + "::" + idx;
    setItemSplitPick(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = !next[key];
      return next;
    });
  };
  var billRestaurantItemSplit = function (orderId) {
    var order = restaurantOrders.find(function (o) { return o.id === orderId; });
    if (!order) { setRestaurantToast("Order not found"); return; }
    var remaining = getOrderRemainingItems(order);
    if (!remaining.length) { setRestaurantToast("Nothing to split"); return; }
    var picked = remaining.filter(function (_, idx) {
      return !!itemSplitPick[orderId + "::" + idx];
    });
    if (!picked.length) {
      showAlert("Select at least one item for item-based split.");
      return;
    }
    billRestaurantItems(orderId, picked, { mode: "item" });
  };
  var billRestaurantOrder = function (orderId) {
    if (!isRestaurant) return;
    if (billingOrderId) { setRestaurantToast("Billing in progress"); return; }
    var order = restaurantOrders.find(function (o) { return o.id === orderId; });
    if (!order) { showAlert("Order not found."); return; }
    if (order.invoicedSaleId || isOrderFullyBilled(order)) { setRestaurantToast("Order already billed"); return; }
    var remaining = getOrderRemainingItems(order);
    if (!remaining.length) { showAlert("No items to bill"); return; }
    billRestaurantItems(orderId, remaining, { mode: "full" });
  };
  function isRestaurantOrderReopenable(o) {
    if (!o) return false;
    var st = String(o.status || "").toLowerCase();
    var reopenableState = st === "pending" || st === "preparing" || st === "ready" || st === "served";
    return reopenableState && !isOrderFullyBilled(o);
  }

  var posCheckoutHintId = "pos-checkout-block-hint";
  var posCheckoutAriaDesc = posSetupBlocked || isCheckingOut ? posCheckoutHintId : undefined;
  var clientPosOfflineBar = props.clientPosOfflineBar === true;
  var todayIngredientSummary = useMemo(function () {
    if (!isRestaurant) return null;
    var dateStr = today();
    var counts = Array.isArray(state.rawMaterialCounts) ? state.rawMaterialCounts : [];
    var todayCount = counts.find(function (r) { return String(r && r.date || "") === String(dateStr); });
    if (!todayCount || !Array.isArray(todayCount.items) || !todayCount.items.length) return null;
    var prev = counts.filter(function (r) { return String(r && r.date || "") < String(dateStr); })
      .sort(function (a, b) { return String(a.date || "") < String(b.date || "") ? 1 : -1; });
    var prevMap = {};
    if (prev.length && Array.isArray(prev[0].items)) {
      prev[0].items.forEach(function (it) { prevMap[it.productId] = Number(it.closingQty) || 0; });
    }
    var sortedAsc = counts.slice().sort(function (a, b) { return String(a.date || "") < String(b.date || "") ? -1 : 1; });
    var totalCost = 0;
    var negativeCount = 0;
    todayCount.items.forEach(function (it) {
      if (!it || !it.productId) return;
      var p = state.products.find(function (x) { return x.id === it.productId; });
      if (!p || !isRawMaterialProduct(p)) return;
      var openingOm = rawMaterialOpeningQty(
        prevMap[it.productId] !== undefined ? prevMap[it.productId] : undefined,
        it.productId,
        dateStr,
        sortedAsc
      );
      var opening = openingOm.openingQty;
      var purchased = netPurchasedBaseQtyForDate(it.productId, dateStr, state);
      var closing = Number(it.closingQty) || 0;
      var consumed = opening + purchased - closing;
      if (consumed < 0) negativeCount += 1;
      var latest = null;
      (state.purchases || []).forEach(function (pu) {
        var pDate = String(pu && pu.date || "");
        if (!pDate || pDate > String(dateStr)) return;
        (pu.items || []).forEach(function (li) {
          if (!li || li.id !== it.productId) return;
          if (!latest || pDate > latest.date) latest = { date: pDate, cost: Number(li.cost) || 0 };
        });
      });
      var unitCost = latest ? latest.cost : (Number(p.cost) || 0);
      totalCost += consumed * unitCost;
    });
    return { totalCost: totalCost, negativeCount: negativeCount };
  }, [isRestaurant, state.rawMaterialCounts, state.products, state.purchases, today]);

  var PosShortcutBtnContent = function (p) {
    var busy = !!p.busy;
    var busyText = p.busyText || "Processing...";
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1.15, whiteSpace: "nowrap", textAlign: "center", width: "100%" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{busy ? busyText : p.label}</span>
      </span>
    );
  };

  var PosWhatsAppBtnContent = function (p) {
    var busy = !!p.busy;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, lineHeight: 1.15, width: "100%" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{busy ? (p.busyText || "Processing...") : "WhatsApp"}</span>
      </span>
    );
  };

  var renderPosWhatsAppBtn = function (opts) {
    var disabled = !!opts.disabled;
    return (
      <button
        type="button"
        onClick={opts.onClick}
        disabled={disabled}
        aria-describedby={opts.ariaDescribedby}
        title={opts.title || ""}
        className={"erp-btn erp-btn-full erp-btn-wa" + (disabled ? " erp-btn-disabled" : "")}
        style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "default" }}
      >
        <PosWhatsAppBtnContent busy={opts.busy} busyText={opts.busyText} />
      </button>
    );
  };

  return (
    <React.Fragment>
    <div className="erp-pos-shell">
    {clientPosOfflineBar ? (
      <div role="status" className="erp-settings-info erp-settings-info-warn" style={{ marginBottom: 8, justifyContent: "center", fontWeight: 700 }}>
        Offline - sales may sync when connection restores
      </div>
    ) : null}
    <form
      className={"erp-pos" + (!isRestaurant ? " erp-pos-modern" : "")}
      noValidate
      onSubmit={function (e) {
        e.preventDefault();
        if (posSetupBlocksCriticalActions() || isCheckingOut || posIsSavingRef.current) return;
      }}
    >
      {/* Left panel */}
      <div className="erp-pos-left">
        <div className="erp-pos-main-card">
        <Card pad={5}>
          {!isQuotationMode && editingSaleId && (
            <div className="erp-pos-edit-banner">
              <span>You are editing invoice <b>{invoiceNo}</b>. Save to apply changes or cancel.</span>
              <button type="button" onClick={clearPosSaleEdit} className="erp-pos-seg-btn">Cancel Edit</button>
            </div>
          )}
          {isQuotationMode && editingQuotationId && (
            <div className="erp-pos-edit-banner">
              <span>You are editing quotation <b>{quotationNo}</b>. Save to apply changes or cancel.</span>
              <button type="button" onClick={function () { setEditingQuotationId(""); resetQuotationForm(); }} className="erp-pos-seg-btn">Cancel Edit</button>
            </div>
          )}
          {!isRestaurant ? (
            <React.Fragment>
              <div className="erp-sale-panel erp-sale-panel-entry" style={{ position: "relative" }}>
                <div className="erp-sale-box-title erp-sale-entry-title-bar">
                  <div className="erp-pos-mode-tabs erp-pos-mode-tabs-compact">
                    {[["sale", "Sales"], ["quotation", "Quotation"]].map(function (t) {
                      var isA = posPageTab === t[0];
                      return (
                        <button
                          key={t[0]}
                          type="button"
                          className={"erp-pos-mode-tab" + (isA ? " active" : "")}
                          onClick={function () { switchPosPageTab(t[0]); }}
                        >
                          {t[1]}
                        </button>
                      );
                    })}
                  </div>
                  <span className="erp-pos-header-doc erp-pos-header-doc-in-title">
                    <span className="erp-pos-header-doc-label">
                      {isQuotationMode
                        ? (editingQuotationId ? "Edit Quotation" : "New Quotation")
                        : (editingSaleId ? "Edit Sale" : "New Sale")}
                    </span>
                    <span className="erp-pos-header-doc-sep" aria-hidden="true">·</span>
                    <span className="erp-pos-header-doc-no">
                      {isQuotationMode ? quotationNo : invoiceNo}
                    </span>
                    {(!isQuotationMode && editingSaleId) || (isQuotationMode && editingQuotationId) ? (
                      <span className="erp-pos-edit-badge">EDITING</span>
                    ) : null}
                    <span className="erp-pos-header-doc-sep" aria-hidden="true">·</span>
                    <span className="erp-pos-header-doc-date-wrap">
                      <input
                        ref={recordDateRef}
                        type="date"
                        className="erp-pos-header-doc-date-input"
                        value={recordDate}
                        onChange={function (e) { setRecordDate(e.target.value); }}
                        onClick={openRecordDatePicker}
                        aria-label="Record date"
                      />
                      <span className="erp-pos-header-doc-date-arrow" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="#2a5298" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </span>
                  </span>
                </div>
                <div className="erp-sale-entry-body">
                <div className="erp-sale-cust-top erp-sale-cust-inline">
                  <div className="erp-pos-cust-mode">
                    {[["walkin", "Walk-in"], ["customer", "Customer"]].map(function (item) {
                      var v = item[0]; var l = item[1];
                      var active = v === "walkin" ? custMode === "walkin" : custMode !== "walkin";
                      return (
                        <button
                          type="button"
                          key={v}
                          className={"erp-sale-cust-toggle" + (active ? " active" : "")}
                          onClick={function () {
                            if (v === "walkin") {
                              setCustMode("walkin");
                              setCustId("");
                              setCustSearch("");
                              setNewCust({ name: "", phone: "", address: "" });
                              requestProductSearchFocus();
                            } else {
                              setCustMode("existing");
                              setCustId("");
                              if (custMode === "new" && newCust.name) {
                                setCustSearch(newCust.name + (newCust.phone ? (" - " + newCust.phone) : ""));
                              }
                              focusCustomerPicker();
                            }
                          }}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                  <div className="erp-sale-field erp-sale-field-name">
                    {custMode === "walkin" ? (
                      <input type="text" className="erp-sale-cust-input" value="Walk-in Customer" disabled placeholder="Name" aria-label="Name" />
                    ) : (
                      <CustomerPicker
                        customers={state.customers}
                        value={custMode === "new" ? (newCust.name + (newCust.phone ? (" - " + newCust.phone) : "")) : custSearch}
                        selectedCustomerId={custId}
                        focusKey={custFocusKey}
                        onValueChange={function (nextValue) {
                          setCustMode("existing");
                          setCustSearch(nextValue);
                          setCustId("");
                          setNewCust({ name: "", phone: "", address: "" });
                        }}
                        onSelectCustomer={function (c) {
                          setCustMode("existing");
                          setCustId(c.id);
                          setCustSearch(c.name + (c.phone ? (" - " + c.phone) : ""));
                          setNewCust({ name: "", phone: "", address: "" });
                        }}
                        onCreateCustomer={savePosInlineCustomer}
                        onAfterSelect={focusPosSearch}
                        duplicateNameKeys={posDupNameKeys}
                        normalizeNameKey={normalizePaymentCustomerName}
                        C={C}
                        Input={Input}
                        Modal={Modal}
                        Btn={Btn}
                        compact={true}
                        placeholder="Name"
                      />
                    )}
                  </div>
                  <div className="erp-sale-field erp-sale-field-phone">
                    <input
                      type="text"
                      className="erp-sale-cust-input"
                      value={posDisplayPhone}
                      disabled={custMode !== "new"}
                      onChange={function (e) {
                        if (custMode === "new") setNewCust(function (x) { return Object.assign({}, x, { phone: e.target.value }); });
                      }}
                      placeholder="Phone"
                      aria-label="Phone"
                    />
                  </div>
                  <div className="erp-sale-field erp-sale-field-price">
                    <select
                      className={!priceLevel ? "erp-sale-select-empty" : ""}
                      value={priceLevel}
                      onChange={function (e) { setPriceLevel(e.target.value); }}
                      aria-label="Price Level"
                    >
                      <option value="">Price Level</option>
                      <option>Default Retail</option>
                      <option>Wholesale</option>
                      <option>Special</option>
                    </select>
                  </div>
                  <div className="erp-sale-field erp-sale-field-salesperson">
                    <select
                      className={!salesPerson ? "erp-sale-select-empty" : ""}
                      value={salesPerson}
                      onChange={function (e) { setSalesPerson(e.target.value); }}
                      aria-label="Sales Person"
                    >
                      <option value="">Sales Person</option>
                      <option>Default Sales Person</option>
                    </select>
                  </div>
                </div>

                <div className="erp-sale-product-bar">
                  <div className="erp-sale-product-search">
                    <span className="erp-sale-search-ico" aria-hidden="true">⌕</span>
                    <input
                      id="pos-product-search"
                      ref={searchRef}
                      value={search}
                      onChange={function (e) {
                        var val = e.target.value;
                        setSearch(val);
                        setShowRecentItems(false);
                        setPosDropIdx(-1);
                        if (searchRef.current) {
                          var r = searchRef.current.getBoundingClientRect();
                          setDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                        }
                      }}
                      onKeyDown={function (e) {
                        var list = filteredProds.slice(0, 10);
                        if (e.key === "ArrowDown") { e.preventDefault(); setPosDropIdx(function (i) { return Math.min(i + 1, list.length - 1); }); return; }
                        if (e.key === "ArrowUp") { e.preventDefault(); setPosDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                        if (e.key === "Enter") {
                          e.preventDefault();
                        }
                        if (e.key === "Enter" && list.length > 0) {
                          var pick = posDropIdx >= 0 ? list[posDropIdx] : (list.find(function (p) { return productMatchesSearchExact(p, search); }) || list[0]);
                          addToCart(pick); setPosDropIdx(-1);
                        }
                        if (e.key === "Escape") { setSearch(""); setDropPos(null); setPosDropIdx(-1); setShowRecentItems(false); }
                      }}
                      onFocus={function () {
                        if (searchRef.current) {
                          var r = searchRef.current.getBoundingClientRect();
                          setDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                        }
                      }}
                      onBlur={function () {
                        setTimeout(function () { setDropPos(null); setShowRecentItems(false); }, 180);
                      }}
                      className="erp-pos-search-input"
                      placeholder="Scan barcode or search product by name, code, category..."
                    />
                  </div>
                  <div className="erp-sale-product-actions">
                    <button type="button" className="erp-sale-outline-btn" onClick={function () { setShowRecentItems(false); focusPosSearch(); }}>Scan (F2)</button>
                    <button
                      type="button"
                      className="erp-sale-outline-btn"
                      onClick={function () {
                        setShowRecentItems(function (v) { return !v; });
                        setDropPos(null);
                      }}
                    >
                      Recent
                    </button>
                    <button type="button" className="erp-sale-outline-btn danger" disabled={!cart.length} onClick={clearCurrentCart}>Clear</button>
                  </div>
                </div>
                {showRecentItems ? (
                  <div className="erp-sale-recent-drop">
                    {recentPosProducts.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: 12, color: C.muted }}>No recent sale items yet</div>
                    ) : recentPosProducts.map(function (p) {
                      return (
                        <div
                          key={"recent-" + p.id}
                          className="erp-sale-recent-item"
                          onMouseDown={function (e) {
                            e.preventDefault();
                            addToCart(p);
                            setShowRecentItems(false);
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          <span style={{ color: C.accent, fontWeight: 700 }}>{getCurrencySymbol()} {fmtNum(p.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {isNetworkClientPos && (state.products || []).length === 0 ? (
                  <div className="erp-pos-inline-alert warn" style={{ marginTop: 8 }}>
                    No products synced from the main PC yet. On the <strong>main PC</strong>, open Settings → Network → <strong>Upload Shop Data to Server</strong>, then wait a few seconds.
                  </div>
                ) : null}
                {isNetworkClientPos && search && (state.products || []).length > 0 && filteredProds.length === 0 ? (
                  <div className="erp-pos-inline-alert info" style={{ marginTop: 8 }}>
                    No matching products. Try another search term or check stock on the main PC.
                  </div>
                ) : null}
                {search && filteredProds.length > 0 && dropPos ? (
                  <div className="erp-pos-dropdown" style={{ top: dropPos.top + 2, left: dropPos.left, width: dropPos.width }}>
                    <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid " + C.borderLight }}>
                      {filteredProds.length} product{filteredProds.length > 1 ? "s" : ""} found — Enter adds · then Price → Qty → Search
                    </div>
                    {filteredProds.slice(0, 10).map(function (p, pidx) {
                      var isService = isServiceProduct(p);
                      var oos = !isService && (p.stock || 0) === 0;
                      return (
                        <div key={p.id} onMouseDown={function (e) { e.preventDefault(); addToCart(p); setPosDropIdx(-1); }}
                          style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: posDropIdx === pidx ? C.accentSoft : "#fff", opacity: (oos && !isQuotationMode) ? 0.65 : 1 }}
                          onMouseEnter={function () { setPosDropIdx(pidx); }}
                          onMouseLeave={function () { setPosDropIdx(-1); }}>
                          <div>
                            <span style={{ fontWeight: 600, color: C.text }}>{p.name}</span>
                            {p.barcode && <span style={{ marginLeft: 8, fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{p.barcode}</span>}
                            {isService && <span className="erp-pos-badge service">SERVICE</span>}
                            {oos && <span className="erp-pos-badge oos">OUT OF STOCK</span>}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                            <span style={{ color: C.accent, fontWeight: 700 }}>{getCurrencySymbol()} {(isService && !(Number(p.price) > 0)) ? "—" : fmtNum(glassCartLayout && isGlassProduct(p, shopSettings) ? getGlassSellRatePerSqFt(p) : p.price)}{glassCartLayout && isGlassProduct(p, shopSettings) ? " / Sq Ft" : ""}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                </div>
              </div>
            </React.Fragment>
          ) : (
          <div className="erp-pos-entry-grid">
            <div className="erp-pos-entry-labels">
              <div className="erp-pos-field-label">Customer</div>
              <label className="erp-pos-field-label" htmlFor="pos-product-search">Add product</label>
            </div>

            <div className="erp-pos-entry-controls">
              <div className="erp-pos-seg-group erp-pos-cust-mode">
                {[["walkin", "Walk-in"], ["customer", "Customer"]].map(function (item) {
                  var v = item[0]; var l = item[1];
                  var active = v === "walkin" ? custMode === "walkin" : custMode !== "walkin";
                  return (
                    <button
                      type="button"
                      key={v}
                      className={"erp-pos-seg-btn" + (active ? " active" : "")}
                      onClick={function () {
                        if (v === "walkin") {
                          setCustMode("walkin");
                          setCustId("");
                          setCustSearch("");
                          setNewCust({ name: "", phone: "", address: "" });
                          requestProductSearchFocus();
                        } else {
                          setCustMode("existing");
                          setCustId("");
                          if (custMode === "new" && newCust.name) {
                            setCustSearch(newCust.name + (newCust.phone ? (" - " + newCust.phone) : ""));
                          }
                          focusCustomerPicker();
                        }
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>

              <div className="erp-pos-product-field">
                <div className="erp-pos-filter-bar">
                  {[
                    { id: "all", label: "All" },
                    { id: "service", label: "Service" },
                    { id: "stock", label: "Stock" },
                  ].map(function (f) {
                    var active = restaurantProductFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={"erp-pos-chip-btn" + (active ? " active" : "")}
                        onClick={function () { setRestaurantProductFilter(f.id); }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="pos-product-search"
                  ref={searchRef}
                  value={search}
                  onChange={function (e) {
                    var val = e.target.value;
                    setSearch(val);
                    setPosDropIdx(-1);
                    if (searchRef.current) {
                      var r = searchRef.current.getBoundingClientRect();
                      setDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                    }
                  }}
                  onKeyDown={function (e) {
                    var list = filteredProds.slice(0, 10);
                    if (e.key === "ArrowDown") { e.preventDefault(); setPosDropIdx(function (i) { return Math.min(i + 1, list.length - 1); }); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setPosDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                    if (e.key === "Enter") {
                      e.preventDefault();
                    }
                    if (e.key === "Enter" && list.length > 0) {
                      var pick = posDropIdx >= 0 ? list[posDropIdx] : (list.find(function (p) { return productMatchesSearchExact(p, search); }) || list[0]);
                      addToCart(pick); setPosDropIdx(-1);
                    }
                    if (e.key === "Escape") { setSearch(""); setDropPos(null); setPosDropIdx(-1); }
                  }}
                  onFocus={function () {
                    if (isRestaurantDineIn && selectedTableLocked) {
                      var nextFreeTable = restaurantTables.find(function (t) {
                        return t && t.id && getRestaurantTableComputedStatus(t.id, t.status) === "free";
                      });
                      if (nextFreeTable && nextFreeTable.id && nextFreeTable.id !== selectedTableId) {
                        handleRestaurantTablePick(nextFreeTable.id);
                        setRestaurantToast("Switched to free table " + getRestaurantTableDisplayName(nextFreeTable.id));
                      }
                    }
                    if (searchRef.current) {
                      var r = searchRef.current.getBoundingClientRect();
                      setDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                    }
                  }}
                  onBlur={function () {
                    setTimeout(function () { setDropPos(null); }, 180);
                  }}
                  className="erp-pos-search-input"
                  placeholder="Name, ID, barcode, category, or scan..."
                />
              </div>
            </div>

            {custMode !== "walkin" ? (
              <div className="erp-pos-entry-picker">
                <CustomerPicker
                  customers={state.customers}
                  value={custMode === "new" ? (newCust.name + (newCust.phone ? (" - " + newCust.phone) : "")) : custSearch}
                  selectedCustomerId={custId}
                  focusKey={custFocusKey}
                  onValueChange={function (nextValue) {
                    setCustMode("existing");
                    setCustSearch(nextValue);
                    setCustId("");
                    setNewCust({ name: "", phone: "", address: "" });
                  }}
                  onSelectCustomer={function (c) {
                    setCustMode("existing");
                    setCustId(c.id);
                    setCustSearch(c.name + (c.phone ? (" - " + c.phone) : ""));
                    setNewCust({ name: "", phone: "", address: "" });
                  }}
                  onCreateCustomer={savePosInlineCustomer}
                  onAfterSelect={focusPosSearch}
                  duplicateNameKeys={posDupNameKeys}
                  normalizeNameKey={normalizePaymentCustomerName}
                  C={C}
                  Input={Input}
                  Modal={Modal}
                  Btn={Btn}
                />
              </div>
            ) : null}

            {search && filteredProds.length > 0 && dropPos ? (
              <div className="erp-pos-dropdown" style={{ top: dropPos.top + 2, left: dropPos.left, width: dropPos.width }}>
                <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid " + C.borderLight }}>
                  {filteredProds.length} product{filteredProds.length > 1 ? "s" : ""} found — Enter adds · then Price → Qty → Search
                </div>
                {filteredProds.slice(0, 10).map(function (p, pidx) {
                  var isService = isServiceProduct(p);
                  var oos = !isService && (p.stock || 0) === 0;
                  return (
                    <div key={p.id} onMouseDown={function (e) { e.preventDefault(); if (selectedTableLocked) return; addToCart(p); setPosDropIdx(-1); }}
                      style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: posDropIdx === pidx ? C.accentSoft : "#fff", opacity: (oos && !isQuotationMode) ? 0.65 : 1 }}
                      onMouseEnter={function () { setPosDropIdx(pidx); }}
                      onMouseLeave={function () { setPosDropIdx(-1); }}>
                      <div>
                        <span style={{ fontWeight: 600, color: C.text }}>{p.name}</span>
                        {p.barcode && <span style={{ marginLeft: 8, fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{p.barcode}</span>}
                        {isService && <span className="erp-pos-badge service">SERVICE</span>}
                        {oos && <span className="erp-pos-badge oos">OUT OF STOCK</span>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <span style={{ color: C.accent, fontWeight: 700 }}>{getCurrencySymbol()} {(isService && !(Number(p.price) > 0)) ? "—" : fmtNum(glassCartLayout && isGlassProduct(p, shopSettings) ? getGlassSellRatePerSqFt(p) : p.price)}{glassCartLayout && isGlassProduct(p, shopSettings) ? " / Sq Ft" : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          )}
          {/* Cart — keyboard navigable like a spreadsheet */}
          <div className={"erp-pos-cart-area" + (!isRestaurant && cart.length === 0 ? " is-empty" : "")}>
          <div className={!isRestaurant ? "erp-sale-cart-scroll" : undefined}>
          {!isRestaurant && cart.length === 0 ? (
            <React.Fragment>
              <table className="erp-sale-table erp-sale-excel-table" style={{ width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col />
                  {posLineCommentsEnabled ? <col style={{ width: 150 }} /> : null}
                  <col style={{ width: 128 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 28 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="erp-sale-excel-th left">Item</th>
                    {posLineCommentsEnabled ? <th className="erp-sale-excel-th left">Note</th> : null}
                    <th className="erp-sale-excel-th ctr">Price</th>
                    <th className="erp-sale-excel-th ctr">Qty</th>
                    <th className="erp-sale-excel-th num">Total</th>
                    <th className="erp-sale-excel-th ctr"> </th>
                  </tr>
                </thead>
              </table>
              <div className="erp-pos-empty-cart">
                <div className="erp-sale-empty-ico" aria-hidden="true">🛒</div>
                <div className="erp-pos-empty-title">No items added</div>
                <div className="erp-pos-empty-sub">Scan or search products above to build the invoice</div>
              </div>
            </React.Fragment>
          ) : null}
          {cart.length > 0 && (
            <table className={!isRestaurant ? "erp-sale-excel-table" : undefined} style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 6, tableLayout: "fixed" }}>
              <colgroup>
                <col />
                {!isRestaurant && posLineCommentsEnabled && !glassCartLayout ? <col style={{ width: 150 }} /> : null}
                <col style={{ width: glassCartLayout ? 150 : 128 }} />
                <col style={{ width: glassCartLayout ? 240 : 72 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: isRestaurant ? 48 : 28 }} />
              </colgroup>
              <thead>
                <tr className="erp-sale-excel-head">
                  <th className="erp-sale-excel-th left">Item</th>
                  {!isRestaurant && posLineCommentsEnabled && !glassCartLayout ? <th className="erp-sale-excel-th left">Note</th> : null}
                  <th className="erp-sale-excel-th ctr">{glassCartLayout ? (cartMixedGlassLayout ? "Price" : "Rate / Sq Ft") : "Price"}</th>
                  <th className="erp-sale-excel-th ctr">{glassCartLayout && !cartMixedGlassLayout ? "W · H · Unit · Pcs" : (glassCartLayout ? "Qty / Cut" : "Qty")}</th>
                  <th className="erp-sale-excel-th num">Total</th>
                  <th className="erp-sale-excel-th ctr"> </th>
                </tr>
              </thead>
              <tbody>
                {cart.map(function (item, i) {
                  var prodRow = state.products.find(function (p) { return p.id === item.id; });
                  var saleU = item.saleUnit || item.unit || "Pcs";
                  var lineCost = item.isGlassLine && prodRow
                    ? getGlassCostPerSqFt(prodRow)
                    : (prodRow ? getPosCostPerSaleUnit(prodRow, saleU) : (item.cost || 0));
                  var showLineComment = !isRestaurant && !item.isGlassLine && posLineCommentsEnabled;
                  var unitForDetail = item.saleUnit || item.unit || "Pcs";
                  var prodForDetail = state.products.find(function (p) { return p.id === item.id; });
                  var unitRowsForDetail = prodForDetail ? getProductUnitRows(prodForDetail) : [];
                  var unitOptsForDetail = unitRowsForDetail.map(function (r) { return r.name; });
                  var hasSecondaryForDetail = unitOptsForDetail.length > 1;
                  var quickAmtsForDetail = getQuickAmounts(unitForDetail);
                  var baseUForDetail = unitRowsForDetail[0] && unitRowsForDetail[0].name ? unitRowsForDetail[0].name : "Pcs";
                  var fCurForDetail = prodForDetail ? factorForNamedUnit(prodForDetail, unitForDetail) : null;
                  var convHintForDetail = fCurForDetail != null && fCurForDetail > 1
                    ? "1 " + unitForDetail + " = " + (fCurForDetail % 1 === 0 ? fCurForDetail : parseFloat(fCurForDetail.toFixed(4))) + " " + baseUForDetail
                    : null;
                  var needsUnitExtras = !item.isGlassLine && (hasSecondaryForDetail || quickAmtsForDetail.length > 0 || !!convHintForDetail);
                  var isNewestRow = i === 0;
                  var hasDetailRow = item.isGlassLine || needsUnitExtras;
                  var cartQtyInputStyle = Object.assign({}, glassCartFieldStyle(C), { width: 52, maxWidth: "100%", margin: "0 auto", fontSize: 11, fontWeight: 700, height: 24, minHeight: 24, lineHeight: 1, padding: "0 4px" });
                  var stockLeftLabel = "";
                  var stockAfterLabel = "";
                  if (prodForDetail && !isRestaurant) {
                    stockLeftLabel = getBulkDisplayParts(prodForDetail)
                      ? fmtStockDual(prodForDetail)
                      : fmtStock(prodForDetail.stock || 0, prodForDetail.unit || "Pcs");
                    stockAfterLabel = fmtDualFromPcs(remainingPcsAfterCartForProduct(prodForDetail, cart, freeCart), prodForDetail);
                  }
                  var stockHint = stockLeftLabel
                    ? (stockLeftLabel + " left → " + stockAfterLabel + " after sale")
                    : "";
                  return (
                    <React.Fragment key={String(cartLineKey(item)) + "-" + i}>
                    <tr className={"erp-pos-cart-row" + (isNewestRow ? " newest" : "") + (hasDetailRow ? "" : " no-detail")}>
                      <td className="erp-sale-excel-td item">
                        <div className="erp-sale-cart-item" title={stockHint || undefined}>
                          <div className="erp-sale-cart-item-main">
                            <div className="erp-sale-cart-item-top">
                              <div className="erp-sale-cart-item-name">{item.name}</div>
                              {!isDecimalUnit(item.unit) && item.unit && item.unit !== "Pcs" ? (
                                <span className="erp-sale-cart-item-unit">{item.unit}</span>
                              ) : null}
                            </div>
                            {stockLeftLabel ? (
                              <div className="erp-sale-cart-stock">
                                <span>{stockLeftLabel} left</span>
                                <span className="erp-sale-cart-stock-sep">·</span>
                                <span>{stockAfterLabel} after sale</span>
                              </div>
                            ) : null}
                            {item.description ? <div className="erp-sale-cart-item-desc">{item.description}</div> : null}
                            {isRestaurant && (
                              <div className="erp-pos-cart-modifier-wrap">
                                <div className="erp-pos-cart-modifier-label">modifier</div>
                                <input
                                  type="text"
                                  className="erp-pos-cart-modifier-input"
                                  data-cartrow={i}
                                  data-cartcol="2"
                                  value={item.restaurantNote || ""}
                                  disabled={selectedTableLocked}
                                  onChange={function (e) { setCartItemRestaurantNote(cartLineKey(item), e.target.value); }}
                                  onKeyDown={function (e) { handleCartFieldKey(e, i, 2); }}
                                  placeholder="No onion / Extra spicy / Less sugar"
                                />
                              </div>
                            )}
                            {showLineComment && glassCartLayout ? (
                              <input
                                type="text"
                                className="erp-pos-cart-comment-input erp-sale-cart-comment"
                                data-cartrow={i}
                                data-cartcol="2"
                                value={item.comment || ""}
                                disabled={selectedTableLocked}
                                onChange={function (e) {
                                  var lk = cartLineKey(item);
                                  setCart(function (prev) {
                                    return prev.map(function (x) {
                                      if (cartLineKey(x) !== lk) return x;
                                      return Object.assign({}, x, { comment: e.target.value });
                                    });
                                  });
                                }}
                                onKeyDown={function (e) { handleCartFieldKey(e, i, 2); }}
                                placeholder="Serial / note…"
                                title={stockHint || "Serial / IMEI / note"}
                              />
                            ) : null}
                          </div>
                          {isNewestRow ? <span className="erp-pos-badge adding">New</span> : null}
                        </div>
                      </td>
                      {showLineComment && !glassCartLayout ? (
                        <td className="erp-sale-excel-td note">
                          <input
                            type="text"
                            className="erp-pos-cart-comment-input erp-sale-cart-comment"
                            data-cartrow={i}
                            data-cartcol="2"
                            value={item.comment || ""}
                            disabled={selectedTableLocked}
                            onChange={function (e) {
                              var lk = cartLineKey(item);
                              setCart(function (prev) {
                                return prev.map(function (x) {
                                  if (cartLineKey(x) !== lk) return x;
                                  return Object.assign({}, x, { comment: e.target.value });
                                });
                              });
                            }}
                            onKeyDown={function (e) { handleCartFieldKey(e, i, 2); }}
                            placeholder="Serial / note…"
                            title={stockHint || "Serial / IMEI / note"}
                          />
                        </td>
                      ) : null}
                      <td className="erp-sale-excel-td price">
                        {item.isGlassLine ? (
                        <GlassRateInput
                          C={C}
                          compact={true}
                          currencySymbol={getCurrencySymbol()}
                          unitNote={false}
                          belowCost={item.price < lineCost}
                          value={item.glassRatePerSqFt != null ? item.glassRatePerSqFt : (prodRow ? getGlassSellRatePerSqFt(prodRow) : item.price)}
                          disabled={selectedTableLocked}
                          dataProps={{ "data-cartrow": i, "data-cartcol": "0" }}
                          title={item.price < lineCost ? "Selling below cost! Cost: " + getCurrencySymbol() + " " + fmtNum(lineCost) + " per Sq Ft" : (getCurrencySymbol() + " per Sq Ft")}
                          onKeyDown={function (e) { handleCartFieldKey(e, i, 0); }}
                          onChange={function (v) {
                            var lk = cartLineKey(item);
                            setCart(function (prev) {
                              return prev.map(function (x) {
                                if (cartLineKey(x) !== lk) return x;
                                if (x.isGlassLine) {
                                  var pr = state.products.find(function (p) { return p.id === x.id; });
                                  return recalcGlassCartLine(Object.assign({}, x, {
                                    price: v,
                                    glassRatePerSqFt: v,
                                    customGlassRate: true,
                                    customPrice: true,
                                  }), pr);
                                }
                                return Object.assign({}, x, { price: v, customPrice: true });
                              });
                            });
                          }}
                        />
                        ) : (
                        <GlassRateInput
                          C={C}
                          compact={true}
                          currencySymbol={getCurrencySymbol()}
                          unitNote={false}
                          belowCost={item.price < lineCost}
                          value={item.price}
                          disabled={selectedTableLocked}
                          dataProps={{ "data-cartrow": i, "data-cartcol": "0" }}
                          title={item.price < lineCost ? "Selling below cost! Cost: " + getCurrencySymbol() + " " + fmtNum(lineCost) + (" per " + saleU) : ""}
                          onKeyDown={function (e) { handleCartFieldKey(e, i, 0); }}
                          onChange={function (v) {
                            var lk = cartLineKey(item);
                            setCart(function (prev) {
                              return prev.map(function (x) {
                                if (cartLineKey(x) !== lk) return x;
                                return Object.assign({}, x, { price: v, customPrice: true });
                              });
                            });
                          }}
                        />
                        )}
                      </td>
                      <td className="erp-sale-excel-td qty">
                        {item.isGlassLine ? (
                          <GlassCutFields
                            item={item}
                            product={prodRow}
                            C={C}
                            compact={true}
                            rowIndex={i}
                            onFieldKey={handleCartFieldKey}
                            disabled={selectedTableLocked}
                            onChange={function (next) { updateGlassCartItem(cartLineKey(item), next); }}
                          />
                        ) : (
                          <input
                            data-cartrow={i}
                            data-cartcol="1"
                            type="number"
                            min="0"
                            step={isDecimalUnit(unitForDetail) ? "0.001" : "1"}
                            value={item.qty}
                            disabled={selectedTableLocked}
                            onChange={function (e) {
                              var v = parseFloat(e.target.value);
                              updateQty(cartLineKey(item), isNaN(v) ? 0 : v);
                            }}
                            onFocus={function (e) { e.target.select(); }}
                            onKeyDown={function (e) { handleCartFieldKey(e, i, 1); }}
                            style={cartQtyInputStyle}
                            onFocusCapture={function (e) { e.target.style.border = "1px solid #1a4fa0"; e.target.style.background = "#f0f4ff"; }}
                            onBlur={function (e) { e.target.style.border = "1px solid #7a9fd4"; e.target.style.background = "#fff"; }}
                          />
                        )}
                      </td>
                      <td className="erp-sale-excel-td total">{getCurrencySymbol()} {fmtNum(posLineAmount(item))}</td>
                      <td className="erp-sale-excel-td actions">
                        {isRestaurant && (
                          <button
                            type="button"
                            className="erp-pos-cart-dup-btn"
                            disabled={selectedTableLocked}
                            onClick={function () { duplicateCartItem(cartLineKey(item)); }}
                            title="Duplicate item"
                          >
                            +
                          </button>
                        )}
                        <button
                          type="button"
                          className="erp-pos-cart-remove-btn"
                          disabled={selectedTableLocked}
                          onClick={function () { updateQty(cartLineKey(item), 0); }}
                          title="Remove item"
                          aria-label="Remove item"
                        >×</button>
                      </td>
                    </tr>
                    {hasDetailRow ? (
                      <tr className={"erp-pos-cart-detail-row" + (isNewestRow ? " newest" : "")}>
                        <td colSpan={(!isRestaurant && posLineCommentsEnabled && !glassCartLayout) ? 6 : 5} style={{ padding: "3px 8px 5px", verticalAlign: "top" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                            {item.price < lineCost && (
                              <div style={{ fontSize: 9, color: C.red, fontWeight: 700, alignSelf: "center" }}>Below cost</div>
                            )}
                            {item.isGlassLine ? (
                              <div style={{ flex: "1 1 260px" }}>
                                <GlassLineExtras
                                  item={item}
                                  product={prodRow}
                                  C={C}
                                  fmtNum={fmtNum}
                                  getCurrencySymbol={getCurrencySymbol}
                                  disabled={selectedTableLocked}
                                  onChange={function (next) { updateGlassCartItem(cartLineKey(item), next); }}
                                />
                              </div>
                            ) : null}
                            {needsUnitExtras ? (
                              <div style={{ flex: "1 1 280px" }}>
                                {hasSecondaryForDetail && (
                                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: C.textMd }}>Unit</span>
                                    <div className="erp-pos-unit-seg-bar">
                                      {unitOptsForDetail.map(function (uOpt) {
                                        var activeUnit = unitForDetail === uOpt;
                                        return (
                                          <button
                                            key={uOpt}
                                            type="button"
                                            className={"erp-pos-unit-seg-btn" + (activeUnit ? " active" : "")}
                                            onClick={function () {
                                              if (selectedTableLocked) return;
                                              setCart(function (prev) {
                                                return prev.map(function (x) {
                                                  if (cartLineKey(x) !== cartLineKey(item)) return x;
                                                  return Object.assign({}, x, {
                                                    saleUnit: uOpt,
                                                    price: getPosSellPricePerSaleUnit(prodForDetail, uOpt),
                                                    cost: getPosCostPerSaleUnit(prodForDetail, uOpt),
                                                    customPrice: false,
                                                  });
                                                });
                                              });
                                            }}
                                            disabled={selectedTableLocked}
                                          >
                                            {uOpt}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {unitRowsForDetail.filter(function (r) { return r.factor > 1; }).map(function (r) {
                                      return (
                                        <button
                                          key={"qb-d-" + r.name}
                                          type="button"
                                          className="erp-pos-qty-pack-btn"
                                          onClick={function () {
                                            if (selectedTableLocked) return;
                                            setCart(function (prev) {
                                              return prev.map(function (x) {
                                                if (cartLineKey(x) !== cartLineKey(item)) return x;
                                                var q = parseFloat(x.qty) || 0;
                                                return Object.assign({}, x, {
                                                  saleUnit: r.name,
                                                  qty: q + 1,
                                                  price: getPosSellPricePerSaleUnit(prodForDetail, r.name),
                                                  cost: getPosCostPerSaleUnit(prodForDetail, r.name),
                                                  customPrice: false,
                                                });
                                              });
                                            });
                                          }}
                                          disabled={selectedTableLocked}
                                        >
                                          +1 {r.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                {convHintForDetail && (
                                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{convHintForDetail}</div>
                                )}
                                {quickAmtsForDetail.length > 0 && !hasSecondaryForDetail && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
                                    {quickAmtsForDetail.map(function (qa) {
                                      var active = item.qty === qa.qty;
                                      return (
                                        <button key={qa.label} type="button" disabled={selectedTableLocked} className={"erp-pos-qty-quick-btn" + (active ? " active" : "")} onClick={function () { updateQty(cartLineKey(item), qa.qty); }}>{qa.label}</button>
                                      );
                                    })}
                                  </div>
                                )}
</div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {cart.length === 0 && isRestaurant && (
            <div className="erp-pos-empty-cart">
              <div className="erp-pos-empty-title">Cart is empty</div>
              <div className="erp-pos-empty-sub">Add items to start order</div>
            </div>
          )}
          </div>
          {!isRestaurant ? (
            <div className="erp-sale-cart-footer">
              <div className="erp-sale-summary-bar">
                <span className="erp-sale-summary-metric"><em>Items</em><strong>{cart.length}</strong></span>
                <span className="erp-sale-summary-metric"><em>Qty</em><strong>{fmtNum(cartTotalQty)}</strong></span>
                <span className="erp-sale-summary-metric"><em>Sub</em><strong>{getCurrencySymbol()} {fmtNum(subTotal)}</strong></span>
                <span className="erp-sale-summary-metric"><em>Disc</em><strong>{getCurrencySymbol()} {fmtNum(discAmt)}</strong></span>
                <span className="erp-sale-summary-metric"><em>Tax</em><strong>{getCurrencySymbol()} {fmtNum(posTotalTax)}</strong></span>
                <span className="erp-sale-summary-metric erp-sale-summary-bar-grand"><em>Total</em><strong>{getCurrencySymbol()} {fmtNum(total)}</strong></span>
              </div>
              {cart.length > 0 ? (
              <div className="erp-sale-terms-row">
                <div className="erp-sale-field">
                  <label>Terms</label>
                  <select value={paymentTerms} onChange={function (e) { setPaymentTerms(e.target.value); }}>
                    <option>Due on Receipt</option>
                    <option>Net 7</option>
                    <option>Net 15</option>
                    <option>Net 30</option>
                  </select>
                </div>
                <div className="erp-sale-field erp-sale-field-notes">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={isQuotationMode ? quotationNotes : saleNotes}
                    onChange={function (e) {
                      if (isQuotationMode) setQuotationNotes(e.target.value);
                      else setSaleNotes(e.target.value);
                    }}
                    placeholder="Invoice notes…"
                  />
                </div>
              </div>
              ) : null}
            </div>
          ) : null}
          </div>

          <div className="erp-sale-footer-stack">
        {!isRestaurant && !isQuotationMode && freeItemsEnabled && (
          <details className="erp-pos-secondary-panel erp-sale-free-details">
          <summary className="erp-sale-free-summary">
            Free items{freeCart.length > 0 ? (" (" + freeCart.length + ")") : ""}
          </summary>
          <Card>
            <div style={{ position: "relative", marginBottom: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 3 }}>Add Free Item</label>
              <input
                ref={freeSearchRef}
                value={freeSearch}
                disabled={!cart.length}
                onChange={function (e) {
                  var val = e.target.value;
                  setFreeSearch(val);
                  setFreeDropIdx(-1);
                  if (freeSearchRef.current) {
                    var r = freeSearchRef.current.getBoundingClientRect();
                    setFreeDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                  }
                }}
                onKeyDown={function (e) {
                  if (!cart.length) return;
                  var list = filteredFreeProds.slice(0, 10);
                  if (e.key === "ArrowDown") { e.preventDefault(); setFreeDropIdx(function (i) { return Math.min(i + 1, list.length - 1); }); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setFreeDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                  if (e.key === "Enter" && list.length > 0) {
                    var pick = freeDropIdx >= 0 ? list[freeDropIdx] : (list.find(function (p) { return productMatchesSearchExact(p, freeSearch); }) || list[0]);
                    addToFreeCart(pick); setFreeDropIdx(-1);
                    e.preventDefault();
                  }
                  if (e.key === "Escape") { setFreeSearch(""); setFreeDropPos(null); setFreeDropIdx(-1); }
                }}
                onFocus={function (e) {
                  e.target.style.borderColor = "#16a34a";
                  e.target.style.boxShadow = "0 0 0 3px rgba(22,163,74,0.12)";
                  if (freeSearchRef.current) {
                    var r = freeSearchRef.current.getBoundingClientRect();
                    setFreeDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                  }
                }}
                onBlur={function (e) {
                  e.target.style.borderColor = "#7a9fd4";
                  e.target.style.boxShadow = "none";
                  setTimeout(function () { setFreeDropPos(null); }, 180);
                }}
                placeholder={cart.length ? "Search product to add as free gift..." : "Add a paid item first"}
                style={{ border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "inherit", background: cart.length ? "#fff" : "#f8fafc", color: C.text, width: "100%", transition: "border-color .15s, box-shadow .15s", opacity: cart.length ? 1 : 0.7 }}
              />
              {freeSearch && filteredFreeProds.length > 0 && freeDropPos && cart.length > 0 && (
                <div className="erp-pos-dropdown" style={{ top: freeDropPos.top + 2, left: freeDropPos.left, width: freeDropPos.width, maxHeight: 220 }}>
                  {filteredFreeProds.slice(0, 10).map(function (p, pidx) {
                    var oos = (p.stock || 0) === 0 && !isServiceProduct(p);
                    return (
                      <div key={"free-" + p.id} onMouseDown={function (e) { e.preventDefault(); addToFreeCart(p); setFreeDropIdx(-1); }}
                        style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: freeDropIdx === pidx ? "#dcfce7" : "#fff", opacity: oos ? 0.65 : 1 }}
                        onMouseEnter={function () { setFreeDropIdx(pidx); }}
                      >
                        <span style={{ fontWeight: 600, color: C.text }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{getCurrencySymbol()} {fmtNum(getPosSellPricePerSaleUnit(p, p.unit || "Pcs"))} · {fmtStock(p.stock || 0, p.unit || "Pcs")}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {freeCart.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid " + C.border, color: C.muted, fontSize: 10, textTransform: "uppercase" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Product</th>
                    <th style={{ textAlign: "center", padding: "6px 8px", width: 90 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", width: 70 }}>Price</th>
                    <th style={{ padding: "6px 8px", width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {freeCart.map(function (item) {
                    var prodForUnit = state.products.find(function (p) { return p.id === item.id; });
                    var step = isDecimalUnit(item.saleUnit || item.unit || "Pcs") ? 0.5 : 1;
                    return (
                      <tr key={cartLineKey(item)} style={{ borderBottom: "1px solid " + C.borderLight }}>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <button type="button" className="erp-pos-qty-btn" onClick={function () { updateFreeQty(cartLineKey(item), Math.max(0, (Number(item.qty) || 0) - step)); }}>-</button>
                            <span style={{ minWidth: 36, textAlign: "center", fontWeight: 700 }}>{item.qty}</span>
                            <button type="button" className="erp-pos-qty-btn" onClick={function () { updateFreeQty(cartLineKey(item), (Number(item.qty) || 0) + step); }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: C.green }}>{FREE_ITEM_LABEL}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <button type="button" className="erp-pos-cart-remove-btn" onClick={function () { removeFreeLine(cartLineKey(item)); }}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0", color: C.muted, fontSize: 12 }}>{cart.length ? "No free items yet" : "Add paid items first, then add complimentary gifts here"}</div>
            )}
          </Card>
          </details>
        )}
        {!isRestaurant && !isQuotationMode && codSalesTrackEnabled && (
          <details className="erp-pos-secondary-panel erp-sale-free-details">
          <summary className="erp-sale-free-summary erp-sale-cod-summary">COD / Delivery track</summary>
          <Card>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!codTrack.trackInCod}
                disabled={!cart.length}
                onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { trackInCod: e.target.checked }); }); }}
              />
              Record in COD database
            </label>
            {codTrack.trackInCod ? (
              <div style={{ display: "grid", gap: 10 }}>
                {!codCustomerReady && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                    COD requires a customer with <strong>name and phone</strong>. Select <strong>Customer</strong> above — walk-in is not allowed for Cash on Delivery.
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Sale type</label>
                  <select
                    value={codTrack.saleType}
                    onChange={function (e) {
                      var v = e.target.value;
                      if (v === "COD" && !codCustomerReady) {
                        showAlert("Cash on Delivery (COD) requires a saved customer with name and phone number.\n\nSelect Customer above and choose or create a customer first.");
                        return;
                      }
                      setCodTrack(function (x) { return Object.assign({}, x, { saleType: v }); });
                    }}
                    style={{ width: "100%", border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}
                  >
                    {COD_SALE_TYPES.map(function (t) {
                      var codDisabled = t === "COD" && !codCustomerReady;
                      return <option key={t} value={t} disabled={codDisabled}>{t}{codDisabled ? " (customer required)" : ""}</option>;
                    })}
                  </select>
                </div>
                {(codTrack.saleType === "COD" || codTrack.saleType === "Direct Delivery") && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Customer address</label>
                    <input
                      value={codTrack.address}
                      onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }}
                      placeholder="Delivery address"
                      style={{ width: "100%", border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                )}
                {codTrack.saleType === "COD" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Tracking number</label>
                      <input
                        value={codTrack.trackingNumber}
                        onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { trackingNumber: e.target.value }); }); }}
                        placeholder="Courier tracking (optional)"
                        style={{ width: "100%", border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Alt phone (optional)</label>
                      <input
                        value={codTrack.altPhone}
                        onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { altPhone: e.target.value }); }); }}
                        placeholder="Second contact number"
                        style={{ width: "100%", border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                )}
                {(codTrack.saleType === "COD" || codTrack.saleType === "Direct Delivery") && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Courier / delivery cost ({getCurrencySymbol()})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={codTrack.courierCost}
                      onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { courierCost: e.target.value }); }); }}
                      placeholder="0"
                      style={{ width: "100%", maxWidth: 200, border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                )}
                {codTrack.saleType === "Direct Sale" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Reference / tracking (optional)</label>
                    <input
                      value={codTrack.trackingNumber}
                      onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { trackingNumber: e.target.value }); }); }}
                      placeholder="Internal reference if needed"
                      style={{ width: "100%", border: "1.5px solid #7a9fd4", borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "8px 0", color: C.muted, fontSize: 12 }}>
                {cart.length ? "Check the box above to track this sale in COD Database" : "Add items to the cart first"}
              </div>
            )}
          </Card>
          </details>
        )}
          </div>

        </Card>
        </div>
        {isRestaurant && (
          <div className="erp-pos-restaurant">
          <Card pad={0}>
            <div className="erp-pos-panel-hdr">
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Restaurant Workflow</div>
                <div className="erp-pos-panel-hdr-sub">Simple live table and order flow</div>
              </div>
              <button
                type="button"
                className="erp-pos-seg-btn"
                onClick={function () { setRestaurantWorkflowTab(restaurantWorkflowTab === "overview" ? "orders" : "overview"); }}
              >
                {restaurantWorkflowTab === "overview" ? "Recent Orders" : "Back to Workflow"}
              </button>
            </div>
            {(todayIngredientSummary || currentUserRole === "cashier") && (
              <div className="erp-pos-panel-body" style={{ paddingBottom: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {todayIngredientSummary && (
                  <span className={"erp-pos-rest-meta-chip" + (todayIngredientSummary.negativeCount > 0 ? " danger" : " warn")}>
                    {"Today's Ingredient Cost: "}{getCurrencySymbol()} {fmtNum(todayIngredientSummary.totalCost)}
                  </span>
                )}
                {currentUserRole === "cashier" && (
                  <span className="erp-pos-rest-meta-chip info">Billing Mode</span>
                )}
              </div>
            )}
            <div className="erp-pos-panel-body">
            {restaurantUndo && (
              <div className="erp-pos-inline-alert rest">
                <span>{restaurantUndo.msg}</span>
                <button
                  type="button"
                  className="erp-pos-seg-btn"
                  onClick={function () { setCart((restaurantUndo.cart || []).map(function (x) { return Object.assign({}, x); })); setRestaurantUndo(null); focusPosSearch(); }}
                >
                  Undo
                </button>
              </div>
            )}
            {restaurantWorkflowTab === "overview" && (
              <div style={{ display: "grid", gap: 12, alignItems: "start" }}>
                <div className="erp-pos-rest-order-panel">
                  <div className="erp-pos-rest-order-type-grid">
                    {[["dine-in", "Dine-In"], ["takeaway", "Takeaway"], ["delivery", "Delivery"]].map(function (row) {
                      var active = restaurantOrderType === row[0];
                      return (
                        <button
                          key={"simple-type-" + row[0]}
                          type="button"
                          className={"erp-pos-rest-type-btn" + (active ? " active" : "")}
                          onClick={function () { setRestaurantOrderType(row[0]); }}
                        >
                          {row[1]}
                        </button>
                      );
                    })}
                  </div>

                  {restaurantOrderType === "delivery" && (
                    <div className="erp-pos-rest-delivery-grid">
                      <input type="text" value={restaurantDeliveryDetails.name} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} placeholder="Customer name" />
                      <input type="text" value={restaurantDeliveryDetails.phone} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { phone: sanitizeRestaurantPhone(e.target.value) }); }); }} placeholder="Phone" />
                      <textarea value={restaurantDeliveryDetails.address} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} placeholder="Address" rows={2} />
                    </div>
                  )}

                  <input
                    type="text"
                    value={restaurantOrderNote}
                    onChange={function (e) { setRestaurantOrderNote(e.target.value); }}
                    placeholder="Order note (optional)"
                    style={{ width: "100%", boxSizing: "border-box", marginBottom: 10 }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                      type="button"
                      className="erp-pos-kitchen-btn primary"
                      onClick={sendToKitchen}
                      disabled={!cart.length || selectedTableLocked}
                    >
                      Send to Kitchen
                    </button>
                    <button
                      type="button"
                      className="erp-pos-kitchen-btn secondary"
                      onClick={clearCurrentCart}
                      disabled={!cart.length || selectedTableLocked}
                    >
                      Clear Cart
                    </button>
                  </div>
                </div>

                {restaurantOrderType === "dine-in" && (
                  <div className="erp-pos-rest-section">
                    <div className="erp-pos-rest-section-hdr">
                      <div>Table Selection</div>
                      <button
                        type="button"
                        className="erp-pos-seg-btn"
                        onClick={function () { setShowRestaurantTableManager(true); }}
                      >
                        Manage Tables
                      </button>
                    </div>

                    <select value={selectedTableId} onChange={function (e) { handleRestaurantTablePick(e.target.value); }} style={{ marginBottom: 8 }}>
                      {restaurantTables.map(function (t) {
                        var ts = restaurantTableStatusUi(getRestaurantTableComputedStatus(t.id, t.status));
                        var stat = tableOrderStats(t.id);
                        return (
                          <option key={"simple-sel-" + t.id} value={t.id}>
                            {(t.name || t.id) + " - " + ts.label + (stat.count ? (" - " + stat.count + " orders") : "")}
                          </option>
                        );
                      })}
                    </select>

                    <div className="erp-pos-rest-table-grid">
                      {restaurantTables.map(function (t) {
                        var tableState = getRestaurantTableComputedStatus(t.id, t.status);
                        var stat = tableOrderStats(t.id);
                        var active = selectedTableId === t.id;
                        var statusCls = tableState === "occupied" ? "status-occupied" : (tableState === "pending" ? "status-pending" : "status-free");
                        return (
                          <button
                            key={"simple-table-" + t.id}
                            type="button"
                            className={"erp-pos-table-btn " + statusCls + (active ? " active" : "")}
                            onClick={function () { handleRestaurantTablePick(t.id); }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{t.name || t.id}</div>
                            <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 2 }}>{tableState === "occupied" ? "Occupied" : (tableState === "pending" ? "Pending" : "Free")}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{stat.count ? (stat.count + " orders") : "No orders"}</div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedTableReopenOrder && !selectedTableLocked && (
                      <div className="erp-pos-rest-status-msg accent">
                        Loaded existing order ({(selectedTableReopenOrder.items || []).length} items)
                      </div>
                    )}
                    {!selectedTableReopenOrder && !selectedTableLocked && (
                      <div className="erp-pos-rest-status-msg muted">
                        Ready for new order
                      </div>
                    )}
                    {selectedTableLocked && (
                      <div className="erp-pos-rest-status-msg ok">
                        Order closed
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}            {restaurantWorkflowTab === "orders" && (
              <div className="erp-pos-rest-section">
                <div className="erp-pos-rest-section-hdr">Recent Orders</div>
                <div className="erp-settings-info-meta" style={{ marginBottom: 8 }}>Click any order to open the detailed view and manage billing or status.</div>
                <div className="erp-pos-order-list">
                  {restaurantOrders.length === 0 && (
                    <div className="erp-pos-rest-orders-empty">
                      No restaurant orders yet.
                    </div>
                  )}
                  {restaurantOrders.map(function (o) {
                    var orderTypeLabel = o.type === "takeaway" ? "Takeaway" : (o.type === "delivery" ? "Delivery" : "Dine-in");
                    return (
                      <button
                        key={"orders-tab-" + o.id}
                        type="button"
                        className="erp-pos-order-card"
                        onClick={function () { setRestaurantOrderDetailId(o.id); }}
                      >
                        <div className="erp-pos-order-card-hdr">
                          <div className="erp-pos-order-card-title">{o.tableId ? getRestaurantTableDisplayName(o.tableId) : orderTypeLabel}</div>
                          <span className={"erp-pos-status-pill " + restaurantStatusClass(o.status)}>{restaurantStatusLabel(o.status)}</span>
                        </div>
                        <div className="erp-pos-order-card-meta">{orderTypeLabel} - {(o.items || []).length} items</div>
                        <div className="erp-pos-order-card-by">By: {o.createdBy || "Staff"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          </Card>
          </div>
        )}
      </div>

      {/* Right panel — checkout sidebar */}
      <div className="erp-pos-right">
        <div className="erp-pos-checkout-panel">
        {/* Legacy restaurant sidebar replaced by erp-pos-restaurant workflow above */}
        <div className="erp-sale-checkout">
          <div className="erp-sale-checkout-hdr">{isQuotationMode ? "Quotation" : "Checkout"}</div>
          <div className="erp-sale-checkout-body">
            <div className="erp-sale-disc-row">
              <div className="erp-sale-field">
                <label>Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPct}
                  onChange={function (e) { applyDiscountPercent(e.target.value); }}
                  placeholder="0"
                />
              </div>
              <div className="erp-sale-field">
                <label>Discount ({getCurrencySymbol()})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={function (e) { applyDiscountAmount(e.target.value); }}
                  onBlur={function () {
                    if (discount === "" || discount === null || discount === undefined) { setDiscount(""); setDiscountPct(""); return; }
                    var cleaned = normalizeDiscountNumber(discount);
                    applyDiscountAmount(String(cleaned));
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="erp-sale-checkout-totals">
              <div className="erp-pos-total-row"><span>Sub Total</span><span>{getCurrencySymbol()} {fmtNum(subTotal)}</span></div>
              {discAmt > 0 && <div className="erp-pos-total-row" style={{ color: C.red }}><span>Discount</span><span>- {getCurrencySymbol()} {fmtNum(discAmt)}</span></div>}
              {state.settings && state.settings.taxEnabled && posTaxLines && posTaxLines.length > 0 && posTaxLines.map(function (tl, ti) {
                return (
                  <div key={"ptx-" + ti + "-" + (tl.name || "")} className="erp-pos-total-row" style={{ fontSize: 11, color: C.muted }}>
                    <span>{tl.name} ({fmtNum(tl.rate)}%)</span>
                    <span>{getCurrencySymbol()} {fmtNum(tl.amount)}</span>
                  </div>
                );
              })}
              {state.settings && state.settings.taxEnabled && posTotalTax > 0 && (
                <div className="erp-pos-total-row" style={{ fontWeight: 700 }}><span>Tax</span><span>{getCurrencySymbol()} {fmtNum(posTotalTax)}</span></div>
              )}
              <div className="erp-pos-total-row grand"><span>Grand Total</span><span>{getCurrencySymbol()} {fmtNum(total)}</span></div>
            </div>

            {isQuotationMode ? (
              <React.Fragment>
                <div className="erp-sale-action-stack">
                  <button type="button" className="erp-sale-action-btn print" disabled={!cart.length || isSavingQuotation || !canEditInvoices} onClick={openQuotationPrintPicker} title="Save & Print (F5)">
                    {isSavingQuotation ? "Saving..." : (<><span>Save & Print</span><kbd>F5</kbd></>)}
                  </button>
                  <button type="button" className="erp-sale-action-btn save" disabled={!cart.length || isSavingQuotation || !canEditInvoices} onClick={function () { saveQuotation(false); }} title={editingQuotationId ? "Update Quotation (F6)" : "Save Only (F6)"}>
                    {isSavingQuotation ? "Saving..." : (<><span>{editingQuotationId ? "Update" : "Save Only"}</span><kbd>F6</kbd></>)}
                  </button>
                  <button type="button" className="erp-sale-action-btn preview" disabled={!cart.length} onClick={openQuotationPreviewPicker} title="Print View (F7)">
                    <span>Print View</span><kbd>F7</kbd>
                  </button>
                  <button
                    type="button"
                    className="erp-sale-action-btn wa"
                    disabled={!cart.length || isSavingQuotation || !canEditInvoices}
                    onClick={openQuotationWhatsApp}
                    title="WhatsApp / Share (F8)"
                  >
                    {isSavingQuotation ? "Saving..." : (<><span>WhatsApp</span><kbd>F8</kbd></>)}
                  </button>
                  <button
                    type="button"
                    className="erp-sale-action-btn hold"
                    disabled={!cart.length}
                    onClick={holdCurrentCart}
                    title="Hold Quotation (F9)"
                  >
                    <span>Hold</span><kbd>F9</kbd>
                  </button>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                  Saved quotations appear under <strong>Invoices → Quotations</strong>.
                </div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="erp-pos-pay-meta">
                  <div className="erp-pos-field-label">Payment mode</div>
                  <div className={"erp-pos-pay-status " + (payStatus === "Paid" ? "paid" : payStatus === "Partial" ? "partial" : "unpaid")}>
                    {payStatus === "Paid" ? "Fully Paid" : payStatus === "Partial" ? "Partial" : "Unpaid"}
                  </div>
                </div>

                <div>
                  <div className="erp-pos-field-label" style={{ marginBottom: 4 }}>Receive via</div>
                  <div className="erp-sale-pay-methods">
                    {[["Cash", "Cash"], ["Card", "Card"], ["Cheque", "Cheque"], ["Bank", "Bank Transfer"]].map(function (row) {
                      var method = row[0];
                      var label = row[1];
                      var active = posCashMethod === method && !(posSplitRows && posSplitRows.length > 0);
                      return (
                        <button
                          key={method}
                          type="button"
                          className={"erp-sale-pay-method" + (active ? " active" : "")}
                          disabled={posSetupBlocked || isCheckingOut}
                          onClick={function () { selectPosPayMethod(method); }}
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
                    disabled={posSetupBlocked || isCheckingOut || !cart.length}
                    title={posSplitRows && posSplitRows.length > 0 ? "Edit Split Payment (F4)" : "Split Payment (F4)"}
                    onClick={function () { if (posSetupBlocked || isCheckingOut || !cart.length) return; setPosSplitModal(true); setPayMode("partial"); }}
                  >
                    <span>{posSplitRows && posSplitRows.length > 0 ? "Edit Split" : "Split Payment"}</span>
                    <kbd>F4</kbd>
                  </button>
                </div>
                </div>

                {posSplitRows && posSplitRows.length > 0 ? (
                  <div className="erp-pos-split-panel" style={{ opacity: posSetupBlocked || isCheckingOut ? 0.55 : 1, cursor: posSetupBlocked || isCheckingOut ? "not-allowed" : "default" }} onClick={function () { if (posSetupBlocked || isCheckingOut) return; setPosSplitModal(true); }}>
                    {posSplitRows.map(function (r, i) {
                      return <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.textMd }}>{r.method}</span><strong style={{ color: r.method === "Cheque" ? "#d97706" : C.green }}>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}</strong></div>;
                    })}
                  </div>
                ) : null}

                {posCashMethod === "Cheque" && posChequeList.length > 0 && (
                  <div className="erp-pos-cheque-panel" onClick={function () { setPosChqModal(true); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>{posChequeList.length} cheque(s) added</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed" }}>{getCurrencySymbol()} {fmtNum(posChequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0))}</span>
                    </div>
                  </div>
                )}

                <div className="erp-sale-paid-grid">
                  <div className="erp-sale-field">
                    <label>Paid Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={posSplitRows && posSplitRows.length > 0 ? paidNum : (payMode === "full" ? total : paidAmt)}
                      disabled={!!(posSplitRows && posSplitRows.length > 0) || posSetupBlocked || isCheckingOut}
                      onChange={function (e) {
                        setPayMode("partial");
                        setPaidAmt(e.target.value);
                      }}
                      onFocus={function () {
                        if (payMode === "full") {
                          setPayMode("partial");
                          setPaidAmt(String(total));
                        }
                      }}
                    />
                  </div>
                  <div className="erp-sale-field">
                    <label>Balance</label>
                    <input type="text" value={getCurrencySymbol() + " " + fmtNum(Math.max(0, balanceDue))} disabled />
                  </div>
                </div>

                <label
                  className={
                    "erp-pos-warranty-label"
                    + (includeWarranty && state.settings.warrantyEnabled ? " active" : "")
                    + (!state.settings.warrantyEnabled ? " is-disabled" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={includeWarranty}
                    disabled={!state.settings.warrantyEnabled}
                    onChange={function (e) { setIncludeWarranty(e.target.checked); }}
                  />
                  <span className="erp-pos-warranty-text">
                    <span className="erp-pos-warranty-title">Include Warranty Policy</span>
                    {!state.settings.warrantyEnabled ? (
                      <span className="erp-pos-warranty-hint">Disabled in Settings</span>
                    ) : null}
                  </span>
                </label>

                {(function () {
                  var checkoutDisabled = !cart.length || posSetupBlocked || isCheckingOut;
                  var checkoutTitle = posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : undefined;
                  var waTitle = posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : "WhatsApp / Share (F8)";
                  return (
                    <div className="erp-sale-action-stack">
                      <button type="button" className="erp-sale-action-btn print" disabled={checkoutDisabled} aria-describedby={posCheckoutAriaDesc} title={checkoutTitle || "Save & Print (F5)"} onClick={openPosPrintPicker}>
                        {isCheckingOut ? "Processing..." : (<><span>Save & Print</span><kbd>F5</kbd></>)}
                      </button>
                      <button type="button" className="erp-sale-action-btn save" disabled={checkoutDisabled} aria-describedby={posCheckoutAriaDesc} title={checkoutTitle || "Save Only (F6)"} onClick={function () { saveAndFinish(false); }}>
                        {isCheckingOut ? "Processing..." : (<><span>Save Only</span><kbd>F6</kbd></>)}
                      </button>
                      <button type="button" className="erp-sale-action-btn preview" disabled={!cart.length} onClick={openPosPreviewPicker} title="Print View (F7) — view layout without saving">
                        <span>Print View</span><kbd>F7</kbd>
                      </button>
                      <button
                        type="button"
                        className="erp-sale-action-btn wa"
                        disabled={checkoutDisabled}
                        aria-describedby={posCheckoutAriaDesc}
                        title={waTitle}
                        onClick={saveAndWhatsApp}
                      >
                        {isCheckingOut ? "Processing..." : (<><span>WhatsApp</span><kbd>F8</kbd></>)}
                      </button>
                      <button
                        type="button"
                        className="erp-sale-action-btn hold"
                        disabled={!cart.length}
                        onClick={holdCurrentCart}
                        title="Hold Invoice (F9)"
                      >
                        <span>Hold</span><kbd>F9</kbd>
                      </button>
                    </div>
                  );
                })()}
                {(posSetupBlocked || isCheckingOut) && (
                  <div id={posCheckoutHintId} role="status" aria-live="polite" style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                    {isCheckingOut ? "Processing..." : TC_SETUP_DISABLE_TITLE}
                  </div>
                )}
              </React.Fragment>
            )}
          </div>
        </div>

        {/* On Hold — count only; full list opens in modal */}
        {heldInvoices.length > 0 ? (
          <button
            type="button"
            className="erp-sale-hold-trigger"
            onClick={function () { setShowHoldModal(true); }}
            title="View all on-hold sales and quotations"
          >
            <span className="erp-sale-hold-trigger-ico" aria-hidden="true">⏸</span>
            <span className="erp-sale-hold-trigger-text">
              <span className="erp-sale-hold-trigger-label">On Hold</span>
              <span className="erp-sale-hold-trigger-sub">{heldInvoices.length} saved — click to view</span>
            </span>
            <span className="erp-pos-held-count" aria-label={heldInvoices.length + " on hold"}>{heldInvoices.length}</span>
          </button>
        ) : null}
        </div>
      </div>

    </form>
    </div>

      {showHoldModal ? (
        <Modal
          className="erp-hold-list-modal"
          title={"On Hold (" + heldInvoices.length + ")"}
          medium
          closeRound
          onClose={function () { setShowHoldModal(false); }}
        >
          <p className="erp-hold-list-modal-hint">These sales and quotations are saved on hold. Continue to load one into the cart, or delete to remove it.</p>
          <div className="erp-hold-list-modal-body">
            {heldInvoices.length === 0 ? (
              <div className="erp-hold-list-empty">No held sales or quotations.</div>
            ) : heldInvoices.map(function (h) {
              var hTime = h.heldAt ? new Date(h.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
              var hDate = h.heldAt ? new Date(h.heldAt).toLocaleDateString() : "";
              var cartCount = (h.cart || []).length + ((h.freeCart || []).length);
              var cartTotal = (h.cart || []).reduce(function (a, it) { return a + posLineAmount(it); }, 0) - (parseFloat(h.discount) || 0);
              var custLabel = h.label || h.custSearch || (h.custMode === "walkin" ? "Walk-in" : h.newCust && h.newCust.name ? h.newCust.name : "Walk-in");
              var isQuotHold = h.holdKind === "quotation" || h.posPageTab === "quotation";
              var docNo = isQuotHold ? (h.quotationNo || "") : (h.invoiceNo || "");
              return (
                <div key={h.id} className="erp-pos-held-row erp-hold-list-row">
                  <div className="erp-sale-hold-info">
                    <div className="erp-sale-hold-name-row">
                      <span className="erp-sale-hold-name">{custLabel}</span>
                      <span className={"erp-pos-held-pill " + (isQuotHold ? "quot" : "sale")}>{isQuotHold ? "Quotation" : "Sale"}</span>
                      {activeHeldId === h.id ? <span className="erp-pos-held-pill active">Active</span> : null}
                    </div>
                    <div className="erp-sale-hold-meta">
                      {docNo ? <span className="erp-sale-hold-doc">{docNo}</span> : null}
                      {cartCount} item{cartCount !== 1 ? "s" : ""} · {getCurrencySymbol()} {fmtNum(cartTotal)} · {hDate} {hTime}
                    </div>
                  </div>
                  <div className="erp-sale-hold-actions">
                    <button
                      type="button"
                      className="erp-sale-hold-btn continue"
                      onClick={function () {
                        var go = function () {
                          loadHeldInvoice(h);
                          setShowHoldModal(false);
                        };
                        if (cart.length > 0 || freeCart.length > 0) {
                          showConfirm("Loading this held " + (isQuotHold ? "quotation" : "invoice") + " will replace your current cart. Continue?", go);
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
                        showConfirm("Delete this held " + (isQuotHold ? "quotation" : "invoice") + "?", function () {
                          var remaining = heldInvoices.length - 1;
                          deleteHeldInvoice(h.id);
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
      ) : null}

      {/* ?? POS Split Payment Modal ?? */}
      {posSplitModal && cart.length > 0 && (
        <SplitPaymentModal
          title={"Split Payment - Invoice " + invoiceNo}
          invoiceTotal={total}
          alreadyPaid={paidNum}
          isSale={true}
          onSave={function (splits) {
            setPosSplitRows(splits);
            var totalAll = splits.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
            if (totalAll >= total) { setPayMode("full"); }
            else if (totalAll > 0) { setPayMode("partial"); }
            setPosSplitModal(false);
          }}
          onClose={function () { setPosSplitModal(false); }}
        />
      )}

      {/* POS Cheque Modal — compact rounded (matches Sales / split-pay UI) */}
      {posChqModal && (
        <Modal
          className="erp-pos-chq-modal"
          title="Cheques to Receive — Add Payment Cheques"
          onClose={function () { setPosChequeList([]); setPosChqForm({ no: "", bank: "", amount: "", due: today() }); setPosCashMethod("Cash"); setPosChqModal(false); }}
          medium
          closeRound
        >
          <div className="erp-pos-chq">
            <p className="erp-pos-chq-hint">
              Add one or more cheques. Each cheque will be tracked separately in the Cheque Register and marked Cleared when received.
            </p>
            <div className="erp-pos-chq-panel">
              <div className="erp-pos-chq-panel-title">Add Cheque</div>
              <div className="erp-pos-chq-form-row">
                <Input compact label="Cheque No *" value={posChqForm.no} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { no: e.target.value }); }); }} placeholder="e.g. 001234" />
                <Input compact label="Bank Name" value={posChqForm.bank} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { bank: e.target.value }); }); }} placeholder="e.g. HNB" />
                <Input compact label="Amount (Rs) *" type="number" value={posChqForm.amount} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} placeholder="0" />
                <Input compact label="Due Date *" type="date" value={posChqForm.due} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { due: e.target.value }); }); }} />
              </div>
              <button
                type="button"
                className="erp-pos-chq-add-btn"
                onClick={function () {
                  if (!posChqForm.no.trim() || !parseFloat(posChqForm.amount)) { showAlert("Enter cheque number and amount."); return; }
                  var addAmt = parseFloat(posChqForm.amount) || 0;
                  var existingSum = (posChequeList || []).reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0);
                  if (existingSum + addAmt > total + 0.009) {
                    showAlert("Cheque total would exceed invoice amount (" + getCurrencySymbol() + " " + fmtNum(total) + ").");
                    return;
                  }
                  setPosChequeList(function (l) { return l.concat([Object.assign({}, posChqForm, { id: uid() })]); });
                  setPosChqForm({ no: "", bank: "", amount: "", due: today() });
                }}
              >
                + Add Cheque
              </button>
            </div>
            {posChequeList.length > 0 ? (
              <div className="erp-pos-chq-list-wrap">
                <div className="erp-pos-chq-list-label">Added Cheques</div>
                <div className="erp-pos-chq-list">
                  {posChequeList.map(function (c, i) {
                    return (
                      <div key={c.id} className="erp-pos-chq-row">
                        <span className="erp-pos-chq-row-ico" aria-hidden="true">{UI.cheque}</span>
                        <div className="erp-pos-chq-row-main">
                          <div className="erp-pos-chq-row-no">#{c.no}</div>
                          {c.bank ? <div className="erp-pos-chq-row-bank">{c.bank}</div> : null}
                        </div>
                        <div className="erp-pos-chq-row-amt">
                          <div className="erp-pos-chq-row-val">{getCurrencySymbol()} {fmtNum(parseFloat(c.amount) || 0)}</div>
                          <div className="erp-pos-chq-row-due">Due: {c.due}</div>
                        </div>
                        <button
                          type="button"
                          className="erp-pos-chq-remove"
                          onClick={function () { setPosChequeList(function (l) { return l.filter(function (_, j) { return j !== i; }); }); }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="erp-pos-chq-total">
                  <span>{posChequeList.length} cheque(s) total</span>
                  <strong>{getCurrencySymbol()} {fmtNum(posChequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0))}</strong>
                </div>
              </div>
            ) : (
              <div className="erp-pos-chq-empty">
                No cheques added yet. Use the form above to add cheques.
              </div>
            )}
            <div className="erp-pos-chq-footer">
              <Btn col="gray" onClick={function () { setPosChequeList([]); setPosCashMethod("Cash"); setPosChqModal(false); }}>Cancel</Btn>
              <Btn col="blue" onClick={function () { setPosChqModal(false); }} disabled={posChequeList.length === 0}>Done — {posChequeList.length} cheque(s) saved</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Universal print preview modal (Sales / Quotation — same chrome as Reports) */}
      {pendingPrint && !waPendingRef.current ? (function () {
        var sale = pendingPrint.sale || {};
        var isQuot = pendingPrint.kind === "quotation";
        var isThermal = pendingPrint.mode === "thermal" || pendingPrint.mode === "thermal58" || pendingPrint.mode === "thermal80";
        var docNo = sale.invoiceNo || String(sale.id || "").slice(0, 8);
        return (
          <UniversalPrintPreview
            open
            badge={isQuot ? "QT" : "INV"}
            kicker="Print preview"
            title={(isQuot ? "Quotation " : "Invoice ") + docNo}
            subtitle={(sale.customerName || sale.customer || "Walk-in") + (sale.date ? (" · " + fmtDate(sale.date)) : "")}
            filename={(isQuot ? "Quotation-" : "Invoice-") + docNo}
            settings={pendingPrint.settings || state.settings}
            WABtn={WABtn}
            showAlert={showAlert}
            shareViaWhatsApp={shareViaWhatsApp}
            PRINT_FONT_LINK={PRINT_FONT_LINK}
            escapeHtml={escapeHtml}
            openPrintWindow={openPrintWindow}
            waPhone={sale.customerPhone || ""}
            showFormats
            format={pendingPrint.mode || "a4"}
            onFormatChange={function (fmt) {
              setPendingPrint(function (prev) {
                if (!prev) return prev;
                return Object.assign({}, prev, { mode: fmt });
              });
            }}
            showWarranty={!isQuot}
            warranty={!!pendingPrint.warranty}
            warrantyDisabled={(pendingPrint.settings || state.settings || {}).warrantyEnabled === false}
            onWarrantyChange={function (on) {
              setPendingPrint(function (prev) {
                if (!prev) return prev;
                return Object.assign({}, prev, { warranty: on });
              });
            }}
            previewElId="pos-print-preview"
            onClose={function () { setPendingPrint(null); }}
          >
            {isThermal
              ? <InvoiceThermal inv={Object.assign({}, sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} width={pendingPrint.mode === "thermal58" ? 218 : 302} documentKind={isQuot ? "quotation" : "invoice"} />
              : <InvoiceA4 inv={Object.assign({}, sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} size={pendingPrint.mode || "a4"} documentKind={isQuot ? "quotation" : "invoice"} />
            }
          </UniversalPrintPreview>
        );
      })() : null}

      {/* Hidden off-screen capture for WhatsApp share path only */}
      {pendingPrint && waPendingRef.current ? (
        <div id="pos-print-preview" style={{ position: "fixed", left: -9999, top: -9999, width: (pendingPrint.mode === "thermal58") ? 230 : (pendingPrint.mode === "thermal80" || pendingPrint.mode === "thermal") ? 310 : 794, pointerEvents: "none", opacity: 0 }}>
          {(pendingPrint.mode === "thermal" || pendingPrint.mode === "thermal58" || pendingPrint.mode === "thermal80")
            ? <InvoiceThermal inv={Object.assign({}, pendingPrint.sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} width={pendingPrint.mode === "thermal58" ? 218 : 302} documentKind={pendingPrint.kind === "quotation" ? "quotation" : "invoice"} />
            : <InvoiceA4 inv={Object.assign({}, pendingPrint.sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} size={pendingPrint.mode || "a4"} documentKind={pendingPrint.kind === "quotation" ? "quotation" : "invoice"} />
          }
        </div>
      ) : null}

      {waSharePicker && (
        <Modal title={waSharePickerKind === "quotation" ? "Share Quotation via WhatsApp" : "Share Invoice via WhatsApp"} onClose={function () { setWaSharePicker(false); }} compact>
          {(function () {
            var opts = buildPrintFmtOptions(state.settings);
            var docWord = waSharePickerKind === "quotation" ? "quotation" : "invoice";
            return (
              <div className="erp-sale-picker">
                <div className="erp-sale-picker-hint">Choose which {docWord} format to share on WhatsApp.</div>
                {opts.map(function (item, idx) {
                  var id = item[0];
                  var lbl = item[1];
                  var isPrimary = idx === 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={"erp-sale-picker-btn" + (isPrimary ? " primary" : " secondary")}
                      onClick={function () {
                        if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode(id);
                        else saveAndWhatsAppWithMode(id);
                      }}
                    >
                      <span className="erp-sale-picker-label">{lbl} PDF</span>
                      <span className="erp-sale-picker-key">{idx + 1}</span>
                    </button>
                  );
                })}
                <button type="button" className="erp-sale-picker-btn cancel" onClick={function () { setWaSharePicker(false); }}>
                  <span className="erp-sale-picker-label">Cancel</span>
                  <span className="erp-sale-picker-key">Esc</span>
                </button>
              </div>
            );
          })()}
        </Modal>
      )}

      {posPrintPicker && (
        <Modal
          title={posPrintPickerIntent === "preview"
            ? (posPrintPickerKind === "quotation" ? "Preview Quotation" : "Preview Invoice")
            : (posPrintPickerKind === "quotation" ? "Print Quotation" : "Print Invoice")}
          onClose={function () { setPosPrintPicker(false); }}
          compact
        >
          {(function () {
            var opts = buildPrintFmtOptions(state.settings);
            var isPreview = posPrintPickerIntent === "preview";
            var docWord = posPrintPickerKind === "quotation" ? "quotation" : "invoice";
            return (
              <div className="erp-sale-picker">
                <div className="erp-sale-picker-hint">
                  {isPreview
                    ? "Choose format to preview. Nothing will be saved."
                    : "Choose printer paper size for this " + docWord + "."}
                </div>
                {opts.map(function (item, idx) {
                  var id = item[0];
                  var lbl = item[1];
                  var isPrimary = idx === 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={"erp-sale-picker-btn" + (isPrimary ? " primary" : " secondary")}
                      onClick={function () { saveAndPrintWithMode(id); }}
                    >
                      <span className="erp-sale-picker-label">{isPreview ? (lbl + " Preview") : (lbl + " Print")}</span>
                      <span className="erp-sale-picker-key">{idx + 1}</span>
                    </button>
                  );
                })}
                <button type="button" className="erp-sale-picker-btn cancel" onClick={function () { setPosPrintPicker(false); }}>
                  <span className="erp-sale-picker-label">Cancel</span>
                  <span className="erp-sale-picker-key">Esc</span>
                </button>
              </div>
            );
          })()}
        </Modal>
      )}
    {isRestaurant && selectedRestaurantOrderDetail && (
      <Modal title={"Order Details - " + (selectedRestaurantOrderDetail.tableId ? getRestaurantTableDisplayName(selectedRestaurantOrderDetail.tableId) : (selectedRestaurantOrderDetail.type === "takeaway" ? "Takeaway" : (selectedRestaurantOrderDetail.type === "delivery" ? "Delivery" : "Dine-in")))} onClose={function () { setRestaurantOrderDetailId(""); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="erp-pos-order-detail-hdr">
            <div className="erp-pos-order-detail-title">
              {(selectedRestaurantOrderDetail.type === "takeaway" ? "Takeaway" : (selectedRestaurantOrderDetail.type === "delivery" ? "Delivery" : "Dine-in"))}
              {selectedRestaurantOrderDetail.createdBy ? (" - By: " + selectedRestaurantOrderDetail.createdBy) : ""}
            </div>
            <span className={"erp-pos-status-pill " + restaurantStatusClass(selectedRestaurantOrderDetail.status)}>
              {restaurantStatusLabel(selectedRestaurantOrderDetail.status)}
            </span>
          </div>
          <div className="erp-pos-order-detail-list">
            {(selectedRestaurantOrderDetail.items || []).map(function (it, idx) {
              return (
                <div key={"detail-item-" + idx} className="erp-pos-order-detail-item">
                  <div className="erp-pos-order-detail-item-name">{it.name}</div>
                  <div className="erp-pos-order-detail-item-meta">
                    Qty: {it.qty} {it.saleUnit || "Pcs"} - Price: {getCurrencySymbol()} {fmtNum(Number(it.price) || 0)}
                  </div>
                  {it.note && <div className="erp-pos-order-detail-item-note">Note: {it.note}</div>}
                </div>
              );
            })}
          </div>
          {selectedRestaurantOrderDetail.note && (
            <div className="erp-panel-box-muted">
              Note: {selectedRestaurantOrderDetail.note}
            </div>
          )}
          {selectedRestaurantOrderDetail.type === "delivery" && selectedRestaurantOrderDetail.deliveryDetails && (
            <div className="erp-panel-box-muted">
              {selectedRestaurantOrderDetail.deliveryDetails.name && <div>Name: {selectedRestaurantOrderDetail.deliveryDetails.name}</div>}
              {selectedRestaurantOrderDetail.deliveryDetails.phone && <div>Phone: {selectedRestaurantOrderDetail.deliveryDetails.phone}</div>}
              {selectedRestaurantOrderDetail.deliveryDetails.address && <div>Address: {selectedRestaurantOrderDetail.deliveryDetails.address}</div>}
            </div>
          )}
          <div className="erp-pos-order-detail-actions">
            <button type="button" className="erp-pos-order-action-btn" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "preparing"); }}>Preparing</button>
            <button type="button" className="erp-pos-order-action-btn" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "ready"); }}>Ready</button>
            <button type="button" className="erp-pos-order-action-btn" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "served"); }}>Served</button>
            {!isOrderFullyBilled(selectedRestaurantOrderDetail) && restaurantBillingAllowed && (
              <button type="button" className="erp-pos-order-action-btn primary" onClick={function () { billRestaurantOrder(selectedRestaurantOrderDetail.id); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id}>
                {billingOrderId === selectedRestaurantOrderDetail.id ? "Billing..." : ((selectedRestaurantOrderDetail.splitBills && selectedRestaurantOrderDetail.splitBills.length > 0) ? "Bill Remaining" : "Bill Order")}
              </button>
            )}
            {!isOrderFullyBilled(selectedRestaurantOrderDetail) && restaurantBillingAllowed && (
              <button type="button" className="erp-pos-order-action-btn" onClick={function () { setSplitOrderId(splitOrderId === selectedRestaurantOrderDetail.id ? "" : selectedRestaurantOrderDetail.id); setItemSplitPick({}); }}>
                Split Bill
              </button>
            )}
          </div>
          {!isOrderFullyBilled(selectedRestaurantOrderDetail) && !restaurantBillingAllowed && (
            <div className="erp-pos-rest-status-msg muted">
              Billing available at counter
            </div>
          )}
          {splitOrderId === selectedRestaurantOrderDetail.id && !isOrderFullyBilled(selectedRestaurantOrderDetail) && (
            <div className="erp-pos-order-split-section">
              <div className="erp-pos-order-split-hdr">Equal Split</div>
              <div className="erp-pos-order-detail-actions" style={{ marginBottom: 10 }}>
                {[2, 3, 4].map(function (n) {
                  return <button key={"detail-split-" + selectedRestaurantOrderDetail.id + "-" + n} type="button" className="erp-pos-order-action-btn" onClick={function () { billRestaurantEqualSplit(selectedRestaurantOrderDetail.id, n); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id}>{n + " ways"}</button>;
                })}
              </div>
              <div className="erp-pos-order-split-hdr">Item-based Split</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8, maxHeight: "20vh", overflowY: "auto" }}>
                {getOrderRemainingItems(selectedRestaurantOrderDetail).map(function (ri, idx) {
                  var pickKey = selectedRestaurantOrderDetail.id + "::" + idx;
                  return (
                    <label key={"detail-pick-" + pickKey} className="erp-pos-order-split-pick">
                      <input type="checkbox" checked={!!itemSplitPick[pickKey]} onChange={function () { toggleItemSplitPick(selectedRestaurantOrderDetail.id, idx); }} />
                      <span>
                        {ri.name} x {ri.qty} {ri.saleUnit || "Pcs"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <button type="button" className="erp-pos-order-action-btn teal" onClick={function () { billRestaurantItemSplit(selectedRestaurantOrderDetail.id); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id}>
                Bill Selected Items
              </button>
            </div>
          )}
          {isOrderFullyBilled(selectedRestaurantOrderDetail) && (
            <div className="erp-pos-rest-status-msg ok">
              Fully billed
            </div>
          )}
          {(selectedRestaurantOrderDetail.splitBills || []).length > 0 && (
            <div style={{ fontSize: 11, color: C.muted }}>
              Split invoice IDs: {(selectedRestaurantOrderDetail.splitBills || []).map(function (sb) { return sb.invoicedSaleId; }).filter(Boolean).slice(0, 8).join(", ")}
            </div>
          )}
        </div>
      </Modal>
    )}
    {isRestaurant && showRestaurantTableManager && (
      <Modal title="Manage Tables" onClose={function () { setShowRestaurantTableManager(false); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div ref={restaurantTableInputWrapRef} style={{ flex: 1 }}>
              <Input
                label="New Table"
                value={newRestaurantTableName}
                onChange={function (e) { setNewRestaurantTableName(e.target.value); }}
                onKeyDown={function (e) {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRestaurantTable();
                  }
                }}
                placeholder="T7 or Table 10"
              />
            </div>
            <Btn col="blue" onClick={addRestaurantTable}>Add Table</Btn>
          </div>
          <div className="erp-pos-manage-list">
            {restaurantTables.map(function (t) {
              var tableState = getRestaurantTableComputedStatus(t.id, t.status);
              var ts = restaurantTableStatusUi(tableState);
              var statusCls = tableState === "occupied" ? "occupied" : (tableState === "pending" ? "pending" : "free");
              return (
                <div key={"manage-root-" + t.id} className="erp-pos-manage-row">
                  <input
                    type="text"
                    defaultValue={t.name || t.id}
                    onBlur={function (e) { renameRestaurantTable(t.id, e.target.value); }}
                    onKeyDown={function (e) {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.value = t.name || t.id;
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <span className={"erp-settings-table-status " + statusCls}>
                    {ts.label}
                  </span>
                  <button
                    type="button"
                    className="erp-settings-table-del-btn"
                    onClick={function () { deleteRestaurantTable(t.id); }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
          <div className="erp-pos-manage-hint">
            Rename table names inline. Only free tables can be deleted.
          </div>
        </div>
      </Modal>
    )}
    </React.Fragment>
  );
});

/** Prefill / document line → POS cart line (prefer input qty/unit/price). */
var mapPrefillItemToCartLine = function (it, makeId) {
  if (!it) return null;
  var saleUnit = it.inputUnit || it.saleUnit || it.unit || "Pcs";
  var qty = it.inputQty != null ? it.inputQty : it.qty;
  var price = it.inputPrice != null ? it.inputPrice : it.price;
  var line = Object.assign({}, it, {
    cartLineId: it.cartLineId || makeId(),
    qty: qty,
    saleUnit: saleUnit,
    unit: saleUnit,
    price: Number(price) || 0,
  });
  if (it.isFree) {
    line.isFree = true;
    line.price = 0;
  }
  return line;
};

var Sales = POS;
export default Sales;
