/**
 * Local JsBarcode — never load from CDN in the main ERP renderer or print HTML.
 */
import JsBarcode from "jsbarcode";
import jsBarcodeMinSrc from "jsbarcode/dist/JsBarcode.all.min.js?raw";

export { JsBarcode };

/** Inline <script> for sandboxed print windows (offline, no remote JS). */
export function getJsBarcodeInlineScriptTag() {
  return "<script>" + String(jsBarcodeMinSrc || "") + "<\/script>";
}

/** Ensure window.JsBarcode for legacy call sites that expect the global. */
export function ensureJsBarcodeGlobal() {
  try {
    if (typeof window !== "undefined" && !window.JsBarcode) {
      window.JsBarcode = JsBarcode;
    }
  } catch (_e) { /* ignore */ }
  return JsBarcode;
}
