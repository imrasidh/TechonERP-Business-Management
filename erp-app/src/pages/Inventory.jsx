import React, { useState, useEffect, useRef, useMemo } from "react";
import { validateExtraUnits, buildUnitsPersistFields, formExtraUnitsFromProduct, getProductUnitRows } from "../units/productUnits.js";
import {
  RAW_MATERIAL_PRICE_COST_HINT,
  isRawMaterialGuardBaseUnit,
  rawMaterialEnteredLooksLikePackTotal,
  rawMaterialPackPricingConfirmMessage,
} from "../utils/rawMaterialPricingGuard.js";
import { productMatchesSearch } from "../utils/productSearch.js";
import { evaluateProductNameMatch } from "../utils/productNameMatch.js";
import ProductNameDuplicateHint from "../components/ProductNameDuplicateHint.jsx";
import { COMPUTER_SHOP_EDITION, DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
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

  var [search, setSearch] = useState("");
  var [catFilter, setCatFilter] = useState("All");
  var [stockFilter, setStockFilter] = useState("All");
  var [showHistory, setShowHistory] = useState(false);
  var [editP, setEditP] = useState(null);
  var [newP, setNewP] = useState(null);

  /* Ctrl++ shortcut - open Add Product */
  useEffect(function () {
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault();
        setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", type: "stock", description: "", cost: "", price: "", stock: "", extraUnits: [], require_comment: true, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL });
      }
    };
    window.addEventListener("keydown", handler);
    return function () { window.removeEventListener("keydown", handler); };
  }, []);
  var [actionP, setActionP] = useState(null);
  var [dmgQty, setDmgQty] = useState("1");
  var [reason, setReason] = useState("");
  var [viewP, setViewP] = useState(null);
  var [itab, setItab] = useState("overview");
  /* FIX 8: Toggle to show soft-deleted (inactive) products for recovery */
  var [showInactive, setShowInactive] = useState(false);
  var [rmUseModal, setRmUseModal] = useState(null);
  var [rmUseQty, setRmUseQty] = useState("");
  var [rmUseDate, setRmUseDate] = useState(today());
  var [rmUseUnit, setRmUseUnit] = useState("Pcs");
  var [rmSearch, setRmSearch] = useState("");
  var [rmAcOpen, setRmAcOpen] = useState(false);
  var [rmDetailProduct, setRmDetailProduct] = useState(null);
  var [rmDailySubtab, setRmDailySubtab] = useState("ingredients");
  var [rmUsageLogDate, setRmUsageLogDate] = useState(function () {
    return typeof today === "function" ? today() : "";
  });
  var invSearchRef = useRef(null);
  var rmAcWrapRef = useRef(null);
  useEffect(function () {
    var handler = function (e) { if (invSearchRef.current && !invSearchRef.current.contains(e.target)) { setSearch(""); } };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, []);

  useEffect(function () {
    if (itab !== "rawcount" || !rmAcOpen) return;
    var handler = function (e) {
      if (rmAcWrapRef.current && !rmAcWrapRef.current.contains(e.target)) setRmAcOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, [itab, rmAcOpen]);

  useEffect(function () {
    if (itab !== "rawcount") {
      setRmSearch("");
      setRmAcOpen(false);
    }
  }, [itab]);

  /* FIX 8: Exclude inactive (soft-deleted) products from all inventory views and stats.
     Inactive products still exist in state.products so historical records remain intact. */
  var products = state.products.filter(function (p) { return p.status !== "inactive"; });
  var newProductNameMatch = useMemo(function () {
    if (!newP || !String(newP.name || "").trim()) return null;
    return evaluateProductNameMatch(newP.name, state.products, null);
  }, [newP, state.products]);
  var newProductNameExactDup = !!(newProductNameMatch && newProductNameMatch.type === "exact");
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
    var np = state.products.map(function (x) { return x.id === pid ? Object.assign({}, x, { stock: newStock }) : x; });
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
    S.set("tc3_products", np);
    S.set("tc3_raw_material_usage", usages);
    S.set("tc3_raw_material_counts", nextCounts);
    S.set("tc3_productLog", pl);
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

  var saveNew = function () {
    if (!newP) return;
    var nameStr = String(newP.name == null ? "" : newP.name).trim();
    if (!nameStr || !newP.price) return;
    var nameCheck = checkProductName(nameStr, state.products, null);
    if (nameCheck && nameCheck.type === "exact") {
      showAlert("A product named \"" + nameCheck.match + "\" already exists.\nPlease use a different name.");
      return;
    }
    if (newP.barcode && state.products.find(function (p) { return p.barcode === newP.barcode; })) {
      showAlert("A product with barcode \"" + newP.barcode + "\" already exists.\nPlease use a different barcode.");
      return;
    }
    var performNewSave = function () {
      var unitErr = validateExtraUnits(newP.unit, newP.extraUnits || []);
      if (unitErr) { showAlert(unitErr); return; }
      var unitFields = buildUnitsPersistFields({
        unit: newP.unit,
        cost: newP.cost,
        price: newP.price,
        extraUnits: newP.extraUnits || [],
      });
      var prod = Object.assign(
        {
          id: uid(),
          productId: nextProductId(state.products),
          name: nameStr,
          barcode: newP.barcode || genBarcode(),
          category: newP.category || "General",
          type: normalizeProductType(newP.type),
          description: newP.description || "",
          cost: parseFloat(newP.cost) || 0,
          price: parseFloat(newP.price) || 0,
          stock: parseInt(newP.stock) || 0,
          damaged: 0,
          require_comment: true,
          comment_label: String(newP.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
        },
        unitFields
      );
      if (!tcTrialGuard(state.products, 'products')) return;
      var np = state.products.concat([prod]);
      var log = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Added", productId: prod.id, productName: prod.name, qty: prod.stock, reason: "New product" }]);
      S.set("tc3_products", np); S.set("tc3_productLog", log);
      setState(function (s) { return Object.assign({}, s, { products: np, productLog: log }); });
      setNewP(null);
    };
    var maybeGuardThenNewSave = function () {
      if (
        normalizeProductType(newP.type) === "raw_material" &&
        isRawMaterialGuardBaseUnit(newP.unit) &&
        rawMaterialEnteredLooksLikePackTotal(newP.cost, newP.price, newP.unit)
      ) {
        showConfirm(rawMaterialPackPricingConfirmMessage(newP.cost, newP.price, newP.unit), performNewSave);
        return;
      }
      performNewSave();
    };
    if (nameCheck && (nameCheck.type === "likely_same" || nameCheck.type === "reordered")) {
      var dupNames = (nameCheck.matches || []).map(function (m) { return "\"" + m.name + "\""; }).join(", ");
      showConfirm("This looks like a product you already have:\n" + dupNames + "\n\nCreate \"" + nameStr + "\" as a new product anyway?", maybeGuardThenNewSave);
    } else {
      maybeGuardThenNewSave();
    }
  };

  var saveEdit = function () {
    if (!editP) return;
    if (editP.barcode && state.products.find(function (p) { return p.id !== editP.id && p.barcode === editP.barcode; })) {
      showAlert("Another product already uses this barcode. Please use a unique barcode.");
      return;
    }
    var origProduct = state.products.find(function (p) { return p.id === editP.id; });
    var origStock = origProduct ? (origProduct.stock || 0) : 0;
    var newStock = parseInt(editP.stock) || 0;
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
      var np = state.products.map(function (p) {
        return p.id === editP.id
          ? Object.assign({}, p, {
              name: editP.name,
              barcode: editP.barcode,
              category: editP.category,
              type: normalizeProductType(editP.type),
              description: editP.description,
              cost: parseFloat(editP.cost) || 0,
              price: parseFloat(editP.price) || 0,
              stock: origStock,
              require_comment: true,
              comment_label: String(editP.comment_label || "").trim() || DEFAULT_PRODUCT_COMMENT_LABEL,
            }, unitFieldsEdit)
          : p;
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

  /* FIX 8: Reactivate a soft-deleted product - removes inactive status */
  var reactivateProduct = function (prodId) {
    showConfirm("Reactivate this product? It will appear again in stock lists and selection menus.", function () {
      var np = state.products.map(function (p) {
        if (p.id !== prodId) return p;
        var reactivated = Object.assign({}, p);
        delete reactivated.status; // remove inactive flag
        return reactivated;
      });
      var log = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Reactivated", productId: prodId, productName: (state.products.find(function(p){return p.id===prodId;})||{}).name || "", qty: 0, reason: "Restored from inactive" }]);
      S.set("tc3_products", np); S.set("tc3_productLog", log);
      setState(function (s) { return Object.assign({}, s, { products: np, productLog: log }); });
    });
  };

  var confirmAction = function () {
    if (!actionP || !reason.trim()) return;
    var p = actionP.product;
    var qty = parseInt(dmgQty) || 1;
    if (actionP.mode === "damage") {
      var np2 = state.products.map(function (x) { return x.id === p.id ? Object.assign({}, x, { stock: Math.max(0, x.stock - qty), damaged: (x.damaged || 0) + qty }) : x; });
      var dl = (state.damageLog || []).concat([{ id: uid(), date: today(), productId: p.id, productName: p.name, qty: qty, reason: reason }]);
      S.set("tc3_products", np2); S.set("tc3_damageLog", dl);
      setState(function (s) { return Object.assign({}, s, { products: np2, damageLog: dl }); });
    } else if (actionP.deleteEntire) {
      /* FIX 8: Soft-delete - mark product as inactive instead of permanently removing it.
         This preserves historical invoices, reports, and purchase records that reference this product.
         Inactive products will not appear in POS or purchase selection lists.
         FIX 2: Also zero out stock so deleted products don't leave ghost financial values in DB. */
      var np3 = state.products.map(function (x) {
        return x.id === p.id ? Object.assign({}, x, { status: "inactive", stock: 0 }) : x;
      });
      var pl = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Deactivated", productId: p.id, productName: p.name, qty: p.stock, reason: reason }]);
      S.set("tc3_products", np3); S.set("tc3_productLog", pl);
      setState(function (s) { return Object.assign({}, s, { products: np3, productLog: pl }); });
    } else {
      var removeQty = parseInt(dmgQty) || 1;
      var np4 = state.products.map(function (x) { return x.id === p.id ? Object.assign({}, x, { stock: Math.max(0, x.stock - removeQty) }) : x; });
      var pl2 = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Deleted", productId: p.id, productName: p.name, qty: removeQty, reason: reason }]);
      S.set("tc3_products", np4); S.set("tc3_productLog", pl2);
      setState(function (s) { return Object.assign({}, s, { products: np4, productLog: pl2 }); });
    }
    setActionP(null); setReason(""); setDmgQty("1");
  };

  // CATS defined globally
  /* FIX: Removed unused _unused_CATS variable */

  var ITABS = [["overview", "Overview"], ["products", "Products"], ["rawcount", "Daily count"], ["damaged", "Damaged"], ["history", "Log"]];

  var invTabBtn = function (id, label) {
    var active = itab === id;
    return (
      <button type="button" key={id} onClick={function () { setItab(id); }}
        style={{
          padding: "7px 14px", borderRadius: 8, border: "none",
          background: active ? "#fff" : "transparent",
          color: active ? C.accent : C.muted,
          fontWeight: active ? 700 : 600,
          fontSize: 12.5,
          cursor: "pointer",
          boxShadow: active ? "0 1px 4px rgba(15,23,42,0.08)" : "none",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}>{label}</button>
    );
  };

  var InvEmpty = function (p) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22, opacity: 0.85 }}>{p.icon || "📦"}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{p.title}</div>
        {p.sub ? <div style={{ fontSize: 12, color: C.muted, maxWidth: 300, margin: "0 auto", lineHeight: 1.45 }}>{p.sub}</div> : null}
        {p.action || null}
      </div>
    );
  };

  var overviewKpis = [
    { label: "Products", value: String(totalProducts), sub: fmtSumQty(totalStockUnits) + " units on hand", accent: C.blue },
    { label: "Retail value", value: getCurrencySymbol() + " " + fmtNum(stockRetailValue), sub: "At selling price", accent: C.purple },
    { label: "Cost value", value: getCurrencySymbol() + " " + fmtNum(stockCostValue), sub: "Inventory at cost", accent: "#6366f1" },
    { label: "Potential profit", value: getCurrencySymbol() + " " + fmtNum(potentialProfit), sub: avgMargin == null ? "No margin data yet" : ("Avg margin " + avgMargin + "%"), accent: potentialProfit >= 0 ? C.green : C.red },
  ];

  var stockHealthRows = [
    { label: "In stock", val: stockProducts.filter(function (p) { return (p.stock || 0) > 5; }).length, color: C.green },
    { label: "Low stock", val: lowStock, color: C.amber },
    { label: "Out of stock", val: outOfStock, color: C.red },
    { label: "Has damage", val: stockProducts.filter(function (p) { return (p.damaged || 0) > 0; }).length, color: C.orange },
  ];

  var openAddProduct = function () {
    setNewP(null);
    setTimeout(function () {
      setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", type: "stock", description: "", cost: "", price: "", stock: "", extraUnits: [], require_comment: true, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL });
    }, 30);
  };

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* -- Toolbar: tabs + primary action -- */}
      <div style={{
        background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}>
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, flexWrap: "wrap" }}>
          {ITABS.map(function (t) { return invTabBtn(t[0], t[1]); })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <Btn sm col="cyan" onClick={openAddProduct}>+ Add Product</Btn>
        </div>
      </div>

      {/* -- KPI strip on list tabs (overview has its own unified strip) -- */}
      {itab !== "rawcount" && itab !== "overview" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <StatCard money={false} label="Total Products" value={totalProducts} accent={C.blue} icon="Inventory" sub={fmtSumQty(totalStockUnits) + " units in stock"} />
        <StatCard label="Retail Stock Value" value={stockRetailValue} accent={C.purple} icon="Money" sub={"Cost: " + getCurrencySymbol() + " " + fmtNum(stockCostValue)} />
        <StatCard label="Potential Profit" value={potentialProfit} accent={potentialProfit >= 0 ? C.green : C.red} icon="Trend" sub={avgMargin == null ? "Avg margin: -" : ("Avg margin: " + avgMargin + "%")} />
        <div style={{ cursor: "pointer" }} onClick={function () { setItab("products"); setStockFilter("Out of Stock"); }}><StatCard money={false} label="Out of Stock" value={outOfStock} accent={outOfStock > 0 ? C.red : C.green} icon="Out" sub={lowStock + " low stock"} /></div>
      </div>
      )}

      {/* -- OVERVIEW TAB -- */}
      {itab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Unified KPI strip */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
          }}>
            {overviewKpis.map(function (k, i) {
              return (
                <div key={k.label} style={{
                  padding: "18px 20px",
                  borderRight: i < overviewKpis.length - 1 ? "1px solid #f1f5f9" : "none",
                  position: "relative",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: k.accent, opacity: 0.85 }} />
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, letterSpacing: "0.02em" }}>{k.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 22, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1.15 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5, fontWeight: 500 }}>{k.sub}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(260px,1fr)", gap: 16, alignItems: "stretch" }}>
            {/* Value breakdown */}
            <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Stock valuation</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Retail, cost, margin and damage at a glance</div>
                </div>
                {damagedValue > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, background: "#fff7ed", padding: "4px 10px", borderRadius: 20, border: "1px solid #fed7aa" }}>
                    {getCurrencySymbol()} {fmtNum(damagedValue)} damaged
                  </span>
                ) : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                {[
                  { title: "Retail value", val: stockRetailValue, color: C.blue },
                  { title: "At cost", val: stockCostValue, color: "#6366f1" },
                  { title: "Margin", val: potentialProfit, color: potentialProfit >= 0 ? C.green : C.red },
                  { title: "Damage cost", val: damagedValue, color: C.orange },
                ].map(function (s) {
                  return (
                    <div key={s.title} style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: "1px solid #eef2f6" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>{s.title}</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: s.color, letterSpacing: "-0.02em" }}>{getCurrencySymbol()} {fmtNum(s.val)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stock health */}
            <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Stock health</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{stockProducts.length} tracked products</div>
              {stockHealthRows.map(function (s) {
                var pct = stockProducts.length > 0 ? Math.round(s.val / stockProducts.length * 100) : 0;
                return (
                  <div key={s.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                      <span style={{ color: "#475569" }}>{s.label}</span>
                      <span style={{ color: s.color, fontWeight: 800 }}>{s.val}<span style={{ color: "#94a3b8", fontWeight: 500 }}> · {pct}%</span></span>
                    </div>
                    <div style={{ height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: Math.max(pct, s.val > 0 ? 4 : 0) + "%", height: "100%", background: s.color, borderRadius: 99, transition: "width .35s ease" }} />
                    </div>
                  </div>
                );
              })}
              {(outOfStock > 0 || lowStock > 0) ? (
                <button type="button" onClick={function () { setItab("products"); setStockFilter(outOfStock > 0 ? "Out of Stock" : "Low Stock"); }}
                  style={{ marginTop: 4, width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  View items needing attention
                </button>
              ) : null}
            </div>
          </div>

          {/* Category breakdown */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>By category</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Units, value and margin per category</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              {totalProducts === 0 ? (
                <InvEmpty
                  icon="📦"
                  title="No products yet"
                  sub="Add your first product to see stock value, categories and alerts here."
                  action={<div style={{ marginTop: 14 }}><Btn sm col="cyan" onClick={openAddProduct}>+ Add Product</Btn></div>}
                />
              ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Category", "Products", "Units", "Damaged", "Retail", "Cost", "Profit", "Margin"].map(function (h) {
                      return (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: h === "Category" ? "left" : "right",
                          fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em",
                          borderBottom: "1px solid #e2e8f0",
                        }}>{h}</th>
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
                        <tr key={cat} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ background: "#eff6ff", color: C.accent, padding: "4px 10px", borderRadius: 6, fontWeight: 700, fontSize: 12 }}>{cat}</span>
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

          {/* Top products + alerts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", overflow: "hidden" }}>
              <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Top by value</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Highest retail stock value</div>
              </div>
              <div style={{ padding: "4px 16px 12px" }}>
              {stockProducts.length === 0 ? (
                <InvEmpty icon="📊" title="No stock items" sub="Products with stock will rank here by retail value." />
              ) : stockProducts.slice().sort(function (a, b) {
                return (inventoryQtyForTotals(b) * inventoryRetailSellPerBase(b)) - (inventoryQtyForTotals(a) * inventoryRetailSellPerBase(a));
              }).slice(0, 8).map(function (p, i) {
                var unitSell = inventoryRetailSellPerBase(p);
                var val = inventoryQtyForTotals(p) * unitSell;
                var pct = stockRetailValue > 0 ? Math.round(val / stockRetailValue * 100) : 0;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < 7 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      background: i < 3 ? C.accentSoft : "#f1f5f9",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: 11, color: i < 3 ? C.accent : C.muted,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}
                        <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
                        {getCurrencySymbol()} {fmtNum(unitSell)}/{p.unit || "Pcs"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: C.blue }}>{getCurrencySymbol()} {fmtNum(val)}</div>
                      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{pct}% of total</div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(15,23,42,0.04)", overflow: "hidden" }}>
              <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Alerts</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Low stock, damage and expiry</div>
              </div>
              <div style={{ padding: "4px 16px 12px" }}>
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
                }).sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); }).slice(0, 12);
                if (stockProducts.length === 0) {
                  return <InvEmpty icon="✓" title="Nothing to flag" sub="Alerts appear when stock runs low or items are damaged." />;
                }
                if (alertProds.length === 0) {
                  return (
                    <div style={{ padding: "28px 12px", textAlign: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ecfdf5", color: C.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 18, fontWeight: 800 }}>✓</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>All products healthy</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>No low stock or damage alerts</div>
                    </div>
                  );
                }
                return alertProds.map(function (p, i) {
                  var isOut = (p.stock || 0) === 0;
                  var isLow = !isOut && (p.stock || 0) <= 5;
                  var hasDmg = (p.damaged || 0) > 0;
                  var isExpired = showExpiry && p.expiryDate && new Date(p.expiryDate) < now;
                  var isExpiringSoon = showExpiry && p.expiryDate && !isExpired && new Date(p.expiryDate) <= soon;
                  return (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < alertProds.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{p.category}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
                        {isOut && <span style={{ background: "#fef2f2", color: C.red, padding: "3px 8px", borderRadius: 6, fontWeight: 700, fontSize: 10 }}>Out</span>}
                        {isLow && <span style={{ background: "#fffbeb", color: C.amber, padding: "3px 8px", borderRadius: 6, fontWeight: 700, fontSize: 10 }}>Low</span>}
                        {hasDmg && <span style={{ background: "#fff7ed", color: C.orange, padding: "3px 8px", borderRadius: 6, fontWeight: 700, fontSize: 10 }}>Damage</span>}
                        {isExpired && <span style={{ background: "#fef2f2", color: C.red, padding: "3px 8px", borderRadius: 6, fontWeight: 700, fontSize: 10 }}>Expired</span>}
                        {isExpiringSoon && <span style={{ background: "#fff7ed", color: C.orange, padding: "3px 8px", borderRadius: 6, fontWeight: 700, fontSize: 10 }}>Expiring</span>}
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- PRODUCTS TAB -- */}
      {itab === "products" && (
        <Card>
          <CardTitle sub={showInactive ? (rows.length + " inactive products") : (rows.length.toLocaleString() + " of " + totalProducts.toLocaleString() + " products")}>
            Products
          </CardTitle>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 200 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search by name, ID, barcode, or category..." /></div>
            <div style={{ minWidth: 140 }}>
              <Sel value={catFilter} onChange={function (e) { setCatFilter(e.target.value); }}>
                {cats.map(function (c) { return <option key={c}>{c}</option>; })}
              </Sel>
            </div>
            <div style={{ minWidth: 140 }}>
              <Sel value={stockFilter} onChange={function (e) { setStockFilter(e.target.value); }}>
                {["All", "In Stock", "Low Stock", "Out of Stock", "Has Damage"].map(function (s) { return <option key={s}>{s}</option>; })}
              </Sel>
            </div>
            {/* FIX 8: Toggle to show/recover soft-deleted (inactive) products */}
            <button
              onClick={function () { setShowInactive(function (v) { return !v; }); setSearch(""); }}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid " + (showInactive ? C.orange : C.border), background: showInactive ? "#fef3e2" : "#fff", color: showInactive ? C.orange : C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {showInactive ? "Red Showing Inactive - Click to go back" : "Show Inactive"}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>ID</TH><TH>Product</TH><TH>Barcode</TH><TH>Category</TH><TH>Unit</TH><TH>Cost</TH><TH>Price</TH><TH>Margin</TH><TH>Stock</TH><TH>Stock Value</TH><TH>Damaged</TH><TH>Actions</TH></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={12} style={{ padding: 20, textAlign: "center", color: C.muted }}>{showInactive ? "No inactive products found" : "No products found"}</td></tr>}
                {invPager.slice.map(function (p, i) {
                  var isService = isServiceProduct(p);
                  var isRaw = isRawMaterialProduct(p);
                  var effectiveCost = inventoryRetailCostPerBase(p);
                  var effectiveSell = inventoryRetailSellPerBase(p);
                  var margin = (isService || isRaw) ? null : getProductMarginPct(p);
                  var stockVal = isService ? 0 : (inventoryQtyForTotals(p) * effectiveSell);
                  return (
                    <TR key={p.id} i={i}>
                      <td style={{ padding: "10px 14px" }}><span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: C.accent }}>{p.productId || "-"}</span></td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, color: showInactive ? C.orange : C.text }}>{p.name} {showInactive && <span style={{ fontSize: 10, background: "#fef3e2", color: C.orange, padding: "1px 6px", borderRadius: 10, marginLeft: 4 }}>INACTIVE</span>}</div>
                        {p.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{p.description.slice(0, 40)}</div>}
                      </td>
                      <TD><span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{p.barcode}</span></TD>
                      <td style={{ padding: "10px 14px" }}><span style={{ background: C.accentSoft, color: C.accent, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.category}</span></td>
                      <TD><span style={{ background: "rgba(41,121,255,0.07)", color: C.accent, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{p.unit || "Pcs"}</span></TD>
                      <TD color={C.muted}>{getCurrencySymbol()} {fmtNum(effectiveCost)}</TD>
                      <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(effectiveSell)}</TD>
                      <td style={{ padding: "10px 14px" }}>
                        {margin == null ? (
                          <span style={{ fontWeight: 700, fontSize: 12, color: C.muted }}>-</span>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: 12, color: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red }}>{margin}%</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {isService ? (
                          <span style={{ background: "#e0f2fe", color: C.blue, padding: "3px 10px", borderRadius: 20, fontWeight: 800, fontSize: 13 }}>Service</span>
                        ) : (
                          <span style={{ background: (p.stock || 0) === 0 ? "#fde8ed" : (p.stock || 0) <= 5 ? "#fef3e2" : C.successSoft, color: (p.stock || 0) === 0 ? C.red : (p.stock || 0) <= 5 ? C.amber : C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 800, fontSize: 13 }}>
                            {getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}
                          </span>
                        )}
                      </td>
                      <TD color={isService ? C.muted : (isRaw ? C.orange : C.purple)}>{isService ? "-" : (getCurrencySymbol() + " " + fmtNum(stockVal))}</TD>
                      <TD color={(p.damaged || 0) > 0 ? C.orange : C.muted}>{p.damaged || 0}</TD>
                      <td style={actBtnCellStyle}>
                        <ActBtnGroup>
                          {showInactive ? (
                            <ActBtn tone="green" title="Reactivate product" wide onClick={function () { reactivateProduct(p.id); }}>Restore</ActBtn>
                          ) : (
                            <React.Fragment>
                              <ActBtn tone="cyan" title="View product" onClick={function () { setViewP(p); }}>🧾</ActBtn>
                              <ActBtn tone="blue" title="Edit product" onClick={function () { setEditP(Object.assign({}, p, { extraUnits: formExtraUnitsFromProduct(p) })); }}>✎</ActBtn>
                              <ActBtn tone="orange" title="Log damage" onClick={function () { setActionP({ product: p, mode: "damage" }); setDmgQty("1"); setReason(""); }}>Dmg</ActBtn>
                              <ActBtn tone="red" title="Delete product" onClick={function () {
                                if ((p.stock || 0) > 0) {
                                  showAlert("X Cannot delete \"" + p.name + "\" - it has " + fmtStock(p.stock, p.unit) + " in stock.\n\nSell or remove all stock first, then delete.");
                                  return;
                                }
                                setActionP({ product: p, mode: "delete", deleteEntire: false }); setDmgQty("1"); setReason("");
                              }}>✕</ActBtn>
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
          <Pager pager={invPager} />
          {rows.length > 0 && (
            <div style={{ display: "flex", gap: 20, padding: "10px 14px", borderTop: "2px solid " + C.border, fontSize: 13, fontWeight: 700, background: "#f7f9ff", flexWrap: "wrap" }}>
              <span>Total Products: <span style={{ color: C.blue }}>{rows.length}</span> items</span>
              <span>Retail Value: <span style={{ color: C.purple }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * inventoryRetailSellPerBase(p); }, 0))}</span></span>
              <span>Cost Value: <span style={{ color: C.orange }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * inventoryRetailCostPerBase(p); }, 0))}</span></span>
              <span>Profit Potential: <span style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { if (isServiceProduct(p)) return a; return a + inventoryQtyForTotals(p) * (inventoryRetailSellPerBase(p) - inventoryRetailCostPerBase(p)); }, 0))}</span></span>
            </div>
          )}
        </Card>
      )}

      {itab === "rawcount" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={function () { setRmDailySubtab("ingredients"); }}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1.5px solid " + (rmDailySubtab === "ingredients" ? C.border : "transparent"),
                background: rmDailySubtab === "ingredients" ? "#fff" : "transparent",
                color: rmDailySubtab === "ingredients" ? C.accent : C.muted,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: rmDailySubtab === "ingredients" ? "0 1px 6px rgba(15,23,42,0.06)" : "none",
              }}
            >
              Ingredients
            </button>
            <button
              type="button"
              onClick={function () { setRmDailySubtab("log"); }}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1.5px solid " + (rmDailySubtab === "log" ? C.border : "transparent"),
                background: rmDailySubtab === "log" ? "#fff" : "transparent",
                color: rmDailySubtab === "log" ? C.accent : C.muted,
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: rmDailySubtab === "log" ? "0 1px 6px rgba(15,23,42,0.06)" : "none",
              }}
            >
              Usage log
            </button>
            {rmDailySubtab === "log" && (
              <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Date</span>
                <input
                  type="date"
                  value={rmUsageLogDate}
                  min={periodLockTransactionMinDate || undefined}
                  onChange={function (e) {
                    setRmUsageLogDate(e.target.value || (typeof today === "function" ? today() : ""));
                  }}
                  style={{
                    border: "1.5px solid " + C.border,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                {rmLogDateStr !== (typeof today === "function" ? today() : "") && (
                  <button
                    type="button"
                    onClick={function () {
                      setRmUsageLogDate(typeof today === "function" ? today() : "");
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1.5px solid " + C.border,
                      background: "#f7f9ff",
                      color: C.accent,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Today
                  </button>
                )}
              </div>
            )}
          </div>

          {rmDailySubtab === "ingredients" && (
          <Card>
            <CardTitle sub="Tap a row to log usage · Stock updates immediately">Raw materials (ingredients)</CardTitle>
            {rawMaterialProducts.length > 0 && (
              <div ref={rmAcWrapRef} style={{ position: "relative", marginBottom: 12 }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search by name, ID, barcode, or category…"
                    value={rmSearch}
                    autoComplete="off"
                    onChange={function (e) { setRmSearch(e.target.value); setRmAcOpen(true); }}
                    onFocus={function (e) {
                      setRmAcOpen(true);
                      e.target.style.borderColor = "#2979ff";
                      e.target.style.boxShadow = "0 0 0 3px rgba(41,121,255,0.12)";
                    }}
                    onBlur={function (e) {
                      e.target.style.borderColor = C.border;
                      e.target.style.boxShadow = "none";
                    }}
                    style={{
                      border: "1.5px solid " + C.border,
                      borderRadius: 8,
                      padding: "9px " + (rmSearch ? "36px" : "13px") + " 9px 13px",
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "inherit",
                      background: "#fff",
                      color: C.text,
                      width: "100%",
                      boxSizing: "border-box",
                      transition: "border-color .15s, box-shadow .15s",
                    }}
                  />
                  {rmSearch ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      title="Clear"
                      onMouseDown={function (e) { e.preventDefault(); }}
                      onClick={function () {
                        setRmSearch("");
                        setRmAcOpen(false);
                      }}
                      style={{
                        position: "absolute",
                        right: 6,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 28,
                        height: 28,
                        padding: 0,
                        border: "none",
                        borderRadius: "50%",
                        background: "transparent",
                        color: C.muted,
                        cursor: "pointer",
                        fontSize: 18,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "inherit",
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                {rmAcOpen && rmSearch.trim() && rmAutocompleteSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: 6,
                      zIndex: 25,
                      background: "#fff",
                      border: "1.5px solid " + C.border,
                      borderRadius: 10,
                      boxShadow: "0 10px 28px rgba(15,23,42,0.12)",
                      maxHeight: 260,
                      overflowY: "auto",
                    }}
                  >
                    {rmAutocompleteSuggestions.map(function (p) {
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={function (e) { e.preventDefault(); }}
                          onClick={function () {
                            setRmSearch(p.name);
                            setRmAcOpen(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 14px",
                            border: "none",
                            borderBottom: "1px solid " + C.border,
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                            color: C.text,
                            fontFamily: "inherit",
                          }}
                        >
                          <span style={{ fontWeight: 800 }}>{p.name}</span>
                          <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{p.category}</span>
                          {(p.barcode ? <span style={{ fontSize: 11, color: C.muted, marginLeft: 8, fontFamily: "monospace" }}>{p.barcode}</span> : null)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {rawMaterialProducts.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "36px 24px",
                  border: "2px dashed " + C.border,
                  borderRadius: 14,
                  background: "#fafbff",
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 8 }}>No ingredients yet</div>
                <p style={{ margin: "0 auto 16px", maxWidth: 420, fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
                  Add a product as an <strong style={{ color: C.text }}>ingredient</strong>, then return here.
                </p>
                <Btn
                  col="cyan"
                  onClick={function () {
                    setItab("products");
                    setTimeout(function () {
                      setNewP({
                        name: "",
                        barcode: genBarcode(),
                        category: getBusinessProfile().categories[0] || "General",
                        unit: getBusinessProfile().units[0] || "Pcs",
                        type: "raw_material",
                        description: "",
                        cost: "",
                        price: "",
                        stock: "",
                        extraUnits: [],
                        require_comment: true,
                        comment_label: DEFAULT_PRODUCT_COMMENT_LABEL,
                      });
                    }, 30);
                  }}
                >
                  + Add ingredient
                </Btn>
              </div>
            ) : rawMaterialFiltered.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                No ingredients match &quot;{rmSearch}&quot;.{" "}
                <button
                  type="button"
                  onClick={function () { setRmSearch(""); }}
                  style={{ background: "none", border: "none", color: C.accent, fontWeight: 800, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", fontSize: 13 }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid " + C.border }}>
                <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Name</th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Available</th>
                      <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawMaterialFiltered.map(function (p, ri) {
                      var rowBg = ri % 2 === 0 ? "#fff" : "#fafbff";
                      var avail = getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit);
                      return (
                        <tr
                          key={p.id}
                          onClick={function () { openRmUseModal(p); }}
                          style={{ background: rowBg, cursor: "pointer" }}
                        >
                          <td style={{ padding: "12px 14px", fontWeight: 800, color: C.text }}>{p.name}</td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: (p.stock || 0) <= 0 ? C.red : C.text }}>{avail}</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", whiteSpace: "nowrap" }} onClick={function (e) { e.stopPropagation(); }}>
                            <Btn sm col="blue" onClick={function () { setRmDetailProduct(p); }}>Detailed view</Btn>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          )}

          {rmDailySubtab === "log" && (
            <Card>
              <CardTitle sub={rmUsagesForDay.length + " use event" + (rmUsagesForDay.length === 1 ? "" : "s") + " — " + fmtDateFull(rmLogDateStr)}>
                Ingredient usage log
              </CardTitle>
              {rawMaterialProducts.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                  No ingredients in your catalog. Add an ingredient from the Products tab first.
                </div>
              ) : rmUsagesForDay.length === 0 ? (
                <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 13, border: "2px dashed " + C.border, borderRadius: 12, background: "#fafbff" }}>
                  No raw-material usage logged for {fmtDateFull(rmLogDateStr)}. Pick another date or log usage from the Ingredients tab.
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid " + C.border }}>
                  <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Ingredient</th>
                        <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Qty</th>
                        <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Unit</th>
                        <th style={{ textAlign: "right", padding: "10px 14px", fontWeight: 700, color: C.th, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "2px solid " + C.border }}>Base qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rmUsagesForDay.map(function (u, ri) {
                        var rowBg = ri % 2 === 0 ? "#fff" : "#fafbff";
                        var pfind = (state.products || []).find(function (p) { return p && String(p.id) === String(u.productId); });
                        var nm = pfind && pfind.name ? pfind.name : "Unknown ingredient";
                        var baseDisp = u.qtyBase != null && isFinite(Number(u.qtyBase))
                          ? (typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qtyBase)) : String(u.qtyBase))
                          : "—";
                        return (
                          <tr key={String(u.id || "row-" + ri)} style={{ background: rowBg }}>
                            <td style={{ padding: "12px 14px", fontWeight: 800, color: C.text }}>{nm}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: C.text }}>
                              {typeof fmtSumQty === "function" ? fmtSumQty(Number(u.qty) || 0) : String(u.qty)}
                            </td>
                            <td style={{ padding: "12px 14px", color: C.textMd, fontWeight: 600 }}>{String(u.unit || "—")}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", color: C.muted, fontWeight: 600 }}>{baseDisp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {rmUseModal && (
            <Modal title={"Log usage — " + rmUseModal.name} onClose={function () { setRmUseModal(null); }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                Available now:{" "}
                <strong style={{ color: C.text }}>
                  {getBulkDisplayParts(rmUseModal) ? fmtStockDual(rmUseModal) : fmtStock(rmUseModal.stock || 0, rmUseModal.unit)}
                </strong>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Sel
                  label="Unit"
                  value={rmUseUnit}
                  onChange={function (e) { setRmUseUnit(e.target.value); }}
                >
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
              <Input
                label={"Quantity used (" + rmUseUnit + ")"}
                type="number"
                min="0"
                step="any"
                value={rmUseQty}
                onChange={function (e) { setRmUseQty(e.target.value); }}
              />
              <div style={{ marginTop: 10 }}>
                <Input
                  label="Date"
                  type="date"
                  value={rmUseDate}
                  min={periodLockTransactionMinDate || undefined}
                  onChange={function (e) { setRmUseDate(e.target.value || today()); }}
                />
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
              <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid " + C.border, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f1f5f9", zIndex: 1 }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid " + C.border, color: C.th }}>Date</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid " + C.border, color: C.th }}>Event</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid " + C.border, color: C.th }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tl.map(function (row, idx) {
                      return (
                        <tr key={row.sort + "_" + idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafbff" }}>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: C.text }}>{fmtDateFull(row.date)}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 700, color: row.kind === "use" ? C.orange : row.kind === "purchase" ? C.green : row.kind === "return" ? C.red : C.textMd }}>{row.label}</td>
                          <td style={{ padding: "8px 12px", color: C.text }}>{row.detail}</td>
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

      {/* -- DAMAGED TAB -- */}
      {itab === "damaged" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <StatCard money={false} label="Damaged Products" value={products.filter(function (p) { return (p.damaged || 0) > 0; }).length} accent={C.orange} icon="!" sub="have damaged units" />
            <StatCard money={false} label="Total Damaged Units" value={totalDamagedUnits} accent={C.red} icon="Inventory" sub="units damaged" />
            <StatCard label="Damaged Value (Cost)" value={damagedValue} accent={C.red} icon="Money" sub="total loss" />
          </div>
          <Card>
            <CardTitle sub="Products with damaged stock">Damaged Inventory</CardTitle>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>Product</TH><TH>Category</TH><TH>Cost/Unit</TH><TH>Sell Price</TH><TH>Good Stock</TH><TH>Damaged Units</TH><TH>Damage Value</TH><TH>Action</TH></tr></thead>
              <tbody>
                {products.filter(function (p) { return (p.damaged || 0) > 0; }).sort(function (a, b) { return (b.damaged || 0) - (a.damaged || 0); }).map(function (p, i) {
                  return (
                    <TR key={p.id} i={i}>
                      <TD bold>{p.name}</TD>
                      <TD>{p.category}</TD>
                      <TD>{getCurrencySymbol()} {fmtNum(p.cost || 0)}</TD>
                      <TD color={C.blue}>{getCurrencySymbol()} {fmtNum(p.price)}</TD>
                      <TD bold color={(p.stock || 0) > 0 ? C.green : C.red}>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}</TD>
                      <td style={{ padding: "10px 14px" }}><span style={{ background: "#fff3e0", color: C.orange, padding: "3px 10px", borderRadius: 20, fontWeight: 800, fontSize: 13 }}>{p.damaged}</span></td>
                      <TD bold color={C.red}>{getCurrencySymbol()} {fmtNum((p.damaged || 0) * (p.cost || 0))}</TD>
                      <td style={{ padding: "9px 10px" }}><Btn sm col="orange" onClick={function () { setActionP({ product: p, mode: "damage" }); setDmgQty("1"); setReason(""); }}>Log More</Btn></td>
                    </TR>
                  );
                })}
                {products.filter(function (p) { return (p.damaged || 0) > 0; }).length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.green, fontWeight: 700 }}>No damaged items.</td></tr>}
              </tbody>
            </table>
          </Card>
          <Card>
            <CardTitle sub="All damage events">Damage Log</CardTitle>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>Date</TH><TH>Product</TH><TH>Qty</TH><TH>Reason</TH></tr></thead>
              <tbody>
                {(state.damageLog || []).slice().reverse().map(function (l, i) {
                  return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><TD bold>{l.productName}</TD><TD center color={C.orange}>{fmtSumQty(l.qty)}</TD><TD>{l.reason}</TD></TR>;
                })}
                {(state.damageLog || []).length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: C.muted }}>No damage logged</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* -- LOG TAB -- */}
      {itab === "history" && (
        <Card>
          <CardTitle sub="Product additions and removals">Product Log</CardTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><TH>Date</TH><TH>Type</TH><TH>Product</TH><TH>Qty</TH><TH>Reason</TH></tr></thead>
            <tbody>
              {(state.productLog || []).length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: C.muted }}>No log entries</td></tr>}
              {(state.productLog || []).slice().reverse().map(function (l, i) {
                return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><td style={{ padding: "9px 12px" }}><Badge status={l.type} /></td><TD bold>{l.productName}</TD><TD center>{l.qty}</TD><TD>{l.reason}</TD></TR>;
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* -- PRODUCT DETAIL VIEW -- */}
      {viewP && (
        <Modal title={viewP.name} onClose={function () { setViewP(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Cost Price", val: getCurrencySymbol() + " " + fmtNum(inventoryRetailCostPerBase(viewP)), color: C.muted },
              { label: "Sell Price", val: getCurrencySymbol() + " " + fmtNum(inventoryRetailSellPerBase(viewP)), color: C.blue },
              { label: "Profit/Unit", val: hasMeaningfulMargin(viewP) ? (getCurrencySymbol() + " " + fmtNum(inventoryRetailSellPerBase(viewP) - inventoryRetailCostPerBase(viewP))) : "-", color: hasMeaningfulMargin(viewP) ? C.green : C.muted },
              { label: "Margin", val: getProductMarginPct(viewP) == null ? "-" : (getProductMarginPct(viewP) + "%"), color: getProductMarginPct(viewP) == null ? C.muted : C.purple },
              { label: "Stock Units", val: isServiceProduct(viewP) ? "Service" : (getBulkDisplayParts(viewP) ? fmtStockDual(viewP) : fmtStock(viewP.stock || 0, viewP.unit)), color: isServiceProduct(viewP) ? C.blue : ((viewP.stock || 0) > 5 ? C.green : (viewP.stock || 0) > 0 ? C.amber : C.red) },
              { label: "Stock Value", val: isServiceProduct(viewP) ? "-" : (getCurrencySymbol() + " " + fmtNum(inventoryQtyForTotals(viewP) * inventoryRetailSellPerBase(viewP))), color: isServiceProduct(viewP) ? C.muted : C.blue },
              { label: "Damaged Units", val: String(viewP.damaged || 0), color: (viewP.damaged || 0) > 0 ? C.orange : C.muted },
              { label: "Damage Cost", val: getCurrencySymbol() + " " + fmtNum((viewP.damaged || 0) * inventoryRetailCostPerBase(viewP)), color: C.red },
              { label: "Category", val: viewP.category || "General", color: C.text },
              { label: "Unit", val: viewP.unit || "Pcs", color: C.accent }
            ].concat(!COMPUTER_SHOP_EDITION && getBusinessProfile().modules.serial && viewP.serialNo ? [
              { label: "Serial / IMEI", val: viewP.serialNo, color: C.cyan }
            ] : []).concat(getBusinessProfile().name === "Jewelry & Watches" ? [
              { label: "Weight", val: viewP.weightGrams ? viewP.weightGrams + " g" : "-", color: C.text },
              { label: "Making Charge", val: viewP.makingCharge ? getCurrencySymbol() + " " + fmtNum(viewP.makingCharge) : "-", color: C.orange }
            ] : []).concat(getBusinessProfile().modules.expiry ? [
              { label: "Expiry Date", val: viewP.expiryDate ? fmtDateFull(viewP.expiryDate) : "-", color: viewP.expiryDate && new Date(viewP.expiryDate) < new Date() ? C.red : C.text },
              { label: "Batch / Lot No", val: viewP.batchNo || "-", color: C.muted }
            ] : []).map(function (s) {
              return (
                <div key={s.label} style={{ background: "#f7f9ff", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: s.color }}>{s.val}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
            <strong>Barcode:</strong> <span style={{ fontFamily: "monospace", color: C.accent }}>{viewP.barcode}</span>
            {viewP.description && <span style={{ marginLeft: 16 }}>{viewP.description}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="blue" onClick={function () { setEditP(Object.assign({}, viewP, { extraUnits: formExtraUnitsFromProduct(viewP) })); setViewP(null); }}>Edit</Btn>
            <Btn col="orange" onClick={function () { setActionP({ product: viewP, mode: "damage" }); setDmgQty("1"); setReason(""); setViewP(null); }}>Mark Damage</Btn>
            <Btn col="gray" onClick={function () { setViewP(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {newP && (
        <Modal title={"Add New Product - ID: " + nextProductId(state.products)} onClose={function () { setNewP(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Product Name *" value={newP.name} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <ProductNameDuplicateHint name={newP.name} products={state.products} C={C} />
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Product ID</label>
                <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, background: "#f3f4f6", color: C.accent, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.05em" }}>{nextProductId(state.products)}</div>
              </div>
              <Input label="Barcode" value={newP.barcode} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
              <Sel label="Category" value={newP.category} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{getCats().map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
            </div>
            <Sel label="Product Type" value={newP.type || "stock"} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
              <option value="stock">stock</option>
              <option value="service">service</option>
              <option value="raw_material">raw_material</option>
            </Sel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, alignItems: "end" }}>
              <Input label="Cost Price *" type="number" value={newP.cost} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
              <Input label="Sell Price *" type="number" value={newP.price} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", minHeight: 30, display: "block" }}>
                  {newP.type === "service" ? "Initial Stock (not required for service)" : "Initial Stock"}
                </label>
                <input
                  type="number"
                  value={newP.stock}
                  onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { stock: e.target.value }); }); }}
                  style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", minHeight: 30, display: "block" }}>
                  Base Unit
                </label>
                <select
                  value={newP.unit || getBusinessProfile().units[0] || "Pcs"}
                  onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { unit: e.target.value }); }); }}
                  style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#fff", color: C.text, width: "100%" }}
                >
                  {getBusinessProfile().units.map(function (u) { return <option key={u}>{u}</option>; })}
                </select>
              </div>
            </div>
            <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 12px", background: "#f8fafc" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd, marginBottom: 4 }}>Additional units (optional)</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Each <strong>factor</strong> is how many <strong>{newP.unit || "Pcs"}</strong> (base) are in one of that unit. Stock is always kept in base units.</div>
              {(newP.extraUnits || []).map(function (row, idx) {
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(80px,1fr) 88px minmax(72px,1fr) minmax(72px,1fr) 34px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                    <Input label="Unit name" value={row.name || ""} onChange={function (e) { var v = e.target.value; setNewP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { name: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="Strip / Box" />
                    <Input label="Factor" type="number" value={row.factor || ""} onChange={function (e) { var v = e.target.value; setNewP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { factor: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="e.g. 12" />
                    <Input label="Sell (opt.)" type="number" value={row.sellPrice || ""} onChange={function (e) { var v = e.target.value; setNewP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { sellPrice: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <Input label="Cost (opt.)" type="number" value={row.cost || ""} onChange={function (e) { var v = e.target.value; setNewP(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { cost: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                    <button type="button" onClick={function () { setNewP(function (x) { var next = (x.extraUnits || []).filter(function (_, j) { return j !== idx; }); return Object.assign({}, x, { extraUnits: next }); }); }} style={{ height: 36, borderRadius: 8, border: "1.5px solid " + C.border, background: "#fff", cursor: "pointer", fontSize: 14, color: C.red }} title="Remove"></button>
                  </div>
                );
              })}
              <button type="button" onClick={function () { setNewP(function (x) { return Object.assign({}, x, { extraUnits: (x.extraUnits || []).concat([{ name: "", factor: "", sellPrice: "", cost: "" }]) }); }); }} style={{ marginTop: 4, padding: "6px 12px", borderRadius: 8, border: "1.5px dashed " + C.accent, background: C.accentSoft, color: C.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Add Unit</button>
            </div>
            {normalizeProductType(newP.type) === "raw_material" ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
                {RAW_MATERIAL_PRICE_COST_HINT}
              </div>
            ) : null}
            {newP.price && (
              <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 20 }}>
                <span>Profit/unit: <strong style={{ color: C.green }}>{(newP.type === "service" && !(parseFloat(newP.cost) > 0)) ? "-" : (getCurrencySymbol() + " " + fmtNum((parseFloat(newP.price) || 0) - (parseFloat(newP.cost) || 0)))}</strong></span>
                <span>Margin: <strong style={{ color: C.accent }}>{(newP.type === "service" && !(parseFloat(newP.cost) > 0)) ? "-" : (((parseFloat(newP.price) || 0) > 0 ? Math.round(((parseFloat(newP.price) || 0) - (parseFloat(newP.cost) || 0)) / (parseFloat(newP.price) || 1) * 100) : 0) + "%")}</strong></span>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes (optional)</label>
              <textarea value={newP.description || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Product specs, features, notes..." />
            </div>
            {getBusinessProfile().name === "Jewelry & Watches" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Weight (grams)" type="number" value={newP.weightGrams || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { weightGrams: e.target.value }); }); }} placeholder="e.g. 5.25" />
                <Input label="Making Charge" type="number" value={newP.makingCharge || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { makingCharge: e.target.value }); }); }} placeholder="e.g. 500" />
              </div>
            )}
            {getBusinessProfile().modules.expiry && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Expiry Date" type="date" value={newP.expiryDate || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { expiryDate: e.target.value }); }); }} />
                <Input label="Batch / Lot Number (optional)" value={newP.batchNo || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { batchNo: e.target.value }); }); }} placeholder="e.g. BATCH-2025-001" />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Btn col="cyan" onClick={saveNew} disabled={!newP.name || !newP.price || newProductNameExactDup}>Save Product</Btn>
              <Btn col="blue" onClick={function () {
                if (!newP.name || !newP.price || newProductNameExactDup) return;
                saveNew();
                setTimeout(function () {
                  setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", type: "stock", description: "", cost: "", price: "", stock: "", extraUnits: [], require_comment: true, comment_label: DEFAULT_PRODUCT_COMMENT_LABEL });
                }, 80);
              }} disabled={!newP.name || !newP.price || newProductNameExactDup}>Save + Add Another</Btn>
              <Btn col="gray" onClick={function () { setNewP(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {editP && (
        <Modal title={"Edit: " + editP.name} onClose={function () { setEditP(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Product Name" value={editP.name} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Barcode" value={editP.barcode || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
              <Sel label="Category" value={editP.category || "General"} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{getCats().map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
            </div>
            <Sel label="Product Type" value={editP.type || "stock"} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}>
              <option value="stock">stock</option>
              <option value="service">service</option>
              <option value="raw_material">raw_material</option>
            </Sel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label="Cost" type="number" value={editP.cost || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
              <Input label="Sell Price" type="number" value={editP.price || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} />
              <Sel label="Base Unit" value={editP.unit || getBusinessProfile().units[0] || "Pcs"} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { unit: e.target.value }); }); }}>{getBusinessProfile().units.map(function (u) { return <option key={u}>{u}</option>; })}</Sel>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Current Stock</div>
                <div style={{ padding: "9px 13px", background: "#f8fafc", border: "1.5px solid " + C.border, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.text }}>
                  {getBulkDisplayParts(editP) ? fmtStockDual(editP) : fmtStock(editP.stock || 0, editP.unit)}
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 2 }}>Add stock via Purchases only</div>
                </div>
              </div>
            </div>
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
                    <button type="button" onClick={function () { setEditP(function (x) { var next = (x.extraUnits || []).filter(function (_, j) { return j !== idx; }); return Object.assign({}, x, { extraUnits: next }); }); }} style={{ height: 36, borderRadius: 8, border: "1.5px solid " + C.border, background: "#fff", cursor: "pointer", fontSize: 14, color: C.red }} title="Remove"></button>
                  </div>
                );
              })}
              <button type="button" onClick={function () { setEditP(function (x) { return Object.assign({}, x, { extraUnits: (x.extraUnits || []).concat([{ name: "", factor: "", sellPrice: "", cost: "" }]) }); }); }} style={{ marginTop: 4, padding: "6px 12px", borderRadius: 8, border: "1.5px dashed " + C.accent, background: C.accentSoft, color: C.accent, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Add Unit</button>
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
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}><Btn col="cyan" onClick={saveEdit}>Save Changes</Btn><Btn col="gray" onClick={function () { setEditP(null); }}>Cancel</Btn></div>
          </div>
        </Modal>
      )}

      {actionP && (
        <Modal title={actionP.mode === "damage" ? "Mark as Damaged - " + actionP.product.name : "Remove Stock - " + actionP.product.name} onClose={function () { setActionP(null); }}>
          <div style={{ background: actionP.mode === "damage" ? "#fef9c3" : "#fee2e2", borderRadius: 8, padding: "12px 14px", marginBottom: 12, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <span>Product: <strong>{actionP.product.name}</strong></span>
            <span>Current Stock: <strong style={{ color: C.blue }}>{getBulkDisplayParts(actionP.product) ? fmtStockDual(actionP.product) : fmtStock(actionP.product.stock || 0, actionP.product.unit)}</strong></span>
          </div>
          {!actionP.deleteEntire && (
            <div style={{ marginBottom: 10 }}>
              <Input label="Quantity" type="number" value={dmgQty} onChange={function (e) { setDmgQty(e.target.value); }} />
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Reason (required)</label>
            <textarea value={reason} onChange={function (e) { setReason(e.target.value); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 7, padding: "8px 11px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Enter reason..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col={actionP.mode === "damage" ? "orange" : "red"} onClick={confirmAction} disabled={!reason.trim()}>Confirm</Btn>
            <Btn col="gray" onClick={function () { setActionP(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
});

export default Inventory;




















