/** Shared modal chrome — colored title bar + standard shell sizing. */
export var MODAL_HEADER_BG = "linear-gradient(135deg, #0d1b3e 0%, #1a3580 100%)";

export function modalHeaderBarStyle(headerBg) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 18px",
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
    boxShadow: "0 24px 80px rgba(13,27,62,0.28)",
    border: "1px solid #e1e8f5",
  }, extra || {});
}

export function modalBodyStyle(extra) {
  return Object.assign({
    padding: 24,
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
  }, extra || {});
}
