import React, { useEffect, useMemo, useRef, useState } from "react";
import { validateExtraUnits } from "../units/productUnits.js";
import {
  RAW_MATERIAL_PRICE_COST_HINT,
  isRawMaterialGuardBaseUnit,
  rawMaterialEnteredLooksLikePackTotal,
  rawMaterialPackPricingConfirmMessage,
} from "../utils/rawMaterialPricingGuard.js";
import { evaluateProductNameMatch } from "../utils/productNameMatch.js";
import ProductNameDuplicateHint, { useProductNameHintControls } from "./ProductNameDuplicateHint.jsx";
import GlassSheetInfo from "./GlassSheetInfo.jsx";
import {
  isGlassStockProductForm,
  validateGlassProductForm,
  glassCostPriceLabels,
  glassFormFieldsOnUnitChange,
} from "../utils/glassProduct.js";
import { getUnitsForSubCategory, getDefaultProductCategory, getDefaultProductUnit } from "../utils/categoryGroups.js";
import CategorySelect from "./CategorySelect.jsx";
import { DEFAULT_PRODUCT_COMMENT_LABEL } from "../productionConfig.js";

export function blankNewProductForm(shopSettings, genBarcode, extra) {
  var cat = getDefaultProductCategory(shopSettings);
  var unit = getDefaultProductUnit(shopSettings, cat);
  return Object.assign({
    name: "",
    barcode: typeof genBarcode === "function" ? genBarcode() : "",
    category: cat,
    unit: unit,
    type: "stock",
    cost: "",
    price: "",
    description: "",
    stock: "",
    extraUnits: [],
    require_comment: false,
    comment_label: DEFAULT_PRODUCT_COMMENT_LABEL,
  }, extra || {});
}

function normalizeProductType(t) {
  var pt = String(t || "stock").toLowerCase();
  return (pt === "service" || pt === "raw_material") ? pt : "stock";
}

function focusById(id) {
  var el = document.getElementById(id);
  if (el && typeof el.focus === "function") el.focus();
}

var MODE_BANNER = {
  purchase: "Product will be added to inventory. Stock will be updated when the purchase is saved.",
  inventory: "Product will be saved to inventory immediately.",
  opening: "New product will be added to your Inventory with opening stock quantity.",
};

/**
 * Shared Add New Product modal used across Purchases, Inventory, and Opening Balance.
 * mode: "purchase" | "inventory" | "opening"
 */
