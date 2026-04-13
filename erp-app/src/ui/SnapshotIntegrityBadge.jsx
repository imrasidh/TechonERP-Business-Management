import React, { useId, useLayoutEffect, useRef, useState } from "react";
import {
  SNAPSHOT_INTEGRITY_BADGE,
  SNAPSHOT_INTEGRITY_ICON,
  SNAPSHOT_INTEGRITY_TITLE,
} from "./snapshotIntegrityBadgeStyles.js";

var LABEL = {
  sealed: "Snapshot sealed",
  legacy: "Legacy (unsealed)",
  failed: "Integrity check failed",
};

var GLYPH = { sealed: "✔", legacy: "○", failed: "⚠" };

var DESCRIBEDBY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

var LABEL_ELLIPSIS = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
  flex: "1 1 auto",
};

/**
 * Keyboard-focusable integrity badge: visible label unchanged.
 * Prefer aria-describedby + hidden description; if that node is not reliably
 * mounted, fall back to aria-label (descriptive text only — not both).
 *
 * liveStatus — when true, sets role="status" so updates can be announced in
 * supporting AT; omit for static / illustrative badges to avoid extra noise.
 */
export function SnapshotIntegrityBadge(props) {
  var reactId = useId();
  var descId = "tc-snap-desc-" + reactId.replace(/:/g, "");
  var descRef = useRef(null);
  var [describedByOk, setDescribedByOk] = useState(true);
  var variant = props.variant;
  var base = SNAPSHOT_INTEGRITY_BADGE[variant];
  var icon = SNAPSHOT_INTEGRITY_ICON[variant];
  var title = SNAPSHOT_INTEGRITY_TITLE[variant];
  var valid = !!(base && icon && title);

  useLayoutEffect(function () {
    if (!valid) return;
    if (typeof document === "undefined") {
      setDescribedByOk(false);
      return;
    }
    var el = descRef.current;
    var ok = !!(el && el.isConnected && document.getElementById(descId) === el);
    setDescribedByOk(ok);
  }, [descId, title, variant, valid]);

  if (!valid) return null;

  var style = Object.assign({}, base, {
    position: "relative",
    maxWidth: "min(100%, 280px)",
    minWidth: 0,
    alignSelf: "flex-start",
  });

  var useAriaLabelFallback = !describedByOk;
  var liveStatus = props.liveStatus === true;

  return (
    <span
      className="tc-snapshot-badge"
      tabIndex={0}
      role={liveStatus ? "status" : undefined}
      title={title}
      aria-label={useAriaLabelFallback ? title : undefined}
      aria-describedby={useAriaLabelFallback ? undefined : descId}
      style={style}
    >
      <span style={icon} aria-hidden="true">
        {GLYPH[variant]}
      </span>
      <span style={LABEL_ELLIPSIS} aria-hidden={useAriaLabelFallback || undefined}>
        {LABEL[variant]}
      </span>
      {!useAriaLabelFallback && (
        <span ref={descRef} id={descId} style={DESCRIBEDBY_HIDDEN}>
          {title}
        </span>
      )}
    </span>
  );
}
