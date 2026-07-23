import React from "react";

var TONES = {
  ready: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  thirdParty: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  active: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  returned: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
  received: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  edit: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  print: { bg: "#f0f9ff", color: "#0369a1", border: "#bae6fd" },
  invoice: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  danger: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  neutral: { bg: "#f8fafc", color: "#475569", border: "#e2e8f0" },
};

export function RepairActionBtn(props) {
  var tone = props.tone || "neutral";
  var pal = TONES[tone] || TONES.neutral;
  var sm = !!props.sm;
  var children = props.children;
  var rest = Object.assign({}, props);
  delete rest.tone;
  delete rest.sm;
  delete rest.children;
  var extraClass = rest.className || "";
  delete rest.className;
  return (
    <button
      {...rest}
      type={props.type != null ? props.type : "button"}
      className={"erp-rep-action-btn tone-" + tone + (sm ? " is-sm" : "") + (extraClass ? " " + extraClass : "")}
      style={{
        height: sm ? "auto" : 32,
        minHeight: sm ? 28 : 32,
        padding: sm ? "6px 10px" : "0 12px",
        borderRadius: 8,
        border: "1px solid " + pal.border,
        background: pal.bg,
        color: pal.color,
        fontSize: sm ? 10.5 : 12,
        fontWeight: 600,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        flexShrink: 0,
        fontFamily: "inherit",
        lineHeight: 1.3,
        whiteSpace: "normal",
        textAlign: "center",
        maxWidth: sm ? 168 : 220,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={function (e) {
        if (props.disabled) return;
        e.currentTarget.style.filter = "brightness(0.97)";
      }}
      onMouseLeave={function (e) {
        e.currentTarget.style.filter = "none";
      }}
    >{children}</button>
  );
}

export function RepairActionGroup(props) {
  var gap = props.gap != null ? props.gap : 6;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: gap,
      }}
    >{props.children}</div>
  );
}
