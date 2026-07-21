import React, { useEffect, useMemo, useState } from "react";
import { evaluateProductNameMatch, findSimilarProductNameCandidates } from "../utils/productNameMatch.js";
import CloseIconButton from "./CloseIconButton.jsx";

function relationLabel(relation) {
  if (relation === "exact") return "Exact match";
  if (relation === "same_core") return "Same product";
  if (relation === "subset") return "Likely same";
  return "Similar";
}

/** Focus / blur / dismiss state for the live name hint panel. */
export function useProductNameHintControls(name) {
  var [focused, setFocused] = useState(false);
  var [dismissed, setDismissed] = useState(false);
  var trimmed = String(name || "").trim();

  useEffect(function () {
    setDismissed(false);
  }, [trimmed]);

  return {
    visible: focused && !dismissed,
    onNameFocus: function () { setFocused(true); },
    onNameBlur: function () { setFocused(false); },
    onDismiss: function () { setDismissed(true); },
  };
}

export default function ProductNameDuplicateHint(props) {
  var name = props.name;
  var products = props.products;
  var excludeId = props.excludeId;
  var C = props.C;
  var visible = props.visible !== false;
  var compact = !!props.compact;

  var trimmed = String(name || "").trim();

  var candidates = useMemo(function () {
    if (trimmed.length < 2) return [];
    return findSimilarProductNameCandidates(trimmed, products, excludeId, 6);
  }, [trimmed, products, excludeId]);

  var blockResult = useMemo(function () {
    if (trimmed.length < 2) return null;
    return evaluateProductNameMatch(trimmed, products, excludeId);
  }, [trimmed, products, excludeId]);

  if (!visible || trimmed.length < 2) return null;

  var isExact = blockResult && blockResult.type === "exact";
  var isLikelySame = blockResult && blockResult.type === "likely_same";

  if (!candidates.length && !isExact && !isLikelySame) return null;

  /* Teal for similar (stands out from blue form UI); red / amber for blocking cases */
  var tone = isExact ? "exact" : isLikelySame ? "likely" : "similar";
  var tones = {
    exact: {
      border: "#f87171",
      headerBg: "linear-gradient(135deg, #fef2f2 0%, #ffe4e6 100%)",
      headerColor: "#991b1b",
      accent: "#dc2626",
      chipBg: "#fee2e2",
      chipColor: "#b91c1c",
      rowBg: "#fff5f5",
    },
    likely: {
      border: "#f59e0b",
      headerBg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      headerColor: "#92400e",
      accent: "#d97706",
      chipBg: "#fef3c7",
      chipColor: "#92400e",
      rowBg: "#fffbeb",
    },
    similar: {
      border: "#2dd4bf",
      headerBg: "linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
      headerColor: "#0f766e",
      accent: "#0d9488",
      chipBg: "#ccfbf1",
      chipColor: "#0f766e",
      rowBg: "#f0fdfa",
    },
  };
  var t = tones[tone];

  var wrapClass =
    "erp-prod-name-hint erp-prod-name-hint--" + tone + (compact ? " erp-prod-name-hint--compact" : "");

  return (
    <div
      className={wrapClass}
      style={{
        marginTop: compact ? 4 : 6,
        borderRadius: compact ? 8 : 10,
        border: "1.5px solid " + t.border,
        overflow: "hidden",
        fontSize: compact ? 11.5 : 12,
        lineHeight: 1.4,
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div
        className="erp-prod-name-hint-hdr"
        style={{
          padding: compact ? "7px 10px" : "9px 12px",
          background: t.headerBg,
          color: t.headerColor,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minHeight: compact ? 32 : 38,
          borderBottom: "1px solid " + t.border,
        }}
      >
        <span style={{ flex: 1, lineHeight: 1.35, paddingRight: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: t.accent,
              marginRight: 7,
              verticalAlign: "middle",
              boxShadow: "0 0 0 3px " + t.chipBg,
            }}
            aria-hidden="true"
          />
          {isExact
            ? "Exact product name already exists — choose a different name or edit the existing product."
            : isLikelySame
              ? "This looks like a product you already have (same model, extra words):"
              : "Similar products already in inventory — check before saving:"}
        </span>
        {props.onDismiss && (
          <CloseIconButton
            onMouseDown={function (e) { e.preventDefault(); }}
            onClick={props.onDismiss}
            ariaLabel="Close suggestions"
            size={compact ? 22 : 26}
            bg="rgba(255,255,255,0.85)"
            color={t.headerColor}
          />
        )}
      </div>
      <div className="erp-prod-name-hint-list" style={{ background: "#fff", maxHeight: compact ? 148 : 180, overflowY: "auto" }}>
        {candidates.map(function (row) {
          var m = row.match;
          var rel = row.relation || m.relation;
          var rowTone =
            rel === "exact" ? tones.exact
              : (rel === "same_core" || rel === "subset") ? tones.likely
                : tones.similar;
          return (
            <div
              key={m.id}
              className="erp-prod-name-hint-row"
              style={{
                padding: compact ? "6px 10px" : "8px 10px",
                borderTop: "1px solid " + (C && C.borderLight ? C.borderLight : "#e5e7eb"),
                background: rowTone.rowBg,
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word", fontSize: compact ? 12 : 12.5 }}>{m.name}</div>
                <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 1 }}>
                  {[m.category, m.barcode, m.productId].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 9.5,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: rowTone.chipColor,
                  background: rowTone.chipBg,
                  border: "1px solid " + rowTone.border,
                  padding: "2px 7px",
                  borderRadius: 999,
                }}
              >
                {relationLabel(rel)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
