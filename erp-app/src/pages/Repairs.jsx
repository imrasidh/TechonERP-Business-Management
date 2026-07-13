import React, { useState } from "react";
import CustomerPicker from "../components/CustomerPicker.jsx";
import SupplierPicker from "../components/SupplierPicker.jsx";
import { ActBtn, ActBtnGroup, actBtnCellStyle } from "../components/ActBtn.jsx";
import { RepairActionBtn, RepairActionGroup } from "../components/RepairActionBtn.jsx";
import { RepairStatusSelect, getRepairBulkStatusOptions } from "../components/RepairStatusSelect.jsx";
import StockProductPicker from "../components/StockProductPicker.jsx";
import { LIST_PAGE_SIZE, sortNewestFirst } from "../utils/listPage.js";
import { buildVoidSaleUpdates, isVoidedTxn, VOID_REASON_OPTIONS, voidSaleBlockReason } from "../utils/voidInvoice.js";

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
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var WABtn = props.WABtn;
  var blankDevice = function () {
    return { deviceType: "Laptop", brand: "", modelNo: "", problem: "", status: "Accepted" };
  };
  var normalizeRepairDevices = function (repair) {
    var rows = Array.isArray(repair && repair.devices) ? repair.devices : [];
    var cleaned = rows.map(function (d) {
      return Object.assign({}, d || {}, {
        deviceType: (d && d.deviceType) || "Laptop",
        brand: (d && d.brand) || "",
        modelNo: (d && d.modelNo) || "",
        problem: (d && d.problem) || "",
        status: (d && d.status) || "Accepted"
      });
    }).filter(function (d) { return d.deviceType || d.brand || d.modelNo || d.problem; });
    if (!cleaned.length) {
      cleaned = [{
        deviceType: (repair && repair.deviceType) || "Laptop",
        brand: (repair && repair.brand) || "",
        modelNo: (repair && repair.modelNo) || "",
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
  var [thirdPartyReceiveModal, setThirdPartyReceiveModal] = useState(null);
  var [thirdPartyBarcodeItems, setThirdPartyBarcodeItems] = useState(null);
  var [thirdPartySplitModal, setThirdPartySplitModal] = useState(false);
  var [suppSearch, setSuppSearch] = useState("");
  var [thirdPartyReceiveForm, setThirdPartyReceiveForm] = useState({
    supplierId: "", supplierName: "", productName: "", costAmount: "", sellAmount: "",
    supplierPhone: "", payMode: "unpaid", cashMethod: "Cash", paidAmount: "", chequeNo: "", chequeBank: "", chequeDue: today(), splitRows: [], note: ""
  });

  var TABS = [
    { id: "active", label: "Active Bills", status: "Accepted" },
    { id: "thirdparty", label: "3rd Party", status: "Third Party" },
    { id: "ready", label: "Ready", status: "Ready" },
    { id: "delivered", label: "Delivered", status: "Delivered" },
    { id: "returned", label: "Returned", status: "Returned" }
  ];
  var MANUAL_STATUSES = ["Accepted", "Third Party", "Ready", "Returned"];
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet", "Server", "Network Device", "Other"];
  var STATUS_COLORS = { Accepted: "#c2410c", "Third Party": "#7c3aed", Ready: "#047857", Delivered: "#1d4ed8", Returned: "#374151" };
  var STATUS_BG    = { Accepted: "#fff7ed", "Third Party": "#f5f3ff", Ready: "#ecfdf5", Delivered: "#eff6ff", Returned: "#f3f4f6" };
  var STATUS_ICONS = { Accepted: "📥", "Third Party": "🏢", Ready: "✅", Delivered: "📦", Returned: "↩️" };
  var STATUS_DISPLAY = { Accepted: "Active", "Third Party": "3rd Party", Ready: "Ready", Delivered: "Delivered", Returned: "Returned" };
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
      normalizeRepairDevices(repair).map(function (d) { return [d.deviceType, d.brand, d.modelNo, d.problem].join(" "); })
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
    return Object.assign({}, repair, extra || {}, {
      devices: devices,
      deviceType: first.deviceType || "Laptop",
      brand: first.brand || "",
      modelNo: first.modelNo || "",
      problem: first.problem || "",
      status: deriveRepairStatus(devices)
    });
  };
  var updateDeviceStatus = function (repair, deviceIndex, nextStatus, skipPrompt) {
    if (!repair) return;
    repair = (state.repairs || []).find(function (r) { return r.id === repair.id; }) || repair;
    var devices = normalizeRepairDevices(repair).slice();
    if (deviceIndex < 0 || deviceIndex >= devices.length) return;
    var curr = devices[deviceIndex].status || "Accepted";
    if (curr === nextStatus) return;
    var apply = function () {
      var origReturned = (devices[deviceIndex].status || "Accepted") !== "Returned" && nextStatus === "Returned";
      devices[deviceIndex] = Object.assign({}, devices[deviceIndex], { status: nextStatus });
      var returnedLog = repair.returnedLog || [];
      if (origReturned) {
        returnedLog = mergeReturnedLog(returnedLog, [{ id: uid(), date: today(), deviceIndex: deviceIndex, device: Object.assign({}, devices[deviceIndex]) }]);
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
    var devices = normalizeRepairDevices(repair).map(function (d) {
      var st = d.status || "Accepted";
      if (st === "Delivered") return d;
      if (nextStatus === "Ready" && st !== "Accepted" && st !== "Third Party") return d;
      if (nextStatus === "Returned" && st === "Delivered") return d;
      if (nextStatus === "Third Party" && st !== "Accepted") return d;
      return Object.assign({}, d, { status: nextStatus });
    });
    var returnedLog = repair.returnedLog || [];
    if (nextStatus === "Returned") {
      devices.forEach(function (d, idx) {
        var was = (normalizeRepairDevices(repair)[idx] && normalizeRepairDevices(repair)[idx].status) || "Accepted";
        if (was !== "Returned" && (d.status || "Accepted") === "Returned") {
          returnedLog = mergeReturnedLog(returnedLog, [{ id: uid(), date: today(), deviceIndex: idx, device: Object.assign({}, d) }]);
        }
      });
    }
    var nextRepair = buildRepairPatch(repair, devices, { returnedLog: returnedLog });
    persistRepair(nextRepair, "Repair bill devices → " + nextStatus);
    if (viewR && viewR.id === repair.id) setViewR(nextRepair);
    if (editR && editR.id === repair.id) setEditR(nextRepair);
    if (nextStatus === "Ready") setReadyPrompt(nextRepair);
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
    var autoProductName = defaultThirdPartyProductName(repair, d, deviceIndex);
    setThirdPartyReceiveForm({
      supplierId: tp.supplierId || "",
      supplierName: tp.supplierName || "",
      supplierPhone: tp.supplierPhone || "",
      productName: tp.productName || autoProductName,
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
    setThirdPartyReceiveModal({ repairId: repair.id, deviceIndex: deviceIndex });
    var suppLabel = tp.supplierName || "";
    if (tp.supplierPhone) suppLabel += (suppLabel ? " - " : "") + tp.supplierPhone;
    setSuppSearch(suppLabel);
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
    if (!supplierId && !supplierName) { showAlert("Search and select a supplier, or click + Add new supplier."); return; }
    var nextSuppliers = state.suppliers || [];
    if (!supplierId && supplierName) {
      var created = saveInlineSupplier({ name: supplierName, phone: supplierPhone });
      if (!created) return;
      supplierId = created.id;
      supplierName = created.name;
      nextSuppliers = (state.suppliers || []).concat([created]);
    } else if (supplierId) {
      var s = (state.suppliers || []).find(function (x) { return x.id === supplierId; });
      supplierName = s ? s.name : supplierName;
      supplierPhone = s ? (s.phone || supplierPhone) : supplierPhone;
    }
    var devices = normalizeRepairDevices(repair).slice();
    var idx = thirdPartyReceiveModal.deviceIndex;
    if (!devices[idx]) return;
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
    var device = Object.assign({}, devices[idx], {
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
        receivedAt: today()
      })
    });
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
            return { id: uid(), date: today(), amount: parseFloat(r.amount) || 0, cashMethod: r.method === "Bank" ? "Bank" : "Cash", note: r.note ? ("Repairs 3P: " + r.note) : "Initial payment from Repairs receive flow" };
          })
          : (paidAmount > 0 ? [{ id: uid(), date: today(), amount: paidAmount, cashMethod: cashMethod === "Bank" ? "Bank" : "Cash", note: "Initial payment from Repairs receive flow" }] : []),
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
          var ch = {
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
            createdAt: today()
          };
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
  };
  var doVoidSaleFromModal = function () {
    if (!voidSaleTarget) return;
    if (!props.canDeleteInvoices) { props.showPermissionDenied && props.showPermissionDenied("void invoices"); return; }
    var res = buildVoidSaleUpdates(state, voidSaleTarget.id, voidReason);
    if (!res.ok) { showAlert(res.error); return; }
    setState(function (st) { return Object.assign({}, st, res.nextState); });
    addAudit("Voided Sale Invoice", (res.voidedSale.invoiceNo || voidSaleTarget.id.slice(0, 8)) + (voidReason ? " — " + voidReason : ""));
    setVoidSaleTarget(null);
    setVoidReason("");
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
    if (st === "Returned") { s.bg = "#f3f4f6"; s.fg = "#374151"; s.bd = "#d1d5db"; }
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
      openConvertModal(repair);
      return;
    }
    if (action === "__void__") {
      promptVoidDelivered(repair.id, deviceIndex);
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
    var name = String(draft && draft.name || "").trim();
    var phone = String(draft && draft.phone || "").trim();
    if (!name) return null;
    if (!tcTrialGuard(state.customers || [], "customers")) return null;
    var created = { id: uid(), name: name, phone: phone, address: "", credit: 0, totalSpent: 0 };
    var nextCustomers = (state.customers || []).concat([created]);
    S.set("tc3_customers", nextCustomers);
    setState(function (st) { return Object.assign({}, st, { customers: nextCustomers }); });
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
    return "3P Repair - " + (repair.customer || "Customer") + " - " + (device.deviceType || "Device") + (device.brand ? " " + device.brand : "") + (device.modelNo ? " " + device.modelNo : "") + " - Bill#" + String(repair.id || "").slice(0, 8).toUpperCase() + " - D" + (idx + 1);
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
    var name = String(form.productName || "").trim() || defaultThirdPartyProductName(repair, d, deviceIndex);
    var cost = parseFloat(form.costAmount) || 0;
    var sell = parseFloat(form.sellAmount) || 0;
    if (!p) {
      p = {
        id: uid(),
        productId: "RP3P-" + String(repair.id || "").slice(0, 8).toUpperCase() + "-" + (deviceIndex + 1),
        name: name,
        barcode: "3P-" + String(uid()).slice(-8),
        category: "Repair 3rd Party",
        unit: "Pcs",
        type: "stock",
        cost: cost,
        price: sell,
        stock: 1,
        _repair3pOneTime: true,
        _repairInternal: true,
        _repairId: repair.id,
        _repairDeviceIndex: deviceIndex
      };
      products.push(p);
    } else {
      p = Object.assign({}, p, {
        name: name,
        cost: cost,
        price: sell,
        stock: (p.stock || 0) > 0 ? p.stock : 1,
        _repair3pOneTime: true,
        _repairInternal: true,
      });
      products = products.map(function (x) { return x.id === p.id ? p : x; });
    }
    return { product: p, products: products };
  };

  var saveNew = function () {
    if (!f.customer || !f.deviceType) return;
    var devices = normalizeRepairDevices(f);
    var first = devices[0] || blankDevice();
    var billStatus = deriveRepairStatus(devices);
    var returnedLog = devices.map(function (d, idx) {
      if ((d.status || "Accepted") !== "Returned") return null;
      return { id: uid(), date: today(), deviceIndex: idx, device: Object.assign({}, d) };
    }).filter(Boolean);
    var r = {
      id: uid(), date: today(), dateIn: f.dateIn || today(), dateOut: f.dateOut || "",
      customer: f.customer, customerId: f.customerId || "", phone: f.phone || "",
      deviceType: first.deviceType || f.deviceType, brand: first.brand || f.brand || "", modelNo: first.modelNo || f.modelNo || "",
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

  var saveEdit = function (skipPrompt) {
    if (!editR) return;
    var devices = normalizeRepairDevices(editR);
    var orig = state.repairs.find(function (r) { return r.id === editR.id; });
    var origDevices = orig ? normalizeRepairDevices(orig) : [];
    var newReturned = [];
    devices.forEach(function (d, idx) {
      var was = (origDevices[idx] && origDevices[idx].status) || "Accepted";
      var now = d.status || "Accepted";
      if (was !== "Returned" && now === "Returned") {
        newReturned.push({ id: uid(), date: today(), deviceIndex: idx, device: Object.assign({}, d) });
      }
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
    var nr = state.repairs.filter(function (r) { return r.id !== deleteModal.id; });
    var log = (state.repairDeleteLog || []).concat([{ id: uid(), date: today(), repairId: deleteModal.id, customer: deleteModal.customer, device: deleteModal.deviceType + " " + deleteModal.brand, reason: deleteReason }]);
    S.set("tc3_repairs", nr); S.set("tc3_repairDeleteLog", log);
    setState(function (st) { return Object.assign({}, st, { repairs: nr, repairDeleteLog: log }); });
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
  var openConvertModal = function (r) {
    var devices = normalizeRepairDevices(r);
    var readyIndexes = [];
    devices.forEach(function (d, idx) { if ((d.status || "Accepted") === "Ready") readyIndexes.push(idx); });
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
    setConvertDeviceIndexes(readyIndexes.slice());
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
    if (usedRows.length) {
      var np = (state.products || []).map(function (p) {
        var used = usedRows.find(function (u) { return u.productId === p.id; });
        if (!used) return p;
        return Object.assign({}, p, { stock: Number((p.stock || 0) - used.qty) });
      });
      var pl = (state.productLog || []).concat(usedRows.map(function (u) {
        return {
          id: uid(),
          date: today(),
          type: "Repair Internal Use",
          productId: u.productId,
          productName: u.name,
          qty: -u.qty,
          note: "Repair #" + String(r.id || "").slice(0, 8).toUpperCase() + " | " + (r.customer || "")
        };
      }));
      S.set("tc3_products", np);
      S.set("tc3_productLog", pl);
      setState(function (st) { return Object.assign({}, st, { products: np, productLog: pl }); });
      addAudit("Repair internal stock used", (r.customer || "") + " | " + usedRows.map(function (u) { return u.name + " x" + fmtNum(u.qty); }).join(", "));
      var nr = (state.repairs || []).map(function (rep) {
        if (rep.id !== r.id) return rep;
        return Object.assign({}, rep, {
          internalPartsUsed: ((rep.internalPartsUsed || []).concat(usedRows)),
          internalPartsCost: Number((rep.internalPartsCost || 0) + totalPartsCost)
        });
      });
      S.set("tc3_repairs", nr);
      setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    }
    /* Build invoice lines: 3P products on bill; service line only for in-house work */
    var tpIncluded = (convertThirdPartyLines || []).filter(function (x) {
      return x && x.productId && convertDeviceIndexes.indexOf(x.deviceIndex) >= 0;
    });
    var tpDeviceIdx = {};
    tpIncluded.forEach(function (x) { tpDeviceIdx[x.deviceIndex] = true; });
    var thirdPartyItems = tpIncluded.map(function (x) {
      return {
        id: x.productId,
        name: x.billName || x.productName,
        qty: 1,
        price: Number(x.sell || 0),
        cost: Number(x.cost || 0),
        barcode: "",
        fromRepairId: r.id
      };
    });
    if (thirdPartyItems.length > 0 && totalPartsCost > 0) {
      thirdPartyItems[0] = Object.assign({}, thirdPartyItems[0], {
        cost: Number(thirdPartyItems[0].cost || 0) + totalPartsCost
      });
    }
    var nonTpIndexes = selectedIndexes.filter(function (idx) { return !tpDeviceIdx[idx]; });
    var invoiceItems = thirdPartyItems.slice();
    if (nonTpIndexes.length > 0) {
      var svcDevice = allDevices[nonTpIndexes[0]] || blankDevice();
      var serviceCost = svcCost + (thirdPartyItems.length === 0 ? totalPartsCost : 0);
      invoiceItems.unshift({
        id: uid(),
        name: String(convertInvoiceName || "").trim() || ("Repair Service — " + svcDevice.deviceType + (svcDevice.brand ? " " + svcDevice.brand : "") + (svcDevice.modelNo ? " (" + svcDevice.modelNo + ")" : "") + (svcDevice.problem ? " | " + svcDevice.problem : "")),
        qty: 1,
        price: svcPrice,
        cost: serviceCost,
        barcode: "",
        fromRepairId: r.id
      });
    }
    var prefill = {
      customerName: r.customer,
      customerPhone: r.phone || "",
      customerId: custObj ? custObj.id : "",
      items: invoiceItems,
      fromRepairId: r.id,
      fromRepairDeviceIndexes: selectedIndexes
    };
    S.set("tc3_repair_prefill", prefill);
    /* NOTE: Do NOT set status to Delivered here.
       The repair status is updated to Delivered only when the POS invoice is actually saved.
       See saveAndFinish() in POS — it checks fromRepairId and updates the repair. */
    setConvertModal(null);
    props.setActive("pos");
  };

  /* ── Shared repair job HTML builder ── */
  var buildRepairJobHtml = function (r, size) {
    var shopName = props.state.settings.shopName || "Techon Computers";
    var shopAddr = props.state.settings.address || "";
    var shopPhone = props.state.settings.phone || "";
    var isA5 = size === "a5";
    var W = isA5 ? "148mm" : "210mm";
    var fs = isA5 ? "11px" : "12.5px";
    var rowStatus = getRepairStatus(r);
    var statusColor = STATUS_COLORS[rowStatus] || C.blue;
    var statusBg    = STATUS_BG[rowStatus]    || "#e8f0fe";
    var css = [
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; font-size: " + fs + "; color: #1a2444; width: " + W + "; margin: 8mm auto; }",
      ".header { background: linear-gradient(135deg, #0d1b3e 0%, #1a3580 100%); color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }",
      ".shop-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }",
      ".shop-sub { font-size: 10px; opacity: 0.75; margin-top: 2px; }",
      ".job-badge { background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 6px 14px; text-align: center; }",
      ".job-badge-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }",
      ".job-badge-id { font-size: 13px; font-weight: 800; font-family: monospace; letter-spacing: 0.05em; }",
      ".status-bar { background: " + statusBg + "; border: 1.5px solid " + statusColor + "44; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; }",
      ".status-pill { background: " + statusColor + "; color: #fff; padding: 3px 14px; border-radius: 20px; font-weight: 800; font-size: 11px; letter-spacing: 0.04em; }",
      ".section { padding: 12px 16px; border-bottom: 1px solid #e8eeff; }",
      ".section-title { font-size: 9px; font-weight: 700; color: #6b82a8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }",
      ".grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }",
      ".grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }",
      ".field { background: #f7f9ff; border-radius: 6px; padding: 7px 10px; }",
      ".field-label { font-size: 9px; color: #8fa3c8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }",
      ".field-val { font-weight: 700; font-size: 13px; color: #0d1b3e; }",
      ".field-val.accent { color: #2255d4; }",
      ".field-val.green { color: #0f9e6e; }",
      ".problem-box { background: #fff8e1; border: 1.5px solid #fcd34d; border-radius: 8px; padding: 10px 14px; }",
      ".desc-box { background: #f0f4ff; border-radius: 8px; padding: 10px 14px; }",
      ".footer { padding: 10px 16px; text-align: center; font-size: 9px; color: #8fa3c8; }",
      ".sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 12px 16px; }",
      ".sig-box { border-top: 2px dashed #c8d8f0; padding-top: 8px; text-align: center; font-size: 9px; color: #8fa3c8; text-transform: uppercase; letter-spacing: 0.06em; }",
      ".divider { border-top: 2px dashed #e1e8f5; margin: 0 16px; }",
      "@media print { body { margin: 5mm auto; } }"
    ].join("\n");

    var body = "<style>" + css + "</style>";
    body += "<div class='header'>";
    body += "  <div><div class='shop-name'>" + escapeHtml(shopName) + "</div><div class='shop-sub'>" + escapeHtml(shopAddr) + (shopPhone ? " &middot; " + escapeHtml(shopPhone) : "") + "</div></div>";
    body += "  <div class='job-badge'><div class='job-badge-title'>Job Card</div><div class='job-badge-id'>#" + r.id.slice(0, 8).toUpperCase() + "</div></div>";
    body += "</div>";
    body += "<div class='status-bar'>";
    body += "  <span style='font-size:11px;font-weight:600;color:#3d5280;'>Date In: <strong>" + (r.dateIn || r.date) + "</strong>" + (r.dateOut ? " &nbsp;|&nbsp; Expected: <strong>" + r.dateOut + "</strong>" : "") + "</span>";
    body += "  <span class='status-pill'>" + STATUS_ICONS[rowStatus] + " " + (rowStatus || "Accepted") + "</span>";
    body += "</div>";
    var devices = normalizeRepairDevices(r);
    var firstD = devices[0] || blankDevice();
    body += "<div class='section'><div class='section-title'>Customer &amp; Device</div><div class='grid2'>";
    body += "<div class='field'><div class='field-label'>Customer</div><div class='field-val'>" + escapeHtml(r.customer) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Phone</div><div class='field-val'>" + (r.phone || "—") + "</div></div>";
    body += "<div class='field'><div class='field-label'>Device Type</div><div class='field-val accent'>" + escapeHtml(firstD.deviceType || r.deviceType) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Brand &amp; Model</div><div class='field-val'>" + (firstD.brand || r.brand || "—") + " " + (firstD.modelNo || r.modelNo || "") + "</div></div>";
    body += "</div></div>";
    body += "<div class='section'><div class='section-title'>Job Details</div><div class='grid3'>";
    body += "<div class='field'><div class='field-label'>Date Received</div><div class='field-val'>" + (r.dateIn || r.date) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Est. Completion</div><div class='field-val'>" + (r.dateOut || "—") + "</div></div>";
    body += "<div class='field'><div class='field-label'>Est. Cost</div><div class='field-val green'>" + getCurrencySymbol() + " " + Number(r.estimatedCost || r.cost || 0).toLocaleString() + "</div></div>";
    if (r.technician) { body += "<div class='field'><div class='field-label'>Technician</div><div class='field-val'>" + escapeHtml(r.technician) + "</div></div>"; }
    body += "</div></div>";
    body += "<div class='section'><div class='section-title'>Problem Reported</div><div class='problem-box'><strong>" + escapeHtml(firstD.problem || r.problem) + "</strong></div></div>";
    if (devices.length > 1) {
      body += "<div class='section'><div class='section-title'>Additional Devices</div>";
      devices.forEach(function (d, idx) {
        if (idx === 0) return;
        body += "<div class='desc-box' style='margin-bottom:8px'><strong>" + escapeHtml((d.deviceType || "Device") + " " + (d.brand || "") + " " + (d.modelNo || "")) + "</strong><br/>" + escapeHtml(d.problem || "—") + "</div>";
      });
      body += "</div>";
    }
    if (r.description) { body += "<div class='section'><div class='section-title'>Additional Notes</div><div class='desc-box' style='font-size:11px;line-height:1.6'>" + escapeHtml(r.description) + "</div></div>"; }
    if (r.accessories) { body += "<div class='section'><div class='section-title'>Accessories / Items Received</div><div class='desc-box' style='font-size:11px'>" + escapeHtml(r.accessories) + "</div></div>"; }
    body += "<div class='sig-row'><div class='sig-box'>Customer Signature</div><div class='sig-box'>Technician / Staff</div></div>";
    body += "<div class='divider'></div><div class='footer'>Printed: " + new Date().toLocaleString() + " &middot; " + escapeHtml(shopName) + "</div>";
    return body;
  };

  /* ── Enhanced job card print ── */
  var printRepairJob = function (r, size) {
    var body = buildRepairJobHtml(r, size);
    var w = window.open("", "_blank", "width=900,height=780");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Repair Job Card</title></head><body>" + body + "</body></html>");
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  var whatsappRepairJob = function (r, size) {
    var body = buildRepairJobHtml(r, size);
    var filename = "RepairJob-" + r.id.slice(0, 8).toUpperCase();
    shareViaWhatsApp(body, filename, r.phone || "");
  };

  var currentTab = TABS.find(function (t) { return t.id === repairTab; }) || TABS[0];
  var q = search.toLowerCase();
  var filtered = repairTab === "active"
    ? sortNewestFirst((state.repairs || []).filter(function (r) {
      return isBillActive(r) && billMatchesSearch(r, q);
    }).map(function (r) { return { rowKey: r.id, repair: r, isBill: true }; }))
    : flattenRepairDeviceRows().filter(function (row) {
      var matchTab = row.status === currentTab.status;
      var r = row.repair;
      var d = row.device;
      var matchQ = !q || (r.customer || "").toLowerCase().includes(q) || (d.brand || "").toLowerCase().includes(q) || (d.modelNo || "").toLowerCase().includes(q) || (d.problem || "").toLowerCase().includes(q);
      return matchTab && matchQ;
    });

  var repPager = usePager(filtered, LIST_PAGE_SIZE);

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Repair Tabs ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TABS.map(function (tab) {
          var count = tab.id === "active" ? countActiveBills() : countDevicesByStatus(tab.status);
          var active = repairTab === tab.id;
          return (
            <button key={tab.id} onClick={function () { setRepairTab(tab.id); }}
              style={{ border: "2px solid " + (active ? (STATUS_COLORS[tab.status] || C.blue) : C.border), background: active ? (STATUS_BG[tab.status] || "#f7f9ff") : "#fff", color: active ? (STATUS_COLORS[tab.status] || C.blue) : C.textMd, borderRadius: 12, padding: "12px 16px", cursor: "pointer", fontWeight: 800, fontSize: 13, minWidth: 140, boxShadow: active ? "0 4px 16px rgba(0,0,0,0.08)" : "none" }}>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{STATUS_ICONS[tab.status]} {tab.label}</div>
              <div style={{ fontSize: 22, lineHeight: 1 }}>{count}</div>
            </button>
          );
        })}
      </div>

      {/* ── Main Table ── */}
      <Card>
        <CardTitle sub={filtered.length.toLocaleString() + (repairTab === "active" ? " bills" : " devices")} action={<Btn sm col="blue" onClick={function () { setShow(true); setCustSearch(""); setF(BLANK); }}>+ New Repair Bill</Btn>}>{currentTab.label}</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search customer, brand, model, problem..." /></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {repairTab === "active" ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f7f9ff" }}><TH>Date In</TH><TH>Customer</TH><TH>Bill #</TH><TH>Devices</TH><TH>Est. Cost</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: C.muted }}>No active repair bills</td></tr>}
              {repPager.slice.map(function (row, i) {
                var r = row.repair;
                var devices = normalizeRepairDevices(r);
                var first = devices[0] || blankDevice();
                return (
                  <TR key={row.rowKey} i={i}>
                    <TD>{fmtDate(r.dateIn || r.date)}</TD>
                    <TD bold>{r.customer}</TD>
                    <TD><span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>#{r.id.slice(0, 8).toUpperCase()}</span></TD>
                    <TD>
                      <div style={{ fontWeight: 700, color: C.text }}>{first.deviceType} {first.brand} {first.modelNo}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {devices.length} device{devices.length === 1 ? "" : "s"}
                        {devices.length > 1 ? " · " + devices.filter(function (d) { return (d.status || "Accepted") === "Accepted"; }).length + " active" : ""}
                      </div>
                    </TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</TD>
                    <td style={actBtnCellStyle}>
                      <ActBtnGroup gap={6}>
                        <ActBtn tone="cyan" title="View repair bill" onClick={function () { setViewR(r); }}>🧾</ActBtn>
                        <ActBtn tone="blue" title="Edit repair bill" onClick={function () { setEditR(Object.assign({}, r, { devices: normalizeRepairDevices(r) })); }}>✎</ActBtn>
                        <ActBtn tone="red" title="Void repair bill" onClick={function () {
                          var openDelete = function () { setDeleteModal(r); setDeleteReason(""); };
                          if (normalizeRepairDevices(r).some(function (x) { return (x.status || "Accepted") === "Delivered"; })) {
                            requestRepairLock({ title: "Admin password required", message: "Void repair bill for " + r.customer + "?", onConfirm: openDelete });
                            return;
                          }
                          openDelete();
                        }}>✕</ActBtn>
                      </ActBtnGroup>
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>
          ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f7f9ff" }}><TH>Date In</TH><TH>Customer</TH><TH>Bill #</TH><TH>Device</TH><TH>Brand / Model</TH><TH>Problem</TH><TH>Est. Cost</TH><TH>Status</TH><TH style={{ width: 44 }}></TH></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: C.muted }}>No devices in {currentTab.label.toLowerCase()}</td></tr>}
              {repPager.slice.map(function (row, i) {
                var r = row.repair;
                var d = row.device;
                return (
                  <TR key={row.rowKey} i={i}>
                    <TD>{fmtDate(r.dateIn || r.date)}</TD>
                    <TD bold>{r.customer}</TD>
                    <TD><span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>#{r.id.slice(0, 8).toUpperCase()}</span></TD>
                    <TD><span style={{ background: C.accentSoft, color: C.accent, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{d.deviceType}</span></TD>
                    <TD>{d.brand}{d.modelNo ? " — " + d.modelNo : ""}</TD>
                    <TD>{d.problem}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</TD>
                    <td style={{ padding: "9px 12px" }}>
                      <RepairStatusSelect
                        currentStatus={row.status}
                        compact
                        onAction={function (action) { handleDeviceStatusAction(r, row.deviceIndex, action); }}
                      />
                    </td>
                    <td style={{ ...actBtnCellStyle, width: 44, padding: "9px 8px" }}>
                      <ActBtn tone="cyan" title="View repair bill" onClick={function () { setViewR(r); }}>🧾</ActBtn>
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        <Pager pager={repPager} />
      </Card>

      {voidSaleTarget && (
        <Modal title={"Void Invoice — " + (voidSaleTarget.invoiceNo || voidSaleTarget.id.slice(0, 8))} onClose={function () { setVoidSaleTarget(null); setVoidReason(""); }}>
          <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#b91c1c" }}>
            This will reverse stock, customer balance, and payments. The invoice stays on record as <strong>Voided</strong>. This cannot be undone.
          </div>
          <Sel label="Reason" value={voidReason} onChange={function (e) { setVoidReason(e.target.value); }}>
            <option value="">Select reason…</option>
            {VOID_REASON_OPTIONS.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
          </Sel>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <RepairActionBtn tone="danger" disabled={!voidReason} onClick={doVoidSaleFromModal}>Void Invoice</RepairActionBtn>
            <RepairActionBtn tone="neutral" onClick={function () { setVoidSaleTarget(null); setVoidReason(""); }}>Cancel</RepairActionBtn>
          </div>
        </Modal>
      )}

      {thirdPartyReceiveModal && (
        <Modal title="Receive From 3rd Party Repair Center" onClose={function () { setThirdPartyReceiveModal(null); setSuppSearch(""); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: "min(900px, 95vw)" }}>
            <div style={{ background: C.accentSoft, border: "1px solid #c7ddff", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.accent, fontWeight: 600 }}>
              Purchase-style receive: create one-time product, record supplier payable/payment, then move this device to <strong>Ready</strong>.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 12 }}>
              <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Supplier
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Search supplier</label>
                  <SupplierPicker
                    suppliers={state.suppliers || []}
                    value={suppSearch}
                    selectedSupplierId={thirdPartyReceiveForm.supplierId || ""}
                    onValueChange={function (nextValue) {
                      setSuppSearch(nextValue);
                      setThirdPartyReceiveForm(function (x) {
                        return Object.assign({}, x, { supplierId: "", supplierName: nextValue, supplierPhone: "" });
                      });
                    }}
                    onSelectSupplier={function (s) {
                      setSuppSearch(s.name + (s.phone ? (" - " + s.phone) : ""));
                      setThirdPartyReceiveForm(function (x) {
                        return Object.assign({}, x, { supplierId: s.id, supplierName: s.name, supplierPhone: s.phone || "" });
                      });
                    }}
                    onCreateSupplier={saveInlineSupplierFromPicker}
                    placeholder="Search supplier by name or phone..."
                    C={C}
                    Input={Input}
                  />
                </div>
                {thirdPartyReceiveForm.supplierId ? (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, padding: "8px 10px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                    <strong style={{ color: "#166534" }}>{thirdPartyReceiveForm.supplierName}</strong>
                    {thirdPartyReceiveForm.supplierPhone ? <span> · {thirdPartyReceiveForm.supplierPhone}</span> : null}
                  </div>
                ) : null}
                <Sel label="Payment Mode" value={thirdPartyReceiveForm.payMode} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { payMode: e.target.value }); }); }}>
                  <option value="paid">Fully Paid</option>
                  <option value="partial">Partial Paid</option>
                  <option value="unpaid">Unpaid</option>
                </Sel>
                {thirdPartyReceiveForm.payMode !== "unpaid" ? (
                  <div>
                    {(thirdPartyReceiveForm.splitRows && thirdPartyReceiveForm.splitRows.length > 0) ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", marginBottom: 6 }}>Payment Method</div>
                        <div style={{ background: "#f0f9f4", borderRadius: 9, padding: "10px 12px", border: "1px solid #9ee8ce", marginBottom: 6 }}>
                          {thirdPartyReceiveForm.splitRows.map(function (r, i) {
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                                <span style={{ color: C.textMd }}>{r.method === "Cheque" ? "🏷 " : r.method === "Bank" ? "🏦 " : "💵 "}{r.method}{r.method === "Cheque" && r.chequeNo ? " #" + r.chequeNo : ""}</span>
                                <strong style={{ color: r.method === "Cheque" ? "#d97706" : C.green }}>{getCurrencySymbol()} {fmtNum(parseFloat(r.amount) || 0)}{r.method === "Cheque" ? " (pending)" : ""}</strong>
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={function () { setThirdPartySplitModal(true); }} style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1.5px dashed #0369a1", background: "#e0f2fe", color: "#0369a1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏️ Edit Payment</button>
                      </div>
                    ) : (
                      <button onClick={function () { setThirdPartySplitModal(true); }}
                        style={{ width: "100%", padding: "11px", borderRadius: 9, border: "2px solid #0369a1", background: "#0369a1", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        💰 Set Payment Method
                      </button>
                    )}
                    {thirdPartyReceiveForm.splitRows && thirdPartyReceiveForm.splitRows.length > 0 ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: C.textMd }}>
                        Paid now: <strong style={{ color: C.green }}>{getCurrencySymbol()} {fmtNum((thirdPartyReceiveForm.splitRows || []).reduce(function (a, r) { return r.method !== "Cheque" ? a + (parseFloat(r.amount) || 0) : a; }, 0))}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Input label="Note / Receipt No." value={thirdPartyReceiveForm.note} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { note: e.target.value }); }); }} placeholder="Optional note" />
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Product & Amount
                </div>
                <Input label="Product Name (internal only)" value={thirdPartyReceiveForm.productName} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { productName: e.target.value }); }); }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input label="Cost Amount" type="number" value={thirdPartyReceiveForm.costAmount} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { costAmount: e.target.value }); }); }} />
                  <Input label="Sell Amount" type="number" value={thirdPartyReceiveForm.sellAmount} onChange={function (e) { setThirdPartyReceiveForm(function (x) { return Object.assign({}, x, { sellAmount: e.target.value }); }); }} />
                </div>
                <div style={{ marginTop: 10, background: "#ecfdf5", border: "1px dashed #86efac", borderRadius: 8, padding: "10px 12px", fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ color: "#166534" }}>Cost</span>
                    <strong style={{ color: "#166534" }}>{getCurrencySymbol()} {fmtNum(parseFloat(thirdPartyReceiveForm.costAmount) || 0)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#166534" }}>Sell (invoice line)</span>
                    <strong style={{ color: "#166534" }}>{getCurrencySymbol()} {fmtNum(parseFloat(thirdPartyReceiveForm.sellAmount) || 0)}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <RepairActionGroup gap={6}>
              <RepairActionBtn tone="ready" onClick={function () { saveThirdPartyReceived(false); }}>Save & Move to Ready</RepairActionBtn>
              <RepairActionBtn tone="print" onClick={function () { saveThirdPartyReceived(true); }}>Save + Print Barcode</RepairActionBtn>
              <RepairActionBtn tone="neutral" onClick={function () { setThirdPartyReceiveModal(null); }}>Cancel</RepairActionBtn>
            </RepairActionGroup>
            </div>
          </div>
        </Modal>
      )}
      {thirdPartyBarcodeItems && (
        <Modal title={"Print 3rd Party Barcode — " + thirdPartyBarcodeItems.length + " label"} onClose={function () { setThirdPartyBarcodeItems(null); }} wide>
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }} className="no-print">
          <RepairActionGroup gap={6}>
            <RepairActionBtn tone="print" onClick={printThirdPartyBarcodeLabels}>Print Label</RepairActionBtn>
            <RepairActionBtn sm tone="neutral" onClick={function () { setThirdPartyBarcodeItems(null); }}>Close</RepairActionBtn>
          </RepairActionGroup>
          </div>
          <BarcodeLabelSheet items={thirdPartyBarcodeItems} shopName={state.settings.shopName} barcodeSettings={state.settings} />
        </Modal>
      )}
      {thirdPartySplitModal && (
        <SplitPaymentModal
          title={"Set Payment — 3rd Party Receive"}
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

      {/* ── Deleted Repairs Log ── */}
      {(state.repairDeleteLog || []).length > 0 && (
        <Card>
          <CardTitle sub="Deleted repair records with reasons">Deleted Repairs History</CardTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fff5f5" }}><TH>Deleted On</TH><TH>Customer</TH><TH>Device</TH><TH>Reason</TH></tr></thead>
            <tbody>
              {(state.repairDeleteLog || []).slice().reverse().map(function (l, i) {
                return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><TD bold>{l.customer}</TD><TD>{l.device}</TD><TD>{l.reason}</TD></TR>;
              })}
            </tbody>
          </table>
        </Card>
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
                  duplicateNameKeys={posDupNameKeys}
                  normalizeNameKey={props.normalizePaymentCustomerName}
                  C={C}
                  Input={Input}
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
      {viewR && (
        <Modal title={"🔧 Repair Job — " + viewR.customer} onClose={function () { setViewR(null); }} wide>
          {/* Header strip */}
          <div style={{ background: "linear-gradient(135deg, #0d1b3e, #1a3580)", borderRadius: 10, padding: "16px 20px", color: "#fff", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{viewR.customer}</div>
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{viewR.phone}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {deviceStatusPills(viewR).map(function (p, idx) {
                  return <span key={idx} style={{ background: p.bg, color: p.fg, border: "1px solid " + p.bd, borderRadius: 999, padding: "4px 11px", fontSize: 11, fontWeight: 700 }}>{p.label}</span>;
                })}
              </div>
              <div style={{ opacity: 0.6, fontSize: 10, marginTop: 4 }}>Job #{viewR.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
          {/* Detail grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              ["Device", (normalizeRepairDevices(viewR)[0] || {}).deviceType || viewR.deviceType, C.accent],
              ["Brand / Model", (((normalizeRepairDevices(viewR)[0] || {}).brand || viewR.brand || "—") + " " + ((normalizeRepairDevices(viewR)[0] || {}).modelNo || viewR.modelNo || "")).trim(), C.text],
              ["Est. Cost", getCurrencySymbol() + " " + fmtNum(viewR.estimatedCost || viewR.cost || 0), C.green],
              ["Date In", fmtDateFull(viewR.dateIn || viewR.date), C.text],
              ["Expected Out", viewR.dateOut ? fmtDateFull(viewR.dateOut) : "—", C.text],
              ["Technician", viewR.technician || "—", C.text],
            ].map(function (x, i) {
              return (
                <div key={i} style={{ background: "#f7f9ff", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{x[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: x[2] }}>{x[1]}</div>
                </div>
              );
            })}
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Devices in this bill</div>
            {normalizeRepairDevices(viewR).map(function (d, idx) {
              var st = d.status || "Accepted";
              return (
                <div key={idx} style={{ background: "#fff", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px", marginBottom: idx === normalizeRepairDevices(viewR).length - 1 ? 0 : 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{idx + 1}. {d.deviceType} {d.brand} {d.modelNo}</div>
                      <div style={{ fontSize: 12, color: C.textMd, marginTop: 3, lineHeight: 1.45 }}>{d.problem || "—"}</div>
                    </div>
                    {deviceStatusBadge(st, false)}
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                    {renderDeviceStatusActions(viewR, idx, st)}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed " + C.border, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>All devices:</span>
              <select
                defaultValue=""
                onChange={function (e) {
                  var v = e.target.value;
                  e.target.value = "";
                  if (!v || !viewR) return;
                  updateAllDeviceStatuses(viewR, v);
                }}
                style={{
                  height: 32,
                  minWidth: 180,
                  padding: "0 28px 0 12px",
                  borderRadius: 8,
                  border: "1px solid " + C.border,
                  background: "#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 8px center",
                  backgroundSize: "12px",
                  color: C.textMd,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                }}
              >
                <option value="" disabled>Bulk status change…</option>
                {getRepairBulkStatusOptions().map(function (opt) {
                  return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                })}
              </select>
            </div>
          </div>
          {((viewR && viewR.returnedLog && viewR.returnedLog.length > 0) || normalizeRepairDevices(viewR).some(function (d) { return (d.status || "Accepted") === "Returned"; })) && (
            <div style={{ background: "#f9fafb", border: "1px dashed #9ca3af", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Returned Devices Record
              </div>
              {(function () {
                var live = normalizeRepairDevices(viewR).map(function (d, idx) {
                  if ((d.status || "Accepted") !== "Returned") return null;
                  return { id: "live_" + idx, date: viewR.dateOut || viewR.dateIn || viewR.date || today(), deviceIndex: idx, device: Object.assign({}, d) };
                }).filter(Boolean);
                var log = Array.isArray(viewR.returnedLog) ? viewR.returnedLog.slice() : [];
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
                  <div key={(e && e.id) || idx} style={{ padding: "8px 0", borderBottom: idx === (((viewR && viewR.returnedLog) || []).length - 1) ? "none" : "1px dashed " + C.border }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800, color: C.text }}>{d.deviceType} {d.brand} {d.modelNo}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{e.date ? fmtDateFull(e.date) : ""}</div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMd, marginTop: 2 }}>{d.problem || "No issue note"}</div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Problem */}
          <div style={{ background: "#fff8e1", border: "1.5px solid #fcd34d", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Problem Reported</div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{(normalizeRepairDevices(viewR)[0] || {}).problem || viewR.problem}</div>
          </div>
          {viewR.description && (
            <div style={{ background: "#f0f4ff", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Notes / Description</div>
              <div style={{ color: C.textMd, fontSize: 13, lineHeight: 1.6 }}>{viewR.description}</div>
            </div>
          )}
          {viewR.accessories && (
            <div style={{ background: "#f0f4ff", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Accessories Received</div>
              <div style={{ color: C.textMd, fontSize: 13 }}>{viewR.accessories}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 12, borderTop: "1px solid " + C.border }}>
            <RepairActionGroup gap={6}>
              <RepairActionBtn tone="edit" onClick={function () { setViewR(null); setEditR(Object.assign({}, viewR, { devices: normalizeRepairDevices(viewR) })); }}>Edit</RepairActionBtn>
              {normalizeRepairDevices(viewR).some(function (d) { return (d.status || "Accepted") === "Ready"; }) ? (
                <RepairActionBtn tone="invoice" onClick={function () { setViewR(null); openConvertModal(viewR); }}>Convert to Invoice</RepairActionBtn>
              ) : null}
              <RepairActionBtn tone="print" onClick={function () { printRepairJob(viewR, "a4"); }}>Print A4</RepairActionBtn>
              <RepairActionBtn tone="thirdParty" onClick={function () { printRepairJob(viewR, "a5"); }}>Print A5</RepairActionBtn>
              <WABtn title="Share Job Card via WhatsApp" onClick={function () { whatsappRepairJob(viewR, "a4"); }} />
              <RepairActionBtn tone="neutral" onClick={function () { setViewR(null); }}>Close</RepairActionBtn>
            </RepairActionGroup>
          </div>
        </Modal>
      )}

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
                      <Sel label="Device Status" value={d.status || "Accepted"} onChange={function (e) {
                        var nextStatus = e.target.value;
                        if (nextStatus === "Delivered") return;
                        var currStatus = d.status || "Accepted";
                        var apply = function () { setEditR(function (x) { var rows = normalizeRepairDevices(x).slice(); rows[idx] = Object.assign({}, rows[idx], { status: nextStatus }); return Object.assign({}, x, { devices: rows, status: deriveRepairStatus(rows) }); }); };
                        if (currStatus !== nextStatus && (currStatus === "Delivered" || currStatus === "Returned")) {
                          requestRepairLock({ title: "Admin password required", message: "Change device status from " + currStatus + " to " + nextStatus + "?", onConfirm: apply });
                          return;
                        }
                        apply();
                      }}>
                        {MANUAL_STATUSES.map(function (s) { return <option key={s}>{s}</option>; })}
                        {(d.status || "Accepted") === "Delivered" ? <option>Delivered</option> : null}
                      </Sel>
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
        var hasTpLines = (convertThirdPartyLines || []).length > 0;
        var inHouseProductName = (function () {
          var idx = (convertDeviceIndexes || [])[0];
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
                    </label>
                  );
                })}
              </div>
            ) : null}
            {hasTpLines ? (convertThirdPartyLines || []).map(function (ln, idx) {
              if (convertDeviceIndexes.indexOf(ln.deviceIndex) < 0) return null;
              return (
                <div key={idx} style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                  <Input label="Product name" value={ln.productName || ""} disabled />
                  <Input label="Invoice name" value={ln.billName || ""} onChange={function (e) {
                    var v = e.target.value;
                    setConvertThirdPartyLines(function (arr) {
                      var n = (arr || []).slice();
                      n[idx] = Object.assign({}, n[idx], { billName: v });
                      return n;
                    });
                  }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <Input label="Cost" type="number" value={String(ln.cost || "")} disabled />
                    <Input label="Sell price" type="number" value={String(ln.sell || "")} onChange={function (e) {
                      var v = parseFloat(e.target.value) || 0;
                      setConvertThirdPartyLines(function (arr) {
                        var n = (arr || []).slice();
                        n[idx] = Object.assign({}, n[idx], { sell: v });
                        return n;
                      });
                    }} />
                  </div>
                </div>
              );
            }) : (
              <div style={{ background: "#f8fafc", border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
                <Input label="Product name" value={inHouseProductName} disabled />
                <Input label="Invoice name" value={convertInvoiceName} onChange={function (e) { setConvertInvoiceName(e.target.value); }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <Input label="Cost" type="number" value={serviceCost} onChange={function (e) { setServiceCost(e.target.value); }} />
                  <Input label="Sell price" type="number" value={servicePrice} onChange={function (e) { setServicePrice(e.target.value); }} placeholder="Optional" />
                </div>
              </div>
            )}
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