export default function AddNewProductModal(props) {
  var mode = props.mode || "inventory";
  var Modal = props.Modal;
  var Input = props.Input;
  var Sel = props.Sel;
  var Btn = props.Btn;
  var C = props.C;
  var shopSettings = props.shopSettings;
  var products = props.products || [];
  var productIdLabel = props.productIdLabel;
  var getBusinessProfile = props.getBusinessProfile;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var checkProductName = props.checkProductName;
  var onClose = props.onClose;
  var onSubmit = props.onSubmit;
  var initial = props.initial || {};
  var remountKey = props.remountKey != null ? props.remountKey : 0;
  var tipBanner = props.tipBanner || null;
  var showSaveAndAddAnother = mode === "inventory" || props.showSaveAndAddAnother === true;
  var showInitialStock = mode === "inventory";
  var showType = mode !== "opening";
  var requireCost = mode === "opening";
  var banner = props.banner != null ? props.banner : MODE_BANNER[mode];

  var [form, setForm] = useState(function () { return Object.assign({}, initial); });
  useEffect(function () {
    setForm(Object.assign({}, initial));
  }, [remountKey]);

  var nameHint = useProductNameHintControls(form.name);
  var nameMatch = useMemo(function () {
    if (!String(form.name || "").trim()) return null;
    return evaluateProductNameMatch(form.name, products, null);
  }, [form.name, products]);
  var exactDup = !!(nameMatch && nameMatch.type === "exact");

  var selectEnter = useRef({ main: false, sub: false, type: false, unit: false });
  var markSelectEnterStage = function (key, val) {
    if (!selectEnter.current) return;
    selectEnter.current[key] = !!val;
  };
  var handleSelectEnter = function (key, focusId, next) {
    if (!selectEnter.current[key]) {
      markSelectEnterStage(key, true);
      focusById(focusId);
      return;
    }
    markSelectEnterStage(key, false);
    if (typeof next === "function") next();
  };

  var onCategoryChange = function (cat) {
    var units = getUnitsForSubCategory(cat, shopSettings);
    setForm(function (x) {
      var nextUnit = units.indexOf(x.unit) >= 0 ? x.unit : (units[0] || "Pcs");
      return Object.assign({}, x, { category: cat, unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit));
    });
  };

  var isService = normalizeProductType(form.type) === "service";
  var profile = typeof getBusinessProfile === "function" ? getBusinessProfile() : { name: "", modules: {} };

  var saveDisabled =
    !String(form.name || "").trim() ||
    exactDup ||
    (requireCost && !(parseFloat(form.cost) > 0)) ||
    (!isService && mode !== "opening" && !form.price) ||
    (mode === "opening" && !form.price);

  var runSave = function (addAnother) {
    var nameStr = String(form.name == null ? "" : form.name).trim();
    if (!nameStr) {
      showAlert("Please enter a product name.");
      return;
    }
    if (typeof checkProductName === "function") {
      var nameCheck = checkProductName(nameStr, products, null);
      if (nameCheck && nameCheck.type === "exact") {
        showAlert("A product named \"" + nameCheck.match + "\" already exists.\nPlease use a different name.");
        return;
      }
      if (!isService && mode !== "opening" && !form.price) return;
      if (mode === "opening" && (!form.cost || parseFloat(form.cost) <= 0)) {
        showAlert("Please enter a valid cost price.");
        return;
      }
      if (form.barcode && products.find(function (p) { return p.barcode === form.barcode; })) {
        showAlert("A product with barcode \"" + form.barcode + "\" already exists.");
        return;
      }

      var proceed = function () {
        var glassErr = validateGlassProductForm(form, shopSettings);
        if (glassErr) { showAlert(glassErr); return; }
        var unitErr = validateExtraUnits(form.unit, form.extraUnits || []);
        if (unitErr) { showAlert(unitErr); return; }

        var payload = Object.assign({}, form, {
          name: nameStr,
          type: normalizeProductType(form.type),
        });

        var finish = function () {
          if (typeof onSubmit !== "function") return;
          var result = onSubmit(payload, { addAnother: !!addAnother });
          if (addAnother && result !== false) {
            setForm(blankNewProductForm(shopSettings, props.genBarcode, {
              type: form.type || "stock",
            }));
            setTimeout(function () { focusById("newprod-name"); }, 40);
          }
        };

        var maybeGuard = function () {
          if (
            normalizeProductType(form.type) === "raw_material" &&
            isRawMaterialGuardBaseUnit(form.unit) &&
            rawMaterialEnteredLooksLikePackTotal(form.cost, form.price, form.unit)
          ) {
            showConfirm(rawMaterialPackPricingConfirmMessage(form.cost, form.price, form.unit), finish);
            return;
          }
          finish();
        };

        if (nameCheck && (nameCheck.type === "likely_same" || nameCheck.type === "reordered")) {
          var dupNames = (nameCheck.matches || []).map(function (m) { return "\"" + m.name + "\""; }).join(", ");
          showConfirm("This looks like a product you already have:\n" + dupNames + "\n\nCreate \"" + nameStr + "\" as a new product anyway?", maybeGuard);
        } else {
          maybeGuard();
        }
      };
      proceed();
      return;
    }

    /* Fallback without checkProductName */
    if (typeof onSubmit === "function") onSubmit(Object.assign({}, form, { name: nameStr }), { addAnother: !!addAnother });
  };

  return (
    <Modal
      key={"shared-newprod-" + remountKey}
      className={"erp-pur-form-modal erp-pur-newprod-modal" + (mode === "inventory" ? " erp-inv-newprod-modal" : "")}
      headerBg={mode === "inventory" ? "linear-gradient(135deg, #15803d 0%, #166534 100%)" : undefined}
      title={"Add New Product — ID: " + (productIdLabel || "")}
      onClose={onClose}
      wide
      closeRound
    >
      <div className="erp-pur-newprod-form">
        {banner ? <div className="erp-pur-newprod-banner">{banner}</div> : null}
        <div className="erp-pur-newprod-fields">
          <Input
            id="newprod-name"
            compact
            label="Product Name *"
            value={form.name}
            onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { name: e.target.value }); }); }}
            onFocus={nameHint.onNameFocus}
            onBlur={nameHint.onNameBlur}
            onKeyDown={function (e) {
              if (e.key === "Enter") { e.preventDefault(); focusById("newprod-barcode"); }
            }}
          />
          <ProductNameDuplicateHint
            name={form.name}
            products={products}
            C={C}
            visible={nameHint.visible}
            onDismiss={nameHint.onDismiss}
            compact
          />

          <div className="erp-pur-newprod-id-row">
            <div>
              <label className="erp-pur-newprod-lbl">Product ID</label>
              <div className="erp-pur-newprod-idbox">{productIdLabel}</div>
            </div>
            <Input
              id="newprod-barcode"
              compact
              label="Barcode"
              value={form.barcode || ""}
              onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { barcode: e.target.value }); }); }}
              onKeyDown={function (e) {
                if (e.key === "Enter") { e.preventDefault(); focusById("newprod-main-category"); }
              }}
            />
          </div>

          <CategorySelect
            Sel={Sel}
            value={form.category || "General"}
            settings={shopSettings}
            onChange={function (e) { onCategoryChange(e.target.value); }}
            focusSubAfterGroupChange={false}
            gridStyle={{ gap: 8 }}
            mainSelectProps={{
              id: "newprod-main-category",
              onFocus: function () { markSelectEnterStage("main", false); },
              onBlur: function () { markSelectEnterStage("main", false); },
              onKeyDown: function (e) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelectEnter("main", "newprod-main-category", function () { focusById("newprod-sub-category"); });
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") markSelectEnterStage("main", true);
              },
              onKeyUp: function (e) {
                if (e.key === "Enter" && selectEnter.current.main) {
                  markSelectEnterStage("main", false);
                  focusById("newprod-sub-category");
                }
              },
            }}
            subSelectProps={{
              id: "newprod-sub-category",
              onFocus: function () { markSelectEnterStage("sub", false); },
              onBlur: function () { markSelectEnterStage("sub", false); },
              onKeyDown: function (e) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelectEnter("sub", "newprod-sub-category", function () {
                    focusById(showType ? "newprod-type" : "newprod-cost");
                  });
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") markSelectEnterStage("sub", true);
              },
              onKeyUp: function (e) {
                if (e.key === "Enter" && selectEnter.current.sub) {
                  markSelectEnterStage("sub", false);
                  focusById(showType ? "newprod-type" : "newprod-cost");
                }
              },
            }}
          />

          <div className="erp-pur-newprod-meta-row">
            <Input
              id="newprod-cost"
              compact
              label={glassCostPriceLabels(form, shopSettings).cost}
              type="number"
              value={form.cost || ""}
              onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { cost: e.target.value }); }); }}
              onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); focusById("newprod-sell"); } }}
            />
            <Input
              id="newprod-sell"
              compact
              label={isService ? "Selling Price (optional — enter at sale)" : glassCostPriceLabels(form, shopSettings).sell}
              type="number"
              value={form.price || ""}
              onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { price: e.target.value }); }); }}
              placeholder={isService ? "Leave empty if price varies" : ""}
              onKeyDown={function (e) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  focusById(showType ? "newprod-type" : (showInitialStock ? "newprod-stock" : "newprod-unit"));
                }
              }}
            />
            {showType ? (
              <Sel
                id="newprod-type"
                label="Product Type"
                value={form.type || "stock"}
                onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { type: e.target.value }); }); }}
                onFocus={function () { markSelectEnterStage("type", false); }}
                onBlur={function () { markSelectEnterStage("type", false); }}
                onKeyDown={function (e) {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSelectEnter("type", "newprod-type", function () {
                      focusById(showInitialStock ? "newprod-stock" : "newprod-unit");
                    });
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") markSelectEnterStage("type", true);
                }}
              >
                <option value="stock">Stock</option>
                <option value="service">Service</option>
                <option value="raw_material">Raw Material</option>
              </Sel>
            ) : null}
            {showInitialStock ? (
              <Input
                id="newprod-stock"
                compact
                label={isService ? "Initial Stock (not required for service)" : "Initial Stock"}
                type="number"
                value={form.stock || ""}
                onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { stock: e.target.value }); }); }}
                onKeyDown={function (e) { if (e.key === "Enter") { e.preventDefault(); focusById("newprod-unit"); } }}
              />
            ) : null}
            <Sel
              id="newprod-unit"
              label="Base Unit"
              value={form.unit || getDefaultProductUnit(shopSettings, form.category)}
              onChange={function (e) {
                var nextUnit = e.target.value;
                setForm(function (x) { return Object.assign({}, x, { unit: nextUnit }, glassFormFieldsOnUnitChange(nextUnit)); });
              }}
              onFocus={function () { markSelectEnterStage("unit", false); }}
              onBlur={function () { markSelectEnterStage("unit", false); }}
              onKeyDown={function (e) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelectEnter("unit", "newprod-unit", function () {
                    var saveBtn = document.getElementById("newprod-save-btn");
                    if (saveBtn && typeof saveBtn.focus === "function") saveBtn.focus();
                  });
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") markSelectEnterStage("unit", true);
              }}
            >
              {getUnitsForSubCategory(form.category, shopSettings).map(function (u) {
                return <option key={u}>{u}</option>;
              })}
            </Sel>
          </div>

          {isGlassStockProductForm(form, shopSettings) && (
            <GlassSheetInfo form={form} setForm={setForm} C={C} Input={Input} Sel={Sel} />
          )}
          {!isGlassStockProductForm(form, shopSettings) && form.category ? (
            <div style={{ fontSize: 11, color: C.muted }}>
              Units for this category: {getUnitsForSubCategory(form.category, shopSettings).join(", ")}
            </div>
          ) : null}

          <div className="erp-pur-newprod-extra">
            <div className="erp-pur-newprod-extra-title">Additional units (optional)</div>
            <div className="erp-pur-newprod-extra-sub">
              Each <strong>factor</strong> is how many <strong>{form.unit || "Pcs"}</strong> (base) are in one of that unit. Stock is always kept in base units.
            </div>
            {(form.extraUnits || []).map(function (row, idx) {
              return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "minmax(80px,1fr) 88px minmax(72px,1fr) minmax(72px,1fr) 34px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <Input label="Unit name" value={row.name || ""} onChange={function (e) { var v = e.target.value; setForm(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { name: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="Strip / Box" />
                  <Input label="Factor" type="number" value={row.factor || ""} onChange={function (e) { var v = e.target.value; setForm(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { factor: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="e.g. 12" />
                  <Input label="Sell (opt.)" type="number" value={row.sellPrice || ""} onChange={function (e) { var v = e.target.value; setForm(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { sellPrice: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                  <Input label="Cost (opt.)" type="number" value={row.cost || ""} onChange={function (e) { var v = e.target.value; setForm(function (x) { var next = (x.extraUnits || []).slice(); next[idx] = Object.assign({}, next[idx], { cost: v }); return Object.assign({}, x, { extraUnits: next }); }); }} placeholder="auto if empty" />
                  <button type="button" onClick={function () { setForm(function (x) { var next = (x.extraUnits || []).filter(function (_, j) { return j !== idx; }); return Object.assign({}, x, { extraUnits: next }); }); }} style={{ height: 32, borderRadius: 8, border: "1.5px solid " + C.border, background: "#fff", cursor: "pointer", fontSize: 14, color: C.red }} title="Remove">✕</button>
                </div>
              );
            })}
            <button
              type="button"
              className="erp-pur-newprod-extra-add"
              onClick={function () {
                setForm(function (x) {
                  return Object.assign({}, x, { extraUnits: (x.extraUnits || []).concat([{ name: "", factor: "", sellPrice: "", cost: "" }]) });
                });
              }}
            >
              + Add Unit
            </button>
          </div>

          {normalizeProductType(form.type) === "raw_material" ? (
            <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
              {RAW_MATERIAL_PRICE_COST_HINT}
            </div>
          ) : null}

          {tipBanner ? (
            <div className="erp-pur-newprod-banner" style={{ background: "#e0f2fe", borderColor: "#7dd3fc", color: "#0369a1" }}>
              {tipBanner}
            </div>
          ) : null}

          {form.cost && form.price ? (
            <div className="erp-pur-newprod-profit">
              <span>Profit/unit: <strong>{getCurrencySymbol()} {fmtNum((parseFloat(form.price) || 0) - (parseFloat(form.cost) || 0))}</strong></span>
              <span>Margin: <strong>{(parseFloat(form.price) || 0) > 0 ? Math.round(((parseFloat(form.price) || 0) - (parseFloat(form.cost) || 0)) / (parseFloat(form.price) || 1) * 100) : 0}%</strong></span>
            </div>
          ) : null}

          <div className="erp-pur-newprod-desc">
            <label className="erp-pur-newprod-lbl" htmlFor="newprod-desc">Description / Notes (optional)</label>
            <textarea
              id="newprod-desc"
              className="erp-pur-newprod-textarea"
              value={form.description || ""}
              onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }}
              rows={2}
              placeholder="Product specs, features, notes..."
            />
          </div>

          {profile.name === "Jewelry & Watches" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Input label="Weight (grams)" type="number" value={form.weightGrams || ""} onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { weightGrams: e.target.value }); }); }} placeholder="e.g. 5.25" />
              <Input label="Making Charge" type="number" value={form.makingCharge || ""} onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { makingCharge: e.target.value }); }); }} placeholder="e.g. 500" />
            </div>
          ) : null}

          {profile.modules && profile.modules.expiry ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Input label="Expiry Date" type="date" value={form.expiryDate || ""} onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { expiryDate: e.target.value }); }); }} />
              <Input label="Batch / Lot Number (optional)" value={form.batchNo || ""} onChange={function (e) { setForm(function (x) { return Object.assign({}, x, { batchNo: e.target.value }); }); }} placeholder="e.g. BATCH-2025-001" />
            </div>
          ) : null}

          <div className="erp-pur-newprod-actions">
            <Btn id="newprod-save-btn" className="erp-btn" col="cyan" onClick={function () { runSave(false); }} disabled={saveDisabled}>Save Product</Btn>
            {showSaveAndAddAnother ? (
              <Btn className="erp-btn" col="blue" onClick={function () { runSave(true); }} disabled={saveDisabled}>Save + Add Another</Btn>
            ) : null}
            <Btn className="erp-btn" col="gray" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
