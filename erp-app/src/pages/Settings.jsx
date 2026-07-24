import React, { useState, useEffect, useRef } from "react";
import {
  CURATED_COUNTRIES,
} from "../config/countryLanguageData.js";
import { getCountryMeta, getPrimaryCountryForCurrency, APP_CURRENCY_OPTIONS } from "../countryMeta";
import { mergeTaxesOnCountryChange, normalizeTaxList } from "../tax/countryTaxMeta.js";
import { validateSnapshotIntegrity, validateSnapshotIntegrityFull } from "../accounting/financialSnapshot.js";
import { SnapshotIntegrityBadge } from "../ui/SnapshotIntegrityBadge.jsx";
import { tcIsDevEnv } from "../utils/clientElectronGuard.js";
import {
  computeRawMaterialPricingBackfillPlan,
  applyRawMaterialPricingPlanToProducts,
} from "../utils/rawMaterialPricingBackfill.js";
import { ROLE_ADMIN, ROLE_LABELS, CASHIER_ACCESS_SUMMARY, normalizeRole } from "../security/rbac.js";
import { COMPUTER_SHOP_EDITION, validateJsonBackupPayload } from "../productionConfig.js";
import {
  isFreeItemsEnabled,
  isPosLineCommentsEnabled,
  isRepairsModuleEnabled,
  getMainModuleToggles,
  getStaffModuleToggles,
  getCounterModuleToggles,
  persistMainModuleToggles,
  persistStaffModuleToggles,
  persistCounterModuleToggles,
  MODULE_TOGGLE_DEFS,
  SETTINGS_OPTIONAL_MODULE_IDS,
} from "../utils/featureFlags.js";
import { getToolbarKeys, persistToolbarKeys } from "../utils/toolbarConfig.js";
import { safeStr } from "../utils/syncDataNormalize.js";
import { pushKeysToServer, wipeShopDataOnServer, NETWORK_KV_KEYS } from "../sync/SyncEngine.js";
import { ServerSetup } from "../SetupWizard.jsx";
import {
  CATEGORY_GROUPS,
  readEnabledCategoryGroups,
  getEnabledCategoryGroupsList,
  persistCategoryGroupToggles,
} from "../utils/categoryGroups.js";

var WARRANTY_TEXT = "WARRANTY POLICY\n• Laptops & Desktops: 6 months warranty on hardware defects.\n• Accessories & Peripherals: 1 month replacement warranty.\n• Warranty is void if physically damaged, liquid damaged, or tampered with.\n• Warranty covers manufacturer defects only, not user damage.\n• Please retain this invoice as proof of purchase for warranty claims.";

