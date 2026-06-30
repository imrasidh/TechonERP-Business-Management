import React from "react";

var ACT_PALETTES = {
  cyan: { bg: "#f0f9ff", color: "#0369a1", border: "#bae6fd" },
  green: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  blue: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  orange: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  red: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  gray: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  purple: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
};

export function ActBtn(props) {
  var tone = props.tone || props.col || "cyan";
  var pal = ACT_PALETTES[tone] || ACT_PALETTES.cyan;
  var wide = props.wide;
  var compact = props.compact !== false;
  var children = props.children;
  var rest = Object.assign({}, props);
  delete rest.tone; delete rest.col; delete rest.wide; delete rest.compact; delete rest.children;
  return (
    <button
      {...rest}
      type={props.type != null ? props.type : "button"}
      style={{
        height: 28,
        minWidth: wide ? 42 : 28,
        padding: wide ? "0 9px" : 0,
        borderRadius: 7,
        border: "1px solid " + pal.border,
        background: pal.bg,
        color: pal.color,
        fontSize: wide ? 11 : (compact ? 13 : 12),
        fontWeight: 700,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "inherit",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >{children}</button>
  );
}

export function ActBtnGroup(props) {
  var align = props.align || "right";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        gap: 4,
        flexWrap: "nowrap",
      }}
      onClick={props.onClick}
    >{props.children}</div>
  );
}

export var actBtnCellStyle = {
  padding: "8px 12px",
  verticalAlign: "middle",
  textAlign: "right",
  whiteSpace: "nowrap",
};
