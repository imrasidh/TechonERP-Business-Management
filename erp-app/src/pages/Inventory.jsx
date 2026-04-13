import React, { useState, useEffect, useRef } from "react";

var Inventory = React.memo(function (props) {
  var state = props.state;
  var setState = props.setState;
  var inventoryQtyForTotals = props.inventoryQtyForTotals;
  var getBusinessProfile = props.getBusinessProfile;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var tcTrialGuard = props.tcTrialGuard;
  var toTitleCase = props.toTitleCase;
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

  var [search, setSearch] = useState("");
  var [catFilter, setCatFilter] = useState("All");
  var [stockFilter, setStockFilter] = useState("All");
  var [showHistory, setShowHistory] = useState(false);
  var [editP, setEditP] = useState(null);
  var [newP, setNewP] = useState(null);

  /* Ctrl++ shortcut — open Add Product */
  useEffect(function () {
    var handler = function (e) {
      if (e.ctrlKey && (e.key === "=" || e.key === "+" || e.keyCode === 187 || e.keyCode === 107)) {
        e.preventDefault();
        setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", description: "", cost: "", price: "", stock: "" });
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
  var invSearchRef = useRef(null);
  useEffect(function () {
    var handler = function (e) { if (invSearchRef.current && !invSearchRef.current.contains(e.target)) { setSearch(""); } };
    document.addEventListener("mousedown", handler);
    return function () { document.removeEventListener("mousedown", handler); };
  }, []);

  /* FIX 8: Exclude inactive (soft-deleted) products from all inventory views and stats.
     Inactive products still exist in state.products so historical records remain intact. */
  var products = state.products.filter(function (p) { return p.status !== "inactive"; });
  var totalProducts = products.length;
  var totalStockUnits = products.reduce(function (a, p) { return a + inventoryQtyForTotals(p); }, 0);
  var totalDamagedUnits = products.reduce(function (a, p) { return a + (p.damaged || 0); }, 0);
  var stockRetailValue = products.reduce(function (a, p) { return a + (p.stock || 0) * p.price; }, 0);
  /* Cost value uses each product’s stored unit cost (WAC). Purchase returns (Returns → Purchase) reduce stock
     without recomputing WAC so totals stay consistent with that policy. */
  var stockCostValue = products.reduce(function (a, p) { return a + (p.stock || 0) * (p.cost || 0); }, 0);
  var damagedValue = products.reduce(function (a, p) { return a + (p.damaged || 0) * (p.cost || 0); }, 0);
  var potentialProfit = stockRetailValue - stockCostValue;
  var outOfStock = products.filter(function (p) { return (p.stock || 0) === 0; }).length;
  var lowStock = products.filter(function (p) { return (p.stock || 0) > 0 && (p.stock || 0) <= 5; }).length;
  var avgMargin = products.length > 0 ? Math.round(products.reduce(function (a, p) { var m = p.price > 0 ? (p.price - (p.cost || 0)) / p.price * 100 : 0; return a + m; }, 0) / products.length) : 0;

  var cats = ["All"].concat((function () { var seen = {}; var out = []; products.forEach(function (p) { var c = p.category || "General"; if (!seen[c]) { seen[c] = 1; out.push(c); } }); return out; })().sort());

  /* FIX 8: When showInactive is true, show only soft-deleted products for recovery */
  var baseRows = showInactive
    ? state.products.filter(function (p) { return p.status === "inactive"; })
    : products;

  var rows = baseRows.filter(function (p) {
    var q = search.toLowerCase();
    var matchQ = !q || p.name.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    var matchCat = catFilter === "All" || p.category === catFilter;
    var matchStock = stockFilter === "All"
      || (stockFilter === "Out of Stock" && (p.stock || 0) === 0)
      || (stockFilter === "Low Stock" && (p.stock || 0) > 0 && (p.stock || 0) <= 5)
      || (stockFilter === "In Stock" && (p.stock || 0) > 5)
      || (stockFilter === "Has Damage" && (p.damaged || 0) > 0);
    return matchQ && matchCat && matchStock;
  });

  var invPager = usePager(rows, 50);
  var saveNew = function () {
    if (!newP || !newP.name || !newP.price) return;
    var cleanName = toTitleCase(newP.name.trim());
    var nameCheck = checkProductName(cleanName, state.products, null);
    if (nameCheck && nameCheck.type === "exact") {
      showAlert("A product named \"" + nameCheck.match + "\" already exists.\nPlease use a different name.");
      return;
    }
    if (newP.barcode && state.products.find(function (p) { return p.barcode === newP.barcode; })) {
      showAlert("A product with barcode \"" + newP.barcode + "\" already exists.\nPlease use a different barcode.");
      return;
    }
    var doSave = function () {
      var bulkUnit = (newP.bulkUnit || "").trim();
      var bulkEnabled = !!(bulkUnit);
      var bulkConversion = parseFloat(newP.bulkConversion) || 0;
      if (bulkEnabled) {
        if (!bulkUnit) { showAlert("Please enter bulk unit (e.g. Box, Tray, Carton)."); return; }
        if (bulkUnit === (newP.unit || "Pcs")) { showAlert("Bulk unit must be different from base unit."); return; }
        if (!(bulkConversion > 0)) { showAlert("Please enter a valid conversion value. Example: 1 Box = 12 Pcs."); return; }
      }
      var bulkSellPrice = parseFloat(newP.bulkPrice) || 0;
      var bulkCostPrice = parseFloat(newP.bulkCost) || 0;
      if (bulkEnabled && !(bulkSellPrice > 0)) { showAlert("Please enter secondary unit sell price."); return; }
      var prod = { id: uid(), productId: nextProductId(state.products), name: cleanName, barcode: newP.barcode || genBarcode(), category: newP.category || "General", unit: newP.unit || getBusinessProfile().units[0] || "Pcs", description: newP.description || "", cost: parseFloat(newP.cost) || 0, price: parseFloat(newP.price) || 0, stock: parseInt(newP.stock) || 0, damaged: 0, bulkEnabled: bulkEnabled, bulkUnit: bulkEnabled ? bulkUnit : "", bulkConversion: bulkEnabled ? bulkConversion : 0, bulkPrice: bulkEnabled ? bulkSellPrice : 0, bulkCost: bulkEnabled ? bulkCostPrice : 0 };
      if (!tcTrialGuard(state.products, 'products')) return;
      var np = state.products.concat([prod]);
      var log = (state.productLog || []).concat([{ id: uid(), date: today(), type: "Added", productId: prod.id, productName: prod.name, qty: prod.stock, reason: "New product" }]);
      S.set("tc3_products", np); S.set("tc3_productLog", log);
      setState(function (s) { return Object.assign({}, s, { products: np, productLog: log }); });
      setNewP(null);
    };
    if (nameCheck && nameCheck.type === "similar") {
      showConfirm("Similar product already exists:\n\"" + nameCheck.match + "\"\n\nAre you sure you want to create \"" + cleanName + "\" as a new product?", doSave);
    } else {
      doSave();
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
      showAlert("❌ Stock cannot be increased from the Inventory tab.\n\nTo add stock, please create a Purchase Order in the Purchases section.\nThis keeps your accounts, costs and audit trail accurate.");
      return;
    }
    /* Stock field is read-only here — always preserve original stock value */
    var bulkUnitEdit = (editP.bulkUnit || "").trim();
    var bulkEnabledEdit = !!bulkUnitEdit;
    var bulkConversionEdit = parseFloat(editP.bulkConversion) || 0;
    if (bulkEnabledEdit) {
      if (!bulkUnitEdit) { showAlert("Please enter bulk unit (e.g. Box, Tray, Carton)."); return; }
      if (bulkUnitEdit === (editP.unit || "Pcs")) { showAlert("Bulk unit must be different from base unit."); return; }
      if (!(bulkConversionEdit > 0)) { showAlert("Please enter a valid conversion value. Example: 1 Box = 12 Pcs."); return; }
    }
    var bulkSellPriceEdit = parseFloat(editP.bulkPrice) || 0;
    var bulkCostPriceEdit = parseFloat(editP.bulkCost) || 0;
    if (bulkEnabledEdit && !(bulkSellPriceEdit > 0)) { showAlert("Please enter secondary unit sell price."); return; }
    var np = state.products.map(function (p) { return p.id === editP.id ? Object.assign({}, p, { name: editP.name, barcode: editP.barcode, category: editP.category, unit: editP.unit || p.unit || "Pcs", description: editP.description, cost: parseFloat(editP.cost) || 0, price: parseFloat(editP.price) || 0, stock: origStock, bulkEnabled: bulkEnabledEdit, bulkUnit: bulkEnabledEdit ? bulkUnitEdit : "", bulkConversion: bulkEnabledEdit ? bulkConversionEdit : 0, bulkPrice: bulkEnabledEdit ? bulkSellPriceEdit : 0, bulkCost: bulkEnabledEdit ? bulkCostPriceEdit : 0 }) : p; });
    S.set("tc3_products", np);
    addAudit("Edited Product", editP.name + " (" + (editP.productId || editP.id.slice(0, 6)) + ")");
    setState(function (s) { return Object.assign({}, s, { products: np }); });
    setEditP(null);
  };

  /* FIX 8: Reactivate a soft-deleted product — removes inactive status */
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
      /* FIX 8: Soft-delete — mark product as inactive instead of permanently removing it.
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

  var ITABS = [["overview", "📊 Overview"], ["products", "📦 Products"], ["damaged", "⚠ Damaged"], ["history", "📋 Log"]];

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── TOP STAT CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <StatCard money={false} label="Total Products" value={totalProducts} accent={C.blue} icon="📦" sub={fmtSumQty(totalStockUnits) + " units in stock"} />
        <StatCard label="Retail Stock Value" value={stockRetailValue} accent={C.purple} icon="💰" sub={"Cost: " + getCurrencySymbol() + " " + fmtNum(stockCostValue)} />
        <StatCard label="Potential Profit" value={potentialProfit} accent={potentialProfit >= 0 ? C.green : C.red} icon="📈" sub={"Avg margin: " + avgMargin + "%"} />
        <div style={{ cursor: "pointer" }} onClick={function () { setItab("products"); setStockFilter("Out of Stock"); }}><StatCard money={false} label="Out of Stock" value={outOfStock} accent={outOfStock > 0 ? C.red : C.green} icon="🚫" sub={lowStock + " low stock"} /></div>
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid " + C.border }}>
        {ITABS.map(function (t) {
          return <button key={t[0]} onClick={function () { setItab(t[0]); }} style={{ padding: "10px 18px", borderRadius: "10px 10px 0 0", border: "1.5px solid " + (itab === t[0] ? C.border : "transparent"), borderBottom: itab === t[0] ? "2px solid #fff" : "none", background: itab === t[0] ? "#fff" : "transparent", color: itab === t[0] ? C.accent : C.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: itab === t[0] ? -2 : 0 }}>{t[1]}</button>;
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
          <Btn sm col="cyan" onClick={function () { setNewP(null); setTimeout(function () { setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", description: "", cost: "", price: "", stock: "" }); }, 30); }}>+ Add Product</Btn>
        </div>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {itab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            {/* Stock Value Breakdown */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", border: "1.5px solid " + C.border, boxShadow: C.shadowCard, gridColumn: "span 2" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Stock Value Breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                {[
                  { label: "Retail Value", val: stockRetailValue, color: C.blue, icon: "🏷", sub: "At selling price" },
                  { label: "Cost Value", val: stockCostValue, color: C.purple, icon: "💼", sub: "At purchase price" },
                  { label: "Gross Profit", val: potentialProfit, color: potentialProfit >= 0 ? C.green : C.red, icon: "📈", sub: "If all sold" },
                  { label: "Damaged Value", val: damagedValue, color: C.orange, icon: "⚠", sub: "Loss from damage" }
                ].map(function (s) {
                  return (
                    <div key={s.label} style={{ background: "#f7f9ff", borderRadius: 10, padding: "14px 16px", borderLeft: "4px solid " + s.color }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontWeight: 900, fontSize: 18, color: s.color }}>{getCurrencySymbol()} {fmtNum(s.val)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{s.sub}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stock Health */}
            <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", border: "1.5px solid " + C.border, boxShadow: C.shadowCard }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Stock Health</div>
              {[
                { label: "In Stock", val: products.filter(function (p) { return (p.stock || 0) > 5; }).length, color: C.green, total: totalProducts },
                { label: "Low Stock (≤5)", val: lowStock, color: C.amber, total: totalProducts },
                { label: "Out of Stock", val: outOfStock, color: C.red, total: totalProducts },
                { label: "Has Damage", val: products.filter(function (p) { return (p.damaged || 0) > 0; }).length, color: C.orange, total: totalProducts }
              ].map(function (s) {
                var pct = s.total > 0 ? Math.round(s.val / s.total * 100) : 0;
                return (
                  <div key={s.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      <span style={{ color: C.textMd }}>{s.label}</span>
                      <span style={{ color: s.color, fontWeight: 800 }}>{s.val} <span style={{ color: C.muted, fontWeight: 500 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                      <div style={{ width: pct + "%", height: "100%", background: s.color, borderRadius: 3, transition: "width .4s" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category Breakdown */}
          <Card>
            <CardTitle sub="Stock value and units per category">Category Overview</CardTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><TH>Category</TH><TH>Products</TH><TH>Total Units</TH><TH>Damaged</TH><TH>Retail Value</TH><TH>Cost Value</TH><TH>Potential Profit</TH><TH>Avg Margin</TH></tr></thead>
                <tbody>
                  {(function () {
                    var catMap = {};
                    products.forEach(function (p) {
                      var c = p.category || "General";
                      if (!catMap[c]) catMap[c] = { count: 0, units: 0, damaged: 0, retail: 0, cost: 0 };
                      catMap[c].count++;
                      catMap[c].units += inventoryQtyForTotals(p);
                      catMap[c].damaged += p.damaged || 0;
                      catMap[c].retail += (p.stock || 0) * p.price;
                      catMap[c].cost += (p.stock || 0) * (p.cost || 0);
                    });
                    return Object.keys(catMap).sort().map(function (cat, i) {
                      var d = catMap[cat];
                      var margin = d.retail > 0 ? Math.round((d.retail - d.cost) / d.retail * 100) : 0;
                      return (
                        <TR key={cat} i={i}>
                          <td style={{ padding: "10px 14px" }}><span style={{ background: C.accentSoft, color: C.accent, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12 }}>{cat}</span></td>
                          <TD center>{d.count}</TD>
                          <TD bold center>{fmtSumQty(d.units)}</TD>
                          <TD center color={d.damaged > 0 ? C.orange : C.muted}>{d.damaged}</TD>
                          <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(d.retail)}</TD>
                          <TD color={C.purple}>{getCurrencySymbol()} {fmtNum(d.cost)}</TD>
                          <TD bold color={d.retail - d.cost >= 0 ? C.green : C.red}>{getCurrencySymbol()} {fmtNum(d.retail - d.cost)}</TD>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, minWidth: 40 }}>
                                <div style={{ width: Math.min(margin, 100) + "%", height: "100%", background: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red, borderRadius: 3 }}></div>
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red }}>{margin}%</span>
                            </div>
                          </td>
                        </TR>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top Products by Value */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <CardTitle sub="Highest retail stock value">Top 8 by Stock Value</CardTitle>
              {products.slice().sort(function (a, b) { return ((b.stock || 0) * b.price) - ((a.stock || 0) * a.price); }).slice(0, 8).map(function (p, i) {
                var val = (p.stock || 0) * p.price;
                var maxVal = ((products[0] || {}).stock || 0) * (products[0] || {}).price || 1;
                var pct = Math.round(val / stockRetailValue * 100);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + C.border }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: C.accent, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, marginTop: 2 }}>
                        <span>{getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}</span>
                        <span style={{ color: C.blue, fontWeight: 600 }}>{getCurrencySymbol()} {fmtNum(p.price)}/{p.unit || "Pcs"}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: C.blue }}>{getCurrencySymbol()} {fmtNum(val)}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </Card>
            <Card>
              <CardTitle sub="Products needing attention">Alerts &amp; Low Stock</CardTitle>
              {(function () {
                var now = new Date();
                var soon = new Date(); soon.setDate(soon.getDate() + 30);
                var showExpiry = getBusinessProfile().modules.expiry;
                var alertProds = products.filter(function (p) {
                  if ((p.stock || 0) <= 5 || (p.damaged || 0) > 0) return true;
                  if (showExpiry && p.expiryDate) {
                    var ed = new Date(p.expiryDate);
                    if (ed <= soon) return true;
                  }
                  return false;
                }).sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); }).slice(0, 12);
                if (alertProds.length === 0) return <div style={{ padding: "20px 0", textAlign: "center", color: C.green, fontWeight: 700 }}>✅ All products healthy!</div>;
                return alertProds.map(function (p, i) {
                  var isOut = (p.stock || 0) === 0;
                  var isLow = !isOut && (p.stock || 0) <= 5;
                  var hasDmg = (p.damaged || 0) > 0;
                  var isExpired = showExpiry && p.expiryDate && new Date(p.expiryDate) < now;
                  var isExpiringSoon = showExpiry && p.expiryDate && !isExpired && new Date(p.expiryDate) <= soon;
                  return (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid " + C.border }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{p.category}{p.unit ? " · " + p.unit : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isOut && <span style={{ background: "#fde8ed", color: C.red, padding: "2px 8px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>Out of Stock</span>}
                        {isLow && <span style={{ background: "#fef3e2", color: C.amber, padding: "2px 8px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>Low: {getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock, p.unit)}</span>}
                        {hasDmg && <span style={{ background: "#fff3e0", color: C.orange, padding: "2px 8px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>Dmg: {p.damaged}</span>}
                        {isExpired && <span style={{ background: "#fde8ed", color: C.red, padding: "2px 8px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>⚠ Expired</span>}
                        {isExpiringSoon && <span style={{ background: "#fff3e0", color: C.orange, padding: "2px 8px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>Exp Soon</span>}
                      </div>
                    </div>
                  );
                });
              })()}
            </Card>
          </div>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {itab === "products" && (
        <Card>
          <CardTitle sub={showInactive ? (rows.length + " inactive products") : (rows.length.toLocaleString() + " of " + totalProducts.toLocaleString() + " products")}>
            Products
          </CardTitle>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 200 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search by name, barcode or category..." /></div>
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
              {showInactive ? "🔴 Showing Inactive — Click to go back" : "Show Inactive"}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><TH>ID</TH><TH>Product</TH><TH>Barcode</TH><TH>Category</TH><TH>Unit</TH><TH>Cost</TH><TH>Price</TH><TH>Margin</TH><TH>Stock</TH><TH>Stock Value</TH><TH>Damaged</TH><TH>Actions</TH></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={12} style={{ padding: 20, textAlign: "center", color: C.muted }}>{showInactive ? "No inactive products found" : "No products found"}</td></tr>}
                {invPager.slice.map(function (p, i) {
                  var margin = p.price > 0 ? Math.round((p.price - (p.cost || 0)) / p.price * 100) : 0;
                  var stockVal = (p.stock || 0) * p.price;
                  return (
                    <TR key={p.id} i={i}>
                      <td style={{ padding: "10px 14px" }}><span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: C.accent }}>{p.productId || "—"}</span></td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, color: showInactive ? C.orange : C.text }}>{p.name} {showInactive && <span style={{ fontSize: 10, background: "#fef3e2", color: C.orange, padding: "1px 6px", borderRadius: 10, marginLeft: 4 }}>INACTIVE</span>}</div>
                        {p.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{p.description.slice(0, 40)}</div>}
                      </td>
                      <TD><span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{p.barcode}</span></TD>
                      <td style={{ padding: "10px 14px" }}><span style={{ background: C.accentSoft, color: C.accent, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.category}</span></td>
                      <TD><span style={{ background: "rgba(41,121,255,0.07)", color: C.accent, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{p.unit || "Pcs"}</span></TD>
                      <TD color={C.muted}>{getCurrencySymbol()} {fmtNum(p.cost)}</TD>
                      <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(p.price)}</TD>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: margin >= 30 ? C.green : margin >= 15 ? C.amber : C.red }}>{margin}%</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: (p.stock || 0) === 0 ? "#fde8ed" : (p.stock || 0) <= 5 ? "#fef3e2" : C.successSoft, color: (p.stock || 0) === 0 ? C.red : (p.stock || 0) <= 5 ? C.amber : C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 800, fontSize: 13 }}>
                          {getBulkDisplayParts(p) ? fmtStockDual(p) : fmtStock(p.stock || 0, p.unit)}
                        </span>
                      </td>
                      <TD color={C.purple}>{getCurrencySymbol()} {fmtNum(stockVal)}</TD>
                      <TD color={(p.damaged || 0) > 0 ? C.orange : C.muted}>{p.damaged || 0}</TD>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {showInactive ? (
                            /* FIX 8: Show Reactivate button for inactive products */
                            <Btn sm col="green" onClick={function () { reactivateProduct(p.id); }}>Reactivate</Btn>
                          ) : (
                            <>
                          <Btn sm col="gray" onClick={function () { setViewP(p); }}>View</Btn>
                          <Btn sm col="blue" onClick={function () { setEditP(Object.assign({}, p)); }}>Edit</Btn>
                          <Btn sm col="orange" onClick={function () { setActionP({ product: p, mode: "damage" }); setDmgQty("1"); setReason(""); }}>Dmg</Btn>
                          <Btn sm col="red" onClick={function () {
                            if ((p.stock || 0) > 0) {
                              showAlert("❌ Cannot delete \"" + p.name + "\" — it has " + fmtStock(p.stock, p.unit) + " in stock.\n\nSell or remove all stock first, then delete.");
                              return;
                            }
                            setActionP({ product: p, mode: "delete", deleteEntire: false }); setDmgQty("1"); setReason("");
                          }}>Del</Btn>
                            </>
                          )}
                        </div>
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
              <span>Retail Value: <span style={{ color: C.purple }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { return a + (p.stock || 0) * p.price; }, 0))}</span></span>
              <span>Cost Value: <span style={{ color: C.orange }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { return a + (p.stock || 0) * (p.cost || 0); }, 0))}</span></span>
              <span>Profit Potential: <span style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum(rows.reduce(function (a, p) { return a + (p.stock || 0) * (p.price - (p.cost || 0)); }, 0))}</span></span>
            </div>
          )}
        </Card>
      )}

      {/* ── DAMAGED TAB ── */}
      {itab === "damaged" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <StatCard money={false} label="Damaged Products" value={products.filter(function (p) { return (p.damaged || 0) > 0; }).length} accent={C.orange} icon="⚠" sub="have damaged units" />
            <StatCard money={false} label="Total Damaged Units" value={totalDamagedUnits} accent={C.red} icon="📦" sub="units damaged" />
            <StatCard label="Damaged Value (Cost)" value={damagedValue} accent={C.red} icon="💸" sub="total loss" />
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
                {products.filter(function (p) { return (p.damaged || 0) > 0; }).length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.green, fontWeight: 700 }}>✅ No damaged items!</td></tr>}
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

      {/* ── LOG TAB ── */}
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

      {/* ── PRODUCT DETAIL VIEW ── */}
      {viewP && (
        <Modal title={viewP.name} onClose={function () { setViewP(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Cost Price", val: getCurrencySymbol() + " " + fmtNum(viewP.cost || 0), color: C.muted },
              { label: "Sell Price", val: getCurrencySymbol() + " " + fmtNum(viewP.price), color: C.blue },
              { label: "Profit/Unit", val: getCurrencySymbol() + " " + fmtNum(viewP.price - (viewP.cost || 0)), color: C.green },
              { label: "Margin", val: viewP.price > 0 ? Math.round((viewP.price - (viewP.cost || 0)) / viewP.price * 100) + "%" : "0%", color: C.purple },
              { label: "Stock Units", val: getBulkDisplayParts(viewP) ? fmtStockDual(viewP) : fmtStock(viewP.stock || 0, viewP.unit), color: (viewP.stock || 0) > 5 ? C.green : (viewP.stock || 0) > 0 ? C.amber : C.red },
              { label: "Stock Value", val: getCurrencySymbol() + " " + fmtNum((viewP.stock || 0) * viewP.price), color: C.blue },
              { label: "Damaged Units", val: String(viewP.damaged || 0), color: (viewP.damaged || 0) > 0 ? C.orange : C.muted },
              { label: "Damage Cost", val: getCurrencySymbol() + " " + fmtNum((viewP.damaged || 0) * (viewP.cost || 0)), color: C.red },
              { label: "Category", val: viewP.category || "General", color: C.text },
              { label: "Unit", val: viewP.unit || "Pcs", color: C.accent }
            ].concat(getBusinessProfile().modules.serial && viewP.serialNo ? [
              { label: "Serial / IMEI", val: viewP.serialNo, color: C.cyan }
            ] : []).concat(getBusinessProfile().name === "Jewelry & Watches" ? [
              { label: "Weight", val: viewP.weightGrams ? viewP.weightGrams + " g" : "—", color: C.text },
              { label: "Making Charge", val: viewP.makingCharge ? getCurrencySymbol() + " " + fmtNum(viewP.makingCharge) : "—", color: C.orange }
            ] : []).concat(getBusinessProfile().modules.expiry ? [
              { label: "Expiry Date", val: viewP.expiryDate ? fmtDateFull(viewP.expiryDate) : "—", color: viewP.expiryDate && new Date(viewP.expiryDate) < new Date() ? C.red : C.text },
              { label: "Batch / Lot No", val: viewP.batchNo || "—", color: C.muted }
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
            <Btn col="blue" onClick={function () { setEditP(Object.assign({}, viewP)); setViewP(null); }}>Edit</Btn>
            <Btn col="orange" onClick={function () { setActionP({ product: viewP, mode: "damage" }); setDmgQty("1"); setReason(""); setViewP(null); }}>Mark Damage</Btn>
            <Btn col="gray" onClick={function () { setViewP(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {newP && (
        <Modal title={"Add New Product — ID: " + nextProductId(state.products)} onClose={function () { setNewP(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="Product Name *" value={newP.name} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { name: toTitleCase(e.target.value) }); }); }} />
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Product ID</label>
                <div style={{ border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, background: "#f3f4f6", color: C.accent, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.05em" }}>{nextProductId(state.products)}</div>
              </div>
              <Input label="Barcode" value={newP.barcode} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }} />
              <Sel label="Category" value={newP.category} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { category: e.target.value }); }); }}>{getCats().map(function (c) { return <option key={c}>{c}</option>; })}</Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label="Cost Price *" type="number" value={newP.cost} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }} />
              <Input label="Sell Price *" type="number" value={newP.price} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }} />
              <Input label="Initial Stock" type="number" value={newP.stock} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { stock: e.target.value }); }); }} />
              <Sel label="Base Unit" value={newP.unit || getBusinessProfile().units[0] || "Pcs"} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { unit: e.target.value }); }); }}>{getBusinessProfile().units.map(function (u) { return <option key={u}>{u}</option>; })}</Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1.5px solid " + C.border, borderRadius: 8, background: "#f8fafc" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Secondary Unit (optional)</span>
              </div>
              <Input label="Secondary Unit" value={newP.bulkUnit || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { bulkUnit: e.target.value }); }); }} placeholder="Box / Tray / Carton" />
              <Input label={"1 " + ((newP.bulkUnit || "secondary")) + " = ? " + (newP.unit || "Pcs")} type="number" value={newP.bulkConversion || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { bulkConversion: e.target.value }); }); }} placeholder="e.g. 12" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label={"Secondary Cost Price (" + (newP.bulkUnit || "secondary") + ")"} type="number" value={newP.bulkCost || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { bulkCost: e.target.value }); }); }} placeholder="optional" />
              <Input label={"Secondary Sell Price (" + (newP.bulkUnit || "secondary") + ") *"} type="number" value={newP.bulkPrice || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { bulkPrice: e.target.value }); }); }} placeholder="required if secondary used" />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: -2 }}>Example: 1 Box = 12 Pcs. Leave secondary unit empty for simple products.</div>
            <div style={{ fontSize: 11, color: C.textMd }}>
              Config: Base: <strong>{newP.unit || "Pcs"}</strong>
              {newP.bulkUnit ? (" | Secondary: " + newP.bulkUnit + (newP.bulkConversion ? (" | 1 " + newP.bulkUnit + " = " + newP.bulkConversion + " " + (newP.unit || "Pcs")) : "")) : " | Secondary: None"}
            </div>
            {newP.cost && newP.price && (
              <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 20 }}>
                <span>Profit/unit: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum((parseFloat(newP.price) || 0) - (parseFloat(newP.cost) || 0))}</strong></span>
                <span>Margin: <strong style={{ color: C.accent }}>{(parseFloat(newP.price) || 0) > 0 ? Math.round(((parseFloat(newP.price) || 0) - (parseFloat(newP.cost) || 0)) / (parseFloat(newP.price) || 0) * 100) : 0}%</strong></span>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes (optional)</label>
              <textarea value={newP.description || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Product specs, features, notes..." />
            </div>
            {getBusinessProfile().modules.serial && (
              <Input label="Serial Number / IMEI (optional)" value={newP.serialNo || ""} onChange={function (e) { setNewP(function (x) { return Object.assign({}, x, { serialNo: e.target.value }); }); }} placeholder="e.g. 358240051111110" />
            )}
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
              <Btn col="cyan" onClick={saveNew} disabled={!newP.name || !newP.price}>Save Product</Btn>
              <Btn col="blue" onClick={function () {
                if (!newP.name || !newP.price) return;
                saveNew();
                setTimeout(function () {
                  setNewP({ name: "", barcode: genBarcode(), category: getBusinessProfile().categories[0] || "General", unit: getBusinessProfile().units[0] || "Pcs", description: "", cost: "", price: "", stock: "" });
                }, 80);
              }} disabled={!newP.name || !newP.price}>Save + Add Another</Btn>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1.5px solid " + C.border, borderRadius: 8, background: "#f8fafc" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Secondary Unit (optional)</span>
              </div>
              <Input label="Secondary Unit" value={editP.bulkUnit || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { bulkUnit: e.target.value }); }); }} placeholder="Box / Tray / Carton" />
              <Input label={"1 " + ((editP.bulkUnit || "secondary")) + " = ? " + (editP.unit || "Pcs")} type="number" value={editP.bulkConversion || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { bulkConversion: e.target.value }); }); }} placeholder="e.g. 12" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label={"Secondary Cost Price (" + (editP.bulkUnit || "secondary") + ")"} type="number" value={editP.bulkCost || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { bulkCost: e.target.value }); }); }} placeholder="optional" />
              <Input label={"Secondary Sell Price (" + (editP.bulkUnit || "secondary") + ") *"} type="number" value={editP.bulkPrice || ""} onChange={function (e) { setEditP(function (x) { return Object.assign({}, x, { bulkPrice: e.target.value }); }); }} placeholder="required if secondary used" />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: -2 }}>Example: 1 Box = 12 Pcs. Leave secondary unit empty for simple products.</div>
            <div style={{ fontSize: 11, color: C.textMd }}>
              Config: Base: <strong>{editP.unit || "Pcs"}</strong>
              {editP.bulkUnit ? (" | Secondary: " + editP.bulkUnit + (editP.bulkConversion ? (" | 1 " + editP.bulkUnit + " = " + editP.bulkConversion + " " + (editP.unit || "Pcs")) : "")) : " | Secondary: None"}
            </div>
            {editP.cost && editP.price && (
              <div style={{ background: C.accentSoft, borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", gap: 20 }}>
                <span>Profit/unit: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum((parseFloat(editP.price) || 0) - (parseFloat(editP.cost) || 0))}</strong></span>
                <span>Margin: <strong style={{ color: C.accent }}>{(parseFloat(editP.price) || 0) > 0 ? Math.round(((parseFloat(editP.price) || 0) - (parseFloat(editP.cost) || 0)) / (parseFloat(editP.price) || 0) * 100) : 0}%</strong></span>
              </div>
            )}
            {getBusinessProfile().modules.serial && (
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
        <Modal title={actionP.mode === "damage" ? "Mark as Damaged — " + actionP.product.name : "Remove Stock — " + actionP.product.name} onClose={function () { setActionP(null); }}>
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
