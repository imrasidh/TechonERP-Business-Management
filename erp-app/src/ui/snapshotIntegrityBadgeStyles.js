/**
 * Shared snapshot integrity badge styles (aligned with App.jsx theme C: successSoft, dangerSoft, neutrals).
 * Icons (✔ ○ ⚠) use SNAPSHOT_INTEGRITY_ICON tint; label text uses badge color — not color-only.
 */

export var SNAPSHOT_INTEGRITY_TITLE = {
  sealed: "Integrity verified: snapshot is sealed with a content hash.",
  legacy: "Older snapshot without a seal — saved before hash sealing was added.",
  failed: "Warning: stored hash does not match snapshot data — treat as unverified.",
};

/** Soft pill backgrounds + high-contrast label text (unchanged) */
export var SNAPSHOT_INTEGRITY_BADGE = {
  sealed: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#e6f7f2",
    color: "#0a5238",
    border: "1px solid #9fd4bc",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  legacy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eef2f7",
    color: "#3d5280",
    border: "1px solid #cfd8e6",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  failed: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.35,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fde8ed",
    color: "#9f1239",
    border: "1px solid #f0b8c8",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  },
};

/**
 * Slight tint on the glyph only (✔ ○ ⚠); label text uses SNAPSHOT_INTEGRITY_BADGE.*.color.
 * Kept muted — not full saturation.
 */
export var SNAPSHOT_INTEGRITY_ICON = {
  sealed: { color: "#2a8f62", flexShrink: 0 },
  legacy: { color: "#6a7d96", flexShrink: 0 },
  failed: { color: "#c44a66", flexShrink: 0 },
};
