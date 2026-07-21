import { stampUpdatedAt } from "./stampUpdatedAt.js";

function normalizeRepairDevices(repair) {
  var rows = Array.isArray(repair && repair.devices) ? repair.devices : [];
  var cleaned = rows.map(function (d) {
    return Object.assign({}, d || {}, {
      deviceType: (d && d.deviceType) || "Laptop",
      brand: (d && d.brand) || "",
      modelNo: (d && d.modelNo) || "",
      serialNo: (d && (d.serialNo || d.imei)) || "",
      problem: (d && d.problem) || "",
      status: (d && d.status) || "Accepted",
    });
  }).filter(function (d) {
    return d.deviceType || d.brand || d.modelNo || d.serialNo || d.problem;
  });
  if (!cleaned.length) {
    cleaned = [{
      deviceType: (repair && repair.deviceType) || "Laptop",
      brand: (repair && repair.brand) || "",
      modelNo: (repair && repair.modelNo) || "",
      serialNo: (repair && (repair.serialNo || repair.imei)) || "",
      problem: (repair && repair.problem) || "",
      status: (repair && repair.status) || "Accepted",
    }];
  }
  return cleaned;
}

function stampDeviceTimeline(device, patch) {
  return Object.assign({}, device || {}, {
    timeline: Object.assign({}, (device && device.timeline) || {}, patch || {}),
  });
}

function deriveRepairStatus(devices) {
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
}

function buildRepairPatch(repair, devices, extra) {
  var first = devices[0] || {};
  return stampUpdatedAt(Object.assign({}, repair, extra || {}, {
    devices: devices,
    deviceType: first.deviceType || "Laptop",
    brand: first.brand || "",
    modelNo: first.modelNo || "",
    serialNo: first.serialNo || "",
    problem: first.problem || "",
    status: deriveRepairStatus(devices),
  }));
}

/** When a repair-linked sale is voided, reset Delivered devices back to Ready. */
export function rollbackRepairDevicesOnVoidSale(repairs, voidedSale, readyAt) {
  if (!voidedSale || !voidedSale.fromRepairId) return repairs || [];
  var idxs = Array.isArray(voidedSale.fromRepairDeviceIndexes)
    ? voidedSale.fromRepairDeviceIndexes.slice()
    : [];
  var day = readyAt || "";
  return (repairs || []).map(function (rep) {
    if (rep.id !== voidedSale.fromRepairId) return rep;
    var devices = normalizeRepairDevices(rep).map(function (d, idx) {
      var hit = !idxs.length || idxs.indexOf(idx) >= 0;
      if (!hit || (d.status || "Accepted") !== "Delivered") return d;
      return stampDeviceTimeline(Object.assign({}, d, { status: "Ready" }), { readyAt: day });
    });
    return buildRepairPatch(rep, devices, {});
  });
}
