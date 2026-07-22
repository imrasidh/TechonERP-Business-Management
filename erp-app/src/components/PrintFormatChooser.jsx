import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { resolveThermalFormat } from "../utils/printFormat.js";

/**
 * Shared print-format chooser: A4 / A5 / Thermal.
 * Used by View & Print overlays and Sales print picker.
 */
var PrintFormatChooser = function (props) {
  var open = props.open === true;
  var onClose = props.onClose || function () {};
  var onSelect = props.onSelect || function () {};
  var title = props.title || "Choose print format";
  var hint = props.hint || "Select the paper size for your printer.";
  var settings = props.settings || {};
  var zIndex = props.zIndex || 12000;
  var thermalId = props.thermalId || resolveThermalFormat(settings);
  var thermalLabel = thermalId === "thermal58" ? "Thermal 58mm" : "Thermal 80mm";

  useEffect(function () {
    if (!open) return undefined;
    var onKey = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      var k = String(e.key || "").toLowerCase();
      if (k === "1" || k === "a") {
        e.preventDefault();
        onSelect("a4");
      } else if (k === "2" || k === "5") {
        e.preventDefault();
        onSelect("a5");
      } else if (k === "3" || k === "t") {
        e.preventDefault();
        onSelect(thermalId);
      }
    };
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [open, onClose, onSelect, thermalId]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="erp-print-fmt-overlay"
      style={{ zIndex: zIndex }}
      role="presentation"
      onMouseDown={function (e) {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="erp-print-fmt-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="erp-print-fmt-title">{title}</div>
        <div className="erp-print-fmt-hint">{hint}</div>

        <button type="button" className="erp-print-fmt-btn is-a4" onClick={function () { onSelect("a4"); }}>
          <span>
            <span className="erp-print-fmt-main">A4</span>
            <span className="erp-print-fmt-sub">Standard page · letter / reports</span>
          </span>
          <kbd>1</kbd>
        </button>
        <button type="button" className="erp-print-fmt-btn is-a5" onClick={function () { onSelect("a5"); }}>
          <span>
            <span className="erp-print-fmt-main">A5</span>
            <span className="erp-print-fmt-sub">Half page · compact invoices</span>
          </span>
          <kbd>2</kbd>
        </button>
        <button type="button" className="erp-print-fmt-btn is-thermal" onClick={function () { onSelect(thermalId); }}>
          <span>
            <span className="erp-print-fmt-main">{thermalLabel}</span>
            <span className="erp-print-fmt-sub">Receipt printer</span>
          </span>
          <kbd>3</kbd>
        </button>
        <button type="button" className="erp-print-fmt-btn is-cancel" onClick={onClose}>
          <span className="erp-print-fmt-main">Cancel</span>
          <kbd>Esc</kbd>
        </button>
      </div>
    </div>,
    document.body
  );
};

export default PrintFormatChooser;
