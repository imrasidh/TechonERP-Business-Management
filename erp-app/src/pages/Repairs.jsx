import React, { useState } from "react";
import CustomerPicker from "../components/CustomerPicker.jsx";
import { createAndPersistCustomer } from "../utils/customerCreate.js";
import SupplierPicker from "../components/SupplierPicker.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { RepairActionBtn, RepairActionGroup } from "../components/RepairActionBtn.jsx";
import { RepairStatusSelect, getRepairBulkStatusOptions, styleForAction } from "../components/RepairStatusSelect.jsx";
import StockProductPicker from "../components/StockProductPicker.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { buildVoidSaleUpdates, isVoidedTxn, VOID_REASON_OPTIONS, voidSaleBlockReason, computeVoidSaleRefundHint } from "../utils/voidInvoice.js";
import { rollbackRepairDevicesOnVoidSale } from "../utils/repairVoidRollback.js";
import { stampProductStock, stampUpdatedAt, stampTransactionIsoDateTime } from "../utils/stampUpdatedAt.js";
import { normalizeCashMethodForStorage } from "../accounting/generalLedger.js";
import {
  buildInvoiceEditLockIdentity,
  formatInvoiceEditLockMessage,
  getForeignInvoiceEditLock,
  releaseInvoiceEditLock,
} from "../utils/invoiceEditLocks.js";
import {
  defaultRepair3pProductName,
  nextRepair3pCode,
  peekRepair3pCode,
  isRepair3pInternalProduct,
  isRepair3pSoldProduct,
} from "../utils/repair3pProduct.js";
import { buildDocPrintHeaderHtml } from "../components/DocPrintHeader.jsx";