/** Activity Log panel — kept separate so the tab body stays readable. */
var SettingsActivityPanel = function (props) {
  var S = props.S;
  var Card = props.Card;
  var all = S.get("tc3_auditLog", []) || [];
  if (!Array.isArray(all)) all = [];
  var total = all.length;
  var rows = all.slice(0, 80);

  return (
    <div className="erp-act-page">
      <div className="erp-act-wrap">
        <Card className="erp-act-card">
          <div className="erp-act-brand">
            <div className="erp-act-brand-ico" aria-hidden="true">📋</div>
            <div className="erp-act-brand-text">
              <div className="erp-act-title">Activity Log</div>
              <div className="erp-act-sub">Login, sales, returns, edits and settings</div>
            </div>
            <span className="erp-act-count">
              {Math.min(total, 80) + (total > 80 ? "+" : "") + " recent"}
            </span>
          </div>
          {!rows.length ? (
            <div className="erp-act-empty">No activity yet. User actions will appear here.</div>
          ) : (
            <div className="erp-act-body">
              <div className="erp-act-table-wrap">
                <table className="erp-act-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(function (r, idx) {
                      return (
                        <tr key={r.id || ("act-" + idx)}>
                          <td className="erp-act-when">{r.timestamp || r.date || "—"}</td>
                          <td>
                            <span className="erp-act-user">{r.user || "Unknown"}</span>
                            <span className="erp-act-role">{ROLE_LABELS[normalizeRole(r.role)] || "User"}</span>
                          </td>
                          <td className="erp-act-action">{r.action || "Action"}</td>
                          <td className="erp-act-detail">
                            {r.reference || "—"}
                            {r.terminal ? <span className="erp-act-term"> · {r.terminal}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

var Settings = function (props) {
  var state = props.state;
  var setState = props.setState;
  var licenseInfo = props.licenseInfo || null;
  var onActivate = props.onActivate || null;
  var onLicenseRefresh = props.onLicenseRefresh || null;
  var wizardUi = props.wizardUi === true;
  var onWizardBack = props.onWizardBack;
  /* Network config — passed down from App via systemConfig prop */
  var systemConfig    = props.systemConfig || { role: 'standalone', apiUrl: '' };
  var isNetworkServer = systemConfig.role === 'network_server';
  var isNetworkClient = systemConfig.role === 'network_client';
  var clientConnStatus = props.clientConnStatus || "unknown";
  var isNetworkMode   = isNetworkServer || isNetworkClient;
  var S = props.S;
  var C = props.C;
  var today = props.today;
  var exportSupportBundle = typeof props.exportSupportBundle === "function" ? props.exportSupportBundle : null;
  var downloadSupportBundleJson = typeof props.downloadSupportBundleJson === "function" ? props.downloadSupportBundleJson : null;
  var glDeveloperToolsSettings = props.glDeveloperTools === true;
  var uid = props.uid;
  var addAudit = typeof props.addAudit === "function" ? props.addAudit : function () {};
  var showAlert = props.showAlert;
  var showConfirm = props.showConfirm;
  var pwMatchesAsync = props.pwMatchesAsync;
  var hashPw = props.hashPw;
  var setLoginPassword = props.setLoginPassword;
  var getCurrencySymbol = props.getCurrencySymbol;
  var updateCurrencySymbol = props.updateCurrencySymbol;
  var fmtNum = props.fmtNum;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var validateCoreStartupIdentity = props.validateCoreStartupIdentity;
  var getCoreStartupIdentityAlertMessage = props.getCoreStartupIdentityAlertMessage;
  var getBusinessProfile = props.getBusinessProfile;
  var businessType = props.businessType || S.get("tc3_businessType", "tech") || "tech";
  var setBusinessType = props.setBusinessType;
  var BUSINESS_PROFILES = props.BUSINESS_PROFILES || {};
  var setActive = props.setActive;
  var INDUSTRY_ORDER = ["tech", "grocery", "fashion", "hardware", "glass", "pharmacy", "jewelry", "automotive", "agriculture", "restaurant", "general"];
  var buildCloudSyncPayload = props.buildCloudSyncPayload;
  var cloudSyncBump = props.cloudSyncBump || 0;
  var currentUser = props.currentUser || null;
  var canManageUsers = props.canManageUsers === true;
  var _idbCache = props._idbCache;
  var _idbWrite = props._idbWrite;
  var applyBackupRestore = typeof props.applyBackupRestore === "function" ? props.applyBackupRestore : null;
  var wipeAllDataForReset = typeof props.wipeAllDataForReset === "function" ? props.wipeAllDataForReset : null;
  var verifyAdminPassword = typeof props.verifyAdminPassword === "function" ? props.verifyAdminPassword : null;
  var confirmAdminPassword = function (input) {
    var pw = String(input || "").trim();
    if (!pw) return Promise.resolve(false);
    var tryUsers = [];
    if (currentUser && currentUser.passwordHash) tryUsers.push(currentUser.passwordHash);
    var chain = Promise.resolve(false);
    if (verifyAdminPassword) {
      chain = verifyAdminPassword(pw);
    } else {
      chain = pwMatchesAsync(pw, S.get("tc3_apppass", ""));
    }
    return chain.then(function (ok) {
      if (ok) return true;
      var tryNext = function (i) {
        if (i >= tryUsers.length) return Promise.resolve(false);
        return pwMatchesAsync(pw, tryUsers[i]).then(function (hit) {
          if (hit) return true;
          return tryNext(i + 1);
        });
      };
      return tryNext(0);
    });
  };
  var AboutTab = props.AboutTab;
  var InvoiceThermal = props.InvoiceThermal;
  var InvoiceA4 = props.InvoiceA4;
  var Input = props.Input;
  var Btn = props.Btn;
  /* Stable Card/CardTitle identity — defining these inside Settings remounted all
     inputs on every keystroke (cursor disappeared after each character). */
  var setCardDepsRef = useRef({ CardRaw: props.Card, CardTitleRaw: props.CardTitle, wizardUi: wizardUi });
  setCardDepsRef.current = { CardRaw: props.Card, CardTitleRaw: props.CardTitle, wizardUi: wizardUi };
  var setCardUiRef = useRef(null);
  if (!setCardUiRef.current) {
    setCardUiRef.current = {
      Card: function SettingsCard(p) {
        var deps = setCardDepsRef.current;
        var cls = ["erp-set-card", p && p.className].filter(Boolean).join(" ");
        var pad = p && p.pad !== undefined ? p.pad : (deps.wizardUi ? undefined : 12);
        return React.createElement(deps.CardRaw, Object.assign({}, p, { className: cls, pad: pad }));
      },
      CardTitle: function SettingsCardTitle(p) {
        var deps = setCardDepsRef.current;
        return React.createElement("div", { className: "erp-set-card-title" }, React.createElement(deps.CardTitleRaw, p));
      }
    };
  }
  var Card = setCardUiRef.current.Card;
  var CardTitle = setCardUiRef.current.CardTitle;
  var Sel = props.Sel;
  var Modal = props.Modal;
  var StatCard = props.StatCard;
  var [stab, setStab] = useState(function () {
    var sc = props.systemConfig || {};
    return sc.role === "network_client" ? "features" : "profile";
  });
  var [supBndFrom, setSupBndFrom] = useState(today().slice(0, 7) + "-01");
  var [supBndTo, setSupBndTo] = useState(today());
  var [supBndAnon, setSupBndAnon] = useState(true);
  var [supBndReplay, setSupBndReplay] = useState(false);
  var [supBndPid, setSupBndPid] = useState("");
  var [showSupportPinResetHint, setShowSupportPinResetHint] = useState(false);
  var [rmBfPreview, setRmBfPreview] = useState(null);
  var [showAppPasswordResetHint, setShowAppPasswordResetHint] = useState(false);
  var [pendingIndustry, setPendingIndustry] = useState(businessType);
  var [industryPwOpen, setIndustryPwOpen] = useState(false);
  var [industryPw, setIndustryPw] = useState("");
  var [industryPwMsg, setIndustryPwMsg] = useState("");
  var [invFmt, setInvFmt] = useState("a4a5"); /* A4/A5 vs Thermal tab in Invoice Design */
  var [countrySearchOpen, setCountrySearchOpen] = useState(false);
  var [countrySearchQ, setCountrySearchQ] = useState("");
  var countryPickerWrapRef = useRef(null);
  var taxModeTooltipRef = useRef(null);
  var [taxModeTooltipOpen, setTaxModeTooltipOpen] = useState(false);
  var [taxCustomName, setTaxCustomName] = useState("");
  var [taxCustomRate, setTaxCustomRate] = useState("");
  var [coreStartupErr, setCoreStartupErr] = useState({ shopName: false, phone: false, address: false });
  var [f, setF] = useState(Object.assign({}, state.settings, {
    capitalInvested: state.settings.capitalInvested || 0,
    backupFolder: state.settings.backupFolder || "",
    warrantyEnabled: state.settings.warrantyEnabled !== false,
    warrantyText: state.settings.warrantyText || WARRANTY_TEXT,
    labelWidth: state.settings.labelWidth || "60mm",
    labelHeight: state.settings.labelHeight || "auto",
    barcodeHeight: state.settings.barcodeHeight || 30,
    barcodeWidthMm: state.settings.barcodeWidthMm || "100%",
    barcodeFontSize: state.settings.barcodeFontSize || 9,
    barcodePriceFontSize: state.settings.barcodePriceFontSize || 11,
    barcodeBarWidth: state.settings.barcodeBarWidth || "1.2",
    barcodeShowCost: state.settings.barcodeShowCost !== false,
    barcodeShowPrice: state.settings.barcodeShowPrice !== false,
    barcodeShowShopName: state.settings.barcodeShowShopName !== false,
    labelCopies: state.settings.labelCopies || 1,
    labelBorder: state.settings.labelBorder || "solid",
    labelShopColor: state.settings.labelShopColor || "#1e3a5f",
    labelPriceColor: state.settings.labelPriceColor || "#000000",
    labelBgColor: state.settings.labelBgColor || "#ffffff",
    labelTextAlign: state.settings.labelTextAlign || "center",
    labelFooterText: state.settings.labelFooterText || "",
    labelShowBarcode: state.settings.labelShowBarcode !== false,
    labelShowProductCode: state.settings.labelShowProductCode !== false,
    barcodeUseProductId: state.settings.barcodeUseProductId === true,
    invoiceAccentColor: state.settings.invoiceAccentColor || "#0284c7",
    invoiceDefaultSize: state.settings.invoiceDefaultSize || "a4",
    invoiceThermalSize: state.settings.invoiceThermalSize || "thermal80",
    invoiceLogo: state.settings.invoiceLogo || "",
    invoiceLogoSize: state.settings.invoiceLogoSize || 56,
    invoiceLogoAlign: state.settings.invoiceLogoAlign || "left",
    invoicePdfFolder: state.settings.invoicePdfFolder || "",
    shopCountry: state.settings.shopCountry || "",
    defaultInvoiceLang: state.settings.defaultInvoiceLang || "en",
    optionalInvoiceLangs: [],
    customInvoiceLangs: Array.isArray(state.settings.customInvoiceLangs) ? state.settings.customInvoiceLangs : [],
    taxEnabled: state.settings.taxEnabled === true,
    taxMode: state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive",
    taxApplyBase: state.settings.taxApplyBase === "before_discount" ? "before_discount" : "after_discount",
    selectedTaxes: normalizeTaxList(state.settings.selectedTaxes || []),
    lockedUntilDate: state.settings.lockedUntilDate || "",
    strictPeriodLock: state.settings.strictPeriodLock === true,
    inventoryCostingMethod: state.settings.inventoryCostingMethod === "fifo" ? "fifo" : "wac",
    purchaseReturnCostMode: state.settings.purchaseReturnCostMode === "original_cost" ? "original_cost" : "current_wac",
    preventNegativeStock: state.settings.preventNegativeStock !== false,
    allowCostFallback: state.settings.allowCostFallback === true,
    glVatPostingEnabled: state.settings.glVatPostingEnabled !== false,
    freeItemsEnabled: isFreeItemsEnabled(state.settings, businessType, isNetworkClient ? "network_client" : systemConfig.role),
    posLineCommentsEnabled: isPosLineCommentsEnabled(state.settings, businessType, isNetworkClient ? "network_client" : systemConfig.role),
    repairsModuleEnabled: isRepairsModuleEnabled(state.settings, businessType, getBusinessProfile(), isNetworkClient ? "network_client" : systemConfig.role),
    mainModuleToggles: getMainModuleToggles(state.settings, businessType, getBusinessProfile()),
    staffModuleToggles: getStaffModuleToggles(state.settings, businessType, getBusinessProfile()),
    counterModuleToggles: getCounterModuleToggles(state.settings, businessType, getBusinessProfile()),
    moduleToggles: getMainModuleToggles(state.settings, businessType, getBusinessProfile()),
    toolbarKeys: getToolbarKeys(state.settings),
    enabledCategoryGroups: readEnabledCategoryGroups(state.settings),
  }));
  var [newAsset, setNewAsset] = useState(null);
  var [editAsset, setEditAsset] = useState(null);
  var [assetActionModal, setAssetActionModal] = useState(null);
  var [assetPw, setAssetPw] = useState("");
  var [assetReason, setAssetReason] = useState("");
  var [assetPwMsg, setAssetPwMsg] = useState("");
  var [previewInv, setPreviewInv] = useState(null);
  var [snapValIdx, setSnapValIdx] = useState(0);
  var [snapValBusy, setSnapValBusy] = useState(false);
  var [snapValResult, setSnapValResult] = useState(null);
  var [pwOld, setPwOld] = useState("");
  var [adminNameEdit, setAdminNameEdit] = useState(safeStr(S.get("tc3_admin_name", "")));
  var [adminNameMsg, setAdminNameMsg] = useState(null);
  var [pwNew, setPwNew] = useState("");
  var [pwNew2, setPwNew2] = useState("");
  var [pwMsg, setPwMsg] = useState(null);
  var [resetStep, setResetStep] = useState(0);
  var [resetPw, setResetPw] = useState("");
  var [resetMsg, setResetMsg] = useState(null);
  var [bakMsg, setBakMsg] = useState(null);
  var [capForm, setCapForm] = useState({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
  var [capEditModal, setCapEditModal] = useState(null);
  var [capEditForm, setCapEditForm] = useState(null);
  var [capActionPw, setCapActionPw] = useState("");
  var [capActionReason, setCapActionReason] = useState("");
  var [capActionMsg, setCapActionMsg] = useState("");
  var [capDeleteTarget, setCapDeleteTarget] = useState(null);
  /* Cloud sync states — must be at component top level, not inside IIFE */
  var [cloudEmail,   setCloudEmail]   = useState("");
  var [cloudPass,    setCloudPass]    = useState("");
  var [cloudMsg,     setCloudMsg]     = useState(null);
  var [cloudLoading, setCloudLoading] = useState(false);
  var [licSyncBusy, setLicSyncBusy] = useState(false);
  var [dataPushBusy, setDataPushBusy] = useState(false);
  var [enableMultiPcOpen, setEnableMultiPcOpen] = useState(false);
  var [switchStandaloneBusy, setSwitchStandaloneBusy] = useState(false);
  var [clearMysqlOnStandalone, setClearMysqlOnStandalone] = useState(false);
  var [netModePwOpen, setNetModePwOpen] = useState(false);
  var [netModePw, setNetModePw] = useState("");
  var [netModePwMsg, setNetModePwMsg] = useState("");
  var [netModePwBusy, setNetModePwBusy] = useState(false);
  var netModeAuthResolverRef = useRef(null);
  var [clientSlotsBusy, setClientSlotsBusy] = useState(false);
  var [clientSlots, setClientSlots] = useState({ max_clients: 0, connected: 0, clients: [] });
  var [trustedDevices, setTrustedDevices] = useState([]);
  var [trustedDevicesBusy, setTrustedDevicesBusy] = useState(false);
  var [deviceCredStatus, setDeviceCredStatus] = useState(null);
  var [deviceRegBusy, setDeviceRegBusy] = useState(false);
  var [clientLabelDrafts, setClientLabelDrafts] = useState({});
  var [clientLabelFlashDk, setClientLabelFlashDk] = useState(null);
  var [clientLabelAdjustedHintDk, setClientLabelAdjustedHintDk] = useState(null);
  var [clientNetUrl, setClientNetUrl] = useState("");
  var [clientNetKey, setClientNetKey] = useState("");
  var [revealedServerKey, setRevealedServerKey] = useState("");
  var [serverKeyBusy, setServerKeyBusy] = useState(false);
  var [clientNetBusy, setClientNetBusy] = useState(false);
  var [clientNetErr, setClientNetErr] = useState(null);
  var [clientNetStep, setClientNetStep] = useState("");
  var [users, setUsers] = useState(function () {
    var list = S.get("tc3_users", []);
    return Array.isArray(list) ? list : [];
  });
  var [newUserName, setNewUserName] = useState("");
  var [newUserUsername, setNewUserUsername] = useState("");
  var [newUserRole, setNewUserRole] = useState("cashier");
  var [newUserPassword, setNewUserPassword] = useState("");
  var [userMsg, setUserMsg] = useState(null);
  var [userEditModal, setUserEditModal] = useState(null); /* { mode: "name"|"password", user } */
  var [userEditName, setUserEditName] = useState("");
  var [userEditPw, setUserEditPw] = useState("");
  var [userEditPw2, setUserEditPw2] = useState("");
  var [userEditErr, setUserEditErr] = useState("");
  var [userEditBusy, setUserEditBusy] = useState(false);
  var isRestaurantBusiness = businessType === "restaurant";
  var normalizeRestaurantTableName = function (name) {
    return String(name || "").replace(/\s+/g, " ").trim();
  };
  var nextRestaurantStableId = function (used) {
    var idx = 1;
    while (used["tbl_" + idx]) idx += 1;
    return "tbl_" + idx;
  };
  var createDefaultRestaurantTables = function () {
    var list = [];
    for (var i = 1; i <= 6; i += 1) list.push({ id: "tbl_" + i, name: "T" + i, status: "free" });
    return list;
  };
  var normalizeRestaurantTableCollection = function (tables) {
    var raw = Array.isArray(tables) ? tables.slice() : [];
    if (!raw.length) return createDefaultRestaurantTables();
    return raw.map(function (t, idx) {
      if (!t) return { id: "tbl_" + (idx + 1), name: "T" + (idx + 1), status: "free" };
      var fallbackName = typeof t === "string" ? t : (t.name || t.id || ("T" + (idx + 1)));
      var fallbackId = typeof t === "string" ? t : (t.id || fallbackName || ("tbl_" + (idx + 1)));
      var stableId = String(fallbackId).indexOf("tbl_") === 0 ? String(fallbackId) : ("tbl_" + (idx + 1));
      return {
        id: stableId,
        name: normalizeRestaurantTableName(fallbackName) || ("T" + (idx + 1)),
        status: t.status === "occupied" || t.status === "pending" ? t.status : "free",
      };
    });
  };
  var [restaurantDefaultOrderType, setRestaurantDefaultOrderType] = useState(function () {
    var saved = S.get("tc3_restaurant_default_order_type", "takeaway");
    return saved === "dine-in" || saved === "delivery" ? saved : "takeaway";
  });
  var [restaurantSetupTables, setRestaurantSetupTables] = useState(function () {
    return normalizeRestaurantTableCollection(S.get("tc3_restaurant_tables", null));
  });
  var [newRestaurantTableName, setNewRestaurantTableName] = useState("");
  var [restaurantSetupMsg, setRestaurantSetupMsg] = useState(null);

  var normalizeUsername = function (v) { return String(v || "").trim().toLowerCase(); };
  var saveUsers = function (nextUsers, msg) {
    var ts = new Date().toISOString();
    var stamped = (nextUsers || []).map(function (u) {
      if (!u || typeof u !== "object") return u;
      return Object.assign({}, u, { updatedAt: u.updatedAt || ts });
    });
    S.set("tc3_users", stamped);
    setUsers(stamped);
    if (msg) setUserMsg(msg);
  };

  var createUser = function () {
    if (!canManageUsers) { setUserMsg({ type: "error", text: "Only admin can manage users." }); return; }
    var name = String(newUserName || "").trim();
    var uname = normalizeUsername(newUserUsername);
    var role = normalizeRole(newUserRole);
    if (!name || name.length < 2) { setUserMsg({ type: "error", text: "Enter full name (min 2 chars)." }); return; }
    if (!uname || uname.length < 3) { setUserMsg({ type: "error", text: "Username must be at least 3 chars." }); return; }
    if (!newUserPassword || newUserPassword.length < 4) { setUserMsg({ type: "error", text: "Password must be at least 4 chars." }); return; }
    if (users.some(function (u) { return normalizeUsername(u.username) === uname; })) { setUserMsg({ type: "error", text: "Username already exists." }); return; }
    hashPw(newUserPassword).then(function (hashed) {
      var now = new Date().toISOString();
      var next = users.concat([{
        id: uid(),
        name: name,
        username: uname,
        role: role,
        passwordHash: hashed,
        active: true,
        createdAt: now,
        updatedAt: now,
      }]);
      saveUsers(next, { type: "success", text: "User created." });
      setNewUserName(""); setNewUserUsername(""); setNewUserPassword(""); setNewUserRole("cashier");
    });
  };

  var closeUserEditModal = function () {
    setUserEditModal(null);
    setUserEditName("");
    setUserEditPw("");
    setUserEditPw2("");
    setUserEditErr("");
    setUserEditBusy(false);
  };

  var openEditUserName = function (u) {
    if (!canManageUsers) { setUserMsg({ type: "error", text: "Only admin can edit users." }); return; }
    setUserEditModal({ mode: "name", user: u });
    setUserEditName(u && u.name ? String(u.name) : "");
    setUserEditErr("");
    setUserEditBusy(false);
  };

  var openResetUserPassword = function (u) {
    if (!canManageUsers) { setUserMsg({ type: "error", text: "Only admin can reset passwords." }); return; }
    setUserEditModal({ mode: "password", user: u });
    setUserEditPw("");
    setUserEditPw2("");
    setUserEditErr("");
    setUserEditBusy(false);
  };

  var saveEditedUserName = function () {
    if (!userEditModal || !userEditModal.user) return;
    if (!canManageUsers) { setUserEditErr("Only admin can edit users."); return; }
    var u = userEditModal.user;
    var name = String(userEditName || "").trim();
    if (!name || name.length < 2) { setUserEditErr("Enter full name (min 2 chars)."); return; }
    var next = users.map(function (x) {
      return x.id === u.id
        ? Object.assign({}, x, { name: name, updatedAt: new Date().toISOString() })
        : x;
    });
    saveUsers(next, { type: "success", text: "Name updated for @" + (u.username || "user") + "." });
    if (normalizeUsername(u.username) === "admin" || u.role === ROLE_ADMIN) {
      try { S.set("tc3_admin_name", name); } catch (e) { /* ignore */ }
    }
    closeUserEditModal();
  };

  var saveResetUserPassword = function () {
    if (!userEditModal || !userEditModal.user) return;
    if (!canManageUsers) { setUserEditErr("Only admin can reset passwords."); return; }
    var u = userEditModal.user;
    var p1 = String(userEditPw || "");
    var p2 = String(userEditPw2 || "");
    if (p1.length < 4) { setUserEditErr("Password must be at least 4 characters."); return; }
    if (p1 !== p2) { setUserEditErr("Passwords do not match."); return; }
    if (typeof hashPw !== "function") { setUserEditErr("Password hashing is unavailable."); return; }
    setUserEditBusy(true);
    setUserEditErr("");
    hashPw(p1).then(function (hashed) {
      var next = users.map(function (x) {
        return x.id === u.id
          ? Object.assign({}, x, { passwordHash: hashed, updatedAt: new Date().toISOString() })
          : x;
      });
      saveUsers(next, { type: "success", text: "Password reset for @" + (u.username || u.name || "user") + "." });
      if (typeof setLoginPassword === "function" && (u.role === "admin" || normalizeUsername(u.username) === "admin")) {
        setLoginPassword(hashed, { userId: u.id, username: u.username });
      }
      closeUserEditModal();
    }).catch(function () {
      setUserEditBusy(false);
      setUserEditErr("Could not save password. Try again.");
    });
  };

  var resetUserPassword = function (u) {
    openResetUserPassword(u);
  };

  var removeUser = function (u) {
    if (!canManageUsers) { setUserMsg({ type: "error", text: "Only admin can remove users." }); return; }
    if (normalizeUsername(u.username) === "admin") { setUserMsg({ type: "error", text: "Primary admin cannot be removed." }); return; }
    showConfirm("Remove user " + (u.username || u.name) + "?", function () {
      var next = users.filter(function (x) { return x.id !== u.id; });
      saveUsers(next, { type: "success", text: "User removed." });
    });
  };

  var saveAdminSecuritySettings = function () {
    if (f.adminPin && f.adminPin.length > 0 && f.adminPin.length < 4) {
      showAlert("PIN must be at least 4 digits.");
      return;
    }
    if (adminNameEdit && adminNameEdit.trim().length < 2) {
      showAlert("Administrator name must be at least 2 characters.");
      return;
    }
    if (pwNew || pwOld) {
      var current = S.get("tc3_apppass", "");
      var allowNoOld = false;
      try { allowNoOld = sessionStorage.getItem("tc3_allow_login_pw_reset_without_old") === "1"; } catch (e) {}
      if (!pwNew || pwNew.length < 4) { setPwMsg({ type: "error", text: "New password must be at least 4 characters." }); return; }
      if (pwNew !== pwNew2) { setPwMsg({ type: "error", text: "Passwords do not match." }); return; }
      if (allowNoOld) {
        hashPw(pwNew).then(function (hashed) {
          if (typeof setLoginPassword === "function") {
            setLoginPassword(hashed, { username: "admin" });
          } else {
            S.set("tc3_apppass", hashed);
          }
          try { sessionStorage.removeItem("tc3_allow_login_pw_reset_without_old"); } catch (e2) {}
          setPwOld(""); setPwNew(""); setPwNew2("");
          setShowAppPasswordResetHint(false);
          setPwMsg({ type: "success", text: "Password changed!" });
        });
        return;
      }
      pwMatchesAsync(pwOld, current).then(function (oldOk) {
        if (current && !oldOk) { setPwMsg({ type: "error", text: "Current password incorrect." }); return; }
        hashPw(pwNew).then(function (hashed) {
          if (typeof setLoginPassword === "function") {
            setLoginPassword(hashed, { username: "admin" });
          } else {
            S.set("tc3_apppass", hashed);
          }
          setPwOld(""); setPwNew(""); setPwNew2("");
          setPwMsg({ type: "success", text: "Password changed!" });
        });
      });
      return;
    }
    if (adminNameEdit && adminNameEdit.trim().length >= 2) {
      S.set("tc3_admin_name", adminNameEdit.trim());
    }
    var saveSettingsWithPin = function (pinToSave) {
      var ns = Object.assign({}, state.settings, f, {
        adminPin: pinToSave,
        autoLockEnabled: f.autoLockEnabled !== false,
        autoLockMinutes: f.autoLockMinutes || 10,
        requirePasswordOnLogin: f.requirePasswordOnLogin !== false
      });
      S.set("tc3_settings", ns);
      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      showAlert("Settings updated successfully!");
    };
    var rawPin = f.adminPin || "";
    if (rawPin && (rawPin.startsWith("sha256:") || rawPin.startsWith("pbkdf2:"))) {
      saveSettingsWithPin(rawPin);
    } else if (rawPin && rawPin.length >= 4) {
      hashPw(rawPin).then(function (hashedPin) { saveSettingsWithPin(hashedPin); });
    } else {
      saveSettingsWithPin(rawPin || (state.settings && state.settings.adminPin) || "");
    }
  };

  var toggleRequirePasswordOnLogin = function () {
    var next = f.requirePasswordOnLogin === false;
    setF(function (x) { return Object.assign({}, x, { requirePasswordOnLogin: next }); });
    var ns = Object.assign({}, state.settings, f, { requirePasswordOnLogin: next });
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    setUserMsg({
      type: "success",
      text: next ? "Password will be required on launch." : "Password on launch is off.",
    });
  };

  var saveRestaurantSetup = function (nextType, nextTables, msg) {
    var finalType = nextType === "dine-in" || nextType === "delivery" ? nextType : "takeaway";
    var finalTables = normalizeRestaurantTableCollection(nextTables);
    S.set("tc3_restaurant_default_order_type", finalType);
    S.set("tc3_restaurant_tables", finalTables);
    setRestaurantDefaultOrderType(finalType);
    setRestaurantSetupTables(finalTables);
    if (msg) setRestaurantSetupMsg({ type: "success", text: msg });
  };
  var addRestaurantSetupTable = function () {
    var cleanName = normalizeRestaurantTableName(newRestaurantTableName);
    if (!cleanName) {
      setRestaurantSetupMsg({ type: "error", text: "Enter a table name." });
      return;
    }
    if (restaurantSetupTables.some(function (t) { return normalizeRestaurantTableName(t.name).toLowerCase() === cleanName.toLowerCase(); })) {
      setRestaurantSetupMsg({ type: "error", text: "Table name already exists." });
      return;
    }
    var used = {};
    restaurantSetupTables.forEach(function (t) { used[t.id] = 1; });
    var stableId = nextRestaurantStableId(used);
    saveRestaurantSetup(restaurantDefaultOrderType, restaurantSetupTables.concat([{ id: stableId, name: cleanName, status: "free" }]), "Restaurant setup updated.");
    setNewRestaurantTableName("");
  };
  var renameRestaurantSetupTable = function (tableId, nextName) {
    var cleanName = normalizeRestaurantTableName(nextName);
    var currentTable = restaurantSetupTables.find(function (t) { return t.id === tableId; });
    if (!currentTable) return;
    if (!cleanName || cleanName === normalizeRestaurantTableName(currentTable.name)) return;
    if (restaurantSetupTables.some(function (t) { return t.id !== tableId && normalizeRestaurantTableName(t.name).toLowerCase() === cleanName.toLowerCase(); })) {
      setRestaurantSetupMsg({ type: "error", text: "Table name already exists." });
      return;
    }
    saveRestaurantSetup(restaurantDefaultOrderType, restaurantSetupTables.map(function (t) {
      return t.id === tableId ? Object.assign({}, t, { name: cleanName }) : t;
    }), "Restaurant setup updated.");
  };
  var deleteRestaurantSetupTable = function (tableId) {
    var table = restaurantSetupTables.find(function (t) { return t.id === tableId; });
    if (!table) return;
    if (table.status !== "free") {
      setRestaurantSetupMsg({ type: "error", text: "Only free tables can be deleted." });
      return;
    }
    saveRestaurantSetup(restaurantDefaultOrderType, restaurantSetupTables.filter(function (t) { return t.id !== tableId; }), "Restaurant setup updated.");
  };

  useEffect(function () {
    if (!isNetworkClient) return;
    setClientNetUrl((systemConfig.apiUrl || "").replace(/\/?$/, ""));
    /* apiKey is stripped from load — keep typed key or leave blank for re-entry. */
    setClientNetKey(systemConfig.apiKey || clientNetKey || "");
  }, [isNetworkClient, systemConfig.apiUrl, systemConfig.apiKey]);

  var revealServerSecurityKey = function () {
    var api = window.electronAPI;
    if (!api || !api.revealNetworkApiKey) {
      showAlert("Cannot reveal key in this environment.");
      return Promise.resolve("");
    }
    setServerKeyBusy(true);
    return api.revealNetworkApiKey().then(function (r) {
      setServerKeyBusy(false);
      if (!r || !r.ok) {
        showAlert((r && r.message) || "Admin session required to reveal the security key.");
        return "";
      }
      var k = String(r.apiKey || "");
      setRevealedServerKey(k);
      return k;
    }).catch(function () {
      setServerKeyBusy(false);
      showAlert("Failed to reveal security key.");
      return "";
    });
  };

  var refreshConnectedClients = function () {
    var api = window.electronAPI;
    if (!isNetworkServer || !api || !api.getConnectedClients) return;
    setClientSlotsBusy(true);
    api.getConnectedClients().then(function (r) {
      if (r && r.ok) {
        setClientSlots({ max_clients: r.max_clients || 0, connected: r.connected || 0, clients: r.clients || [] });
        setClientLabelDrafts({});
      }
    }).finally(function () { setClientSlotsBusy(false); });
  };

  useEffect(function () {
    if (stab === "network" && isNetworkServer) refreshConnectedClients();
  }, [stab, isNetworkServer]);

  function refreshTrustedDevices() {
    var api = window.electronAPI;
    if (!api || !api.manageDevices || !isNetworkServer) return;
    setTrustedDevicesBusy(true);
    api.manageDevices({ action: "list" }).then(function (r) {
      if (r && r.ok && r.data && r.data.devices) setTrustedDevices(r.data.devices);
    }).finally(function () { setTrustedDevicesBusy(false); });
  }

  useEffect(function () {
    if (stab === "network" && isNetworkServer) refreshTrustedDevices();
  }, [stab, isNetworkServer]);

  useEffect(function () {
    if (!isNetworkClient) return;
    var api = window.electronAPI;
    if (!api || !api.loadDeviceCredentials) return;
    api.loadDeviceCredentials().then(function (r) {
      if (r && r.credentials) setDeviceCredStatus(r.credentials.status || "none");
      else setDeviceCredStatus("none");
    });
  }, [isNetworkClient, stab]);

  /* Background sync (App.jsx) can succeed after a failed “Sync Now” — clear stale error banner */
  useEffect(function () {
    if (cloudSyncBump > 0) {
      setCloudMsg(function (m) { return m && m.type === "error" ? null : m; });
    }
  }, [cloudSyncBump]);

  var ALL_KEYS = ["tc3_settings", "tc3_products", "tc3_customers", "tc3_suppliers", "tc3_others", "tc3_sales", "tc3_purchases", "tc3_expenses", "tc3_repairs", "tc3_assets", "tc3_damageLog", "tc3_productLog", "tc3_repairDeleteLog", "tc3_capLedger", "tc3_capLog", "tc3_manualPayables", "tc3_manualReceivables", "tc3_profitDist", "tc3_assetLog", "tc3_openBal", "tc3_auditLog", "tc3_gl_audit", "tc3_financial_mutation_log", "tc3_salesReturns", "tc3_purchaseReturns", "tc3_quotations", "tc3_cheques", "tc3_raw_material_counts", "tc3_raw_material_usage", "tc3_labelDesigns", "tc3_journal_lines", "tc3_gl_accounts", "tc3_gl_mode", "tc3_journal_hash", "tc3_inventory_layers", "tc3_financial_snapshots", "tc3_stock_movements", "tc3_inv_reconciliation", "tc3_codRecords", "tc3_codPartners", "tc3_codProfitSettings", "tc3_codWithdrawals", "tc3_invoice_edit_locks", "tc3_users", "tc3_businessType", "tc3_apppass", "tc3_admin_name", "tc3_startup_wizard_done"];

  var buildBackupObject = function () {
    var backup = { version: 2, timestamp: new Date().toISOString(), shopName: state.settings.shopName || "Techon", data: {} };
    ALL_KEYS.forEach(function (k) { var v = _idbCache[k]; if (v !== undefined) { backup.data[k] = v; } });
    return backup;
  };

  var downloadJson = function (backup, filename) {
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };

  var doManualBackup = function () {
    try {
      var backup = buildBackupObject();
      var d = new Date().toISOString().slice(0, 10);
      downloadJson(backup, "techon-erp-backup-" + d + ".json");
      S.set("tc3_last_manual_backup", new Date().toISOString());
      setBakMsg({ type: "success", text: "✅ Backup downloaded: techon-erp-backup-" + d + ".json" });
    } catch (e) { setBakMsg({ type: "error", text: "Backup failed: " + e.message }); }
  };

  var doSafetyBackup = function () {
    try {
      var backup = buildBackupObject();
      var ts = new Date().toISOString().split(":").join("-").split(".").join("-").slice(0, 19);
      downloadJson(backup, "techon-safety-before-restore-" + ts + ".json");
      return true;
    } catch (e) { return false; }
  };

  /* Network role changes need a main-process admin session (UI login can exist without it). */
  var closeNetModePwModal = function (result) {
    var resolve = netModeAuthResolverRef.current;
    netModeAuthResolverRef.current = null;
    setNetModePwOpen(false);
    setNetModePw("");
    setNetModePwMsg("");
    setNetModePwBusy(false);
    if (typeof resolve === "function") resolve(result || { ok: false, message: "Cancelled — admin password required." });
  };

  var submitNetModePw = function () {
    var api = window.electronAPI;
    var pw = String(netModePw || "").trim();
    if (!pw) {
      setNetModePwMsg("Enter your admin password.");
      return;
    }
    setNetModePwBusy(true);
    setNetModePwMsg("");
    if (!api || typeof api.loginSession !== "function") {
      closeNetModePwModal({ ok: false, message: "Sign in required." });
      return;
    }
    /* Same password check as Settings unlock (IndexedDB), then bind main-process session. */
    confirmAdminPassword(pw).then(function (okLocal) {
      if (!okLocal) {
        setNetModePwBusy(false);
        setNetModePwMsg("Incorrect password.");
        return null;
      }
      var st = (S && S.get) ? (S.get("tc3_settings", {}) || {}) : {};
      var usersList = (S && S.get) ? S.get("tc3_users", []) : [];
      if (!Array.isArray(usersList)) usersList = [];
      var actor = currentUser || {};
      return api.loginSession({
        username: actor.username || "admin",
        name: actor.name || actor.username || "Admin",
        userId: actor.id || "",
        password: pw,
        users: usersList,
        apppass: (S && S.get) ? (S.get("tc3_apppass", "") || "") : "",
        mainAdminPassHash: st.mainAdminPassHash || "",
      });
    }).then(function (lr) {
      if (lr == null) return;
      if (lr && lr.ok && String(lr.role || "").toLowerCase() === "admin") {
        closeNetModePwModal({ ok: true });
        return;
      }
      setNetModePwBusy(false);
      setNetModePwMsg((lr && lr.message) || (lr && lr.ok ? "Admin account required." : "Incorrect login password."));
    }).catch(function (err) {
      setNetModePwBusy(false);
      setNetModePwMsg(err && err.message ? err.message : String(err));
    });
  };

  var ensureAdminIpcSession = function () {
    var api = window.electronAPI;
    if (!api) return Promise.resolve({ ok: true });
    var hasAdmin = function (r) {
      return !!(r && r.ok && r.session && String(r.session.role || "").toLowerCase() === "admin");
    };
    if (typeof api.getSession !== "function") return Promise.resolve({ ok: true });
    return api.getSession().then(function (r) {
      if (hasAdmin(r)) return { ok: true };
      return new Promise(function (resolve) {
        netModeAuthResolverRef.current = resolve;
        setNetModePw("");
        setNetModePwMsg("");
        setNetModePwBusy(false);
        setNetModePwOpen(true);
      });
    });
  };

  var doSwitchToStandalone = function (opts) {
    if (switchStandaloneBusy) return;
    opts = opts || {};
    var api = window.electronAPI;
    if (!api || !api.saveNetworkConfig) {
      showAlert("Network setup is not available in this build.");
      return;
    }
    var runSwitch = function () {
      setSwitchStandaloneBusy(true);
      var wipeNote = "";
      ensureAdminIpcSession().then(function (auth) {
        if (!auth || !auth.ok) {
          throw new Error((auth && auth.message) || "Sign in required.");
        }
        var chain = Promise.resolve();
        if (clearMysqlOnStandalone && isNetworkServer && systemConfig.apiUrl) {
          chain = wipeShopDataOnServer({ authConfig: systemConfig }).then(function (w) {
            if (w && w.ok === false) {
              wipeNote = " MySQL clear skipped (" + (w.message || "timed out") + "). Local shop data is still kept.";
            }
          }).catch(function (err) {
            wipeNote = " MySQL clear skipped (" + (err && err.message ? err.message : String(err)) + "). Local shop data is still kept.";
          });
        }
        return chain.then(function () {
          return api.saveNetworkConfig({
            role: "standalone",
            apiUrl: "",
            apiKey: "",
            wizardComplete: true,
          }).then(function (r) {
            if (r && r.ok === false) throw new Error(r.message || "Could not save standalone mode");
            try { window.__TC_ALLOW_UNLOAD__ = true; } catch (_eA) { /* ignore */ }
            showAlert("Switched to Standalone." + wipeNote + " Reloading…", function () {
              try { window.location.reload(); } catch (_eR) { /* ignore */ }
            });
          });
        });
      }).catch(function (err) {
        setSwitchStandaloneBusy(false);
        showAlert("Switch failed: " + (err && err.message ? err.message : String(err)));
      });
    };
    if (opts.skipConfirm) {
      runSwitch();
      return;
    }
    var mysqlLine = isNetworkServer
      ? (clearMysqlOnStandalone ? "• Techon MySQL shop data on this PC will be cleared\n" : "• MySQL shop data is left as-is (optional)\n")
      : "";
    showConfirm(
      "Switch this PC to Standalone?\n\n" +
      "• All shop data on this PC is kept (IndexedDB)\n" +
      "• Multi-PC sync stops\n" +
      "• XAMPP is NOT uninstalled\n" +
      mysqlLine +
      "\nContinue?",
      runSwitch
    );
  };

  var doEnableMultiPcComplete = function (cfg) {
    setEnableMultiPcOpen(false);
    var api = window.electronAPI;
    var finish = function () {
      try { window.__TC_ALLOW_UNLOAD__ = true; } catch (_eA) { /* ignore */ }
      showAlert("Multi-PC enabled on this Main PC. Reloading…", function () {
        try { window.location.reload(); } catch (_eR) { /* ignore */ }
      });
    };
    if (api && api.saveNetworkConfig) {
      ensureAdminIpcSession().then(function (auth) {
        if (!auth || !auth.ok) {
          showAlert("Could not enable Multi-PC: " + ((auth && auth.message) || "Sign in required."));
          return;
        }
        return api.saveNetworkConfig({
          role: "network_server",
          apiUrl: (cfg && cfg.apiUrl) || "",
          apiKey: (cfg && cfg.apiKey) || "",
          wizardComplete: true,
        }).then(function (r) {
          if (r && r.ok === false) throw new Error(r.message || "Could not save network mode");
          finish();
        });
      }).catch(function (err) {
        showAlert("Could not enable Multi-PC: " + (err && err.message ? err.message : String(err)));
      });
    } else {
      finish();
    }
  };

  var doResetData = function () {
    var pw = String(resetPw || "").trim();
    if (!pw) {
      setResetMsg({ type: "error", text: "Enter your admin password to confirm." });
      return;
    }
    setResetMsg({ type: "success", text: "Checking password…" });
    confirmAdminPassword(pw).then(function (ok) {
      if (!ok) {
        setResetMsg({
          type: "error",
          text: "Incorrect password. Use the same password you use to log in (or the password that opened Settings). If you recently changed it, try that new password.",
        });
        return;
      }
      doResetDataCore();
    }).catch(function () {
      setResetMsg({ type: "error", text: "Password check failed. Please restart the app and try again." });
    });
  };

  var doResetDataCore = function () {
    if (isNetworkClient) {
      setResetMsg({ type: "error", text: "Reset All Data must be run on the Main PC (server), not on a counter terminal. After the main PC reset, counter PCs will sync the fresh empty data." });
      return;
    }
    if (!wipeAllDataForReset) {
      setResetMsg({ type: "error", text: "Reset is unavailable in this build. Please update the app." });
      return;
    }

    /* FIX #7: Download safety backup FIRST and confirm it succeeded before wiping */
    var backupOk = false;
    try {
      var bakObj = buildBackupObject();
      var bakStr = JSON.stringify(bakObj, null, 2);
      if (!bakStr || bakStr.length < 10) throw new Error("Backup appears empty");
      var blob = new Blob([bakStr], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
      a.href = url; a.download = "techon-safety-backup-before-reset-" + d + ".json"; a.click();
      URL.revokeObjectURL(url);
      backupOk = true;
    } catch (e) {
      setResetMsg({ type: "error", text: "Safety backup failed: " + e.message + ". Reset aborted — your data is safe." });
      return; /* ABORT if backup fails */
    }

    if (!backupOk) {
      setResetMsg({ type: "error", text: "Safety backup could not be created. Reset aborted." });
      return;
    }

    setResetMsg({ type: "success", text: "✅ Safety backup downloaded. Wiping all data..." });

    var resetFinished = false;
    var reloadSoon = function (msg) {
      if (resetFinished) return;
      resetFinished = true;
      try {
        if (window.TC_SYNC && typeof window.TC_SYNC.discardPendingSync === "function") {
          window.TC_SYNC.discardPendingSync("reset_reload");
        }
      } catch (eDisc) { /* ignore */ }
      try { window.__TC_ALLOW_UNLOAD__ = true; } catch (eAllow) { /* ignore */ }
      setResetMsg({ type: "success", text: msg || "✅ System reset complete. Reloading..." });
      setTimeout(function () {
        try { window.location.reload(); } catch (eRel) {
          try { window.location.href = window.location.href; } catch (e2) {}
        }
      }, 1500);
    };

    wipeAllDataForReset({
      pushServer: isNetworkServer,
      authConfig: systemConfig,
    }).then(function (res) {
      if (res && res.ok === false) {
        setResetMsg({ type: "error", text: "Reset failed: " + (res.message || "Could not clear all data. Close other TechonERP windows and try again.") });
        return;
      }
      var salesLeft = (S.get("tc3_sales", []) || []).length;
      var productsLeft = (S.get("tc3_products", []) || []).length;
      if (salesLeft > 0 || productsLeft > 0) {
        setResetMsg({ type: "error", text: "Reset incomplete — " + salesLeft + " sales and " + productsLeft + " products still found. Close other windows and retry." });
        return;
      }
      reloadSoon("✅ System reset complete. Reloading...");
    }).catch(function (err) {
      setResetMsg({ type: "error", text: "Reset failed: " + (err && err.message ? err.message : String(err)) });
    });

    /* Absolute safety: never leave the UI stuck on "Wiping..." forever. */
    setTimeout(function () {
      if (resetFinished) return;
      reloadSoon("✅ Reset taking too long — forcing reload now...");
    }, 15000);
  };

  var doRestore = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var backup = JSON.parse(ev.target.result);
        if (!validateJsonBackupPayload(backup)) {
          setBakMsg({ type: "error", text: "Invalid backup file format." });
          return;
        }
        showConfirm("Restore from backup dated " + (backup.timestamp ? new Date(backup.timestamp).toLocaleString() : "unknown") + "?\n\nThis will first download a SAFETY BACKUP of your current data, then restore. Continue?", function () {
          doSafetyBackup();
          var salesCount = (backup.data && backup.data.tc3_sales && backup.data.tc3_sales.length) || 0;
          var restoreFn = applyBackupRestore || function (data) {
            return new Promise(function (resolve, reject) {
              try {
                ALL_KEYS.forEach(function (k) {
                  if (data[k] !== undefined) {
                    _idbCache[k] = data[k];
                    _idbWrite(k, data[k]);
                    try { localStorage.setItem(k, JSON.stringify(data[k])); } catch (e2) { /* quota */ }
                  }
                });
                if (data.tc3_businessType !== undefined) {
                  _idbCache.tc3_businessType = data.tc3_businessType;
                  try { localStorage.setItem("tc3_businessType", JSON.stringify(data.tc3_businessType)); } catch (e3) { /* ignore */ }
                }
                resolve();
              } catch (err) { reject(err); }
            });
          };
          restoreFn(backup.data).then(function () {
            var loadedSales = (S.get("tc3_sales", []) || []).length;
            var msg = "Restore complete (" + (loadedSales || salesCount) + " sales)";
            if (loadedSales === 0 && salesCount > 0) {
              setBakMsg({ type: "error", text: "Restore finished but no sales found in database. Please try again or contact support." });
              return;
            }
            if (isNetworkMode) msg += " — uploaded to MySQL server";
            msg += ". Opening login in 2 seconds...";
            setBakMsg({ type: "success", text: msg });
            try {
              sessionStorage.removeItem("tc3_current_user");
              sessionStorage.setItem("tc3_force_login_once", "1");
            } catch (eForce) { /* ignore */ }
            try {
              if (window.electronAPI && typeof window.electronAPI.closeSession === "function") {
                window.electronAPI.closeSession();
              }
            } catch (eClose) { /* ignore */ }
            try {
              if (window.TC_SYNC && typeof window.TC_SYNC.discardPendingSync === "function") {
                window.TC_SYNC.discardPendingSync("restore_reload");
              }
            } catch (eDisc) { /* ignore */ }
            try { window.__TC_ALLOW_UNLOAD__ = true; } catch (eAllow) { /* ignore */ }
            setTimeout(function () { window.location.reload(); }, 2000);
          }).catch(function (err) {
            setBakMsg({ type: "error", text: "Restore failed: " + (err && err.message ? err.message : String(err)) });
          });
        });
      } catch (err) { setBakMsg({ type: "error", text: "Restore failed: " + err.message }); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  var doExcelExport = function () {
    try {
      var lines = [];
      // Sheet: Products
      lines.push("=== PRODUCTS ===");
      lines.push("ID,Name,Barcode,Category,Cost,Price,Stock,Damaged");
      state.products.forEach(function (p) { lines.push([p.productId || "", p.name || "", p.barcode || "", p.category || "", p.cost || 0, p.price || 0, p.stock || 0, p.damaged || 0].join(",")); });
      lines.push("");
      // Sheet: Sales
      lines.push("=== SALES ===");
      lines.push("Invoice,Date,Customer,Items,Total,Paid,Balance,Status");
      state.sales.forEach(function (s) { lines.push([(s.invoiceNo || s.id.slice(0, 8)), s.date, (s.customerName || "Walk-in"), (s.items || []).length, s.total || 0, s.paid || 0, s.balance || 0, s.payStatus || ""].join(",")); });
      lines.push("");
      // Sheet: Purchases
      lines.push("=== PURCHASES ===");
      lines.push("Invoice,Date,Supplier,Items,Total,Paid,Balance,Status");
      state.purchases.forEach(function (p) { lines.push([(p.invoiceNo || p.id.slice(0, 8)), p.date, (p.supplier || ""), (p.items || []).length, p.total || 0, p.paidAmount || 0, Math.max(0, (p.total || 0) - (p.paidAmount || 0)), p.status || ""].join(",")); });
      lines.push("");
      // Sheet: Customers
      lines.push("=== CUSTOMERS ===");
      lines.push("Name,Phone,Address,Credit,Total Spent");
      state.customers.forEach(function (c) { lines.push([(c.name || ""), (c.phone || ""), (c.address || ""), (c.credit || 0), (c.totalSpent || 0)].join(",")); });
      lines.push("");
      // Sheet: Expenses
      lines.push("=== EXPENSES ===");
      lines.push("Date,Category,Description,Amount,Payee,Pay Mode");
      state.expenses.forEach(function (e) { lines.push([e.date, (e.category || ""), (e.description || ""), (e.amount || 0), (e.payee || ""), (e.payMode || "")].join(",")); });
      lines.push("");
      // Sheet: Repairs
      lines.push("=== REPAIRS ===");
      lines.push("ID,Date,Customer,Phone,Device,Brand,Problem,Cost,Status");
      state.repairs.forEach(function (r) { lines.push([(r.id || "").slice(0, 8), r.date, (r.customer || ""), (r.phone || ""), (r.deviceType || ""), (r.brand || ""), (r.problem || ""), (r.estimatedCost || r.cost || 0), (r.status || "")].join(",")); });
      var csv = lines.join("\n");
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = "techon-erp-export-" + d + ".csv";
      a.click(); URL.revokeObjectURL(url);
      setBakMsg({ type: "success", text: "✅ Excel/CSV export downloaded! Open with Excel or Google Sheets." });
    } catch (e) { setBakMsg({ type: "error", text: "Export failed: " + e.message }); }
  };

  var criticalAccountingRef = useRef(null);

  var save = function (opts) {
    var silent = opts && opts.silent;
    var ns = Object.assign({}, state.settings, f);
    ns.selectedTaxes = normalizeTaxList(ns.selectedTaxes || []);
    ns.taxMode = ns.taxMode === "inclusive" ? "inclusive" : "exclusive";
    ns.taxEnabled = ns.taxEnabled === true;
    ns.allowCostFallback = ns.allowCostFallback === true;
    ns.glVatPostingEnabled = ns.glVatPostingEnabled !== false;
    if (!isNetworkClient) {
      var modSrc = f.mainModuleToggles || f.moduleToggles || {};
      Object.assign(ns, persistMainModuleToggles(modSrc));
      /* Keep staff in sync — no separate cashier/staff modules panel. */
      Object.assign(ns, persistStaffModuleToggles(modSrc));
    }
    Object.assign(ns, persistToolbarKeys(f.toolbarKeys));
    if (!isNetworkClient) {
      Object.assign(ns, persistCategoryGroupToggles(f.enabledCategoryGroups || {}));
    }
    ns.strictPeriodLock = ns.strictPeriodLock === true;
    ns.purchaseReturnCostMode = ns.purchaseReturnCostMode === "original_cost" ? "original_cost" : "current_wac";
    ns.taxApplyBase = ns.taxApplyBase === "before_discount" ? "before_discount" : "after_discount";
    ns.defaultInvoiceLang = "en";
    ns.optionalInvoiceLangs = [];
    ns.customInvoiceLangs = [];
    updateCurrencySymbol(ns.currency); // Update live currency symbol
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    criticalAccountingRef.current = {
      glMode: S.get("tc3_gl_mode", "live"),
      inventoryCostingMethod: ns.inventoryCostingMethod || "wac",
      purchaseReturnCostMode: ns.purchaseReturnCostMode || "current_wac",
      taxMode: ns.taxMode === "inclusive" ? "inclusive" : "exclusive",
      taxEnabled: ns.taxEnabled === true,
      selectedTaxesKey: JSON.stringify(normalizeTaxList(ns.selectedTaxes || [])),
      glVatPostingEnabled: ns.glVatPostingEnabled !== false,
    };
    if (!silent) showAlert("Settings saved successfully.");
  };

  var saveCounterModules = function () {
    var ns = Object.assign({}, state.settings);
    Object.assign(ns, persistCounterModuleToggles(f.counterModuleToggles || {}));
    Object.assign(ns, persistToolbarKeys(f.toolbarKeys));
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    showAlert("Counter modules saved.");
  };

  var saveAccountingSettings = function () {
    var base = criticalAccountingRef.current;
    if (!base) {
      save();
      return;
    }
    var gl = S.get("tc3_gl_mode", "live");
    var taxKey = JSON.stringify(normalizeTaxList(f.selectedTaxes || []));
    var fTaxMode = f.taxMode === "inclusive" ? "inclusive" : "exclusive";
    var dirty =
      gl !== base.glMode ||
      (f.inventoryCostingMethod || "wac") !== base.inventoryCostingMethod ||
      (f.purchaseReturnCostMode || "current_wac") !== base.purchaseReturnCostMode ||
      fTaxMode !== base.taxMode ||
      (f.taxEnabled === true) !== base.taxEnabled ||
      taxKey !== base.selectedTaxesKey ||
      (f.glVatPostingEnabled !== false) !== base.glVatPostingEnabled;
    if (dirty) {
      showConfirm(
        "This may affect existing data.\n\nChanging accounting mode, inventory costing, or tax settings can impact reports and stock valuation.\n\nContinue?",
        function () { save(); }
      );
    } else {
      save();
    }
  };

  useEffect(function () {
    criticalAccountingRef.current = {
      glMode: S.get("tc3_gl_mode", "live"),
      inventoryCostingMethod: state.settings.inventoryCostingMethod || "wac",
      purchaseReturnCostMode: state.settings.purchaseReturnCostMode || "current_wac",
      taxMode: state.settings.taxMode === "inclusive" ? "inclusive" : "exclusive",
      taxEnabled: state.settings.taxEnabled === true,
      selectedTaxesKey: JSON.stringify(normalizeTaxList(state.settings.selectedTaxes || [])),
      glVatPostingEnabled: state.settings.glVatPostingEnabled !== false,
    };
  }, [state.settings]);

  var saveAdminName = function () {
    if (!adminNameEdit || adminNameEdit.trim().length < 2) { setAdminNameMsg({ type: "error", text: "Name must be at least 2 characters." }); return; }
    S.set("tc3_admin_name", adminNameEdit.trim());
    setAdminNameMsg({ type: "success", text: "Administrator name updated!" });
  };

  var savePassword = function () {
    var current = S.get("tc3_apppass", "");
    if (!pwNew || pwNew.length < 4) { setPwMsg({ type: "error", text: "New password must be at least 4 characters." }); return; }
    if (pwNew !== pwNew2) { setPwMsg({ type: "error", text: "Passwords do not match." }); return; }
    /* Verify old password (async for hashed, sync for legacy plaintext) */
    pwMatchesAsync(pwOld, current).then(function (oldOk) {
      if (current && !oldOk) { setPwMsg({ type: "error", text: "Current password incorrect." }); return; }
      hashPw(pwNew).then(function (hashed) {
        if (typeof setLoginPassword === "function") {
          setLoginPassword(hashed, { username: "admin" });
        } else {
          S.set("tc3_apppass", hashed);
        }
        setPwMsg({ type: "success", text: "Password changed successfully!" });
        setPwOld(""); setPwNew(""); setPwNew2("");
      });
    });
  };

  var removeLogo = function () {
    setF(function (x) { return Object.assign({}, x, { invoiceLogo: "" }); });
  };

  var handleLogoUpload = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      setF(function (x) { return Object.assign({}, x, { invoiceLogo: ev.target.result }); });
    };
    reader.readAsDataURL(file);
  };

  var saveAsset = function () {
    if (!newAsset || !newAsset.name || !newAsset.amount) return;
    var a = { id: uid(), date: newAsset.date || today(), name: newAsset.name, category: newAsset.category || "Equipment", amount: parseFloat(newAsset.amount) || 0, note: newAsset.note || "", cashMethod: newAsset.cashMethod || "Cash" };
    var na = (state.assets || []).concat([a]);
    S.set("tc3_assets", na);
    setState(function (st) { return Object.assign({}, st, { assets: na }); });
    setNewAsset(null);
  };

  var doAssetAction = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!assetPw) { setAssetPwMsg("Password required."); return; }
    if (!assetReason || assetReason.trim().length < 3) {
      setAssetPwMsg("Please enter a reason (min 3 chars).");
      return;
    }
    pwMatchesAsync(assetPw, storedPw).then(function (ok) {
      if (!ok) { setAssetPwMsg("Incorrect password."); return; }
      var action = assetActionModal;
      if (action === "delete" && editAsset) {
        var filtered = (state.assets || []).filter(function (a) { return a.id !== editAsset.id; });
        S.set("tc3_assets", filtered);
        setState(function (st) { return Object.assign({}, st, { assets: filtered }); });
        var logEntry = { id: uid(), date: today(), action: "Deleted", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim() };
        var prevLog = S.get("tc3_assetLog", []);
        var newLog = prevLog.concat([logEntry]);
        S.set("tc3_assetLog", newLog);
        setState(function (st) { return Object.assign({}, st, { assetLog: newLog }); });
      } else if (action === "edit" && editAsset) {
        var logEntry2 = { id: uid(), date: today(), action: "Edited", assetId: editAsset.id, assetName: editAsset.name, category: editAsset.category, amount: editAsset.amount, reason: assetReason.trim(), oldData: editAsset };
        var updated = (state.assets || []).map(function (a) { return a.id === editAsset.id ? Object.assign({}, editAsset) : a; });
        S.set("tc3_assets", updated);
        setState(function (st) { return Object.assign({}, st, { assets: updated }); });
        var prevLog2 = S.get("tc3_assetLog", []);
        var newLog2 = prevLog2.concat([logEntry2]);
        S.set("tc3_assetLog", newLog2);
        setState(function (st) { return Object.assign({}, st, { assetLog: newLog2 }); });
      }
      setAssetActionModal(null);
      setEditAsset(null);
      setAssetPw("");
      setAssetReason("");
      setAssetPwMsg("");
    });
  };

  var ACATS = ["Shop Interior", "Advance Payment / Deposit", "Rent Deposit", "Equipment / Machinery", "Computers / Electronics", "Printer / Scanner", "Networking Equipment", "Furniture & Fixtures", "Vehicle", "Security System (CCTV)", "Electrical / UPS", "Software / Licenses", "Tools / Instruments", "Renovation / Improvements", "Other"];
  var getCapLedger = function () { return S.get("tc3_capLedger", []); };
  var getCapLog = function () { return S.get("tc3_capLog", []); };

  var saveCapEntry = function () {
    if (!capForm.amount || parseFloat(capForm.amount) <= 0) { showAlert("Please enter a valid amount."); return; }
    if (!capForm.date) { showAlert("Please select a date."); return; }
    var entry = { id: uid(), type: capForm.type, amount: parseFloat(capForm.amount), date: capForm.date, note: capForm.note || "", ref: capForm.ref || "", cashMethod: capForm.cashMethod || "Cash", createdAt: new Date().toISOString() };
    var ledger = getCapLedger().concat([entry]);
    S.set("tc3_capLedger", ledger);
    var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
    var ns = Object.assign({}, state.settings, { capitalInvested: total });
    S.set("tc3_settings", ns);
    setState(function (st) { return Object.assign({}, st, { settings: ns }); });
    setCapForm({ type: "invest", amount: "", date: today(), note: "", ref: "", cashMethod: "Cash" });
  };

  var doCapEdit = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().map(function (e) { return e.id === capEditForm.id ? Object.assign({}, capEditForm) : e; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns);
      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      var logEntry = { id: uid(), action: "Edited", entryId: capEditForm.id, type: capEditForm.type, amount: capEditForm.amount, date: capEditForm.date, reason: capActionReason, at: new Date().toISOString() };
      S.set("tc3_capLog", getCapLog().concat([logEntry]));
      setCapEditModal(null); setCapEditForm(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };

  var doCapDelete = function () {
    var storedPw = S.get("tc3_apppass", "");
    if (!capActionPw) { setCapActionMsg("Password required."); return; }
    if (!capActionReason || capActionReason.trim().length < 3) { setCapActionMsg("Reason required (min 3 chars)."); return; }
    pwMatchesAsync(capActionPw, storedPw).then(function (ok) {
      if (!ok) { setCapActionMsg("Incorrect password."); return; }
      var ledger = getCapLedger().filter(function (e) { return e.id !== capDeleteTarget.id; });
      S.set("tc3_capLedger", ledger);
      var total = ledger.reduce(function (a, e) { return a + (e.type === "invest" ? e.amount : -e.amount); }, 0);
      var ns = Object.assign({}, state.settings, { capitalInvested: total });
      S.set("tc3_settings", ns);
      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
      var logEntry = { id: uid(), action: "Deleted", entryId: capDeleteTarget.id, type: capDeleteTarget.type, amount: capDeleteTarget.amount, date: capDeleteTarget.date, reason: capActionReason, at: new Date().toISOString() };
      S.set("tc3_capLog", getCapLog().concat([logEntry]));
      setCapDeleteTarget(null); setCapActionPw(""); setCapActionReason(""); setCapActionMsg("");
    });
  };

  var runRmBfDryRun = function () {
    var plan = computeRawMaterialPricingBackfillPlan(state.products || [], state.purchases || []);
    setRmBfPreview(plan);
  };
  var runRmBfApply = function () {
    if (!rmBfPreview || !rmBfPreview.changes || !rmBfPreview.changes.length) {
      showAlert("Nothing to apply. Run dry-run first, or all products are already in sync.");
      return;
    }
    var plan = rmBfPreview;
    showConfirm(
      "Apply " + plan.changes.length + " product update(s) from the latest purchase line for each ingredient? Download a backup first.",
      function () {
        var np = applyRawMaterialPricingPlanToProducts(state.products || [], plan);
        S.set("tc3_products", np);
        for (var i = 0; i < plan.changes.length; i++) {
          var ch = plan.changes[i];
          addAudit("Raw material pricing backfill", ch.name, {
            productId: ch.id,
            oldPrice: ch.oldPrice,
            newPrice: ch.newPrice,
            oldCost: ch.oldCost,
            newCost: ch.newCost,
            purchaseDate: ch.purchaseDate,
            purchaseInvoiceNo: ch.purchaseInvoiceNo,
            purchaseId: ch.purchaseId,
          });
        }
        setState(function (s) { return Object.assign({}, s, { products: np }); });
        setRmBfPreview(null);
        showAlert("Applied " + plan.changes.length + " update(s). Check Activity Log.");
      }
    );
  };

  useEffect(function () {
    setPendingIndustry(businessType);
  }, [businessType]);

  var applyIndustryChange = function () {
    var newBt = pendingIndustry;
    if (!newBt || newBt === businessType) return;
    var storedPw = S.get("tc3_apppass", "");
    if (!storedPw) {
      showAlert("Set a login password in Settings → Security before changing industry.");
      return;
    }
    setIndustryPw("");
    setIndustryPwMsg("");
    setIndustryPwOpen(true);
  };

  var confirmIndustryChangeWithPassword = function () {
    if (!industryPw) { setIndustryPwMsg("Password required."); return; }
    var storedPw = S.get("tc3_apppass", "");
    pwMatchesAsync(industryPw, storedPw).then(function (ok) {
      if (!ok) { setIndustryPwMsg("Incorrect password."); return; }
      setIndustryPwOpen(false);
      setIndustryPw("");
      setIndustryPwMsg("");
      var newBt = pendingIndustry;
      if (!newBt || newBt === businessType) return;
      var oldBt = businessType;
      var oldName = (BUSINESS_PROFILES[oldBt] && BUSINESS_PROFILES[oldBt].name) || oldBt;
      var newName = (BUSINESS_PROFILES[newBt] && BUSINESS_PROFILES[newBt].name) || newBt;
      var restaurantSwitch = oldBt === "restaurant" || newBt === "restaurant";
      var doApply = function () {
        S.set("tc3_businessType", newBt);
        if (typeof setBusinessType === "function") setBusinessType(newBt);
        addAudit("Industry: " + oldName + " → " + newName);
        if (restaurantSwitch && typeof setActive === "function") setActive("dashboard");
        showAlert("Industry set to " + newName + ". Menus and product defaults now follow this profile.");
      };
      var msg = restaurantSwitch
        ? ("Switching " + (newBt === "restaurant" ? "to Restaurant" : "from Restaurant") + " changes how Sales works (tables & kitchen vs normal retail POS). Your products, sales, and stock are kept.\n\nChange to " + newName + "?")
        : ("Change industry to " + newName + "? Menus and default categories/units will update. Your existing data is kept.");
      showConfirm(msg, doApply);
    });
  };

  var industryProfileKeys = INDUSTRY_ORDER.filter(function (k) { return BUSINESS_PROFILES[k]; });
  var industryModuleChips = function (profKey) {
    var prof = BUSINESS_PROFILES[profKey] || BUSINESS_PROFILES.tech || {};
    var mods = prof.modules || {};
    var chips = [];
    if (mods.repairs) chips.push("Repairs");
    if (mods.barcode !== false) chips.push("Barcode labels");
    if (mods.serial) chips.push("Serial / IMEI");
    if (mods.expiry) chips.push("Expiry dates");
    if (profKey === "restaurant") chips.push("Restaurant POS");
    if (profKey === "jewelry") chips.push("Weight & making charge");
    return chips;
  };
  var renderMasterEditionBlock = function (compact, linkToCategories) {
    var enabled = getEnabledCategoryGroupsList(Object.assign({}, state.settings, { enabledCategoryGroups: f.enabledCategoryGroups }));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 10 : 12, background: "linear-gradient(135deg,#2979ff14,#2979ff08)", border: "1.5px solid #2979ff40", borderRadius: 10, padding: compact ? "8px 12px" : "12px 16px", flexWrap: "wrap" }}>
          <span style={{ fontSize: compact ? 20 : 24 }}>🏪</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: compact ? 11 : 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Edition</div>
            <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: "#2979ff" }}>TechonERP Master Edition</div>
            <div style={{ fontSize: compact ? 10 : 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Turn on category groups your shop needs (Phones, Computers, Glass, Grocery, etc.). Each group brings its own sub-categories and units.
            </div>
            <div style={{ fontSize: compact ? 10 : 11, color: C.text, marginTop: 6 }}>
              <strong>{enabled.length}</strong> group{enabled.length !== 1 ? "s" : ""} enabled
              {enabled.length > 0 ? (" — " + enabled.map(function (g) { return g.label; }).slice(0, 3).join(", ") + (enabled.length > 3 ? "…" : "")) : ""}
            </div>
          </div>
        </div>
        {linkToCategories && !isNetworkClient && (
          <div>
            <Btn col="blue" onClick={function () { setStab("categories"); }}>Configure categories</Btn>
          </div>
        )}
      </div>
    );
  };

  var renderIndustryBlock = function (editable, compact) {
    if (!isRestaurantBusiness) return renderMasterEditionBlock(compact, false);
    if (!getBusinessProfile && !industryProfileKeys.length) return null;
    var bp = getBusinessProfile ? getBusinessProfile() : (BUSINESS_PROFILES[businessType] || {});
    var chipKey = editable ? pendingIndustry : businessType;
    var chips = industryModuleChips(chipKey);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 10 : 12, background: "linear-gradient(135deg," + bp.color + "14," + bp.color + "08)", border: "1.5px solid " + bp.color + "40", borderRadius: 10, padding: compact ? "8px 12px" : "12px 16px", flexWrap: "wrap" }}>
          <span style={{ fontSize: compact ? 20 : 24 }}>{bp.emoji}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: compact ? 11 : 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Business Type</div>
            <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: bp.color }}>{bp.name}</div>
            <div style={{ fontSize: compact ? 10 : 11, color: C.muted, marginTop: 2 }}>{bp.units.length} units · {bp.categories.length} categories{bp.modules && bp.modules.repairs ? " · Repairs enabled" : ""}</div>
            {!editable && (
              <div style={{ fontSize: compact ? 10 : 11, color: C.muted, marginTop: 6 }}>Default on install — you can change this anytime in Settings after setup.</div>
            )}
          </div>
        </div>
        {editable && industryProfileKeys.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Change industry to switch menus, category suggestions, units, and Sales layout. Your products and transactions are kept.
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Industry profile</label>
              <select
                value={pendingIndustry}
                onChange={function (e) { setPendingIndustry(e.target.value); }}
                style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: C.text, background: "#fff", outline: "none", fontFamily: "inherit", cursor: "pointer" }}
              >
                {industryProfileKeys.map(function (k) {
                  var p = BUSINESS_PROFILES[k];
                  return <option key={k} value={k}>{(p.emoji ? p.emoji + " " : "") + p.name}</option>;
                })}
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {chips.map(function (c) {
                return <span key={c} style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: C.accentSoft, color: C.accent, border: "1px solid " + C.borderLight }}>{c}</span>;
              })}
            </div>
            {pendingIndustry === "restaurant" && businessType !== "restaurant" && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412" }}>
                Switching to Restaurant enables table service and kitchen workflow in Sales. Existing data is kept.
              </div>
            )}
            {businessType === "restaurant" && pendingIndustry !== "restaurant" && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", fontSize: 12, color: "#9a3412" }}>
                Leaving Restaurant switches Sales back to standard retail POS. Table/kitchen data is kept but hidden until you return to Restaurant.
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Btn col="cyan" onClick={applyIndustryChange} disabled={!pendingIndustry || pendingIndustry === businessType}>Apply industry</Btn>
              {pendingIndustry !== businessType ? (
                <span style={{ fontSize: 12, color: C.muted }}>Current: <strong style={{ color: C.text }}>{(BUSINESS_PROFILES[businessType] && BUSINESS_PROFILES[businessType].name) || businessType}</strong></span>
              ) : (
                <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Active profile</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  var TABS = [["profile", "Shop Profile"], ["shop", "Business Settings"], ["features", "Modules"], ["invoice", "Invoice Design"], ["backup", "Backup"], ["accounting", "Accounting"], ["users", "Security & Users"]];
  if (isRestaurantBusiness) TABS.splice(2, 0, ["restaurantsetup", "Restaurant Setup"]);
  TABS.push(["activity", "Activity Log"]);
  /* Always show Network tab (standalone can Enable Multi-PC; server/client manage sync). */
  if (!isNetworkClient) TABS.push(["network", "Network"]);
  TABS.push(["about", "About"]);
  if (isNetworkClient) {
    TABS = [["features", "Modules"], ["network", "Network"], ["about", "About"]];
  }

  var renderModulePanel = function (toggleKey, title, sub) {
    var optionalDefs = MODULE_TOGGLE_DEFS.filter(function (m) {
      return SETTINGS_OPTIONAL_MODULE_IDS.indexOf(m.id) >= 0;
    });
    var posItems = optionalDefs.filter(function (m) { return m.group === "POS"; });
    var codItems = optionalDefs.filter(function (m) { return m.group === "COD"; });
    var renderToggleTile = function (m) {
      var toggles = f[toggleKey] || {};
      var parentOff = m.parentModule && toggles[m.parentModule] !== true;
      var on = toggles[m.id] === true && !parentOff;
      return (
        <label
          key={m.id}
          className={"erp-mod-tile" + (on ? " is-on" : "") + (parentOff ? " is-disabled" : "") + (m.parentModule ? " is-child" : "")}
        >
          <input
            type="checkbox"
            checked={on}
            disabled={parentOff}
            onChange={function (e) {
              var checked = e.target.checked;
              setF(function (x) {
                var nextToggles = Object.assign({}, x[toggleKey] || {}, { [m.id]: checked });
                if (m.id === "coddatabase" && checked) {
                  nextToggles.codSalesTrack = true;
                }
                if (m.id === "coddatabase" && !checked) {
                  nextToggles.codCostProfit = false;
                  nextToggles.codSalesTrack = false;
                }
                var patch = {};
                patch[toggleKey] = nextToggles;
                if (toggleKey === "mainModuleToggles") {
                  patch.moduleToggles = nextToggles;
                  if (m.id === "freeItems") patch.freeItemsEnabled = checked;
                }
                return Object.assign({}, x, patch);
              });
            }}
          />
          <span className="erp-mod-tile-ico" aria-hidden="true">{m.id === "freeItems" ? "🎁" : (m.id === "codCostProfit" ? "💹" : "🚚")}</span>
          <span className="erp-mod-tile-body">
            <span className="erp-mod-tile-name">{m.label}</span>
            <span className="erp-mod-tile-blurb">{m.blurb}</span>
          </span>
          <span className={"erp-mod-tile-state" + (on ? " is-on" : "")}>{on ? "On" : "Off"}</span>
        </label>
      );
    };
    return (
      <div key={toggleKey} className="erp-mod-panel">
        {posItems.length ? (
          <div className="erp-mod-section">
            <div className="erp-mod-section-label">POS</div>
            <div className="erp-mod-tiles">{posItems.map(renderToggleTile)}</div>
          </div>
        ) : null}
        {codItems.length ? (
          <div className="erp-mod-section">
            <div className="erp-mod-section-label">COD Tracker</div>
            <div className="erp-mod-tiles">{codItems.map(renderToggleTile)}</div>
          </div>
        ) : null}
      </div>
    );
  };

  var applyShopCountry = function (v) {
    var meta = getCountryMeta(v);
    setF(function (x) {
      var patch = {
        shopCountry: v,
        defaultInvoiceLang: "en",
        optionalInvoiceLangs: [],
        customInvoiceLangs: [],
        selectedTaxes: mergeTaxesOnCountryChange(v, x.selectedTaxes),
      };
      if (meta && meta.currency) patch.currency = meta.currency;
      return Object.assign({}, x, patch);
    });
    if (meta && meta.currency) updateCurrencySymbol(meta.currency);
  };

  useEffect(function () {
    if (!countrySearchOpen) return;
    function onDocMouseDown(e) {
      if (countryPickerWrapRef.current && !countryPickerWrapRef.current.contains(e.target)) {
        setCountrySearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    return function () { document.removeEventListener("mousedown", onDocMouseDown, true); };
  }, [countrySearchOpen]);

  useEffect(function () {
    if (stab !== "langcurrency" && stab !== "shop") setCountrySearchOpen(false);
  }, [stab]);

  useEffect(function () {
    try {
      if (isNetworkClient) return;
      if (props.embeddedWizard) return;
      var pinReset = sessionStorage.getItem("tc3_open_security_pin_reset") === "1";
      var appPwReset = sessionStorage.getItem("tc3_open_app_password_reset") === "1";
      if (pinReset) {
        sessionStorage.removeItem("tc3_open_security_pin_reset");
        setStab("users");
        setShowSupportPinResetHint(true);
      }
      if (appPwReset) {
        sessionStorage.removeItem("tc3_open_app_password_reset");
        setStab("users");
        setShowAppPasswordResetHint(true);
      }
      var openShop = sessionStorage.getItem("tc3_open_settings_shop_tab") === "1";
      if (openShop) {
        sessionStorage.removeItem("tc3_open_settings_shop_tab");
        setStab("profile");
      }
    } catch (e) { /* ignore */ }
  }, [props.embeddedWizard, isNetworkClient]);

  /* Startup wizard: force correct tab when embedding Settings */
  useEffect(function () {
    if (props.embeddedWizard === "shop_limited") setStab("profile");
    else if (props.embeddedWizard === "langcurrency") setStab("langcurrency");
  }, [props.embeddedWizard]);

  /* Wizard shop step: focus first invalid core field when entering this step (not on every keystroke). */
  useEffect(function () {
    if (props.embeddedWizard !== "shop_limited" || stab !== "profile") return;
    var snapshot = f;
    var t = setTimeout(function () {
      var v = validateCoreStartupIdentity(snapshot);
      if (v.ok) return;
      var order = ["shopName", "phone", "address"];
      for (var oi = 0; oi < order.length; oi++) {
        if (v.missing.indexOf(order[oi]) >= 0) {
          var el = document.getElementById("tc-core-" + order[oi]);
          if (el) {
            try { el.focus({ preventScroll: true }); } catch (e2) { el.focus(); }
          }
          break;
        }
      }
    }, 80);
    return function () { clearTimeout(t); };
  }, [stab, props.embeddedWizard]);

  var hideWizardTabs = !!props.embeddedWizard;
  var showSettingsTabs = !hideWizardTabs || isNetworkClient;
  var taxTipFine = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  useEffect(function () {
    if (!taxModeTooltipOpen) return;
    if (taxTipFine) return;
    function onDocMouseDown(e) {
      if (taxModeTooltipRef.current && !taxModeTooltipRef.current.contains(e.target)) {
        setTaxModeTooltipOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    return function () { document.removeEventListener("mousedown", onDocMouseDown, true); };
  }, [taxModeTooltipOpen, taxTipFine]);

  var selectedCountryLabel = "";
  CURATED_COUNTRIES.forEach(function (c) {
    if (c.code === (f.shopCountry || "")) selectedCountryLabel = c.name;
  });
  var countryInputDisplay = countrySearchOpen ? countrySearchQ : selectedCountryLabel;

  var currencySelectValue = f.currency || state.settings.currency || "Rs";
  (function () {
    var ok = false;
    APP_CURRENCY_OPTIONS.forEach(function (o) {
      if (o.value === currencySelectValue) ok = true;
    });
    if (!ok) currencySelectValue = "Rs";
  })();

  var sampleInv = {
    invoiceNo: "INV-20250101-0001", date: today(),
    customerName: "Sample Customer", customerPhone: "0771234567",
    items: [{ name: "Laptop HP 15s", qty: 1, price: 85000 }, { name: "Laptop Bag", qty: 1, price: 3500 }, { name: "USB Mouse", qty: 2, price: 1200 }],
    subTotal: 90900, discount: 900, total: 90000, paid: 50000, balance: 40000, payStatus: "Partial", includeWarranty: true,
    previousBalance: 0
  };

  var embWiz = props.embeddedWizard === "shop_limited" || props.embeddedWizard === "langcurrency";
  var denseWiz = !!props.embeddedWizard;
  var langWizShell = wizardUi && props.embeddedWizard === "langcurrency";
  var wizPanelStyle = { background: "#fff", borderRadius: 12, border: "1px solid #e8ecf4", boxShadow: "0 2px 14px rgba(15,23,42,0.05)", padding: "14px 16px", marginBottom: 10 };
  var wizHeading = function (t) {
    return <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{t}</div>;
  };
  var runWizardCoreIdentityStep = function (afterValid) {
    if (!embWiz) {
      afterValid();
      return;
    }
    var v = validateCoreStartupIdentity(f);
    if (!v.ok) {
      showAlert(getCoreStartupIdentityAlertMessage(v.missing));
      setCoreStartupErr({
        shopName: v.missing.indexOf("shopName") >= 0,
        phone: v.missing.indexOf("phone") >= 0,
        address: v.missing.indexOf("address") >= 0
      });
      setStab("profile");
      setTimeout(function () {
        var order = ["shopName", "phone", "address"];
        for (var oi = 0; oi < order.length; oi++) {
          if (v.missing.indexOf(order[oi]) >= 0) {
            var el = document.getElementById("tc-core-" + order[oi]);
            if (el && el.scrollIntoView) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              try { el.focus({ preventScroll: true }); } catch (e2) { el.focus(); }
            }
            break;
          }
        }
      }, 120);
      return;
    }
    setCoreStartupErr({ shopName: false, phone: false, address: false });
    afterValid();
  };

  var clientNormaliseNetUrl = function (raw) {
    var u = (raw || "").trim();
    if (!u) return u;
    if (!u.endsWith("/")) u += "/";
    if (u.indexOf("/api/") < 0) u += "api/";
    return u;
  };
  var clientConnectToServer = function () {
    if (clientNetBusy) return;
    var api = window.electronAPI;
    if (!api || !api.saveNetworkConfig) { showAlert("Network setup is not available in this build."); return; }
    var apiUrl = clientNormaliseNetUrl(clientNetUrl);
    if (!apiUrl || apiUrl.indexOf("http") !== 0) { setClientNetErr("Address must start with http:// or https://"); return; }
    if (!clientNetKey.trim()) { setClientNetErr("Enter the Security Key from the server PC."); return; }
    setClientNetBusy(true);
    setClientNetErr(null);
    setClientNetStep("Testing connection…");

    var testPromise = (api.testNetworkConnection
      ? api.testNetworkConnection({ apiUrl: apiUrl, apiKey: clientNetKey.trim() })
      : fetch(apiUrl + "ping.php", { signal: AbortSignal.timeout(8000) })
          .then(function (pingRes) {
            if (!pingRes.ok) throw new Error("Server returned HTTP " + pingRes.status);
            return pingRes.json();
          })
          .then(function (pingJson) {
            if (!pingJson.success) throw new Error("Server is not ready: " + (pingJson.message || "unknown"));
            return fetch(apiUrl + "get_products.php", {
              headers: { "X-TC-KEY": clientNetKey.trim() },
              signal: AbortSignal.timeout(8000),
            });
          })
          .then(function (prodRes) {
            if (prodRes.status === 401) throw new Error("Security key is incorrect.");
            if (!prodRes.ok) throw new Error("Server returned HTTP " + prodRes.status);
            return prodRes.json();
          })
          .then(function (prodJson) {
            var products = prodJson.products || (prodJson.data && prodJson.data.products);
            if (!Array.isArray(products)) throw new Error("Invalid response from server.");
            return { ok: true };
          })
    );

    Promise.resolve(testPromise)
      .then(function (testResult) {
        if (testResult && testResult.ok === false) {
          throw new Error(testResult.message || "Cannot connect.");
        }
        setClientNetStep("Saving settings…");
        return api.saveNetworkConfig({
          role: "network_client",
          apiUrl: apiUrl,
          apiKey: clientNetKey.trim(),
          wizardComplete: true,
        });
      })
      .then(function (saveResult) {
        if (!saveResult || saveResult.ok === false) {
          throw new Error((saveResult && saveResult.message) ? saveResult.message : "Could not save network settings.");
        }
        setClientNetStep("Connected — reloading…");
        window.location.reload();
      })
      .catch(function (err) {
        setClientNetErr(err && err.message ? err.message : "Cannot connect.");
        setClientNetBusy(false);
        setClientNetStep("");
      });
  };

  return (
    <div className={"erp-page erp-set-modern erp-settings-scope" + (wizardUi ? " is-wizard" : "")} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {showSettingsTabs && (
      <div className="erp-set-chrome">
        <div className="erp-set-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map(function (t) {
            var icons = { profile: "🏪", shop: "⚙️", features: "🧩", langcurrency: "🌍", capital: "💼", invoice: "🧾", barcode: "🏷", assets: "📦", backup: "💾", accounting: "⚖", security: "🔐", users: "🔐", activity: "📋", network: "🌐", pos: "🛒", about: "ℹ", restaurantsetup: "🍽", categories: "📁" };
            var active = stab === t[0];
            return (
              <button
                key={t[0]}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-set-tab" + (active ? " is-active" : "")}
                onClick={function () { setStab(t[0]); }}
              >
                <span className="erp-set-tab-ico" aria-hidden="true">{icons[t[0]]}</span>
                <span>{t[1]}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}

      <div className="erp-set-body">

      {stab === "profile" && (
        <div className={"erp-set-stack" + (wizardUi && props.embeddedWizard === "shop_limited" ? " is-tight" : "")}>
          {wizardUi && props.embeddedWizard === "shop_limited" ? (
            <React.Fragment>
              <div style={wizPanelStyle}>
                {wizHeading("Basic information")}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {renderIndustryBlock(false, true)}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <Input compact={denseWiz} id="tc-core-shopName" error={embWiz && coreStartupErr.shopName} aria-describedby={embWiz && coreStartupErr.shopName ? "tc-core-hint-shopName" : undefined} label="Shop Name" value={f.shopName || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopName: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { shopName: false }); }); }} placeholder="e.g. Techon Computers" />
                      {embWiz && coreStartupErr.shopName && <div id="tc-core-hint-shopName" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Required</div>}
                    </div>
                    <div />
                  </div>
                </div>
              </div>
              <div style={wizPanelStyle}>
                {wizHeading("Contact information")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <Input compact={denseWiz} id="tc-core-phone" error={embWiz && coreStartupErr.phone} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Primary Phone" value={f.phone || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} placeholder="+94 77 123 4567" />
                  </div>
                  <Input compact={denseWiz} label="Second Phone" value={f.phone2 || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone2: e.target.value }); }); }} placeholder="+94 11 234 5678" />
                  <Input compact={denseWiz} label="WhatsApp Number" value={f.whatsapp || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { whatsapp: e.target.value }); }); }} placeholder="+94 77 123 4567" />
                </div>
              </div>
              <div style={wizPanelStyle}>
                {wizHeading("Online information")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Input compact={denseWiz} label="Email Address" value={f.email || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} placeholder="info@techon.lk" />
                  <Input compact={denseWiz} label="Website" value={f.website || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { website: e.target.value }); }); }} placeholder="www.techon.lk" />
                </div>
              </div>
              <div style={Object.assign({}, wizPanelStyle, { marginBottom: 6 })}>
                {wizHeading("Address & registration")}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <Input compact={denseWiz} id="tc-core-address" error={embWiz && coreStartupErr.address} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Shop Address" value={f.address || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} />
                    {embWiz && (coreStartupErr.phone || coreStartupErr.address) && <div id="tc-core-hint-contact" role="status" aria-live="polite" style={{ fontSize: 11, color: "#e03151", fontWeight: 600, marginTop: 2, transition: "opacity .15s ease" }}>Enter at least one</div>}
                  </div>
                  <Input compact={denseWiz} label="Business Reg. No (BRN)" value={f.brn || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { brn: e.target.value }); }); }} placeholder="e.g. PV 00012345" />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 6, borderTop: "1px solid #e8ecf4", marginTop: 2 }}>
                <button type="button" className="erp-set-wizard-back" onClick={function () { if (onWizardBack) onWizardBack(); }}>← Back</button>
                <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardNext) props.onWizardNext(); }); }}>Continue →</Btn>
              </div>
            </React.Fragment>
          ) : (
          <div className="erp-prof-page">
            <div className="erp-prof-wrap">
              <Card className="erp-prof-card">
                <div className="erp-prof-brand">
                  <div className="erp-prof-brand-ico" aria-hidden="true">🏪</div>
                  <div>
                    <div className="erp-prof-title">Shop Profile</div>
                    <div className="erp-prof-sub">Name, contact and registration on invoices</div>
                  </div>
                </div>

                <div className="erp-prof-block">
                  <div className="erp-prof-block-label">Identity</div>
                  <div className="erp-prof-grid">
                    <div>
                      <Input compact={denseWiz} id="tc-core-shopName" error={embWiz && coreStartupErr.shopName} aria-describedby={embWiz && coreStartupErr.shopName ? "tc-core-hint-shopName" : undefined} label="Shop Name" value={f.shopName || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopName: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { shopName: false }); }); }} placeholder="e.g. Techon Computers" />
                      {embWiz && coreStartupErr.shopName && <div id="tc-core-hint-shopName" role="status" aria-live="polite" className="erp-prof-err">Required</div>}
                    </div>
                    <Input compact={denseWiz} label="Business Reg. No (BRN)" value={f.brn || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { brn: e.target.value }); }); }} placeholder="e.g. PV 00012345" />
                  </div>
                </div>

                <div className="erp-prof-block">
                  <div className="erp-prof-block-label">Contact</div>
                  <div className="erp-prof-grid">
                    <div>
                      <Input compact={denseWiz} id="tc-core-phone" error={embWiz && coreStartupErr.phone} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Primary Phone" value={f.phone || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} placeholder="+94 77 123 4567" />
                    </div>
                    <Input compact={denseWiz} label="Second Phone" value={f.phone2 || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone2: e.target.value }); }); }} placeholder="+94 11 234 5678" />
                    <Input compact={denseWiz} label="WhatsApp Number" value={f.whatsapp || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { whatsapp: e.target.value }); }); }} placeholder="+94 77 123 4567" />
                    <Input compact={denseWiz} label="Email Address" value={f.email || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { email: e.target.value }); }); }} placeholder="info@techon.lk" />
                    <Input compact={denseWiz} label="Website" value={f.website || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { website: e.target.value }); }); }} placeholder="www.techon.lk" />
                  </div>
                </div>

                <div className="erp-prof-block">
                  <div className="erp-prof-block-label">Address</div>
                  <div>
                    <Input compact={denseWiz} id="tc-core-address" error={embWiz && coreStartupErr.address} aria-describedby={embWiz && (coreStartupErr.phone || coreStartupErr.address) ? "tc-core-hint-contact" : undefined} label="Shop Address" value={f.address || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { address: e.target.value }); }); if (embWiz) setCoreStartupErr(function (prev) { return Object.assign({}, prev, { phone: false, address: false }); }); }} />
                    {embWiz && (coreStartupErr.phone || coreStartupErr.address) && <div id="tc-core-hint-contact" role="status" aria-live="polite" className="erp-prof-err">Enter at least one</div>}
                  </div>
                </div>

                <button type="button" className="erp-prof-save" onClick={save}>Save Shop Profile</button>
              </Card>
            </div>
          </div>
          )}
        </div>
      )}

      {stab === "shop" && (function () {
        var enabledCats = getEnabledCategoryGroupsList(Object.assign({}, state.settings, { enabledCategoryGroups: f.enabledCategoryGroups }));
        var enabledCount = enabledCats.length;
        var countryLabel = selectedCountryLabel || "Not set";
        var currencyLabel = currencySelectValue || "—";
        var setAllCategoryGroups = function (on) {
          setF(function (x) {
            var next = Object.assign({}, x.enabledCategoryGroups || {});
            CATEGORY_GROUPS.forEach(function (g) { next[g.id] = on; });
            return Object.assign({}, x, { enabledCategoryGroups: next });
          });
        };
        return (
        <div className="erp-bizset-page">
          <div className="erp-bizset-wrap">
            <Card className="erp-bizset-card">
              <div className="erp-bizset-brand">
                <div className="erp-bizset-brand-ico" aria-hidden="true">⚙️</div>
                <div>
                  <div className="erp-bizset-title">Business Settings</div>
                  <div className="erp-bizset-sub">
                    {enabledCount} of {CATEGORY_GROUPS.length} categories · {countryLabel} · {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="erp-bizset-block">
                <div className="erp-bizset-block-label">Edition</div>
                {isRestaurantBusiness ? (
                  renderIndustryBlock(true, false)
                ) : (
                  <div className="erp-bizset-note is-blue">
                    <strong>TechonERP Master Edition</strong>
                    <span> — turn on the category groups your shop sells below.</span>
                  </div>
                )}
              </div>

              {!isNetworkClient ? (
                <div className="erp-bizset-block">
                  <div className="erp-bizset-block-label">Category Groups</div>
                  <div className="erp-biz-cat-toolbar">
                    <div className="erp-biz-cat-count">
                      <strong>{enabledCount}</strong> of {CATEGORY_GROUPS.length} active
                    </div>
                    <div className="erp-biz-cat-actions">
                      <button type="button" className="erp-biz-mini" onClick={function () { setAllCategoryGroups(true); }}>Enable all</button>
                      <button type="button" className="erp-biz-mini" onClick={function () { setAllCategoryGroups(false); }}>Clear all</button>
                    </div>
                  </div>
                  <div className="erp-bizset-note is-muted">Units and sub-categories follow each group automatically.</div>
                  <div className="erp-biz-cat-grid">
                    {CATEGORY_GROUPS.map(function (g) {
                      var on = (f.enabledCategoryGroups || {})[g.id] === true;
                      return (
                        <label key={g.id} className={"erp-biz-cat-tile" + (on ? " is-on" : "")}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={function (e) {
                              var checked = e.target.checked;
                              setF(function (x) {
                                var next = Object.assign({}, x.enabledCategoryGroups || {}, { [g.id]: checked });
                                return Object.assign({}, x, { enabledCategoryGroups: next });
                              });
                            }}
                          />
                          <span className="erp-biz-cat-emoji" aria-hidden="true">{g.emoji}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="erp-biz-cat-name">
                              {g.label}
                              {g.workflow === "glass_cut" ? <span className="erp-biz-cat-badge">Cut size</span> : null}
                            </span>
                            <span className="erp-biz-cat-meta">
                              Units: {(g.units || []).slice(0, 6).join(", ")}{(g.units || []).length > 6 ? "…" : ""}
                            </span>
                            {on ? (
                              <span className="erp-biz-cat-subs">
                                {(g.subCategories || []).slice(0, 5).join(" · ")}{(g.subCategories || []).length > 5 ? "…" : ""}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
        );
      })()}

      {stab === "features" && (
        <div className="erp-modset-page">
          <div className="erp-modset-wrap">
            <Card className="erp-modset-card">
              <div className="erp-modset-brand">
                <div className="erp-modset-brand-ico" aria-hidden="true">🧩</div>
                <div>
                  <div className="erp-modset-title">Modules</div>
                  <div className="erp-modset-sub">
                    {isNetworkClient ? "Optional extras on this counter terminal" : "Free Items and COD Tracker for this shop"}
                  </div>
                </div>
              </div>
              <div className="erp-modset-block">
                {isNetworkClient
                  ? renderModulePanel("counterModuleToggles", "Modules", "Optional extras on this counter terminal.")
                  : renderModulePanel("mainModuleToggles", "Modules", "Free Items and COD Tracker for this shop.")}
              </div>
              <button type="button" className="erp-modset-save" onClick={isNetworkClient ? saveCounterModules : save}>Save Modules</button>
            </Card>
          </div>
        </div>
      )}

      {(stab === "langcurrency" || (stab === "shop" && !props.embeddedWizard)) && (
        <div className={"erp-set-stack" + (langWizShell ? " is-tight" : "") + (stab === "shop" ? " erp-bizset-region" : "")}>
          <Card wizardChrome={langWizShell} pad={langWizShell ? 14 : 12} className={stab === "shop" ? "erp-bizset-region-card" : undefined}>
            {langWizShell ? (
              <CardTitle variant="wizard" sub="Choose your country and currency—they stay aligned for symbols and regional options. For Euro (€), pick the country that matches your business (for example Germany, France, or Italy).">
                Country &amp; currency
              </CardTitle>
            ) : stab === "shop" ? (
              <React.Fragment>
                <div className="erp-bizset-block-label">Country &amp; Currency</div>
                <div className="erp-bizset-note is-muted">Country and currency stay in sync for correct symbols and regional options.</div>
              </React.Fragment>
            ) : (
              <CardTitle sub="Country and currency stay in sync for correct symbols and regional options.">
                Country &amp; currency
              </CardTitle>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: langWizShell ? 8 : 12, alignItems: "end" }}>
              <div ref={countryPickerWrapRef} style={{ position: "relative", zIndex: countrySearchOpen ? 50 : 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Country</div>
                <input
                  type="text"
                  placeholder="Search curated countries…"
                  value={countryInputDisplay}
                  onChange={function (e) {
                    setCountrySearchQ(e.target.value);
                    if (!countrySearchOpen) setCountrySearchOpen(true);
                  }}
                  onFocus={function () {
                    setCountrySearchOpen(true);
                    setCountrySearchQ(selectedCountryLabel || "");
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: langWizShell ? "7px 10px" : "9px 12px", fontSize: langWizShell ? 12 : 13, outline: "none", background: "#fff", color: C.text }}
                />
                {countrySearchOpen && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: 4,
                      maxHeight: 280,
                      overflowY: "auto",
                      background: "#fff",
                      border: "1.5px solid " + C.border,
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={function (e) { e.preventDefault(); }}
                      onClick={function () {
                        applyShopCountry("");
                        setCountrySearchOpen(false);
                        setCountrySearchQ("");
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        fontSize: 13,
                        border: "none",
                        borderBottom: "1px solid " + C.borderLight,
                        background: !f.shopCountry ? C.accentSoft : "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                        color: C.muted,
                      }}
                    >
                      — Not set —
                    </button>
                    {(function () {
                      var q = (countrySearchQ || "").trim().toLowerCase();
                      var list = !q
                        ? CURATED_COUNTRIES
                        : CURATED_COUNTRIES.filter(function (c) {
                          return c.name.toLowerCase().indexOf(q) >= 0 || c.code.toLowerCase().indexOf(q) >= 0;
                        });
                      if (list.length === 0) {
                        return <div style={{ padding: "14px 12px", fontSize: 13, color: C.muted }}>No countries match your search.</div>;
                      }
                      return list.map(function (c) {
                        var active = (f.shopCountry || "") === c.code;
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onMouseDown={function (e) { e.preventDefault(); }}
                            onClick={function () {
                              applyShopCountry(c.code);
                              setCountrySearchOpen(false);
                              setCountrySearchQ("");
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 12px",
                              fontSize: 13,
                              border: "none",
                              borderBottom: "1px solid " + C.borderLight,
                              background: active ? C.accentSoft : "#fff",
                              cursor: "pointer",
                              color: C.textMd,
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            <span style={{ fontWeight: 700, marginRight: 8, color: C.muted }}>{c.code}</span>
                            {c.name}
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Currency</div>
                <select
                  value={currencySelectValue}
                  onChange={function (e) {
                    var sym = e.target.value;
                    updateCurrencySymbol(sym);
                    var iso = getPrimaryCountryForCurrency(sym);
                    setF(function (x) {
                      var next = Object.assign({}, x, { currency: sym });
                      if (!iso) return next;
                      return Object.assign({}, next, {
                        shopCountry: iso,
                        defaultInvoiceLang: "en",
                        optionalInvoiceLangs: [],
                        customInvoiceLangs: [],
                        selectedTaxes: mergeTaxesOnCountryChange(iso, x.selectedTaxes),
                      });
                    });
                  }}
                  style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: langWizShell ? "7px 10px" : "9px 12px", fontSize: langWizShell ? 12 : 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                >
                  {APP_CURRENCY_OPTIONS.map(function (opt) {
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: langWizShell ? 8 : 12, marginTop: langWizShell ? 8 : 12, alignItems: "stretch" }}>
              <div style={{ padding: langWizShell ? "8px 10px" : "10px 14px", background: C.accentSoft, borderRadius: 8, border: "1.5px solid " + C.border }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Live amount preview</div>
                <div style={{ fontSize: langWizShell ? 15 : 18, fontWeight: 700, color: C.accent }}>{currencySelectValue + " " + fmtNum(1234567)}</div>
              </div>
              <div style={{ fontSize: langWizShell ? 11 : 12, color: C.muted, lineHeight: 1.4, padding: langWizShell ? "4px 0" : "8px 0" }}>
                Only supported country–currency pairs are listed. Picking a currency sets the matching country; picking a country sets its currency.
              </div>
            </div>
          </Card>

          <Card wizardChrome={langWizShell} pad={langWizShell ? 14 : 20} className={stab === "shop" ? "erp-bizset-region-card" : undefined}>
            {langWizShell ? (
              <CardTitle variant="wizard" sub="Optional. Suggested rates match your country; you can edit or add custom taxes.">
                Tax
              </CardTitle>
            ) : stab === "shop" ? (
              <React.Fragment>
                <div className="erp-bizset-block-label">Tax Setup</div>
                <div className="erp-bizset-note is-muted">Optional — suggested rates load from your country; edit or add custom taxes.</div>
              </React.Fragment>
            ) : (
              <CardTitle sub="Optional — enable taxes for your region. Suggested rates load from your selected country; you can edit percentages and add custom taxes.">
                Tax setup
              </CardTitle>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: langWizShell ? 8 : 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: langWizShell ? "6px 10px" : "10px 14px", borderRadius: 8, border: "1.5px solid " + (f.taxEnabled ? C.accent : C.border), background: f.taxEnabled ? C.accentSoft : "#fff" }}>
                <input
                  type="checkbox"
                  checked={f.taxEnabled === true}
                  onChange={function (e) {
                    var on = e.target.checked;
                    setF(function (x) {
                      var patch = { taxEnabled: on };
                      if (on && (!(x.selectedTaxes || []).length) && x.shopCountry) {
                        patch.selectedTaxes = mergeTaxesOnCountryChange(x.shopCountry, []);
                      }
                      return Object.assign({}, x, patch);
                    });
                  }}
                  style={{ width: 16, height: 16, accentColor: C.accent }}
                />
                <span style={{ fontWeight: 600, fontSize: langWizShell ? 12 : 13, color: f.taxEnabled ? C.accent : C.textMd }}>Enable Tax</span>
              </label>

              {f.taxEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: langWizShell ? 8 : 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                    {f.shopCountry
                      ? "Taxes below match your country where we provide defaults. Change country above to refresh suggestions — your custom taxes are kept."
                      : "Select a country above to load suggested taxes (e.g. VAT, GST). You can still add custom taxes."}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(f.selectedTaxes || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted, padding: "10px 12px", border: "1.5px dashed " + C.border, borderRadius: 8 }}>No taxes yet. Select a country or add a custom tax.</div>
                    ) : (
                      (f.selectedTaxes || []).map(function (t, idx) {
                        return (
                          <div
                            key={"tax-" + idx}
                            style={{
                              display: "grid",
                              gridTemplateColumns: f.taxCompoundMode === "cascade" ? "28px minmax(0, 1fr) 88px 120px" : "28px minmax(0, 1fr) 88px",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1.5px solid " + C.border,
                              background: "#fafbff",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={t.enabled !== false}
                              onChange={function () {
                                setF(function (x) {
                                  var list = (x.selectedTaxes || []).map(function (row, i) {
                                    if (i !== idx) return row;
                                    var wasOn = row.enabled !== false;
                                    return Object.assign({}, row, { enabled: !wasOn });
                                  });
                                  return Object.assign({}, x, { selectedTaxes: list });
                                });
                              }}
                              style={{ width: 16, height: 16, accentColor: C.accent, justifySelf: "center" }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMd }}>{t.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={t.rate === undefined || t.rate === null ? "" : t.rate}
                                onChange={function (e) {
                                  var raw = e.target.value;
                                  var v = parseFloat(raw);
                                  setF(function (x) {
                                    var list = (x.selectedTaxes || []).map(function (row, i) {
                                      if (i !== idx) return row;
                                      return Object.assign({}, row, { rate: raw === "" || isNaN(v) ? 0 : v });
                                    });
                                    return Object.assign({}, x, { selectedTaxes: list });
                                  });
                                }}
                                style={{
                                  width: 64,
                                  textAlign: "right",
                                  padding: "6px 8px",
                                  border: "1.5px solid " + C.border,
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontFamily: "'JetBrains Mono',monospace",
                                  boxSizing: "border-box",
                                }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 14 }}>%</span>
                            </div>
                            {f.taxCompoundMode === "cascade" && (
                              <select
                                value={t.appliesOn === "running" ? "running" : "net"}
                                onChange={function (e) {
                                  setF(function (x) {
                                    var list = (x.selectedTaxes || []).map(function (row, i) {
                                      if (i !== idx) return row;
                                      return Object.assign({}, row, { appliesOn: e.target.value, order: row.order != null ? row.order : idx + 1 });
                                    });
                                    return Object.assign({}, x, { selectedTaxes: list });
                                  });
                                }}
                                style={{ border: "1.5px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 11, background: "#fff" }}
                              >
                                <option value="net">On net</option>
                                <option value="running">On running</option>
                              </select>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <div ref={taxModeTooltipRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8 }}
                      onMouseEnter={taxTipFine ? function () { setTaxModeTooltipOpen(true); } : undefined}
                      onMouseLeave={taxTipFine ? function () { setTaxModeTooltipOpen(false); } : undefined}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Tax Mode</span>
                      <button
                        type="button"
                        aria-label="How tax mode works"
                        onClick={function (e) {
                          e.preventDefault();
                          if (!taxTipFine) setTaxModeTooltipOpen(function (o) { return !o; });
                        }}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          border: "1.5px solid " + C.border,
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.accent,
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ⓘ
                      </button>
                      {taxModeTooltipOpen && (
                        <div
                          style={{
                            position: "absolute",
                            zIndex: 120,
                            left: 0,
                            bottom: "100%",
                            marginBottom: 8,
                            width: 280,
                            padding: "12px 14px",
                            borderRadius: 10,
                            border: "1.5px solid " + C.border,
                            background: "#fff",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                            fontSize: 12,
                            color: C.textMd,
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: 8, color: C.accent }}>Exclusive</div>
                          <div>Price: 100</div>
                          <div>Tax (10%): 10</div>
                          <div style={{ marginBottom: 10 }}>Total: 110</div>
                          <div style={{ fontWeight: 800, marginBottom: 8, color: C.accent }}>Inclusive</div>
                          <div>Price: 110</div>
                          <div>Tax inside: 10</div>
                          <div>Total: 110</div>
                        </div>
                      )}
                    </div>
                    <select
                      value={f.taxMode === "inclusive" ? "inclusive" : "exclusive"}
                      onChange={function (e) {
                        setF(function (x) { return Object.assign({}, x, { taxMode: e.target.value }); });
                      }}
                      style={{ minWidth: 160, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                    >
                      <option value="exclusive">Exclusive</option>
                      <option value="inclusive">Inclusive</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Multiple taxes</span>
                    <select
                      value={f.taxCompoundMode === "cascade" ? "cascade" : "parallel"}
                      onChange={function (e) {
                        setF(function (x) { return Object.assign({}, x, { taxCompoundMode: e.target.value }); });
                      }}
                      style={{ maxWidth: 420, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                    >
                      <option value="parallel">Parallel — each tax on the same net amount</option>
                      <option value="cascade">Cascade — later taxes on net + earlier taxes (e.g. SSCL then VAT)</option>
                    </select>
                    {f.taxCompoundMode === "cascade" && (
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                        Use tax order in the list above. Taxes marked “on running” apply after prior taxes (Sri Lanka SSCL → VAT style).
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>Calculate tax on</span>
                    <select
                      value={f.taxApplyBase === "before_discount" ? "before_discount" : "after_discount"}
                      onChange={function (e) {
                        setF(function (x) { return Object.assign({}, x, { taxApplyBase: e.target.value }); });
                      }}
                      style={{ maxWidth: 420, border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: C.text }}
                    >
                      <option value="after_discount">Cart subtotal after discount (default)</option>
                      <option value="before_discount">Cart subtotal before discount (exclusive tax only)</option>
                    </select>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>
                      Default: discount reduces the taxable base. “Before discount” charges tax on the full subtotal, then subtracts the discount from the invoice total (exclusive mode). Inclusive mode uses after-discount base.
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Add custom tax</div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
                      <div style={{ flex: "1 1 140px", minWidth: 120 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Name</div>
                        <input
                          type="text"
                          value={taxCustomName}
                          onChange={function (e) { setTaxCustomName(e.target.value); }}
                          placeholder="e.g. Service fee"
                          style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
                        />
                      </div>
                      <div style={{ width: 88 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>%</div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={taxCustomRate}
                          onChange={function (e) { setTaxCustomRate(e.target.value); }}
                          placeholder="0"
                          style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "8px 10px", fontSize: 13, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={function () {
                          var name = taxCustomName.trim();
                          if (!name) return;
                          var rate = parseFloat(taxCustomRate);
                          setF(function (x) {
                            var list = (x.selectedTaxes || []).concat([{ name: name, rate: isNaN(rate) ? 0 : rate, enabled: true, custom: true }]);
                            return Object.assign({}, x, { selectedTaxes: list });
                          });
                          setTaxCustomName("");
                          setTaxCustomRate("");
                        }}
                        style={{
                          padding: "9px 14px",
                          borderRadius: 8,
                          border: "1.5px dashed " + C.accent,
                          background: C.accentSoft,
                          color: C.accent,
                          fontWeight: 800,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        + Add Custom Tax
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div>
            {props.embeddedWizard === "langcurrency" ? (
              langWizShell ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 6, borderTop: "1px solid #e8ecf4", marginTop: 2 }}>
                    <button type="button" className="erp-set-wizard-back" onClick={function () { if (onWizardBack) onWizardBack(); }}>← Back</button>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "flex-end", flex: "1 1 auto" }}>
                      <button
                        type="button"
                        onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1.5px solid #e2e8f0",
                          background: "#fff",
                          color: C.textMd,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Skip for now
                      </button>
                      <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}>Finish setup →</Btn>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, maxWidth: 420, lineHeight: 1.4 }}>Shop name and a phone or address are still required. Other tax options stay at defaults.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <Btn col="cyan" onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}>Save &amp; Finish setup</Btn>
                  <button
                    type="button"
                    onClick={function () { runWizardCoreIdentityStep(function () { save({ silent: true }); if (props.onWizardComplete) props.onWizardComplete(); }); }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1.5px solid " + C.border,
                      background: "#fff",
                      color: C.textMd,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Skip for now
                  </button>
                  <span style={{ fontSize: 11, color: C.muted, maxWidth: 280, lineHeight: 1.4 }}>Shop name and a phone or address are still required. Other tax options stay at defaults.</span>
                </div>
              )
            ) : stab === "shop" ? (
              <button type="button" className="erp-bizset-save" onClick={save}>Save Business Settings</button>
            ) : (
              <Btn col="blue" onClick={save}>Save Currency</Btn>
            )}
          </div>
        </div>
      )}

      {stab === "invoice" && (
        <div className="erp-invd-page">
          <div className="erp-invd-wrap">
            <Card className="erp-invd-card">
              <div className="erp-invd-brand">
                <div className="erp-invd-brand-ico" aria-hidden="true">🧾</div>
                <div>
                  <div className="erp-invd-title">Invoice Design</div>
                  <div className="erp-invd-sub">Footer, warranty, logo, paper size and live preview</div>
                </div>
              </div>

              <div className="erp-invd-top">
                <div className="erp-invd-block">
                  <div className="erp-invd-block-label">Footer Message</div>
                  <Input compact={denseWiz} label="Shown at bottom of printed invoices" value={f.footer || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { footer: e.target.value }); }); }} placeholder="Thank you for shopping with us!" />
                </div>

                <div className="erp-invd-block">
                  <div className="erp-invd-block-label">Warranty Policy</div>
                  <label className={"erp-invd-check" + (f.warrantyEnabled ? " is-on" : "")}>
                    <input type="checkbox" checked={f.warrantyEnabled} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { warrantyEnabled: e.target.checked }); }); }} />
                    <span className="erp-invd-check-title">Enable warranty text on invoices</span>
                  </label>
                  {f.warrantyEnabled ? (
                    <textarea
                      className="erp-invd-textarea"
                      value={f.warrantyText || ""}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { warrantyText: e.target.value }); }); }}
                      rows={5}
                      placeholder="Warranty terms…"
                    />
                  ) : null}
                </div>

                <div className="erp-invd-block">
                  <div className="erp-invd-block-label">WhatsApp PDF Folder</div>
                  <div className="erp-invd-note is-blue">PDFs shared via WhatsApp save here (not Downloads). Default: Documents/TechonERP/Invoices.</div>
                  <div className="erp-invd-path">{f.invoicePdfFolder || "Documents/TechonERP/Invoices (default)"}</div>
                  <div className="erp-invd-tools">
                    <Btn col="blue" onClick={async function () {
                      if (window.electronAPI && window.electronAPI.selectFolder) {
                        var folder = await window.electronAPI.selectFolder();
                        if (folder) {
                          setF(function (x) { return Object.assign({}, x, { invoicePdfFolder: folder }); });
                          var ns = Object.assign({}, state.settings, f, { invoicePdfFolder: folder });
                          S.set("tc3_settings", ns);
                          setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                          showAlert("Invoice PDF folder saved.");
                        }
                      } else {
                        showAlert("Folder selection is only available in the desktop app.");
                      }
                    }}>Select folder</Btn>
                    {f.invoicePdfFolder ? (
                      <Btn col="gray" onClick={function () {
                        setF(function (x) { return Object.assign({}, x, { invoicePdfFolder: "" }); });
                        var ns = Object.assign({}, state.settings, f, { invoicePdfFolder: "" });
                        S.set("tc3_settings", ns);
                        setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                        showAlert("Reset to default folder (Documents/TechonERP/Invoices).");
                      }}>Use default</Btn>
                    ) : null}
                  </div>
                </div>
              </div>

              {(function () {
                var isA4A5 = invFmt === "a4a5";

                var logoBlock = (
                  <div className="erp-invd-section">
                    <div className="erp-invd-section-label">{isA4A5 ? "Logo for A4 / A5" : "Logo for Thermal"}</div>
                    {f.invoiceLogo ? (
                      <div className="erp-invd-logo">
                        <div className="erp-invd-logo-row">
                          <img
                            src={f.invoiceLogo}
                            alt="logo"
                            className="erp-invd-logo-img"
                            style={{ width: isA4A5 ? (f.invoiceLogoSize || 80) : (f.thermalLogoSize || 40) }}
                          />
                          <Btn sm col="red" onClick={removeLogo}>Remove</Btn>
                        </div>
                        {isA4A5 ? (
                          <div className="erp-invd-slider">
                            <div className="erp-invd-slider-label">A4/A5 logo size — {f.invoiceLogoSize || 80}px</div>
                            <div className="erp-invd-slider-row">
                              <span>Small</span>
                              <input type="range" min="40" max="200" value={f.invoiceLogoSize || 80} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { invoiceLogoSize: parseInt(e.target.value) }); }); }} />
                              <span>Large</span>
                              <strong>{f.invoiceLogoSize || 80}px</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="erp-invd-slider">
                            <div className="erp-invd-slider-label">Thermal logo size — {f.thermalLogoSize || 40}px</div>
                            <div className="erp-invd-slider-row">
                              <span>Small</span>
                              <input type="range" min="20" max="80" value={f.thermalLogoSize || 40} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalLogoSize: parseInt(e.target.value) }); }); }} />
                              <span>Large</span>
                              <strong>{f.thermalLogoSize || 40}px</strong>
                            </div>
                          </div>
                        )}
                        {isA4A5 ? (
                          <div className="erp-invd-pills">
                            {[["left", "Left"], ["center", "Center"], ["right", "Right"]].map(function (al) {
                              var isA = (f.invoiceLogoAlign || "left") === al[0];
                              return (
                                <button
                                  key={al[0]}
                                  type="button"
                                  className={"erp-invd-pill" + (isA ? " is-active" : "")}
                                  onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceLogoAlign: al[0] }); }); }}
                                >
                                  {al[1]}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="erp-invd-upload">
                        <div className="erp-invd-hint">Upload PNG/JPG logo</div>
                        <label className="erp-invd-upload-btn">
                          Choose Logo
                          <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
                        </label>
                      </div>
                    )}
                  </div>
                );

                var a4a5Controls = (
                  <div className="erp-invd-controls">
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Default Paper Size</div>
                      <div className="erp-invd-choice">
                        {[["a4", "A4", "Full page"], ["a5", "A5", "Half page"]].map(function (s) {
                          var active = (f.invoiceDefaultSize || "a4") === s[0];
                          return (
                            <button
                              key={s[0]}
                              type="button"
                              className={"erp-invd-choice-btn" + (active ? " is-active" : "")}
                              onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceDefaultSize: s[0] }); }); }}
                            >
                              <div>{active ? "✓ " : ""}{s[1]}</div>
                              <div className="erp-invd-choice-sub">{s[2]}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Shop Name Size</div>
                      <div className="erp-invd-slider-row">
                        <span>S</span>
                        <input type="range" min="10" max="36" step="1" value={f.shopNameFontSize || 15} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopNameFontSize: parseInt(e.target.value) }); }); }} />
                        <span>L</span>
                        <strong>{f.shopNameFontSize || 15}px</strong>
                      </div>
                      <div className="erp-invd-preview-chip">
                        <span style={{ fontWeight: 900, fontSize: f.shopNameFontSize || 15, color: f.invoiceAccentColor || "#0d47a1", textTransform: "uppercase" }}>{f.shopName || "Techon Computers"}</span>
                      </div>
                    </div>
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Address / Phone / Email Size</div>
                      <div className="erp-invd-slider-row">
                        <span>S</span>
                        <input type="range" min="8" max="16" step="1" value={f.shopInfoFontSize || 11} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { shopInfoFontSize: parseInt(e.target.value) }); }); }} />
                        <span>L</span>
                        <strong>{f.shopInfoFontSize || 11}px</strong>
                      </div>
                      <div className="erp-invd-preview-chip is-stack">
                        {[f.address, f.phone ? "Phone: " + f.phone : null, f.email, f.website].filter(Boolean).slice(0, 3).map(function (line, i) {
                          return <span key={i} style={{ fontSize: f.shopInfoFontSize || 11, color: "#555" }}>{line}</span>;
                        })}
                        {!f.address && !f.phone ? <span style={{ fontSize: f.shopInfoFontSize || 11, color: "#aaa" }}>123 Main Street, Negombo · +94 77 123 4567</span> : null}
                      </div>
                    </div>
                    {logoBlock}
                  </div>
                );

                var thermalControls = (
                  <div className="erp-invd-controls">
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Default Thermal Size</div>
                      <div className="erp-invd-choice">
                        {[["thermal58", "58mm", "Narrow"], ["thermal80", "80mm", "Standard POS"]].map(function (s) {
                          var active = (f.invoiceThermalSize || "thermal80") === s[0];
                          return (
                            <button
                              key={s[0]}
                              type="button"
                              className={"erp-invd-choice-btn is-thermal" + (active ? " is-active" : "")}
                              onClick={function () { setF(function (x) { return Object.assign({}, x, { invoiceThermalSize: s[0] }); }); }}
                            >
                              <div>{active ? "✓ " : ""}{s[1]}</div>
                              <div className="erp-invd-choice-sub">{s[2]}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Shop Name Size</div>
                      <div className="erp-invd-slider-row">
                        <span>S</span>
                        <input type="range" min="10" max="28" step="1" value={f.thermalShopNameSize || 18} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalShopNameSize: parseInt(e.target.value) }); }); }} />
                        <span>L</span>
                        <strong>{f.thermalShopNameSize || 18}px</strong>
                      </div>
                      <div className="erp-invd-preview-chip is-center is-thermal">
                        <span style={{ fontWeight: 900, fontSize: f.thermalShopNameSize || 18, textTransform: "uppercase", letterSpacing: "0.08em" }}>{f.shopName || "Techon Computers"}</span>
                      </div>
                    </div>
                    <div className="erp-invd-section">
                      <div className="erp-invd-section-label">Address / Phone / Email Size</div>
                      <div className="erp-invd-slider-row">
                        <span>S</span>
                        <input type="range" min="7" max="13" step="1" value={f.thermalInfoSize || 10} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { thermalInfoSize: parseInt(e.target.value) }); }); }} />
                        <span>L</span>
                        <strong>{f.thermalInfoSize || 10}px</strong>
                      </div>
                      <div className="erp-invd-preview-chip is-center is-thermal is-stack">
                        <div style={{ fontSize: f.thermalInfoSize || 10, color: "#333" }}>{f.address || "123 Main Street, Negombo"}</div>
                        <div style={{ fontSize: f.thermalInfoSize || 10, color: "#333" }}>{f.phone || "+94 31 222 3456"}</div>
                      </div>
                    </div>
                    {logoBlock}
                  </div>
                );

                var previews = isA4A5 ? (
                  <div className="erp-invd-previews">
                    <div className="erp-invd-preview-head">
                      <span>A4 — Live Preview</span>
                      <button type="button" className="erp-invd-view" onClick={function () { setPreviewInv("a4"); }}>View Full</button>
                    </div>
                    <div className="erp-invd-preview-frame" style={{ height: 320 }}>
                      <div style={{ transform: "scale(0.38)", transformOrigin: "top left", width: "263%", pointerEvents: "none" }}>
                        <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size="a4" />
                      </div>
                    </div>
                    <div className="erp-invd-preview-head">
                      <span>A5 — Live Preview</span>
                      <button type="button" className="erp-invd-view" onClick={function () { setPreviewInv("a5"); }}>View Full</button>
                    </div>
                    <div className="erp-invd-preview-frame" style={{ height: 260 }}>
                      <div style={{ transform: "scale(0.46)", transformOrigin: "top left", width: "217%", pointerEvents: "none" }}>
                        <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size="a5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="erp-invd-previews is-thermal-row">
                    <div className="erp-invd-preview-col">
                      <div className="erp-invd-preview-head">
                        <span>80mm — Live Preview</span>
                        <button type="button" className="erp-invd-view is-thermal" onClick={function () { setPreviewInv("thermal80"); }}>View Full</button>
                      </div>
                      <div className="erp-invd-preview-frame" style={{ height: 320 }}>
                        <div style={{ transform: "scale(0.75)", transformOrigin: "top left", width: "133%", pointerEvents: "none" }}>
                          <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={302} />
                        </div>
                      </div>
                    </div>
                    <div className="erp-invd-preview-col">
                      <div className="erp-invd-preview-head">
                        <span>58mm — Live Preview</span>
                        <button type="button" className="erp-invd-view is-thermal" onClick={function () { setPreviewInv("thermal58"); }}>View Full</button>
                      </div>
                      <div className="erp-invd-preview-frame" style={{ height: 320 }}>
                        <div style={{ transform: "scale(0.75)", transformOrigin: "top left", width: "133%", pointerEvents: "none" }}>
                          <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={218} />
                        </div>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <div className="erp-invd-design">
                    <div className="erp-invd-fmt" role="tablist" aria-label="Invoice format">
                      {[["a4a5", "A4 / A5 Invoice"], ["thermal", "Thermal Receipt"]].map(function (tab) {
                        var active = invFmt === tab[0];
                        return (
                          <button
                            key={tab[0]}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={"erp-invd-fmt-btn" + (active ? " is-active" : "") + (tab[0] === "thermal" ? " is-thermal" : "")}
                            onClick={function () { setInvFmt(tab[0]); }}
                          >
                            {tab[1]}
                          </button>
                        );
                      })}
                    </div>

                    <div className="erp-invd-main">
                      <div className="erp-invd-block erp-invd-settings">
                        <div className="erp-invd-block-label">{isA4A5 ? "A4 / A5 Settings" : "Thermal Settings"}</div>
                        {isA4A5 ? a4a5Controls : thermalControls}
                      </div>
                      <div className="erp-invd-block erp-invd-live">
                        <div className="erp-invd-block-label">Live Preview</div>
                        {previews}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <button type="button" className="erp-invd-save" onClick={save}>Save Invoice Design</button>
            </Card>
          </div>
        </div>
      )}

      {stab === "restaurantsetup" && isRestaurantBusiness && (
        <div className="erp-set-stack">
          <Card>
            <CardTitle sub="Choose the default order flow and manage restaurant tables">Restaurant Setup</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {restaurantSetupMsg && (
                <div style={{ background: restaurantSetupMsg.type === "error" ? "#fef2f2" : "#f0fdf4", border: "1px solid " + (restaurantSetupMsg.type === "error" ? "#fca5a5" : "#86efac"), borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: restaurantSetupMsg.type === "error" ? "#b91c1c" : "#166534", fontWeight: 700 }}>
                  {restaurantSetupMsg.text}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,320px) 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ border: "1.5px solid " + C.border, borderRadius: 12, padding: "14px 16px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Default Order Type</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>This becomes the starting mode when restaurant sales opens or resets after sending an order.</div>
                  <select
                    value={restaurantDefaultOrderType}
                    onChange={function (e) {
                      saveRestaurantSetup(e.target.value, restaurantSetupTables, "Restaurant setup updated.");
                    }}
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, background: "#fff", color: C.text, fontFamily: "inherit" }}
                  >
                    <option value="takeaway">Takeaway</option>
                    <option value="dine-in">Dine-in</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
                <div style={{ border: "1.5px solid " + C.border, borderRadius: 12, padding: "14px 16px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Table Manager</div>
                      <div style={{ fontSize: 12, color: C.muted }}>Add, rename, or remove free tables used by the restaurant workflow.</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textMd }}>
                      {restaurantSetupTables.length} table{restaurantSetupTables.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <Input label="New Table" value={newRestaurantTableName} onChange={function (e) { setNewRestaurantTableName(e.target.value); setRestaurantSetupMsg(null); }} placeholder="T7 or Table 10" />
                    </div>
                    <Btn col="cyan" onClick={addRestaurantSetupTable}>Add Table</Btn>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "48vh", overflowY: "auto" }}>
                    {restaurantSetupTables.map(function (t) {
                      return (
                        <div key={"settings-restaurant-table-" + t.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid " + C.borderLight, borderRadius: 10, padding: "9px 10px", background: "#fff" }}>
                          <input
                            type="text"
                            defaultValue={t.name || t.id}
                            onBlur={function (e) { renameRestaurantSetupTable(t.id, e.target.value); }}
                            onKeyDown={function (e) {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                e.currentTarget.value = t.name || t.id;
                                e.currentTarget.blur();
                              }
                            }}
                            style={{ flex: 1, border: "1.5px solid " + C.border, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", background: "#fff", color: C.text }}
                          />
                          <span style={{ fontSize: 10.5, fontWeight: 800, border: "1px solid " + (t.status === "free" ? "#86efac" : (t.status === "occupied" ? "#fca5a5" : "#fcd34d")), background: t.status === "free" ? "#dcfce7" : (t.status === "occupied" ? "#fee2e2" : "#fef3c7"), color: t.status === "free" ? "#166534" : (t.status === "occupied" ? "#991b1b" : "#92400e"), borderRadius: 999, padding: "4px 8px", whiteSpace: "nowrap" }}>
                            {t.status === "free" ? "Free" : (t.status === "occupied" ? "Occupied" : "Pending")}
                          </span>
                          <button
                            type="button"
                            onClick={function () { deleteRestaurantSetupTable(t.id); }}
                            style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#b91c1c", borderRadius: 8, padding: "6px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {stab === "backup" && (
        <div className="erp-bak-page">
          <div className="erp-bak-wrap">
            <Card className="erp-bak-card">
              <div className="erp-bak-brand">
                <div className="erp-bak-brand-ico" aria-hidden="true">💾</div>
                <div>
                  <div className="erp-bak-title">Backup</div>
                  <div className="erp-bak-sub">Folder, download, restore, cloud and reset</div>
                </div>
              </div>

              {bakMsg ? (
                <div className={"erp-bak-banner" + (bakMsg.type === "error" ? " is-err" : " is-ok")}>{bakMsg.text}</div>
              ) : null}

              {(function () {
                var manualT = S.get("tc3_last_manual_backup", null);
                var autoT = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null);
                var bestMs = Math.max(manualT ? new Date(manualT).getTime() : 0, autoT ? new Date(autoT).getTime() : 0);
                if (bestMs === 0) {
                  return <div className="erp-bak-banner is-warn">No backup found. Download a backup now to protect your shop data.</div>;
                }
                var ageDays = (Date.now() - bestMs) / (1000 * 60 * 60 * 24);
                if (ageDays >= 2) {
                  return (
                    <div className="erp-bak-banner is-warn">
                      Last backup was <strong>{Math.floor(ageDays)} days ago</strong>. Please back up soon.
                    </div>
                  );
                }
                return null;
              })()}

              <div className="erp-bak-stats">
                <div className="erp-bak-stat">
                  <div className="erp-bak-stat-label">Manual</div>
                  <div className="erp-bak-stat-val">
                    {(function () { var t = S.get("tc3_last_manual_backup", null); return t ? "Downloaded" : "Never"; })()}
                  </div>
                  <div className="erp-bak-stat-sub">
                    {(function () { var t = S.get("tc3_last_manual_backup", null); return t ? new Date(t).toLocaleString() : "Use Download below"; })()}
                  </div>
                </div>
                <div className="erp-bak-stat">
                  <div className="erp-bak-stat-label">Auto</div>
                  <div className="erp-bak-stat-val">
                    {(function () { var t = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null); return t ? "Saved" : "Pending"; })()}
                  </div>
                  <div className="erp-bak-stat-sub">
                    {(function () { var t = S.get("tc3_last_auto_backup", null) || S.get("tc3_autobak_time", null); return t ? new Date(t).toLocaleString() : "Every 5 min"; })()}
                  </div>
                </div>
                <div className="erp-bak-stat">
                  <div className="erp-bak-stat-label">Auto file</div>
                  <div className="erp-bak-stat-val">Every 5 min</div>
                  <div className="erp-bak-stat-sub">Documents/TechonERP/backups/</div>
                </div>
                <div className="erp-bak-stat">
                  <div className="erp-bak-stat-label">Daily</div>
                  <div className="erp-bak-stat-val">
                    {(function () { var d = S.get("tc3_daily_bak_date", null); return d === new Date().toISOString().slice(0, 10) ? "Done" : "Pending"; })()}
                  </div>
                  <div className="erp-bak-stat-sub">
                    {(function () { var d = S.get("tc3_daily_bak_date", null); return d ? ("Last: " + d) : "Not yet today"; })()}
                  </div>
                </div>
              </div>

              <div className="erp-bak-block">
                <div className="erp-bak-block-label">Backup Folder</div>
                <div className="erp-bak-path">{f.backupFolder || "Documents/TechonERP/backups (Default)"}</div>
                <div className="erp-bak-tools">
                  <Btn col="blue" onClick={async function () {
                    if (window.electronAPI && window.electronAPI.selectFolder) {
                      const folder = await window.electronAPI.selectFolder();
                      if (folder) {
                        setF(function (x) { return Object.assign({}, x, { backupFolder: folder }); });
                        var ns = Object.assign({}, state.settings, f, { backupFolder: folder });
                        S.set("tc3_settings", ns);
                        setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                        setBakMsg({ type: "success", text: "Backup folder updated successfully." });
                      }
                    } else {
                      setBakMsg({ type: "error", text: "Folder selection is only available in the desktop app." });
                    }
                  }}>Select Folder</Btn>
                  {f.backupFolder ? (
                    <Btn col="gray" onClick={function () {
                      setF(function (x) { return Object.assign({}, x, { backupFolder: "" }); });
                      var ns = Object.assign({}, state.settings, f, { backupFolder: "" });
                      S.set("tc3_settings", ns);
                      setState(function (st) { return Object.assign({}, st, { settings: ns }); });
                      setBakMsg({ type: "success", text: "Reset to default backup folder." });
                    }}>Reset Default</Btn>
                  ) : null}
                </div>
              </div>

              <div className="erp-bak-split">
                <div className="erp-bak-block">
                  <div className="erp-bak-block-label">Download Backup</div>
                  <div className="erp-bak-note is-blue">
                    Downloads <strong>backup-YYYY-MM-DD.json</strong>. Auto-backup runs every 5 min and on exit (last 30 kept in Electron).
                  </div>
                  <div className="erp-bak-note is-amber">
                    Keep files in <strong>Documents\TechonERP\backups</strong> so they stay organised.
                  </div>
                  <div className="erp-bak-tools">
                    <Btn col="cyan" onClick={doManualBackup}>Download Backup Now</Btn>
                    <Btn col="blue" sm onClick={function () {
                      try {
                        var bakObj = S.get("tc3_autobak", null); var bak = bakObj ? JSON.stringify(bakObj, null, 2) : null;
                        if (!bak) { setBakMsg({ type: "error", text: "No auto-backup found yet." }); return; }
                        var b = JSON.parse(bak);
                        var url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }));
                        var a = document.createElement("a"); a.href = url; a.download = "techon-autobak.json"; a.click(); URL.revokeObjectURL(url);
                        setBakMsg({ type: "success", text: "Auto-backup exported!" });
                      } catch (e) { setBakMsg({ type: "error", text: "Failed: " + e.message }); }
                    }}>Export Last Auto-Backup</Btn>
                  </div>
                </div>

                <div className="erp-bak-block">
                  <div className="erp-bak-block-label">Restore</div>
                  <div className="erp-bak-note is-amber">
                    A <strong>safety backup of current data</strong> downloads automatically before restore.
                  </div>
                  <label className="erp-bak-restore">
                    Choose Backup File to Restore
                    <input type="file" accept=".json" onChange={doRestore} style={{ display: "none" }} />
                  </label>
                </div>
              </div>

              <div className="erp-bak-block">
                <div className="erp-bak-block-label">Excel / CSV Export</div>
                <div className="erp-bak-note is-green">
                  Exports Products, Sales, Purchases, Customers, Expenses and Repairs as CSV for Excel or Sheets.
                </div>
                <div className="erp-bak-tools">
                  <Btn col="green" onClick={doExcelExport}>Export All Data to CSV/Excel</Btn>
                </div>
              </div>

              <div className="erp-bak-block">
                <div className="erp-bak-block-label">Cloud Dashboard Sync</div>
                {S.get("tc3_cloud_sync", false) && S.get("tc3_cloud_email", null) ? (
                  <div className="erp-bak-cloud">
                    <div className="erp-bak-note is-green">
                      <strong>Cloud sync active</strong> — {S.get("tc3_cloud_email", "")}
                      {S.get("tc3_last_cloud_sync", null) ? (
                        <span> · Last: {new Date(S.get("tc3_last_cloud_sync", "")).toLocaleString()}</span>
                      ) : null}
                    </div>
                    <div className="erp-bak-tools">
                      <Btn col="green" onClick={function () {
                        var apiKey = S.get("tc3_cloud_api_key", null);
                        if (!apiKey) { setCloudMsg({ type: "error", text: "Not connected. Please disconnect and reconnect." }); return; }
                        if (typeof buildCloudSyncPayload !== "function") { setCloudMsg({ type: "error", text: "Sync unavailable — please update the app." }); return; }
                        setCloudMsg({ type: "info", text: "Syncing…" });
                        fetch("https://api.techon.lk/sync.php", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(buildCloudSyncPayload())
                        })
                          .then(function (r) { return r.text().then(function (txt) { return { r: r, txt: txt }; }); })
                          .then(function (o) {
                            var d = null;
                            try { d = o.txt && o.txt.trim() ? JSON.parse(o.txt) : null; } catch (e) { d = null; }
                            if (!o.r.ok) {
                              var errTxt = (d && (d.error || d.message)) ? (d.error || d.message) : (o.txt ? o.txt.slice(0, 160) : "");
                              setCloudMsg({ type: "error", text: "Sync failed (HTTP " + o.r.status + "): " + (errTxt || "Unknown error") });
                              return;
                            }
                            if (d && d.success) {
                              S.set("tc3_last_cloud_sync", new Date().toISOString());
                              setCloudMsg({ type: "success", text: "Synced successfully!" });
                            } else {
                              setCloudMsg({ type: "error", text: "Sync error: " + (d && (d.error || d.message) ? (d.error || d.message) : "Unknown") });
                            }
                          })
                          .catch(function (err) {
                            setCloudMsg({
                              type: "error",
                              text: "Could not reach api.techon.lk — " + (err && err.message ? err.message : "check firewall, VPN, or try again.") +
                                " (Your PC can be online even if this request fails.)",
                            });
                          });
                      }}>Sync Now</Btn>
                      <Btn col="red" onClick={function () {
                        showConfirm("Disconnect from cloud dashboard?", function () {
                          S.set("tc3_cloud_sync", false); S.set("tc3_cloud_email", null); S.set("tc3_cloud_pass", null); S.set("tc3_cloud_token", null); S.set("tc3_cloud_api_key", null);
                          showAlert("Disconnected. Reload the app to apply.");
                        });
                      }}>Disconnect</Btn>
                    </div>
                    {cloudMsg ? (
                      <div className={"erp-bak-banner is-inline" + (cloudMsg.type === "error" ? " is-err" : cloudMsg.type === "info" ? " is-info" : " is-ok")}>{cloudMsg.text}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="erp-bak-cloud">
                    <div className="erp-bak-note is-blue">Connect to <strong>app.techon.lk</strong> with your dashboard login.</div>
                    <div className="erp-bak-cloud-form">
                      <Input compact={denseWiz} label="Dashboard Email" type="email" value={cloudEmail} onChange={function (e) { setCloudEmail(e.target.value); setCloudMsg(null); }} placeholder="your@email.com" />
                      <Input compact={denseWiz} label="Dashboard Password" type="password" value={cloudPass} onChange={function (e) { setCloudPass(e.target.value); setCloudMsg(null); }} placeholder="Your dashboard password" />
                    </div>
                    {cloudMsg ? (
                      <div className={"erp-bak-banner is-inline" + (cloudMsg.type === "error" ? " is-err" : " is-ok")}>{cloudMsg.text}</div>
                    ) : null}
                    <div className="erp-bak-tools">
                      <Btn col="blue" disabled={cloudLoading || !cloudEmail || !cloudPass} onClick={function () {
                        setCloudLoading(true); setCloudMsg(null);
                        fetch("https://api.techon.lk/login.php", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: cloudEmail, password: cloudPass })
                        }).then(function (r) { return r.json(); }).then(function (d) {
                          setCloudLoading(false);
                          if (d.success) {
                            S.set("tc3_cloud_email", cloudEmail);
                            S.set("tc3_cloud_pass", cloudPass);
                            S.set("tc3_cloud_api_key", d.api_key);
                            S.set("tc3_cloud_sync", true);
                            setCloudMsg({ type: "success", text: "Connected! Cloud sync is now active." });
                            setCloudEmail(""); setCloudPass("");
                          } else {
                            setCloudMsg({ type: "error", text: d.error || "Login failed." });
                          }
                        }).catch(function () {
                          setCloudLoading(false);
                          setCloudMsg({ type: "error", text: "Cannot reach server. Check your internet." });
                        });
                      }}>{cloudLoading ? "Connecting…" : "Connect to Cloud Dashboard"}</Btn>
                    </div>
                    <div className="erp-bak-hint">No account? Register at <strong>app.techon.lk</strong> first.</div>
                  </div>
                )}
              </div>

              <div className="erp-bak-block">
                <div className="erp-bak-block-label">Raw Material Pricing Fix</div>
                <div className="erp-bak-note is-blue">
                  One-time correction when cost/price were saved as pack totals instead of per base unit. Dry-run, review, then apply.
                </div>
                <div className="erp-bak-tools">
                  <Btn col="blue" onClick={runRmBfDryRun}>Dry-run</Btn>
                  <Btn col="cyan" onClick={runRmBfApply} disabled={!rmBfPreview || !(rmBfPreview.changes && rmBfPreview.changes.length)}>Apply</Btn>
                  {rmBfPreview && rmBfPreview.changes && rmBfPreview.changes.length ? (
                    <span className="erp-bak-chip">{rmBfPreview.changes.length} change(s) ready</span>
                  ) : (
                    <span className="erp-bak-hint">Run dry-run to preview</span>
                  )}
                </div>
              </div>

              <div className="erp-bak-block is-danger">
                <div className="erp-bak-block-label is-danger">Reset System Data</div>
                <div className="erp-bak-reset">
                  <div className="erp-bak-hint is-danger">
                    Permanently wipes sales, purchases, products, customers, inventory, settings and more. A safety backup downloads first.
                  </div>
                  <Btn col="red" onClick={function () { setResetStep(1); setResetPw(""); setResetMsg(null); }}>Reset All Data</Btn>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {stab === "accounting" && (
        <div className="erp-acct-page">
          <div className="erp-acct-wrap">
            <Card className="erp-acct-card">
              <div className="erp-acct-brand">
                <div className="erp-acct-brand-ico" aria-hidden="true">⚖</div>
                <div>
                  <div className="erp-acct-title">Accounting</div>
                  <div className="erp-acct-sub">Period close, journal, costing and lock</div>
                </div>
              </div>

              <div className="erp-acct-intro">
                Bookkeeping options for accountants. Everyday shop setup stays on <strong>Shop Profile</strong> — leave defaults unless your accountant asks otherwise.
              </div>

              <div className="erp-acct-block">
                <div className="erp-acct-block-label">Period Close</div>
                <div className="erp-acct-note is-blue">Soft warning when editing records dated before the books-closed date.</div>
                <div className="erp-acct-inline">
                  <div className="erp-acct-field grow">
                    <Input compact={denseWiz} label="Books Closed Date" type="date" value={f.booksClosedDate || ""} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { booksClosedDate: e.target.value }); }); }} />
                  </div>
                  {f.booksClosedDate ? (
                    <button type="button" className="erp-acct-link-danger" onClick={function () { setF(function (x) { return Object.assign({}, x, { booksClosedDate: "" }); }); }}>Clear</button>
                  ) : null}
                  <button type="button" className="erp-acct-btn-sec" onClick={save}>Save period</button>
                </div>
                {f.booksClosedDate ? (
                  <div className="erp-acct-hint">Edits before <strong>{fmtDate(f.booksClosedDate)}</strong> require confirmation.</div>
                ) : null}
              </div>

              <div className="erp-acct-block">
                <div className="erp-acct-block-label">Journal &amp; Costing</div>
                <div className="erp-acct-note is-blue">
                  <strong>Live</strong> updates the journal on each sale. <strong>Repair</strong> rebuilds only on demand (large imports).
                </div>
                <div className="erp-acct-grid">
                  <div className="erp-acct-field">
                    <span className="erp-acct-field-label" id="tc-settings-gl-mode-lbl">Journal mode</span>
                    <select
                      id="tc-settings-gl-mode"
                      className="erp-acct-select"
                      aria-labelledby="tc-settings-gl-mode-lbl"
                      value={S.get("tc3_gl_mode", "live")}
                      onChange={function (e) {
                        S.set("tc3_gl_mode", e.target.value);
                        setState(function (st) { return Object.assign({}, st); });
                      }}
                    >
                      <option value="live">Live — journal authoritative (recommended)</option>
                      <option value="rebuild">Repair — rebuild on schedule / manual</option>
                    </select>
                  </div>
                  <div className="erp-acct-field">
                    <span className="erp-acct-field-label" id="tc-settings-inv-costing-lbl">Inventory costing</span>
                    <select
                      id="tc-settings-inv-costing"
                      className="erp-acct-select"
                      aria-labelledby="tc-settings-inv-costing-lbl"
                      value={f.inventoryCostingMethod || "wac"}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { inventoryCostingMethod: e.target.value }); }); }}
                    >
                      <option value="wac">Weighted average (line / product cost)</option>
                      <option value="fifo">FIFO (product fifoBatches when set)</option>
                    </select>
                  </div>
                  <div className="erp-acct-field">
                    <span className="erp-acct-field-label" id="tc-settings-pr-cost-mode-lbl">Purchase return cost</span>
                    <select
                      id="tc-settings-pr-cost-mode"
                      className="erp-acct-select"
                      aria-labelledby="tc-settings-pr-cost-mode-lbl"
                      value={f.purchaseReturnCostMode || "current_wac"}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { purchaseReturnCostMode: e.target.value }); }); }}
                      title="Current policy uses unit cost on the purchase line. original_cost is reserved for a future FIFO layer match."
                    >
                      <option value="current_wac">Current policy (line / WAC snapshot)</option>
                      <option value="original_cost">Original receipt cost (reserved)</option>
                    </select>
                    <span className="erp-acct-field-hint">GL uses stored line cost; product WAC is not recomputed on return.</span>
                  </div>
                  <div className="erp-acct-field">
                    <span className="erp-acct-field-label" id="tc-settings-lock-date-lbl">Lock date</span>
                    <input
                      id="tc-settings-lock-date"
                      className="erp-acct-select"
                      type="date"
                      aria-labelledby="tc-settings-lock-date-lbl"
                      value={f.lockedUntilDate || ""}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { lockedUntilDate: e.target.value }); }); }}
                    />
                    <span className="erp-acct-field-hint">Hard lock — no posts on or before this date</span>
                  </div>
                </div>
                {f.lockedUntilDate ? (
                  <div className="erp-acct-hint">Blocked through <strong>{fmtDate(f.lockedUntilDate)}</strong> unless Admin (PIN) is unlocked.</div>
                ) : null}
              </div>

              <div className="erp-acct-block">
                <div className="erp-acct-block-label">Lock &amp; Policies</div>
                <label className={"erp-acct-check" + (f.strictPeriodLock === true ? " is-on" : "")}>
                  <input
                    type="checkbox"
                    checked={f.strictPeriodLock === true}
                    onChange={function (e) { setF(function (x) { return Object.assign({}, x, { strictPeriodLock: e.target.checked }); }); }}
                  />
                  <span>
                    <span className="erp-acct-check-title">Strict period lock</span>
                    <span className="erp-acct-check-sub">Recommended for audit. Locked-period edits/deletes blocked; Admin PIN still bypasses.</span>
                  </span>
                </label>
                <div className="erp-acct-checks">
                  <label className={"erp-acct-check is-compact" + (!f.preventNegativeStock ? " is-on" : "")}>
                    <input
                      type="checkbox"
                      checked={!f.preventNegativeStock}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { preventNegativeStock: !e.target.checked }); }); }}
                    />
                    <span className="erp-acct-check-title">Allow negative stock</span>
                  </label>
                  <label className={"erp-acct-check is-compact" + (f.allowCostFallback === true ? " is-on" : "")}>
                    <input
                      type="checkbox"
                      checked={f.allowCostFallback === true}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { allowCostFallback: e.target.checked }); }); }}
                    />
                    <span className="erp-acct-check-title">FIFO line-cost fallback</span>
                  </label>
                  <label className={"erp-acct-check is-compact" + (f.glVatPostingEnabled !== false ? " is-on" : "")}>
                    <input
                      type="checkbox"
                      checked={f.glVatPostingEnabled !== false}
                      onChange={function (e) { setF(function (x) { return Object.assign({}, x, { glVatPostingEnabled: e.target.checked }); }); }}
                    />
                    <span className="erp-acct-check-title">Post VAT to GL</span>
                  </label>
                </div>
              </div>

              <div className="erp-acct-block">
                <div className="erp-acct-block-label">Tools</div>
                <div className="erp-acct-tools">
                  {typeof props.createFinancialSnapshot === "function" && (
                    <Btn col="gray" onClick={function () {
                      props.createFinancialSnapshot({ label: "Manual snapshot (Settings)" });
                    }}>Save snapshot</Btn>
                  )}
                  {typeof props.repairInventoryLayersFromReplay === "function" && (
                    <Btn col="cyan" onClick={props.repairInventoryLayersFromReplay}>Repair layers</Btn>
                  )}
                  {glDeveloperToolsSettings && exportSupportBundle && downloadSupportBundleJson && (
                    <Btn
                      col="gray"
                      onClick={function () {
                        try {
                          var bundle = exportSupportBundle({
                            periodFrom: supBndFrom,
                            periodTo: supBndTo,
                            anonymize: supBndAnon,
                            includeReplay: supBndReplay,
                            replayProductId: supBndPid || "",
                          });
                          downloadSupportBundleJson(bundle, "techon-support-bundle.json");
                        } catch (e) {
                          showAlert("Could not build support bundle.");
                        }
                      }}
                    >
                      Export support bundle
                    </Btn>
                  )}
                </div>

                {glDeveloperToolsSettings && exportSupportBundle && (
                  <div className="erp-acct-dev">
                    <Input type="date" label="Bundle from" value={supBndFrom} onChange={function (e) { setSupBndFrom(e.target.value); }} compact />
                    <Input type="date" label="Bundle to" value={supBndTo} onChange={function (e) { setSupBndTo(e.target.value); }} compact />
                    <label className={"erp-acct-check is-compact" + (supBndAnon ? " is-on" : "")}>
                      <input type="checkbox" checked={supBndAnon} onChange={function (e) { setSupBndAnon(e.target.checked); }} />
                      <span className="erp-acct-check-title">Anonymize</span>
                    </label>
                    <label className={"erp-acct-check is-compact" + (supBndReplay ? " is-on" : "")}>
                      <input type="checkbox" checked={supBndReplay} onChange={function (e) { setSupBndReplay(e.target.checked); }} />
                      <span className="erp-acct-check-title">Replay sample</span>
                    </label>
                    <Input label="Replay product ID" value={supBndPid} onChange={function (e) { setSupBndPid(e.target.value); }} placeholder="SKU id" compact />
                  </div>
                )}

                {typeof props.createFinancialSnapshot === "function" && (
                  <div className="erp-acct-snap">
                    {(function () {
                      var snaps = S.get("tc3_financial_snapshots", []);
                      var last = Array.isArray(snaps) && snaps.length ? snaps[snaps.length - 1] : null;
                      if (!last) {
                        return (
                          <div className="erp-acct-snap-status">
                            <span>No snapshots yet. New saves show as</span>
                            <SnapshotIntegrityBadge variant="sealed" />
                            <span>when saved.</span>
                          </div>
                        );
                      }
                      var sealed = !!(last.contentHash && validateSnapshotIntegrity(last));
                      var legacy = !last.contentHash;
                      return (
                        <div className="erp-acct-snap-status">
                          <span>Latest:</span>
                          {sealed ? (
                            <SnapshotIntegrityBadge variant="sealed" liveStatus />
                          ) : legacy ? (
                            <SnapshotIntegrityBadge variant="legacy" liveStatus />
                          ) : (
                            <SnapshotIntegrityBadge variant="failed" liveStatus />
                          )}
                          {last.label ? <span className="erp-acct-snap-label">{last.label}</span> : null}
                        </div>
                      );
                    })()}
                    {(function () {
                      var snaps = S.get("tc3_financial_snapshots", []);
                      if (!Array.isArray(snaps) || snaps.length === 0) return null;
                      var idx = Math.max(0, Math.min(snapValIdx || 0, snaps.length - 1));
                      return (
                        <div className="erp-acct-snap-validate">
                          <div className="erp-acct-snap-validate-title">Validate snapshot</div>
                          <div className="erp-acct-inline">
                            <select
                              className="erp-acct-select grow"
                              value={idx}
                              onChange={function (e) { setSnapValIdx(parseInt(e.target.value, 10) || 0); setSnapValResult(null); }}
                            >
                              {snaps.map(function (s, i) {
                                var lab = (s.label || s.id || "snapshot").slice(0, 48);
                                var when = (s.createdAt || "").slice(0, 19);
                                return (
                                  <option key={(s.id || i) + "_" + i} value={i}>{when + " — " + lab}</option>
                                );
                              })}
                            </select>
                            <Btn
                              col="gray"
                              disabled={snapValBusy}
                              onClick={function () {
                                var list = S.get("tc3_financial_snapshots", []);
                                var pick = list[idx];
                                if (!pick) return;
                                setSnapValBusy(true);
                                setSnapValResult(null);
                                validateSnapshotIntegrityFull(pick).then(function (r) {
                                  setSnapValBusy(false);
                                  setSnapValResult(r);
                                }).catch(function () {
                                  setSnapValBusy(false);
                                  setSnapValResult({ ok: false, tampered: true, reason: "validate_error" });
                                });
                              }}
                            >
                              {snapValBusy ? "Checking…" : "Validate"}
                            </Btn>
                          </div>
                          {snapValResult ? (
                            <div className="erp-acct-snap-result">
                              <div className={"erp-acct-snap-box" + (snapValResult.tampered ? " is-bad" : " is-ok")}>
                                <div className="erp-acct-snap-box-title">{(snapValResult.tampered ? "Tampered or invalid — " : "Valid — ") + (snapValResult.reason || "")}</div>
                                {snapValResult.snapshotCreatedAt ? <div>Snapshot time: {snapValResult.snapshotCreatedAt}</div> : null}
                                {snapValResult.snapshotPeriodDate ? <div>Period / as-of: {snapValResult.snapshotPeriodDate}</div> : null}
                                {snapValResult.recomputedContentHashShort ? <div>Content hash (recomputed): {snapValResult.recomputedContentHashShort}</div> : null}
                                {snapValResult.storedContentHashShort ? <div>Content hash (stored): {snapValResult.storedContentHashShort}</div> : null}
                                {snapValResult.storedIntegrityHmacShort ? <div>HMAC (stored): {snapValResult.storedIntegrityHmacShort}</div> : null}
                                {snapValResult.canonicalBodyLength != null ? <div>Canonical body length: {snapValResult.canonicalBodyLength}</div> : null}
                                {snapValResult.matched ? <div>Matched: {snapValResult.matched}</div> : null}
                                {snapValResult.legacy ? <div>(Legacy snapshot — hash-only seal)</div> : null}
                              </div>
                              <Btn sm col="gray" onClick={function () {
                                var r = snapValResult;
                                var lines = [
                                  "TechonERP snapshot validation",
                                  "reason: " + (r.reason || ""),
                                  "tampered: " + !!r.tampered,
                                  "snapshotId: " + (r.snapshotId || ""),
                                  "createdAt: " + (r.snapshotCreatedAt || ""),
                                  "periodDate: " + (r.snapshotPeriodDate || ""),
                                  "recomputedHash: " + (r.expectedContentHash || r.recomputedContentHashShort || ""),
                                  "storedHash: " + (r.storedContentHashValue || r.storedContentHash || ""),
                                  "storedHmac: " + (r.storedIntegrityHmac || ""),
                                  "canonicalLen: " + (r.canonicalBodyLength != null ? r.canonicalBodyLength : ""),
                                ];
                                var t = lines.join("\n");
                                try {
                                  navigator.clipboard.writeText(t).then(function () { showAlert("Copied validation details to clipboard."); }).catch(function () { showAlert(t); });
                                } catch (e) {
                                  showAlert(t);
                                }
                              }}>Copy debug details</Btn>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <button type="button" className="erp-acct-save" onClick={saveAccountingSettings}>Save Accounting Settings</button>
            </Card>
          </div>
        </div>
      )}

      {rmBfPreview && (
        <Modal title="Raw material pricing — dry-run" onClose={function () { setRmBfPreview(null); }} wide>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <strong>{rmBfPreview.changes.length}</strong> product(s) would update. Skipped: <strong>{rmBfPreview.skipped.length}</strong>.
          </div>
          <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid " + C.border, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>Product</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Old cost</th>
                  <th style={{ textAlign: "right", padding: 8 }}>New cost</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Old price</th>
                  <th style={{ textAlign: "right", padding: 8 }}>New price</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Purchase</th>
                </tr>
              </thead>
              <tbody>
                {rmBfPreview.changes.map(function (ch, idx) {
                  return (
                    <tr key={ch.id || idx} style={{ borderTop: "1px solid " + C.border }}>
                      <td style={{ padding: 8, fontWeight: 700 }}>{ch.name}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{getCurrencySymbol()} {fmtNum(ch.oldCost)}</td>
                      <td style={{ padding: 8, textAlign: "right", color: C.green }}>{getCurrencySymbol()} {fmtNum(ch.newCost)}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{getCurrencySymbol()} {fmtNum(ch.oldPrice)}</td>
                      <td style={{ padding: 8, textAlign: "right", color: C.green }}>{getCurrencySymbol()} {fmtNum(ch.newPrice)}</td>
                      <td style={{ padding: 8, fontSize: 11, color: C.muted }}>{ch.purchaseDate}{ch.purchaseInvoiceNo ? " · " + ch.purchaseInvoiceNo : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Btn col="gray" onClick={function () { setRmBfPreview(null); }}>Close</Btn>
            <Btn col="cyan" onClick={runRmBfApply}>Apply updates</Btn>
          </div>
        </Modal>
      )}

      {/* ── RESET CONFIRM MODAL ── */}
      {resetStep > 0 && (
        <Modal title="Reset System Data" onClose={function () { setResetStep(0); setResetPw(""); setResetMsg(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Warning banner */}
            <div style={{ background: "#fef2f2", border: "2px solid #fca5a5", borderRadius: 10, padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>⚠</div>
              <div>
                <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: 14, marginBottom: 4 }}>This action cannot be undone</div>
                <div style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.7 }}>
                  All of the following will be <strong>permanently deleted</strong>:
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 16px", fontSize: 12, color: "#991b1b" }}>
                  {["Sales & Invoices", "Purchase Records", "Products & Inventory", "Customers", "Suppliers", "Expenses", "Repairs", "Assets & Logs", "Shop Settings", "Logo & Invoice Design", "Warranty Info", "Password & Admin Name"].map(function (item) {
                    return <div key={item} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ color: "#dc2626", fontWeight: 700 }}>✕</span>{item}</div>;
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#166534", fontWeight: 600, background: "#f0fdf4", borderRadius: 6, padding: "6px 10px" }}>
                  ✓ A safety backup (.json) is auto-downloaded before the reset so you can restore if needed.
                </div>
              </div>
            </div>

            {/* Password input */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Enter Admin Password to confirm:</div>
              <input
                type="password"
                value={resetPw}
                onChange={function (e) { setResetPw(e.target.value); setResetMsg(null); }}
                placeholder="Admin password"
                style={{ width: "100%", border: "2px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit" }}
                onKeyDown={function (e) { if (e.key === "Enter" && resetPw) doResetData(); }}
              />
            </div>

            {/* Error / success message */}
            {resetMsg && (
              <div style={{ background: resetMsg.type === "error" ? "#fef2f2" : "#f0fdf4", border: "1px solid " + (resetMsg.type === "error" ? "#fca5a5" : "#86efac"), borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: resetMsg.type === "error" ? "#b91c1c" : "#166534", fontWeight: 600 }}>
                {resetMsg.text}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn col="gray" onClick={function () { setResetStep(0); setResetPw(""); setResetMsg(null); }}>Cancel</Btn>
              <Btn col="red" onClick={doResetData} disabled={!resetPw}>🗑 Confirm Reset</Btn>
            </div>

          </div>
        </Modal>
      )}

      {netModePwOpen && (
        <Modal title="Confirm admin password" onClose={function () { closeNetModePwModal({ ok: false, message: "Cancelled — admin password required." }); }}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.45 }}>
            Enter the same password you use to log in. This is required to change network mode.
          </div>
          <Input
            label="Admin password"
            type="password"
            value={netModePw}
            onChange={function (e) { setNetModePw(e.target.value); setNetModePwMsg(""); }}
            placeholder="Login password"
            onKeyDown={function (e) { if (e.key === "Enter" && netModePw && !netModePwBusy) submitNetModePw(); }}
          />
          {netModePwMsg ? (
            <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#b91c1c", fontWeight: 600 }}>
              {netModePwMsg}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn col="gray" onClick={function () { closeNetModePwModal({ ok: false, message: "Cancelled — admin password required." }); }} disabled={netModePwBusy}>Cancel</Btn>
            <Btn col="blue" onClick={submitNetModePw} disabled={!netModePw || netModePwBusy}>{netModePwBusy ? "Checking…" : "Continue"}</Btn>
          </div>
        </Modal>
      )}

      {stab === "network" && !isNetworkMode && (
        <div className="erp-net-page">
          <div className="erp-net-wrap">
            <Card className="erp-net-card">
              <div className="erp-net-brand">
                <div className="erp-net-brand-ico" aria-hidden="true">🖥️</div>
                <div className="erp-net-brand-text">
                  <div className="erp-net-title">Standalone</div>
                  <div className="erp-net-sub">This PC stores shop data locally (IndexedDB only)</div>
                </div>
                <span className="erp-net-badge">Standalone</span>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Enable Multi-PC</div>
                <div className="erp-net-hint" style={{ marginBottom: 12 }}>
                  Turn this PC into the <strong>Main PC</strong>. The app installs API files into XAMPP, creates MySQL, and imports your current shop data.
                  Your local data is kept — MySQL gets a shared copy for counters. No AppData edits needed.
                </div>
                <div className="erp-net-actions">
                  <Btn col="blue" onClick={function () {
                    showConfirm(
                      "Enable Multi-PC on this computer?\n\n1) Download a backup first if you have not already.\n2) Install XAMPP to C:\\xampp if needed.\n3) App will configure MySQL and import this PC's data.\n\nContinue?",
                      function () { setEnableMultiPcOpen(true); }
                    );
                  }}>Enable Multi-PC</Btn>
                  <Btn col="gray" onClick={function () {
                    try {
                      var bak = buildBackupObject();
                      var d = new Date().toISOString().slice(0, 10);
                      downloadJson(bak, "techon-erp-backup-before-multipc-" + d + ".json");
                      showAlert("Backup downloaded. You can Enable Multi-PC when ready.");
                    } catch (e) {
                      showAlert("Backup failed: " + (e && e.message ? e.message : String(e)));
                    }
                  }}>Download Backup First</Btn>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {stab === "network" && isNetworkClient && (
        <div className="erp-net-page">
          <div className="erp-net-wrap">
            <Card className="erp-net-card">
              <div className="erp-net-brand is-client">
                <div className="erp-net-brand-ico" aria-hidden="true">💻</div>
                <div className="erp-net-brand-text">
                  <div className="erp-net-title">Counter Network</div>
                  <div className="erp-net-sub">Products and invoices sync from the main PC</div>
                </div>
                {(function () {
                  var st = clientConnStatus;
                  var label = "Checking…";
                  var cls = "is-warn";
                  if (clientNetBusy) { label = clientNetStep || "Connecting…"; cls = "is-warn"; }
                  else if (st === "connected") { label = "Connected"; cls = "is-server"; }
                  else if (st === "disconnected") { label = "Offline"; cls = "is-offline"; }
                  else if (st === "reconnecting") { label = "Reconnecting…"; cls = "is-warn"; }
                  return <span className={"erp-net-badge " + cls}>{label}</span>;
                })()}
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Connection</div>
                {(systemConfig && systemConfig.apiUrl) ? (
                  <div className="erp-net-cred is-url">
                    <div className="erp-net-cred-label">Current server</div>
                    <code className="erp-net-cred-val">{systemConfig.apiUrl}</code>
                  </div>
                ) : null}
                <div className="erp-net-form">
                  <Input label="Network Address" value={clientNetUrl} onChange={function (e) { setClientNetUrl(e.target.value); setClientNetErr(null); }} placeholder="http://192.168.1.100/api/" readOnly={!!(systemConfig && systemConfig.apiUrl && clientConnStatus === "connected")} />
                  <Input label="Security Key" value={clientNetKey} onChange={function (e) { setClientNetKey(e.target.value); setClientNetErr(null); }} placeholder="Key from server PC" />
                </div>
                {clientNetErr ? <div className="erp-net-err">{clientNetErr}</div> : null}
                <div className="erp-net-actions">
                  <Btn col="blue" onClick={clientConnectToServer} disabled={clientNetBusy || clientConnStatus === "reconnecting"}>{clientNetBusy ? "Connecting…" : "Connect to Server"}</Btn>
                  <Btn col="cyan" onClick={function () { window.location.reload(); }} disabled={clientNetBusy || clientConnStatus === "reconnecting"}>Reconnect</Btn>
                  <Btn col="orange" onClick={function () {
                    showConfirm("Are you sure you want to reset connection?\n\nThis will disconnect from server and require setup again.", function () {
                      if (tcIsDevEnv()) {
                        try { console.info("[TC_CLIENT] reset connection confirmed"); } catch (e) {}
                      }
                      var api = window.electronAPI;
                      if (api && api.resetNetworkConfig) {
                        api.resetNetworkConfig().then(function () {
                          try { sessionStorage.clear(); } catch (e) {}
                          window.location.reload();
                        });
                      }
                    });
                  }} disabled={clientNetBusy}>Reset Connection</Btn>
                </div>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Device Authentication</div>
                <div className="erp-net-hint">
                  Status: <strong>{deviceCredStatus || "none"}</strong>. Use the security key until approved, then this PC switches to device credentials.
                </div>
                <div className="erp-net-actions">
                  <Btn col="blue" disabled={deviceRegBusy} onClick={function () {
                    var api = window.electronAPI;
                    if (!api || !api.registerDevice) { showAlert("Device registration not available."); return; }
                    setDeviceRegBusy(true);
                    api.registerDevice({ device_name: "Counter PC" }).then(function (r) {
                      if (r && r.ok) {
                        showAlert("Registration sent. Ask the administrator to approve this device on the Main PC.");
                        setDeviceCredStatus("pending");
                      } else showAlert((r && r.message) || "Registration failed");
                    }).finally(function () { setDeviceRegBusy(false); });
                  }}>{deviceRegBusy ? "Sending…" : "Register Device"}</Btn>
                  <Btn col="green" disabled={deviceRegBusy} onClick={function () {
                    var api = window.electronAPI;
                    if (!api || !api.pollDeviceStatus) return;
                    setDeviceRegBusy(true);
                    api.pollDeviceStatus().then(function (r) {
                      if (r && r.ok) {
                        setDeviceCredStatus(r.status || "unknown");
                        if (r.status === "approved" && r.has_secret) showAlert("Device approved — secure credentials saved.");
                        else if (r.status === "pending") showAlert("Still awaiting administrator approval.");
                        else showAlert("Status: " + (r.status || "unknown"));
                      } else showAlert((r && r.message) || "Could not check status");
                    }).finally(function () { setDeviceRegBusy(false); });
                  }}>Check Approval</Btn>
                </div>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Switch to Standalone</div>
                <div className="erp-net-hint" style={{ marginBottom: 12 }}>
                  Disconnect from the Main PC and use this computer alone. Any data already downloaded stays in IndexedDB.
                  You can reconnect later with Enable Multi-PC on a Main PC or Connect on a counter.
                </div>
                <div className="erp-net-actions">
                  <Btn col="orange" disabled={!!switchStandaloneBusy} onClick={function () {
                    showConfirm(
                      "Switch this Counter to Standalone?\n\nThis disconnects from the Main PC. Locally cached data stays on this PC.\n\nContinue?",
                      function () { doSwitchToStandalone({ skipConfirm: true }); }
                    );
                  }}>{switchStandaloneBusy ? "Switching…" : "Switch to Standalone"}</Btn>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {stab === "network" && isNetworkServer && (
        <div className="erp-net-page">
          <div className="erp-net-wrap">
            <Card className="erp-net-card">
              <div className="erp-net-brand">
                <div className="erp-net-brand-ico" aria-hidden="true">🗄️</div>
                <div className="erp-net-brand-text">
                  <div className="erp-net-title">Network Server</div>
                  <div className="erp-net-sub">This PC stores shop data in local MySQL (XAMPP)</div>
                </div>
                <span className="erp-net-badge is-server">Server</span>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Credentials</div>
                <div className="erp-net-creds">
                  <div className="erp-net-cred is-url">
                    <div className="erp-net-cred-label">Server API URL</div>
                    <div className="erp-net-cred-row">
                      <code className="erp-net-cred-val">{systemConfig.apiUrl || "Not configured"}</code>
                      {systemConfig.apiUrl ? (
                        <button
                          type="button"
                          className="erp-net-copy"
                          onClick={function () { try { navigator.clipboard.writeText(systemConfig.apiUrl); showAlert("API URL copied to clipboard!"); } catch (e) {} }}
                        >
                          Copy URL
                        </button>
                      ) : null}
                    </div>
                    <div className="erp-net-cred-hint">Share with client PCs</div>
                  </div>

                  {(systemConfig.hasApiKey || systemConfig.apiKey || revealedServerKey) ? (
                    <div className="erp-net-cred is-key">
                      <div className="erp-net-cred-label">Security Key</div>
                      <div className="erp-net-cred-row">
                        <code className="erp-net-cred-val">{revealedServerKey || systemConfig.apiKey || "•••••••• (hidden)"}</code>
                        <button
                          type="button"
                          className="erp-net-copy is-amber"
                          disabled={serverKeyBusy}
                          onClick={function () {
                            var copyKey = function (k) {
                              if (!k) return;
                              try { navigator.clipboard.writeText(k); showAlert("Security key copied to clipboard!"); } catch (e) {}
                            };
                            if (revealedServerKey || systemConfig.apiKey) {
                              copyKey(revealedServerKey || systemConfig.apiKey);
                              return;
                            }
                            revealServerSecurityKey().then(copyKey);
                          }}
                        >
                          {revealedServerKey || systemConfig.apiKey ? "Copy Key" : "Reveal & Copy"}
                        </button>
                      </div>
                      <div className="erp-net-cred-hint is-warn">Keep secret — do not share publicly</div>
                    </div>
                  ) : null}
                </div>
                <div className="erp-net-stats">
                  {[
                    { label: "Mode", value: "Network" },
                    { label: "Role", value: "Main Server" },
                    { label: "Storage", value: "Local MySQL" },
                    { label: "Access", value: "Full ERP" },
                  ].map(function (row) {
                    return (
                      <div key={row.label} className="erp-net-stat">
                        <span className="erp-net-stat-label">{row.label}</span>
                        <strong className="erp-net-stat-value">{row.value}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">License &amp; Connected PCs</div>
                {(function () {
                  var isTrialMode = !!(licenseInfo && licenseInfo.status === "trial");
                  var maxClientsRaw = isTrialMode ? 2 : ((licenseInfo && licenseInfo.maxClients != null) ? licenseInfo.maxClients : clientSlots.max_clients);
                  var maxClients = Number(maxClientsRaw) || 0;
                  var connectedCount = Number(clientSlots.connected) || 0;
                  maxClients = Math.max(0, maxClients);
                  connectedCount = Math.max(0, connectedCount);
                  var noClientsAllowed = maxClients === 0;
                  var connectedText = connectedCount + " / " + (noClientsAllowed ? "Not Allowed" : String(maxClients));
                  return (
                    <div className="erp-net-lic-bar">
                      <div className="erp-net-lic-meta">
                        <span>
                          Allowed PCs{" "}
                          {isTrialMode ? (
                            <em className="erp-net-chip is-blue">2 (Trial)</em>
                          ) : noClientsAllowed ? (
                            <em className="erp-net-chip is-red">Not Allowed</em>
                          ) : (
                            <em className="erp-net-chip">{String(maxClients)}</em>
                          )}
                        </span>
                        <span>Connected <strong>{connectedText}</strong></span>
                        {(licenseInfo && licenseInfo.lastSuccessfulSyncTime) ? (
                          <span>Last sync <strong>{(function () { var dt = new Date(parseInt(licenseInfo.lastSuccessfulSyncTime, 10)); return isNaN(dt.getTime()) ? "-" : dt.toLocaleString(); })()}</strong></span>
                        ) : null}
                        {isTrialMode ? <div className="erp-net-lic-note">Upgrade license to add more PCs.</div> : null}
                      </div>
                      <div className="erp-net-lic-actions">
                        <Btn sm col="cyan" onClick={refreshConnectedClients} disabled={clientSlotsBusy}>Refresh PCs</Btn>
                        <Btn sm col="blue" onClick={function () {
                          var api = window.electronAPI;
                          if (!api || !api.syncLicenseNow) { showAlert("License sync API is not available."); return; }
                          setLicSyncBusy(true);
                          api.syncLicenseNow().then(function (r) {
                            if (r && r.ok) showAlert("License synced from cloud.\nMax clients: " + (r.max_clients != null ? r.max_clients : "—"));
                            else showAlert("Sync failed: " + ((r && r.message) || "Unknown error"));
                          }).finally(function () { setLicSyncBusy(false); refreshConnectedClients(); });
                        }} disabled={licSyncBusy}>Sync License</Btn>
                      </div>
                    </div>
                  );
                })()}
                <div className="erp-net-hint">If a PC was reformatted or replaced, remove the old device to free a slot.</div>
                <div className="erp-net-table-wrap">
                  <table className="erp-net-table">
                    <thead>
                      <tr>
                        <th>Admin label</th>
                        <th>Reported name</th>
                        <th>Device ID</th>
                        <th>Last seen</th>
                        <th className="is-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(clientSlots.clients || []).map(function (c, i) {
                        var dk = c.device_id || "";
                        var draftVal = clientLabelDrafts[dk] !== undefined ? clientLabelDrafts[dk] : (c.client_label != null ? String(c.client_label) : "");
                        return (
                          <tr key={(c.device_id || "") + "-" + i}>
                            <td>
                              <div className="erp-net-label-edit">
                                <div className="erp-net-label-row">
                                  <input
                                    value={draftVal}
                                    onChange={function (e) {
                                      var v = e.target.value;
                                      setClientLabelDrafts(function (prev) { var n = Object.assign({}, prev); n[dk] = v; return n; });
                                    }}
                                    placeholder="e.g. Counter 1"
                                    className={"erp-net-input" + (clientLabelFlashDk === dk ? " is-flash" : "")}
                                  />
                                  <Btn sm col="blue" onClick={function () {
                                    var api = window.electronAPI;
                                    if (!api || !api.setConnectedClientLabel) { showAlert("Label update is not available."); return; }
                                    var v = clientLabelDrafts[dk] !== undefined ? clientLabelDrafts[dk] : (c.client_label || "");
                                    api.setConnectedClientLabel({ deviceId: c.device_id, clientLabel: v }).then(function (r) {
                                      if (r && r.ok) {
                                        showAlert((r && r.message) ? String(r.message) : "Label saved.");
                                        if (r.labelAdjusted && r.clientLabel != null && String(r.clientLabel).length) {
                                          setClientLabelDrafts(function (prev) { var n = Object.assign({}, prev); n[dk] = String(r.clientLabel); return n; });
                                          setClientLabelFlashDk(dk);
                                          setClientLabelAdjustedHintDk(dk);
                                          setTimeout(function () {
                                            setClientLabelFlashDk(null);
                                            setClientLabelAdjustedHintDk(null);
                                          }, 2000);
                                        }
                                        refreshConnectedClients();
                                      } else {
                                        showAlert((r && r.message) || "Could not save label.");
                                      }
                                    });
                                  }}>Save</Btn>
                                </div>
                                {clientLabelAdjustedHintDk === dk ? (
                                  <div className="erp-net-label-hint">Adjusted to avoid duplicate</div>
                                ) : null}
                              </div>
                            </td>
                            <td className="is-strong">{c.device_name || "—"}</td>
                            <td className="is-mono">{c.device_id || "-"}</td>
                            <td>{c.last_seen || "-"}</td>
                            <td className="is-right">
                              <button
                                type="button"
                                className="erp-net-remove"
                                onClick={function () {
                                  var api = window.electronAPI;
                                  if (!api || !api.removeConnectedClient) return;
                                  showConfirm("Remove this client slot?\n\n" + (c.device_name || c.device_id || "Client"), function () {
                                    api.removeConnectedClient({ deviceId: c.device_id }).then(function (r) {
                                      if (r && r.ok) showAlert("Client removed.");
                                      else showAlert("Remove failed: " + ((r && r.message) || "Unknown error"));
                                      refreshConnectedClients();
                                    });
                                  });
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {(!clientSlots.clients || clientSlots.clients.length === 0) && (
                        <tr>
                          <td colSpan={5} className="is-empty">{clientSlotsBusy ? "Loading connected clients..." : "No connected client devices found."}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Trusted Devices</div>
                <div className="erp-net-hint">Legacy security key stays active until all counters are migrated.</div>
                <div className="erp-net-actions" style={{ marginBottom: 8 }}>
                  <Btn sm col="blue" onClick={refreshTrustedDevices} disabled={trustedDevicesBusy}>{trustedDevicesBusy ? "Loading…" : "Refresh"}</Btn>
                </div>
                <div className="erp-net-table-wrap">
                  <table className="erp-net-table">
                    <thead>
                      <tr>
                        {["Name", "Computer", "Status", "Last seen", "Version", "Actions"].map(function (h) {
                          return <th key={h}>{h}</th>;
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(trustedDevices || []).map(function (d) {
                        var st = d.status || "pending";
                        var stClass = st === "approved" ? "is-ok" : (st === "pending" ? "is-warn" : "is-bad");
                        return (
                          <tr key={d.device_id}>
                            <td className="is-strong">{d.device_name || "—"}</td>
                            <td>{d.computer_name || "—"}</td>
                            <td><span className={"erp-net-status " + stClass}>{st}</span></td>
                            <td className="is-muted">{d.last_seen || "—"}</td>
                            <td className="is-muted">{d.software_version || "—"}</td>
                            <td>
                              <div className="erp-net-row-actions">
                                {st === "pending" ? (
                                  <Btn sm col="green" onClick={function () {
                                    var api = window.electronAPI;
                                    if (!api || !api.manageDevices) return;
                                    api.manageDevices({ action: "approve", device_id: d.device_id }).then(function (r) {
                                      if (r && r.ok) { showAlert("Device approved."); refreshTrustedDevices(); }
                                      else showAlert((r && r.message) || "Approve failed");
                                    });
                                  }}>Approve</Btn>
                                ) : null}
                                {st === "approved" ? (
                                  <Btn sm col="orange" onClick={function () {
                                    var api = window.electronAPI;
                                    if (!api || !api.manageDevices) return;
                                    showConfirm("Disable this device?\n\n" + (d.device_name || d.device_id), function () {
                                      api.manageDevices({ action: "disable", device_id: d.device_id }).then(function () { refreshTrustedDevices(); });
                                    });
                                  }}>Disable</Btn>
                                ) : null}
                                {st === "disabled" ? (
                                  <Btn sm col="green" onClick={function () {
                                    var api = window.electronAPI;
                                    if (!api || !api.manageDevices) return;
                                    api.manageDevices({ action: "enable", device_id: d.device_id }).then(function () { refreshTrustedDevices(); });
                                  }}>Enable</Btn>
                                ) : null}
                                <Btn sm col="red" onClick={function () {
                                  var api = window.electronAPI;
                                  if (!api || !api.manageDevices) return;
                                  showConfirm("Remove this trusted device?", function () {
                                    api.manageDevices({ action: "remove", device_id: d.device_id }).then(function () { refreshTrustedDevices(); });
                                  });
                                }}>Remove</Btn>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(!trustedDevices || trustedDevices.length === 0) && (
                        <tr>
                          <td colSpan={6} className="is-empty">{trustedDevicesBusy ? "Loading…" : "No trusted devices yet."}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="erp-net-block">
                <div className="erp-net-block-label">Server Actions</div>
                <div className="erp-net-actions">
                  <Btn col="blue" onClick={function () {
                    if (!isNetworkServer || !systemConfig.apiUrl) {
                      showAlert("Network server is not configured. Check Settings → Network.");
                      return;
                    }
                    setDataPushBusy(true);
                    pushKeysToServer(NETWORK_KV_KEYS, { authConfig: systemConfig }).then(function (r) {
                      if (r && r.ok) showAlert("Shop data uploaded to the server database.\nCounter PCs will receive it on the next sync (within about 8 seconds).");
                      else showAlert("Upload failed: " + ((r && r.message) || "Unknown error"));
                    }).catch(function (e) {
                      showAlert("Upload failed: " + (e && e.message ? e.message : String(e)));
                    }).finally(function () { setDataPushBusy(false); });
                  }} disabled={dataPushBusy}>{dataPushBusy ? "Uploading..." : "Upload Shop Data"}</Btn>
                  <Btn col="green" onClick={function () {
                    var api = window.electronAPI;
                    if (!api || !api.backupDatabase) { showAlert("Backup not available in this build."); return; }
                    api.backupDatabase({}).then(function (r) {
                      if (r.ok) showAlert("Database backup saved!\n\nFile: " + r.path);
                      else showAlert("Backup failed: " + r.message);
                    });
                  }}>Backup Database</Btn>
                  <Btn col="gray" onClick={function () {
                    var api = window.electronAPI;
                    if (api && api.openBackupFolder) api.openBackupFolder();
                  }}>Open Backup Folder</Btn>
                  <Btn col="gray" onClick={function () {
                    var api = window.electronAPI;
                    if (api && api.openLogFolder) api.openLogFolder();
                  }}>Open Logs</Btn>
                </div>
                <div className="erp-net-hint">
                  Upload shop data if counters cannot see products or invoices. Backups save as <code>.sql</code> in Documents/TechonERP/backups/.
                </div>
              </div>

              <div className="erp-net-block is-danger">
                <div className="erp-net-block-label is-danger">Switch to Standalone</div>
                <div className="erp-net-hint" style={{ marginBottom: 10 }}>
                  Stops multi-PC sync on this Main PC. Shop data on this PC is kept. XAMPP is not uninstalled.
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "#374151", marginBottom: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={clearMysqlOnStandalone}
                    onChange={function (e) { setClearMysqlOnStandalone(!!e.target.checked); }}
                    style={{ marginTop: 2 }}
                  />
                  <span>Also clear Techon shop data in MySQL on this PC (optional). Does not uninstall XAMPP.</span>
                </label>
                <div className="erp-net-actions">
                  <Btn col="orange" onClick={doSwitchToStandalone} disabled={switchStandaloneBusy}>
                    {switchStandaloneBusy ? "Switching…" : "Switch to Standalone"}
                  </Btn>
                </div>
              </div>

              {!COMPUTER_SHOP_EDITION ? (
                <div className="erp-net-block is-danger">
                  <div className="erp-net-block-label is-danger">Reset Setup Wizard</div>
                  <div className="erp-net-danger-row">
                    <div className="erp-net-hint" style={{ marginBottom: 0 }}>Clears network config so you can re-run setup. No business data is deleted.</div>
                    <Btn col="orange" onClick={function () {
                      showConfirm("Reset Setup Wizard? This will require you to choose your system mode again on next restart. Current data is not deleted.", function () {
                        var api = window.electronAPI;
                        if (api && api.resetNetworkConfig) {
                          api.resetNetworkConfig().then(function () {
                            try { sessionStorage.clear(); } catch (e) {}
                            showAlert("Setup wizard has been reset. Please restart Techon ERP.");
                          });
                        }
                      });
                    }}>Reset Setup</Btn>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      )}

      {enableMultiPcOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99990,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Enable Multi-PC"
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "92vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
              padding: "18px 18px 14px",
            }}
          >
            <ServerSetup
              migrateTitle="Enable Multi-PC"
              onCancel={function () { setEnableMultiPcOpen(false); }}
              onComplete={doEnableMultiPcComplete}
            />
          </div>
        </div>
      ) : null}

      {stab === "users" && (
        <div className="erp-usr-page">
          <div className="erp-usr-wrap">
            <div className="erp-usr-brand">
              <div className="erp-usr-brand-ico" aria-hidden="true">🔐</div>
              <div className="erp-usr-brand-text">
                <div className="erp-usr-title">Security &amp; Users</div>
                <div className="erp-usr-sub">App login, admin account, and staff access</div>
              </div>
            </div>

            {(userMsg || showSupportPinResetHint || showAppPasswordResetHint) ? (
              <div className="erp-usr-alerts">
                {userMsg ? (
                  <div className={"erp-usr-banner" + (userMsg.type === "error" ? " is-err" : " is-ok")}>{userMsg.text}</div>
                ) : null}
                {showSupportPinResetHint ? (
                  <div className="erp-usr-banner is-info">
                    <span>Set a new <strong>Admin PIN</strong> below, then tap <strong>Save admin settings</strong>.</span>
                    <button type="button" className="erp-usr-dismiss" onClick={function () { setShowSupportPinResetHint(false); }}>Dismiss</button>
                  </div>
                ) : null}
                {showAppPasswordResetHint ? (
                  <div className="erp-usr-banner is-ok">
                    <span>Set a new <strong>login password</strong> below. Leave current password empty for this reset.</span>
                    <button type="button" className="erp-usr-dismiss" onClick={function () { setShowAppPasswordResetHint(false); }}>Dismiss</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={"erp-usr-layout" + (canManageUsers ? " has-staff" : "")}>
              <section className="erp-usr-panel erp-usr-panel-security" aria-label="Security">
                <div className="erp-usr-panel-head">
                  <div className="erp-usr-panel-kicker">Security</div>
                  <div className="erp-usr-panel-title">App &amp; admin login</div>
                  <div className="erp-usr-panel-sub">Control launch login and the main administrator account.</div>
                </div>

                <div className="erp-usr-panel-body">
                  <div className="erp-usr-field-group">
                    <div className="erp-usr-field-label">Login protection</div>
                    <div className="erp-usr-toggle-card">
                      <div className="erp-usr-toggle-text">
                        <div className="erp-usr-toggle-title">Require password on launch</div>
                        <div className="erp-usr-toggle-sub">
                          {f.requirePasswordOnLogin !== false
                            ? "Login screen is shown every time the app opens"
                            : "App opens without asking for a password"}
                        </div>
                      </div>
                      <div
                        role="switch"
                        tabIndex={0}
                        className={"erp-usr-switch" + (f.requirePasswordOnLogin !== false ? " is-on" : "")}
                        onClick={toggleRequirePasswordOnLogin}
                        onKeyDown={function (e) {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRequirePasswordOnLogin();
                          }
                        }}
                        aria-checked={f.requirePasswordOnLogin !== false}
                        aria-label="Require password on launch"
                      >
                        <span className="erp-usr-switch-knob" />
                      </div>
                    </div>
                    {f.requirePasswordOnLogin === false ? (
                      <div className="erp-usr-warn">Password protection is off — anyone can open the app on this PC.</div>
                    ) : null}
                  </div>

                  <div className="erp-usr-field-group">
                    <div className="erp-usr-field-label">Administrator</div>
                    <Input
                      compact={denseWiz}
                      label="Display name"
                      value={adminNameEdit}
                      onChange={function (e) { setAdminNameEdit(e.target.value); }}
                      placeholder="e.g. Rashid"
                    />
                    <div className="erp-usr-hint">Shown as User in the bottom status bar when signed in as admin.</div>
                  </div>

                  {!COMPUTER_SHOP_EDITION ? (
                    <div className="erp-usr-field-group">
                      <div className="erp-usr-field-label">Admin PIN &amp; auto-lock</div>
                      <div className="erp-usr-hint is-amber">PIN switches Sales Mode → Admin Mode (4–6 digits).</div>
                      <Input compact={denseWiz} label="Admin PIN" type="password" value={f.adminPin || ""} onChange={function (e) { var v = e.target.value.replace(/\D/g, "").slice(0, 6); setF(function (x) { return Object.assign({}, x, { adminPin: v }); }); }} placeholder="4–6 digit PIN..." />
                      {f.adminPin && f.adminPin.length >= 4 ? (
                        <div className="erp-usr-hint is-green">
                          PIN set{f.adminPin.startsWith && f.adminPin.startsWith("sha256:") ? " (secured)" : " — " + f.adminPin.length + " digits"}
                        </div>
                      ) : null}
                      {f.adminPin && f.adminPin.length > 0 && f.adminPin.length < 4 ? (
                        <div className="erp-usr-hint is-red">PIN must be at least 4 digits.</div>
                      ) : null}
                      <label className={"erp-sec-check" + (f.autoLockEnabled !== false ? " is-on" : "")}>
                        <input type="checkbox" checked={f.autoLockEnabled !== false} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { autoLockEnabled: e.target.checked }); }); }} />
                        <span>
                          <span className="erp-sec-toggle-title">Enable Auto-Lock</span>
                          <span className="erp-sec-toggle-sub">Lock to Sales Mode after inactivity</span>
                        </span>
                      </label>
                      {f.autoLockEnabled !== false ? (
                        <div className="erp-sec-mins">
                          <input
                            type="number"
                            min="1"
                            max="120"
                            value={f.autoLockMinutes || 10}
                            onChange={function (e) { var v = Math.max(1, Math.min(120, parseInt(e.target.value) || 1)); setF(function (x) { return Object.assign({}, x, { autoLockMinutes: v }); }); }}
                          />
                          <span>minutes (1–120)</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="erp-usr-field-group">
                    <div className="erp-usr-field-label">Change admin login password</div>
                    <div className="erp-usr-hint">Leave blank to keep the current password. Staff passwords use Reset on the user list.</div>
                    {pwMsg ? (
                      <div className={"erp-usr-banner " + (pwMsg.type === "error" ? "is-err" : "is-ok")}>{pwMsg.text}</div>
                    ) : null}
                    <div className="erp-usr-pw-grid">
                      <Input compact={denseWiz} label="Current Password" type="password" value={pwOld} onChange={function (e) { setPwOld(e.target.value); setPwMsg(null); }} placeholder="Current password" />
                      <Input compact={denseWiz} label="New Password" type="password" value={pwNew} onChange={function (e) { setPwNew(e.target.value); setPwMsg(null); }} placeholder="Min 4 characters" />
                      <Input compact={denseWiz} label="Confirm Password" type="password" value={pwNew2} onChange={function (e) { setPwNew2(e.target.value); setPwMsg(null); }} placeholder="Repeat new password" />
                    </div>
                  </div>
                </div>

                <div className="erp-usr-panel-foot">
                  <button type="button" className="erp-usr-save" onClick={saveAdminSecuritySettings}>
                    Save admin settings
                  </button>
                </div>
              </section>

              {canManageUsers ? (
                <section className="erp-usr-panel erp-usr-panel-staff" aria-label="Staff users">
                  <div className="erp-usr-panel-head">
                    <div className="erp-usr-panel-kicker">Staff</div>
                    <div className="erp-usr-panel-title">User accounts</div>
                    <div className="erp-usr-panel-sub">Cashier: {CASHIER_ACCESS_SUMMARY}</div>
                  </div>

                  <div className="erp-usr-panel-body">
                    <div className="erp-usr-field-group">
                      <div className="erp-usr-field-label">Add user</div>
                      <div className="erp-usr-form">
                        <Input label="Full Name" value={newUserName} onChange={function (e) { setNewUserName(e.target.value); setUserMsg(null); }} placeholder="e.g. Nimal" />
                        <Input label="Username" value={newUserUsername} onChange={function (e) { setNewUserUsername(e.target.value); setUserMsg(null); }} placeholder="e.g. cashier1" />
                        <Sel label="Role" value={newUserRole} onChange={function (e) { setNewUserRole(e.target.value); }}>
                          <option value="manager">Manager</option>
                          <option value="cashier">Cashier</option>
                        </Sel>
                        <Input label="Password" type="password" value={newUserPassword} onChange={function (e) { setNewUserPassword(e.target.value); setUserMsg(null); }} placeholder="Min 4 chars" />
                        <div className="erp-usr-form-btn">
                          <Btn col="blue" onClick={createUser}>+ Add User</Btn>
                        </div>
                      </div>
                    </div>

                    <div className="erp-usr-field-group is-table">
                      <div className="erp-usr-field-label">Current users · {users.length}</div>
                      {users.length === 0 ? (
                        <div className="erp-usr-empty">No users yet. Add a cashier or manager above.</div>
                      ) : (
                        <div className="erp-usr-table-wrap">
                          <table className="erp-usr-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Created</th>
                                <th className="is-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {users.map(function (u) {
                                var roleKey = normalizeRole(u.role);
                                var roleLbl = ROLE_LABELS[roleKey] || "Cashier";
                                var roleCls = roleKey === "admin" ? "is-admin" : (roleKey === "manager" ? "is-mgr" : "is-cash");
                                var isPrimaryAdmin = normalizeUsername(u.username) === "admin";
                                return (
                                  <tr key={u.id}>
                                    <td className="is-strong">{u.name || "—"}</td>
                                    <td className="is-mono">@{u.username || "—"}</td>
                                    <td><span className={"erp-usr-role " + roleCls}>{roleLbl}</span></td>
                                    <td className="is-muted">{u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}</td>
                                    <td className="is-right">
                                      <div className="erp-set-usr-acts" role="group" aria-label="User actions">
                                        <button type="button" className="erp-set-usr-act is-edit" title="Edit name" onClick={function () { openEditUserName(u); }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                                          </svg>
                                          <span>Edit</span>
                                        </button>
                                        <button type="button" className="erp-set-usr-act is-reset" title="Reset password" onClick={function () { openResetUserPassword(u); }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <rect x="3" y="11" width="18" height="11" rx="2" />
                                            <path d="M7 11V7a5 5 0 0110 0v4" />
                                          </svg>
                                          <span>Reset</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="erp-set-usr-act is-del"
                                          title={isPrimaryAdmin ? "Primary admin cannot be removed" : "Remove user"}
                                          disabled={isPrimaryAdmin}
                                          onClick={function () { removeUser(u); }}
                                        >
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M3 6h18" />
                                            <path d="M8 6V4h8v2" />
                                            <path d="M19 6l-1 14H6L5 6" />
                                          </svg>
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          {userEditModal && Modal ? (
            <Modal
              title={userEditModal.mode === "password" ? "Reset password" : "Edit name"}
              onClose={closeUserEditModal}
            >
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
                {userEditModal.mode === "password"
                  ? ("Set a new login password for @" + ((userEditModal.user && userEditModal.user.username) || "user") + ".")
                  : ("Update display name for @" + ((userEditModal.user && userEditModal.user.username) || "user") + ".")}
              </div>
              {userEditModal.mode === "name" ? (
                <Input
                  label="Full Name"
                  value={userEditName}
                  onChange={function (e) { setUserEditName(e.target.value); setUserEditErr(""); }}
                  placeholder="e.g. Nimal"
                />
              ) : (
                <React.Fragment>
                  <Input
                    label="New Password"
                    type="password"
                    value={userEditPw}
                    onChange={function (e) { setUserEditPw(e.target.value); setUserEditErr(""); }}
                    placeholder="Min 4 characters"
                    onKeyDown={function (e) { if (e.key === "Enter") saveResetUserPassword(); }}
                  />
                  <div style={{ height: 10 }} />
                  <Input
                    label="Confirm Password"
                    type="password"
                    value={userEditPw2}
                    onChange={function (e) { setUserEditPw2(e.target.value); setUserEditErr(""); }}
                    placeholder="Re-enter password"
                    onKeyDown={function (e) { if (e.key === "Enter") saveResetUserPassword(); }}
                  />
                </React.Fragment>
              )}
              {userEditErr ? (
                <div className="erp-usr-banner is-err" style={{ marginTop: 12 }}>{userEditErr}</div>
              ) : null}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <Btn
                  col="blue"
                  disabled={userEditBusy}
                  onClick={userEditModal.mode === "password" ? saveResetUserPassword : saveEditedUserName}
                >
                  {userEditModal.mode === "password" ? (userEditBusy ? "Saving…" : "Save password") : "Save name"}
                </Btn>
                <Btn col="gray" disabled={userEditBusy} onClick={closeUserEditModal}>Cancel</Btn>
              </div>
            </Modal>
          ) : null}
        </div>
      )}

      {stab === "activity" && (
        <SettingsActivityPanel S={S} Card={Card} />
      )}

      {stab === "about" && (
        <div className="erp-about-page">
          <AboutTab licenseInfo={licenseInfo} onActivate={onActivate} onLicenseRefresh={onLicenseRefresh} isNetworkClient={isNetworkClient} C={C} />
        </div>
      )}

      {previewInv && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(10,15,30,0.85)",
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
            display: "flex", alignItems: "center", gap: 14,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(200,220,255,0.9)" }}>
              {previewInv === "a4" ? "📄 A4 Invoice Preview"
                : previewInv === "a5" ? "📋 A5 Invoice Preview"
                : previewInv === "thermal80" ? "🖨 Thermal 80mm Preview"
                : "🖨 Thermal 58mm Preview"}
            </span>
            <span style={{ fontSize: 11, color: "rgba(200,220,255,0.45)", fontWeight: 500 }}>
              Sample invoice — shows your current design settings
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={function () { setPreviewInv(null); }}
              style={{
                padding: "7px 18px", borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                color: "rgba(200,220,255,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >✕ Close</button>
          </div>

          {/* Invoice document — scrollable */}
          <div style={{
            flex: 1, overflow: "auto", width: "100%",
            minHeight: 0,
            padding: "28px 16px",
            background: "#e8ecf5",
          }}>
            <div style={{
              background: "#fff",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              borderRadius: (previewInv === "thermal58" || previewInv === "thermal80") ? 8 : 4,
              overflow: "visible",
              width: "fit-content",
              margin: "0 auto",
            }}>
              {(previewInv === "thermal58" || previewInv === "thermal80")
                ? <InvoiceThermal inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} width={previewInv === "thermal58" ? 218 : 302} />
                : <InvoiceA4 inv={sampleInv} settings={f} invoiceLang={f.defaultInvoiceLang || "en"} size={previewInv} />
              }
            </div>
          </div>
        </div>
      )}

      </div>{/* erp-set-body */}

      {industryPwOpen && (
        <Modal title="Confirm industry change" onClose={function () { setIndustryPwOpen(false); setIndustryPw(""); setIndustryPwMsg(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: C.textMd, lineHeight: 1.5 }}>
              Enter your <strong>admin login password</strong> to change the business industry profile.
            </div>
            {industryPwMsg && (
              <div style={{ background: C.dangerSoft, color: C.red, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 }}>{industryPwMsg}</div>
            )}
            <Input compact={denseWiz} label="Login password" type="password" value={industryPw} onChange={function (e) { setIndustryPw(e.target.value); setIndustryPwMsg(""); }} placeholder="Enter your password..." onKeyDown={function (e) { if (e.key === "Enter") confirmIndustryChangeWithPassword(); }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn col="gray" onClick={function () { setIndustryPwOpen(false); setIndustryPw(""); setIndustryPwMsg(""); }}>Cancel</Btn>
              <Btn col="cyan" onClick={confirmIndustryChangeWithPassword}>Continue</Btn>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};
export default Settings;
