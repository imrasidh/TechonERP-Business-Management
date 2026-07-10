import React from "react";
import {
  resolveCategorySelection,
  getSubCategoriesForGroup,
} from "../utils/categoryGroups.js";

/**
 * Two-dropdown category picker — main category group, then sub-category.
 * Product stores sub-category name in `category` field (onChange passes sub-category).
 */
export default function CategorySelect(props) {
  var value = props.value || "";
  var onChange = props.onChange;
  var settings = props.settings || {};
  var mainLabel = props.mainLabel || "Main Category";
  var subLabel = props.subLabel || "Sub Category";
  var Sel = props.Sel;
  var showHint = props.showHint !== false;

  var resolved = resolveCategorySelection(value, settings);
  var groups = resolved.groups;
  var groupId = resolved.groupId;
  var subOpts = getSubCategoriesForGroup(groupId, settings, value);
  var subValue = subOpts.indexOf(value) >= 0 ? value : subOpts[0];

  var emitSubChange = function (sub) {
    if (onChange) onChange({ target: { value: sub } });
  };

  var handleGroupChange = function (e) {
    var newGroupId = e.target.value;
    var grp = groups.find(function (g) { return g.id === newGroupId; });
    var firstSub = grp && grp.options.length ? grp.options[0] : "General";
    emitSubChange(firstSub);
  };

  var handleSubChange = function (e) {
    emitSubChange(e.target.value);
  };

  var hint = props.hint;
  if (!hint && showHint && groups.length === 0) {
    hint = "Enable category groups in Settings → Categories (Main PC).";
  }

  var focusSubAfterGroupChange = !!props.focusSubAfterGroupChange;
  var onSubSelected = props.onSubSelected;
  var mainSelectProps = props.mainSelectProps || {};
  var subSelectProps = props.subSelectProps || {};

  var mainSelect = (
    <Sel
      label={mainLabel}
      value={groupId}
      onChange={function (e) {
        handleGroupChange(e);
        if (focusSubAfterGroupChange && subSelectProps.id) {
          setTimeout(function () {
            var el = document.getElementById(subSelectProps.id);
            if (el && typeof el.focus === "function") el.focus();
          }, 0);
        }
      }}
      disabled={!groups.length}
      {...mainSelectProps}
    >
      {groups.length === 0 && <option value="">—</option>}
      {groups.map(function (grp) {
        return (
          <option key={grp.id} value={grp.id}>
            {(grp.emoji ? grp.emoji + " " : "") + grp.label}
          </option>
        );
      })}
    </Sel>
  );

  var subSelect = (
    <Sel
      label={subLabel}
      value={subValue}
      onChange={function (e) {
        handleSubChange(e);
        if (typeof onSubSelected === "function") onSubSelected(e.target.value);
      }}
      disabled={!groups.length}
      {...subSelectProps}
    >
      {subOpts.map(function (c) {
        return <option key={groupId + "-" + c} value={c}>{c}</option>;
      })}
    </Sel>
  );

  return (
    <div style={Object.assign({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, props.gridStyle || {})}>
      {mainSelect}
      {subSelect}
      {hint ? (
        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: props.hintColor || "#64748b", lineHeight: 1.45 }}>{hint}</div>
      ) : null}
    </div>
  );
}
