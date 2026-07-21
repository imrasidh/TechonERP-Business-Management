/** Shared modal chrome — dark purple title bar (matches menu / brand) + wide-compact shell sizing. */
export var MODAL_HEADER_BG = "linear-gradient(180deg, #3d2375 0%, #4a2a8f 55%, #321b5c 100%)";

/** Canonical shell widths — keep in sync with Modal in App.jsx + erpClickFeedback.css */
export var MODAL_WIDTH = {
  compact: "480px",
  default: "860px",
  medium: "960px",
  wide: "1120px",
};

export function modalHeaderBarStyle(headerBg) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 12px",
    minHeight: 34,
    background: headerBg || MODAL_HEADER_BG,
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    flexShrink: 0,
  };
}

export function modalShellStyle(extra) {
  return Object.assign({
    background: "#fff",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 18px 48px rgba(15, 23, 42, 0.2)",
    border: "1px solid #e1e8f5",
  }, extra || {});
}

export function modalBodyStyle(extra) {
  return Object.assign({
    padding: "8px 10px 10px",
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
    background: "#f1f5f9",
  }, extra || {});
}
