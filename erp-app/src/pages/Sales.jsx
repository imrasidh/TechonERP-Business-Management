import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { computeSaleTax } from "../tax/taxCompute.js";
import { getProductUnitRows, factorForNamedUnit } from "../units/productUnits.js";
import {
  netPurchasedBaseQtyForDate,
  rawMaterialOpeningQty,
} from "../utils/rawMaterialQty.js";
import CustomerPicker from "../components/CustomerPicker.jsx";
import { productMatchesSearch, productMatchesSearchExact } from "../utils/productSearch.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";
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
  var SplitPaymentModal = props.SplitPaymentModal;
  var resolvePaymentCreditTargetIds = props.resolvePaymentCreditTargetIds;
  var warnPaymentCustomerMatchSafety = props.warnPaymentCustomerMatchSafety;
  var maybeShowPaymentMatchToasts = props.maybeShowPaymentMatchToasts;
  var showPaymentDupPick = props.showPaymentDupPick;
  var toastAfterCustomerPaymentApplied = props.toastAfterCustomerPaymentApplied;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var escapeHtml = props.escapeHtml;
  var shareViaWhatsApp = props.shareViaWhatsApp;
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
  var [posPageTab, setPosPageTab] = useState("sale");
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
      return pf.items.slice().reverse().map(function (it) { return Object.assign({}, it, { cartLineId: it.cartLineId || uid() }); });
    }
    return [];
  });
  var [freeCart, setFreeCart] = useState([]);
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
  var [custMode, setCustMode] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    if (pf && pf.customerId) return "existing";
    if (pf && pf.customerName) return "walkin";
    return "walkin";
  });
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
    if (pf) { S.set("tc3_repair_prefill", null); }
    return pf ? (pf.customerId || "") : "";
  });
  var [newCust, setNewCust] = useState({ name: "", phone: "", address: "" });
  var [discount, setDiscount] = useState("");
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
  var [payMode, setPayMode] = useState("full");
  var [paidAmt, setPaidAmt] = useState("");
  var [posSplitModal, setPosSplitModal] = useState(false);
  var [posSplitRows, setPosSplitRows] = useState([]);
  var [includeWarranty, setIncludeWarranty] = useState(false);
  var [posCashMethod, setPosCashMethod] = useState("Cash");
  var [posChequeList, setPosChequeList] = useState([]);
  var [posChqForm, setPosChqForm] = useState({ no: "", bank: "", amount: "", due: today() });
  var [posChqModal, setPosChqModal] = useState(false);
  var [invoiceNo, setInvoiceNo] = useState(function () { return genInvNo(); });
  var [quotationNo, setQuotationNo] = useState(function () { return genInvNo("QT"); });
  var [quotationNotes, setQuotationNotes] = useState("");
  var [isSavingQuotation, setIsSavingQuotation] = useState(false);
  var [printMode, setPrintMode] = useState(null);
  var [invoice, setInvoice] = useState(null);
  var [waSharePicker, setWaSharePicker] = useState(false);
  var [waSharePickerKind, setWaSharePickerKind] = useState("sale");
  var [posPrintPicker, setPosPrintPicker] = useState(false);
  var [posPrintPickerKind, setPosPrintPickerKind] = useState("sale");
  var [dropPos, setDropPos] = useState(null);
  var [pendingPrint, setPendingPrint] = useState(null);
  var [posDropIdx, setPosDropIdx] = useState(-1);
  var searchRef = useRef(null);
  var pendingCartFocusRef = useRef(null);
  var waPendingRef = useRef(false); /* true when Save+WhatsApp was clicked */
  var posShortcutRef = useRef({});
  var lastBeepAtRef = useRef(0);
  var cartPulseTimerRef = useRef(null);
  var [cartPulse, setCartPulse] = useState(false);
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

  var [editingSaleId,  setEditingSaleId]  = useState("");      /* non-empty when POS is in edit mode */

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
      codTrack: codTrack,
      _activeHeldId: activeHeldId
    };
  }, [cart, freeCart, custId, custMode, custSearch, newCust, discount, includeWarranty, posSplitRows, invoiceNo, quotationNo, quotationNotes, isQuotationMode, paidAmt, payMode, editingSaleId, fromRepairId, fromRepairDeviceIndexes, fromQuotationId, activeHeldId, codTrack]);

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

  useEffect(function () {
    return function () {
      if (cartPulseTimerRef.current) clearTimeout(cartPulseTimerRef.current);
    };
  }, []);

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
    var name = String(draft && draft.name || "").trim();
    var phone = String(draft && draft.phone || "").trim();
    if (!name) return null;
    var created = {
      id: uid(),
      name: name,
      phone: phone,
      address: "",
      credit: 0,
      totalSpent: 0,
      createdAt: today(),
      updatedAt: today(),
    };
    if (!tcTrialGuard(state.customers, "customers")) return null;
    var nextCustomers = state.customers.concat([created]);
    S.set("tc3_customers", nextCustomers);
    setState(function (st) { return Object.assign({}, st, { customers: nextCustomers }); });
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
    var baseQty = prod ? toProductBaseQty(it.qty || 0, it.saleUnit || it.unit || "Pcs", prod) : (it.qty || 0);
    var comm = String(it.comment || "").trim();
    var lineLbl = prod ? (String(prod.comment_label || "").trim() || "Comment") : "Comment";
    var row = Object.assign({}, it, {
      qty: baseQty,
      inputQty: it.qty,
      inputUnit: it.saleUnit || it.unit || "Pcs",
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
    setCartPulse(true);
    if (cartPulseTimerRef.current) clearTimeout(cartPulseTimerRef.current);
    cartPulseTimerRef.current = setTimeout(function () { setCartPulse(false); }, 150);
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
    setCartPulse(true);
    if (cartPulseTimerRef.current) clearTimeout(cartPulseTimerRef.current);
    cartPulseTimerRef.current = setTimeout(function () { setCartPulse(false); }, 150);
  };
  var clearCurrentCart = function () {
    if (!cart.length) return;
    var prevSnapshot = cart.map(function (x) { return Object.assign({}, x); });
    if (isRestaurant) {
      showConfirm("Clear current items?", function () {
        setCart([]);
        setRestaurantUndo({ cart: prevSnapshot, msg: "Cart cleared" });
        focusPosSearch();
      });
      return;
    }
    setCart([]);
    setFreeCart([]);
    focusPosSearch();
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

  /* Single burst of S.set so sync/network cannot interleave sale vs inventory vs ledger.
     New sales: prepend one row via S.appendRecord to avoid building a full sales array for persistence. */
  var flushPosCheckoutToStorage = function (nextState, heldIdToRemove, editingId, primarySaleId) {
    S.set("tc3_products", nextState.products);
    S.set("tc3_customers", nextState.customers);
    if (editingId) {
      S.set("tc3_sales", nextState.sales);
    } else if (S.appendRecord && primarySaleId) {
      var saleRow = (nextState.sales || []).find(function (s) { return s.id === primarySaleId; });
      if (saleRow) S.appendRecord("tc3_sales", saleRow, { prepend: true });
      else S.set("tc3_sales", nextState.sales);
    } else {
      S.set("tc3_sales", nextState.sales);
    }
    S.set("tc3_repairs", nextState.repairs);
    S.set("tc3_quotations", nextState.quotations || []);
    S.set("tc3_cheques", nextState.cheques || []);
    if (heldIdToRemove) {
      var cleanHeld = (S.get("tc3_held_invoices", []) || []).filter(function (x) { return x.id !== heldIdToRemove; });
      S.set("tc3_held_invoices", cleanHeld);
    }
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
    try {
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
    /* Block walk-in customers from making unpaid or partial invoices */
    var isWalkIn = custMode === "walkin" || (custMode === "existing" && !custId) || (custMode === "new" && !newCust.name);
    if (isWalkIn) {
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
    var stockErr = null;
    var seenStockPid = {};
    cart.concat(freeCart).forEach(function (item) {
      if (stockErr) return;
      if (seenStockPid[item.id]) return;
      seenStockPid[item.id] = 1;
      var prod = state.products.find(function (p) { return p.id === item.id; });
      if (!prod) return;
      if (isServiceProduct(prod)) return;
      var totalReq = getReservedBaseQtyForProduct(prod);
      if (totalReq > (prod.stock || 0)) {
        var availMsg = getBulkDisplayParts(prod) ? fmtStockDual(prod) : fmtStock(prod.stock || 0, prod.unit || "Pcs");
        stockErr = "Not enough stock for \"" + item.name + "\". Available: " + availMsg + ", requested (all lines): " + fmtStock(totalReq, prod.unit || "Pcs") + ".";
      }
    });
    if (stockErr) { showAlert(stockErr); return; }
    var missingServicePrice = cart.find(function (item) {
      var pr = state.products.find(function (p) { return p.id === item.id; });
      return isServiceProduct(pr) && !(Number(item.price) > 0);
    });
    if (missingServicePrice) {
      showAlert("Enter a selling price for \"" + missingServicePrice.name + "\" before checkout.");
      return;
    }
    /* Block selling below cost */
    var belowCostItem = cart.find(function (item) {
      var pr = state.products.find(function (p) { return p.id === item.id; });
      var lc = item.isGlassLine && pr
        ? getGlassCostPerSqFt(pr)
        : (pr ? getPosCostPerSaleUnit(pr, item.saleUnit || item.unit || "Pcs") : (item.cost || 0));
      var sell = item.isGlassLine
        ? (item.customGlassRate ? (item.glassRatePerSqFt != null ? item.glassRatePerSqFt : item.price) : getGlassSellRatePerSqFt(pr))
        : item.price;
      return (sell || 0) < lc;
    });
    if (belowCostItem) {
      var pr2 = state.products.find(function (p) { return p.id === belowCostItem.id; });
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
      initPh = [{ id: uid(), date: today(), amount: paidNum, note: "Initial payment", cashMethod: posCashMethod }];
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
    var saleObj = { id: editingSaleId || uid(), invoiceNo: finalInvNo, date: today(), customerId: custId || "", customerName: custName, customerPhone: custPhone, items: saleItems, subTotal: subTotal, discount: discAmt, total: total, paid: effectivePaid, balance: effectiveBalance, payStatus: effectiveStatus, includeWarranty: includeWarranty, paymentHistory: initPh, cashMethod: posCashMethod, fromRepairId: fromRepairId || undefined, fromRepairDeviceIndexes: (fromRepairDeviceIndexes || []).slice(), fromQuotationId: fromQuotationId || undefined, createdAt: new Date().toISOString() };
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
    var _baseProds = state.products;
    if (editingSaleId) {
      var _origSale = state.sales.find(function (s) { return s.id === editingSaleId; });
      if (_origSale) {
        _baseProds = state.products.map(function (p) {
          var back = (_origSale.items || []).filter(function (x) { return x.id === p.id; }).reduce(function (a, oi) { return a + (oi.qty || 0); }, 0);
          if (!back) return p;
          return Object.assign({}, p, { stock: (p.stock || 0) + back });
        });
      }
    }
    var np = _baseProds.map(function (p) {
      var lines = cart.filter(function (x) { return x.id === p.id; }).concat(freeCart.filter(function (x) { return x.id === p.id; }));
      if (!lines.length) return p;
      if (isServiceProduct(p)) return p;
      var deductQty = lines.reduce(function (acc, ci) {
        return acc + toProductBaseQty(ci.qty || 0, ci.saleUnit || ci.unit || "Pcs", p);
      }, 0);
      return Object.assign({}, p, { stock: (p.stock || 0) - deductQty });
    });
    var nc = state.customers.slice();
    /* FIX2: use effectiveBalance (not balanceDue) ? for cheque payments effectivePaid=0 so full balance should be credited */
    if (custMode === "new" && newCust.name) { nc.push({ id: uid(), name: newCust.name, phone: newCust.phone || "", address: newCust.address || "", credit: effectiveBalance, totalSpent: total }); }
    else if (custMode === "existing" && custId) { nc = nc.map(function (c) { return c.id === custId ? Object.assign({}, c, { credit: (c.credit || 0) + effectiveBalance, totalSpent: (c.totalSpent || 0) + total }) : c; }); }
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
          devices[idx] = Object.assign({}, devices[idx], { status: "Delivered" });
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
        S.set("tc3_codRecords", nextCod);
        codRecords = nextCod;
      } else if (editingSaleId) {
        var filteredCod = codRecords.filter(function (r) { return r.saleId !== saleObj.id; });
        if (filteredCod.length !== codRecords.length) {
          S.set("tc3_codRecords", filteredCod);
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
          return { id: uid(), type: "incoming", status: "Pending", chequeNo: (r.chequeNo || "").trim(), bankName: (r.chequeBankName || "").trim(), amount: parseFloat(r.amount), dueDate: r.chequeDueDate || today(), issuedDate: today(), customerId: custId || "", customerName: custName, saleId: saleObj.id, invoiceNo: saleObj.invoiceNo, note: r.note || "", createdAt: today() };
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
        return { id: uid(), type: "incoming", status: "Pending", chequeNo: c.no.trim(), bankName: (c.bank || "").trim(), amount: parseFloat(c.amount), dueDate: c.due || today(), issuedDate: today(), customerId: custId || "", customerName: custName, saleId: saleObj.id, invoiceNo: saleObj.invoiceNo, note: "", createdAt: today() };
      });
      var chqPh = newCheques.map(function (ch) { return { id: uid(), date: today(), amount: 0, cashMethod: "Cheque", note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending - due " + ch.dueDate + ")", chequeId: ch.id }; });
      var saleWithCheques = Object.assign({}, saleObj, { paymentHistory: chqPh });
      var nchq = (newState.cheques || []).concat(newCheques);
      var nsalesCheque = newState.sales.map(function (s) { return s.id === saleObj.id ? saleWithCheques : s; });
      newState = Object.assign({}, newState, { cheques: nchq, sales: nsalesCheque });
      setPosChequeList([]); setPosChqForm({ no: "", bank: "", amount: "", due: today() });
    }

    flushPosCheckoutToStorage(newState, activeHeldId, editingSaleId, saleObj.id);
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
    } catch (e) { }

    var finalSaleForPrint = (newState.sales || []).find(function (s) { return s.id === saleObj.id; }) || saleObj;
    if (withPrint) {
      setPendingPrint({ sale: finalSaleForPrint, mode: mode || "thermal", settings: Object.assign({}, state.settings), warranty: includeWarranty, invoiceLang: "en" });
      setCart([]); setFreeCart([]); setCodTrack(emptyCodTrackForm()); setCustMode("walkin"); setCustSearch(""); setCustId(""); setNewCust({ name: "", phone: "", address: "" }); setDiscount(""); setPayMode("full"); setPaidAmt(""); setPosSplitRows([]); setPosSplitModal(false); setInvoiceNo(genInvNo()); setFromRepairId(""); setFromRepairDeviceIndexes([]); setFreeSearch("");
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
    setPosPrintPicker(true);
  };
  var openQuotationPrintPicker = function () {
    if (!cart.length || isSavingQuotation) return;
    if (!canEditInvoices) return;
    setPosPrintPickerKind("quotation");
    setPosPrintPicker(true);
  };
  var saveAndPrintWithMode = function (mode) {
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
    setQuotationNotes("");
    setQuotationNo(genInvNo("QT"));
    setCustMode("walkin");
    setCustSearch("");
    setCustId("");
    setNewCust({ name: "", phone: "", address: "" });
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

  var saveQuotation = function (withPrint, printMode, waShare) {
    if (!canEditInvoices) {
      showPermissionDenied("create quotations");
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
    if (!tcTrialGuard(state.quotations || [], "quotations")) return;
    setIsSavingQuotation(true);
    try {
      var finalQtNo = ensureUniqueDocumentNumber(quotationNo, "QT", state);
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
      var newQ = Object.assign({}, {
        id: uid(),
        quotationNo: finalQtNo,
        customer: cust.custName,
        customerId: cust.custId,
        customerPhone: cust.custPhone,
        items: items,
        notes: String(quotationNotes || "").trim(),
        status: "Sent",
        date: today(),
        createdAt: today(),
        createdBy: currentUserName,
      }, taxExtra);
      var nq = (state.quotations || []).concat([newQ]);
      S.set("tc3_quotations", nq);
      addAudit("Created Quotation", newQ.quotationNo);
      setState(function (st) { return Object.assign({}, st, { quotations: nq }); });
      var heldIdToClear = activeHeldId;
      resetQuotationForm();
      if (heldIdToClear) deleteHeldInvoice(heldIdToClear);
      if (withPrint || waShare) {
        if (waShare) waPendingRef.current = true;
        setPendingPrint({
          kind: "quotation",
          sale: quotationToPrintInv(newQ),
          mode: printMode || (state.settings.invoiceDefaultSize || "a4"),
          settings: Object.assign({}, state.settings),
          invoiceLang: "en",
        });
      } else {
        showAlert("Quotation " + finalQtNo + " saved. View it under Invoices → Quotations.");
      }
    } finally {
      setIsSavingQuotation(false);
    }
  };

  var resetForm = function () {
    setCart([]); setFreeCart([]); setFreeSearch(""); setCodTrack(emptyCodTrackForm()); setCustMode("walkin"); setCustSearch(""); setCustId(""); setNewCust({ name: "", phone: "", address: "" }); setDiscount(""); setPayMode("full"); setPaidAmt(""); setInvoice(null); setPrintMode(null); setInvoiceNo(genInvNo()); setFromRepairId(""); setFromRepairDeviceIndexes([]);
    setEditingSaleId("");
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
    waSharePicker: waSharePicker,
    saveOnly: function () { saveAndFinish(false); },
    saveQuotationOnly: function () { saveQuotation(false); },
    openPrintPicker: openPosPrintPicker,
    openQuotationPrintPicker: openQuotationPrintPicker,
    openWhatsApp: saveAndWhatsApp,
    openQuotationWhatsApp: openQuotationWhatsApp,
    holdCart: holdCurrentCart,
    printA4: function () { saveAndPrintWithMode(state.settings.invoiceDefaultSize || "a4"); },
    printThermal: function () { saveAndPrintWithMode(state.settings.invoiceThermalSize || "thermal80"); },
    waShareA4: function () {
      var mode = state.settings.invoiceDefaultSize || "a4";
      if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode(mode);
      else saveAndWhatsAppWithMode(mode);
    },
    waShareThermal: function () {
      var mode = state.settings.invoiceThermalSize || "thermal80";
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
        if (pk === "a") {
          e.preventDefault();
          s.printA4();
        } else if (pk === "t") {
          e.preventDefault();
          s.printThermal();
        } else if (pk === "escape") {
          e.preventDefault();
          s.closePrintPicker();
        }
        return;
      }
      if (s.waSharePicker) {
        var wk = e.key.toLowerCase();
        if (wk === "a") {
          e.preventDefault();
          s.waShareA4();
        } else if (wk === "t") {
          e.preventDefault();
          s.waShareThermal();
        } else if (wk === "escape") {
          e.preventDefault();
          s.closeWaSharePicker();
        }
        return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var key = e.key.toLowerCase();
      if (key === "h") {
        if (s.isRestaurant || (s.cartLength < 1 && s.freeCartLength < 1)) return;
        e.preventDefault();
        s.holdCart();
        return;
      }
      if (s.isRestaurant) return;
      if (s.isQuotationMode) {
        if (key === "s") {
          if (!s.canQuotationAction) return;
          e.preventDefault();
          s.saveQuotationOnly();
        } else if (key === "p") {
          if (!s.canQuotationAction) return;
          e.preventDefault();
          s.openQuotationPrintPicker();
        } else if (key === "w") {
          if (!s.canQuotationAction) return;
          e.preventDefault();
          s.openQuotationWhatsApp();
        }
        return;
      }
      if (key === "s") {
        if (!s.canCheckout) return;
        e.preventDefault();
        s.saveOnly();
      } else if (key === "p") {
        if (!s.canCheckout) return;
        e.preventDefault();
        s.openPrintPicker();
      } else if (key === "w") {
        if (!s.canCheckout) return;
        e.preventDefault();
        s.openWhatsApp();
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

  /* After React renders the hidden print preview, grab it and open print window */
  useEffect(function () {
    if (!pendingPrint) return;
    var timer = setTimeout(function () {
      var el = document.getElementById("pos-print-preview");
      if (waPendingRef.current && el) {
        /* WhatsApp path ? capture HTML and share instead of printing */
        waPendingRef.current = false;
        var isA5 = pendingPrint.mode === "a5";
        var isThermal = pendingPrint.mode === "thermal" || pendingPrint.mode === "thermal58" || pendingPrint.mode === "thermal80";
        var bodyW = isThermal
          ? "body{background:#fff;font-family:'Courier New',monospace;width:" + (pendingPrint.mode === "thermal58" ? "218px" : "302px") + ";}"
          : "body{background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;}";
        var pgSize = isThermal ? (pendingPrint.mode === "thermal58" ? "58mm auto" : "80mm auto") : (isA5 ? "A5" : "A4");
        var pgMargin = isThermal ? "3mm" : "8mm";
        /* Thermal: no "portrait" keyword ? Chromium PDF maps it to A4 incorrectly */
        var css = "<style>*{box-sizing:border-box;margin:0;padding:0;}html,body{height:auto;}" + bodyW + "@page{size:" + pgSize + (isThermal ? "" : " portrait") + ";margin:" + pgMargin + ";}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>";
        var pageFormat = isThermal ? (pendingPrint.mode === "thermal58" ? "thermal58" : "thermal80") : (isA5 ? "a5" : "a4");
        var isQuot = pendingPrint.kind === "quotation";
        var filename = (isQuot ? "Quotation-" : "Invoice-") + (pendingPrint.sale.invoiceNo || pendingPrint.sale.id.slice(0, 8));
        var phone = pendingPrint.sale.customerPhone || "";
        setPendingPrint(null);
        shareViaWhatsApp(el.innerHTML, filename, phone, { headStyles: css, pageFormat: pageFormat });
      } else {
        /* Normal print path */
        doPopupPrint(pendingPrint.sale.invoiceNo, pendingPrint.mode, pendingPrint.kind);
        setPendingPrint(null);
      }
    }, 300); /* 300ms ensures DOM is painted for both paths */
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
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, lineHeight: 1.15, whiteSpace: "normal", textAlign: "center", width: "100%" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{busy ? busyText : p.label}</span>
        {!busy && p.shortcut ? (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.04em",
            opacity: p.onDark ? 0.88 : 1,
            color: p.onDark ? "rgba(255,255,255,0.88)" : C.muted,
          }}>{p.shortcut}</span>
        ) : null}
      </span>
    );
  };

  var PosWhatsAppBtnContent = function (p) {
    var busy = !!p.busy;
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, lineHeight: 1.15, width: "100%" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{busy ? (p.busyText || "Processing...") : "WhatsApp"}</span>
        </span>
        {!busy ? (
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", opacity: 0.88, color: "rgba(255,255,255,0.88)" }}>Ctrl + W</span>
        ) : null}
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
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: disabled ? "#9ca3af" : "linear-gradient(135deg,#25d366,#128c7e)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px 7px",
          fontSize: 13,
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "inherit",
          letterSpacing: "0.01em",
          boxShadow: disabled ? "none" : "0 2px 10px rgba(37,211,102,0.35)",
          opacity: disabled ? 0.45 : 1,
          transition: "opacity .15s, transform .15s, box-shadow .15s",
        }}
        onMouseEnter={function (e) {
          if (!disabled) {
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(37,211,102,0.45)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={function (e) {
          if (!disabled) {
            e.currentTarget.style.boxShadow = "0 2px 10px rgba(37,211,102,0.35)";
            e.currentTarget.style.transform = "none";
          }
        }}
      >
        <PosWhatsAppBtnContent busy={opts.busy} busyText={opts.busyText} />
      </button>
    );
  };

  return (
    <React.Fragment>
    {clientPosOfflineBar ? (
      <div
        role="status"
        style={{
          marginBottom: 12,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #fcd34d",
          background: "linear-gradient(90deg,#fffbeb,#fef3c7)",
          color: "#92400e",
          fontSize: 12,
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        Offline - sales may sync when connection restores
      </div>
    ) : null}
    {!isRestaurant && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 12, padding: 5, border: "1.5px solid " + C.border, boxShadow: C.shadowCard, alignSelf: "flex-start" }}>
          {[["sale", "Sales"], ["quotation", "Quotation"]].map(function (t) {
            var isA = posPageTab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                onClick={function () { switchPosPageTab(t[0]); }}
                style={{
                  background: isA ? "linear-gradient(135deg,#2979ff,#2255d4)" : "transparent",
                  color: isA ? "#fff" : C.textMd,
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all .15s",
                  fontFamily: "inherit",
                  boxShadow: isA ? "0 2px 8px rgba(41,121,255,0.28)" : "none",
                }}
              >
                {t[1]}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={holdCurrentCart}
          disabled={!cart.length}
          style={{
            padding: "9px 16px 8px",
            borderRadius: 10,
            border: "1.5px solid " + (!cart.length ? "#f3b7c1" : "#d11a42"),
            background: !cart.length ? "#fde8ed" : "linear-gradient(135deg,#f04464,#c81e45)",
            color: !cart.length ? "#b76a78" : "#fff",
            fontSize: 13,
            fontWeight: 800,
            cursor: !cart.length ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            boxShadow: !cart.length ? "none" : "0 8px 18px rgba(209,26,66,0.22)",
            minWidth: 140,
          }}
        >
          <PosShortcutBtnContent
            label={isQuotationMode ? "Hold Quotation" : "Hold Invoice"}
            shortcut="Ctrl + H"
            onDark={true}
          />
        </button>
      </div>
    )}
    <form
      className="erp-page erp-pos"
      style={{ display: "flex", gap: 16, minHeight: "100%", boxSizing: "border-box", alignItems: "flex-start", margin: 0 }}
      noValidate
      onSubmit={function (e) {
        e.preventDefault();
        if (posSetupBlocksCriticalActions() || isCheckingOut || posIsSavingRef.current) return;
      }}
    >
      {/* Left panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "visible" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <CardTitle sub={isQuotationMode ? ("Quotation: " + quotationNo) : ("Invoice: " + invoiceNo)}>
            {isQuotationMode
              ? "New Quotation"
              : (editingSaleId
                ? <span>Edit Sale <span style={{ fontSize: 11, fontWeight: 600, background: "#fff3cd", color: "#856404", borderRadius: 5, padding: "2px 7px", marginLeft: 6 }}>EDITING</span></span>
                : "New Sale")}
          </CardTitle>
          {!isQuotationMode && editingSaleId && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: "7px 12px", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#7c5700" }}>You are editing invoice <b>{invoiceNo}</b>. Save to apply changes or cancel.</span>
              <button onClick={function () { setEditingSaleId(""); setInvoiceNo(genInvNo()); setCart([]); setCustMode("walkin"); setCustSearch(""); setCustId(""); setDiscount(""); }} style={{ background: "none", border: "1px solid #ffe082", color: "#856404", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Cancel Edit</button>
            </div>
          )}
          {/* Customer selector */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Customer</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[["walkin", "Walk-in"], ["customer", "Customer"]].map(function (item) {
                var v = item[0]; var l = item[1];
                var active = v === "walkin" ? custMode === "walkin" : custMode !== "walkin";
                return <button type="button" key={v} onClick={function () { if (v === "walkin") { setCustMode("walkin"); setCustId(""); setCustSearch(""); setNewCust({ name: "", phone: "", address: "" }); } else { setCustMode("existing"); setCustId(""); if (custMode === "new" && newCust.name) setCustSearch(newCust.name + (newCust.phone ? (" - " + newCust.phone) : "")); } }} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid " + (active ? C.cyan : C.border), background: active ? "#e0f2fe" : "transparent", color: active ? C.cyan : C.textMd, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>;
              })}
            </div>
            {custMode !== "walkin" && (
              <CustomerPicker
                customers={state.customers}
                value={custMode === "new" ? (newCust.name + (newCust.phone ? (" - " + newCust.phone) : "")) : custSearch}
                selectedCustomerId={custId}
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
              />
            )}
          </div>
          {/* Product search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            {isRestaurant && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
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
                      onClick={function () { setRestaurantProductFilter(f.id); }}
                      style={{
                        fontSize: 11,
                        fontWeight: active ? 800 : 700,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid " + (active ? C.accent : C.border),
                        background: active ? C.accentSoft : "#fff",
                        color: active ? C.accent : C.textMd,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add Product (name, ID, barcode, or category)</label>
              <input
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
                onFocus={function (e) {
                  if (isRestaurantDineIn && selectedTableLocked) {
                    var nextFreeTable = restaurantTables.find(function (t) {
                      return t && t.id && getRestaurantTableComputedStatus(t.id, t.status) === "free";
                    });
                    if (nextFreeTable && nextFreeTable.id && nextFreeTable.id !== selectedTableId) {
                      handleRestaurantTablePick(nextFreeTable.id);
                      setRestaurantToast("Switched to free table " + getRestaurantTableDisplayName(nextFreeTable.id));
                    }
                  }
                  e.target.style.borderColor = "#2979ff";
                  e.target.style.boxShadow = "0 0 0 3px rgba(41,121,255,0.12)";
                  if (searchRef.current) {
                    var r = searchRef.current.getBoundingClientRect();
                    setDropPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
                  }
                }}
                onBlur={function (e) {
                  e.target.style.borderColor = C.border;
                  e.target.style.boxShadow = "none";
                  setTimeout(function () { setDropPos(null); }, 180);
                }}
                placeholder="Type name, ID, barcode, category, or scan..."
                style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%", transition: "border-color .15s, box-shadow .15s" }}
              />
              {isNetworkClientPos && (state.products || []).length === 0 && (
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fdba74", fontSize: 12, color: "#9a3412", lineHeight: 1.5 }}>
                  No products synced from the main PC yet. On the <strong>main PC</strong>, open Settings → Network → <strong>Upload Shop Data to Server</strong>, then wait a few seconds. Products appear here when you search by name, ID, or barcode.
                </div>
              )}
              {isNetworkClientPos && search && (state.products || []).length > 0 && filteredProds.length === 0 && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid " + C.border, fontSize: 12, color: C.muted }}>
                  No matching products. Try another search term or check stock on the main PC.
                </div>
              )}
            </div>
            {search && filteredProds.length > 0 && dropPos && (
              <div style={{ position: "fixed", top: dropPos.top + 2, left: dropPos.left, width: dropPos.width, background: "#fff", border: "1px solid " + C.border, borderRadius: 8, zIndex: 9999, maxHeight: 260, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.14)" }}>
                <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid " + C.borderLight }}>
                  {filteredProds.length} product{filteredProds.length > 1 ? "s" : ""} found — Enter adds · then Price → Qty → Search
                </div>
                {filteredProds.slice(0, 10).map(function (p, pidx) {
                  var isService = isServiceProduct(p);
                  var oos = !isService && (p.stock || 0) === 0;
                  return (
                    <div key={p.id} onMouseDown={function (e) { e.preventDefault(); if (selectedTableLocked) return; addToCart(p); setPosDropIdx(-1); }}
                      style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: posDropIdx === pidx ? C.accentSoft : "#fff", opacity: (oos && !isQuotationMode) ? 0.65 : 1 }}
                      onMouseEnter={function (e) { setPosDropIdx(pidx); }}
                      onMouseLeave={function (e) { setPosDropIdx(-1); }}>
                      <div>
                        <span style={{ fontWeight: 600, color: C.text }}>{p.name}</span>
                        {p.barcode && <span style={{ marginLeft: 8, fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{p.barcode}</span>}
                        {isService && <span style={{ marginLeft: 6, fontSize: 10, background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>SERVICE</span>}
                        {oos && <span style={{ marginLeft: 6, fontSize: 10, background: "#fee2e2", color: C.red, padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>OUT OF STOCK</span>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <span style={{ color: C.accent, fontWeight: 700 }}>{getCurrencySymbol()} {(isService && !(Number(p.price) > 0)) ? "—" : fmtNum(glassCartLayout && isGlassProduct(p, shopSettings) ? getGlassSellRatePerSqFt(p) : p.price)}{glassCartLayout && isGlassProduct(p, shopSettings) ? " / Sq Ft" : ""}</span>
                        {isService
                          ? <span style={{ color: C.muted, fontWeight: 400, fontSize: 11, marginLeft: 4 }}>(service item)</span>
                          : (!oos && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11, marginLeft: 4 }}>({glassCartLayout && isGlassProduct(p, shopSettings) ? (fmtNum(glassAvailableSqFt(p)) + " Sq Ft left") : (getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit) + " left")})</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Cart ? keyboard navigable like a spreadsheet */}
          {cart.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 6, tableLayout: "fixed", transform: cartPulse ? "scale(1.01)" : "scale(1)", transformOrigin: "50% 0%", transition: "transform .14s ease" }}>
              <colgroup>
                <col />
                <col style={{ width: glassCartLayout ? 160 : 168 }} />
                <col style={{ width: glassCartLayout ? 248 : 120 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: isRestaurant ? 48 : 30 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: "3px 6px", fontWeight: 700, color: C.th, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, whiteSpace: "nowrap" }}>Item</th>
                  <th style={{ textAlign: "center", padding: "3px 5px", fontWeight: 700, color: C.th, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, whiteSpace: "nowrap" }}>{glassCartLayout ? (cartMixedGlassLayout ? "Price" : "Rate / Sq Ft") : "Price"}</th>
                  <th style={{ textAlign: "center", padding: "3px 5px", fontWeight: 700, color: C.th, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, whiteSpace: "nowrap" }}>{glassCartLayout && !cartMixedGlassLayout ? "W · H · Unit · Pcs" : (glassCartLayout ? "Qty / Cut" : "Qty")}</th>
                  <th style={{ textAlign: "right", padding: "3px 6px", fontWeight: 700, color: C.th, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, whiteSpace: "nowrap" }}>Total</th>
                  <th style={{ padding: "3px 4px", borderBottom: "1px solid " + C.border }}></th>
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
                  var commentInDetail = showLineComment;
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
                  var hasNonGlassExtras = !item.isGlassLine && (hasSecondaryForDetail || quickAmtsForDetail.length > 0 || !!prodForDetail || !!convHintForDetail);
                  var isNewestRow = i === 0;
                  var rowBg = isNewestRow ? "#eef5ff" : "#fafbfc";
                  var detailBg = isNewestRow ? "#f3f8ff" : "#f4f6f9";
                  var hasDetailRow = item.isGlassLine || commentInDetail || hasNonGlassExtras;
                  var cartQtyInputStyle = Object.assign({}, glassCartFieldStyle(C), { width: 56, maxWidth: "100%", margin: "0 auto", fontSize: 12, fontWeight: 700 });
                  return (
                    <React.Fragment key={String(cartLineKey(item)) + "-" + i}>
                    <tr style={{ borderBottom: hasDetailRow ? "none" : ("1px solid " + C.border), background: rowBg, boxShadow: isNewestRow ? ("inset 2px 0 0 " + C.accent) : "none" }}
                      onMouseEnter={function (e) { e.currentTarget.style.background = isNewestRow ? "#e5efff" : "#f3f7ff"; }}
                      onMouseLeave={function (e) { e.currentTarget.style.background = rowBg; }}>
                      <td style={{ padding: "2px 6px", fontSize: 12, verticalAlign: "middle", lineHeight: 1.25 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", minHeight: GLASS_CART_FIELD_H }}>
                          <div style={{ fontWeight: 600, color: C.text, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                          {isNewestRow ? (
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#fff", background: C.accent, padding: "1px 5px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>Adding</span>
                          ) : null}
                        </div>
                        {item.description && <div style={{ fontSize: 9, color: C.muted, marginTop: 1, lineHeight: 1.2 }}>{item.description}</div>}
                        {isRestaurant && (
                          <div style={{ marginTop: 6, maxWidth: 220 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMd, marginBottom: 3 }}>
                              Modifier
                            </div>
                            <input
                              type="text"
                              data-cartrow={i}
                              data-cartcol="2"
                              value={item.restaurantNote || ""}
                              disabled={selectedTableLocked}
                              onChange={function (e) { setCartItemRestaurantNote(cartLineKey(item), e.target.value); }}
                              onKeyDown={function (e) { handleCartFieldKey(e, i, 2); }}
                              placeholder="No onion / Extra spicy / Less sugar"
                              style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                            />
                          </div>
                        )}
                        {!isDecimalUnit(item.unit) && item.unit && item.unit !== "Pcs" && (
                          <div style={{ fontSize: 9, color: C.accent, fontWeight: 700 }}>{item.unit}</div>
                        )}
                      </td>
                      <td style={{ padding: "2px 5px", verticalAlign: "middle", textAlign: "center", width: glassCartLayout ? 160 : 168, overflow: "hidden" }}>
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
                      <td style={{
                        padding: "2px 5px",
                        verticalAlign: "middle",
                        textAlign: "center",
                      }}>
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
                            onFocusCapture={function (e) { e.target.style.border = "1px solid " + C.accent; e.target.style.background = "#f0f4ff"; }}
                            onBlur={function (e) { e.target.style.border = "1px solid " + C.border; e.target.style.background = "#fff"; }}
                          />
                        )}
                      </td>
                      <td style={{ padding: "2px 6px", fontWeight: 700, color: C.blue, fontSize: 12, whiteSpace: "nowrap", verticalAlign: "middle", textAlign: "right", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>{getCurrencySymbol()} {fmtNum(posLineAmount(item))}</td>
                      <td style={{ padding: "2px 2px", whiteSpace: "nowrap", verticalAlign: "middle", textAlign: "center", width: isRestaurant ? 48 : 30 }}>
                        {isRestaurant && (
                          <button
                            type="button"
                            disabled={selectedTableLocked}
                            onClick={function () { duplicateCartItem(cartLineKey(item)); }}
                            title="Duplicate item"
                            style={{ background: "#eef2ff", border: "1px solid " + C.border, color: C.accent, cursor: selectedTableLocked ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 800, lineHeight: 1, padding: "2px 5px", borderRadius: 6, opacity: selectedTableLocked ? 0.5 : 1, marginRight: 2 }}
                          >
                            +
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={selectedTableLocked}
                          onClick={function () { updateQty(cartLineKey(item), 0); }}
                          title="Remove item"
                          aria-label="Remove item"
                          style={{ background: "none", border: "none", color: C.red, cursor: selectedTableLocked ? "not-allowed" : "pointer", fontSize: 17, fontWeight: 700, lineHeight: 1, padding: 0, width: 22, height: 22, opacity: selectedTableLocked ? 0.5 : 1 }}
                        >×</button>
                      </td>
                    </tr>
                    {hasDetailRow ? (
                      <tr style={{ borderBottom: "1px solid " + C.border, background: detailBg }}>
                        <td colSpan={5} style={{ padding: "3px 8px 5px", verticalAlign: "top" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
                            {commentInDetail && (
                              <div style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }}>
                                <div style={{ fontSize: 8, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{DEFAULT_PRODUCT_COMMENT_LABEL}</div>
                                <input
                                  type="text"
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
                                  placeholder="Serial, IMEI, note…"
                                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + C.border, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", outline: "none", background: "#fff", height: 24 }}
                                />
                              </div>
                            )}
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
                            {hasNonGlassExtras ? (
                              <div style={{ flex: "1 1 280px" }}>
                                {hasSecondaryForDetail && (
                                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: C.textMd }}>Unit</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "3px 4px", background: "#f1f5f9", borderRadius: 8, border: "1px solid " + C.borderLight }}>
                                      {unitOptsForDetail.map(function (uOpt) {
                                        var activeUnit = unitForDetail === uOpt;
                                        return (
                                          <button
                                            key={uOpt}
                                            type="button"
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
                                            style={{
                                              fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
                                              background: activeUnit ? "#3b82f6" : "#fff", color: activeUnit ? "#fff" : "#4b5563", whiteSpace: "nowrap"
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
                                          style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid " + C.border, background: "#fff", color: C.accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
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
                                        <button key={qa.label} disabled={selectedTableLocked} onClick={function () { updateQty(cartLineKey(item), qa.qty); }} style={{
                                          fontSize: 9, padding: "2px 6px", borderRadius: 10,
                                          border: "1px solid " + (active ? C.accent : C.border),
                                          background: active ? C.accentSoft : "#fff",
                                          color: active ? C.accent : C.muted,
                                          fontWeight: active ? 800 : 600,
                                          cursor: selectedTableLocked ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                                          opacity: selectedTableLocked ? 0.5 : 1,
                                        }}>{qa.label}</button>
                                      );
                                    })}
                                  </div>
                                )}
                                {prodForDetail && (
                                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.35 }}>
                                    <span style={{ fontWeight: 600, color: C.textMd }}>Stock:</span>{" "}
                                    {getBulkDisplayParts(prodForDetail) ? fmtStockDual(prodForDetail) : fmtStock(prodForDetail.stock || 0, prodForDetail.unit || "Pcs")}
                                    {" | "}
                                    <span style={{ fontWeight: 600, color: C.textMd }}>After sale:</span>{" "}
                                    {fmtDualFromPcs(remainingPcsAfterCartForProduct(prodForDetail, cart, freeCart), prodForDetail)}
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
          {cart.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>{isRestaurant ? "Add items to start order" : "Cart is empty - search and add products above"}</div>}

        </Card>
        {!isRestaurant && !isQuotationMode && freeItemsEnabled && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.red }}>Free Items (Complimentary)</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Gifts with purchase — stock deducted, shown as FREE on invoice</div>
              </div>
              {freeCart.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: "#dcfce7", padding: "3px 10px", borderRadius: 999 }}>{freeCart.length} free line{freeCart.length > 1 ? "s" : ""}</span>
              )}
            </div>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Add Free Item</label>
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
                  e.target.style.borderColor = C.border;
                  e.target.style.boxShadow = "none";
                  setTimeout(function () { setFreeDropPos(null); }, 180);
                }}
                placeholder={cart.length ? "Search product to add as free gift..." : "Add a paid item first"}
                style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: cart.length ? "#fff" : "#f8fafc", color: C.text, width: "100%", transition: "border-color .15s, box-shadow .15s", opacity: cart.length ? 1 : 0.7 }}
              />
              {freeSearch && filteredFreeProds.length > 0 && freeDropPos && cart.length > 0 && (
                <div style={{ position: "fixed", top: freeDropPos.top + 2, left: freeDropPos.left, width: freeDropPos.width, background: "#fff", border: "1px solid " + C.border, borderRadius: 8, zIndex: 9999, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.14)" }}>
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
                            <button type="button" onClick={function () { updateFreeQty(cartLineKey(item), Math.max(0, (Number(item.qty) || 0) - step)); }} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.border, background: "#fff", cursor: "pointer", fontWeight: 800 }}>-</button>
                            <span style={{ minWidth: 36, textAlign: "center", fontWeight: 700 }}>{item.qty}</span>
                            <button type="button" onClick={function () { updateFreeQty(cartLineKey(item), (Number(item.qty) || 0) + step); }} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + C.border, background: "#fff", cursor: "pointer", fontWeight: 800 }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: C.green }}>{FREE_ITEM_LABEL}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <button onClick={function () { removeFreeLine(cartLineKey(item)); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "14px 0", color: C.muted, fontSize: 12 }}>{cart.length ? "No free items yet" : "Add paid items first, then add complimentary gifts here"}</div>
            )}
          </Card>
        )}
        {!isRestaurant && !isQuotationMode && codSalesTrackEnabled && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.blue }}>COD / Delivery track</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Optional — saves to COD Database when checked</div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!codTrack.trackInCod}
                  disabled={!cart.length}
                  onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { trackInCod: e.target.checked }); }); }}
                />
                Record in COD database
              </label>
            </div>
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
                    style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", background: "#fff" }}
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
                      style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
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
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, display: "block", marginBottom: 4 }}>Alt phone (optional)</label>
                      <input
                        value={codTrack.altPhone}
                        onChange={function (e) { setCodTrack(function (x) { return Object.assign({}, x, { altPhone: e.target.value }); }); }}
                        placeholder="Second contact number"
                        style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
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
                      style={{ width: "100%", maxWidth: 200, border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
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
                      style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "14px 0", color: C.muted, fontSize: 12 }}>
                {cart.length ? "Check the box above to track this sale in COD Database" : "Add items to the cart first"}
              </div>
            )}
          </Card>
        )}
        </div>
        {isRestaurant && (
          <Card pad={0}>
            <div
              style={{
                background: "linear-gradient(180deg,#0a1628 0%,#0d1e38 60%,#0a1628 100%)",
                padding: "11px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px 12px 0 0",
              }}
            >
              <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, color: "#e8f1ff", letterSpacing: "-0.01em", lineHeight: 1.05 }}>Restaurant Workflow</div>
                  <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>Simple live table and order flow</div>
                </div>
                <button
                  type="button"
                  onClick={function () { setRestaurantWorkflowTab(restaurantWorkflowTab === "overview" ? "orders" : "overview"); }}
                  style={{ border: "1px solid #334155", background: "#111827", color: "#cbd5e1", borderRadius: 999, padding: "6px 11px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {restaurantWorkflowTab === "overview" ? "Recent Orders" : "Back to Workflow"}
                </button>
              </div>
              {(todayIngredientSummary || currentUserRole === "cashier") && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  {todayIngredientSummary && (
                    <span style={{ fontSize: 11, fontWeight: 800, border: "1px solid " + (todayIngredientSummary.negativeCount > 0 ? "#fca5a5" : "#fed7aa"), background: todayIngredientSummary.negativeCount > 0 ? "#fee2e2" : "#fff7ed", color: todayIngredientSummary.negativeCount > 0 ? "#991b1b" : "#9a3412", borderRadius: 999, padding: "3px 9px" }}>
                      {"Today's Ingredient Cost: "}{getCurrencySymbol()} {fmtNum(todayIngredientSummary.totalCost)}
                    </span>
                  )}
                  {currentUserRole === "cashier" && (
                    <span style={{ fontSize: 11, fontWeight: 800, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "3px 9px" }}>
                      Billing Mode
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: 14 }}>
            {restaurantUndo && (
              <div style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 8, border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>{restaurantUndo.msg}</span>
                <button
                  type="button"
                  onClick={function () { setCart((restaurantUndo.cart || []).map(function (x) { return Object.assign({}, x); })); setRestaurantUndo(null); focusPosSearch(); }}
                  style={{ border: "1px solid #93c5fd", background: "#fff", color: "#1d4ed8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Undo
                </button>
              </div>
            )}
            {restaurantWorkflowTab === "overview" && (
              <div style={{ display: "grid", gap: 12, alignItems: "start" }}>
                <div style={{ border: "1px solid " + C.borderLight, borderRadius: 12, padding: "12px", background: "#fff", boxShadow: "0 6px 16px rgba(15,23,42,0.05)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
                    {[["dine-in", "Dine-In"], ["takeaway", "Takeaway"], ["delivery", "Delivery"]].map(function (row) {
                      var active = restaurantOrderType === row[0];
                      return (
                        <button
                          key={"simple-type-" + row[0]}
                          type="button"
                          onClick={function () { setRestaurantOrderType(row[0]); }}
                          style={{ border: "1px solid " + (active ? C.accent : C.border), borderRadius: 9, padding: "8px 7px", background: active ? C.accentSoft : "#fff", color: active ? C.accent : C.textMd, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          {row[1]}
                        </button>
                      );
                    })}
                  </div>

                  {restaurantOrderType === "delivery" && (
                    <div style={{ display: "grid", gap: 7, marginBottom: 10 }}>
                      <input type="text" value={restaurantDeliveryDetails.name} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} placeholder="Customer name" style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit", background: "#fff" }} />
                      <input type="text" value={restaurantDeliveryDetails.phone} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { phone: sanitizeRestaurantPhone(e.target.value) }); }); }} placeholder="Phone" style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit", background: "#fff" }} />
                      <textarea value={restaurantDeliveryDetails.address} onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }} placeholder="Address" rows={2} style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit", background: "#fff", resize: "vertical" }} />
                    </div>
                  )}

                  <input
                    type="text"
                    value={restaurantOrderNote}
                    onChange={function (e) { setRestaurantOrderNote(e.target.value); }}
                    placeholder="Order note (optional)"
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit", background: "#fff", marginBottom: 10 }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                      type="button"
                      onClick={sendToKitchen}
                      disabled={!cart.length || selectedTableLocked}
                      style={{ border: "none", borderRadius: 8, padding: "9px 10px", background: (!cart.length || selectedTableLocked) ? "#9ca3af" : "#ea580c", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: (!cart.length || selectedTableLocked) ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      Send to Kitchen
                    </button>
                    <button
                      type="button"
                      onClick={clearCurrentCart}
                      disabled={!cart.length || selectedTableLocked}
                      style={{ border: "1px solid " + C.border, borderRadius: 8, padding: "9px 10px", background: (!cart.length || selectedTableLocked) ? "#f3f4f6" : "#fff", color: (!cart.length || selectedTableLocked) ? "#9ca3af" : C.textMd, fontSize: 12.5, fontWeight: 700, cursor: (!cart.length || selectedTableLocked) ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      Clear Cart
                    </button>
                  </div>
                </div>

                {restaurantOrderType === "dine-in" && (
                  <div style={{ border: "1px solid " + C.borderLight, borderRadius: 12, padding: "12px", background: "#fff", boxShadow: "0 6px 16px rgba(15,23,42,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>Table Selection</div>
                      <button
                        type="button"
                        onClick={function () { setShowRestaurantTableManager(true); }}
                        style={{ fontSize: 11, fontWeight: 800, border: "1px solid " + C.border, background: "#fff", color: C.textMd, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Manage Tables
                      </button>
                    </div>

                    <select value={selectedTableId} onChange={function (e) { handleRestaurantTablePick(e.target.value); }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, background: "#fff", fontFamily: "inherit", marginBottom: 8 }}>
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

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                      {restaurantTables.map(function (t) {
                        var tableState = getRestaurantTableComputedStatus(t.id, t.status);
                        var stat = tableOrderStats(t.id);
                        var active = selectedTableId === t.id;
                        var bg = tableState === "occupied" ? "#ef4444" : (tableState === "pending" ? "#f59e0b" : "#22c55e");
                        return (
                          <button
                            key={"simple-table-" + t.id}
                            type="button"
                            onClick={function () { handleRestaurantTablePick(t.id); }}
                            style={{ border: active ? "2px solid #3b82f6" : "1px solid rgba(15,23,42,0.12)", borderRadius: 10, padding: "8px", background: bg, color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit", minHeight: 74 }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{t.name || t.id}</div>
                            <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 2 }}>{tableState === "occupied" ? "Occupied" : (tableState === "pending" ? "Pending" : "Free")}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{stat.count ? (stat.count + " orders") : "No orders"}</div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedTableReopenOrder && !selectedTableLocked && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: C.accent, fontWeight: 700 }}>
                        Loaded existing order ({(selectedTableReopenOrder.items || []).length} items)
                      </div>
                    )}
                    {!selectedTableReopenOrder && !selectedTableLocked && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>
                        Ready for new order
                      </div>
                    )}
                    {selectedTableLocked && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: "#166534", fontWeight: 800 }}>
                        Order closed
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}            {restaurantWorkflowTab === "orders" && (
              <div style={{ border: "1px solid " + C.borderLight, borderRadius: 14, padding: "14px 15px", background: "#fcfdff", boxShadow: "0 8px 20px rgba(15,23,42,0.04)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.textMd, marginBottom: 2 }}>Recent Orders</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Click any order to open the detailed view and manage billing or status.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 540, overflowY: "auto" }}>
                  {restaurantOrders.length === 0 && (
                    <div style={{ textAlign: "center", padding: "22px 12px", color: C.muted, fontSize: 13 }}>
                      No restaurant orders yet.
                    </div>
                  )}
                  {restaurantOrders.map(function (o) {
                    var st = restaurantStatusStyle(o.status);
                    var orderTypeLabel = o.type === "takeaway" ? "Takeaway" : (o.type === "delivery" ? "Delivery" : "Dine-in");
                    return (
                      <button
                        key={"orders-tab-" + o.id}
                        type="button"
                        onClick={function () { setRestaurantOrderDetailId(o.id); }}
                        style={{ border: "1px solid " + C.border, borderRadius: 12, padding: "12px 13px", background: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 10px rgba(15,23,42,0.04)" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{o.tableId ? getRestaurantTableDisplayName(o.tableId) : orderTypeLabel}</div>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>{restaurantStatusLabel(o.status)}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{orderTypeLabel} - {(o.items || []).length} items</div>
                        <div style={{ fontSize: 11.5, color: C.textMd }}>By: {o.createdBy || "Staff"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          </Card>
        )}
      </div>

      {/* Right panel */}
      <div style={{ width: 310, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "calc(100vh - 24px)" }}>
        {false && isRestaurant && (
          <Card pad={12}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>Restaurant Workflow</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>
                {restaurantOrders.length} orders
              </span>
            </div>
            {restaurantQuickSellProducts.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Quick Sell
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {restaurantQuickSellProducts.map(function (p) {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={selectedTableLocked}
                        onClick={function () { addToCart(p); focusPosSearch(); }}
                        style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 999, padding: "4px 9px", background: "#fff", color: C.textMd, cursor: selectedTableLocked ? "not-allowed" : "pointer", fontWeight: 700, opacity: selectedTableLocked ? 0.55 : 1 }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {restaurantRecentItems.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Recent Items
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {restaurantRecentItems.map(function (pid) {
                    var p = state.products.find(function (x) { return x.id === pid && x.status !== "inactive" && !isRepair3pInternalProduct(x); });
                    if (!p) return null;
                    return (
                      <button
                        key={"ri-" + pid}
                        type="button"
                        disabled={selectedTableLocked}
                        onClick={function () { addToCart(p); focusPosSearch(); }}
                        style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 999, padding: "4px 9px", background: "#fff", color: C.textMd, cursor: selectedTableLocked ? "not-allowed" : "pointer", fontWeight: 700, opacity: selectedTableLocked ? 0.55 : 1 }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {restaurantCategoryDisplay.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Category Order
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {restaurantCategoryDisplay.map(function (cat) {
                    return (
                      <span key={cat} style={{ fontSize: 10, border: "1px solid " + C.borderLight, borderRadius: 999, padding: "2px 7px", background: "#f8fafc", color: C.textMd, fontWeight: 700 }}>
                        {cat}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Order Type
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["dine-in", "Dine-in"], ["takeaway", "Takeaway"], ["delivery", "Delivery"]].map(function (row) {
                  var active = restaurantOrderType === row[0];
                  return (
                    <button
                      key={row[0]}
                      type="button"
                      onClick={function () { setRestaurantOrderType(row[0]); }}
                      style={{ fontSize: 11, border: "1px solid " + (active ? C.accent : C.border), borderRadius: 999, padding: "5px 10px", background: active ? C.accentSoft : "#fff", color: active ? C.accent : C.textMd, cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}
                    >
                      {row[1]}
                    </button>
                  );
                })}
              </div>
            </div>
            {restaurantOrderType !== "dine-in" && (
              <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid " + C.borderLight, background: "#f8fafc", fontSize: 12, fontWeight: 700, color: C.textMd }}>
                {restaurantOrderType === "takeaway" ? "Takeaway Order" : "Delivery Order"}
              </div>
            )}
            {restaurantOrderType === "delivery" && (
              <div style={{ marginBottom: 10, border: "1px solid " + C.borderLight, borderRadius: 8, padding: "9px 10px", background: "#f8fafc" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Delivery Customer
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input
                    type="text"
                    value={restaurantDeliveryDetails.name}
                    onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }}
                    placeholder="Customer Name"
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff" }}
                  />
                  <input
                    type="text"
                    value={restaurantDeliveryDetails.phone}
                    onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { phone: sanitizeRestaurantPhone(e.target.value) }); }); }}
                    placeholder="Phone"
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff" }}
                  />
                  <textarea
                    value={restaurantDeliveryDetails.address}
                    onChange={function (e) { setRestaurantDeliveryDetails(function (x) { return Object.assign({}, x, { address: e.target.value }); }); }}
                    placeholder="Address"
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff", resize: "vertical" }}
                  />
                </div>
              </div>
            )}
            {restaurantOrderType === "dine-in" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", display: "block" }}>
                  Table
                </label>
                <button
                  type="button"
                  onClick={function () { setShowRestaurantTableManager(true); }}
                  style={{ fontSize: 10.5, fontWeight: 800, border: "1px solid " + (isRestaurantUsingDefaultTables ? "#93c5fd" : C.border), background: isRestaurantUsingDefaultTables ? "#eff6ff" : "#fff", color: isRestaurantUsingDefaultTables ? "#1d4ed8" : C.textMd, borderRadius: 999, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap", boxShadow: isRestaurantUsingDefaultTables ? "0 0 0 2px rgba(59,130,246,0.10)" : "none" }}
                  title="Manage tables (add / rename / delete)"
                >
                  Manage
                </button>
              </div>
              {isRestaurantUsingDefaultTables && (
                <div style={{ marginBottom: 6, fontSize: 10.5, color: "#1d4ed8", fontWeight: 700 }}>
                  Click Manage to add more tables
                </div>
              )}
              <select
                value={selectedTableId}
                onChange={function (e) { handleRestaurantTablePick(e.target.value); }}
                style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff", fontFamily: "inherit" }}
              >
                {restaurantTables.map(function (t) {
                  var ts = restaurantTableStatusUi(getRestaurantTableComputedStatus(t.id, t.status));
                  var stat = tableOrderStats(t.id);
                  return (
                    <option key={t.id} value={t.id}>
                      {(t.name || t.id) + " - " + ts.label + (stat.count ? (" - " + stat.count + " orders") : " - New Order")}
                    </option>
                  );
                })}
              </select>
              <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px" }}>Free: {restaurantTableCounts.free}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "2px 7px" }}>Occupied: {restaurantTableCounts.occupied}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "2px 7px" }}>Pending: {restaurantTableCounts.pending}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6, marginTop: 8 }}>
                {restaurantTables.map(function (t) {
                  var ts = restaurantTableStatusUi(getRestaurantTableComputedStatus(t.id, t.status));
                  var stat = tableOrderStats(t.id);
                  var active = selectedTableId === t.id;
                  var needsAttention = restaurantTableNeedsAttention(t.id);
                  return (
                    <button
                      key={"table-board-" + t.id}
                      type="button"
                      onClick={function () { handleRestaurantTablePick(t.id); }}
                      style={{
                        border: (needsAttention ? "2px solid #f59e0b" : (active ? "2px solid " + C.accent : "1px solid " + C.borderLight)),
                        borderRadius: 10,
                        padding: "6px 7px",
                        background: ts.bg,
                        color: ts.fg,
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: needsAttention
                          ? "0 0 0 2px rgba(245,158,11,0.22), 0 0 18px rgba(245,158,11,0.18)"
                          : (active ? "0 0 0 2px rgba(41,121,255,0.22), 0 10px 18px rgba(41,121,255,0.18)" : "0 1px 2px rgba(15,23,42,0.06)"),
                        transform: active ? "scale(1.02)" : "scale(1)",
                        transition: "transform .12s ease, box-shadow .12s ease, border-color .12s ease",
                        fontFamily: "inherit",
                      }}
                      title={(t.name || t.id) + " - " + ts.label}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 900 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ts.dot, display: "inline-block" }} />
                        {t.name || t.id}
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 2 }}>{ts.label}</div>
                      <div style={{ fontSize: 9, fontWeight: 800, marginTop: 2, opacity: 0.95 }}>{stat.count ? (stat.count + " orders") : "New Order"}</div>
                      {needsAttention && <div style={{ fontSize: 8.5, marginTop: 1, fontWeight: 800, color: "#b45309" }}>Attention needed</div>}
                      <div style={{ fontSize: 8.5, marginTop: 1, opacity: 0.85 }}>Last: {minutesAgoLabel(stat.lastAt)}</div>
                    </button>
                  );
                })}
              </div>
              {selectedTableReopenOrder && !selectedTableLocked && (
                <div style={{ marginTop: 5, fontSize: 10.5, color: C.accent, fontWeight: 700 }}>
                  Loaded existing order for this table ({(selectedTableReopenOrder.items || []).length} items)
                </div>
              )}
              {!selectedTableReopenOrder && !selectedTableLocked && (
                <div style={{ marginTop: 5, fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
                  Start new order
                </div>
              )}
              {selectedTableLocked && (
                <div style={{ marginTop: 5, fontSize: 10.5, color: "#166534", fontWeight: 800 }}>
                  Order Closed
                </div>
              )}
            </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", display: "block", marginBottom: 5 }}>
                Order Note
              </label>
              <input
                type="text"
                value={restaurantOrderNote}
                onChange={function (e) { setRestaurantOrderNote(e.target.value); }}
                placeholder="Takeaway / VIP customer / Serve fast"
                style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff" }}
              />
            </div>
            <button
              type="button"
              onClick={sendToKitchen}
              disabled={!cart.length || selectedTableLocked}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 8,
                padding: "9px 12px",
                background: (!cart.length || selectedTableLocked) ? "#9ca3af" : "linear-gradient(135deg,#ea580c,#c2410c)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: (!cart.length || selectedTableLocked) ? "not-allowed" : "pointer",
                marginBottom: 10,
              }}
            >
              Send to Kitchen
            </button>
            <button
              type="button"
              onClick={clearCurrentCart}
              disabled={!cart.length || selectedTableLocked}
              style={{
                width: "100%",
                border: "1px solid " + C.border,
                borderRadius: 8,
                padding: "8px 10px",
                background: (!cart.length || selectedTableLocked) ? "#f3f4f6" : "#fff",
                color: (!cart.length || selectedTableLocked) ? "#9ca3af" : C.textMd,
                fontSize: 12,
                fontWeight: 700,
                cursor: (!cart.length || selectedTableLocked) ? "not-allowed" : "pointer",
                marginBottom: 10,
                fontFamily: "inherit",
              }}
            >
              Clear Cart
            </button>
            {restaurantToast && (
              <div style={{ marginTop: -4, marginBottom: 8, padding: "7px 9px", borderRadius: 8, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontSize: 11.5, fontWeight: 800 }}>
                {restaurantToast}
              </div>
            )}
            {restaurantUndo && (
              <div style={{ marginTop: -2, marginBottom: 8, padding: "7px 9px", borderRadius: 8, border: "1px solid #93c5fd", background: "#eff6ff", color: "#1d4ed8", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>{restaurantUndo.msg}</span>
                <button
                  type="button"
                  onClick={function () { setCart((restaurantUndo.cart || []).map(function (x) { return Object.assign({}, x); })); setRestaurantUndo(null); focusPosSearch(); }}
                  style={{ border: "1px solid #93c5fd", background: "#fff", color: "#1d4ed8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Undo
                </button>
              </div>
            )}
            {restaurantOrders.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {restaurantOrders.slice(0, 8).map(function (o) {
                  var st = restaurantStatusStyle(o.status);
                  var orderTypeLabel = o.type === "takeaway" ? "Takeaway" : (o.type === "delivery" ? "Delivery" : "Dine-in");
                  var deliveryInfo = o.type === "delivery" ? (o.deliveryDetails || {}) : null;
                  var shortAddress = deliveryInfo && deliveryInfo.address
                    ? (deliveryInfo.address.length > 60 ? deliveryInfo.address.slice(0, 60) + "..." : deliveryInfo.address)
                    : "";
                  return (
                    <div key={o.id} style={{ border: "1px solid " + C.border, borderRadius: 8, padding: "8px 9px", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{o.tableId ? getRestaurantTableDisplayName(o.tableId) : orderTypeLabel}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: st.bg, color: st.fg, textTransform: "uppercase" }}>
                          {restaurantStatusLabel(o.status)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                        {o.type === "takeaway" ? "Takeaway - " : (orderTypeLabel + " - ")}
                        {(o.items || []).length} items
                        {(o.splitBills && o.splitBills.length > 0) ? (" - " + o.splitBills.length + " split bill(s)") : ""}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.textMd, marginBottom: 6 }}>
                        By: {o.createdBy || "Staff"}
                      </div>
                      {deliveryInfo && (deliveryInfo.name || deliveryInfo.phone || deliveryInfo.address) && (
                        <div style={{ fontSize: 10.5, color: C.textMd, marginBottom: 6, background: "#f8fafc", border: "1px solid " + C.borderLight, borderRadius: 6, padding: "4px 6px" }}>
                          {deliveryInfo.name && <div>Name: {deliveryInfo.name}</div>}
                          {deliveryInfo.phone && (
                            <div>
                              Phone:{" "}
                              <button
                                type="button"
                                onClick={function () { openDeliveryCall(deliveryInfo.phone); }}
                                style={{ background: "none", border: "none", color: C.accent, padding: 0, cursor: "pointer", fontSize: 10.5, fontWeight: 800, fontFamily: "inherit" }}
                              >
                                {deliveryInfo.phone}
                              </button>
                            </div>
                          )}
                          {shortAddress && <div>Address: {shortAddress}</div>}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {deliveryInfo.address && (
                              <button
                                type="button"
                                onClick={function () { openDeliveryMap(deliveryInfo.address); }}
                                style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
                              >
                                Maps
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={function () { copyDeliveryDetails(deliveryInfo); }}
                              style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      )}
                      {o.note && (
                        <div style={{ fontSize: 10.5, color: C.textMd, marginBottom: 6, background: "#f8fafc", border: "1px solid " + C.borderLight, borderRadius: 6, padding: "4px 6px" }}>
                          Note: {o.note}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button type="button" disabled={isOrderFullyBilled(o)} onClick={function () { setRestaurantOrderStatus(o.id, "preparing"); }} style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: isOrderFullyBilled(o) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(o) ? 0.5 : 1 }}>Preparing</button>
                        <button type="button" disabled={isOrderFullyBilled(o)} onClick={function () { setRestaurantOrderStatus(o.id, "ready"); }} style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: isOrderFullyBilled(o) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(o) ? 0.5 : 1 }}>Ready</button>
                        <button type="button" disabled={isOrderFullyBilled(o)} onClick={function () { setRestaurantOrderStatus(o.id, "served"); }} style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: isOrderFullyBilled(o) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(o) ? 0.5 : 1 }}>Served</button>
                        {!isOrderFullyBilled(o) && restaurantBillingAllowed && (
                          <button
                            type="button"
                            onClick={function () { billRestaurantOrder(o.id); }}
                            disabled={isCheckingOut || billingOrderId === o.id}
                            style={{ fontSize: 10, border: "none", borderRadius: 5, padding: "3px 6px", background: "#1d4ed8", color: "#fff", cursor: isCheckingOut || billingOrderId === o.id ? "not-allowed" : "pointer", opacity: isCheckingOut || billingOrderId === o.id ? 0.65 : 1 }}
                          >
                            {billingOrderId === o.id ? "Billing..." : ((o.splitBills && o.splitBills.length > 0) ? "Bill Remaining" : "Bill Order")}
                          </button>
                        )}
                        {!isOrderFullyBilled(o) && restaurantBillingAllowed && (
                          <button
                            type="button"
                            onClick={function () { setSplitOrderId(splitOrderId === o.id ? "" : o.id); setItemSplitPick({}); }}
                            style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 6px", background: "#fff", cursor: "pointer" }}
                          >
                            Split Bill
                          </button>
                        )}
                      </div>
                      {!isOrderFullyBilled(o) && !restaurantBillingAllowed && (
                        <div style={{ marginTop: 6, fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
                          Billing available at counter
                        </div>
                      )}
                      {splitOrderId === o.id && !isOrderFullyBilled(o) && (
                        <div style={{ marginTop: 8, borderTop: "1px dashed " + C.border, paddingTop: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Equal Split</div>
                          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                            {[2, 3, 4].map(function (n) {
                              return (
                                <button key={n} type="button" onClick={function () { billRestaurantEqualSplit(o.id, n); }} disabled={isCheckingOut || billingOrderId === o.id} style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 5, padding: "3px 8px", background: "#fff", cursor: isCheckingOut || billingOrderId === o.id ? "not-allowed" : "pointer" }}>
                                  {n} People
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Item-based Split</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6, maxHeight: 110, overflowY: "auto" }}>
                            {getOrderRemainingItems(o).map(function (ri, idx) {
                              var pickKey = o.id + "::" + idx;
                              return (
                                <label key={pickKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMd }}>
                                  <input type="checkbox" checked={!!itemSplitPick[pickKey]} onChange={function () { toggleItemSplitPick(o.id, idx); }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {ri.name} x {ri.qty} {ri.saleUnit || "Pcs"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <button type="button" onClick={function () { billRestaurantItemSplit(o.id); }} disabled={isCheckingOut || billingOrderId === o.id} style={{ fontSize: 10, border: "none", borderRadius: 5, padding: "4px 8px", background: "#0f766e", color: "#fff", cursor: isCheckingOut || billingOrderId === o.id ? "not-allowed" : "pointer", opacity: isCheckingOut || billingOrderId === o.id ? 0.65 : 1 }}>
                            Bill Selected Items
                          </button>
                        </div>
                      )}
                      {isOrderFullyBilled(o) && (
                        <div style={{ marginTop: 6, fontSize: 10.5, color: "#166534", fontWeight: 700 }}>
                          Fully billed
                        </div>
                      )}
                      {(o.splitBills || []).length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 10, color: C.muted }}>
                          Split invoice IDs: {(o.splitBills || []).map(function (sb) { return sb.invoicedSaleId; }).filter(Boolean).slice(0, 5).join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
        <Card>
          <Input
            label="Discount (Rs)"
            type="number"
            value={discount}
            onChange={function (e) {
              var nextVal = e.target.value;
              var nextNum = normalizeDiscountNumber(nextVal);
              if (!canOverrideDiscount && nextNum > 0) {
                showPermissionDenied("apply discount overrides");
                return;
              }
              setDiscount(nextVal);
            }}
            onBlur={function () {
              if (discount === "" || discount === null || discount === undefined) { setDiscount(""); return; }
              var cleaned = normalizeDiscountNumber(discount);
              setDiscount(String(cleaned));
            }}
            placeholder="0"
          />
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", margin: "12px 0", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.textMd }}><span>Sub Total</span><span>{getCurrencySymbol()} {fmtNum(subTotal)}</span></div>
            {discAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.red }}><span>Discount</span><span>- {getCurrencySymbol()} {fmtNum(discAmt)}</span></div>}
            {state.settings && state.settings.taxEnabled && posTaxLines && posTaxLines.length > 0 && posTaxLines.map(function (tl, ti) {
              return (
                <div key={"ptx-" + ti + "-" + (tl.name || "")} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted }}>
                  <span>{tl.name} ({fmtNum(tl.rate)}%)</span>
                  <span>{getCurrencySymbol()} {fmtNum(tl.amount)}</span>
                </div>
              );
            })}
            {state.settings && state.settings.taxEnabled && posTotalTax > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: C.textMd }}><span>Total Tax</span><span>{getCurrencySymbol()} {fmtNum(posTotalTax)}</span></div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, color: C.navBg, borderTop: "1px solid " + C.border, paddingTop: 8, marginTop: 2 }}><span>GRAND TOTAL</span><span>{getCurrencySymbol()} {fmtNum(total)}</span></div>
          </div>
          {isQuotationMode ? (
            <React.Fragment>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Notes / Terms</label>
                <textarea
                  value={quotationNotes}
                  onChange={function (e) { setQuotationNotes(e.target.value); }}
                  placeholder="Validity, payment terms, delivery notes..."
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "#fff" }}
                />
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.borderLight }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Save quotation</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Btn stack={true} onClick={function () { saveQuotation(false); }} disabled={!cart.length || isSavingQuotation || !canEditInvoices} col="blue" full>
                    <PosShortcutBtnContent label="Save Only" shortcut="Ctrl + S" busy={isSavingQuotation} busyText="Saving..." onDark={true} />
                  </Btn>
                  <Btn stack={true} onClick={openQuotationPrintPicker} disabled={!cart.length || isSavingQuotation || !canEditInvoices} col="gray" full>
                    <PosShortcutBtnContent label="Print" shortcut="Ctrl + P to print" busy={isSavingQuotation} busyText="Saving..." />
                  </Btn>
                  {renderPosWhatsAppBtn({
                    onClick: openQuotationWhatsApp,
                    disabled: !cart.length || isSavingQuotation || !canEditInvoices,
                    busy: isSavingQuotation,
                    busyText: "Saving...",
                    title: "Save quotation and share as PDF via WhatsApp",
                  })}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.45 }}>
                  Saved quotations appear under <strong>Invoices → Quotations</strong>. Convert to invoice when the customer confirms.
                </div>
              </div>
            </React.Fragment>
          ) : (
          <React.Fragment>
          {/* Auto payment status badge ? updates live based on splitRows */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>Payment Mode</div>
            <div style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800,
              background: payStatus === "Paid" ? "#dcfce7" : payStatus === "Partial" ? "#fef9c3" : "#fee2e2",
              color: payStatus === "Paid" ? C.green : payStatus === "Partial" ? C.amber : C.red }}>
              {payStatus === "Paid" ? "Fully Paid" : payStatus === "Partial" ? "Partial" : "Unpaid"}
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", marginBottom: 5 }}>Receive Via</div>
          <div style={{ marginBottom: 8 }}>
            {posSplitRows && posSplitRows.length > 0 ? (
              <div style={{ background: "#f0f9f4", borderRadius: 9, padding: "9px 12px", border: "1px solid #9ee8ce", cursor: posSetupBlocked || isCheckingOut ? "not-allowed" : "pointer", opacity: posSetupBlocked || isCheckingOut ? 0.55 : 1 }} title={posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : "Edit payment split"} onClick={function () { if (posSetupBlocked || isCheckingOut) return; setPosSplitModal(true); }}>
                {posSplitRows.map(function (r, i) {
                  return <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: C.textMd }}>{r.method === "Cheque" ? "" : r.method === "Bank" ? "" : ""}{r.method}</span><strong style={{ color: r.method === "Cheque" ? "#d97706" : C.green }}>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}</strong></div>;
                })}
                <div style={{ fontSize: 11, color: C.accent, marginTop: 4, fontWeight: 600 }}>Click to edit payment</div>
              </div>
            ) : (
              <button
                type="button"
                disabled={posSetupBlocked || isCheckingOut}
                aria-describedby={posCheckoutAriaDesc}
                title={posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : "Record payment"}
                onClick={function () { if (posSetupBlocked || isCheckingOut) return; setPosSplitModal(true); setPayMode("partial"); }}
                style={{ width: "100%", padding: "10px", borderRadius: 9, border: "2px solid " + (posSetupBlocked || isCheckingOut ? "#9ca3af" : "#1b5e20"), background: posSetupBlocked || isCheckingOut ? "#e5e7eb" : "#1b5e20", color: posSetupBlocked || isCheckingOut ? "#6b7280" : "#fff", fontWeight: 700, fontSize: 13, cursor: posSetupBlocked || isCheckingOut ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {isCheckingOut ? "Processing..." : "Pay"}
              </button>
            )}
          </div>
          {posCashMethod === "Cheque" && posChequeList.length > 0 && (
            <div style={{ background: "#f5f3ff", borderRadius: 9, padding: "10px 12px", border: "1px solid #ddd6fe", marginBottom: 8, cursor: "pointer" }} onClick={function () { setPosChqModal(true); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>{posChequeList.length} cheque(s) added</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed" }}>{getCurrencySymbol()} {fmtNum(posChequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0))}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9061f9", marginTop: 3 }}>Click to edit cheques</div>
            </div>
          )}
          {payMode === "partial" && !(posSplitRows && posSplitRows.length > 0) && <div style={{ marginBottom: 8 }}><Input label="Amount Paid" type="number" value={paidAmt} onChange={function (e) { setPaidAmt(e.target.value); }} placeholder="0" /></div>}

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: C.muted }}>Paid</span><span style={{ fontWeight: 700, color: C.green }}>{getCurrencySymbol()} {fmtNum(paidNum)}</span></div>
          {balanceDue > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: C.muted }}>Balance Due</span><span style={{ fontWeight: 700, color: C.red }}>{getCurrencySymbol()} {fmtNum(balanceDue)}</span></div>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: state.settings.warrantyEnabled ? "pointer" : "not-allowed", margin: "10px 0", padding: "9px 12px", borderRadius: 8, border: "1.5px solid " + (includeWarranty && state.settings.warrantyEnabled ? C.accent : C.border), background: includeWarranty && state.settings.warrantyEnabled ? C.accentSoft : "#fafbff", opacity: state.settings.warrantyEnabled ? 1 : 0.5 }}>
            <input type="checkbox" checked={includeWarranty} disabled={!state.settings.warrantyEnabled} onChange={function (e) { setIncludeWarranty(e.target.checked); }} style={{ width: 15, height: 15, accentColor: C.accent }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: includeWarranty && state.settings.warrantyEnabled ? C.accent : C.textMd }}>Include Warranty Policy</div>
              {!state.settings.warrantyEnabled && <div style={{ fontSize: 11, color: C.muted }}>Disabled in Settings</div>}
            </div>
          </label>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.borderLight }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Complete sale</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Btn stack={true} onClick={function () { saveAndFinish(false); }} disabled={!cart.length || posSetupBlocked || isCheckingOut} aria-describedby={posCheckoutAriaDesc} title={posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : undefined} col="blue" full>
                <PosShortcutBtnContent label="Save Only" shortcut="Ctrl + S" busy={isCheckingOut} onDark={true} />
              </Btn>

              {(function () {
                var checkoutDisabled = !cart.length || posSetupBlocked || isCheckingOut;
                var checkoutTitle = posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : undefined;
                var waTitle = posSetupBlocked ? TC_SETUP_DISABLE_TITLE : isCheckingOut ? "Processing..." : "Save invoice and share as PDF via WhatsApp";
                return (
                  <React.Fragment>
                    <Btn stack={true} onClick={openPosPrintPicker} disabled={checkoutDisabled} aria-describedby={posCheckoutAriaDesc} title={checkoutTitle} col="gray" full>
                      <PosShortcutBtnContent label="Print" shortcut="Ctrl + P to print" busy={isCheckingOut} />
                    </Btn>
                    {renderPosWhatsAppBtn({
                      onClick: saveAndWhatsApp,
                      disabled: checkoutDisabled,
                      busy: isCheckingOut,
                      ariaDescribedby: posCheckoutAriaDesc,
                      title: waTitle,
                    })}
                  </React.Fragment>
                );
              })()}
            </div>
            {(posSetupBlocked || isCheckingOut) && (
              <div id={posCheckoutHintId} role="status" aria-live="polite" style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                {isCheckingOut ? "Processing..." : TC_SETUP_DISABLE_TITLE}
              </div>
            )}
          </div>
          </React.Fragment>
          )}
        </Card>

        {/* ?? On Hold — saved sales & quotations ?? */}
        {heldInvoices.length > 0 && (
          <Card pad={12}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>⏸</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>On Hold</span>
                <span style={{ background: "#2979ff", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>{heldInvoices.length}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {heldInvoices.map(function (h) {
                var hTime = h.heldAt ? new Date(h.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                var hDate = h.heldAt ? new Date(h.heldAt).toLocaleDateString() : "";
                var cartCount = (h.cart || []).length + ((h.freeCart || []).length);
                var cartTotal = (h.cart || []).reduce(function (a, it) { return a + posLineAmount(it); }, 0) - (parseFloat(h.discount) || 0);
                var custLabel = h.label || h.custSearch || (h.custMode === "walkin" ? "Walk-in" : h.newCust && h.newCust.name ? h.newCust.name : "Walk-in");
                var isQuotHold = h.holdKind === "quotation" || h.posPageTab === "quotation";
                var docNo = isQuotHold ? (h.quotationNo || "") : (h.invoiceNo || "");
                return (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#f0f4ff", borderRadius: 9, border: "1.5px solid #c7d4f8" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{custLabel}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: isQuotHold ? "#fef3c7" : "#e0f2fe", color: isQuotHold ? "#92400e" : "#0369a1" }}>{isQuotHold ? "Quotation" : "Sale"}</span>
                        {activeHeldId === h.id ? <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "#dcfce7", color: "#166534" }}>Active</span> : null}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {docNo ? <span style={{ fontFamily: "monospace", marginRight: 6 }}>{docNo}</span> : null}
                        {cartCount} item{cartCount !== 1 ? "s" : ""} · {getCurrencySymbol()} {fmtNum(cartTotal)} · {hDate} {hTime}
                      </div>
                    </div>
                    <Btn sm col="blue" onClick={function () {
                      if (cart.length > 0 || freeCart.length > 0) {
                        showConfirm("Loading this held " + (isQuotHold ? "quotation" : "invoice") + " will replace your current cart. Continue?", function () {
                          loadHeldInvoice(h);
                        });
                      } else {
                        loadHeldInvoice(h);
                      }
                    }}>Continue</Btn>
                    <button onClick={function () {
                      showConfirm("Delete this held " + (isQuotHold ? "quotation" : "invoice") + "?", function () { deleteHeldInvoice(h.id); });
                    }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px" }} title="Delete">✕</button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

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

      {/* ?? POS Cheque Modal ?? */}
      {posChqModal && (
        <Modal title="Cheques to Receive - Add Payment Cheques" onClose={function () { setPosChequeList([]); setPosChqForm({ no: "", bank: "", amount: "", due: today() }); setPosCashMethod("Cash"); setPosChqModal(false); }} medium>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
              Add one or more cheques. Each cheque will be tracked separately in the Cheque Register and marked Cleared when received.
            </div>
            {/* Add row */}
            <div style={{ background: "#f5f3ff", borderRadius: 10, padding: "16px", border: "1px solid #ddd6fe", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 12 }}>Add Cheque</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
                <Input label="Cheque No *" value={posChqForm.no} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { no: e.target.value }); }); }} placeholder="e.g. 001234" />
                <Input label="Bank Name" value={posChqForm.bank} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { bank: e.target.value }); }); }} placeholder="e.g. HNB" />
                <Input label="Amount (Rs) *" type="number" value={posChqForm.amount} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { amount: e.target.value }); }); }} placeholder="0" />
                <Input label="Due Date *" type="date" value={posChqForm.due} onChange={function (e) { setPosChqForm(function (x) { return Object.assign({}, x, { due: e.target.value }); }); }} />
                <button onClick={function () {
                  if (!posChqForm.no.trim() || !parseFloat(posChqForm.amount)) { showAlert("Enter cheque number and amount."); return; }
                  setPosChequeList(function (l) { return l.concat([Object.assign({}, posChqForm, { id: uid() })]); });
                  setPosChqForm({ no: "", bank: "", amount: "", due: today() });
                }} style={{ padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>Add Cheque</button>
              </div>
            </div>
            {/* Cheque list */}
            {posChequeList.length > 0 ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Added Cheques</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {posChequeList.map(function (c, i) {
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 9, padding: "12px 16px", border: "1px solid #ddd6fe" }}>
                        <span style={{ fontSize: 20 }}>{UI.cheque}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#7c3aed" }}>#{c.no}</div>
                          {c.bank && <div style={{ fontSize: 12, color: C.muted }}>{c.bank}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: C.green }}>{getCurrencySymbol()} {fmtNum(parseFloat(c.amount) || 0)}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>Due: {c.due}</div>
                        </div>
                        <button onClick={function () { setPosChequeList(function (l) { return l.filter(function (_, j) { return j !== i; }); }); }}
                          style={{ background: "#fde8ed", color: C.red, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Remove</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#ede9fe", borderRadius: 10, fontWeight: 800, fontSize: 14 }}>
                  <span style={{ color: "#7c3aed" }}>{posChequeList.length} cheque(s) total</span>
                  <span style={{ color: "#7c3aed", fontSize: 18 }}>{getCurrencySymbol()} {fmtNum(posChequeList.reduce(function (a, c) { return a + (parseFloat(c.amount) || 0); }, 0))}</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13, background: "#fafbff", borderRadius: 10, border: "1.5px dashed " + C.border }}>
                No cheques added yet. Use the form above to add cheques.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn col="gray" onClick={function () { setPosChequeList([]); setPosCashMethod("Cash"); setPosChqModal(false); }}>Cancel</Btn>
            <Btn col="blue" onClick={function () { setPosChqModal(false); }} disabled={posChequeList.length === 0}>Done - {posChequeList.length} cheque(s) saved</Btn>
          </div>
        </Modal>
      )}

      {/* Hidden off-screen invoice preview ? used by doPopupPrint to get innerHTML */}
      {pendingPrint && (
        <div id="pos-print-preview" style={{ position: "fixed", left: -9999, top: -9999, width: (pendingPrint.mode === "thermal58") ? 230 : (pendingPrint.mode === "thermal80" || pendingPrint.mode === "thermal") ? 310 : 794, pointerEvents: "none", opacity: 0 }}>
          {(pendingPrint.mode === "thermal" || pendingPrint.mode === "thermal58" || pendingPrint.mode === "thermal80")
            ? <InvoiceThermal inv={Object.assign({}, pendingPrint.sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} width={pendingPrint.mode === "thermal58" ? 218 : 302} documentKind={pendingPrint.kind === "quotation" ? "quotation" : "invoice"} />
            : <InvoiceA4 inv={Object.assign({}, pendingPrint.sale, { includeWarranty: pendingPrint.warranty })} settings={pendingPrint.settings} invoiceLang={pendingPrint.invoiceLang != null ? pendingPrint.invoiceLang : ((pendingPrint.settings && pendingPrint.settings.defaultInvoiceLang) || "en")} size={pendingPrint.mode || "a4"} documentKind={pendingPrint.kind === "quotation" ? "quotation" : "invoice"} />
          }
        </div>
      )}

      {waSharePicker && (
        <Modal title={waSharePickerKind === "quotation" ? "Share Quotation via WhatsApp" : "Share Invoice via WhatsApp"} onClose={function () { setWaSharePicker(false); }}>
          {(function () {
            var paperSize = state.settings.invoiceDefaultSize || "a4";
            var thermalSize = state.settings.invoiceThermalSize || "thermal80";
            var paperLabel = paperSize === "a5" ? "A5 PDF" : "A4 PDF";
            var thermalLabel = thermalSize === "thermal58" ? "Thermal 58mm PDF" : "Thermal 80mm PDF";
            var docWord = waSharePickerKind === "quotation" ? "quotation" : "invoice";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>Choose which {docWord} format to share on WhatsApp. Press <strong>A</strong> for A4 or <strong>T</strong> for thermal.</div>
                <Btn col="blue" onClick={function () {
                  if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode(paperSize);
                  else saveAndWhatsAppWithMode(paperSize);
                }}>{paperLabel} (A)</Btn>
                <Btn col="cyan" onClick={function () {
                  if (waSharePickerKind === "quotation") saveQuotationWhatsAppWithMode(thermalSize);
                  else saveAndWhatsAppWithMode(thermalSize);
                }}>{thermalLabel} (T)</Btn>
                <Btn col="gray" onClick={function () { setWaSharePicker(false); }}>Cancel (Esc)</Btn>
              </div>
            );
          })()}
        </Modal>
      )}

      {posPrintPicker && (
        <Modal title={posPrintPickerKind === "quotation" ? "Print Quotation" : "Print Invoice"} onClose={function () { setPosPrintPicker(false); }}>
          {(function () {
            var paperSize = state.settings.invoiceDefaultSize || "a4";
            var thermalSize = state.settings.invoiceThermalSize || "thermal80";
            var paperLabel = paperSize === "a5" ? "A5 Print" : "A4 Print";
            var thermalLabel = thermalSize === "thermal58" ? "Thermal 58mm Print" : "Thermal 80mm Print";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>Choose print format. Press <strong>A</strong> for A4 or <strong>T</strong> for thermal.</div>
                <Btn col="blue" onClick={function () { saveAndPrintWithMode(paperSize); }}>{paperLabel} (A)</Btn>
                <Btn col="cyan" onClick={function () { saveAndPrintWithMode(thermalSize); }}>{thermalLabel} (T)</Btn>
                <Btn col="gray" onClick={function () { setPosPrintPicker(false); }}>Cancel (Esc)</Btn>
              </div>
            );
          })()}
        </Modal>
      )}
    </form>
    {isRestaurant && selectedRestaurantOrderDetail && (
      <Modal title={"Order Details - " + (selectedRestaurantOrderDetail.tableId ? getRestaurantTableDisplayName(selectedRestaurantOrderDetail.tableId) : (selectedRestaurantOrderDetail.type === "takeaway" ? "Takeaway" : (selectedRestaurantOrderDetail.type === "delivery" ? "Delivery" : "Dine-in")))} onClose={function () { setRestaurantOrderDetailId(""); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {(selectedRestaurantOrderDetail.type === "takeaway" ? "Takeaway" : (selectedRestaurantOrderDetail.type === "delivery" ? "Delivery" : "Dine-in"))}
              {selectedRestaurantOrderDetail.createdBy ? (" - By: " + selectedRestaurantOrderDetail.createdBy) : ""}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 8px", borderRadius: 999, background: restaurantStatusStyle(selectedRestaurantOrderDetail.status).bg, color: restaurantStatusStyle(selectedRestaurantOrderDetail.status).fg }}>
              {restaurantStatusLabel(selectedRestaurantOrderDetail.status)}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "28vh", overflowY: "auto", border: "1px solid " + C.borderLight, borderRadius: 10, padding: "10px 11px", background: "#fcfdff" }}>
            {(selectedRestaurantOrderDetail.items || []).map(function (it, idx) {
              return (
                <div key={"detail-item-" + idx} style={{ borderBottom: idx === (selectedRestaurantOrderDetail.items || []).length - 1 ? "none" : "1px solid " + C.borderLight, paddingBottom: idx === (selectedRestaurantOrderDetail.items || []).length - 1 ? 0 : 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    Qty: {it.qty} {it.saleUnit || "Pcs"} - Price: {getCurrencySymbol()} {fmtNum(Number(it.price) || 0)}
                  </div>
                  {it.note && <div style={{ fontSize: 11, color: C.textMd, marginTop: 3 }}>Note: {it.note}</div>}
                </div>
              );
            })}
          </div>
          {selectedRestaurantOrderDetail.note && (
            <div style={{ fontSize: 11.5, color: C.textMd, border: "1px solid " + C.borderLight, borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
              Note: {selectedRestaurantOrderDetail.note}
            </div>
          )}
          {selectedRestaurantOrderDetail.type === "delivery" && selectedRestaurantOrderDetail.deliveryDetails && (
            <div style={{ fontSize: 11.5, color: C.textMd, border: "1px solid " + C.borderLight, borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
              {selectedRestaurantOrderDetail.deliveryDetails.name && <div>Name: {selectedRestaurantOrderDetail.deliveryDetails.name}</div>}
              {selectedRestaurantOrderDetail.deliveryDetails.phone && <div>Phone: {selectedRestaurantOrderDetail.deliveryDetails.phone}</div>}
              {selectedRestaurantOrderDetail.deliveryDetails.address && <div>Address: {selectedRestaurantOrderDetail.deliveryDetails.address}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "preparing"); }} style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 8px", background: "#fff", cursor: isOrderFullyBilled(selectedRestaurantOrderDetail) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(selectedRestaurantOrderDetail) ? 0.5 : 1, fontFamily: "inherit" }}>Preparing</button>
            <button type="button" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "ready"); }} style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 8px", background: "#fff", cursor: isOrderFullyBilled(selectedRestaurantOrderDetail) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(selectedRestaurantOrderDetail) ? 0.5 : 1, fontFamily: "inherit" }}>Ready</button>
            <button type="button" disabled={isOrderFullyBilled(selectedRestaurantOrderDetail)} onClick={function () { setRestaurantOrderStatus(selectedRestaurantOrderDetail.id, "served"); }} style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 8px", background: "#fff", cursor: isOrderFullyBilled(selectedRestaurantOrderDetail) ? "not-allowed" : "pointer", opacity: isOrderFullyBilled(selectedRestaurantOrderDetail) ? 0.5 : 1, fontFamily: "inherit" }}>Served</button>
            {!isOrderFullyBilled(selectedRestaurantOrderDetail) && restaurantBillingAllowed && (
              <button type="button" onClick={function () { billRestaurantOrder(selectedRestaurantOrderDetail.id); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id} style={{ fontSize: 11, border: "none", borderRadius: 6, padding: "5px 9px", background: "#1d4ed8", color: "#fff", cursor: isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id ? "not-allowed" : "pointer", opacity: isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id ? 0.65 : 1, fontFamily: "inherit", fontWeight: 800 }}>
                {billingOrderId === selectedRestaurantOrderDetail.id ? "Billing..." : ((selectedRestaurantOrderDetail.splitBills && selectedRestaurantOrderDetail.splitBills.length > 0) ? "Bill Remaining" : "Bill Order")}
              </button>
            )}
            {!isOrderFullyBilled(selectedRestaurantOrderDetail) && restaurantBillingAllowed && (
              <button type="button" onClick={function () { setSplitOrderId(splitOrderId === selectedRestaurantOrderDetail.id ? "" : selectedRestaurantOrderDetail.id); setItemSplitPick({}); }} style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 8px", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                Split Bill
              </button>
            )}
          </div>
          {!isOrderFullyBilled(selectedRestaurantOrderDetail) && !restaurantBillingAllowed && (
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>
              Billing available at counter
            </div>
          )}
          {splitOrderId === selectedRestaurantOrderDetail.id && !isOrderFullyBilled(selectedRestaurantOrderDetail) && (
            <div style={{ borderTop: "1px dashed " + C.border, paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Equal Split</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[2, 3, 4].map(function (n) {
                  return <button key={"detail-split-" + selectedRestaurantOrderDetail.id + "-" + n} type="button" onClick={function () { billRestaurantEqualSplit(selectedRestaurantOrderDetail.id, n); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id} style={{ fontSize: 11, border: "1px solid " + C.border, borderRadius: 6, padding: "4px 9px", background: "#fff", cursor: isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{n + " ways"}</button>;
                })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Item-based Split</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8, maxHeight: "20vh", overflowY: "auto" }}>
                {getOrderRemainingItems(selectedRestaurantOrderDetail).map(function (ri, idx) {
                  var pickKey = selectedRestaurantOrderDetail.id + "::" + idx;
                  return (
                    <label key={"detail-pick-" + pickKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.textMd }}>
                      <input type="checkbox" checked={!!itemSplitPick[pickKey]} onChange={function () { toggleItemSplitPick(selectedRestaurantOrderDetail.id, idx); }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ri.name} x {ri.qty} {ri.saleUnit || "Pcs"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <button type="button" onClick={function () { billRestaurantItemSplit(selectedRestaurantOrderDetail.id); }} disabled={isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id} style={{ fontSize: 11, border: "none", borderRadius: 6, padding: "5px 9px", background: "#0f766e", color: "#fff", cursor: isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id ? "not-allowed" : "pointer", opacity: isCheckingOut || billingOrderId === selectedRestaurantOrderDetail.id ? 0.65 : 1, fontFamily: "inherit", fontWeight: 800 }}>
                Bill Selected Items
              </button>
            </div>
          )}
          {isOrderFullyBilled(selectedRestaurantOrderDetail) && (
            <div style={{ fontSize: 11.5, color: "#166534", fontWeight: 700 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "52vh", overflowY: "auto" }}>
            {restaurantTables.map(function (t) {
              var ts = restaurantTableStatusUi(getRestaurantTableComputedStatus(t.id, t.status));
              return (
                <div key={"manage-root-" + t.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid " + C.borderLight, borderRadius: 10, padding: "9px 10px", background: "#fff" }}>
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
                    style={{ flex: 1, border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff" }}
                  />
                  <span style={{ fontSize: 10.5, fontWeight: 800, border: "1px solid " + ts.dot, background: ts.bg, color: ts.fg, borderRadius: 999, padding: "4px 8px", whiteSpace: "nowrap" }}>
                    {ts.label}
                  </span>
                  <button
                    type="button"
                    onClick={function () { deleteRestaurantTable(t.id); }}
                    style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", borderRadius: 8, padding: "6px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
            Rename table names inline. Only free tables can be deleted.
          </div>
        </div>
      </Modal>
    )}
    </React.Fragment>
  );
});
var Sales = POS;
export default Sales;

