var Repairs = function (props) {
  var state = props.state;
  var setState = props.setState;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var S = props.S;
  var addAudit = props.addAudit;
  var showAlert = props.showAlert;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var escapeHtml = props.escapeHtml;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var C = props.C;
  var usePager = props.usePager;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Pager = props.Pager;
  var Modal = props.Modal;
  var Sel = props.Sel;
  var BarcodeLabelSheet = props.BarcodeLabelSheet;
  var SplitPaymentModal = props.SplitPaymentModal;
  var checkPeriodClose = props.checkPeriodClose;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var WABtn = props.WABtn;
  var blankDevice = function () {
    return { deviceType: "Laptop", brand: "", modelNo: "", serialNo: "", problem: "", status: "Accepted" };
  };
  var normalizeRepairDevices = function (repair) {
    var rows = Array.isArray(repair && repair.devices) ? repair.devices : [];
    var cleaned = rows.map(function (d) {
      return Object.assign({}, d || {}, {
        deviceType: (d && d.deviceType) || "Laptop",
        brand: (d && d.brand) || "",
        modelNo: (d && d.modelNo) || "",
        serialNo: (d && (d.serialNo || d.imei)) || "",
        problem: (d && d.problem) || "",
        status: (d && d.status) || "Accepted"
      });
    }).filter(function (d) { return d.deviceType || d.brand || d.modelNo || d.serialNo || d.problem; });
    if (!cleaned.length) {
      cleaned = [{
        deviceType: (repair && repair.deviceType) || "Laptop",
        brand: (repair && repair.brand) || "",
        modelNo: (repair && repair.modelNo) || "",
        serialNo: (repair && (repair.serialNo || repair.imei)) || "",
        problem: (repair && repair.problem) || "",
        status: (repair && repair.status) || "Accepted"
      }];
    }
    return cleaned;
  };
  var firstDeviceSummary = function (repair) {
    var d = normalizeRepairDevices(repair)[0] || blankDevice();
    return (d.deviceType || "Device") + (d.brand ? " " + d.brand : "") + (d.modelNo ? " " + d.modelNo : "");
  };
  var BLANK = { customer: "", customerId: "", phone: "", deviceType: "Laptop", brand: "", modelNo: "", problem: "", description: "", estimatedCost: "", status: "Accepted", dateIn: today(), dateOut: "", technician: "", accessories: "", devices: [blankDevice()] };
  var [show, setShow] = useState(false);
  var [f, setF] = useState(BLANK);
  var [editR, setEditR] = useState(null);
  var [viewR, setViewR] = useState(null);
  var [viewDeviceIndexes, setViewDeviceIndexes] = useState(null);
  var [custSearch, setCustSearch] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.customerName || "") : "";
  });
  var [deleteModal, setDeleteModal] = useState(null);
  var [deleteReason, setDeleteReason] = useState("");
  var [readyPrompt, setReadyPrompt] = useState(null);
  var [repairPrintModal, setRepairPrintModal] = useState(null);
  var [repairTab, setRepairTab] = useState("active");
  var [search, setSearch] = useState("");
  /* Repair service cost fields for Convert-to-Invoice prefill */
  var [servicePrice, setServicePrice] = useState("");
  var [serviceCost, setServiceCost] = useState("");
  var [convertInvoiceName, setConvertInvoiceName] = useState("");
  var [convertModal, setConvertModal] = useState(null); /* repair object awaiting convert */
  var [convertDeviceIndexes, setConvertDeviceIndexes] = useState([]);
  var [convertThirdPartyLines, setConvertThirdPartyLines] = useState([]);
  var [repairInternalParts, setRepairInternalParts] = useState([]);
  var [repairLockModal, setRepairLockModal] = useState(null);
  var [repairLockPw, setRepairLockPw] = useState("");
  var [repairLockErr, setRepairLockErr] = useState("");
  var [voidSaleTarget, setVoidSaleTarget] = useState(null);
  var [voidReason, setVoidReason] = useState("");
  var [voidRefundConfirm, setVoidRefundConfirm] = useState(false);
  var [thirdPartyReceiveModal, setThirdPartyReceiveModal] = useState(null);
  var [thirdPartySendModal, setThirdPartySendModal] = useState(null);
  var [thirdPartyBarcodeItems, setThirdPartyBarcodeItems] = useState(null);
  var [thirdPartySplitModal, setThirdPartySplitModal] = useState(false);
  var [suppSearch, setSuppSearch] = useState("");
  var [thirdPartySupplierFilter, setThirdPartySupplierFilter] = useState("");
  var [recordsStatusFilter, setRecordsStatusFilter] = useState("");
  var [repairProductFilter, setRepairProductFilter] = useState(""); /* "" | available | sold */
  var [editRepairProduct, setEditRepairProduct] = useState(null);
  var THIRD_PARTY_PAGE_SIZE = LIST_PAGE_SIZE;
  var RECORDS_PAGE_SIZE = LIST_PAGE_SIZE;
  var [sendSuppSearch, setSendSuppSearch] = useState("");
  var [thirdPartySendForm, setThirdPartySendForm] = useState({
    supplierId: "", supplierName: "", supplierPhone: ""
  });
  var [thirdPartyReceiveForm, setThirdPartyReceiveForm] = useState({
    supplierId: "", supplierName: "", productName: "", costAmount: "", sellAmount: "",
    supplierPhone: "", payMode: "unpaid", cashMethod: "Cash", paidAmount: "", chequeNo: "", chequeBank: "", chequeDue: today(), splitRows: [], note: ""
  });

  var TABS = [
    { id: "active", label: "Active", status: "Accepted" },
    { id: "thirdparty", label: "3rd Party", status: "Third Party" },
    { id: "ready", label: "Ready", status: "Ready" },
    { id: "delivered", label: "Delivered", status: "Delivered" },
    { id: "returned", label: "Returned", status: "Returned" },
    { id: "products", label: "Products", status: "Products" },
    { id: "records", label: "All Records", status: "Records" }
  ];
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet", "Server", "Network Device", "Other"];
  var STATUS_DISPLAY = { Accepted: "Active", "Third Party": "3rd Party", Ready: "Ready", Delivered: "Delivered", Returned: "Returned", Records: "All Records" };
  /* Always use the PC's local calendar day for status events (send 3P / ready / etc).
     Never reuse Date In / accepted date for those events. */
  var actionToday = function () {
    var n = new Date();
    var y = n.getFullYear();
    var m = String(n.getMonth() + 1);
    var day = String(n.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  };
  var stampDeviceTimeline = function (device, patch) {
    return Object.assign({}, device || {}, {
      timeline: Object.assign({}, (device && device.timeline) || {}, patch || {})
    });
  };
  var timelineDatesForStatus = function (status, eventDate) {
    var st = status || "Accepted";
    var d = eventDate || actionToday();
    if (st === "Accepted") return { acceptedAt: d };
    if (st === "Third Party") return { sent3pAt: d };
    if (st === "Ready") return { readyAt: d };
    if (st === "Delivered") return { deliveredAt: d };
    if (st === "Returned") return { returnedAt: d };
    return {};
  };
  var applyStatusChangeToDevice = function (device, nextStatus, eventDate) {
    var day = eventDate || actionToday();
    var next = Object.assign({}, device || {}, { status: nextStatus });
    next = stampDeviceTimeline(next, timelineDatesForStatus(nextStatus, day));
    if (nextStatus === "Third Party") {
      next.thirdParty = Object.assign({}, next.thirdParty || {}, { sentAt: day });
    }
    return next;
  };
  var getDeviceTimeline = function (repair, device) {
    var d = device || {};
    var tp = d.thirdParty || {};
    var tl = d.timeline || {};
    var st = d.status || "Accepted";
    /* Accepted may fall back to bill Date In. Later events use only their own stamps. */
    var acceptedAt = tl.acceptedAt || repair.dateIn || repair.date || "";
    var sent3pAt = tl.sent3pAt || tp.sentAt || "";
    var received3pAt = tl.received3pAt || tp.receivedAt || "";
    var readyAt = tl.readyAt || "";
    var deliveredAt = tl.deliveredAt || "";
    var returnedAt = tl.returnedAt || "";
    if (!returnedAt && st === "Returned") {
      var log = Array.isArray(repair.returnedLog) ? repair.returnedLog : [];
      var hit = log.slice().reverse().find(function (e) {
        if (!e || !e.date) return false;
        if (e.device && (e.device.serialNo || "") && (e.device.serialNo || "") === (d.serialNo || "")) return true;
        if (e.device && (e.device.modelNo || "") === (d.modelNo || "") && (e.device.brand || "") === (d.brand || "") && (e.device.deviceType || "") === (d.deviceType || "")) return true;
        return false;
      });
      if (hit) returnedAt = hit.date;
    }
    return {
      acceptedAt: acceptedAt,
      sent3pAt: sent3pAt,
      received3pAt: received3pAt,
      readyAt: readyAt,
      deliveredAt: deliveredAt,
      returnedAt: returnedAt,
      supplierName: tp.supplierName || "",
      supplierPhone: tp.supplierPhone || "",
      thirdPartyCost: tp.amount != null ? Number(tp.amount) : "",
      thirdPartySell: tp.sellAmount != null ? Number(tp.sellAmount) : ""
    };
  };
  /** Ready tab: prefer actual 3P / product cost+sell over bill estimate. */
  var getDeviceActualAmounts = function (repair, device) {
    var d = device || {};
    var tp = d.thirdParty || {};
    var cost = null;
    var sell = null;
    var fromActual = false;
    if (tp.amount != null && tp.amount !== "") {
      cost = Number(tp.amount) || 0;
      fromActual = true;
    }
    if (tp.sellAmount != null && tp.sellAmount !== "") {
      sell = Number(tp.sellAmount) || 0;
      fromActual = true;
    }
    if ((cost == null || sell == null) && tp.productId) {
      var p = (state.products || []).find(function (x) { return x.id === tp.productId; });
      if (p) {
        if (cost == null) { cost = Number(p.cost) || 0; fromActual = true; }
        if (sell == null) { sell = Number(p.price) || 0; fromActual = true; }
      }
    }
    if (cost == null) cost = Number(d.estimatedCost != null ? d.estimatedCost : (repair && (repair.estimatedCost != null ? repair.estimatedCost : repair.cost)) || 0) || 0;
    if (sell == null) sell = Number(d.sellAmount != null ? d.sellAmount : (repair && repair.sellAmount) || 0) || 0;
    return { cost: cost, sell: sell, fromActual: fromActual };
  };
  var deviceStatusLabel = function (status) {
    var st = status || "Accepted";
    return STATUS_DISPLAY[st] || st;
  };
  var STATUS_LABELS = { Accepted: "Active", "Third Party": "3rd Party", Ready: "Ready", Delivered: "Delivered", Returned: "Returned" };
  var deriveRepairStatus = function (devices) {
    var list = normalizeRepairDevices({ devices: devices || [] });
    var total = list.length;
    var counts = list.reduce(function (acc, d) {
      var k = d.status || "Accepted";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    if ((counts.Delivered || 0) === total) return "Delivered";
    if ((counts.Returned || 0) === total) return "Returned";
    if ((counts.Accepted || 0) > 0) return "Accepted";
    if ((counts["Third Party"] || 0) > 0) return "Third Party";
    if ((counts.Ready || 0) > 0) return "Ready";
    if ((counts.Delivered || 0) > 0 || (counts.Returned || 0) > 0) return "Delivered";
    return "Accepted";
  };
  var getRepairStatus = function (r) {
    return deriveRepairStatus(normalizeRepairDevices(r));
  };
  var getFilteredDeviceEntries = function (repair, deviceIndexes) {
    var all = normalizeRepairDevices(repair);
    if (!deviceIndexes || !deviceIndexes.length) {
      return all.map(function (d, idx) { return { device: d, index: idx }; });
    }
    var indexSet = {};
    deviceIndexes.forEach(function (i) { indexSet[i] = true; });
    return all.map(function (d, idx) {
      return indexSet[idx] ? { device: d, index: idx } : null;
    }).filter(Boolean);
  };
  var openViewRepair = function (repair, deviceIndexes) {
    setViewR(repair);
    setViewDeviceIndexes(deviceIndexes && deviceIndexes.length ? deviceIndexes.slice() : null);
  };
  var closeViewRepair = function () {
    setViewR(null);
    setViewDeviceIndexes(null);
  };
  var repairForPrint = function (repair, deviceIndexes) {
    var entries = getFilteredDeviceEntries(repair, deviceIndexes);
    var devices = entries.map(function (e) { return e.device; });
    return Object.assign({}, repair, { devices: devices, status: deriveRepairStatus(devices) });
  };
  var flattenRepairDeviceRows = function () {
    var rows = [];
    (state.repairs || []).forEach(function (repair) {
      normalizeRepairDevices(repair).forEach(function (device, deviceIndex) {
        rows.push({
          rowKey: repair.id + "_" + deviceIndex,
          repairId: repair.id,
          deviceIndex: deviceIndex,
          repair: repair,
          device: device,
          status: device.status || "Accepted",
          date: repair.dateIn || repair.date || ""
        });
      });
    });
    return sortNewestFirst(rows);
  };
  var countDevicesByStatus = function (status) {
    return flattenRepairDeviceRows().filter(function (row) { return row.status === status; }).length;
  };
  var isBillActive = function (repair) {
    return normalizeRepairDevices(repair).some(function (d) { return (d.status || "Accepted") === "Accepted"; });
  };
  var countActiveBills = function () {
    return (state.repairs || []).filter(isBillActive).length;
  };
  var billMatchesSearch = function (repair, q) {
    if (!q) return true;
    var blob = [repair.customer, repair.brand, repair.modelNo, repair.problem, repair.phone].concat(
      normalizeRepairDevices(repair).map(function (d) { return [d.deviceType, d.brand, d.modelNo, d.serialNo, d.problem].join(" "); })
    ).join(" ").toLowerCase();
    return blob.indexOf(q) >= 0;
  };
  var persistRepair = function (nextRepair, auditMsg) {
    var nr = (state.repairs || []).map(function (r) { return r.id === nextRepair.id ? nextRepair : r; });
    S.set("tc3_repairs", nr);
    setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    if (auditMsg) addAudit(auditMsg, nextRepair.customer + " | " + firstDeviceSummary(nextRepair));
    return nextRepair;
  };
  var buildRepairPatch = function (repair, devices, extra) {
    var first = devices[0] || blankDevice();
    return stampUpdatedAt(Object.assign({}, repair, extra || {}, {
      devices: devices,
      deviceType: first.deviceType || "Laptop",
      brand: first.brand || "",
      modelNo: first.modelNo || "",
      serialNo: first.serialNo || "",
      problem: first.problem || "",
      status: deriveRepairStatus(devices)
    }));
  };
  var updateDeviceStatus = function (repair, deviceIndex, nextStatus, skipPrompt) {
    if (!repair) return;
    repair = (state.repairs || []).find(function (r) { return r.id === repair.id; }) || repair;
    var devices = normalizeRepairDevices(repair).slice();
    if (deviceIndex < 0 || deviceIndex >= devices.length) return;
    var curr = devices[deviceIndex].status || "Accepted";
    if (curr === nextStatus) return;
    var apply = function () {
      var eventDay = actionToday();
      var origReturned = (devices[deviceIndex].status || "Accepted") !== "Returned" && nextStatus === "Returned";
      devices[deviceIndex] = applyStatusChangeToDevice(devices[deviceIndex], nextStatus, eventDay);
      var returnedLog = repair.returnedLog || [];
      if (origReturned) {
        returnedLog = mergeReturnedLog(returnedLog, [{ id: uid(), date: eventDay, deviceIndex: deviceIndex, device: Object.assign({}, devices[deviceIndex]) }]);
      }
      var nextRepair = buildRepairPatch(repair, devices, { returnedLog: returnedLog });
      persistRepair(nextRepair, "Repair device: " + curr + " → " + nextStatus);
      if (viewR && viewR.id === repair.id) setViewR(nextRepair);
      if (editR && editR.id === repair.id) setEditR(nextRepair);
      if (!skipPrompt && nextStatus === "Ready") setReadyPrompt(nextRepair);
    };
    if ((curr === "Delivered" || curr === "Returned") && nextStatus !== curr) {
      requestRepairLock({
        title: "Admin password required",
        message: "Change device from " + curr + " to " + nextStatus + "?",
        onConfirm: apply
      });
      return;
    }
    apply();
  };
  var updateAllDeviceStatuses = function (repair, nextStatus) {
    if (!repair) return;
    repair = (state.repairs || []).find(function (r) { return r.id === repair.id; }) || repair;
    var eventDay = actionToday();
    var devices = normalizeRepairDevices(repair).map(function (d) {
      var st = d.status || "Accepted";
      if (st === "Delivered") return d;
      if (nextStatus === "Ready" && st !== "Accepted" && st !== "Third Party") return d;
      if (nextStatus === "Returned" && st === "Delivered") return d;
      if (nextStatus === "Third Party" && st !== "Accepted") return d;
      if (st === nextStatus) return d;
      return applyStatusChangeToDevice(d, nextStatus, eventDay);
    });
    var returnedLog = repair.returnedLog || [];
    if (nextStatus === "Returned") {
      devices.forEach(function (d, idx) {
        var was = (normalizeRepairDevices(repair)[idx] && normalizeRepairDevices(repair)[idx].status) || "Accepted";
        if (was !== "Returned" && (d.status || "Accepted") === "Returned") {
          returnedLog = mergeReturnedLog(returnedLog, [{ id: uid(), date: eventDay, deviceIndex: idx, device: Object.assign({}, d) }]);
        }
      });
    }
    var nextRepair = buildRepairPatch(repair, devices, { returnedLog: returnedLog });
    persistRepair(nextRepair, "Repair bill devices → " + nextStatus);
    if (viewR && viewR.id === repair.id) setViewR(nextRepair);
    if (editR && editR.id === repair.id) setEditR(nextRepair);
    if (nextStatus === "Ready") setReadyPrompt(nextRepair);
  };
  var openThirdPartySendModal = function (repair, deviceIndexes) {
    if (!repair) return;
    repair = (state.repairs || []).find(function (r) { return r.id === repair.id; }) || repair;
    var devices = normalizeRepairDevices(repair);
    var indexes = (Array.isArray(deviceIndexes) ? deviceIndexes : [deviceIndexes]).filter(function (idx) {
      var d = devices[idx];
      return d && (d.status || "Accepted") === "Accepted";
    });
    if (!indexes.length) {
      showAlert("Only Active (Accepted) devices can be sent to 3rd party.");
      return;
    }
    var pref = (devices[indexes[0]] && devices[indexes[0]].thirdParty) || {};
    setThirdPartySendForm({
      supplierId: pref.supplierId || "",
      supplierName: pref.supplierName || "",
      supplierPhone: pref.supplierPhone || ""
    });
    var label = pref.supplierName || "";
    if (pref.supplierPhone) label += (label ? " - " : "") + pref.supplierPhone;
    setSendSuppSearch(label);
    closeViewRepair();
    setEditR(null);
    setThirdPartySendModal({ repairId: repair.id, deviceIndexes: indexes });
  };
  var saveInlineSupplierFromSendPicker = function (draft) {
    var created = saveInlineSupplier(draft);
    if (!created) return null;
    setSendSuppSearch(created.name + (created.phone ? (" - " + created.phone) : ""));
    setThirdPartySendForm({ supplierId: created.id, supplierName: created.name, supplierPhone: created.phone || "" });
    return created;
  };
  var confirmThirdPartySend = function () {
    if (!thirdPartySendModal) return;
    var repair = (state.repairs || []).find(function (r) { return r.id === thirdPartySendModal.repairId; });
    if (!repair) return;
    var supplierId = thirdPartySendForm.supplierId || "";
    var supplierName = String(thirdPartySendForm.supplierName || "").trim();
    var supplierPhone = String(thirdPartySendForm.supplierPhone || "").trim();
    if (!supplierId && !supplierName) {
      showAlert("Search and select a supplier, or click + Add new supplier.");
      return;
    }
    if (!supplierId && supplierName) {
      var created = saveInlineSupplier({ name: supplierName, phone: supplierPhone });
      if (!created) return;
      supplierId = created.id;
      supplierName = created.name;
      supplierPhone = created.phone || supplierPhone;
    } else if (supplierId) {
      var s = (state.suppliers || []).find(function (x) { return x.id === supplierId; });
      supplierName = s ? s.name : supplierName;
      supplierPhone = s ? (s.phone || supplierPhone) : supplierPhone;
    }
    var indexSet = {};
    (thirdPartySendModal.deviceIndexes || []).forEach(function (i) { indexSet[i] = true; });
    var eventDay = actionToday();
    var devices = normalizeRepairDevices(repair).map(function (d, idx) {
      if (!indexSet[idx]) return d;
      if ((d.status || "Accepted") !== "Accepted") return d;
      return stampDeviceTimeline(Object.assign({}, d, {
        status: "Third Party",
        thirdParty: Object.assign({}, d.thirdParty || {}, {
          supplierId: supplierId,
          supplierName: supplierName,
          supplierPhone: supplierPhone,
          sentAt: eventDay
        })
      }), { sent3pAt: eventDay });
    });
    var nextRepair = buildRepairPatch(repair, devices, {});
    persistRepair(nextRepair, "Device(s) sent to 3rd party: " + supplierName);
    if (viewR && viewR.id === repair.id) setViewR(nextRepair);
    if (editR && editR.id === repair.id) setEditR(nextRepair);
    setThirdPartySendModal(null);
    setSendSuppSearch("");
    setThirdPartySendForm({ supplierId: "", supplierName: "", supplierPhone: "" });
    addAudit("3rd Party send", repair.customer + " | " + supplierName + " | " + (thirdPartySendModal.deviceIndexes || []).length + " device(s)");
  };
  var openThirdPartyReceiveModal = function (repair, deviceIndex) {
    if (!repair) return;
    repair = (state.repairs || []).find(function (r) { return r.id === repair.id; }) || repair;
    var devices = normalizeRepairDevices(repair);
    var d = devices[deviceIndex];
    if (!d || (d.status || "Accepted") !== "Third Party") {
      showAlert("Only 3rd Party devices can be received from repair center.");
      return;
    }
    var tp = d.thirdParty || {};
    var supplierId = tp.supplierId || "";
    var supplierName = String(tp.supplierName || "").trim();
    var supplierPhone = String(tp.supplierPhone || "").trim();
    if (!supplierId && supplierName) {
      var matchSup = (state.suppliers || []).find(function (s) {
        return String(s.name || "").trim().toLowerCase() === supplierName.toLowerCase();
      });
      if (matchSup) {
        supplierId = matchSup.id;
        supplierPhone = supplierPhone || matchSup.phone || "";
        supplierName = matchSup.name || supplierName;
      }
    } else if (supplierId) {
      var supRec = (state.suppliers || []).find(function (s) { return s.id === supplierId; });
      if (supRec) {
        supplierName = supRec.name || supplierName;
        supplierPhone = supRec.phone || supplierPhone;
      }
    }
    if (!supplierId && !supplierName) {
      showAlert("This device has no supplier recorded from Send to 3rd Party. Send it again with a supplier selected.");
      return;
    }
    var existingProd = tp.productId
      ? ((state.products || []).find(function (x) { return x.id === tp.productId; }) || null)
      : null;
    var autoProductName = (existingProd && existingProd.name)
      || tp.productName
      || defaultRepair3pProductName(peekRepair3pCode(S), repair, d);
    setThirdPartyReceiveForm({
      supplierId: supplierId,
      supplierName: supplierName,
      supplierPhone: supplierPhone,
      productName: autoProductName,
      costAmount: tp.amount != null ? String(tp.amount) : "",
      sellAmount: tp.sellAmount != null ? String(tp.sellAmount) : "",
      payMode: tp.payMode || (tp.paid === false ? "unpaid" : "paid"),
      cashMethod: tp.cashMethod || "Cash",
      paidAmount: tp.paidAmount != null ? String(tp.paidAmount) : "",
      chequeNo: tp.chequeNo || "",
      chequeBank: tp.chequeBank || "",
      chequeDue: tp.chequeDue || today(),
      splitRows: tp.splitRows || [],
      note: tp.note || ""
    });
    setThirdPartyReceiveModal({ repairId: repair.id, deviceIndex: deviceIndex, sentAt: tp.sentAt || "" });
    closeViewRepair();
    setEditR(null);
  };
  var saveThirdPartyReceived = function (printAfterSave) {
    if (!thirdPartyReceiveModal) return;
    var repair = (state.repairs || []).find(function (r) { return r.id === thirdPartyReceiveModal.repairId; });
    if (!repair) return;
    var amount = parseFloat(thirdPartyReceiveForm.costAmount) || 0;
    var sellAmount = parseFloat(thirdPartyReceiveForm.sellAmount) || 0;
    if (amount <= 0) { showAlert("Enter valid 3rd party cost amount."); return; }
    var supplierId = thirdPartyReceiveForm.supplierId || "";
    var supplierName = String(thirdPartyReceiveForm.supplierName || "").trim();
    var supplierPhone = String(thirdPartyReceiveForm.supplierPhone || "").trim();
    var devices = normalizeRepairDevices(repair).slice();
    var idx = thirdPartyReceiveModal.deviceIndex;
    if (!devices[idx]) return;
    var lockedTp = devices[idx].thirdParty || {};
    supplierId = supplierId || lockedTp.supplierId || "";
    supplierName = supplierName || String(lockedTp.supplierName || "").trim();
    supplierPhone = supplierPhone || String(lockedTp.supplierPhone || "").trim();
    if (!supplierId && !supplierName) { showAlert("Supplier missing — this device must be sent to 3rd party with a supplier first."); return; }
    if (supplierId) {
      var sRec = (state.suppliers || []).find(function (x) { return x.id === supplierId; });
      if (sRec) {
        supplierName = sRec.name || supplierName;
        supplierPhone = sRec.phone || supplierPhone;
      }
    }
    var ensured = ensureThirdPartyProduct(repair, idx, thirdPartyReceiveForm);
    var tpProduct = ensured.product;
    var payMode = thirdPartyReceiveForm.payMode || "unpaid";
    var cashMethod = thirdPartyReceiveForm.cashMethod || "Cash";
    var splitRows = (thirdPartyReceiveForm.splitRows || []).slice();
    var paidAmount = payMode === "paid" ? amount : (payMode === "partial" ? (parseFloat(thirdPartyReceiveForm.paidAmount) || 0) : 0);
    if (splitRows.length > 0) {
      var nonChequePaid = splitRows.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
      var totalSplit = splitRows.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
      paidAmount = nonChequePaid;
      payMode = totalSplit >= amount ? "paid" : (nonChequePaid > 0 || totalSplit > 0 ? "partial" : "unpaid");
      cashMethod = splitRows.length === 1 ? (splitRows[0].method || "Cash") : "Mixed";
    }
    if (paidAmount < 0 || paidAmount > amount) { showAlert("Paid amount must be between 0 and cost amount."); return; }
    if (payMode !== "unpaid" && !splitRows.length) {
      showAlert("Set payment method using the payment popup (Cash/Bank/Cheque/Split).");
      return;
    }
    var payableBalance = Math.max(0, Math.round((amount - paidAmount) * 100) / 100);
    var eventDay = actionToday();
    var device = stampDeviceTimeline(Object.assign({}, devices[idx], {
      status: "Ready",
      thirdParty: Object.assign({}, devices[idx].thirdParty || {}, {
        supplierId: supplierId,
        supplierName: supplierName,
        supplierPhone: supplierPhone,
        productName: thirdPartyReceiveForm.productName,
        productId: tpProduct.id,
        amount: amount,
        sellAmount: sellAmount,
        payMode: payMode,
        cashMethod: cashMethod,
        paidAmount: paidAmount,
        chequeNo: String(thirdPartyReceiveForm.chequeNo || "").trim(),
        chequeBank: String(thirdPartyReceiveForm.chequeBank || "").trim(),
        chequeDue: thirdPartyReceiveForm.chequeDue || today(),
        splitRows: splitRows,
        paid: payableBalance <= 0,
        note: String(thirdPartyReceiveForm.note || "").trim(),
        receivedAt: eventDay
      })
    }), { received3pAt: eventDay, readyAt: eventDay });
    devices[idx] = device;
    var nextRepair = buildRepairPatch(repair, devices, {});
    var updates = {
      repairs: (state.repairs || []).map(function (r) { return r.id === repair.id ? nextRepair : r; }),
      products: ensured.products
    };
    var storWrites = [["tc3_repairs", updates.repairs], ["tc3_products", updates.products]];
    {
      var existingPayables = S.get("tc3_manualPayables", []) || [];
      var existingPayableId = (devices[idx].thirdParty && devices[idx].thirdParty.payableId) || "";
      var payable = {
        id: existingPayableId || uid(),
        date: today(),
        source: supplierName,
        type: "3rd Party Repair Cost",
        productId: tpProduct.id,
        qty: 1,
        amount: amount,
        paymentMethod: payMode === "unpaid" ? "Credit" : cashMethod,
        reference: repair.id.slice(0, 8).toUpperCase(),
        note: (thirdPartyReceiveForm.productName || "3rd Party repair cost") + (thirdPartyReceiveForm.note ? " | " + thirdPartyReceiveForm.note : ""),
        paymentHistory: splitRows.length > 0
          ? splitRows.filter(function (r) { return r.method !== "Cheque" && (parseFloat(r.amount) || 0) > 0; }).map(function (r) {
            return { id: uid(), date: today(), amount: parseFloat(r.amount) || 0, cashMethod: normalizeCashMethodForStorage(r.method), note: r.note ? ("Repairs 3P: " + r.note) : "Initial payment from Repairs receive flow" };
          })
          : (paidAmount > 0 ? [{ id: uid(), date: today(), amount: paidAmount, cashMethod: normalizeCashMethodForStorage(cashMethod), note: "Initial payment from Repairs receive flow" }] : []),
        createdAt: new Date().toISOString(),
        thirdPartyRepairId: repair.id,
        thirdPartyDeviceIndex: idx,
        supplierId: supplierId,
        supplierPhone: supplierPhone
      };
      var newChequeRows = [];
      var chequePaymentRows = [];
      if (!existingPayableId && splitRows.length > 0) {
        splitRows.forEach(function (row) {
          var amt = parseFloat(row.amount) || 0;
          if (amt <= 0 || row.method !== "Cheque") return;
          var chTs = new Date().toISOString();
          var ch = stampTransactionIsoDateTime({
            id: uid(),
            type: "outgoing",
            status: "Pending",
            chequeNo: String(row.chequeNo || "").trim(),
            bankName: String(row.chequeBankName || "").trim(),
            amount: amt,
            dueDate: row.chequeDueDate || today(),
            issuedDate: today(),
            supplierName: supplierName,
            note: "3rd Party Repair receive",
            manualPayableId: existingPayableId || payable.id,
            thirdPartyRepairId: repair.id,
            thirdPartyDeviceIndex: idx,
            createdAt: chTs,
            updatedAt: chTs
          }, chTs);
          newChequeRows.push(ch);
          chequePaymentRows.push({
            id: uid(),
            date: today(),
            amount: 0,
            cashMethod: "Cheque",
            note: "Cheque #" + ch.chequeNo + " " + getCurrencySymbol() + " " + fmtNum(ch.amount) + " (Pending — due " + ch.dueDate + ")",
            chequeId: ch.id
          });
        });
      }
      payable.paymentHistory = (payable.paymentHistory || []).concat(chequePaymentRows);
      if (existingPayableId) {
        updates.manualPayables = existingPayables.map(function (mp) { return mp.id === existingPayableId ? Object.assign({}, mp, payable) : mp; });
      } else {
        updates.manualPayables = existingPayables.concat([payable]);
      }
      storWrites.push(["tc3_manualPayables", updates.manualPayables]);
      if (newChequeRows.length > 0) {
        updates.cheques = (state.cheques || []).concat(newChequeRows);
        storWrites.push(["tc3_cheques", updates.cheques]);
      }
      device.thirdParty.payableId = payable.id;
      updates.repairs = updates.repairs.map(function (r) {
        if (r.id !== repair.id) return r;
        var ds = normalizeRepairDevices(r).slice();
        ds[idx] = device;
        return buildRepairPatch(r, ds, {});
      });
      storWrites[0] = ["tc3_repairs", updates.repairs];
    }
    storWrites.forEach(function (entry) { S.set(entry[0], entry[1]); });
    setState(function (st) { return Object.assign({}, st, updates, { _payTs: Date.now() }); });
    addAudit("3rd Party device received", repair.customer + " | " + supplierName + " | Cost " + getCurrencySymbol() + " " + fmtNum(amount) + " | Sell " + getCurrencySymbol() + " " + fmtNum(sellAmount) + " | " + payMode);
    if (printAfterSave) {
      setThirdPartyBarcodeItems([{
        id: tpProduct.id,
        name: tpProduct.name,
        barcode: tpProduct.barcode,
        cost: tpProduct.cost,
        sellPrice: tpProduct.price,
        productId: tpProduct.productId
      }]);
    }
    setThirdPartyReceiveModal(null);
    setSuppSearch("");
    setThirdPartyReceiveForm({ supplierId: "", supplierName: "", supplierPhone: "", productName: "", costAmount: "", sellAmount: "", payMode: "unpaid", cashMethod: "Cash", paidAmount: "", chequeNo: "", chequeBank: "", chequeDue: today(), splitRows: [], note: "" });
    setReadyPrompt(nextRepair);
    if (viewR && viewR.id === repair.id) setViewR(nextRepair);
  };
  var printThirdPartyBarcodeLabels = function () {
    setTimeout(function () { window.print(); }, 60);
  };
  var findSaleForRepairDevice = function (repairId, deviceIndex) {
    var sales = state.sales || [];
    var match = null;
    /* Prefer the invoice that explicitly references this repair + device index */
    sales.forEach(function (s) {
      if (match) return;
      if (!s || isVoidedTxn(s)) return;
      if (s.fromRepairId !== repairId) return;
      var idxs = Array.isArray(s.fromRepairDeviceIndexes) ? s.fromRepairDeviceIndexes : [];
      if (idxs.indexOf(deviceIndex) >= 0) match = s;
    });
    /* Fallback: any invoice from this repair */
    if (!match) {
      match = sales.find(function (s) { return s && !isVoidedTxn(s) && s.fromRepairId === repairId; }) || null;
    }
    return match;
  };
  var promptVoidDelivered = function (repairId, deviceIndex) {
    var repair = (state.repairs || []).find(function (r) { return r.id === repairId; }) || null;
    if (repair) {
      var statuses = normalizeRepairDevices(repair).map(function (d) { return d.status || "Accepted"; });
      var hasOtherActions = statuses.some(function (st) { return st !== "Delivered"; });
      if (hasOtherActions) {
        showAlert("This delivered invoice cannot be voided from Repairs because other devices on the same bill already have different statuses like Active, Ready, Returned, or 3rd Party.");
        return;
      }
    }
    var sale = findSaleForRepairDevice(repairId, deviceIndex);
    if (!sale) { showAlert("No invoice found for this delivered repair device."); return; }
    var block = voidSaleBlockReason(sale, state);
    if (block) { showAlert(block); return; }
    setVoidSaleTarget(sale);
    setVoidReason("");
    setVoidRefundConfirm(false);
  };
  var doVoidSaleFromModal = function () {
    if (!voidSaleTarget) return;
    if (!props.canDeleteInvoices) { props.showPermissionDenied && props.showPermissionDenied("void invoices"); return; }
    var lockId = buildInvoiceEditLockIdentity({
      currentUser: props.currentUser || null,
      clientMachineLabel: String(props.clientMachineLabel || "").trim(),
    });
    var fl = getForeignInvoiceEditLock(S, voidSaleTarget.id, lockId);
    if (fl) {
      showAlert(formatInvoiceEditLockMessage(fl) + " Cannot void until they finish.");
      return;
    }
    var voidState = Object.assign({}, state, { codRecords: S.get("tc3_codRecords", []) });
    var res = buildVoidSaleUpdates(voidState, voidSaleTarget.id, voidReason, null, { confirmRefund: voidRefundConfirm === true });
    if (!res.ok) { showAlert(res.error); return; }
    S.set("tc3_products", res.products);
    S.set("tc3_customers", res.customers);
    S.set("tc3_sales", res.sales);
    S.set("tc3_cheques", res.cheques);
    if (res.codRecords) S.set("tc3_codRecords", res.codRecords);
    var repairs = rollbackRepairDevicesOnVoidSale(state.repairs || [], res.voidedSale || voidSaleTarget, actionToday());
    if (repairs !== (state.repairs || [])) S.set("tc3_repairs", repairs);
    setState(function (st) {
      return Object.assign({}, st, {
        products: res.products,
        customers: res.customers,
        sales: res.sales,
        cheques: res.cheques,
        repairs: repairs
      });
    });
    addAudit("Voided Sale Invoice", (res.voidedSale.invoiceNo || voidSaleTarget.id.slice(0, 8)) + (voidReason ? " — " + voidReason : ""));
    releaseInvoiceEditLock(S, voidSaleTarget.id, lockId, { force: true });
    setVoidSaleTarget(null);
    setVoidReason("");
    setVoidRefundConfirm(false);
    if (res.refundHint && res.refundHint.message) {
      showAlert("Invoice voided.\n\n" + res.refundHint.message);
    }
  };
  var deviceStatusCode = function (st) {
    if (st === "Delivered") return "D";
    if (st === "Returned") return "RT";
    if (st === "Third Party") return "TP";
    if (st === "Ready") return "R";
    return "A";
  };
  var deviceStatusPill = function (status) {
    var st = status || "Accepted";
    var code = deviceStatusCode(st);
    var s = {
      code: code,
      label: deviceStatusLabel(st),
      bg: "#fff",
      fg: C.text,
      bd: C.border
    };
    if (st === "Accepted") { s.bg = "#fff7ed"; s.fg = "#c2410c"; s.bd = "#fed7aa"; }
    if (st === "Third Party") { s.bg = "#f5f3ff"; s.fg = "#7c3aed"; s.bd = "#ddd6fe"; }
    if (st === "Ready") { s.bg = "#ecfdf5"; s.fg = "#047857"; s.bd = "#a7f3d0"; }
    if (st === "Delivered") { s.bg = "#eff6ff"; s.fg = "#1d4ed8"; s.bd = "#bfdbfe"; }
    if (st === "Returned") { s.bg = "#fef2f2"; s.fg = "#b91c1c"; s.bd = "#fecaca"; }
    return s;
  };
  var deviceStatusBadge = function (status, compact) {
    var pill = deviceStatusPill(status);
    return (
      <span style={{ background: pill.bg, color: pill.fg, border: "1px solid " + pill.bd, borderRadius: 999, padding: compact ? "3px 9px" : "4px 11px", fontSize: compact ? 10 : 11, fontWeight: 700, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
        {!compact ? <span style={{ opacity: 0.75, fontWeight: 800, fontSize: 9 }}>{pill.code}</span> : null}
        <span>{pill.label}</span>
      </span>
    );
  };
  var deviceStatusPills = function (repair) {
    return normalizeRepairDevices(repair).map(function (d) { return deviceStatusPill(d.status || "Accepted"); });
  };
  var renderDeviceStatusActions = function (repair, idx, st) {
    return (
      <RepairStatusSelect
        currentStatus={st}
        compact={false}
        onAction={function (action) { handleDeviceStatusAction(repair, idx, action); }}
      />
    );
  };
  var handleDeviceStatusAction = function (repair, deviceIndex, action) {
    if (!repair || !action) return;
    if (action === "__receive__") {
      openThirdPartyReceiveModal(repair, deviceIndex);
      return;
    }
    if (action === "__invoice__") {
      openConvertModal(repair, [deviceIndex]);
      return;
    }
    if (action === "__void__") {
      promptVoidDelivered(repair.id, deviceIndex);
      return;
    }
    if (action === "Third Party") {
      openThirdPartySendModal(repair, [deviceIndex]);
      return;
    }
    updateDeviceStatus(repair, deviceIndex, action);
  };
  var deviceStatusCodesText = function (repair) {
    var ds = normalizeRepairDevices(repair);
    var codes = ds.map(function (d) { return deviceStatusCode(d.status || "Accepted"); });
    var uniq = codes.filter(function (x, i) { return codes.indexOf(x) === i; });
    if (uniq.length === 1) return uniq[0];
    return codes.join(" | ");
  };
  var mergeReturnedLog = function (existing, newEntries) {
    var cur = Array.isArray(existing) ? existing.slice() : [];
    (newEntries || []).forEach(function (e) {
      if (!e) return;
      cur.push(e);
    });
    return cur;
  };

  var posDupNameKeys = props.getDuplicateNormalizedNameKeys ? props.getDuplicateNormalizedNameKeys(state.customers || []) : {};
  var saveInlineCustomer = function (draft) {
    var result = createAndPersistCustomer({
      customers: state.customers || [],
      setState: setState,
      S: S,
      uid: uid,
      tcTrialGuard: tcTrialGuard,
      draft: draft,
    });
    if (!result.ok) return null;
    var created = result.customer;
    setCustSearch(created.name + (created.phone ? (" - " + created.phone) : ""));
    setF(function (x) { return Object.assign({}, x, { customer: created.name, customerId: created.id, phone: created.phone || "" }); });
    return created;
  };
  var saveInlineSupplier = function (draft) {
    var name = String((draft && draft.name) || draft || "").trim();
    var phone = String((draft && draft.phone) || "").trim();
    var address = String((draft && draft.address) || "").trim();
    if (!name) return null;
    if (!tcTrialGuard(state.suppliers || [], "suppliers")) return null;
    var created = { id: uid(), name: name, phone: phone, address: address, payable: 0 };
    var nextSuppliers = (state.suppliers || []).concat([created]);
    S.set("tc3_suppliers", nextSuppliers);
    setState(function (st) { return Object.assign({}, st, { suppliers: nextSuppliers }); });
    return created;
  };
  var saveInlineSupplierFromPicker = function (draft) {
    var created = saveInlineSupplier(draft);
    if (!created) return null;
    setSuppSearch(created.name + (created.phone ? (" - " + created.phone) : ""));
    setThirdPartyReceiveForm(function (x) {
      return Object.assign({}, x, { supplierId: created.id, supplierName: created.name, supplierPhone: created.phone || "" });
    });
    return created;
  };
  var defaultThirdPartyProductName = function (repair, device, idx) {
    return defaultRepair3pProductName(peekRepair3pCode(S), repair, device || {});
  };
  var ensureThirdPartyProduct = function (repair, deviceIndex, form) {
    var products = (state.products || []).slice();
    var devices = normalizeRepairDevices(repair);
    var d = devices[deviceIndex] || {};
    var tp = d.thirdParty || {};
    var p = null;
    if (tp.productId) {
      p = products.find(function (x) { return x.id === tp.productId; }) || null;
    }
    var cost = parseFloat(form.costAmount) || 0;
    var sell = parseFloat(form.sellAmount) || 0;
    if (!p) {
      var code = nextRepair3pCode(S);
      var name = String(form.productName || "").trim() || defaultRepair3pProductName(code, repair, d);
      if (!name.startsWith("#")) name = code + " " + name;
      p = {
        id: uid(),
        productId: code,
        name: name,
        barcode: code.replace(/^#/, "R3P-"),
        category: "Repair 3rd Party",
        unit: "Pcs",
        type: "stock",
        cost: cost,
        price: sell,
        stock: 1,
        _repair3pOneTime: true,
        _repairInternal: true,
        _repairSold: false,
        _repairId: repair.id,
        _repairDeviceIndex: deviceIndex
      };
      products.push(p);
    } else {
      var keepCode = String(p.productId || "").trim();
      var editName = String(form.productName || "").trim() || p.name || defaultRepair3pProductName(keepCode || peekRepair3pCode(S), repair, d);
      p = Object.assign({}, p, {
        name: editName,
        cost: cost,
        price: sell,
        stock: (p.stock || 0) > 0 ? p.stock : 1,
        _repair3pOneTime: true,
        _repairInternal: true,
        _repairSold: false,
      });
      products = products.map(function (x) { return x.id === p.id ? p : x; });
    }
    return { product: p, products: products };
  };

  var saveNew = function () {
    if (!f.customer || !f.deviceType) return;
    var acceptedDay = f.dateIn || actionToday();
    var proceed = function () {
      var devices = normalizeRepairDevices(f).map(function (d) {
        var st = d.status || "Accepted";
        var stamped = stampDeviceTimeline(d, { acceptedAt: acceptedDay });
        /* Only stamp later event dates if device already starts in a later status */
        if (st !== "Accepted") {
          stamped = applyStatusChangeToDevice(stamped, st, actionToday());
        }
        return stamped;
      });
      var first = devices[0] || blankDevice();
      var billStatus = deriveRepairStatus(devices);
      var returnedLog = devices.map(function (d, idx) {
        if ((d.status || "Accepted") !== "Returned") return null;
        return { id: uid(), date: actionToday(), deviceIndex: idx, device: Object.assign({}, d) };
      }).filter(Boolean);
      var r = {
        id: uid(), date: actionToday(), dateIn: acceptedDay, dateOut: f.dateOut || "",
        customer: f.customer, customerId: f.customerId || "", phone: f.phone || "",
        deviceType: first.deviceType || f.deviceType, brand: first.brand || f.brand || "", modelNo: first.modelNo || f.modelNo || "",
        serialNo: first.serialNo || "",
        problem: first.problem || f.problem || "", description: f.description || "",
        devices: devices,
        returnedLog: returnedLog,
        estimatedCost: parseFloat(f.estimatedCost) || 0,
        technician: f.technician || "", accessories: f.accessories || "",
        status: billStatus
      };
      if (!tcTrialGuard(state.repairs, 'repairs')) return null;
      var nr = state.repairs.concat([r]);
      S.set("tc3_repairs", nr);
      setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
      setShow(false); setF(BLANK); setCustSearch("");
      return r; /* return for print usage */
    };
    if (typeof checkPeriodClose === "function") {
      return checkPeriodClose(acceptedDay, state.settings, proceed);
    }
    return proceed();
  };

  var saveEdit = function (skipPrompt) {
    if (!editR) return;
    var devices = normalizeRepairDevices(editR);
    var orig = state.repairs.find(function (r) { return r.id === editR.id; });
    var origDevices = orig ? normalizeRepairDevices(orig) : [];
    var newReturned = [];
    var eventDay = actionToday();
    devices = devices.map(function (d, idx) {
      var was = (origDevices[idx] && origDevices[idx].status) || "Accepted";
      var now = d.status || "Accepted";
      if (was !== "Returned" && now === "Returned") {
        newReturned.push({ id: uid(), date: eventDay, deviceIndex: idx, device: Object.assign({}, d) });
      }
      if (was !== now) {
        return applyStatusChangeToDevice(d, now, eventDay);
      }
      return d;
    });
    var nextEdit = buildRepairPatch(editR, devices, {
      returnedLog: mergeReturnedLog(editR.returnedLog, newReturned)
    });
    var nr = state.repairs.map(function (r) { return r.id === editR.id ? nextEdit : r; });
    S.set("tc3_repairs", nr);
    var origStatus = orig ? getRepairStatus(orig) : "";
    if (orig && origStatus !== nextEdit.status) {
      addAudit("Repair Status: " + origStatus + " → " + nextEdit.status, nextEdit.customer + " | " + firstDeviceSummary(nextEdit));
    }
    setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    if (!skipPrompt && orig && !normalizeRepairDevices(orig).some(function (d) { return (d.status || "Accepted") === "Ready"; }) && devices.some(function (d) { return (d.status || "Accepted") === "Ready"; })) {
      setReadyPrompt(nextEdit);
    }
    setEditR(null);
  };

  var doDelete = function () {
    if (!deleteModal || !deleteReason.trim()) return;
    var repair = (state.repairs || []).find(function (x) { return x && x.id === deleteModal.id; }) || deleteModal;
    var linkedSale = (state.sales || []).find(function (s) {
      if (!s || isVoidedTxn(s)) return false;
      if (String(s.fromRepairId) === String(repair.id)) return true;
      return (s.items || []).some(function (it) { return it && String(it.fromRepairId) === String(repair.id); });
    });
    if (linkedSale) {
      showAlert("Cannot delete this repair: active invoice " + (linkedSale.invoiceNo || linkedSale.id.slice(0, 8)) + " is linked. Void the invoice first.");
      return;
    }
    var internal = Array.isArray(repair.internalPartsUsed) ? repair.internalPartsUsed : [];
    var np = state.products || [];
    var dl = state.damageLog || [];
    if (internal.length) {
      np = np.map(function (p) {
        var used = internal.find(function (u) { return u && u.productId === p.id; });
        if (!used) return p;
        var q = Number(used.qty) || 0;
        if (q <= 0) return p;
        return stampProductStock(Object.assign({}, p, { stock: Number((p.stock || 0) + q) }), null, p);
      });
      dl = dl.filter(function (d) { return !(d && String(d.repairId) === String(repair.id)); });
    }
    var nr = state.repairs.filter(function (r) { return r.id !== repair.id; });
    var log = (state.repairDeleteLog || []).concat([{
      id: uid(),
      date: today(),
      repairId: repair.id,
      customer: repair.customer,
      device: (repair.deviceType || "Device") + " " + (repair.brand || ""),
      reason: deleteReason,
      restoredInternalParts: internal.length > 0,
    }]);
    S.set("tc3_repairs", nr);
    S.set("tc3_repairDeleteLog", log);
    if (internal.length) {
      S.set("tc3_products", np);
      S.set("tc3_damageLog", dl);
    }
    setState(function (st) {
      return Object.assign({}, st, {
        repairs: nr,
        repairDeleteLog: log,
        products: internal.length ? np : st.products,
        damageLog: internal.length ? dl : st.damageLog,
      });
    });
    setDeleteModal(null); setDeleteReason("");
  };

  var isRepairStatusLocked = function (status) {
    return status === "Delivered" || status === "Returned";
  };

  var verifyAdminPassword = function (input) {
    var pw = String(input || "");
    if (!pw) return Promise.resolve(false);
    if (props.isNetworkClient) {
      var st = S.get("tc3_settings", {}) || {};
      if (!st.mainAdminPassHash) return Promise.resolve(false);
      return props.pwMatchesAsync(pw, st.mainAdminPassHash);
    }
    var stored = S.get("tc3_apppass", "");
    if (!stored) return Promise.resolve(false);
    return props.pwMatchesAsync(pw, stored);
  };

  var requestRepairLock = function (cfg) {
    setRepairLockModal(cfg || null);
    setRepairLockPw("");
    setRepairLockErr("");
  };

  var submitRepairLock = function () {
    if (!repairLockModal) return;
    if (!repairLockPw) {
      setRepairLockErr("Enter admin password.");
      return;
    }
    verifyAdminPassword(repairLockPw).then(function (ok) {
      if (!ok) {
        setRepairLockErr("Incorrect password.");
        setRepairLockPw("");
        return;
      }
      var fn = repairLockModal && repairLockModal.onConfirm;
      setRepairLockModal(null);
      setRepairLockPw("");
      setRepairLockErr("");
      if (typeof fn === "function") fn();
    });
  };

  /* ── Open the "Convert to Invoice" config modal ── */
  var openConvertModal = function (r, limitIndexes) {
    var devices = normalizeRepairDevices(r);
    var readyIndexes = [];
    devices.forEach(function (d, idx) {
      if ((d.status || "Accepted") !== "Ready") return;
      if (limitIndexes && limitIndexes.length && limitIndexes.indexOf(idx) < 0) return;
      readyIndexes.push(idx);
    });
    if (!readyIndexes.length) { showAlert("No ready devices found in this repair bill to convert."); return; }
    var tpLines = readyIndexes.map(function (idx) {
      var d = devices[idx] || {};
      var tp = d.thirdParty || {};
      if (!tp.productId) return null;
      var p = (state.products || []).find(function (x) { return x.id === tp.productId; }) || null;
      return {
        deviceIndex: idx,
        productId: tp.productId,
        productName: (p && p.name) || tp.productName || defaultThirdPartyProductName(r, d, idx),
        billName: (p && p.name) || tp.productName || defaultThirdPartyProductName(r, d, idx),
        cost: Number(tp.amount || (p && p.cost) || 0),
        sell: Number(tp.sellAmount || (p && p.price) || 0),
        include: true
      };
    }).filter(Boolean);
    setConvertThirdPartyLines(tpLines);
    setServicePrice("");
    setServiceCost("");
    var firstReady = devices[readyIndexes[0]] || blankDevice();
    setConvertInvoiceName("Repair Service — " + firstReady.deviceType + (firstReady.brand ? " " + firstReady.brand : "") + (firstReady.modelNo ? " (" + firstReady.modelNo + ")" : "") + (firstReady.problem ? " | " + firstReady.problem : ""));
    if (!tpLines.length) {
      setServiceCost(String(firstReady.estimatedCost != null ? firstReady.estimatedCost : (r.estimatedCost != null ? r.estimatedCost : r.cost || 0)));
    }
    /* Prefer 3P-ready devices when present so Convert doesn't also pull unrelated in-house Ready devices */
    var defaultIdxs = readyIndexes.slice();
    if (tpLines.length > 0) {
      var tpOnly = tpLines.map(function (t) { return t.deviceIndex; }).filter(function (i) {
        return readyIndexes.indexOf(i) >= 0;
      });
      if (tpOnly.length) defaultIdxs = tpOnly;
    }
    setConvertDeviceIndexes(defaultIdxs);
    setRepairInternalParts([{
      rowId: uid(),
      productId: "",
      qty: "",
      searchText: ""
    }]);
    setConvertModal(r);
  };

  /* ── Actually send to POS with prefill data ── */
  var doConvertToInvoice = function () {
    var r = convertModal;
    if (!r) return;
    var custObj = (r.customerId && state.customers.find(function (c) { return c.id === r.customerId; })) || state.customers.find(function (c) { return c.name === r.customer; });
    var svcPrice = parseFloat(servicePrice) || 0;
    var svcCost  = parseFloat(serviceCost) || 0;
    var allDevices = normalizeRepairDevices(r);
    var selectedIndexes = (convertDeviceIndexes || []).filter(function (idx) { return idx >= 0 && idx < allDevices.length; });
    if (!selectedIndexes.length) {
      showAlert("Select at least one device to convert.");
      return;
    }
    var invalid = selectedIndexes.some(function (idx) { return (allDevices[idx].status || "Accepted") !== "Ready"; });
    if (invalid) {
      showAlert("Only devices with status Ready can be converted.");
      return;
    }
    var partsRows = (repairInternalParts || []).filter(function (x) { return x && x.productId && (parseFloat(x.qty) || 0) > 0; });
    var usedRows = [];
    var totalPartsCost = 0;
    var stockErr = "";
    partsRows.forEach(function (row) {
      if (stockErr) return;
      var p = (state.products || []).find(function (prod) { return prod.id === row.productId; });
      var qty = parseFloat(row.qty) || 0;
      if (!p || qty <= 0) return;
      if ((p.stock || 0) < qty) {
        stockErr = "Not enough stock for \"" + (p.name || "product") + "\". Available: " + fmtNum(p.stock || 0);
        return;
      }
      var cost = Number(p.cost || 0) * qty;
      totalPartsCost += cost;
      usedRows.push({
        productId: p.id,
        name: p.name,
        qty: qty,
        unit: p.unit || "Pcs",
        unitCost: Number(p.cost || 0),
        totalCost: cost
      });
    });
    if (stockErr) {
      showAlert(stockErr);
      return;
    }
    /* Build invoice lines FIRST — deduct stock only after we know there is something to invoice */
    var liveRepair = (state.repairs || []).find(function (rep) { return rep && rep.id === r.id; }) || r;
    allDevices = normalizeRepairDevices(liveRepair);
    var tpByDevice = {};
    (convertThirdPartyLines || []).forEach(function (x) {
      if (x && x.productId != null && x.deviceIndex != null) tpByDevice[x.deviceIndex] = x;
    });
    var tpDeviceIdx = {};
    var thirdPartyItems = [];
    selectedIndexes.forEach(function (idx) {
      var d = allDevices[idx] || {};
      var tp = d.thirdParty || {};
      var line = tpByDevice[idx];
      var productId = (line && line.productId) || tp.productId || "";
      if (!productId) return;
      var p = (state.products || []).find(function (x) { return x.id === productId; }) || null;
      tpDeviceIdx[idx] = true;
      thirdPartyItems.push({
        id: productId,
        name: (line && (line.billName || line.productName)) || (p && p.name) || tp.productName || "Repair 3P",
        qty: 1,
        price: Number(line && line.sell != null ? line.sell : (tp.sellAmount != null ? tp.sellAmount : (p && p.price) || 0)),
        cost: Number(line && line.cost != null ? line.cost : (tp.amount != null ? tp.amount : (p && p.cost) || 0)),
        barcode: (p && p.barcode) || "",
        fromRepairId: r.id
      });
    });
    var nonTpIndexes = selectedIndexes.filter(function (idx) { return !tpDeviceIdx[idx]; });
    var invoiceItems = thirdPartyItems.slice();
    if (nonTpIndexes.length > 0) {
      var hasPricedService = svcPrice > 0 || svcCost > 0;
      if (thirdPartyItems.length === 0 || hasPricedService) {
        var svcDevice = allDevices[nonTpIndexes[0]] || blankDevice();
        invoiceItems.unshift({
          id: uid(),
          name: String(convertInvoiceName || "").trim() || ("Repair Service — " + svcDevice.deviceType + (svcDevice.brand ? " " + svcDevice.brand : "") + (svcDevice.modelNo ? " (" + svcDevice.modelNo + ")" : "") + (svcDevice.problem ? " | " + svcDevice.problem : "")),
          qty: 1,
          price: svcPrice,
          cost: svcCost,
          barcode: "",
          fromRepairId: r.id
        });
      }
    }
    if (!invoiceItems.length) {
      showAlert("Nothing to invoice. Select a ready device with a 3P product or enter a service sell/cost.");
      return;
    }
    if (usedRows.length) {
      var useDay = today();
      var useTs = new Date().toISOString();
      var np = (state.products || []).map(function (p) {
        var used = usedRows.find(function (u) { return u.productId === p.id; });
        if (!used) return p;
        return stampProductStock(Object.assign({}, p, { stock: Number((p.stock || 0) - used.qty) }), useTs, p);
      });
      var pl = (state.productLog || []).concat(usedRows.map(function (u) {
        return {
          id: uid(),
          date: useDay,
          type: "Repair Internal Use",
          productId: u.productId,
          productName: u.name,
          qty: -u.qty,
          note: "Repair #" + String(r.id || "").slice(0, 8).toUpperCase() + " | " + (r.customer || ""),
        };
      }));
      var dl = (state.damageLog || []).concat(usedRows.map(function (u) {
        return stampTransactionIsoDateTime({
          id: uid(),
          date: useDay,
          createdAt: useTs,
          productId: u.productId,
          productName: u.name,
          qty: u.qty,
          cost: u.unitCost || 0,
          repairId: r.id,
          reason: "Repair internal use — " + (r.customer || "") + " (#" + String(r.id || "").slice(0, 8).toUpperCase() + ")",
        }, useTs);
      }));
      S.set("tc3_products", np);
      S.set("tc3_productLog", pl);
      S.set("tc3_damageLog", dl);
      setState(function (st) { return Object.assign({}, st, { products: np, productLog: pl, damageLog: dl }); });
      addAudit("Repair internal stock used", (r.customer || "") + " | " + usedRows.map(function (u) { return u.name + " x" + fmtNum(u.qty); }).join(", "));
      var nr = (state.repairs || []).map(function (rep) {
        if (rep.id !== r.id) return rep;
        return stampUpdatedAt(Object.assign({}, rep, {
          internalPartsUsed: ((rep.internalPartsUsed || []).concat(usedRows)),
          internalPartsCost: Number((rep.internalPartsCost || 0) + totalPartsCost)
        }));
      });
      S.set("tc3_repairs", nr);
      setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    }
    var prefill = {
      customerName: r.customer,
      customerPhone: r.phone || "",
      customerId: custObj ? custObj.id : "",
      items: invoiceItems,
      fromRepairId: r.id,
      fromRepairDeviceIndexes: selectedIndexes.filter(function (idx) {
        if (tpDeviceIdx[idx]) return true;
        return thirdPartyItems.length === 0 || svcPrice > 0 || svcCost > 0;
      })
    };
    S.set("tc3_repair_prefill", prefill);
    /* NOTE: Do NOT set status to Delivered here.
       The repair status is updated to Delivered only when the POS invoice is actually saved.
       See saveAndFinish() in POS — it checks fromRepairId and updates the repair. */
    setConvertModal(null);
    props.setActive("pos");
  };

  /* ── Shared repair job HTML builder ── */
  var buildRepairJobHtml = function (r, size, deviceIndexes) {
    var settings = (props.state && props.state.settings) || {};
    var isA5 = size === "a5";
    var W = isA5 ? "148mm" : "210mm";
    var mw = isA5 ? "560px" : "794px";
    var fs = 11;
    var accent = "#1a4fa0";
    var gridBorder = "#cfd8e6";
    var cellPad = "7px 10px";
    var printRepair = repairForPrint(r, deviceIndexes);
    var rowStatus = printRepair.status || getRepairStatus(r);
    var devices = normalizeRepairDevices(printRepair);
    var jobId = String(r.id || "").slice(0, 8).toUpperCase();
    var dateIn = r.dateIn || r.date || "—";
    var dateOut = r.dateOut || "—";
    var estCost = getCurrencySymbol() + " " + Number(r.estimatedCost || r.cost || 0).toLocaleString();

    var css = [
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; width: " + W + "; margin: 0 auto; }",
      ".sheet { width: " + mw + "; max-width: 100%; margin: 0 auto; min-height: " + (isA5 ? "794px" : "1123px") + "; display: flex; flex-direction: column; }",
      ".pad { padding-left: 24px; padding-right: 24px; }",
      ".rule { margin: 0 24px 14px; border-top: 2px solid " + accent + "; }",
      ".sec-title { font-size: " + (fs + 1) + "px; font-weight: 800; color: " + accent + "; margin-bottom: 6px; }",
      ".bill-line { font-size: " + fs + "px; color: #333; padding: 3px 0; }",
      ".bill-label { color: #888; }",
      "table.devices { width: 100%; border-collapse: collapse; font-size: " + fs + "px; border: 1px solid " + gridBorder + "; }",
      "table.devices th { background: " + accent + "; color: #fff; padding: " + cellPad + "; font-weight: 700; font-size: " + (fs - 1) + "px; border-right: 1px solid rgba(255,255,255,0.35); }",
      "table.devices th:last-child { border-right: none; }",
      "table.devices td { padding: " + cellPad + "; border-bottom: 1px solid #e8ecf2; border-right: 1px solid " + gridBorder + "; vertical-align: top; }",
      "table.devices td:last-child { border-right: none; }",
      "table.devices tr:last-child td { border-bottom: none; }",
      ".job-meta { width: 100%; border-collapse: collapse; font-size: " + fs + "px; border: 1px solid #e4e9f2; border-radius: 10px; overflow: hidden; }",
      ".job-meta td { padding: 8px 12px; border-bottom: 1px solid #eef2f7; }",
      ".job-meta tr:last-child td { border-bottom: none; }",
      ".job-meta .k { color: #5a6472; font-weight: 600; width: 140px; }",
      ".job-meta .v { color: #111; font-weight: 700; }",
      ".notes { border: 1px solid #e4e9f2; border-radius: 8px; padding: 10px 12px; font-size: " + fs + "px; color: #333; line-height: 1.55; background: #fff; }",
      ".sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 28px 24px 12px; }",
      ".sig-box { border-top: 1.5px solid #cfd8e6; padding-top: 8px; text-align: center; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }",
      ".footer-spacer { flex: 1 1 auto; min-height: 16px; }",
      ".print-footer { margin: 0 24px; padding-top: 8px; padding-bottom: 12px; }",
      "@media print { body { margin: 0; } .sheet { width: 100%; min-height: " + (isA5 ? "148mm" : "297mm") + "; } }"
    ].join("\n");

    var body = "<style>" + css + "</style><div class='sheet'>";
    body += buildDocPrintHeaderHtml({
      settings: settings,
      title: "Job Card",
      escapeHtml: escapeHtml,
      padPx: 24,
      showTopbar: true,
      metaRows: [
        { label: "Job No:", value: "#" + jobId, mono: true },
        { label: "Date In:", value: String(dateIn) },
        { label: "Status:", value: rowStatus || "Accepted" },
      ],
    });

    /* Customer */
    body += "<div class='pad' style='margin-bottom:14px;'>";
    body += "<div class='sec-title'>Customer</div>";
    body += "<div style='border-top:1px solid #e5e7eb;padding-top:8px;'>";
    body += "<div class='bill-line'><span class='bill-label'>Customer: </span><strong>" + escapeHtml(r.customer || "—") + "</strong></div>";
    body += "<div class='bill-line'><span class='bill-label'>Phone: </span>" + escapeHtml(r.phone || "—") + "</div>";
    body += "</div></div>";

    /* Job details */
    body += "<div class='pad' style='margin-bottom:14px;'>";
    body += "<table class='job-meta'><tbody>";
    body += "<tr><td class='k'>Date Received</td><td class='v'>" + escapeHtml(String(dateIn)) + "</td><td class='k'>Est. Completion</td><td class='v'>" + escapeHtml(String(dateOut)) + "</td></tr>";
    body += "<tr><td class='k'>Est. Cost</td><td class='v' style='color:#0f9e6e;'>" + escapeHtml(estCost) + "</td><td class='k'>Technician</td><td class='v'>" + escapeHtml(r.technician || "—") + "</td></tr>";
    body += "</tbody></table></div>";

    /* All devices — one row each (no primary / additional split) */
    body += "<div class='pad' style='margin-bottom:14px;'>";
    body += "<table class='devices'><thead><tr>";
    body += "<th style='text-align:center;width:28px;'>#</th>";
    body += "<th style='text-align:left;width:14%;'>Device</th>";
    body += "<th style='text-align:left;width:20%;'>Brand &amp; Model</th>";
    body += "<th style='text-align:left;width:18%;'>Serial / IMEI</th>";
    body += "<th style='text-align:left;'>Problem Reported</th>";
    body += "<th style='text-align:center;width:12%;'>Status</th>";
    body += "</tr></thead><tbody>";
    devices.forEach(function (d, i) {
      var brandModel = ((d.brand || "") + " " + (d.modelNo || "")).trim() || "—";
      var serial = String(d.serialNo || d.imei || "").trim() || "—";
      var dStatus = d.status || rowStatus || "Accepted";
      body += "<tr>";
      body += "<td style='text-align:center;color:#888;font-weight:600;'>" + (i + 1) + "</td>";
      body += "<td style='font-weight:600;color:#111;'>" + escapeHtml(d.deviceType || "Device") + "</td>";
      body += "<td style='color:#333;'>" + escapeHtml(brandModel) + "</td>";
      body += "<td style='color:#333;font-family:monospace;font-size:10px;letter-spacing:0.02em;'>" + escapeHtml(serial) + "</td>";
      body += "<td style='color:#111;font-weight:500;'>" + escapeHtml(d.problem || "—") + "</td>";
      body += "<td style='text-align:center;font-weight:700;color:#333;'>" + escapeHtml(dStatus) + "</td>";
      body += "</tr>";
    });
    body += "</tbody></table>";
    body += "<div style='border-top:2px solid " + accent + ";'></div>";
    body += "</div>";

    if (r.description) {
      body += "<div class='pad' style='margin-bottom:14px;'>";
      body += "<div class='sec-title'>Additional Notes</div>";
      body += "<div class='notes'>" + escapeHtml(r.description) + "</div></div>";
    }
    if (r.accessories) {
      body += "<div class='pad' style='margin-bottom:14px;'>";
      body += "<div class='sec-title'>Accessories / Items Received</div>";
      body += "<div class='notes'>" + escapeHtml(r.accessories) + "</div></div>";
    }

    body += "<div class='sig-row'><div class='sig-box'>Customer Signature</div><div class='sig-box'>Technician / Staff</div></div>";

    /* Spacer pushes footer to bottom of page — same pattern as sales / quotation invoice */
    body += "<div class='footer-spacer'></div>";

    body += "<div class='print-footer'>";
    body += "<div style='display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:8px;'>";
    body += "<div style='width:22%;border-top:1px solid " + accent + ";opacity:0.65;'></div>";
    body += "<div style='font-size:12px;font-weight:700;color:" + accent + ";text-align:center;font-style:italic;letter-spacing:0.01em;'>We take care of your devices</div>";
    body += "<div style='width:22%;border-top:1px solid " + accent + ";opacity:0.65;'></div>";
    body += "</div>";
    body += "<div style='text-align:center;font-size:8px;color:#000;font-weight:400;padding-bottom:4px;'>Powered By Techon Computers | +94 70 1234678</div>";
    body += "</div>";
    body += "</div>";
    return body;
  };

  /* ── Enhanced job card print ── */
  var printRepairJob = function (r, size, deviceIndexes) {
    var body = buildRepairJobHtml(r, size, deviceIndexes);
    var w = window.open("", "_blank", "width=900,height=780");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Repair Job Card</title></head><body>" + body + "</body></html>");
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  var whatsappRepairJob = function (r, size, deviceIndexes) {
    var body = buildRepairJobHtml(r, size, deviceIndexes);
    var filename = "RepairJob-" + r.id.slice(0, 8).toUpperCase();
    shareViaWhatsApp(body, filename, r.phone || "");
  };

  var buildAllDeviceRecordRows = function () {
    var rows = [];
    (state.repairs || []).forEach(function (repair) {
      normalizeRepairDevices(repair).forEach(function (device, deviceIndex) {
        var tl = getDeviceTimeline(repair, device);
        rows.push({
          rowKey: repair.id + "_rec_" + deviceIndex,
          repairId: repair.id,
          deviceIndex: deviceIndex,
          repair: repair,
          device: device,
          status: device.status || "Accepted",
          date: repair.dateIn || repair.date || "",
          timeline: tl
        });
      });
    });
    return sortNewestFirst(rows);
  };
  var exportRepairRecordsCsv = function (rows) {
    var headers = [
      "Bill #", "Customer", "Phone", "Device", "Brand", "Model", "Serial/IMEI", "Problem",
      "Status", "Supplier", "Supplier Phone", "Accepted", "Sent 3P", "Received 3P",
      "Ready", "Delivered", "Returned", "Est. Cost", "3P Cost", "3P Sell", "Technician", "Date Out"
    ];
    var escapeCsv = function (v) {
      var s = String(v == null ? "" : v);
      if (/[",\n\r]/.test(s)) return "\"" + s.replace(/"/g, "\"\"") + "\"";
      return s;
    };
    var lines = [headers.join(",")];
    rows.forEach(function (row) {
      var r = row.repair;
      var d = row.device;
      var tl = row.timeline || getDeviceTimeline(r, d);
      lines.push([
        String(r.id || "").slice(0, 8).toUpperCase(),
        r.customer || "",
        r.phone || "",
        d.deviceType || "",
        d.brand || "",
        d.modelNo || "",
        d.serialNo || "",
        d.problem || "",
        deviceStatusLabel(row.status),
        tl.supplierName || "",
        tl.supplierPhone || "",
        tl.acceptedAt || "",
        tl.sent3pAt || "",
        tl.received3pAt || "",
        tl.readyAt || "",
        tl.deliveredAt || "",
        tl.returnedAt || "",
        r.estimatedCost || r.cost || 0,
        tl.thirdPartyCost === "" ? "" : tl.thirdPartyCost,
        tl.thirdPartySell === "" ? "" : tl.thirdPartySell,
        r.technician || "",
        r.dateOut || ""
      ].map(escapeCsv).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "Repair-Records-" + today() + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  var currentTab = TABS.find(function (t) { return t.id === repairTab; }) || TABS[0];
  var q = search.toLowerCase();
  var listRepairProducts = function () {
    return (state.products || []).filter(isRepair3pInternalProduct).slice().sort(function (a, b) {
      var na = parseInt(String(a.productId || "").replace(/\D/g, ""), 10) || 0;
      var nb = parseInt(String(b.productId || "").replace(/\D/g, ""), 10) || 0;
      if (nb !== na) return nb - na;
      return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
  };
  var saveRepairProductEdit = function () {
    if (!editRepairProduct || !editRepairProduct.id) return;
    var name = String(editRepairProduct.name || "").trim();
    if (!name) { showAlert("Product name is required."); return; }
    var existing = (state.products || []).find(function (p) { return p.id === editRepairProduct.id; });
    if (!existing) { setEditRepairProduct(null); return; }
    var soldLocked = isRepair3pSoldProduct(existing) || !!editRepairProduct.sold;
    /* Cost is always locked after 3P receive — supplier payable/payment already posted at that amount. */
    var cost = Number(existing.cost) || 0;
    var sell = soldLocked ? (Number(existing.price) || 0) : (parseFloat(editRepairProduct.sell) || 0);
    var ts = new Date().toISOString();
    var np = (state.products || []).map(function (p) {
      if (p.id !== editRepairProduct.id) return p;
      var patch = { name: name };
      if (!soldLocked) patch.price = sell;
      return stampUpdatedAt(Object.assign({}, p, patch), ts);
    });
    /* Sync name (+ sell before sold) on linked repair devices; never rewrite cost/payable amount from here. */
    var nr = (state.repairs || []).map(function (rep) {
      var devices = normalizeRepairDevices(rep);
      var changed = false;
      var nextDevices = devices.map(function (d) {
        var tp = d.thirdParty || {};
        if (tp.productId !== editRepairProduct.id) return d;
        changed = true;
        var tpPatch = { productName: name };
        if (!soldLocked) tpPatch.sellAmount = sell;
        return Object.assign({}, d, {
          thirdParty: Object.assign({}, tp, tpPatch)
        });
      });
      if (!changed) return rep;
      return stampUpdatedAt(Object.assign({}, rep, { devices: nextDevices }), ts);
    });
    S.set("tc3_products", np);
    S.set("tc3_repairs", nr);
    setState(function (st) { return Object.assign({}, st, { products: np, repairs: nr }); });
    addAudit(
      "Repair product updated",
      (editRepairProduct.productId || "") + " | " + name
        + (soldLocked ? " | sell locked (sold)" : (" | Sell " + sell))
        + " | cost locked (supplier payable)"
    );
    setEditRepairProduct(null);
  };
  var thirdPartySupplierOptions = repairTab === "thirdparty" ? (function () {
    var map = {};
    flattenRepairDeviceRows().filter(function (row) { return row.status === "Third Party"; }).forEach(function (row) {
      var tp = row.device.thirdParty || {};
      var key = tp.supplierId || ("name:" + String(tp.supplierName || "Unknown").trim().toLowerCase());
      if (!map[key]) map[key] = { key: key, supplierId: tp.supplierId || "", supplierName: tp.supplierName || "Unknown supplier" };
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return String(a.supplierName).localeCompare(String(b.supplierName));
    });
  })() : [];
  var deviceMatchesThirdPartySupplier = function (device, filterKey) {
    if (!filterKey) return true;
    var tp = device.thirdParty || {};
    if (filterKey.indexOf("name:") === 0) {
      return ("name:" + String(tp.supplierName || "").trim().toLowerCase()) === filterKey;
    }
    return (tp.supplierId || "") === filterKey;
  };
  var allRepairProducts = listRepairProducts();
  var filtered = repairTab === "products"
    ? allRepairProducts.filter(function (p) {
      var sold = isRepair3pSoldProduct(p);
      if (repairProductFilter === "available" && sold) return false;
      if (repairProductFilter === "sold" && !sold) return false;
      if (!q) return true;
      var blob = [p.productId, p.name, p.barcode, p._repairId].join(" ").toLowerCase();
      return blob.indexOf(q) >= 0;
    }).map(function (p) { return { rowKey: p.id, product: p, isProduct: true }; })
    : repairTab === "active"
    ? sortNewestFirst((state.repairs || []).filter(function (r) {
      return isBillActive(r) && billMatchesSearch(r, q);
    }).map(function (r) { return { rowKey: r.id, repair: r, isBill: true }; }))
    : repairTab === "records"
    ? buildAllDeviceRecordRows().filter(function (row) {
      var r = row.repair;
      var d = row.device;
      var tl = row.timeline || {};
      var matchStatus = !recordsStatusFilter || row.status === recordsStatusFilter;
      var blob = [
        r.customer, r.phone, d.deviceType, d.brand, d.modelNo, d.serialNo, d.problem,
        tl.supplierName, deviceStatusLabel(row.status), String(r.id || "")
      ].join(" ").toLowerCase();
      var matchQ = !q || blob.indexOf(q) >= 0;
      return matchStatus && matchQ;
    })
    : flattenRepairDeviceRows().filter(function (row) {
      var matchTab = row.status === currentTab.status;
      var r = row.repair;
      var d = row.device;
      var tpName = ((d.thirdParty && d.thirdParty.supplierName) || "").toLowerCase();
      var matchQ = !q || (r.customer || "").toLowerCase().includes(q) || (d.brand || "").toLowerCase().includes(q) || (d.modelNo || "").toLowerCase().includes(q) || (d.serialNo || "").toLowerCase().includes(q) || (d.problem || "").toLowerCase().includes(q) || tpName.includes(q);
      var matchSupplier = repairTab !== "thirdparty" || deviceMatchesThirdPartySupplier(d, thirdPartySupplierFilter);
      return matchTab && matchQ && matchSupplier;
    });

  var repPager = usePager(filtered, repairTab === "thirdparty" || repairTab === "products" ? THIRD_PARTY_PAGE_SIZE : (repairTab === "records" ? RECORDS_PAGE_SIZE : LIST_PAGE_SIZE));

  var fmtSheetDate = function (v) { return v ? fmtDate(v) : "—"; };
  var cntActive = countActiveBills();
  var cnt3p = countDevicesByStatus("Third Party");
  var cntReady = countDevicesByStatus("Ready");
  var cntDelivered = countDevicesByStatus("Delivered");
  var cntReturned = countDevicesByStatus("Returned");
  var cntRecords = buildAllDeviceRecordRows().length;
  var cntProducts = allRepairProducts.length;
  var cntProductsAvail = allRepairProducts.filter(function (p) { return !isRepair3pSoldProduct(p); }).length;
  var tabCountMap = {
    active: cntActive,
    thirdparty: cnt3p,
    ready: cntReady,
    delivered: cntDelivered,
    returned: cntReturned,
    products: cntProducts,
    records: cntRecords
  };
  var goTab = function (tabId) {
    if (repairTab === "thirdparty" && tabId !== "thirdparty") setThirdPartySupplierFilter("");
    if (tabId !== "records") setRecordsStatusFilter("");
    if (tabId !== "products") setRepairProductFilter("");
    setRepairTab(tabId);
  };
  var searchPlaceholder =
    repairTab === "records" ? "Search all records — customer, bill, device, supplier…"
      : repairTab === "thirdparty" ? "Search customer, device, problem, supplier…"
      : repairTab === "products" ? "Search repair product code or name…"
      : "Search customer, brand, model, problem…";

  return (
    <div className="erp-page erp-arap-modern is-rep">
      <div className="erp-arap-chrome">
        <div className="erp-arap-topbar">
          <div className="erp-arap-topbar-brand">
            <div className="erp-arap-brand-ico" aria-hidden="true">RP</div>
            <div>
              <h1 className="erp-arap-header-title">Repairs</h1>
              <p className="erp-arap-header-sub">Workshop jobs · devices &amp; status</p>
            </div>
          </div>
          <div className="erp-arap-kpi-row" aria-label="Repair overview">
            <div className="erp-arap-kpi is-orange">
              <span className="erp-arap-kpi-lbl">Active</span>
              <span className="erp-arap-kpi-val">{cntActive}</span>
              <span className="erp-arap-kpi-sub">bills in shop</span>
            </div>
            <div className="erp-arap-kpi is-purple">
              <span className="erp-arap-kpi-lbl">3rd Party</span>
              <span className="erp-arap-kpi-val">{cnt3p}</span>
              <span className="erp-arap-kpi-sub">at suppliers</span>
            </div>
            <div className="erp-arap-kpi is-green">
              <span className="erp-arap-kpi-lbl">Ready</span>
              <span className="erp-arap-kpi-val">{cntReady}</span>
              <span className="erp-arap-kpi-sub">awaiting pickup</span>
            </div>
            <div className="erp-arap-kpi is-blue">
              <span className="erp-arap-kpi-lbl">Total</span>
              <span className="erp-arap-kpi-val">{cntRecords}</span>
              <span className="erp-arap-kpi-sub">{cntDelivered} delivered</span>
            </div>
          </div>
          <button
            type="button"
            className="erp-arap-add is-rep"
            onClick={function () { setShow(true); setCustSearch(""); setF(BLANK); }}
          >
            <span className="erp-arap-add-ico" aria-hidden="true">+</span>
            <span>New Repair</span>
          </button>
        </div>
        <div className="erp-arap-tabs" role="tablist" aria-label="Repair status tabs">
          {TABS.map(function (tab) {
            var active = repairTab === tab.id;
            var count = tabCountMap[tab.id] || 0;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={"erp-arap-tab" + (active ? " is-active" : "")}
                onClick={function () { goTab(tab.id); }}
              >
                <span>{tab.label}</span>
                <span className="erp-arap-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="erp-arap-body">
        <div className="erp-arap-panel">
          <div className="erp-arap-toolbar">
            <div className="erp-arap-search-wrap">
              <input
                className="erp-arap-field"
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                placeholder={searchPlaceholder}
                aria-label="Search repairs"
              />
            </div>
            {repairTab === "records" ? (
              <div style={{ minWidth: 150, maxWidth: 200 }}>
                <select
                  className="erp-arap-field"
                  value={recordsStatusFilter}
                  onChange={function (e) { setRecordsStatusFilter(e.target.value); }}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="Accepted">Active</option>
                  <option value="Third Party">3rd Party</option>
                  <option value="Ready">Ready</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Returned">Returned</option>
                </select>
              </div>
            ) : null}
            {repairTab === "thirdparty" ? (
              <div style={{ minWidth: 180, maxWidth: 260 }}>
                <select
                  className="erp-arap-field"
                  value={thirdPartySupplierFilter}
                  onChange={function (e) { setThirdPartySupplierFilter(e.target.value); }}
                  aria-label="Filter by supplier"
                >
                  <option value="">All suppliers ({cnt3p})</option>
                  {thirdPartySupplierOptions.map(function (opt) {
                    var cnt = flattenRepairDeviceRows().filter(function (row) {
                      return row.status === "Third Party" && deviceMatchesThirdPartySupplier(row.device, opt.key);
                    }).length;
                    return <option key={opt.key} value={opt.key}>{opt.supplierName} ({cnt})</option>;
                  })}
                </select>
              </div>
            ) : null}
            {repairTab === "products" ? (
              <div style={{ minWidth: 150, maxWidth: 190 }}>
                <select
                  className="erp-arap-field"
                  value={repairProductFilter}
                  onChange={function (e) { setRepairProductFilter(e.target.value); }}
                  aria-label="Filter repair products"
                >
                  <option value="">All ({cntProducts})</option>
                  <option value="available">Available ({cntProductsAvail})</option>
                  <option value="sold">Sold / hidden ({Math.max(0, cntProducts - cntProductsAvail)})</option>
                </select>
              </div>
            ) : null}
            {search || recordsStatusFilter || thirdPartySupplierFilter || repairProductFilter ? (
              <button
                type="button"
                className="erp-arap-btn-clear"
                onClick={function () {
                  setSearch("");
                  setRecordsStatusFilter("");
                  setThirdPartySupplierFilter("");
                  setRepairProductFilter("");
                }}
              >Clear</button>
            ) : null}
            {repairTab === "records" ? (
              <button type="button" className="erp-arap-btn-clear" style={{ borderColor: "#a7f3d0", color: "#047857", background: "#ecfdf5" }} onClick={function () { exportRepairRecordsCsv(filtered); }}>
                Export CSV
              </button>
            ) : null}
            <span className="erp-arap-filter-meta">
              {currentTab.label} · {filtered.length.toLocaleString()}{" "}
              {repairTab === "active" ? "bills" : repairTab === "products" ? "products" : "devices"}
            </span>
          </div>

          <div className="erp-arap-table-wrap">
          {repairTab === "records" ? (
          <div className="erp-arap-sheet-wrap">
            <table className="erp-arap-sheet">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Device</th>
                  <th>Brand / Model</th>
                  <th>Serial / IMEI</th>
                  <th>Problem</th>
                  <th>Status</th>
                  <th>Supplier</th>
                  <th>Accepted</th>
                  <th>Sent 3P</th>
                  <th>Recv 3P</th>
                  <th>Ready</th>
                  <th>Delivered</th>
                  <th>Returned</th>
                  <th style={{ textAlign: "right" }}>Est. Cost</th>
                  <th>Tech</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={17} className="erp-arap-empty">No device records found</td></tr>
                )}
                {repPager.slice.map(function (row) {
                  var r = row.repair;
                  var d = row.device;
                  var tl = row.timeline || getDeviceTimeline(r, d);
                  var st = row.status;
                  var pill = deviceStatusPill(st);
                  return (
                    <tr key={row.rowKey}>
                      <td className="erp-arap-ref">#{String(r.id || "").slice(0, 8).toUpperCase()}</td>
                      <td className="erp-arap-src">{r.customer || "—"}</td>
                      <td>{r.phone || "—"}</td>
                      <td>{d.deviceType || "—"}</td>
                      <td>{((d.brand || "") + (d.modelNo ? " — " + d.modelNo : "")).trim() || "—"}</td>
                      <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11 }}>{d.serialNo || "—"}</td>
                      <td style={{ whiteSpace: "normal", maxWidth: 180, lineHeight: 1.3 }}>{d.problem || "—"}</td>
                      <td>
                        <span className="erp-arap-status-pill" style={{ background: pill.bg, color: pill.fg, border: "1px solid " + pill.bd }}>{deviceStatusLabel(st)}</span>
                      </td>
                      <td style={{ color: tl.supplierName ? "#6d28d9" : "#94a3b8", fontWeight: tl.supplierName ? 600 : 400 }}>{tl.supplierName || "—"}</td>
                      <td>{fmtSheetDate(tl.acceptedAt)}</td>
                      <td>{fmtSheetDate(tl.sent3pAt)}</td>
                      <td>{fmtSheetDate(tl.received3pAt)}</td>
                      <td>{fmtSheetDate(tl.readyAt)}</td>
                      <td>{fmtSheetDate(tl.deliveredAt)}</td>
                      <td>{fmtSheetDate(tl.returnedAt)}</td>
                      <td className="erp-arap-amt">{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</td>
                      <td>{r.technician || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : repairTab === "active" ? (
          <table className="erp-arap-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>Date In</th>
                <th style={{ width: "20%" }}>Customer</th>
                <th style={{ width: "12%" }}>Bill #</th>
                <th style={{ width: "32%" }}>Devices</th>
                <th style={{ width: "14%", textAlign: "right" }}>Est. Cost</th>
                <th style={{ width: "12%" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="erp-arap-empty">No active repair bills</td></tr>}
              {repPager.slice.map(function (row) {
                var r = row.repair;
                var devices = normalizeRepairDevices(r);
                var first = devices[0] || blankDevice();
                return (
                  <tr key={row.rowKey} className="table-row-hover">
                    <td>{fmtDate(r.dateIn || r.date)}</td>
                    <td className="erp-arap-src" title={r.customer}>{r.customer}</td>
                    <td className="erp-arap-ref">#{r.id.slice(0, 8).toUpperCase()}</td>
                    <td>
                      <div className="erp-arap-device">{first.deviceType} {first.brand} {first.modelNo}</div>
                      <div className="erp-arap-device-sub">
                        {devices.length} device{devices.length === 1 ? "" : "s"}
                        {devices.length > 1 ? " · " + devices.filter(function (d) { return (d.status || "Accepted") === "Accepted"; }).length + " active" : ""}
                      </div>
                    </td>
                    <td className="erp-arap-amt">{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</td>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup gap={4}>
                        <ActBtn tone="cyan" title="View repair bill" onClick={function () { openViewRepair(r, null); }} />
                        <ActBtn tone="blue" title="Edit repair bill" onClick={function () { setEditR(Object.assign({}, r, { devices: normalizeRepairDevices(r) })); }} />
                        <ActBtn tone="red" title="Void repair bill" onClick={function () {
                          var openDelete = function () { setDeleteModal(r); setDeleteReason(""); };
                          if (normalizeRepairDevices(r).some(function (x) { return (x.status || "Accepted") === "Delivered"; })) {
                            requestRepairLock({ title: "Admin password required", message: "Void repair bill for " + r.customer + "?", onConfirm: openDelete });
                            return;
                          }
                          openDelete();
                        }} />
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : repairTab === "products" ? (
          <table className="erp-arap-table" style={{ minWidth: 920, tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ width: 88 }}>Code</th>
                <th style={{ minWidth: 220 }}>Name</th>
                <th style={{ width: 100, textAlign: "right" }}>Cost</th>
                <th style={{ width: 100, textAlign: "right" }}>Sell</th>
                <th style={{ width: 72, textAlign: "right" }}>Stock</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 100 }}>Repair</th>
                <th style={{ width: 72 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="erp-arap-empty">No repair products yet — they appear when you receive from 3rd Party</td></tr>
              )}
              {repPager.slice.map(function (row) {
                var p = row.product;
                var sold = isRepair3pSoldProduct(p);
                return (
                  <tr key={row.rowKey} className="table-row-hover" style={sold ? { opacity: 0.72 } : undefined}>
                    <td className="erp-arap-ref" style={{ fontWeight: 800, color: "#0f766e" }}>{p.productId || "—"}</td>
                    <td style={{ whiteSpace: "normal", fontWeight: 650, color: "#0f172a", lineHeight: 1.3 }}>{p.name || "—"}</td>
                    <td className="erp-arap-amt">{getCurrencySymbol()} {fmtNum(p.cost || 0)}</td>
                    <td className="erp-arap-amt" style={{ color: "#047857", fontWeight: 800 }}>{getCurrencySymbol()} {fmtNum(p.price || 0)}</td>
                    <td className="erp-arap-amt">{fmtNum(p.stock || 0)}</td>
                    <td>
                      <span
                        className="erp-arap-status-pill"
                        style={sold
                          ? { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" }
                          : { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}
                      >
                        {sold ? "Sold" : "Available"}
                      </span>
                    </td>
                    <td className="erp-arap-ref" style={{ whiteSpace: "nowrap" }}>
                      {p._repairId ? "#" + String(p._repairId).slice(0, 8).toUpperCase() : "—"}
                    </td>
                    <td style={Object.assign({}, actBtnCellStyle, { width: 72, minWidth: 72 })}>
                      <ActBtnGroup gap={4}>
                        <ActBtn tone="blue" title="Edit repair product" onClick={function () {
                          setEditRepairProduct({
                            id: p.id,
                            productId: p.productId || "",
                            name: p.name || "",
                            cost: String(p.cost != null ? p.cost : ""),
                            sell: String(p.price != null ? p.price : ""),
                            sold: sold
                          });
                        }} />
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : (
          <table className="erp-arap-table" style={{ minWidth: repairTab === "thirdparty" ? 980 : 900, tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ width: 78 }}>Date In</th>
                <th style={{ width: 120 }}>Customer</th>
                <th style={{ width: 96 }}>Bill #</th>
                <th style={{ minWidth: 160 }}>Device</th>
                {repairTab === "thirdparty" ? <th style={{ width: 150 }}>Supplier</th> : null}
                <th style={{ minWidth: 140 }}>Problem</th>
                <th style={{ width: repairTab === "ready" ? 118 : 100, textAlign: "right" }}>
                  {repairTab === "ready" ? "Cost / Sell" : "Est. Cost"}
                </th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 88 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={repairTab === "thirdparty" ? 9 : 8} className="erp-arap-empty">
                    No devices in {currentTab.label.toLowerCase()}{thirdPartySupplierFilter ? " for this supplier" : ""}
                  </td>
                </tr>
              )}
              {repPager.slice.map(function (row) {
                var r = row.repair;
                var d = row.device;
                var tp = d.thirdParty || {};
                var readyAmt = repairTab === "ready" ? getDeviceActualAmounts(r, d) : null;
                return (
                  <tr key={row.rowKey} className="table-row-hover">
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.dateIn || r.date)}</td>
                    <td className="erp-arap-src" title={r.customer}>{r.customer}</td>
                    <td className="erp-arap-ref" style={{ whiteSpace: "nowrap" }}>#{r.id.slice(0, 8).toUpperCase()}</td>
                    <td style={{ whiteSpace: "normal" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <span className="erp-arap-chip">{d.deviceType}</span>
                        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 12 }}>{d.brand}{d.modelNo ? " — " + d.modelNo : ""}</span>
                      </div>
                      {d.serialNo ? <div className="erp-arap-device-sub" style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{d.serialNo}</div> : null}
                    </td>
                    {repairTab === "thirdparty" ? (
                      <td style={{ whiteSpace: "normal" }}>
                        <div className="erp-arap-supp">{tp.supplierName || "—"}</div>
                        {tp.supplierPhone ? <div className="erp-arap-device-sub">{tp.supplierPhone}</div> : null}
                        {tp.sentAt ? <div className="erp-arap-device-sub">Sent {fmtDate(tp.sentAt)}</div> : null}
                      </td>
                    ) : null}
                    <td style={{ whiteSpace: "normal", maxWidth: 220, lineHeight: 1.35, fontSize: 12 }}>{d.problem || "—"}</td>
                    <td className="erp-arap-amt" style={{ whiteSpace: "nowrap" }}>
                      {readyAmt ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, lineHeight: 1.25 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                            C {getCurrencySymbol()} {fmtNum(readyAmt.cost)}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#047857" }}>
                            S {getCurrencySymbol()} {fmtNum(readyAmt.sell)}
                          </span>
                        </div>
                      ) : (
                        <span>{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</span>
                      )}
                    </td>
                    <td style={{ verticalAlign: "middle", whiteSpace: "nowrap" }}>
                      <RepairStatusSelect
                        currentStatus={row.status}
                        compact
                        onAction={function (action) { handleDeviceStatusAction(r, row.deviceIndex, action); }}
                      />
                    </td>
                    <td style={Object.assign({}, actBtnCellStyle, { width: 88, minWidth: 88, whiteSpace: "nowrap" })}>
                      <ActBtnGroup gap={4}>
                        <ActBtn tone="cyan" title="View device" onClick={function () { openViewRepair(r, [row.deviceIndex]); }} />
                        <ActBtn tone="blue" title="Edit repair bill" onClick={function () { setEditR(Object.assign({}, r, { devices: normalizeRepairDevices(r) })); }} />
                      </ActBtnGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          </div>

          <div className="erp-arap-foot">
            <div className="erp-arap-pager-wrap">
              <Pager pager={repPager} />
            </div>
          </div>
        </div>

        {(state.repairDeleteLog || []).length > 0 ? (
          <div className="erp-arap-deleted">
            <div className="erp-arap-deleted-head">
              Deleted history
              <span>{(state.repairDeleteLog || []).length} records</span>
            </div>
            <div className="erp-arap-deleted-body">
              <table>
                <thead>
                  <tr>
                    <th>Deleted On</th>
                    <th>Customer</th>
                    <th>Device</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.repairDeleteLog || []).slice().reverse().map(function (l) {
                    return (
                      <tr key={l.id}>
                        <td>{fmtDateFull(l.date)}</td>
                        <td className="erp-arap-src">{l.customer}</td>
                        <td>{l.device}</td>
                        <td>{l.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {voidSaleTarget && (
        <Modal title={"Void Invoice — " + (voidSaleTarget.invoiceNo || voidSaleTarget.id.slice(0, 8))} onClose={function () { setVoidSaleTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>
          <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#b91c1c" }}>
            This will reverse stock, customer balance, and payments. The invoice stays on record as <strong>Voided</strong>. This cannot be undone.
            {(function () {
              var hint = computeVoidSaleRefundHint(voidSaleTarget, state.cheques || []);
              if (!hint.message) return null;
              return <div style={{ marginTop: 8, color: "#7f1d1d" }}>{hint.message}</div>;
            })()}
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          {(function () {
            var hint = computeVoidSaleRefundHint(voidSaleTarget, state.cheques || []);
            var paidCash = (voidSaleTarget.paymentHistory || []).reduce(function (a, ph) {
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
                <span>I confirm cash/bank received on this invoice will be refunded to the customer (books will post a reversing payment).</span>
              </label>
            );
          })()}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <RepairActionBtn tone="danger" disabled={!voidReason} onClick={doVoidSaleFromModal}>Void Invoice</RepairActionBtn>
            <RepairActionBtn tone="neutral" onClick={function () { setVoidSaleTarget(null); setVoidReason(""); setVoidRefundConfirm(false); }}>Cancel</RepairActionBtn>
          </div>
        </Modal>
      )}

      {thirdPartySendModal && (
        <Modal title="Send to 3rd Party Repair Center" onClose={function () { setThirdPartySendModal(null); setSendSuppSearch(""); }} medium zIndex={1100}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", minHeight: 280 }}>
            <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#5b21b6", fontWeight: 600, lineHeight: 1.45 }}>
              Select the repair center (supplier) now. When you receive this device back, the supplier will be filled automatically.
              {(thirdPartySendModal.deviceIndexes || []).length > 1
                ? (" Sending " + thirdPartySendModal.deviceIndexes.length + " devices.")
                : ""}
            </div>
            <div style={{ minHeight: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Search supplier</label>
              <SupplierPicker
                suppliers={state.suppliers || []}
                value={sendSuppSearch}
                selectedSupplierId={thirdPartySendForm.supplierId || ""}
                onValueChange={function (nextValue) {
                  setSendSuppSearch(nextValue);
                  setThirdPartySendForm({ supplierId: "", supplierName: nextValue, supplierPhone: "" });
                }}
                onSelectSupplier={function (s) {
                  setSendSuppSearch(s.name + (s.phone ? (" - " + s.phone) : ""));
                  setThirdPartySendForm({ supplierId: s.id, supplierName: s.name, supplierPhone: s.phone || "" });
                }}
                onCreateSupplier={saveInlineSupplierFromSendPicker}
                context="repairs_supplier"
                placeholder="Search supplier by name or phone..."
                C={C}
                Input={Input}
                Modal={Modal}
                Btn={Btn}
                inputStyle={{ padding: "14px 16px", fontSize: 15, minHeight: 48, borderRadius: 9 }}
                dropdownMaxHeight={300}
                dropdownItemStyle={{ padding: "12px 16px", fontSize: 14 }}
              />
            </div>
            {thirdPartySendForm.supplierId ? (
              <div style={{ fontSize: 14, color: C.muted, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                <strong style={{ color: "#166534", fontSize: 15 }}>{thirdPartySendForm.supplierName}</strong>
                {thirdPartySendForm.supplierPhone ? <span> · {thirdPartySendForm.supplierPhone}</span> : null}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <RepairActionGroup gap={6}>
                <RepairActionBtn tone="thirdParty" onClick={confirmThirdPartySend}>Send to 3rd Party</RepairActionBtn>
                <RepairActionBtn tone="neutral" onClick={function () { setThirdPartySendModal(null); setSendSuppSearch(""); }}>Cancel</RepairActionBtn>
              </RepairActionGroup>
            </div>
          </div>
        </Modal>
      )}

      {thirdPartyReceiveModal && !thirdPartySplitModal && (
        <Modal
          className="erp-rep-3p-recv-modal"
          title="Receive from 3rd Party"
          subtitle="Create repair product · record payable · move to Ready"
          onClose={function () { setThirdPartyReceiveModal(null); }}
          medium
          zIndex={1100}
          closeRound
        >
          <div className="erp-rep-3p-recv">
            <div className="erp-rep-3p-recv-hint">
              <span>One-time repair product + supplier payable, then device becomes <strong>Ready</strong>.</span>
            </div>

            <div className="erp-rep-3p-recv-sup">
              <div className="erp-rep-3p-recv-sup-main">
                <div className="erp-rep-3p-recv-sup-name">{thirdPartyReceiveForm.supplierName || "—"}</div>
                <div className="erp-rep-3p-recv-sup-meta">
                  {[
                    thirdPartyReceiveForm.supplierPhone || "",
                    thirdPartyReceiveModal.sentAt ? ("Sent " + fmtDateFull(thirdPartyReceiveModal.sentAt)) : ""
                  ].filter(Boolean).join(" · ") || "From Send to 3rd Party"}
                </div>
              </div>
              <span className="erp-rep-3p-recv-sup-tag">Auto supplier</span>
            </div>

            <div className="erp-rep-3p-recv-grid">
              <div className="erp-rep-3p-recv-card">
                <div className="erp-rep-3p-recv-card-title">Payment</div>
                <Sel label="Payment mode" value={thirdPartyReceiveForm.payMode} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { payMode: e.target.value }); }); }}>
                  <option value="paid">Fully Paid</option>
                  <option value="partial">Partial Paid</option>
                  <option value="unpaid">Unpaid</option>
                </Sel>
                {thirdPartyReceiveForm.payMode !== "unpaid" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {(thirdPartyReceiveForm.splitRows && thirdPartyReceiveForm.splitRows.length > 0) ? (
                      <>
                        <div className="erp-rep-3p-recv-pay-list">
                          {thirdPartyReceiveForm.splitRows.map(function (r, i) {
                            return (
                              <div key={i} className={"erp-rep-3p-recv-pay-line" + (r.method === "Cheque" ? " is-cheque" : "")}>
                                <span>{r.method}{r.method === "Cheque" && r.chequeNo ? " #" + r.chequeNo : ""}</span>
                                <strong>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}{r.method === "Cheque" ? " · pending" : ""}</strong>
                              </div>
                            );
                          })}
                        </div>
                        <button type="button" className="erp-rep-3p-recv-pay-btn is-edit" onClick={function () { setThirdPartySplitModal(true); }}>
                          Edit payment
                        </button>
                        <div className="erp-rep-3p-recv-paid">
                          Paid now:{" "}
                          <strong>
                            {getCurrencySymbol()}{" "}
                            {fmtNum((thirdPartyReceiveForm.splitRows || []).reduce(function (a, r) {
                              return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a;
                            }, 0))}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <button type="button" className="erp-rep-3p-recv-pay-btn" onClick={function () { setThirdPartySplitModal(true); }}>
                        Set payment method
                      </button>
                    )}
                  </div>
                ) : null}
                <Input label="Note / receipt no." value={thirdPartyReceiveForm.note} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional" />
              </div>

              <div className="erp-rep-3p-recv-card">
                <div className="erp-rep-3p-recv-card-title">Product & amount</div>
                <Input label="Product name" value={thirdPartyReceiveForm.productName} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { productName: e.target.value }); }); }} />
                <div className="erp-rep-3p-recv-row2">
                  <Input label="Cost" type="number" value={thirdPartyReceiveForm.costAmount} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { costAmount: e.target.value }); }); }} />
                  <Input label="Sell" type="number" value={thirdPartyReceiveForm.sellAmount} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { sellAmount: e.target.value }); }); }} />
                </div>
                <div className="erp-rep-3p-recv-totals">
                  <div className="erp-rep-3p-recv-tot">
                    <span>Cost</span>
                    <b>{getCurrencySymbol()} {fmtNum(parseFloat(thirdPartyReceiveForm.costAmount) || 0)}</b>
                  </div>
                  <div className="erp-rep-3p-recv-tot">
                    <span>Sell</span>
                    <b>{getCurrencySymbol()} {fmtNum(parseFloat(thirdPartyReceiveForm.sellAmount) || 0)}</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="erp-rep-3p-recv-actions">
              <RepairActionGroup gap={6}>
                <RepairActionBtn tone="ready" onClick={function () { saveThirdPartyReceived(false); }}>Save & Ready</RepairActionBtn>
                <RepairActionBtn tone="print" onClick={function () { saveThirdPartyReceived(true); }}>Save + Barcode</RepairActionBtn>
                <RepairActionBtn tone="neutral" onClick={function () { setThirdPartyReceiveModal(null); }}>Cancel</RepairActionBtn>
              </RepairActionGroup>
            </div>
          </div>
        </Modal>
      )}
      {thirdPartyBarcodeItems && (
        <Modal title={"Print 3rd Party Barcode — " + thirdPartyBarcodeItems.length + " label"} onClose={function () { setThirdPartyBarcodeItems(null); }} wide zIndex={13000}>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }} className="no-print">
          <RepairActionGroup gap={6}>
            <RepairActionBtn tone="print" onClick={printThirdPartyBarcodeLabels}>Print Label</RepairActionBtn>
            <RepairActionBtn sm tone="neutral" onClick={function () { setThirdPartyBarcodeItems(null); }}>Close</RepairActionBtn>
          </RepairActionGroup>
          </div>
          <BarcodeLabelSheet items={thirdPartyBarcodeItems} shopName={state.settings.shopName} barcodeSettings={state.settings} />
        </Modal>
      )}
      {editRepairProduct && (
        <Modal
          className="erp-rep-3p-recv-modal"
          title={"Repair product · " + (editRepairProduct.productId || "")}
          subtitle={
            editRepairProduct.sold
              ? "Sold — cost & sell locked"
              : "Cost locked (supplier payable) · sell editable until sold"
          }
          onClose={function () { setEditRepairProduct(null); }}
          compact
          zIndex={1100}
          closeRound
        >
          <div className="erp-rep-3p-recv">
            <div className="erp-rep-3p-recv-sup">
              <div className="erp-rep-3p-recv-sup-main">
                <div className="erp-rep-3p-recv-sup-name">{editRepairProduct.productId || "—"}</div>
                <div className="erp-rep-3p-recv-sup-meta">
                  Cost matches what was paid/owed to the supplier on receive — change payables separately if needed.
                </div>
              </div>
              <span className="erp-rep-3p-recv-sup-tag">{editRepairProduct.sold ? "Sold" : "Available"}</span>
            </div>
            <div className="erp-rep-3p-recv-card">
              <Input
                label="Product name"
                value={editRepairProduct.name}
                onChange={function (e) {
                  setEditRepairProduct(function (x) { return Object.assign({}, x, { name: e.target.value }); });
                }}
              />
              <div className="erp-rep-3p-recv-row2">
                <Input
                  label="Cost (supplier)"
                  type="number"
                  value={editRepairProduct.cost}
                  disabled
                  onChange={function () {}}
                />
                <Input
                  label="Sell"
                  type="number"
                  value={editRepairProduct.sell}
                  disabled={!!editRepairProduct.sold}
                  onChange={function (e) {
                    if (editRepairProduct.sold) return;
                    setEditRepairProduct(function (x) { return Object.assign({}, x, { sell: e.target.value }); });
                  }}
                />
              </div>
            </div>
            <div className="erp-rep-3p-recv-actions">
              <RepairActionGroup gap={6}>
                <RepairActionBtn tone="ready" onClick={saveRepairProductEdit}>Save</RepairActionBtn>
                <RepairActionBtn tone="neutral" onClick={function () { setEditRepairProduct(null); }}>Cancel</RepairActionBtn>
              </RepairActionGroup>
            </div>
          </div>
        </Modal>
      )}
      {thirdPartySplitModal && (
        <SplitPaymentModal
          title={"Set Payment — 3rd Party Receive"}
          zIndex={1200}
          invoiceTotal={parseFloat(thirdPartyReceiveForm.costAmount) || 0}
          alreadyPaid={0}
          isSale={false}
          onSave={function (splits) {
            setThirdPartyReceiveForm(function (x) {
              var totalNonCheque = splits.reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0);
              var totalAll = splits.reduce(function (a, r) { return a + (parseFloat(r.amount) || 0); }, 0);
              var total = parseFloat(x.costAmount) || 0;
              var newPayMode = totalAll >= total ? "paid" : totalNonCheque > 0 || totalAll > 0 ? "partial" : "unpaid";
              var firstMethod = splits.length === 1 ? (splits[0].method || "Cash") : "Mixed";
              return Object.assign({}, x, {
                splitRows: splits,
                payMode: newPayMode,
                paidAmount: String(totalNonCheque),
                cashMethod: firstMethod
              });
            });
            setThirdPartySplitModal(false);
          }}
          onClose={function () { setThirdPartySplitModal(false); }}
        />
      )}

      {/* ── NEW REPAIR MODAL ── */}
      {show && (
        <Modal title="🔧 New Repair Job" onClose={function () { setShow(false); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Info banner */}
            <div style={{ background: "#e8f0fe", border: "1.5px solid #2255d430", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: C.blue, fontWeight: 600 }}>
              📋 This creates a device tracking ticket. Revenue is recorded only when you convert this job to a Sales Invoice.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Customer Name</label>
                <CustomerPicker
                  customers={state.customers || []}
                  value={custSearch}
                  selectedCustomerId={f.customerId || ""}
                  onValueChange={function (nextValue) {
                    setCustSearch(nextValue);
                    setF(function (x) { return Object.assign({}, x, { customer: nextValue, customerId: "", phone: "" }); });
                  }}
                  onSelectCustomer={function (c) {
                    setCustSearch(c.name + (c.phone ? (" - " + c.phone) : ""));
                    setF(function (x) { return Object.assign({}, x, { customer: c.name, customerId: c.id, phone: c.phone || "" }); });
                  }}
                  onCreateCustomer={saveInlineCustomer}
                  context="repairs_customer"
                  duplicateNameKeys={posDupNameKeys}
                  normalizeNameKey={props.normalizePaymentCustomerName}
                  C={C}
                  Input={Input}
                  Modal={Modal}
                  Btn={Btn}
                />
              </div>
              <Input label="Phone" value={f.phone} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="+94 7X XXX XXXX" />
            </div>
            <div style={{ background: "#f7f9ff", border: "1px solid " + C.border, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Devices in this repair bill</div>
                <Btn sm col="blue" onClick={function () { setF(function (x) { return Object.assign({}, x, { devices: (x.devices || []).concat([blankDevice()]) }); }); }}>+ Add Device</Btn>
              </div>
              {(f.devices || []).map(function (d, idx) {
                return (
                  <div key={idx} style={{ border: "1px solid " + C.border, borderRadius: 8, background: "#fff", padding: 10, marginBottom: idx === (f.devices || []).length - 1 ? 0 : 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                      <Sel label={"Device Type " + (idx + 1)} value={d.deviceType || "Laptop"} onChange={function (e) { setF(function (x) { var rows = (x.devices || []).slice(); rows[idx] = Object.assign({}, rows[idx], { deviceType: e.target.value }); return Object.assign({}, x, { devices: rows, deviceType: idx === 0 ? e.target.value : x.deviceType }); }); }}>{DEVICE_TYPES.map(function (t) { return <option key={t}>{t}</option>; })}</Sel>
                      <Input label="Brand" value={d.brand || ""} onChange={function (e) { setF(function (x) { var rows = (x.devices || []).slice(); rows[idx] = Object.assign({}, rows[idx], { brand: e.target.value }); return Object.assign({}, x, { devices: rows, brand: idx === 0 ? e.target.value : x.brand }); }); }} />
                      <Input label="Model Number" value={d.modelNo || ""} onChange={function (e) { setF(function (x) { var rows = (x.devices || []).slice(); rows[idx] = Object.assign({}, rows[idx], { modelNo: e.target.value }); return Object.assign({}, x, { devices: rows, modelNo: idx === 0 ? e.target.value : x.modelNo }); }); }} />
                      <Input label="Serial / IMEI (optional)" value={d.serialNo || ""} onChange={function (e) { setF(function (x) { var rows = (x.devices || []).slice(); rows[idx] = Object.assign({}, rows[idx], { serialNo: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }} placeholder="e.g. SN / IMEI" />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Input label="Problem (short title)" value={d.problem || ""} onChange={function (e) { setF(function (x) { var rows = (x.devices || []).slice(); rows[idx] = Object.assign({}, rows[idx], { problem: e.target.value }); return Object.assign({}, x, { devices: rows, problem: idx === 0 ? e.target.value : x.problem }); }); }} placeholder="e.g. Screen broken, Not powering on..." />
                      </div>
                      {(f.devices || []).length > 1 && (
                        <Btn col="red" sm onClick={function () {
                          setF(function (x) {
                            var rows = (x.devices || []).slice();
                            rows.splice(idx, 1);
                            rows = rows.length ? rows : [blankDevice()];
                            var first = rows[0];
                            return Object.assign({}, x, {
                              devices: rows,
                              deviceType: first.deviceType || "Laptop",
                              brand: first.brand || "",
                              modelNo: first.modelNo || "",
                              problem: first.problem || ""
                            });
                          });
                        }}>Remove</Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Full Description / Notes</label>
              <textarea value={f.description} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Detailed description, physical condition, accessories included, etc." />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <Input label="Date Received" type="date" value={f.dateIn} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { dateIn: e.target.value }); }); }} />
              <Input label="Expected Date Out" type="date" value={f.dateOut} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { dateOut: e.target.value }); }); }} />
              <Input label="Estimated Cost (Rs)" type="number" value={f.estimatedCost} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { estimatedCost: e.target.value }); }); }} />
              <Input label="Technician (optional)" value={f.technician} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { technician: e.target.value }); }); }} placeholder="Assigned technician" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Accessories / Items Received</label>
              <textarea value={f.accessories} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { accessories: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="e.g. Charger, Bag, Mouse — list accessories received with device" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Btn col="blue" onClick={function () { saveNew(); }} disabled={!f.customer || !f.deviceType}>Save Only</Btn>
              <Btn col="cyan" onClick={function () { var tmp = Object.assign({}, f, { id: uid(), date: today(), estimatedCost: parseFloat(f.estimatedCost) || 0 }); setRepairPrintModal(tmp); saveNew(); }} disabled={!f.customer || !f.deviceType}>Save + Print A4</Btn>
              <Btn col="purple" onClick={function () { var tmp = Object.assign({}, f, { id: uid(), date: today(), estimatedCost: parseFloat(f.estimatedCost) || 0 }); printRepairJob(tmp, "a5"); saveNew(); }} disabled={!f.customer || !f.deviceType}>Save + Print A5</Btn>
              <Btn col="gray" onClick={function () { setShow(false); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── VIEW REPAIR MODAL ── */}
      {viewR && (function () {
        var viewEntries = getFilteredDeviceEntries(viewR, viewDeviceIndexes);
        var viewDeviceOnly = !!(viewDeviceIndexes && viewDeviceIndexes.length);
        var firstView = (viewEntries[0] && viewEntries[0].device) || {};
        var viewIndexSet = {};
        if (viewDeviceOnly) viewDeviceIndexes.forEach(function (i) { viewIndexSet[i] = true; });
        var viewHasReady = viewEntries.some(function (e) { return (e.device.status || "Accepted") === "Ready"; });
        var primaryStatus = (firstView.status || viewR.status || "Accepted");
        var alertTone =
          primaryStatus === "Ready" ? "is-ready"
            : primaryStatus === "Third Party" ? "is-third"
            : primaryStatus === "Delivered" ? "is-delivered"
            : primaryStatus === "Returned" ? "is-returned"
            : "is-active";
        var alertTitle =
          primaryStatus === "Ready" ? "Ready for pickup / invoice"
            : primaryStatus === "Third Party" ? "At 3rd party repair"
            : primaryStatus === "Delivered" ? "Delivered to customer"
            : primaryStatus === "Returned" ? "Returned device"
            : "Active in workshop";
        var jobNo = "#" + String(viewR.id || "").slice(0, 8).toUpperCase();
        var brandModel = (((firstView.brand || viewR.brand || "") + " " + (firstView.modelNo || viewR.modelNo || "")).trim()) || "—";
        return (
        <Modal
          className="erp-arap-view-modal is-rep"
          title={"Repair · " + (viewR.customer || "Job")}
          subtitle={jobNo + (viewDeviceOnly && viewEntries.length === 1 ? (" · " + (firstView.deviceType || "Device")) : (" · " + viewEntries.length + " device" + (viewEntries.length === 1 ? "" : "s")))}
          onClose={closeViewRepair}
          wide
          closeRound
        >
          <div className="erp-rep-view">
            <div className={"erp-rep-view-alert " + alertTone}>
              <div>
                <strong>{alertTitle}</strong>
                <span>{viewR.customer}{viewR.phone ? " · " + viewR.phone : ""}</span>
              </div>
              <b>{getCurrencySymbol()} {fmtNum(viewR.estimatedCost || viewR.cost || 0)}</b>
            </div>

            <div className="erp-rep-view-grid">
              <div className="erp-rep-view-card">
                <div className="erp-rep-view-card-title">Customer</div>
                <div className="erp-rep-view-name">{viewR.customer || "—"}</div>
                {viewR.phone ? <div className="erp-rep-view-muted">{viewR.phone}</div> : null}
                <div className="erp-rep-view-muted">In {fmtDateFull(viewR.dateIn || viewR.date)}{viewR.dateOut ? " · Out " + fmtDateFull(viewR.dateOut) : ""}</div>
                <div className="erp-rep-view-chips">
                  {viewEntries.map(function (e, idx) {
                    var p = deviceStatusPill(e.device.status || "Accepted");
                    return (
                      <span key={idx} className="erp-rep-view-chip" style={{ background: p.bg, color: p.fg, borderColor: p.bd }}>
                        {p.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="erp-rep-view-card">
                <div className="erp-rep-view-card-title">Job summary</div>
                <div className="erp-rep-view-kv">
                  <div><span>Job #</span><b className="is-teal">{jobNo}</b></div>
                  <div><span>Est. cost</span><b className="is-teal">{getCurrencySymbol()} {fmtNum(viewR.estimatedCost || viewR.cost || 0)}</b></div>
                  <div><span>Device</span><b>{firstView.deviceType || viewR.deviceType || "—"}</b></div>
                  <div><span>Brand / Model</span><b title={brandModel}>{brandModel}</b></div>
                  <div><span>Technician</span><b>{viewR.technician || "—"}</b></div>
                  <div><span>Expected out</span><b>{viewR.dateOut ? fmtDateFull(viewR.dateOut) : "—"}</b></div>
                </div>
              </div>
            </div>

            <div className="erp-rep-view-devices">
              <div className="erp-rep-view-card-title">{viewDeviceOnly ? (viewEntries.length === 1 ? "Device" : "Selected devices") : "Devices in this bill"}</div>
              {viewEntries.map(function (entry, listIdx) {
                var d = entry.device;
                var idx = entry.index;
                var st = d.status || "Accepted";
                return (
                  <div key={idx} className="erp-rep-view-device">
                    <div className="erp-rep-view-device-top">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="erp-rep-view-device-title">{listIdx + 1}. {d.deviceType} {d.brand} {d.modelNo}</div>
                        {d.serialNo ? <div className="erp-rep-view-device-sn">S/N · IMEI: {d.serialNo}</div> : null}
                        <div className="erp-rep-view-device-prob">{d.problem || "—"}</div>
                        {(d.thirdParty && d.thirdParty.supplierName) ? (
                          <div className="erp-rep-view-device-3p">
                            3P: {d.thirdParty.supplierName}
                            {d.thirdParty.sentAt && !d.thirdParty.receivedAt ? " · sent " + fmtDateFull(d.thirdParty.sentAt) : ""}
                            {d.thirdParty.receivedAt ? " · received " + fmtDateFull(d.thirdParty.receivedAt) : ""}
                          </div>
                        ) : null}
                      </div>
                      {deviceStatusBadge(st, false)}
                    </div>
                    <div className="erp-rep-view-device-actions">
                      {renderDeviceStatusActions(viewR, idx, st)}
                    </div>
                  </div>
                );
              })}
              {!viewDeviceOnly ? (
                <div className="erp-rep-view-bulk">
                  <span className="erp-rep-view-bulk-lbl">All devices</span>
                  {getRepairBulkStatusOptions().map(function (opt) {
                    var a = styleForAction(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className="erp-rep-view-bulk-btn"
                        onClick={function () {
                          if (!viewR) return;
                          if (opt.value === "Third Party") {
                            var idxs = normalizeRepairDevices(viewR).map(function (d, i) {
                              return (d.status || "Accepted") === "Accepted" ? i : -1;
                            }).filter(function (i) { return i >= 0; });
                            openThirdPartySendModal(viewR, idxs);
                            return;
                          }
                          updateAllDeviceStatuses(viewR, opt.value);
                        }}
                        style={{
                          border: "1px solid " + a.border,
                          background: a.bg,
                          color: a.color,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {((viewR && viewR.returnedLog && viewR.returnedLog.length > 0) || viewEntries.some(function (e) { return (e.device.status || "Accepted") === "Returned"; })) ? (
              <div className="erp-rep-view-note is-return">
                <div className="erp-rep-view-note-title">Returned devices</div>
                {(function () {
                  var live = normalizeRepairDevices(viewR).map(function (d, idx) {
                    if ((d.status || "Accepted") !== "Returned") return null;
                    if (viewDeviceOnly && !viewIndexSet[idx]) return null;
                    return { id: "live_" + idx, date: viewR.dateOut || viewR.dateIn || viewR.date || today(), deviceIndex: idx, device: Object.assign({}, d) };
                  }).filter(Boolean);
                  var log = Array.isArray(viewR.returnedLog) ? viewR.returnedLog.slice() : [];
                  if (viewDeviceOnly) log = log.filter(function (e) { return viewIndexSet[e.deviceIndex]; });
                  var all = log.concat(live);
                  var seen = {};
                  return all.filter(function (e) {
                    var key = (e && e.deviceIndex) + "|" + ((e && e.date) || "") + "|" + ((e && e.device && e.device.modelNo) || "");
                    if (seen[key]) return false;
                    seen[key] = 1;
                    return true;
                  });
                })().map(function (e, idx) {
                  var d = (e && e.device) || {};
                  return (
                    <div key={(e && e.id) || idx} className="erp-rep-view-ret-row">
                      <div>
                        <div className="erp-rep-view-device-title">{d.deviceType} {d.brand} {d.modelNo}</div>
                        <div className="erp-rep-view-device-prob">{d.problem || "No issue note"}</div>
                      </div>
                      <div className="erp-rep-view-muted">{e.date ? fmtDateFull(e.date) : ""}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="erp-rep-view-note is-problem">
              <div className="erp-rep-view-note-title">Problem reported</div>
              <div className="erp-rep-view-note-body">{firstView.problem || viewR.problem || "—"}</div>
            </div>

            {viewR.description ? (
              <div className="erp-rep-view-note">
                <div className="erp-rep-view-note-title">Notes / description</div>
                <div className="erp-rep-view-note-body is-soft">{viewR.description}</div>
              </div>
            ) : null}

            {viewR.accessories ? (
              <div className="erp-rep-view-note">
                <div className="erp-rep-view-note-title">Accessories received</div>
                <div className="erp-rep-view-note-body is-soft">{viewR.accessories}</div>
              </div>
            ) : null}

            <div className="erp-rep-view-actions">
              <RepairActionGroup gap={6}>
                <RepairActionBtn tone="edit" onClick={function () { closeViewRepair(); setEditR(Object.assign({}, viewR, { devices: normalizeRepairDevices(viewR) })); }}>Edit</RepairActionBtn>
                {viewHasReady ? (
                  <RepairActionBtn tone="invoice" onClick={function () { closeViewRepair(); openConvertModal(viewR, viewDeviceIndexes); }}>Convert to Invoice</RepairActionBtn>
                ) : null}
                <RepairActionBtn tone="print" onClick={function () { printRepairJob(viewR, "a4", viewDeviceIndexes); }}>Print A4</RepairActionBtn>
                <RepairActionBtn tone="thirdParty" onClick={function () { printRepairJob(viewR, "a5", viewDeviceIndexes); }}>Print A5</RepairActionBtn>
                <WABtn title="Share Job Card via WhatsApp" onClick={function () { whatsappRepairJob(viewR, "a4", viewDeviceIndexes); }} />
                <RepairActionBtn tone="neutral" onClick={closeViewRepair}>Close</RepairActionBtn>
              </RepairActionGroup>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── EDIT REPAIR MODAL ── */}
      {editR && (
        <Modal title={"Edit Repair — " + editR.customer} onClose={function () { setEditR(null); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <Input label="Customer" value={editR.customer} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { customer: e.target.value }); }); }} />
              <Input label="Phone" value={editR.phone || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
            </div>
            <div style={{ background: "#f7f9ff", border: "1px solid " + C.border, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Devices in this repair bill</div>
                <Btn sm col="blue" onClick={function () { setEditR(function (x) { return Object.assign({}, x, { devices: normalizeRepairDevices(x).concat([blankDevice()]) }); }); }}>+ Add Device</Btn>
              </div>
              {normalizeRepairDevices(editR).map(function (d, idx) {
                return (
                  <div key={idx} style={{ border: "1px solid " + C.border, borderRadius: 8, background: "#fff", padding: 10, marginBottom: idx === normalizeRepairDevices(editR).length - 1 ? 0 : 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                      <Sel label={"Device Type " + (idx + 1)} value={d.deviceType || "Laptop"} onChange={function (e) { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { deviceType: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }}>{DEVICE_TYPES.map(function (t) { return <option key={t}>{t}</option>; })}</Sel>
                      <Input label="Brand" value={d.brand || ""} onChange={function (e) { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { brand: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }} />
                      <Input label="Model No." value={d.modelNo || ""} onChange={function (e) { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { modelNo: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }} />
                      <Input label="Serial / IMEI (optional)" value={d.serialNo || ""} onChange={function (e) { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { serialNo: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }} placeholder="e.g. SN / IMEI" />
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Device Status</label>
                        <RepairStatusSelect
                          currentStatus={d.status || "Accepted"}
                          onAction={function (action) {
                            if (!action) return;
                            if (action === "__receive__") {
                              openThirdPartyReceiveModal(editR, idx);
                              return;
                            }
                            if (action === "__invoice__") {
                              openConvertModal(editR, [idx]);
                              return;
                            }
                            if (action === "__void__") {
                              promptVoidDelivered(editR.id, idx);
                              return;
                            }
                            if (action === "Third Party") {
                              openThirdPartySendModal(editR, [idx]);
                              return;
                            }
                            var nextStatus = action;
                            var currStatus = d.status || "Accepted";
                            if (nextStatus === currStatus) return;
                            var apply = function () {
                              setEditR(function (x) {
                                var rows = normalizeRepairDevices(x).slice();
                                rows[idx] = Object.assign({}, rows[idx], { status: nextStatus });
                                return Object.assign({}, x, { devices: rows, status: deriveRepairStatus(rows) });
                              });
                            };
                            if (currStatus === "Delivered" || currStatus === "Returned") {
                              requestRepairLock({
                                title: "Admin password required",
                                message: "Change device status from " + currStatus + " to " + nextStatus + "?",
                                onConfirm: apply
                              });
                              return;
                            }
                            apply();
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Input label="Problem" value={d.problem || ""} onChange={function (e) { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { problem: e.target.value }); return Object.assign({}, x, { devices: rows }); }); }} />
                      </div>
                      {normalizeRepairDevices(editR).length > 1 && <Btn col="red" sm onClick={function () { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows.splice(idx, 1); return Object.assign({}, x, { devices: rows.length ? rows : [blankDevice()] }); }); }}>Remove</Btn>}
                    </div>
                    {(function () {
                      var tp = d.thirdParty || {};
                      if (!(tp.supplierName || tp.amount)) return null;
                      return (
                      <div style={{ marginTop: 8, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#5b21b6" }}>
                        <strong>3rd Party:</strong> {tp.supplierName || "Unknown supplier"}{tp.productName ? " • " + tp.productName : ""}{tp.amount ? " • Cost " + getCurrencySymbol() + " " + fmtNum(tp.amount) : ""}{tp.sellAmount ? " • Sell " + getCurrencySymbol() + " " + fmtNum(tp.sellAmount) : ""}{tp.payMode ? " • " + (tp.payMode === "paid" ? "Paid" : tp.payMode === "partial" ? "Partial Paid" : "Unpaid") : ""}{tp.paidAmount ? " (" + getCurrencySymbol() + " " + fmtNum(tp.paidAmount) + " paid)" : ""}{tp.receivedAt ? " • Received " + fmtDateFull(tp.receivedAt) : ""}{tp.note ? " • " + tp.note : ""}
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes</label>
              <textarea value={editR.description || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Accessories</label>
              <textarea value={editR.accessories || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { accessories: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label="Date In" type="date" value={editR.dateIn || editR.date} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { dateIn: e.target.value }); }); }} />
              <Input label="Date Out" type="date" value={editR.dateOut || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { dateOut: e.target.value }); }); }} />
              <Input label="Est. Cost (Rs)" type="number" value={editR.estimatedCost !== undefined ? editR.estimatedCost : (editR.cost || "")} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { estimatedCost: parseFloat(e.target.value) || 0 }); }); }} />
              <Input label="Technician" value={editR.technician || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { technician: e.target.value }); }); }} />
              <Input label="Bill Status (auto)" value={deriveRepairStatus(normalizeRepairDevices(editR))} disabled />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <RepairActionBtn tone="edit" onClick={saveEdit}>Save Changes</RepairActionBtn>
              <RepairActionBtn tone="neutral" onClick={function () { setEditR(null); }}>Cancel</RepairActionBtn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── READY PROMPT (after status→Ready) ── */}
      {readyPrompt && (
        <Modal title={"✅ Repair Ready — " + readyPrompt.customer} onClose={function () { setReadyPrompt(null); }}>
          <div style={{ background: C.successSoft, border: "1px solid #9ee8ce", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.green, marginBottom: 4 }}>✅ Repair marked as Ready!</div>
            <div style={{ fontSize: 13, color: C.textMd }}>{firstDeviceSummary(readyPrompt)} — {readyPrompt.customer}</div>
            <div style={{ fontWeight: 700, color: C.blue, marginTop: 4 }}>Est. Cost: {getCurrencySymbol()} {fmtNum(readyPrompt.estimatedCost || readyPrompt.cost || 0)}</div>
          </div>
          <div style={{ fontSize: 13, color: C.textMd, marginBottom: 14 }}>Would you like to create a Sales Invoice for this repair now?</div>
          <RepairActionGroup gap={6}>
            <RepairActionBtn tone="invoice" onClick={function () { openConvertModal(readyPrompt); setReadyPrompt(null); }}>Create Invoice</RepairActionBtn>
            <RepairActionBtn tone="neutral" onClick={function () { setReadyPrompt(null); }}>Later</RepairActionBtn>
          </RepairActionGroup>
        </Modal>
      )}

      {/* ── CONVERT TO INVOICE MODAL ── */}
      {convertModal && (function () {
        var readyDeviceRows = normalizeRepairDevices(convertModal).map(function (d, idx) {
          return { d: d, idx: idx, ready: (d.status || "Accepted") === "Ready" };
        }).filter(function (x) { return x.ready; });
        var showDevicePick = readyDeviceRows.length > 1;
        var tpLineByDevice = {};
        (convertThirdPartyLines || []).forEach(function (ln) {
          if (ln && ln.deviceIndex != null) tpLineByDevice[ln.deviceIndex] = ln;
        });
        var selectedTpLines = (convertDeviceIndexes || []).map(function (idx) {
          return tpLineByDevice[idx] || null;
        }).filter(Boolean);
        var selectedInHouseIndexes = (convertDeviceIndexes || []).filter(function (idx) {
          return !tpLineByDevice[idx];
        });
        var hasTpLines = selectedTpLines.length > 0;
        var hasInHouse = selectedInHouseIndexes.length > 0;
        var inHouseProductName = (function () {
          var idx = selectedInHouseIndexes[0];
          if (idx == null) idx = (convertDeviceIndexes || [])[0];
          var d = normalizeRepairDevices(convertModal)[idx >= 0 ? idx : 0] || blankDevice();
          return d.deviceType + (d.brand ? " " + d.brand : "") + (d.modelNo ? " (" + d.modelNo + ")" : "");
        })();
        return (
        <Modal title={"Convert to Invoice — " + convertModal.customer} onClose={function () { setConvertModal(null); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: "min(640px, 95vw)" }}>
            {showDevicePick ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {readyDeviceRows.map(function (row) {
                  var checked = convertDeviceIndexes.indexOf(row.idx) >= 0;
                  var isTp = !!tpLineByDevice[row.idx];
                  return (
                    <label key={row.idx} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "6px 10px", border: "1px solid " + C.border, borderRadius: 8, background: checked ? "#f0fdf4" : "#fff", cursor: "pointer" }}>
                      <input type="checkbox" checked={checked} onChange={function (e) {
                        var on = !!e.target.checked;
                        setConvertDeviceIndexes(function (arr) {
                          var next = (arr || []).slice();
                          if (on && next.indexOf(row.idx) < 0) next.push(row.idx);
                          if (!on) next = next.filter(function (x) { return x !== row.idx; });
                          return next;
                        });
                      }} />
                      {row.d.deviceType} {row.d.brand} {row.d.modelNo}
                      {isTp ? <span style={{ color: "#6d28d9", fontSize: 10, fontWeight: 800 }}>3P</span> : null}
                    </label>
                  );
                })}
              </div>
            ) : null}
            {hasTpLines ? selectedTpLines.map(function (ln) {
              var idx = (convertThirdPartyLines || []).indexOf(ln);
              if (idx < 0) idx = (convertThirdPartyLines || []).findIndex(function (x) { return x && x.deviceIndex === ln.deviceIndex; });
              return (
                <div key={ln.deviceIndex} style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                  <Input label="Product name" value={ln.productName || ""} disabled />
                  <Input label="Invoice name" value={ln.billName || ""} onChange={function (e) {
                    var v = e.target.value;
                    setConvertThirdPartyLines(function (arr) {
                      var n = (arr || []).slice();
                      var at = n.findIndex(function (x) { return x && x.deviceIndex === ln.deviceIndex; });
                      if (at < 0) return n;
                      n[at] = Object.assign({}, n[at], { billName: v });
                      return n;
                    });
                  }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <Input label="Cost" type="number" value={String(ln.cost || "")} disabled />
                    <Input label="Sell price" type="number" value={String(ln.sell || "")} onChange={function (e) {
                      var v = parseFloat(e.target.value) || 0;
                      setConvertThirdPartyLines(function (arr) {
                        var n = (arr || []).slice();
                        var at = n.findIndex(function (x) { return x && x.deviceIndex === ln.deviceIndex; });
                        if (at < 0) return n;
                        n[at] = Object.assign({}, n[at], { sell: v });
                        return n;
                      });
                    }} />
                  </div>
                </div>
              );
            }) : null}
            {hasInHouse ? (
              <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                <Input label="Product name" value={inHouseProductName} disabled />
                <Input label="Invoice name" value={convertInvoiceName} onChange={function (e) { setConvertInvoiceName(e.target.value); }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <Input label="Cost" type="number" value={serviceCost} onChange={function (e) { setServiceCost(e.target.value); }} />
                  <Input label="Sell price" type="number" value={servicePrice} onChange={function (e) { setServicePrice(e.target.value); }} placeholder="Optional" />
                </div>
                {hasTpLines ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontWeight: 600 }}>
                    In-house service line is added only when sell or cost is greater than 0.
                  </div>
                ) : null}
              </div>
            ) : null}
            {!hasTpLines && !hasInHouse ? (
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Select at least one ready device.</div>
            ) : null}
            <div style={{ borderTop: "1px solid " + C.borderLight, paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMd, marginBottom: 4 }}>Internal stock used</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Search parts by product name, barcode, or product ID. Only items with stock are shown.</div>
              {(repairInternalParts || []).map(function (row, idx) {
                return (
                  <div key={row.rowId || idx} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: 8, alignItems: "start", marginBottom: 10 }}>
                    <StockProductPicker
                      label={"Part " + (idx + 1)}
                      products={state.products || []}
                      selectedProductId={row.productId || ""}
                      value={row.searchText != null ? row.searchText : ""}
                      C={C}
                      fmtNum={fmtNum}
                      getCurrencySymbol={getCurrencySymbol}
                      onValueChange={function (v) {
                        setRepairInternalParts(function (rows) {
                          var n = (rows || []).slice();
                          var next = Object.assign({}, n[idx], { searchText: v });
                          if (next.productId) {
                            var sel = (state.products || []).find(function (p) { return p.id === next.productId; });
                            if (!sel || String(v || "").trim().toLowerCase() !== String(sel.name || "").toLowerCase()) {
                              next.productId = "";
                            }
                          }
                          n[idx] = next;
                          return n;
                        });
                      }}
                      onSelectProduct={function (p) {
                        setRepairInternalParts(function (rows) {
                          var n = (rows || []).slice();
                          n[idx] = Object.assign({}, n[idx], { productId: p.id, searchText: p.name || "" });
                          return n;
                        });
                      }}
                    />
                    <Input label="Qty" type="number" value={row.qty || ""} onChange={function (e) {
                      setRepairInternalParts(function (rows) {
                        var n = (rows || []).slice();
                        n[idx] = Object.assign({}, n[idx], { qty: e.target.value });
                        return n;
                      });
                    }} />
                    {(repairInternalParts || []).length > 1 ? (
                      <div style={{ marginTop: 22 }}>
                        <Btn col="red" sm onClick={function () {
                          setRepairInternalParts(function (rows) {
                            var n = (rows || []).slice();
                            n.splice(idx, 1);
                            return n.length ? n : [{ rowId: uid(), productId: "", qty: "", searchText: "" }];
                          });
                        }}>Remove</Btn>
                      </div>
                    ) : <span />}
                  </div>
                );
              })}
              <Btn sm col="blue" onClick={function () {
                setRepairInternalParts(function (rows) { return (rows || []).concat([{ rowId: uid(), productId: "", qty: "", searchText: "" }]); });
              }}>+ Add part</Btn>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <RepairActionGroup gap={6}>
              <RepairActionBtn tone="invoice" onClick={doConvertToInvoice}>Continue to Sales</RepairActionBtn>
              <RepairActionBtn tone="neutral" onClick={function () { setConvertModal(null); }}>Cancel</RepairActionBtn>
            </RepairActionGroup>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* ── PRINT FORMAT MODAL ── */}
      {repairPrintModal && (
        <Modal title="🖨 Print Repair Job Card" onClose={function () { setRepairPrintModal(null); }}>
          <div style={{ fontSize: 13, color: C.textMd, marginBottom: 14 }}>Choose print format for the repair job card:</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="blue" onClick={function () { printRepairJob(repairPrintModal, "a4"); setRepairPrintModal(null); }}>Print A4</Btn>
            <Btn col="cyan" onClick={function () { printRepairJob(repairPrintModal, "a5"); setRepairPrintModal(null); }}>Print A5</Btn>
            <WABtn title="Share via WhatsApp" onClick={function () { whatsappRepairJob(repairPrintModal, "a4"); setRepairPrintModal(null); }} />
            <Btn col="gray" onClick={function () { setRepairPrintModal(null); }}>Skip</Btn>
          </div>
        </Modal>
      )}

      {repairLockModal && (
        <Modal title={repairLockModal.title || "Admin password required"} onClose={function () { setRepairLockModal(null); setRepairLockPw(""); setRepairLockErr(""); }}>
          <div style={{ fontSize: 13, color: C.textMd, marginBottom: 10 }}>{repairLockModal.message || "Enter password to continue."}</div>
          <Input label="Admin Password" type="password" value={repairLockPw} onChange={function (e) { setRepairLockPw(e.target.value); setRepairLockErr(""); }} onKeyDown={function (e) { if (e.key === "Enter") submitRepairLock(); }} />
          {repairLockErr ? <div style={{ marginTop: 6, fontSize: 12, color: C.red, fontWeight: 700 }}>{repairLockErr}</div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Btn col="blue" onClick={submitRepairLock}>Confirm</Btn>
            <Btn col="gray" onClick={function () { setRepairLockModal(null); setRepairLockPw(""); setRepairLockErr(""); }}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* ── DELETE MODAL ── */}
      {deleteModal && (
        <Modal title={"Delete Repair — " + deleteModal.customer} onClose={function () { setDeleteModal(null); }}>
          <div style={{ background: "#fde8ed", border: "1px solid #f9a8ba", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#c0152e" }}>
            This will permanently delete this repair record. This action is logged.
          </div>
          <div style={{ marginBottom: 6, fontSize: 13 }}>
            <strong>{deleteModal.customer}</strong> — {deleteModal.deviceType} {deleteModal.brand} {deleteModal.modelNo}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Deletion (required)</label>
            <textarea value={deleteReason} onChange={function (e) { setDeleteReason(e.target.value); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Enter reason for deletion..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="red" onClick={doDelete} disabled={!deleteReason.trim()}>Confirm Delete</Btn>
            <Btn col="gray" onClick={function () { setDeleteModal(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Repairs;
