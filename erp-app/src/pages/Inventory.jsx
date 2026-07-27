import React, { useState, useEffect, useRef, useMemo } from "react";
import { validateExtraUnits, buildUnitsPersistFields, formExtraUnitsFromProduct, getProductUnitRows } from "../units/productUnits.js";
import {
  RAW_MATERIAL_PRICE_COST_HINT,
  isRawMaterialGuardBaseUnit,
  rawMaterialEnteredLooksLikePackTotal,
  rawMaterialPackPricingConfirmMessage,
} from "../utils/rawMaterialPricingGuard.js";
import { productMatchesSearch } from "../utils/productSearch.js";
import { isRepair3pInternalProduct } from "../utils/repair3pProduct.js";
import { evaluateProductNameMatch } from "../utils/productNameMatch.js";
import ProductNameDuplicateHint, { useProductNameHintControls } from "../components/ProductNameDuplicateHint.jsx";
import AddNewProductModal, { blankNewProductForm } from "../components/AddNewProductModal.jsx";
import GlassSheetInfo from "../components/GlassSheetInfo.jsx";
import {
  isGlassProduct,
  isGlassStockProductForm,
  validateGlassProductForm,
  applyGlassProductFields,
  glassCostPriceLabels,
  glassFieldsFromProductForm,
  glassFormFieldsOnUnitChange,
  isGlassSheetProductForm,
  formatGlassStockLabel,
  glassStockDisplay,
  getGlassSellRatePerSqFt,
} from "../utils/glassProduct.js";
import { getUnitsForSubCategory, hydrateShopSettings, getDefaultProductCategory, getDefaultProductUnit } from "../utils/categoryGroups.js";
import CategorySelect from "../components/CategorySelect.jsx";
import { COMPUTER_SHOP_EDITION, DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import { ActBtn, ActBtnGroup } from "../components/ActBtn.jsx";
import { stampProductStock, stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import { LIST_PAGE_SIZE } from "../utils/listPage.js";

var Inventory = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var inventoryQtyForTotals = props.inventoryQtyForTotals;
  var getBusinessProfile = props.getBusinessProfile;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var tcTrialGuard = props.tcTrialGuard;
  var checkProductName = props.checkProductName;
  var genBarcode = props.genBarcode;
  var nextProductId = props.nextProductId;
  var S = props.S;
  var today = props.today;
  var uid = props.uid;
  var addAudit = props.addAudit;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var C = props.C;
  var usePager = props.usePager;
  var fmtSumQty = props.fmtSumQty;
  var StatCard = props.StatCard;
  var Btn = props.Btn;
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var getBulkDisplayParts = props.getBulkDisplayParts;
  var fmtStockDual = props.fmtStockDual;
  var fmtStock = props.fmtStock;
  var getCats = props.getCats;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Badge = props.Badge;
  var Pager = props.Pager;
  var fmtDateFull = props.fmtDateFull;
  var roundQty = props.roundQty;
  var periodLockTransactionMinDate = props.periodLockTransactionMinDate;
  var toProductBaseQty = props.toProductBaseQty;

  var shopSettings = hydrateShopSettings(state.settings, S.get("tc3_businessType", null));
  var blankProduct = function (extra) {
    return blankNewProductForm(shopSettings, genBarcode, extra);
  };
  var onProductCategoryChange = function (setForm, cat) {
    var units = getUnitsForSubCategory(cat, shopSettings);
    setForm(function (x) {
      var nextUnit = units.indexOf(x.unit) >= 0 ? x.unit : (units[0] || "Pcs");
      return Object.assign({}, x, { category: cat, unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit));
    });
  };

  var glassStockVal = function (p) {
    var d = glassStockDisplay(p);
    return d.sqFt * (Number(p.price) || 0);
  };

  var glassMarginPct = function (p) {
    var sqFt = Number(p.glassAreaSqFt) || 0;
    var costSheet = Number(p.cost) || 0;
    var sellSqFt = Number(p.price) || 0;
    if (!(sqFt > 0) || !(sellSqFt > 0)) return null;
    var costSqFt = costSheet / sqFt;
    return Math.round((sellSqFt - costSqFt) / sellSqFt * 100);
  };

  var [search, setSearch] = useState("");
  var [catFilter, setCatFilter] = useState("All");
  var [stockFilter, setStockFilter] = useState("All");
  var [editP, setEditP] = useState(null);
  var [newP, setNewP] = useState(null);
  var [newProdKey, setNewProdKey] = useState(0);

  /* Ctrl++ / F12 (via App) — open Add Product */
  useEffect(function () {
    var openAdd = function () {
      setNewProdKey(function (k) { return k + 1; });
      setNewP(blankProduct());
    };
    var onAddProduct = function () { openAdd(); };
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("tc3-add-product", onAddProduct);
    try {
      if (sessionStorage.getItem("tc3_pending_add_product") === "1") {
        sessionStorage.removeItem("tc3_pending_add_product");
        openAdd();
      }
    } catch (_e) { /* ignore */ }
    return function () {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("tc3-add-product", onAddProduct);
    };
  }, []);
  var [actionP, setActionP] = useState(null);
  var [dmgQty, setDmgQty] = useState("1");
  var [reason, setReason] = useState("");
  var [viewP, setViewP] = useState(null);
  var [itab, setItab] = useState("overview");
  /* FIX 8: Toggle to show soft-deleted (inactive) products for recovery */
  var [showInactive, setShowInactive] = useState(false);
  var [rmUseModal, setRmUseModal] = useState(null);
  var newProductSelectEnterState = useRef({ main: false, sub: false, type: false, unit: false });
  var focusById = function (id) {
    setTimeout(function () {
      var el = document.getElementById(id);
      if (el && typeof el.focus === "function") el.focus();
    }, 0);
  };
  var openSelectById = function (id) {
    setTimeout(function () {
      var el = document.getElementById(id);
      if (!el) return;
      if (typeof el.focus === "function") el.focus();
      if (typeof el.click === "function") el.click();
    }, 0);
  };
  var markSelectEnterStage = function (key, val) {
    newProductSelectEnterState.current[key] = !!val;
  };
  var handleSelectEnter = function (key, id, onSecondEnter) {
    if (!newProductSelectEnterState.current[key]) {
      markSelectEnterStage(key, true);
      openSelectById(id);
      return;
    }
    markSelectEnterStage(key, false);
    if (typeof onSecondEnter === "function") onSecondEnter();
  };
  var [rmUseQty, setRmUseQty] = useState("");
  var [rmUseDate, setRmUseDate] = useState(today());
  var [rmUseUnit, setRmUseUnit] = useState("Pcs");
  var [rmSearch, setRmSearch] = useState("");
  var [rmAcOpen, setRmAcOpen] = useState(false);
  var [rmDetailProduct, setRmDetailProduct] = useState(null);
  var [activitySubtab, setActivitySubtab] = useState("changes");
  var [activitySearch, setActivitySearch] = useState("");
  var [rmUsageLogDate, setRmUsageLogDate] = useState(function () {
    return typeof today === "function" ? today() : "";
  });
  var invSearchRef = useRef(null);
  var rmAcWrapRef = useRef(null);

  useEffect(function () {
    if (itab !== "ingredients" || !rmAcOpen) return;
    var handler = function (e) {
      if (rmAcWrapRef.current && !rmAcWrapRef.current.contains(e.target)) setRmAcOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, [itab, rmAcOpen]);

  useEffect(function () {
    if (itab !== "ingredients") {
      setRmSearch("");
      setRmAcOpen(false);
    }
  }, [itab]);

  useEffect(function () {
    var hasIng = (state.products || []).some(function (p) {
      return p && p.status !== "inactive" && String((p && p.type) || "").toLowerCase() === "raw_material";
    }) || (Array.isArray(state.rawMaterialUsages) && state.rawMaterialUsages.length > 0);
    setItab(function (cur) {
      if (cur === "damaged") { setActivitySubtab("damage"); return "activity"; }
      if (cur === "history") { setActivitySubtab("changes"); return "activity"; }
      if (cur === "rawcount") return hasIng ? "ingredients" : "activity";
      return cur;
    });
  }, []);

  useEffect(function () {
    if (itab === "ingredients") {
      var hasIng = (state.products || []).some(function (p) {
        return p && p.status !== "inactive" && String((p && p.type) || "").toLowerCase() === "raw_material";
      }) || (Array.isArray(state.rawMaterialUsages) && state.rawMaterialUsages.length > 0);
      if (!hasIng) setItab("overview");
    }
    if (itab === "activity" && activitySubtab === "usage") {
      var hasUsage = (state.products || []).some(function (p) {
        return p && String((p && p.type) || "").toLowerCase() === "raw_material";
      }) || (Array.isArray(state.rawMaterialUsages) && state.rawMaterialUsages.length > 0);
      if (!hasUsage) setActivitySubtab("changes");
    }
  }, [itab, activitySubtab, state.products, state.rawMaterialUsages]);

  /* FIX 8: Exclude inactive (soft-deleted) products from all inventory views and stats.
     Inactive products still exist in state.products so historical records remain intact. */
  var products = state.products.filter(function (p) { return p.status !== "inactive" && !isRepair3pInternalProduct(p); });
  var newProductNameMatch = useMemo(function () {
    if (!newP || !String(newP.name || "").trim()) return null;
    return evaluateProductNameMatch(newP.name, state.products, null);
  }, [newP, state.products]);
  var newProductNameExactDup = !!(newProductNameMatch && newProductNameMatch.type === "exact");
  var newNameHint = useProductNameHintControls(newP ? newP.name : "");
  var editProductNameMatch = useMemo(function () {
    if (!editP || !String(editP.name || "").trim()) return null;
    return evaluateProductNameMatch(editP.name, state.products, editP.id);
  }, [editP, state.products]);
  var editProductNameExactDup = !!(editProductNameMatch && editProductNameMatch.type === "exact");
  var editNameHint = useProductNameHintControls(editP ? editP.name : "");
  var getProductType = function (p) { return String((p && p.type) || "stock").toLowerCase(); };
  var isServiceProduct = function (p) { return getProductType(p) === "service"; };
  var isRawMaterialProduct = function (p) { return getProductType(p) === "raw_material"; };
  var getProductBaseUnitValue = function (product, field) {
    var rows = getProductUnitRows(product || {});
    var baseRow = rows.find(function (r) { return Number(r && r.factor) === 1; }) || rows[0] || {};
    var v = field === "sell"
      ? Number(baseRow.sellPrice != null ? baseRow.sellPrice : (product && product.price))
      : Number(baseRow.cost != null ? baseRow.cost : (product && product.cost));
    return isFinite(v) ? v : 0;
  };
  var getRawLatestUnitFromPurchases = function (productId, dateStr, field, fallback) {
    var latest = null;
    (state.purchases || []).forEach(function (pur) {
      var pDate = String((pur && pur.date) || "");
      if (!pDate || pDate > String(dateStr || "")) return;
      (pur.items || []).forEach(function (it) {
        var pid = it && (it.id || it.productId);
        if (!it || pid !== productId) return;

        var sourceVal = field === "sell"
          ? Number(it.sellPrice != null ? it.sellPrice : 0)
          : Number(it.cost || 0);
        if (!isFinite(sourceVal) || sourceVal <= 0) return;

        var inputQty = Number(it.inputQty != null ? it.inputQty : 0) || 0;
        var baseQty = Number(it.qty) || 0;
        var factor = (inputQty > 0 && baseQty > 0) ? (baseQty / inputQty) : 1;
        if (!isFinite(factor) || factor <= 0) factor = 1;

        /* If sell was entered as base-unit line total (qty>1), recover per-base sell. */
        if (field === "sell" && factor === 1 && inputQty > 1) {
          var baseCost = Number(it.cost) || 0;
          var perBaseCandidate = sourceVal / inputQty;
          if (baseCost > 0) {
            var suspiciousHuge = sourceVal >= baseCost * 8;
            var candidateReasonable = perBaseCandidate >= baseCost * 0.5 && perBaseCandidate <= baseCost * 4;
            if (suspiciousHuge && candidateReasonable) sourceVal = perBaseCandidate;
          } else if (sourceVal >= 8000 && perBaseCandidate <= 2500) {
            sourceVal = perBaseCandidate;
          }
        }

        var unitBase = field === "sell"
          ? (Number(sourceVal) / factor)
          : Number(sourceVal);
        if (!isFinite(unitBase) || unitBase <= 0) return;

        if (!latest || pDate > latest.date) latest = { date: pDate, value: unitBase };
      });
    });
    if (latest && isFinite(Number(latest.value))) return Number(latest.value) || 0;
    return Number(fallback) || 0;
  };

  var getBaseSellPcsPrice = props.getBaseSellPcsPrice;
  var getBaseCostPcsPrice = props.getBaseCostPcsPrice;

  /** Rs per base unit — same as POS `getBaseSellPcsPrice` / `getBaseCostPcsPrice` (factor-1 row), not raw product.price/cost (avoids sack-tier figures inflating Stock Value). */
  var inventoryRetailSellPerBase = function (p) {
    if (!p) return 0;
    if (isRawMaterialProduct(p)) return Number(getRawLatestUnitFromPurchases(p.id, today(), "sell", getProductBaseUnitValue(p, "sell"))) || 0;
    return typeof getBaseSellPcsPrice === "function" ? Number(getBaseSellPcsPrice(p)) || 0 : 0;
  };
  var inventoryRetailCostPerBase = function (p) {
    if (!p) return 0;
    if (isRawMaterialProduct(p)) return Number(getRawLatestUnitFromPurchases(p.id, today(), "cost", getProductBaseUnitValue(p, "cost"))) || 0;
    return typeof getBaseCostPcsPrice === "function" ? Number(getBaseCostPcsPrice(p)) || 0 : 0;
  };

  var normalizeProductType = function (t) {
    var x = String(t || "stock").toLowerCase();
    return (x === "service" || x === "raw_material") ? x : "stock";
  };
  var stockProducts = products.filter(function (p) { return !isServiceProduct(p); });
  var hasMeaningfulMargin = function (p) {
    if (!p) return false;
    if (inventoryRetailSellPerBase(p) <= 0) return false;
    if (isServiceProduct(p) && inventoryRetailCostPerBase(p) <= 0) return false;
    return true;
  };
  var getProductMarginPct = function (p) {
    if (!hasMeaningfulMargin(p)) return null;
    var sell = inventoryRetailSellPerBase(p);
    var cost = inventoryRetailCostPerBase(p);
    return Math.round((sell - cost) / (sell || 1) * 100);
  };
  var totalProducts = products.length;
  var totalStockUnits = stockProducts.reduce(function (a, p) { return a + inventoryQtyForTotals(p); }, 0);
  var totalDamagedUnits = stockProducts.reduce(function (a, p) { return a + (p.damaged || 0); }, 0);
  var stockRetailValue = stockProducts.reduce(function (a, p) {
    return a + inventoryQtyForTotals(p) * inventoryRetailSellPerBase(p);
  }, 0);
  /* Cost value uses each product's stored unit cost (WAC). Purchase returns (Returns -> Purchase) reduce stock
     without recomputing WAC so totals stay consistent with that policy. */
  var stockCostValue = stockProducts.reduce(function (a, p) {
    return a + inventoryQtyForTotals(p) * inventoryRetailCostPerBase(p);
  }, 0);
  var damagedValue = stockProducts.reduce(function (a, p) {
    return a + (p.damaged || 0) * inventoryRetailCostPerBase(p);
  }, 0);
  var potentialProfit = stockRetailValue - stockCostValue;
  var outOfStock = stockProducts.filter(function (p) { return (p.stock || 0) === 0; }).length;
  var lowStock = stockProducts.filter(function (p) { return (p.stock || 0) > 0 && (p.stock || 0) <= 5; }).length;
  var marginProducts = products.filter(hasMeaningfulMargin);
  var avgMargin = marginProducts.length > 0
    ? Math.round(marginProducts.reduce(function (a, p) { return a + getProductMarginPct(p); }, 0) / marginProducts.length)
    : null;

  var cats = ["All"].concat((function () { var seen = {}; var out = []; products.forEach(function (p) { var c = p.category || "General"; if (!seen[c]) { seen[c] = 1; out.push(c); } }); return out; })().sort());

  /* FIX 8: When showInactive is true, show only soft-deleted products for recovery */
  var baseRows = showInactive
    ? state.products.filter(function (p) { return p.status === "inactive"; })
    : products;

  var rows = baseRows.filter(function (p) {
    var q = search.toLowerCase();
    var matchQ = !q || productMatchesSearch(p, q);
    var matchCat = catFilter === "All" || p.category === catFilter;
    var isService = isServiceProduct(p);
    var matchStock = stockFilter === "All"
      || (stockFilter === "Out of Stock" && !isService && (p.stock || 0) === 0)
      || (stockFilter === "Low Stock" && !isService && (p.stock || 0) > 0 && (p.stock || 0) <= 5)
      || (stockFilter === "In Stock" && !isService && (p.stock || 0) > 5)
      || (stockFilter === "Has Damage" && (p.damaged || 0) > 0);
    return matchQ && matchCat && matchStock;
  });

  var invPager = usePager(rows, LIST_PAGE_SIZE);
  var rawMaterialProducts = products.filter(isRawMaterialProduct);
  var rawMatSearchQ = rmSearch.trim().toLowerCase();
  var rawMaterialFiltered = !rawMatSearchQ
    ? rawMaterialProducts
    : rawMaterialProducts.filter(function (p) {
      return productMatchesSearch(p, rawMatSearchQ);
    });
  var rmAutocompleteSuggestions = rawMatSearchQ
    ? rawMaterialProducts.filter(function (p) {
      return productMatchesSearch(p, rawMatSearchQ);
    }).slice(0, 12)
    : [];
  var rawCountRecords = Array.isArray(state.rawMaterialCounts) ? state.rawMaterialCounts : [];
  var rmLogDateStr = String(rmUsageLogDate || "").trim() || (typeof today === "function" ? today() : "");
  var rmUsagesForDay = (Array.isArray(state.rawMaterialUsages) ? state.rawMaterialUsages : [])
    .filter(function (u) {
      return u && String(u.date || "") === rmLogDateStr;
    })
    .slice()
    .reverse();

  var rfStockAfterConsume = function (prod, consumeBase) {
    var c = Number(consumeBase);
    if (!isFinite(c) || c <= 0) return { err: "Enter how much was used (more than zero)." };
    var curBase = inventoryQtyForTotals(prod);
    if (state.settings && state.settings.preventNegativeStock !== false && c > curBase + 1e-9) {
      return { err: "Not enough stock. Only " + (getBulkDisplayParts(prod) ? fmtStockDual(prod) : fmtStock(prod.stock || 0, prod.unit)) + " on hand." };
    }
    var parts = getBulkDisplayParts(prod);
    var nextBase = Math.max(0, curBase - c);
    var rq = typeof roundQty === "function" ? roundQty : function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
    if (!parts) return { stock: rq(nextBase) };
    if (parts.storageInPcs) return { stock: rq(nextBase) };
    var conv = parts.conv || 1;
    return { stock: rq(nextBase / conv) };
  };

  var upsertRawCountClosing = function (prevRecords, dateStr, productId, closingBase) {
    var recs = Array.isArray(prevRecords) ? prevRecords.slice() : [];
    var idx = recs.findIndex(function (r) { return String(r && r.date || "") === String(dateStr || ""); });
    var cq = Math.round(Number(closingBase) * 10000) / 10000;
    var item = { productId: productId, closingQty: cq };
    if (idx >= 0) {
      var items = Array.isArray(recs[idx].items) ? recs[idx].items.slice() : [];
      var ii = items.findIndex(function (it) { return it && String(it.productId) === String(productId); });
      if (ii >= 0) items[ii] = Object.assign({}, items[ii], item);
      else items.push(item);
      recs[idx] = Object.assign({}, recs[idx], { items: items });
    } else {
      recs.push({ date: dateStr, items: [item] });
    }
    return recs.sort(function (a, b) { return String(a.date || "") > String(b.date || "") ? 1 : -1; });
  };

  var openRmUseModal = function (prod) {
    if (!prod) return;
    var urows = getProductUnitRows(prod);
    var baseR = urows.find(function (r) { return Number(r && r.factor) === 1; }) || urows[0];
    setRmUseUnit(String((baseR && baseR.name) || prod.unit || "Pcs"));
    setRmUseQty("");
    setRmUseDate(today());
    setRmUseModal(prod);
  };

  var saveRmUsage = function () {
    if (!rmUseModal) return;
    if (periodLockTransactionMinDate && String(rmUseDate || "") < String(periodLockTransactionMinDate || "")) {
      showAlert("That date is in a locked period. Choose " + fmtDateFull(periodLockTransactionMinDate) + " or later.");
      return;
    }
    var booksClosed = state.settings && state.settings.booksClosedDate;
    if (booksClosed && String(rmUseDate || "") < String(booksClosed) && typeof window !== "undefined" && !window._tcAccountingPeriodAdmin) {
      showAlert("Books are closed through " + fmtDateFull(booksClosed) + ". Choose a date on or after the books closed date, or unlock Admin accounting (PIN) under Settings → Accounting.");
      return;
    }
    var qtyEntered = Number(rmUseQty);
    var prod = state.products.find(function (x) { return x.id === rmUseModal.id; }) || rmUseModal;
    var pid = prod.id;
    var unitLabel = String(rmUseUnit || prod.unit || "Pcs").trim() || "Pcs";
    var consumeBase = typeof toProductBaseQty === "function"
      ? toProductBaseQty(qtyEntered, unitLabel, prod)
      : qtyEntered;
    if (!isFinite(consumeBase) || consumeBase <= 0) {
      showAlert("Enter how much was used (more than zero).");
      return;
    }
    var res = rfStockAfterConsume(prod, consumeBase);
    if (res.err) { showAlert(res.err); return; }
    var newStock = res.stock;
    var np = state.products.map(function (x) { return x.id === pid ? stampProductStock(Object.assign({}, x, { stock: newStock }), null, x) : x; });
    var closingBase = inventoryQtyForTotals(Object.assign({}, prod, { stock: newStock }));
    var usageRow = {
      id: uid(),
      productId: pid,
      date: String(rmUseDate || "").trim() || today(),
      qty: typeof roundQty === "function" ? roundQty(qtyEntered) : qtyEntered,
      unit: unitLabel,
      qtyBase: typeof roundQty === "function" ? roundQty(consumeBase) : consumeBase,
    };
    var usages = (Array.isArray(state.rawMaterialUsages) ? state.rawMaterialUsages : []).concat([usageRow]);
    var nextCounts = upsertRawCountClosing(rawCountRecords, usageRow.date, pid, closingBase);
    var pl = (state.productLog || []).concat([{
      id: uid(),
      date: usageRow.date,
      type: "Used",
      productId: pid,
      productName: prod.name,
      qty: usageRow.qty,
      reason: "Ingredient use — " + String(usageRow.qty) + " " + unitLabel + " (" + (typeof roundQty === "function" ? roundQty(consumeBase) : consumeBase) + " base)",
    }]);
    if (S.setMany) {
      S.setMany([
        ["tc3_products", np],
        ["tc3_raw_material_usage", usages],
        ["tc3_raw_material_counts", nextCounts],
        ["tc3_productLog", pl],
      ]);
    } else {
      S.set("tc3_products", np);
      S.set("tc3_raw_material_usage", usages);
      S.set("tc3_raw_material_counts", nextCounts);
      S.set("tc3_productLog", pl);
    }
    setState(function (s) {
      return Object.assign({}, s, {
        products: np,
        rawMaterialUsages: usages,
        rawMaterialCounts: nextCounts,
        productLog: pl,
      });
    });
    addAudit("Logged ingredient use", usageRow.date, { product: prod.name, qty: usageRow.qty });
    setRmUseModal(null);
    showAlert("Saved. Stock updated.");
  };

  var buildIngredientTimeline = function (productId) {
    var out = [];
    var pi = 0;
    (state.purchases || []).forEach(function (pur) {
      var li = 0;
      (pur.items || []).forEach(function (it) {
        var iid = it && (it.id || it.productId);
        if (!it || String(iid) !== String(productId)) return;
        out.push({
          sort: String(pur.date || "") + "_p_" + String(pi) + "_" + String(li++) + "_" + String(pur.invoiceNo || pur.id || ""),
          date: pur.date,
          kind: "purchase",
          label: "Stock in (purchase)",
          detail: (typeof fmtSumQty === "function" ? fmtSumQty(Number(it.qty) || 0) : String(it.qty)) + " · PO " + String(pur.invoiceNo || pur.id || "-"),
        });
      });
      pi++;
    });
    (state.purchaseReturns || []).forEach(function (r) {
      if (!r || String(r.productId || "") !== String(productId)) return;
      out.push({
        sort: String(r.date || "") + "_pr_" + (r.id || ""),
        date: r.date,
        kind: "return",
        label: "Return to supplier",
        detail: (typeof fmtSumQty === "function" ? fmtSumQty(Number(r.qty) || 0) : String(r.qty)) + (r.reason ? " · " + r.reason : ""),
      });
    });
    (Array.isArray(state.rawMaterialUsages) ? state.rawMaterialUsages : []).forEach(function (u) {
      if (!u || String(u.productId) !== String(productId)) return;
      var det = (typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qty) || 0) : String(u.qty)) + " " + String(u.unit || "");
      if (u.qtyBase != null && isFinite(Number(u.qtyBase))) {
        det += " (" + (typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qtyBase) || 0) : u.qtyBase) + " base)";
      }
      out.push({
        sort: String(u.date || "") + "_u_" + (u.id || ""),
        date: u.date,
        kind: "use",
        label: "Used (kitchen / daily count)",
        detail: det,
      });
    });
    var logIdx = 0;
    (state.productLog || []).forEach(function (l) {
      if (!l || String(l.productId || "") !== String(productId)) return;
      var t = String(l.type || "");
      if (t === "Used") return;
      out.push({
        sort: String(l.date || "") + "_log_" + String(logIdx++) + "_" + String(l.id || ""),
        date: l.date,
        kind: "log",
        label: t || "Stock note",
        detail: String(l.qty != null ? l.qty : "") + (l.reason ? " · " + l.reason : ""),
      });
    });
    out.sort(function (a, b) { return String(a.sort) < String(b.sort) ? 1 : -1; });
    return out;
  };

  var saveNewFromShared = function (form, meta) {
    if (!form) return false;
    var nameStr = String(form.name == null ? "" : form.name).trim();
    var isServiceNew = normalizeProductType(form.type) === "service";
    if (!nameStr || (!isServiceNew && !form.price)) return false;
    var unitFields = buildUnitsPersistFields({
      unit: form.unit,
      cost: form.cost,
      price: form.price,
      extraUnits: form.extraUnits || [],
    });
    var isGlassNew = isGlassSheetProductForm(form, shopSettings);
    var prod = applyGlassProductFields(Object.assign(
      {
        id: uid(),
        productId: nextProductId(state.products),
        name: nameStr,
        barcode: form.barcode || genBarcode(),
        category: form.category || "General",
        type: normalizeProductType(form.type),
        description: form.description || "",
        cost: parseFloat(form.cost) || 0,
        price: parseFloat(form.price) || 0,
        stock: normalizeProductType(form.type) === "service" ? 0 : (parseFloat(form.stock) || 0),
        damaged: 0,
        require_comment: false,
        comment_label: String(form.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
        weightGrams: form.weightGrams,
        makingCharge: form.makingCharge,
        expiryDate: form.expiryDate,
        batchNo: form.batchNo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      unitFields
    ), form, shopSettings);
    if (!tcTrialGuard(state.products, "products")) return false;
    var np = state.products.concat([prod]);
    var log = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Added", productId: prod.id, productName: prod.name, qty: prod.stock, reason: "New product" }]);
    if (S.setMany) { S.setMany([["tc3_products", np], ["tc3_productLog", log]]); }
    else { S.set("tc3_products", np); S.set("tc3_productLog", log); }
    setState(function (s) { return Object.assign({}, s, { products: np, productLog: log }); });
    if (meta && meta.addAnother) {
      setNewP(blankProduct({ type: form.type || "stock" }));
      return true;
    }
    setNewP(null);
    return true;
  };

  var saveNew = function () {
    /* legacy name kept for any leftover refs — use shared modal */
    if (!newP) return;
    saveNewFromShared(newP, {});
  };

  var saveEdit = function () {
    if (!editP) return;
    var editNameStr = String(editP.name == null ? "" : editP.name).trim();
    var editNameCheck = checkProductName(editNameStr, state.products, editP.id);
    if (editNameCheck && editNameCheck.type === "exact") {
      showAlert("A product named \"" + editNameCheck.match + "\" already exists.\nPlease use a different name.");
      return;
    }
    if (editP.barcode && state.products.find(function (p) { return p.id !== editP.id && p.barcode === editP.barcode; })) {
      showAlert("Another product already uses this barcode. Please use a unique barcode.");
      return;
    }
    var origProduct = state.products.find(function (p) { return p.id === editP.id; });
    var origStock = origProduct ? (origProduct.stock || 0) : 0;
    var newStock = parseFloat(editP.stock) || 0;
    if (newStock > origStock) {
      showAlert("X Stock cannot be increased from the Inventory tab.\n\nTo add stock, please create a Purchase Order in the Purchases section.\nThis keeps your accounts, costs and audit trail accurate.");
      return;
    }
    /* Stock field is read-only here - always preserve original stock value */
    var unitErrEdit = validateExtraUnits(editP.unit, editP.extraUnits || []);
    if (unitErrEdit) { showAlert(unitErrEdit); return; }
    var performEditSave = function () {
      var unitFieldsEdit = buildUnitsPersistFields({
        unit: editP.unit,
        cost: editP.cost,
        price: editP.price,
        extraUnits: editP.extraUnits || [],
      });
      var glassFieldsEdit = glassFieldsFromProductForm(editP);
      var isGlassEdit = isGlassSheetProductForm(editP, shopSettings);
      var glassErrEdit = validateGlassProductForm(editP, shopSettings);
      if (glassErrEdit) { showAlert(glassErrEdit); return; }
      var np = state.products.map(function (p) {
        if (p.id !== editP.id) return p;
        var next = applyGlassProductFields(Object.assign({}, p, {
          name: editP.name,
          barcode: editP.barcode,
          category: editP.category,
          type: normalizeProductType(editP.type),
          description: editP.description,
          cost: parseFloat(editP.cost) || 0,
          price: parseFloat(editP.price) || 0,
          stock: normalizeProductType(editP.type) === "service" ? 0 : origStock,
          require_comment: false,
          comment_label: String(editP.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
        }, unitFieldsEdit), editP, shopSettings);
        var costChanged = Math.abs((parseFloat(editP.cost) || 0) - (parseFloat(p.cost) || 0)) > 0.0001;
        return costChanged ? stampProductStock(next, null, p) : stampUpdatedAt(next);
      });
      S.set("tc3_products", np);
      addAudit("Edited Product", editP.name + " (" + (editP.productId || editP.id.slice(0, 6)) + ")");
      setState(function (s) { return Object.assign({}, s, { products: np }); });
      setEditP(null);
    };
    if (
      normalizeProductType(editP.type) === "raw_material" &&
      isRawMaterialGuardBaseUnit(editP.unit) &&
      rawMaterialEnteredLooksLikePackTotal(editP.cost, editP.price, editP.unit)
    ) {
      showConfirm(rawMaterialPackPricingConfirmMessage(editP.cost, editP.price, editP.unit), performEditSave);
      return;
    }
    performEditSave();
  };

  /* FIX 8: Reactivate a voided (inactive) product */
  var reactivateProduct = function (prodId) {
    showConfirm("Restore this voided product? It will appear again in stock lists and POS.", function () {
      var np = state.products.map(function (p) {
        if (p.id !== prodId) return p;
        var reactivated = Object.assign({}, p);
        delete reactivated.status; // remove inactive flag
        return reactivated;
      });
      var log = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Restored", productId: prodId, productName: (state.products.find(function(p){return p.id===prodId;})||{}).name || "", qty: 0, reason: "Restored from voided" }]);
      if (S.setMany) { S.setMany([["tc3_products", np], ["tc3_productLog", log]]); }
      else { S.set("tc3_products", np); S.set("tc3_productLog", log); }
      setState(function (s) { return Object.assign({}, s, { products: np, productLog: log }); });
    });
  };

  var confirmAction = function () {
    if (!actionP || !reason.trim()) return;
    var p = actionP.product;
    var qty = parseFloat(dmgQty) || 1;
    if (actionP.mode === "damage") {
      var onHand = Math.max(0, Number(p.stock) || 0);
      if (qty > onHand) {
        showAlert("Cannot write off " + qty + " — only " + onHand + " in stock.");
        return;
      }
      if (qty <= 0) {
        showAlert("Enter a write-off quantity greater than zero.");
        return;
      }
      var np2 = state.products.map(function (x) { return x.id === p.id ? stampProductStock(Object.assign({}, x, { stock: Math.max(0, x.stock - qty), damaged: (x.damaged || 0) + qty }), null, x) : x; });
      var dmgTs = new Date().toISOString();
      var dl = (state.damageLog || []).concat([stampTransactionIsoDateTime({
        id: uid(), date: today(), createdAt: dmgTs, productId: p.id, productName: p.name, qty: qty, cost: p.cost || 0, reason: reason,
      }, dmgTs)]);
      if (S.setMany) { S.setMany([["tc3_products", np2], ["tc3_damageLog", dl]]); }
      else { S.set("tc3_products", np2); S.set("tc3_damageLog", dl); }
      setState(function (s) { return Object.assign({}, s, { products: np2, damageLog: dl }); });
    } else if (actionP.mode === "void") {
      /* Zero-stock void — hide from POS/stock lists; record + ID kept for accounting. */
      var voidDisplayId = p.productId || "";
      var voidStockQty = Math.max(0, Number(p.stock) || 0);
      var voidDamagedQty = Math.max(0, Number(p.damaged) || 0);
      var voidWriteOffQty = voidStockQty + voidDamagedQty;
      var isServiceVoid = normalizeProductType(p.type) === "service";
      var np3 = state.products.map(function (x) {
        return x.id === p.id ? stampProductStock(Object.assign({}, x, { status: "inactive", stock: 0, damaged: 0 }), null, x) : x;
      });
      var pl = (state.productLog || []).concat([{
        id: uid(),
        date: today(),
        type: "Voided",
        productId: p.id,
        productName: p.name,
        qty: voidWriteOffQty,
        reason: reason,
      }]);
      var voidStorWrites = [["tc3_products", np3], ["tc3_productLog", pl]];
      var voidStatePatch = { products: np3, productLog: pl };
      if (!isServiceVoid && voidWriteOffQty > 0) {
        var voidTs = new Date().toISOString();
        var dlVoid = (state.damageLog || []).concat([stampTransactionIsoDateTime({
          id: uid(),
          date: today(),
          createdAt: voidTs,
          productId: p.id,
          productName: p.name,
          qty: voidWriteOffQty,
          cost: p.cost || 0,
          reason: "Product void: " + reason,
        }, voidTs)]);
        voidStorWrites.push(["tc3_damageLog", dlVoid]);
        voidStatePatch.damageLog = dlVoid;
      }
      if (S.setMany) { S.setMany(voidStorWrites); }
      else { voidStorWrites.forEach(function (pair) { S.set(pair[0], pair[1]); }); }
      setState(function (s) { return Object.assign({}, s, voidStatePatch); });
      addAudit("Voided Product", p.name + (voidDisplayId ? (" (ID " + voidDisplayId + ")") : "") + (voidWriteOffQty > 0 ? (" — " + voidWriteOffQty + " units written off") : ""));
    } else {
      var removeQty = parseFloat(dmgQty) || 1;
      var np4 = state.products.map(function (x) { return x.id === p.id ? stampProductStock(Object.assign({}, x, { stock: Math.max(0, x.stock - removeQty) }), null, x) : x; });
      var pl2 = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Deleted", productId: p.id, productName: p.name, qty: removeQty, reason: reason }]);
      /* GL + inventory replay: stock removal posts as damage write-off (same as Mark Damaged). */
      var rmTs = new Date().toISOString();
      var dlRemove = (state.damageLog || []).concat([stampTransactionIsoDateTime({
        id: uid(),
        date: today(),
        createdAt: rmTs,
        productId: p.id,
        productName: p.name,
        qty: removeQty,
        cost: p.cost || 0,
        reason: "Stock removal: " + reason,
      }, rmTs)]);
      if (S.setMany) {
        S.setMany([
          ["tc3_products", np4],
          ["tc3_damageLog", dlRemove],
          ["tc3_productLog", pl2],
        ]);
      } else {
        S.set("tc3_products", np4);
        S.set("tc3_damageLog", dlRemove);
        S.set("tc3_productLog", pl2);
      }
      setState(function (s) { return Object.assign({}, s, { products: np4, damageLog: dlRemove, productLog: pl2 }); });
    }
    setActionP(null); setReason(""); setDmgQty("1");
  };

  // CATS defined globally
  /* FIX: Removed unused _unused_CATS variable */

  var hasIngredients = rawMaterialProducts.length > 0
    || (Array.isArray(state.rawMaterialUsages) && state.rawMaterialUsages.length > 0);
  var ITABS = [["overview", "Overview", "📊"], ["products", "Products", "📦"]]
    .concat(hasIngredients ? [["ingredients", "Ingredients", "🧪"]] : [])
    .concat([["activity", "Activity", "📋"]]);

  var damagedProducts = products.filter(function (p) { return (p.damaged || 0) > 0; })
    .sort(function (a, b) { return (b.damaged || 0) - (a.damaged || 0); });
  var activitySearchQ = activitySearch.trim().toLowerCase();
  var productLogRows = (state.productLog || []).slice().reverse().filter(function (l) {
    if (!activitySearchQ) return true;
    return (l.productName || "").toLowerCase().includes(activitySearchQ)
      || (l.type || "").toLowerCase().includes(activitySearchQ)
      || (l.reason || "").toLowerCase().includes(activitySearchQ);
  });
  var damageLogRows = (state.damageLog || []).slice().reverse().filter(function (l) {
    if (!activitySearchQ) return true;
    return (l.productName || "").toLowerCase().includes(activitySearchQ)
      || (l.reason || "").toLowerCase().includes(activitySearchQ);
  });
  var stockChipFilters = ["All", "In Stock", "Low Stock", "Out of Stock", "Has Damage"];
  var stockChipLabel = function (s) {
    if (s === "All") return "All";
    if (s === "Has Damage") return "Damaged";
    if (s === "Out of Stock") return "Out";
    if (s === "Low Stock") return "Low";
    return "In stock";
  };

  var openActivity = function (sub) {
    setItab("activity");
    setActivitySubtab(sub || "changes");
    setActivitySearch("");
  };

  var InvTabHead = function (headProps) {
    var hp = headProps;
    return (
      <div className={"erp-inv-tab-head tone-" + (hp.tone || "green")}>
        <span className="erp-inv-tab-head-icon" aria-hidden="true">{hp.icon}</span>
        <div className="erp-inv-tab-head-text">
          <div className="erp-inv-tab-head-title">{hp.title}</div>
          {hp.sub ? <div className="erp-inv-tab-head-sub">{hp.sub}</div> : null}
        </div>
        {hp.extra ? <div className="erp-inv-tab-head-extra">{hp.extra}</div> : null}
      </div>
    );
  };

  var invToneAccent = function (tone) {
    if (tone === "green") return C.green;
    if (tone === "red") return C.red;
    if (tone === "orange") return C.orange;
    if (tone === "purple" || tone === "indigo") return C.purple;
    if (tone === "cyan" || tone === "teal") return C.cyan;
    if (tone === "navy") return "#1e3a8a";
    return C.blue;
  };

  var InvKpiStrip = function (stripProps) {
    var items = stripProps.items || [];
    return (
      <div className={"erp-inv-stat-row" + (stripProps.compact ? " is-compact" : "")}>
        {items.map(function (k) {
          var accent = invToneAccent(k.tone);
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

  var invTabBtn = function (id, label, icon) {
    return (
      <button
        type="button"
        key={id}
        role="tab"
        aria-selected={itab === id}
        className={"erp-inv-tab" + (itab === id ? " is-active" : "")}
        onClick={function () { setItab(id); }}
        title={label}
      ><span className="erp-inv-tab-ico" aria-hidden="true">{icon || "•"}</span>{label}</button>
    );
  };

  var ACTIVITY_TABS = [["changes", "Changes", "📝"], ["damage", "Damage", "⚠️"]]
    .concat(hasIngredients ? [["usage", "Usage", "🧪"]] : []);

  var productsTabTotals = rows.reduce(function (acc, p) {
    if (isServiceProduct(p)) return acc;
    acc.retail += inventoryQtyForTotals(p) * inventoryRetailSellPerBase(p);
    acc.cost += inventoryQtyForTotals(p) * inventoryRetailCostPerBase(p);
    acc.units += inventoryQtyForTotals(p);
    return acc;
  }, { retail: 0, cost: 0, units: 0 });
  productsTabTotals.profit = productsTabTotals.retail - productsTabTotals.cost;
  var productsOutInView = rows.filter(function (p) { return !isServiceProduct(p) && (p.stock || 0) === 0; }).length;
  var productsTabKpis = [
    { label: "In view", value: rows.length.toLocaleString(), sub: (showInactive ? "Voided products" : ("Of " + totalProducts.toLocaleString() + " active")), tone: "blue", icon: "📦" },
    { label: "Units", value: fmtSumQty(productsTabTotals.units), sub: productsOutInView > 0 ? (productsOutInView + " out in view") : "On-hand in view", tone: "teal", icon: "📊" },
    { label: "Retail", value: getCurrencySymbol() + " " + fmtNum(productsTabTotals.retail), sub: "Cost " + getCurrencySymbol() + " " + fmtNum(productsTabTotals.cost), tone: "indigo", icon: "💰" },
    { label: "Profit", value: getCurrencySymbol() + " " + fmtNum(productsTabTotals.profit), sub: productsTabTotals.retail > 0 ? ("Margin " + Math.round(productsTabTotals.profit / productsTabTotals.retail * 100) + "%") : "Filtered view", tone: productsTabTotals.profit >= 0 ? "green" : "red", icon: productsTabTotals.profit >= 0 ? "📈" : "📉" },
  ];

  var activityChangesKpis = [
    { label: "Entries", value: String(productLogRows.length), sub: activitySearchQ ? "Filtered" : "All product events", tone: "blue", icon: "📝" },
    { label: "Products", value: String((function () { var s = {}; productLogRows.forEach(function (l) { if (l.productId) s[l.productId] = 1; }); return Object.keys(s).length; })()), sub: "Unique in view", tone: "indigo", icon: "📦" },
    { label: "Damage log", value: String(damageLogRows.length), sub: "Related events", tone: "orange", icon: "⚠️" },
    { label: "Today", value: String((state.productLog || []).filter(function (l) { return l.date === (typeof today === "function" ? today() : ""); }).length), sub: "Logged today", tone: "teal", icon: "📅" },
  ];
  var activityDamageKpis = [
    { label: "Products", value: String(damagedProducts.length), sub: "With damage", tone: "orange", icon: "📦" },
    { label: "Units", value: fmtSumQty(totalDamagedUnits), sub: "Damaged stock", tone: "red", icon: "🔻" },
    { label: "Loss", value: getCurrencySymbol() + " " + fmtNum(damagedValue), sub: "At cost", tone: "red", icon: "💸" },
    { label: "Events", value: String(damageLogRows.length), sub: activitySearchQ ? "Filtered log" : "Log entries", tone: "indigo", icon: "📋" },
  ];
  var rmUsageQtyTotal = rmUsagesForDay.reduce(function (a, u) { return a + (Number(u.qty) || 0); }, 0);
  var activityUsageKpis = [
    { label: "Events", value: String(rmUsagesForDay.length), sub: fmtDateFull(rmLogDateStr), tone: "teal", icon: "🧪" },
    { label: "Qty used", value: fmtSumQty(rmUsageQtyTotal), sub: "Ingredients consumed", tone: "blue", icon: "📉" },
    { label: "Ingredients", value: String(rawMaterialProducts.length), sub: "Tracked materials", tone: "indigo", icon: "📦" },
    { label: "All time", value: String((state.rawMaterialUsages || []).length), sub: "Usage records", tone: "green", icon: "📋" },
  ];

  var InvEmpty = function (p) {
    return (
      <div className="erp-inv-empty">
        <div className="erp-inv-empty-icon">{p.icon || "📦"}</div>
        <div className="erp-inv-empty-title">{p.title}</div>
        {p.sub ? <div className="erp-inv-empty-sub">{p.sub}</div> : null}
        {p.action || null}
      </div>
    );
  };

  var overviewKpis = [
    { label: "Products", value: String(totalProducts), sub: fmtSumQty(totalStockUnits) + " units on hand", tone: "blue", icon: "📦" },
    { label: "Cost value", value: getCurrencySymbol() + " " + fmtNum(stockCostValue), sub: "Inventory at cost", tone: "indigo", icon: "🏷️" },
    { label: "Potential profit", value: getCurrencySymbol() + " " + fmtNum(potentialProfit), sub: avgMargin == null ? "No margin data yet" : ("Avg margin " + avgMargin + "%"), tone: potentialProfit >= 0 ? "green" : "red", icon: potentialProfit >= 0 ? "📈" : "📉" },
    { label: "Damaged loss", value: getCurrencySymbol() + " " + fmtNum(damagedValue), sub: fmtSumQty(totalDamagedUnits) + " damaged units", tone: totalDamagedUnits > 0 ? "orange" : "teal", icon: "⚠️" },
  ];

  var stockHealthRows = [
    { label: "In stock", val: stockProducts.filter(function (p) { return (p.stock || 0) > 5; }).length, color: C.green },
    { label: "Low stock", val: lowStock, color: C.amber },
    { label: "Out of stock", val: outOfStock, color: C.red },
    { label: "Has damage", val: stockProducts.filter(function (p) { return (p.damaged || 0) > 0; }).length, color: C.orange },
  ];

  var INV_MODAL_HEADER = "linear-gradient(135deg, #15803d 0%, #166534 100%)";
  var INV_MODAL_HEADER_DAMAGE = "linear-gradient(135deg, #d97706 0%, #b45309 100%)";
  var INV_MODAL_HEADER_VOID = "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)";
  var INV_MODAL_HEADER_EDIT = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";

  var openAddProduct = function () {
    setNewProdKey(function (k) { return k + 1; });
    setNewP(blankProduct());
  };

  return (
    <div className="erp-page erp-inv-modern">
      <div className="erp-inv-chrome">
        <div className="erp-inv-topbar erp-inv-topbar-pro">
          <div className="erp-inv-topbar-brand">
            <h1 className="erp-inv-header-title">Inventory</h1>
            <p className="erp-inv-header-sub">{getCurrencySymbol()} {fmtNum(stockRetailValue)} retail · {totalProducts} products</p>
          </div>
          <div className="erp-inv-health">
            <span className={"erp-inv-health-pill" + (outOfStock === 0 ? " is-ok" : " is-warn")}>{outOfStock === 0 ? "✓ Stock OK" : outOfStock + " out"}</span>
            {lowStock > 0 ? <span className="erp-inv-health-pill is-warn">{lowStock} low</span> : null}
            {totalDamagedUnits > 0 ? <span className="erp-inv-health-pill is-damage">{totalDamagedUnits} dmg</span> : null}
          </div>
          <button type="button" className="erp-inv-btn-add" onClick={openAddProduct} title="Add Product (F12)">+ Add Product <kbd>F12</kbd></button>
        </div>
        <div className="erp-inv-tabbar" role="tablist" aria-label="Inventory sections">
          {ITABS.map(function (t) { return invTabBtn(t[0], t[1], t[2]); })}
        </div>
      </div>

      <div className="erp-inv-body">
      {/* -- OVERVIEW TAB -- */}
      {itab === "overview" && (
        <div className="erp-inv-overview-stack erp-inv-tab-pro">

          <div className="erp-inv-ov-hero">
            <div className="erp-inv-ov-hero-glow" aria-hidden="true" />
            <div className="erp-inv-ov-hero-main">
              <div className="erp-inv-ov-hero-eyebrow">Stock snapshot</div>
              <div className="erp-inv-ov-hero-title">Retail value</div>
              <div className="erp-inv-ov-hero-val">{getCurrencySymbol()} {fmtNum(stockRetailValue)}</div>
              <div className="erp-inv-ov-hero-sub">{fmtSumQty(totalStockUnits)} units · {totalProducts} products · {stockProducts.length} tracked SKUs</div>
            </div>
            <div className="erp-inv-ov-hero-chips">
              <span className={"erp-inv-ov-chip" + (outOfStock === 0 ? " is-ok" : " is-warn")}>{outOfStock === 0 ? "✓ No stockouts" : outOfStock + " out of stock"}</span>
              <span className={"erp-inv-ov-chip" + (lowStock === 0 ? " is-ok" : " is-warn")}>{lowStock === 0 ? "✓ Stock levels OK" : lowStock + " low stock"}</span>
              <span className={"erp-inv-ov-chip" + (totalDamagedUnits === 0 ? " is-neutral" : " is-warn")}>{totalDamagedUnits === 0 ? "No damage" : fmtSumQty(totalDamagedUnits) + " damaged"}</span>
            </div>
          </div>

          <InvKpiStrip items={overviewKpis} />

          <div className="erp-inv-split-grid erp-inv-split-compact">
            <div className="erp-inv-panel erp-inv-panel--health">
              <div className="erp-inv-panel-head-gradient">
                <span className="erp-inv-panel-icon" aria-hidden="true">📈</span>
                <div className="erp-inv-panel-head-text">
                  <div className="erp-inv-panel-title">Stock health</div>
                  <div className="erp-inv-panel-sub">{stockProducts.length} tracked · {outOfStock} out · {lowStock} low</div>
                </div>
                {damagedValue > 0 ? (
                  <button
                    type="button"
                    className="erp-inv-damage-pill erp-inv-damage-pill-btn"
                    onClick={function () { openActivity("damage"); }}
                  >
                    {getCurrencySymbol()} {fmtNum(damagedValue)} dmg
                  </button>
                ) : null}
              </div>
              <div className="erp-inv-panel-body-pad">
              {stockHealthRows.map(function (s) {
                var pct = stockProducts.length > 0 ? Math.round(s.val / stockProducts.length * 100) : 0;
                return (
                  <div key={s.label} className="erp-inv-health-row">
                    <div className="erp-inv-health-meta">
                      <span className="erp-inv-health-label">{s.label}</span>
                      <span className="erp-inv-health-val" style={{ color: s.color }}>{s.val}<span className="erp-inv-health-pct"> · {pct}%</span></span>
                    </div>
                    <div className="erp-inv-health-bar">
                      <span style={{ width: Math.max(pct, s.val > 0 ? 4 : 0) + "%", background: s.color }} />
                    </div>
                  </div>
                );
              })}
              {(outOfStock > 0 || lowStock > 0) ? (
                <button type="button" className="erp-inv-btn-attention" onClick={function () { setItab("products"); setStockFilter(outOfStock > 0 ? "Out of Stock" : "Low Stock"); }}>
                  View items needing attention
                </button>
              ) : null}
              </div>
            </div>

            <div className="erp-inv-panel erp-inv-panel--alerts">
              <div className="erp-inv-panel-head-gradient">
                <span className="erp-inv-panel-icon" aria-hidden="true">🔔</span>
                <div>
                  <div className="erp-inv-panel-title">Alerts</div>
                  <div className="erp-inv-panel-sub">Low stock, damage and expiry</div>
                </div>
              </div>
              <div className="erp-inv-alert-list erp-inv-alert-list-compact">
              {(function () {
                var now = new Date();
                var soon = new Date(); soon.setDate(soon.getDate() + 30);
                var showExpiry = getBusinessProfile().modules.expiry;
                var alertProds = stockProducts.filter(function (p) {
                  if ((p.stock || 0) <= 5 || (p.damaged || 0) > 0) return true;
                  if (showExpiry && p.expiryDate) {
                    var ed = new Date(p.expiryDate);
                    if (ed <= soon) return true;
                  }
                  return false;
                }).sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); }).slice(0, 8);
                if (stockProducts.length === 0) {
                  return <InvEmpty icon="✓" title="Nothing to flag" sub="Alerts appear when stock runs low or items are damaged." />;
                }
                if (alertProds.length === 0) {
                  return (
                    <div className="erp-inv-empty erp-inv-empty-inline">
                      <div className="erp-inv-empty-icon is-ok">✓</div>
                      <div className="erp-inv-empty-title is-ok">All products healthy</div>
                    </div>
                  );
                }
                return alertProds.map(function (p) {
                  var isOut = (p.stock || 0) === 0;
                  var isLow = !isOut && (p.stock || 0) <= 5;
                  var hasDmg = (p.damaged || 0) > 0;
                  var isExpired = showExpiry && p.expiryDate && new Date(p.expiryDate) < now;
                  var isExpiringSoon = showExpiry && p.expiryDate && !isExpired && new Date(p.expiryDate) <= soon;
                  return (
                    <div key={p.id} className="erp-inv-alert-item">
                      <div style={{ minWidth: 0 }}>
                        <div className="erp-inv-alert-name">{p.name}</div>
                        <div className="erp-inv-alert-meta">{p.category}</div>
                      </div>
                      <div className="erp-inv-badge-row">
                        {isOut && <span className="erp-inv-badge is-out">Out</span>}
                        {isLow && <span className="erp-inv-badge is-low">Low</span>}
                        {hasDmg && <span className="erp-inv-badge is-damage">Damage</span>}
                        {isExpired && <span className="erp-inv-badge is-expired">Expired</span>}
                        {isExpiringSoon && <span className="erp-inv-badge is-expiring">Expiring</span>}
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
            </div>
          </div>

          <div className="erp-inv-split-grid erp-inv-overview-bottom">
          <div className="erp-inv-panel erp-inv-panel--category">
            <div className="erp-inv-panel-head-gradient">
              <span className="erp-inv-panel-icon" aria-hidden="true">📂</span>
              <div className="erp-inv-panel-head-text">
                <div className="erp-inv-panel-title">By category</div>
                <div className="erp-inv-panel-sub">Units, value and margin per category</div>
              </div>
            </div>
            <div className="erp-inv-table-wrap">
              {totalProducts === 0 ? (
                <InvEmpty
                  icon="📦"
                  title="No products yet"
                  sub="Add your first product to see stock value, categories and alerts here."
                  action={<div style={{ marginTop: 14 }}><Btn sm col="cyan" onClick={openAddProduct} title="Add Product (F12)">+ Add Product (F12)</Btn></div>}
                />
              ) : (
              <table className="erp-inv-table">
                <thead>
                  <tr>
                    {["Category", "Products", "Units", "Damaged", "Retail", "Cost", "Profit", "Margin"].map(function (h) {
                      return (
                        <th key={h} className={h === "Category" ? "is-left" : ""}>{h}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(function () {
                    var catMap = {};
                    products.forEach(function (p) {
                      var c = p.category || "General";
                      if (!catMap[c]) catMap[c] = { count: 0, units: 0, damaged: 0, retail: 0, cost: 0 };
                      catMap[c].count++;
                      if (!isServiceProduct(p)) {
                        catMap[c].units += inventoryQtyForTotals(p);
                        catMap[c].damaged += p.damaged || 0;
                        catMap[c].retail += inventoryQtyForTotals(p) * inventoryRetailSellPerBase(p);
                        catMap[c].cost += inventoryQtyForTotals(p) * inventoryRetailCostPerBase(p);
                      }
                    });
                    return Object.keys(catMap).sort().map(function (cat, i) {
                      var d = catMap[cat];
                      var margin = d.retail > 0 ? Math.round((d.retail - d.cost) / d.retail * 100) : 0;
                      return (
                        <tr key={cat}>
                          <td style={{ textAlign: "left" }}>
                            <span className="erp-inv-category-pill">{cat}</span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: C.textMd }}>{d.count}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: C.text }}>{fmtSumQty(d.units)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: d.damaged > 0 ? C.orange : C.muted }}>{d.damaged}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: C.blue }}>{getCurrencySymbol()} {fmtNum(d.retail)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", color: "#6366f1" }}>{getCurrencySymbol()} {fmtNum(d.cost)}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: d.retail - d.cost >= 0 ? C.green : C.red }}>{getCurrencySymbol()} {fmtNum(d.retail - d.cost)}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                              <div style={{ width: 48, height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                                <div style={{ width: Math.min(margin, 100) + "%", height: "100%", background: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red, borderRadius: 99 }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red, minWidth: 32, textAlign: "right" }}>{margin}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              )}
            </div>
          </div>

          <div className="erp-inv-panel erp-inv-panel--top">
            <div className="erp-inv-panel-head-gradient">
              <span className="erp-inv-panel-icon" aria-hidden="true">🏆</span>
              <div className="erp-inv-panel-head-text">
                <div className="erp-inv-panel-title">Top by value</div>
                <div className="erp-inv-panel-sub">Highest retail stock value</div>
              </div>
            </div>
            <div className="erp-inv-top-list">
              {stockProducts.length === 0 ? (
                <InvEmpty icon="📊" title="No stock items" sub="Products with stock will rank here by retail value." />
              ) : stockProducts.slice().sort(function (a, b) {
                return (inventoryQtyForTotals(b) * inventoryRetailSellPerBase(b)) - (inventoryQtyForTotals(a) * inventoryRetailSellPerBase(a));
              }).slice(0, 6).map(function (p, i) {
                var unitSell = inventoryRetailSellPerBase(p);
                var val = inventoryQtyForTotals(p) * unitSell;
                var pct = stockRetailValue > 0 ? Math.round(val / stockRetailValue * 100) : 0;
                return (
                  <div key={p.id} className="erp-inv-top-item">
                    <span className={"erp-inv-top-rank" + (i < 3 ? " is-top" : "")}>{i + 1}</span>
                    <div className="erp-inv-top-body">
                      <div className="erp-inv-top-name">{p.name}</div>
                      <div className="erp-inv-top-meta">
                        {getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}
                        <span>·</span>
                        {getCurrencySymbol()} {fmtNum(unitSell)}/{p.unit || "Pcs"}
                      </div>
                    </div>
                    <div className="erp-inv-top-val">
                      <div>{getCurrencySymbol()} {fmtNum(val)}</div>
                      <div className="erp-inv-top-pct">{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* -- PRODUCTS TAB -- */}
      {itab === "products" && (
        <div className="erp-inv-tab-pro erp-inv-products-tab">
        <InvTabHead icon="📦" tone="blue" title="Product catalog" sub={showInactive ? (rows.length + " voided products") : (rows.length.toLocaleString() + " of " + totalProducts.toLocaleString() + " products · search, filter & manage stock")} />
        <InvKpiStrip compact items={productsTabKpis} />
        <div className="erp-inv-datatab erp-inv-products erp-inv-datatab-pro">
          <div className="erp-inv-toolbar erp-inv-toolbar-pro">
            <div className="erp-inv-search erp-inv-search-box" ref={invSearchRef}>
              <input
                type="text"
                className="erp-inv-search-input erp-inv-search-input-icon"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder="Search name, ID, barcode…"
              />
            </div>
            <div className="erp-inv-select-wrap erp-inv-select-compact">
              <Sel value={catFilter} onChange={function (e) { setCatFilter(e.target.value); }}>
                {cats.map(function (c) { return <option key={c}>{c}</option>; })}
              </Sel>
            </div>
            <div className="erp-inv-chip-row erp-inv-chip-row-inline">
              {stockChipFilters.map(function (s) {
                return (
                  <button
                    key={s}
                    type="button"
                    className={"erp-inv-chip" + (stockFilter === s ? " is-active" : "")}
                    onClick={function () { setStockFilter(s); }}
                  >{stockChipLabel(s)}</button>
                );
              })}
            </div>
            <button
              type="button"
              className={"erp-inv-btn-voided" + (showInactive ? " is-on" : "")}
              onClick={function () { setShowInactive(function (v) { return !v; }); setSearch(""); }}
            >
              {showInactive ? "Voided ✓" : "Voided"}
            </button>
          </div>
          <div className="erp-inv-table-wrap erp-inv-table-wrap-dense">
            <table className="erp-inv-table erp-inv-products-table">
              <thead><tr><TH>ID</TH><TH>Product</TH><TH>Barcode</TH><TH>Cat</TH><TH>Unit</TH><TH>Cost</TH><TH>Price</TH><TH>Mrg</TH><TH>Stock</TH><TH>Value</TH><TH>Dmg</TH><TH right style={{ minWidth: 132 }}>Actions</TH></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={12} className="erp-inv-empty-cell">{showInactive ? "No voided products" : "No products found"}</td></tr>}
                {invPager.slice.map(function (p, i) {
                  var isService = isServiceProduct(p);
                  var isRaw = isRawMaterialProduct(p);
                  var effectiveCost = inventoryRetailCostPerBase(p);
                  var effectiveSell = inventoryRetailSellPerBase(p);
                  var margin = (isService || isRaw) ? null : (isGlassProduct(p, shopSettings) ? glassMarginPct(p) : getProductMarginPct(p));
                  var stockVal = isService ? 0 : (isGlassProduct(p, shopSettings) ? glassStockVal(p) : (inventoryQtyForTotals(p) * effectiveSell));
                  return (
                    <TR key={p.id} i={i}>
                      <td><span className="erp-inv-id">{p.productId || "-"}</span></td>
                      <td>
                        <div className="erp-inv-prod-name">{p.name}{showInactive ? <span className="erp-inv-void-tag">VOID</span> : null}</div>
                      </td>
                      <TD><span className="erp-inv-mono">{p.barcode}</span></TD>
                      <td><span className="erp-inv-category-pill">{p.category}</span></td>
                      <TD><span className="erp-inv-unit-pill">{p.unit || "Pcs"}</span></TD>
                      <TD color={C.muted}>{getCurrencySymbol()} {fmtNum(effectiveCost)}</TD>
                      <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(effectiveSell)}</TD>
                      <td>
                        {margin == null ? (
                          <span className="erp-inv-muted-dash">-</span>
                        ) : (
                          <span className={"erp-inv-margin" + (margin >= 30 ? " is-good" : margin >= 15 ? " is-mid" : " is-low")}>{margin}%</span>
                        )}
                      </td>
                      <td>
                        {isService ? (
                          <span className="erp-inv-stock-pill is-service">Svc</span>
                        ) : (
                          <span className={"erp-inv-stock-pill" + ((p.stock || 0) === 0 ? " is-out" : (p.stock || 0) <= 5 ? " is-low" : " is-ok")}>
                            {isGlassProduct(p, shopSettings)
                              ? formatGlassStockLabel(p, fmtNum)
                              : (getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit))}
                          </span>
                        )}
                      </td>
                      <TD color={isService ? C.muted : (isRaw ? C.orange : C.purple)}>{isService ? "-" : (getCurrencySymbol() + " " + fmtNum(stockVal))}</TD>
                      <TD color={(p.damaged || 0) > 0 ? C.orange : C.muted}>{p.damaged || 0}</TD>
                      <td className="erp-inv-act-cell">
                        <ActBtnGroup gap={4}>
                          {showInactive ? (
                            <ActBtn tone="green" title="Restore voided product" onClick={function () { reactivateProduct(p.id); }} />
                          ) : (
                            <React.Fragment>
                              <ActBtn tone="cyan" title="View" onClick={function () { setViewP(p); }} />
                              <ActBtn tone="blue" title="Edit" onClick={function () { setEditP(Object.assign({}, p, { extraUnits: formExtraUnitsFromProduct(p) })); }} />
                              <ActBtn tone="orange" title="Damage" onClick={function () { setActionP({ product: p, mode: "damage" }); setDmgQty("1"); setReason(""); }} />
                              <ActBtn
                                tone="red"
                                title={(p.stock || 0) > 0 ? "Void — clear stock first" : ((p.damaged || 0) > 0 ? "Void — clear damaged qty first" : "Void product")}
                                style={((p.stock || 0) > 0 || (p.damaged || 0) > 0) ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                                onClick={function () {
                                if ((p.stock || 0) > 0) {
                                  showAlert("Cannot void \"" + p.name + "\" — it has " + fmtStock(p.stock, p.unit) + " in stock.\n\nSell or remove all stock first, then void.");
                                  return;
                                }
                                if ((p.damaged || 0) > 0) {
                                  showAlert("Cannot void \"" + p.name + "\" — it still has " + fmtStock(p.damaged, p.unit) + " marked as damaged.\n\nClear damaged stock first.");
                                  return;
                                }
                                setActionP({ product: p, mode: "void" }); setReason("");
                              }}
                              />
                            </React.Fragment>
                          )}
                        </ActBtnGroup>
                      </td>
                    </TR>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="erp-inv-datatab-foot">
            <Pager pager={invPager} />
            {rows.length > 0 && (
              <div className="erp-inv-table-foot erp-inv-table-foot-inline">
                <span>{rows.length} items</span>
                <span>Retail <b>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * inventoryRetailSellPerBase(p); }, 0))}</b></span>
                <span>Cost <b>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * inventoryRetailCostPerBase(p); }, 0))}</b></span>
                <span>Profit <b>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * (inventoryRetailSellPerBase(p) - inventoryRetailCostPerBase(p)); }, 0))}</b></span>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* -- INGREDIENTS TAB -- */}
      {itab === "ingredients" && (
        <div className="erp-inv-overview-stack erp-inv-tab-pro">
          <InvTabHead icon="🧪" tone="teal" title="Ingredients" sub="Raw materials — log daily usage and view purchase history" />
          <Card className="erp-inv-ing-card">
            <CardTitle sub="Tap a row to log usage · View history in Activity → Usage">Ingredient stock</CardTitle>
            {rawMaterialProducts.length > 0 && (
              <div className="erp-inv-filter-bar">
                <div className="erp-inv-search" ref={rmAcWrapRef}>
                  <span className="erp-inv-search-ico" aria-hidden="true">🔍</span>
                  <input
                    type="text"
                    className="erp-inv-search-input"
                    placeholder="Search by name, ID, barcode, or category…"
                    value={rmSearch}
                    autoComplete="off"
                    onChange={function (e) { setRmSearch(e.target.value); setRmAcOpen(true); }}
                    onFocus={function () { setRmAcOpen(true); }}
                  />
                  {rmSearch ? (
                    <button
                      type="button"
                      className="erp-inv-search-clear"
                      aria-label="Clear search"
                      onMouseDown={function (e) { e.preventDefault(); }}
                      onClick={function () { setRmSearch(""); setRmAcOpen(false); }}
                    >×</button>
                  ) : null}
                  {rmAcOpen && rmSearch.trim() && rmAutocompleteSuggestions.length > 0 && (
                    <div className="erp-inv-ac-dropdown">
                      {rmAutocompleteSuggestions.map(function (p) {
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="erp-inv-ac-item"
                            onMouseDown={function (e) { e.preventDefault(); }}
                            onClick={function () { setRmSearch(p.name); setRmAcOpen(false); }}
                          >
                            <span className="erp-inv-ac-name">{p.name}</span>
                            <span className="erp-inv-ac-meta">{p.category}</span>
                            {p.barcode ? <span className="erp-inv-ac-meta erp-inv-ac-code">{p.barcode}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button type="button" className="erp-inv-btn-attention" style={{ width: "auto", marginTop: 0 }} onClick={function () { openActivity("usage"); }}>
                  View usage log
                </button>
              </div>
            )}
            {rawMaterialProducts.length === 0 ? (
              <InvEmpty
                icon="🧪"
                title="No ingredients yet"
                sub="Add a product as an ingredient, then return here to log daily usage."
                action={
                  <div style={{ marginTop: 12 }}>
                    <Btn col="cyan" onClick={function () {
                      setItab("products");
                      setTimeout(function () {
                        setNewProdKey(function (k) { return k + 1; });
                        setNewP(blankProduct({ type: "raw_material" }));
                      }, 30);
                    }}>+ Add ingredient</Btn>
                  </div>
                }
              />
            ) : rawMaterialFiltered.length === 0 ? (
              <div className="erp-inv-empty erp-inv-empty-inline">
                <div className="erp-inv-empty-sub">No ingredients match &quot;{rmSearch}&quot;.</div>
                <button type="button" className="erp-inv-link-btn" onClick={function () { setRmSearch(""); }}>Clear search</button>
              </div>
            ) : (
              <div className="erp-inv-table-wrap">
                <table className="erp-inv-table">
                  <thead>
                    <tr>
                      <th className="is-left">Name</th>
                      <th>Available</th>
                      <th> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawMaterialFiltered.map(function (p) {
                      var avail = getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit);
                      return (
                        <tr key={p.id} className="erp-inv-row-click" onClick={function () { openRmUseModal(p); }}>
                          <td style={{ fontWeight: 800 }}>{p.name}</td>
                          <td style={{ textAlign: "right", fontWeight: 800, color: (p.stock || 0) <= 0 ? C.red : C.text }}>{avail}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={function (e) { e.stopPropagation(); }}>
                            <Btn sm col="blue" onClick={function () { setRmDetailProduct(p); }}>History</Btn>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {rmUseModal && (
            <Modal title={"Log usage — " + rmUseModal.name} onClose={function () { setRmUseModal(null); }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                Available now:{" "}
                <strong style={{ color: C.text }}>
                  {getBulkDisplayParts(rmUseModal) ? fmtStockDual(rmUseModal) : fmtStock(rmUseModal.stock || 0, rmUseModal.unit)}
                </strong>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Sel label="Unit" value={rmUseUnit} onChange={function (e) { setRmUseUnit(e.target.value); }}>
                  {getProductUnitRows(rmUseModal).map(function (row, ui) {
                    var nm = String(row.name || "").trim();
                    var fac = Number(row.factor) || 1;
                    return (
                      <option key={"rm-u-" + ui + "-" + nm} value={nm}>
                        {fac !== 1 ? (nm + " · 1 " + nm + " = " + fmtSumQty(fac) + " in stock unit") : (nm + " · stock unit")}
                      </option>
                    );
                  })}
                </Sel>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>
                Choose the unit you measured in (same units as on the product / purchases). Stock is converted automatically.
              </div>
              <Input label={"Quantity used (" + rmUseUnit + ")"} type="number" min="0" step="any" value={rmUseQty} onChange={function (e) { setRmUseQty(e.target.value); }} />
              <div style={{ marginTop: 10 }}>
                <Input label="Date" type="date" value={rmUseDate} min={periodLockTransactionMinDate || undefined} onChange={function (e) { setRmUseDate(e.target.value || today()); }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <Btn col="gray" onClick={function () { setRmUseModal(null); }}>Cancel</Btn>
                <Btn col="cyan" onClick={saveRmUsage}>Save</Btn>
              </div>
            </Modal>
          )}

          {rmDetailProduct && (function () {
            var tl = buildIngredientTimeline(rmDetailProduct.id);
            return (
            <Modal title={"History — " + rmDetailProduct.name} onClose={function () { setRmDetailProduct(null); }} wide>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                Unit: <strong style={{ color: C.text }}>{rmDetailProduct.unit || "Pcs"}</strong>
                {" · "}
                Current stock:{" "}
                <strong style={{ color: C.text }}>
                  {getBulkDisplayParts(rmDetailProduct) ? fmtStockDual(rmDetailProduct) : fmtStock(rmDetailProduct.stock || 0, rmDetailProduct.unit)}
                </strong>
              </div>
              <div className="erp-inv-table-wrap" style={{ maxHeight: 420 }}>
                <table className="erp-inv-table">
                  <thead>
                    <tr>
                      <th className="is-left">Date</th>
                      <th className="is-left">Event</th>
                      <th className="is-left">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tl.map(function (row, idx) {
                      return (
                        <tr key={row.sort + "_" + idx}>
                          <td style={{ whiteSpace: "nowrap" }}>{fmtDateFull(row.date)}</td>
                          <td style={{ fontWeight: 700, color: row.kind === "use" ? C.orange : row.kind === "purchase" ? C.green : row.kind === "return" ? C.red : C.textMd }}>{row.label}</td>
                          <td>{row.detail}</td>
                        </tr>
                      );
                    })}
                    {tl.length === 0 && (
                      <tr><td colSpan={3} style={{ padding: 20, textAlign: "center", color: C.muted }}>No purchase or usage history yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <Btn col="gray" onClick={function () { setRmDetailProduct(null); }}>Close</Btn>
              </div>
            </Modal>
            );
          })()}
        </div>
      )}

      {/* -- ACTIVITY TAB -- */}
      {itab === "activity" && (
        <div className="erp-inv-tab-pro erp-inv-activity-tab">
        <InvTabHead icon="📋" tone="purple" title="Activity log" sub="Stock changes, damage events and ingredient usage" />
        {activitySubtab === "changes" ? <InvKpiStrip compact items={activityChangesKpis} /> : null}
        {activitySubtab === "damage" ? <InvKpiStrip compact items={activityDamageKpis} /> : null}
        {activitySubtab === "usage" && hasIngredients ? <InvKpiStrip compact items={activityUsageKpis} /> : null}
        <div className="erp-inv-datatab erp-inv-activity erp-inv-datatab-pro">
          <div className="erp-inv-activity-toolbar erp-inv-activity-toolbar-pro">
            <div className="erp-inv-subtabs erp-inv-subtabs-pro">
              {ACTIVITY_TABS.map(function (t) {
                return (
                  <button
                    key={t[0]}
                    type="button"
                    className={"erp-inv-subtab tone-" + t[0] + (activitySubtab === t[0] ? " is-active" : "")}
                    onClick={function () { setActivitySubtab(t[0]); setActivitySearch(""); }}
                  ><span className="erp-inv-subtab-ico" aria-hidden="true">{t[2]}</span>{t[1]}</button>
                );
              })}
            </div>
            {activitySubtab === "usage" ? (
              <div className="erp-inv-date-tools">
                <span className="erp-inv-date-label">Date</span>
                <div className="erp-inv-date-range">
                  <input
                    type="date"
                    className="erp-inv-field-ctrl"
                    value={rmUsageLogDate}
                    min={periodLockTransactionMinDate || undefined}
                    onChange={function (e) { setRmUsageLogDate(e.target.value || (typeof today === "function" ? today() : "")); }}
                  />
                </div>
                {rmLogDateStr !== (typeof today === "function" ? today() : "") && (
                  <button type="button" className="erp-inv-btn-attention erp-inv-btn-attention-inline" onClick={function () { setRmUsageLogDate(typeof today === "function" ? today() : ""); }}>Today</button>
                )}
              </div>
            ) : (
              <div className="erp-inv-activity-search">
                <div className="erp-inv-search erp-inv-search-box">
                  <span className="erp-inv-search-ico" aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    className="erp-inv-search-input"
                    value={activitySearch}
                    onChange={function (e) { setActivitySearch(e.target.value); }}
                    placeholder={activitySubtab === "damage" ? "Search damage…" : "Search log…"}
                  />
                </div>
              </div>
            )}
          </div>

          {activitySubtab === "damage" && (
            <React.Fragment>
              <div className="erp-inv-datatab-section">
                <div className="erp-inv-section-head">
                  <div className="erp-inv-section-title">Damaged inventory</div>
                  <div className="erp-inv-section-sub">{damagedProducts.length} with damage</div>
                </div>
                <div className="erp-inv-table-wrap erp-inv-table-wrap-dense">
                  <table className="erp-inv-table erp-inv-activity-table erp-inv-damage-inv-table">
                    <thead>
                      <tr>
                        <th className="is-left">Product</th>
                        <th className="is-left">Category</th>
                        <th>Cost</th>
                        <th>Stock</th>
                        <th>Dmg</th>
                        <th>Loss</th>
                        <th> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {damagedProducts.length === 0 ? (
                        <tr><td colSpan={7} className="erp-inv-empty-cell">No damaged items</td></tr>
                      ) : damagedProducts.map(function (p, i) {
                        return (
                          <TR key={p.id} i={i}>
                            <TD bold>{p.name}</TD>
                            <TD>{p.category}</TD>
                            <TD>{getCurrencySymbol()} {fmtNum(p.cost || 0)}</TD>
                            <TD bold color={(p.stock || 0) > 0 ? C.green : C.red}>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}</TD>
                            <td><span className="erp-inv-badge is-damage">{p.damaged}</span></td>
                            <TD bold color={C.red}>{getCurrencySymbol()} {fmtNum((p.damaged || 0) * (p.cost || 0))}</TD>
                            <td className="erp-inv-act-cell"><Btn sm col="orange" onClick={function () { setActionP({ product: p, mode: "damage" }); setDmgQty("1"); setReason(""); }}>Log</Btn></td>
                          </TR>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="erp-inv-datatab-section">
                <div className="erp-inv-section-head">
                  <div className="erp-inv-section-title">Damage log</div>
                  <div className="erp-inv-section-sub">{damageLogRows.length} events{activitySearchQ ? " · filtered" : ""}</div>
                </div>
                <div className="erp-inv-table-wrap erp-inv-table-wrap-dense">
                  <table className="erp-inv-table erp-inv-activity-table">
                    <thead><tr><th className="is-left">Date</th><th className="is-left">Product</th><th>Qty</th><th className="is-left">Reason</th></tr></thead>
                    <tbody>
                      {damageLogRows.length === 0 && <tr><td colSpan={4} className="erp-inv-empty-cell">{activitySearchQ ? "No matches" : "No damage logged"}</td></tr>}
                      {damageLogRows.map(function (l, i) {
                        return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><TD bold>{l.productName}</TD><TD center color={C.orange}>{fmtSumQty(l.qty)}</TD><TD>{l.reason}</TD></TR>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </React.Fragment>
          )}

          {activitySubtab === "changes" && (
            <div className="erp-inv-datatab-section">
              <div className="erp-inv-section-head">
                <div className="erp-inv-section-title">Product changes</div>
                <div className="erp-inv-section-sub">{productLogRows.length} entries{activitySearchQ ? " · filtered" : ""}</div>
              </div>
              <div className="erp-inv-table-wrap erp-inv-table-wrap-dense">
                <table className="erp-inv-table erp-inv-activity-table">
                  <thead><tr><th className="is-left">Date</th><th className="is-left">Type</th><th className="is-left">Product</th><th>Qty</th><th className="is-left">Reason</th></tr></thead>
                  <tbody>
                    {productLogRows.length === 0 && <tr><td colSpan={5} className="erp-inv-empty-cell">{activitySearchQ ? "No matches" : "No log entries"}</td></tr>}
                    {productLogRows.map(function (l, i) {
                      return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><td className="erp-inv-badge-cell"><Badge status={l.type} /></td><TD bold>{l.productName}</TD><TD center>{l.qty}</TD><TD>{l.reason}</TD></TR>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activitySubtab === "usage" && hasIngredients && (
            <div className="erp-inv-datatab-section">
              <div className="erp-inv-section-head">
                <div className="erp-inv-section-title">Ingredient usage</div>
                <div className="erp-inv-section-sub">{rmUsagesForDay.length} events · {fmtDateFull(rmLogDateStr)}</div>
              </div>
              {rmUsagesForDay.length === 0 ? (
                <div className="erp-inv-empty erp-inv-empty-inline">No usage for {fmtDateFull(rmLogDateStr)}</div>
              ) : (
                <div className="erp-inv-table-wrap erp-inv-table-wrap-dense">
                  <table className="erp-inv-table erp-inv-activity-table">
                    <thead>
                      <tr>
                        <th className="is-left">Ingredient</th>
                        <th>Qty</th>
                        <th className="is-left">Unit</th>
                        <th>Base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rmUsagesForDay.map(function (u, ri) {
                        var pfind = (state.products || []).find(function (p) { return p && String(p.id) === String(u.productId); });
                        var nm = pfind && pfind.name ? pfind.name : "Unknown";
                        var baseDisp = u.qtyBase != null && isFinite(Number(u.qtyBase))
                          ? (typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qtyBase)) : String(u.qtyBase))
                          : "—";
                        return (
                          <tr key={String(u.id || "row-" + ri)}>
                            <td style={{ fontWeight: 700 }}>{nm}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qty) || 0) : String(u.qty)}</td>
                            <td>{String(u.unit || "—")}</td>
                            <td style={{ textAlign: "right", color: "var(--inv-muted)" }}>{baseDisp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      </div>

      {/* -- PRODUCT DETAIL VIEW -- */}
      {viewP && (
        <Modal title={viewP.name} onClose={function () { setViewP(null); }} wide className="erp-inv-product-modal erp-inv-modal-view" headerBg={INV_MODAL_HEADER}>
          <div className="erp-inv-modal-kpi-grid">
            {[
              { label: "Cost Price", val: getCurrencySymbol() + " " + fmtNum(inventoryRetailCostPerBase(viewP)), color: C.muted },
              { label: "Sell Price", val: getCurrencySymbol() + " " + fmtNum(inventoryRetailSellPerBase(viewP)), color: C.blue },
              { label: "Profit/Unit", val: hasMeaningfulMargin(viewP) ? (getCurrencySymbol() + " " + fmtNum(inventoryRetailSellPerBase(viewP) - inventoryRetailCostPerBase(viewP))) : "-", color: hasMeaningfulMargin(viewP) ? C.green : C.muted },
              { label: "Margin", val: getProductMarginPct(viewP) == null ? "-" : (getProductMarginPct(viewP) + "%"), color: getProductMarginPct(viewP) == null ? C.muted : C.purple },
              { label: "Stock Units", val: isServiceProduct(viewP) ? "Service" : (isGlassProduct(viewP, shopSettings) ? formatGlassStockLabel(viewP, fmtNum) : (getBulkDisplayParts(viewP) ? fmtStockDual(viewP) : fmtStock(viewP.stock || 0, viewP.unit))), color: isServiceProduct(viewP) ? C.blue : ((viewP.stock || 0) > 5 ? C.green : (viewP.stock || 0) > 0 ? C.amber : C.red) },
              { label: "Stock Value", val: isServiceProduct(viewP) ? "-" : (getCurrencySymbol() + " " + fmtNum(isGlassProduct(viewP, shopSettings) ? glassStockVal(viewP) : (inventoryQtyForTotals(viewP) * inventoryRetailSellPerBase(viewP)))), color: isServiceProduct(viewP) ? C.muted : C.blue },
              { label: "Damaged Units", val: String(viewP.damaged || 0), color: (viewP.damaged || 0) > 0 ? C.orange : C.muted },
              { label: "Damage Cost", val: getCurrencySymbol() + " " + fmtNum((viewP.damaged || 0) * inventoryRetailCostPerBase(viewP)), color: C.red },
              { label: "Category", val: viewP.category || "General", color: C.text },
              { label: "Unit", val: viewP.unit || "Pcs", color: C.accent }
            ].concat(!COMPUTER_SHOP_EDITION && getBusinessProfile().modules.serial && viewP.serialNo ? [
              { label: "Serial / IMEI", val: viewP.serialNo, color: C.cyan }
            ] : []).concat(isGlassProduct(viewP, shopSettings) ? [
              { label: "Sheet Size", val: (viewP.glassSheetWidth || "-") + " × " + (viewP.glassSheetHeight || "-") + " " + (viewP.glassDimensionUnit || "mm"), color: C.text },
              { label: "Area / Sheet", val: (viewP.glassAreaSqFt || 0) + " Sq Ft / " + (viewP.glassAreaSqM || 0) + " Sq M", color: C.cyan },
              { label: "Sell Price", val: getCurrencySymbol() + " " + fmtNum(viewP.price || 0) + " / Sheet", color: C.blue },
              { label: "Sell Rate", val: getCurrencySymbol() + " " + fmtNum(getGlassSellRatePerSqFt(viewP)) + " / Sq Ft", color: C.blue },
              { label: "Cost / Sheet", val: getCurrencySymbol() + " " + fmtNum(viewP.cost || 0), color: C.muted },
            ] : []).concat(getBusinessProfile().name === "Jewelry & Watches" ? [
              { label: "Weight", val: viewP.weightGrams ? viewP.weightGrams + " g" : "-", color: C.text },
              { label: "Making Charge", val: viewP.makingCharge ? getCurrencySymbol() + " " + fmtNum(viewP.makingCharge) : "-", color: C.orange }
            ] : []).concat(getBusinessProfile().modules.expiry ? [
              { label: "Expiry Date", val: viewP.expiryDate ? fmtDateFull(viewP.expiryDate) : "-", color: viewP.expiryDate && new Date(viewP.expiryDate) < new Date() ? C.red : C.text },
              { label: "Batch / Lot No", val: viewP.batchNo || "-", color: C.muted }
            ] : []).map(function (s) {
              return (
                <div key={s.label} className="erp-inv-modal-kpi">
                  <div className="erp-inv-modal-kpi-label">{s.label}</div>
                  <div className="erp-inv-modal-kpi-val" style={{ color: s.color }}>{s.val}</div>
                </div>
              );
            })}
          </div>
          <div className="erp-inv-modal-meta">
            <strong>Barcode:</strong> <span className="erp-inv-mono">{viewP.barcode}</span>
            {viewP.description ? <span className="erp-inv-modal-desc">{viewP.description}</span> : null}
          </div>
          <div className="erp-inv-modal-actions">
            <Btn col="blue" onClick={function () { setEditP(Object.assign({}, viewP, { extraUnits: formExtraUnitsFromProduct(viewP) })); setViewP(null); }}>Edit</Btn>
            <Btn col="orange" onClick={function () { setActionP({ product: viewP, mode: "damage" }); setDmgQty("1"); setReason(""); setViewP(null); }}>Mark Damage</Btn>
            <Btn col="gray" onClick={function () { setViewP(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {newP && (
        <AddNewProductModal
          mode="inventory"
          remountKey={newProdKey}
          initial={newP}
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
          onClose={function () { setNewP(null); }}
          onSubmit={function (form, meta) { saveNewFromShared(form, meta); }}
        />
      )}

      {editP && (
        <Modal title={"Edit: " + editP.name} onClose={function () { setEditP(null); }} medium className="erp-inv-product-modal erp-inv-edit-modal" headerBg={INV_MODAL_HEADER_EDIT}>
          <div className="erp-inv-modal-form">
            <Input label="Product Name" value={editP.name} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} onFocus={editNameHint.onNameFocus} onBlur={editNameHint.onNameBlur} />
            <ProductNameDuplicateHint name={editP.name} products={state.products} excludeId={editP.id} C={C} visible={editNameHint.visible} onDismiss={editNameHint.onDismiss} />
            <CategorySelect Sel={Sel} value={editP.category || "General"} settings={shopSettings} onChange={function (e) { onProductCategoryChange(setEditP, e.target.value); }} />
            <Input label="Barcode" value={editP.barcode || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
            <Sel label="Product Type" value={editP.type || "stock"} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
              <option value="stock">stock</option>
              <option value="service">service</option>
              <option value="raw_material">raw_material</option>
            </Sel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label={glassCostPriceLabels(editP, shopSettings).cost} type="number" value={editP.cost || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
              <Input label={editP.type === "service" ? "Selling Price (optional — enter at sale)" : glassCostPriceLabels(editP, shopSettings).sell} type="number" value={editP.price || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} placeholder={editP.type === "service" ? "Leave empty if price varies" : ""} />
              <Sel label="Base Unit" value={editP.unit || getDefaultProductUnit(shopSettings, editP.category)} onChange={function (e) {
                var nextUnit = e.target.value;
                setEditP(function (x) { return Object.assign({}, x, { unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit)); });
              }}>{getUnitsForSubCategory(editP.category, shopSettings).map(function (u) { return <option key={u}>{u}</option>; })}</Sel>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Current Stock</div>
                <div style={{ padding: "9px 13px", background: "#f8fafc", border: "1.5px solid " + C.border, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.text }}>
                  {isGlassProduct(editP, shopSettings) ? formatGlassStockLabel(editP, fmtNum) : (getBulkDisplayParts(editP) ? fmtStockDual(editP) : fmtStock(editP.stock || 0, editP.unit))}
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 2 }}>Add stock via Purchases only</div>
                </div>
              </div>
            </div>
            {isGlassStockProductForm(editP, shopSettings) && (
              <GlassSheetInfo form={editP} setForm={setEditP} C={C} Input={Input} Sel={Sel} />
            )}
            <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, marginBottom: 4 }}>Additional units (optional)</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Each <strong>factor</strong> is how many <strong>{editP.unit || "Pcs"}</strong> (base) are in one of that unit. Stock is always kept in base units.</div>
              {(editP.extraUnits || []).map(function (row, idx) {
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(80px,1fr) 88px minmax(72px,1fr) minmax(72px,1fr) 34px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                    <Input label="Unit name" value={row.name || ""} onChange={function (e) { var v = e.target.value; setEditP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { name: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="Strip / Box" />
                    <Input label="Factor" type="number" value={row.factor || ""} onChange={function (e) { var v = e.target.value; setEditP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { factor: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="e.g. 12" />
                    <Input label="Sell (opt.)" type="number" value={row.sellPrice || ""} onChange={function (e) { var v = e.target.value; setEditP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { sellPrice: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <Input label="Cost (opt.)" type="number" value={row.cost || ""} onChange={function (e) { var v = e.target.value; setEditP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { cost: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <button type="button" className="erp-inv-unit-remove" onClick={function () { setEditP(function (x) { var next = (x.extraUnits || []).filter(function (_, j) { return j !== idx; }); return Object.assign({}, x, { extraUnits: next }); }); }} title="Remove">×</button>
                  </div>
                );
              })}
              <button type="button" className="erp-inv-unit-add" onClick={function () { setEditP(function (x) { return Object.assign({}, x, { extraUnits: (x.extraUnits || []).concat([{ name: "", factor: "", sellPrice: "", cost: "" }]) }); }); }}>+ Add Unit</button>
            </div>
            {normalizeProductType(editP.type) === "raw_material" ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
                {RAW_MATERIAL_PRICE_COST_HINT}
              </div>
            ) : null}
            {editP.price && (
              <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 20 }}>
                <span>Profit/unit: <strong style={{ color: C.green }}>{(editP.type === "service" && !(parseFloat(editP.cost) > 0)) ? "-" : (getCurrencySymbol() + " " + fmtNum((parseFloat(editP.price) || 0) - (parseFloat(editP.cost) || 0)))}</strong></span>
                <span>Margin: <strong style={{ color: C.accent }}>{(editP.type === "service" && !(parseFloat(editP.cost) > 0)) ? "-" : (((parseFloat(editP.price) || 0) > 0 ? Math.round(((parseFloat(editP.price) || 0) - (parseFloat(editP.cost) || 0)) / (parseFloat(editP.price) || 1) * 100) : 0) + "%")}</strong></span>
              </div>
            )}
            {getBusinessProfile().modules.serial && !COMPUTER_SHOP_EDITION && (
              <Input label="Serial Number / IMEI (optional)" value={editP.serialNo || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { serialNo: e.target.value }); }); }} placeholder="e.g. 358240051111110" />
            )}
            {getBusinessProfile().name === "Jewelry & Watches" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Weight (grams)" type="number" value={editP.weightGrams || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { weightGrams: e.target.value }); }); }} placeholder="e.g. 5.25" />
                <Input label="Making Charge" type="number" value={editP.makingCharge || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { makingCharge: e.target.value }); }); }} placeholder="e.g. 500" />
              </div>
            )}
            {getBusinessProfile().modules.expiry && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Expiry Date" type="date" value={editP.expiryDate || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { expiryDate: e.target.value }); }); }} />
                <Input label="Batch / Lot Number (optional)" value={editP.batchNo || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { batchNo: e.target.value }); }); }} placeholder="e.g. BATCH-2025-001" />
              </div>
            )}
            <div className="erp-inv-modal-actions">
              <Btn col="cyan" onClick={saveEdit} disabled={editProductNameExactDup}>Save Changes</Btn>
              <Btn col="gray" onClick={function () { setEditP(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {actionP && (
        <Modal
          title={actionP.mode === "damage" ? "Mark Damaged" : (actionP.mode === "void" ? "Void Product" : "Remove Stock")}
          onClose={function () { setActionP(null); }}
          medium
          headerBg={actionP.mode === "damage" ? INV_MODAL_HEADER_DAMAGE : (actionP.mode === "void" ? INV_MODAL_HEADER_VOID : INV_MODAL_HEADER_EDIT)}
          className={"erp-inv-product-modal erp-inv-action-modal" + (actionP.mode === "damage" ? " is-damage" : actionP.mode === "void" ? " is-void" : "")}
        >
          <div className={"erp-inv-modal-banner" + (actionP.mode === "damage" ? " is-warn" : " is-danger")}>
            <span>Product: <strong>{actionP.product.name}</strong></span>
            {actionP.mode === "void" ? (
              <span>ID: <strong className="erp-inv-mono">{actionP.product.productId || "—"}</strong></span>
            ) : (
              <span>Stock: <strong>{getBulkDisplayParts(actionP.product) ? fmtStockDual(actionP.product) : fmtStock(actionP.product.stock || 0, actionP.product.unit)}</strong></span>
            )}
          </div>
          {actionP.mode === "void" ? (
            <div className="erp-inv-modal-note">
              Hidden from POS and stock lists. Past invoices unchanged. Restore via <strong>Show Voided</strong>.
            </div>
          ) : null}
          {actionP.mode !== "void" && actionP.mode !== "damage" && (
            <div className="erp-inv-modal-field">
              <Input label="Quantity" type="number" value={dmgQty} onChange={function (e) { setDmgQty(e.target.value); }} compact />
            </div>
          )}
          <div className="erp-inv-modal-field">
            <label className="erp-inv-modal-lbl">Reason (required)</label>
            <textarea className="erp-inv-modal-textarea" value={reason} onChange={function (e) { setReason(e.target.value); }} rows={2} placeholder="Enter reason..." />
          </div>
          <div className="erp-inv-modal-actions">
            <Btn col={actionP.mode === "damage" ? "orange" : "red"} onClick={confirmAction} disabled={!reason.trim()}>{actionP.mode === "void" ? "Void Product" : "Confirm"}</Btn>
            <Btn col="gray" onClick={function () { setActionP(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
});

export default Inventory;




















