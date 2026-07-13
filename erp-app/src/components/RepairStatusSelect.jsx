import React from "react";

var STATUS_DISPLAY = {
  Accepted: "Active",
  "Third Party": "3rd Party",
  Ready: "Ready",
  Delivered: "Delivered",
  Returned: "Returned",
};

var STATUS_STYLE = {
  Accepted: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  "Third Party": { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  Ready: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  Delivered: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  Returned: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
};

export function getRepairDeviceStatusOptions(currentStatus) {
  var st = currentStatus || "Accepted";
  if (st === "Accepted") {
    return [
      { value: "Ready", label: "Mark as Ready" },
      { value: "Third Party", label: "Send to 3rd Party" },
      { value: "Returned", label: "Mark as Returned" },
    ];
  }
  if (st === "Third Party") {
    return [
      { value: "__receive__", label: "Received from 3rd Party" },
      { value: "Accepted", label: "Back to Active" },
      { value: "Returned", label: "Mark as Returned" },
    ];
  }
  if (st === "Ready") {
    return [
      { value: "Accepted", label: "Back to Active" },
      { value: "Returned", label: "Mark as Returned" },
      { value: "__invoice__", label: "Convert to Invoice" },
    ];
  }
  if (st === "Returned") {
    return [{ value: "Accepted", label: "Back to Active" }];
  }
  if (st === "Delivered") {
    return [{ value: "__void__", label: "Void Invoice" }];
  }
  return [];
}

export function getRepairBulkStatusOptions() {
  return [
    { value: "Third Party", label: "Send all to 3rd Party" },
    { value: "Returned", label: "Mark all as returned" },
  ];
}

export function RepairStatusSelect(props) {
  var st = props.currentStatus || "Accepted";
  var pal = STATUS_STYLE[st] || STATUS_STYLE.Accepted;
  var options = props.options || getRepairDeviceStatusOptions(st);
  var label = STATUS_DISPLAY[st] || st;
  var compact = !!props.compact;
  var selectRef = React.useRef(null);

  var handleChange = function (e) {
    var next = e.target.value;
    if (!next || !props.onAction) return;
    if (selectRef.current) selectRef.current.value = "";
    props.onAction(next);
  };

  return (
    <select
      ref={selectRef}
      defaultValue=""
      title={"Current status: " + label + ". Choose a new status."}
      onChange={handleChange}
      style={{
        height: compact ? 30 : 34,
        minWidth: compact ? 132 : 150,
        maxWidth: compact ? 168 : 200,
        padding: compact ? "0 26px 0 10px" : "0 28px 0 12px",
        borderRadius: 8,
        border: "1px solid " + pal.border,
        background: pal.bg + " url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 8px center",
        backgroundSize: "12px",
        color: pal.color,
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        outline: "none",
        lineHeight: 1.2,
      }}
    >
      <option value="" disabled style={{ color: pal.color, fontWeight: 700 }}>{label}</option>
      {options.map(function (opt) {
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}
