import React from "react";

/**
 * Toolbar glyph — SVG for finance shortcuts, emoji/text otherwise.
 */
export function ToolbarGlyph(props) {
  var icon = props.icon;
  var color = props.color || "currentColor";
  var size = props.size || 15;

  if (icon === "svg:receivables") {
    /* Money in / collect — arrow down into tray */
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v11"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M8.2 10.5L12 14.3l3.8-3.8"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 16.5h15"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M6 16.5v2.2c0 .7.6 1.3 1.3 1.3h9.4c.7 0 1.3-.6 1.3-1.3v-2.2"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "svg:payables") {
    /* Money out / pay — arrow up from tray */
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21V10"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M8.2 13.5L12 9.7l3.8 3.8"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 7.5h15"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M6 7.5V5.3c0-.7.6-1.3 1.3-1.3h9.4c.7 0 1.3.6 1.3 1.3V7.5"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return <span className="erp-toolbar-emoji">{icon}</span>;
}

export function toolbarIconColor(key, bg) {
  if (key === "receivables") return "#15803d";
  if (key === "payables") return "#b91c1c";
  return undefined;
}
