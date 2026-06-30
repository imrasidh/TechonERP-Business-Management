import React, { useMemo } from "react";
import { evaluateProductNameMatch, findSimilarProductNameCandidates } from "../utils/productNameMatch.js";

function relationLabel(relation) {
  if (relation === "exact") return "Exact match";
  if (relation === "same_core") return "Same product";
  if (relation === "subset") return "Likely same";
  return "Similar";
}

export default function ProductNameDuplicateHint(props) {
  var name = props.name;
  var products = props.products;
  var excludeId = props.excludeId;
  var C = props.C;

  var trimmed = String(name || "").trim();

  var candidates = useMemo(function () {
    if (trimmed.length < 2) return [];
    return findSimilarProductNameCandidates(trimmed, products, excludeId, 6);
  }, [trimmed, products, excludeId]);

  var blockResult = useMemo(function () {
    if (trimmed.length < 2) return null;
    return evaluateProductNameMatch(trimmed, products, excludeId);
  }, [trimmed, products, excludeId]);

  if (trimmed.length < 2) return null;

  var isExact = blockResult && blockResult.type === "exact";
  var isLikelySame = blockResult && blockResult.type === "likely_same";

  if (!candidates.length && !isExact && !isLikelySame) return null;

  var headerBg = isExact ? "#fef2f2" : isLikelySame ? "#fffbeb" : "#f0f9ff";
  var headerBorder = isExact ? "#fca5a5" : isLikelySame ? "#fcd34d" : "#93c5fd";
  var headerColor = isExact ? "#b91c1c" : isLikelySame ? "#92400e" : "#1d4ed8";

  return (
    <div style={{ marginTop: 6, borderRadius: 8, border: "1px solid " + headerBorder, overflow: "hidden", fontSize: 12, lineHeight: 1.45 }}>
      <div style={{ padding: "8px 10px", background: headerBg, color: headerColor, fontWeight: 700 }}>
        {isExact
          ? "Exact product name already exists — choose a different name or edit the existing product."
          : isLikelySame
            ? "This looks like a product you already have (same model, extra words):"
            : "Similar products already in inventory — check before saving:"}
      </div>
      <div style={{ background: "#fff" }}>
        {candidates.map(function (row) {
          var m = row.match;
          var rel = row.relation || m.relation;
          var rowBg = rel === "exact" ? "#fef2f2" : (rel === "same_core" || rel === "subset") ? "#fffbeb" : "#fff";
          return (
            <div
              key={m.id}
              style={{
                padding: "8px 10px",
                borderTop: "1px solid " + (C && C.borderLight ? C.borderLight : "#e5e7eb"),
                background: rowBg,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#111827", wordBreak: "break-word" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {[m.category, m.barcode, m.productId].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: rel === "exact" ? "#b91c1c" : (rel === "same_core" || rel === "subset") ? "#92400e" : "#2563eb",
                background: rel === "exact" ? "#fee2e2" : (rel === "same_core" || rel === "subset") ? "#fef3c7" : "#dbeafe",
                padding: "2px 7px",
                borderRadius: 999,
              }}>
                {relationLabel(rel)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
