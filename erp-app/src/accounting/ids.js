/**
 * Stable device id + globally unique transaction ids for GL / sync / audit.
 */

export function getOrCreateDeviceId() {
  try {
    if (typeof localStorage === "undefined") return "web_" + Math.random().toString(36).slice(2, 12);
    var k = "tc3_gl_device_id";
    var id = localStorage.getItem(k);
    if (id && id.length >= 6) return id;
    id = "d_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, id);
    return id;
  } catch (e) {
    return "mem_" + Math.random().toString(36).slice(2, 14);
  }
}

/** Deterministic economic-event id (same across devices for the same facts). */
export function stableJournalTransactionId(refType, refId, sliceKey) {
  var r = String(refType || "x").replace(/[^a-zA-Z0-9._-]/g, "_");
  var i = String(refId == null ? "" : refId).replace(/[^a-zA-Z0-9._-]/g, "_");
  var s = String(sliceKey || "main").replace(/[^a-zA-Z0-9._-]/g, "_");
  return "urn:tc3:gl:" + r + ":" + i + ":" + s;
}

/**
 * Unique id for a new correction / reversal group (never collides with stable ids).
 */
export function makeUniqueTransactionId(deviceId) {
  var d = deviceId || getOrCreateDeviceId();
  return "urn:tc3:tx:" + d.slice(0, 24) + ":" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2, 10);
}
