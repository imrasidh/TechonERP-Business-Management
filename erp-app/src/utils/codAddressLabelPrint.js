/** A5 landscape COD / delivery address label — shop (top) + customer (bottom) + price badge. */

function esc(val) {
  return String(val == null ? "" : val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtPriceLabel(n) {
  var v = Math.round((Number(n) || 0) * 100) / 100;
  if (Math.abs(v - Math.round(v)) < 0.005) {
    return Math.round(v).toLocaleString("en-US");
  }
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySuffix(settings) {
  var c = String((settings && settings.currency) || "Rs").trim();
  if (!c || c.toLowerCase() === "rs" || c === "රු") return "LKR";
  return c;
}

function joinPhones(a, b) {
  var p1 = String(a || "").trim();
  var p2 = String(b || "").trim();
  if (p1 && p2) return p1 + " / " + p2;
  return p1 || p2 || "";
}

function addressHtml(addr) {
  var lines = String(addr || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return "&nbsp;";
  return lines.map(function (l) { return esc(l); }).join("<br>");
}

export function codAddressLabelTotal(record) {
  return (Number(record && record.soldTotal) || 0) + (Number(record && record.courierCost) || 0);
}

export function buildCodAddressLabelHtml(record, settings) {
  var st = settings || {};
  var shopName = String(st.shopName || "Shop").trim();
  var shopAddr = String(st.address || "").trim();
  var shopPhones = joinPhones(st.phone, st.phone2);

  var custName = String(record.customerName || "").trim() || "Customer";
  var custAddr = String(record.customerAddress || "").trim();
  var custPhones = joinPhones(record.customerPhone, record.altPhone);
  var total = codAddressLabelTotal(record);
  var priceText = fmtPriceLabel(total) + " " + currencySuffix(st);

  return (
    "<div class=\"cod-label-page\">" +
      "<div class=\"cod-half cod-from\">" +
        "<div class=\"cod-lbl\">From</div>" +
        "<div class=\"cod-name\">" + esc(shopName) + "</div>" +
        "<div class=\"cod-addr\">" + addressHtml(shopAddr) + "</div>" +
        (shopPhones ? "<div class=\"cod-phone\">" + esc(shopPhones) + "</div>" : "") +
      "</div>" +
      "<div class=\"cod-divider\"></div>" +
      "<div class=\"cod-half cod-to\">" +
        "<div class=\"cod-lbl\">To</div>" +
        "<div class=\"cod-name\">" + esc(custName) + "</div>" +
        "<div class=\"cod-addr\">" + addressHtml(custAddr) + "</div>" +
        (custPhones ? "<div class=\"cod-phone\">" + esc(custPhones) + "</div>" : "") +
        "<div class=\"cod-price\">" + esc(priceText) + "</div>" +
      "</div>" +
    "</div>"
  );
}

/** A5 landscape: top/bottom margin 1cm, left/right 0.5cm */
export var COD_ADDRESS_LABEL_CSS =
  "*{box-sizing:border-box;margin:0;padding:0;}" +
  "html,body{width:100%;height:100%;}" +
  "body{font-family:'Plus Jakarta Sans',Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
  "@page{size:A5 landscape;margin:1cm 0.5cm;}" +
  ".cod-label-page{display:flex;flex-direction:column;width:100%;height:128mm;min-height:128mm;}" +
  ".cod-half{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4mm 6mm;position:relative;min-height:0;}" +
  ".cod-divider{border-top:2px solid #111;width:70%;margin:0 auto;flex-shrink:0;}" +
  ".cod-lbl{font-size:14px;font-weight:500;color:#111;margin-bottom:8px;}" +
  ".cod-name{font-size:22px;font-weight:800;color:#111;line-height:1.2;margin-bottom:10px;max-width:100%;word-wrap:break-word;}" +
  ".cod-addr{font-size:16px;font-weight:400;color:#111;line-height:1.55;max-width:94%;word-wrap:break-word;}" +
  ".cod-phone{font-size:16px;font-weight:400;color:#111;margin-top:10px;}" +
  ".cod-to .cod-price{position:absolute;right:0;bottom:0;background:#111;color:#fff;font-size:12px;font-weight:800;padding:7px 11px;border-radius:4px;white-space:nowrap;}" +
  "@media print{.cod-label-page{height:128mm;page-break-inside:avoid;}}" +
  "@media screen{.cod-label-page{border:1px dashed #cbd5e1;background:#fff;}}";

export function codAddressLabelStyleTag() {
  return "<style>" + COD_ADDRESS_LABEL_CSS + "</style>";
}

var FONT_LINK = "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap\">";

export function printCodAddressLabel(record, settings, onBlocked) {
  if (!record) return false;
  var body = buildCodAddressLabelHtml(record, settings);
  var title = "COD Address — " + (record.invoiceNo || record.customerName || "");
  var w = window.open("", "_blank", "width=920,height=640");
  if (!w) {
    if (typeof onBlocked === "function") onBlocked();
    return false;
  }
  w.document.write(
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + esc(title) + "</title>" +
    FONT_LINK + codAddressLabelStyleTag() +
    "</head><body>" + body + "</body></html>"
  );
  w.document.close();
  setTimeout(function () {
    try { w.focus(); w.print(); } catch (_e) { /* ignore */ }
  }, 450);
  return true;
}
