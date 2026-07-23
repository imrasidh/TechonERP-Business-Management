import React, { useState, useRef } from "react";
import {
  TOOLBAR_CATALOG,
  getToolbarCatalogItem,
  getDefaultToolbarKeys,
  reorderToolbarKeys,
  addToolbarKey,
  removeToolbarKey,
  TOOLBAR_PINNED_KEYS,
} from "../utils/toolbarConfig.js";
import { ToolbarGlyph, toolbarIconColor } from "./ToolbarGlyph.jsx";

var GROUP_LABELS = {
  main: "Main",
  finance: "Finance",
  cash: "Cash",
  people: "People",
  ops: "Operations",
  tools: "Tools",
  sys: "System",
};

/**
 * Wide/compact toolbar editor with live mockup.
 * Controlled: keys + onChange(keys).
 * One click on mockup removes; one click on catalog toggles add/remove.
 * Drag mockup buttons to reorder.
 */
export default function ToolbarCustomizePanel(props) {
  var keys = Array.isArray(props.keys) ? props.keys : getDefaultToolbarKeys();
  var onChange = typeof props.onChange === "function" ? props.onChange : function () {};
  var C = props.C || {
    text: "#0f172a",
    muted: "#64748b",
    border: "#e2e8f0",
    accent: "#3949ab",
    accentSoft: "#eef2ff",
  };

  var [dragFrom, setDragFrom] = useState(null);
  var [dragOver, setDragOver] = useState(null);
  var dragFromRef = useRef(null);

  var used = {};
  keys.forEach(function (k) { used[k] = true; });

  var clearDrag = function () {
    dragFromRef.current = null;
    setDragFrom(null);
    setDragOver(null);
  };

  var toggleKey = function (key) {
    if (TOOLBAR_PINNED_KEYS.indexOf(key) >= 0) return;
    if (used[key]) onChange(removeToolbarKey(keys, key));
    else onChange(addToolbarKey(keys, key));
  };

  var catalogGroups = [];
  var groupSeen = {};
  TOOLBAR_CATALOG.forEach(function (item) {
    if (item.key === "exit") return;
    var g = item.group || "main";
    if (!groupSeen[g]) {
      groupSeen[g] = true;
      catalogGroups.push(g);
    }
  });

  return (
    <div className="erp-tb-customize">
      <div className="erp-tb-customize-hint" style={{ color: C.muted }}>
        Preview is your toolbar. Click a button to remove · click a module below to add or remove · drag to reorder.
      </div>

      <div className="erp-tb-customize-section">
        <div className="erp-tb-customize-label" style={{ color: C.muted }}>
          Toolbar preview
          <span className="erp-tb-customize-count">{keys.length} items</span>
        </div>
        <div className="erp-tb-mock" role="list" aria-label="Toolbar preview">
          {keys.map(function (key, idx) {
            var item = getToolbarCatalogItem(key);
            if (!item) return null;
            var pinned = TOOLBAR_PINNED_KEYS.indexOf(key) >= 0;
            var isDragging = dragFrom === idx;
            var isDropTarget = dragOver === idx && dragFrom !== null && dragFrom !== idx && !pinned;
            var prev = idx > 0 ? getToolbarCatalogItem(keys[idx - 1]) : null;
            var showSep = prev && prev.group && item.group && prev.group !== item.group;

            return (
              <React.Fragment key={key}>
                {showSep ? <div className="erp-toolbar-spacer" aria-hidden="true" /> : null}
                <button
                  type="button"
                  role="listitem"
                  className={
                    "erp-toolbar-btn erp-tb-mock-btn"
                    + (pinned ? " is-pinned" : "")
                    + (isDragging ? " is-dragging" : "")
                    + (isDropTarget ? " is-drop" : "")
                    + (item.exit ? " exit" : "")
                  }
                  title={pinned ? item.label + " (pinned)" : "Click to remove · drag to reorder"}
                  draggable={!pinned}
                  onDragStart={function (e) {
                    if (pinned) {
                      e.preventDefault();
                      return;
                    }
                    dragFromRef.current = idx;
                    setDragFrom(idx);
                    try {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", key);
                    } catch (err) { /* ignore */ }
                  }}
                  onDragEnd={clearDrag}
                  onDragOver={function (e) {
                    if (dragFromRef.current === null || pinned) return;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = "move"; } catch (err) { /* ignore */ }
                    if (dragOver !== idx) setDragOver(idx);
                  }}
                  onDragLeave={function () {
                    if (dragOver === idx) setDragOver(null);
                  }}
                  onDrop={function (e) {
                    e.preventDefault();
                    var from = dragFromRef.current;
                    if (from === null || pinned) {
                      clearDrag();
                      return;
                    }
                    onChange(reorderToolbarKeys(keys, from, idx));
                    clearDrag();
                  }}
                  onClick={function () {
                    if (pinned) return;
                    onChange(removeToolbarKey(keys, key));
                  }}
                >
                  <span
                    className={"erp-toolbar-icon" + (String(item.icon || "").indexOf("svg:") === 0 ? " is-svg" : "")}
                    style={{ background: item.bg || "#f0f0f0", color: toolbarIconColor(item.key) || undefined }}
                    aria-hidden="true"
                  >
                    <ToolbarGlyph icon={item.icon} color={toolbarIconColor(item.key) || "#334155"} />
                  </span>
                  <span className="erp-toolbar-label">{item.label}</span>
                  {!pinned ? <span className="erp-tb-mock-x" aria-hidden="true">×</span> : null}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="erp-tb-customize-section">
        <div className="erp-tb-customize-label" style={{ color: C.muted }}>
          Modules
          <span className="erp-tb-customize-count">one click to add or remove</span>
        </div>
        <div className="erp-tb-catalog">
          {catalogGroups.map(function (groupName) {
            var items = TOOLBAR_CATALOG.filter(function (c) {
              return c.group === groupName && c.key !== "exit";
            });
            if (!items.length) return null;
            return (
              <div key={groupName} className="erp-tb-catalog-group">
                <div className="erp-tb-catalog-group-title" style={{ color: C.muted }}>
                  {GROUP_LABELS[groupName] || groupName}
                </div>
                <div className="erp-tb-catalog-row">
                  {items.map(function (item) {
                    var on = !!used[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={"erp-tb-catalog-btn" + (on ? " is-on" : "")}
                        title={on ? "Remove from toolbar" : "Add to toolbar"}
                        onClick={function () { toggleKey(item.key); }}
                      >
                        <span
                          className={"erp-tb-catalog-ico" + (String(item.icon || "").indexOf("svg:") === 0 ? " is-svg" : "")}
                          style={{ background: item.bg || "#f1f5f9", color: toolbarIconColor(item.key) || undefined }}
                          aria-hidden="true"
                        >
                          <ToolbarGlyph icon={item.icon} size={14} color={toolbarIconColor(item.key) || "#334155"} />
                        </span>
                        <span className="erp-tb-catalog-name">{item.label}</span>
                        <span className="erp-tb-catalog-mark" aria-hidden="true">{on ? "✓" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="erp-tb-customize-actions">
        <button
          type="button"
          className="erp-tb-customize-reset"
          onClick={function () { onChange(getDefaultToolbarKeys()); }}
          style={{ borderColor: C.border, color: C.muted }}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

export { TOOLBAR_CATALOG };
