import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { buildPrintFmtOptions, getEnabledPrintFormats, pageFormatMeta } from "../utils/printFormat.js";

/**
 * Shared print-format chooser — buttons follow Settings enable toggles (A4 / A5 / 58mm / 80mm).
 */
var PrintFormatChooser = function (props) {
  var open = props.open === true;
  var onClose = props.onClose || function () {};
  var onSelect = props.onSelect || function () {};
  var title = props.title || "Choose print format";
  var hint = props.hint || "Select the paper size for your printer.";
  var settings = props.settings || {};
  var zIndex = props.zIndex || 12000;

  var options = useMemo(function () {
    if (Array.isArray(props.options) && props.options.length) return props.options;
    return buildPrintFmtOptions(settings);
  }, [props.options, settings]);

  var defs = useMemo(function () {
    return getEnabledPrintFormats(settings);
  }, [settings]);

  useEffect(function () {
    if (!open) return undefined;
    var onKey = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      var k = String(e.key || "");
      var idx = parseInt(k, 10);
      if (idx >= 1 && idx <= options.length) {
        e.preventDefault();
        onSelect(options[idx - 1][0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [open, onClose, onSelect, options]);

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

        {options.map(function (opt, i) {
          var id = opt[0];
          var shortLabel = opt[1];
          var def = defs.find(function (d) { return d.id === id; });
          var meta = pageFormatMeta(id);
          var kindClass = meta.isThermal ? "is-thermal" : ("is-" + id);
          return (
            <button
              key={id}
              type="button"
              className={"erp-print-fmt-btn " + kindClass}
              onClick={function () { onSelect(id); }}
            >
              <span>
                <span className="erp-print-fmt-main">{def ? def.label : shortLabel}</span>
                <span className="erp-print-fmt-sub">{def ? def.sub : ""}</span>
              </span>
              <kbd>{i + 1}</kbd>
            </button>
          );
        })}
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
