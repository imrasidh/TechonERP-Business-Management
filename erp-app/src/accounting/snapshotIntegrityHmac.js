/**
 * Snapshot HMAC: v2 = LICENSE_SECRET (via Electron main sign/verify); v1 = device pepper (dev only).
 */

import { getOrCreateDeviceId } from "./ids.js";
import { isProductionViteBuild } from "../productionConfig.js";

var PEPPER = "TechonERP.financial.snapshot.hmac.v1";

function bufToHex(buf) {
  var u = new Uint8Array(buf);
  var s = "";
  for (var i = 0; i < u.length; i++) {
    s += u[i].toString(16).padStart(2, "0");
  }
  return s;
}

async function getHmacKeyBytesDevice() {
  var dev = getOrCreateDeviceId();
  var text = PEPPER + "|" + dev;
  if (typeof window !== "undefined" && window.__TC_SNAPSHOT_HMAC_SECRET__) {
    try {
      text = String(window.__TC_SNAPSHOT_HMAC_SECRET__) + "|" + text;
    } catch (e) { /* ignore */ }
  }
  var enc = new TextEncoder();
  var raw = enc.encode(text);
  if (typeof crypto === "undefined" || !crypto.subtle || !crypto.subtle.digest) {
    return null;
  }
  return crypto.subtle.digest("SHA-256", raw);
}

function hasElectronSign() {
  return typeof window !== "undefined"
    && window.electronAPI
    && typeof window.electronAPI.signSnapshotHmac === "function";
}

/**
 * True when a LICENSE_SECRET is available (main process or env for node tests).
 */
export async function resolveSnapshotSecretForRenderer() {
  if (hasElectronSign() && typeof window.electronAPI.isSnapshotHmacConfigured === "function") {
    try {
      if (await window.electronAPI.isSnapshotHmacConfigured()) return "__main_process__";
    } catch (e) { /* ignore */ }
  }
  if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.getSnapshotHmacSecret === "function") {
    try {
      var s = await window.electronAPI.getSnapshotHmacSecret();
      if (s && typeof s === "string" && s.length > 0) return s;
    } catch (e2) { /* ignore */ }
  }
  if (typeof process !== "undefined" && process.env) {
    var e = process.env.LICENSE_SECRET || process.env.TC_LIC_SERVER_SECRET;
    if (e && typeof e === "string" && e.length > 0) return e;
  }
  return null;
}

/**
 * Primary + optional rotation secret (TC_SNAPSHOT_HMAC_SECRET_PREVIOUS) for verify-only (node/tests).
 */
export async function resolveSnapshotVerificationSecrets() {
  var list = [];
  var primary = await resolveSnapshotSecretForRenderer();
  if (primary && primary !== "__main_process__") list.push(primary);
  var prev = "";
  if (typeof process !== "undefined" && process.env && process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS) {
    prev = String(process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS).trim();
  }
  if (!prev && typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.verifySnapshotHmac === "function") {
    /* Previous secret stays in main — verify IPC already tries TC_SNAPSHOT_HMAC_SECRET_PREVIOUS. */
  } else if (!prev && typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.getSnapshotHmacSecretPrevious === "function") {
    try {
      var p = await window.electronAPI.getSnapshotHmacSecretPrevious();
      if (p && typeof p === "string") prev = p.trim();
    } catch (e2) { /* ignore */ }
  }
  if (prev && list.indexOf(prev) < 0) list.push(prev);
  return list;
}

/**
 * HMAC-SHA256(canonicalBody, secret) — v2 strong seal.
 */
export async function computeSnapshotHmacHexV2(canonicalBody, secret) {
  if (hasElectronSign() && (!secret || secret === "__main_process__")) {
    try {
      var r = await window.electronAPI.signSnapshotHmac(canonicalBody || "");
      if (r && r.ok && r.hex) return r.hex;
    } catch (e) { /* fall through */ }
  }
  if (!secret || secret === "__main_process__" || typeof crypto === "undefined" || !crypto.subtle) {
    return "";
  }
  try {
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonicalBody || ""));
    return bufToHex(sig);
  } catch (e) {
    return "";
  }
}

export async function verifySnapshotHmacV2(canonicalBody, hexSig, secret) {
  if (!hexSig) return false;
  if (hasElectronSign() && typeof window.electronAPI.verifySnapshotHmac === "function" && (!secret || secret === "__main_process__")) {
    try {
      var r = await window.electronAPI.verifySnapshotHmac({ canonicalBody: canonicalBody || "", hexSig: hexSig });
      return !!(r && r.ok);
    } catch (e) { /* fall through */ }
  }
  if (!secret || secret === "__main_process__") return false;
  var next = await computeSnapshotHmacHexV2(canonicalBody, secret);
  return !!next && next === hexSig;
}

/** v1 device-based (legacy / fallback). */
export async function computeSnapshotHmacHex(canonicalBody) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "";
  }
  try {
    var keyBytes = await getHmacKeyBytesDevice();
    if (!keyBytes) return "";
    var key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonicalBody || ""));
    return bufToHex(sig);
  } catch (e) {
    return "";
  }
}

export async function verifySnapshotHmac(canonicalBody, hexSig) {
  if (!hexSig || typeof hexSig !== "string") return false;
  var next = await computeSnapshotHmacHex(canonicalBody);
  if (!next || next.length !== hexSig.length) return false;
  return next === hexSig;
}

/**
 * Try v2 with license secret(s), then v1 device (cross-machine / legacy).
 */
export async function verifySnapshotHmacFlexible(snapshot, canon) {
  if (!snapshot || !snapshot.integrityHmac) {
    return { ok: false, matched: "none", reason: "no_hmac" };
  }
  var algo = snapshot.algorithm || "";
  if (algo === "hmac-sha256-v2" || algo === "") {
    if (hasElectronSign() && typeof window.electronAPI.verifySnapshotHmac === "function") {
      try {
        var mainV = await window.electronAPI.verifySnapshotHmac({
          canonicalBody: canon || "",
          hexSig: snapshot.integrityHmac,
        });
        if (mainV && mainV.ok) {
          return {
            ok: true,
            matched: mainV.matched || "v2_license",
            reason: "hmac_ok",
          };
        }
      } catch (eM) { /* fall through to secret list */ }
    }
    var secrets = await resolveSnapshotVerificationSecrets();
    var si;
    for (si = 0; si < secrets.length; si++) {
      var secret = secrets[si];
      if (!secret) continue;
      var v2 = await verifySnapshotHmacV2(canon, snapshot.integrityHmac, secret);
      if (v2) {
        return {
          ok: true,
          matched: si === 0 ? "v2_license" : "v2_license_previous",
          reason: "hmac_ok",
        };
      }
    }
  }
  var v1 = await verifySnapshotHmac(canon, snapshot.integrityHmac);
  if (v1) {
    if (isProductionViteBuild()) {
      return { ok: false, matched: "v1_device", reason: "v1_not_trusted_in_production_bundle" };
    }
    return { ok: true, matched: "v1_device", reason: "hmac_ok" };
  }
  return { ok: false, matched: "none", reason: "hmac_mismatch" };
}
