import React from "react";

var TONE_STYLES = {
  default: { bg: "#f0f4ff", color: "#475569" },
  muted: { bg: "#f1f5f9", color: "#64748b" },
  danger: { bg: "#fee2e2", color: "#dc2626" },
  ghost: { bg: "transparent", color: "#94a3b8" },
};

/** Centered × close/dismiss button — use wherever modal or panel dismiss icons misalign. */
export default function CloseIconButton(props) {
  var size = props.size != null ? props.size : 32;
  var tone = props.tone || "default";
  var toneStyle = TONE_STYLES[tone] || TONE_STYLES.default;
  var bg = props.bg != null ? props.bg : toneStyle.bg;
  var color = props.color != null ? props.color : toneStyle.color;
  var radius = props.borderRadius != null ? props.borderRadius : (size >= 34 ? 10 : 8);
  var fontSize = props.fontSize != null ? props.fontSize : (size >= 34 ? 18 : size <= 26 ? 14 : 16);

  return (
    <button
      type="button"
      onClick={props.onClick}
      onMouseDown={props.onMouseDown}
      disabled={props.disabled}
      aria-label={props.ariaLabel || "Close"}
      style={Object.assign({
        flexShrink: 0,
        border: "none",
        background: bg,
        borderRadius: radius,
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        padding: 0,
        margin: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: props.disabled ? "default" : "pointer",
        fontSize: fontSize,
        lineHeight: 1,
        color: color,
        fontWeight: 700,
        boxSizing: "border-box",
        fontFamily: "inherit",
        opacity: props.disabled ? 0.5 : 1,
      }, props.style || {})}
    >
      <span style={{ display: "block", marginTop: -1, pointerEvents: "none" }}>×</span>
    </button>
  );
}
