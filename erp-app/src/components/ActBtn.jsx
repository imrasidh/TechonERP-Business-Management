import React from "react";

function ActIcon(props) {
  var size = props.size || 12;
  var strokeWidth = props.strokeWidth || 2.2;
  var children = props.children;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

var ICONS = {
  view: (
    <ActIcon>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </ActIcon>
  ),
  edit: (
    <ActIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </ActIcon>
  ),
  damage: (
    <ActIcon>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </ActIcon>
  ),
  void: (
    <ActIcon strokeWidth={2.4}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </ActIcon>
  ),
  delete: (
    <ActIcon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </ActIcon>
  ),
  restore: (
    <ActIcon>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </ActIcon>
  ),
  return: (
    <ActIcon>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 00-4-4H4" />
    </ActIcon>
  ),
  clear: (
    <ActIcon strokeWidth={2.4}>
      <polyline points="20 6 9 17 4 12" />
    </ActIcon>
  ),
  refresh: (
    <ActIcon>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </ActIcon>
  ),
  pay: (
    <ActIcon>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </ActIcon>
  ),
};

var TONE_ICON = {
  cyan: "view",
  blue: "edit",
  orange: "damage",
  red: "void",
  green: "restore",
  purple: "edit",
  gray: "edit",
};

export function ActBtn(props) {
  var tone = props.tone || props.col || "cyan";
  var wide = props.wide;
  var hasChildren = props.children != null && props.children !== false && props.children !== "";
  var iconKey = props.icon || TONE_ICON[tone] || "view";
  var content = hasChildren ? props.children : (ICONS[iconKey] || ICONS.view);
  var userStyle = props.style || {};
  var rest = Object.assign({}, props);
  delete rest.tone; delete rest.col; delete rest.wide; delete rest.compact; delete rest.children; delete rest.style; delete rest.icon;
  var mergedClass = ["erp-act-btn", "erp-act-btn--" + tone, wide ? "erp-act-btn--wide" : null, props.className].filter(Boolean).join(" ");
  delete rest.className;
  return (
    <button
      {...rest}
      type={props.type != null ? props.type : "button"}
      className={mergedClass}
      style={Object.assign({
        opacity: props.disabled ? 0.4 : undefined,
        cursor: props.disabled ? "not-allowed" : "pointer",
      }, userStyle)}
    >{content}</button>
  );
}

export function ActBtnGroup(props) {
  var align = props.align || "right";
  var gap = props.gap != null ? props.gap : 4;
  return (
    <div
      className="erp-act-group"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        gap: gap,
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
