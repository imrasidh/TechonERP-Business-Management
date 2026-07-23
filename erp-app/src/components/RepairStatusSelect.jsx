import React, { useEffect, useRef, useState } from "react";

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
  Returned: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};

var ACTION_STYLE = {
  Accepted: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  "Third Party": { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  Ready: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  Delivered: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  Returned: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
  /* Receive from 3P → Ready path */
  __receive__: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  __invoice__: { bg: "#ecfeff", color: "#0e7490", border: "#a5f3fc" },
  __void__: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};

var ACTION_COLOR = {
  Accepted: "#c2410c",
  "Third Party": "#6d28d9",
  Ready: "#047857",
  Delivered: "#1d4ed8",
  Returned: "#b91c1c",
  __receive__: "#047857",
  __invoice__: "#0e7490",
  __void__: "#b91c1c",
};

function styleForAction(value) {
  var pal = ACTION_STYLE[value] || STATUS_STYLE[value] || { bg: "#f8fafc", color: "#334155", border: "#e2e8f0" };
  var color = pal.color || ACTION_COLOR[value] || "#334155";
  return { bg: pal.bg || "#f8fafc", color: color, border: pal.border || "#e2e8f0", dot: color };
}

export function getRepairDeviceStatusOptions(currentStatus) {
  var st = currentStatus || "Accepted";
  if (st === "Accepted") {
    return [
      { value: "Ready", label: "Ready" },
      { value: "Third Party", label: "Send 3P" },
      { value: "Returned", label: "Return" },
    ];
  }
  if (st === "Third Party") {
    return [
      { value: "__receive__", label: "Receive" },
      { value: "Accepted", label: "Active" },
      { value: "Returned", label: "Return" },
    ];
  }
  if (st === "Ready") {
    return [
      { value: "Accepted", label: "Active" },
      { value: "Returned", label: "Return" },
      { value: "__invoice__", label: "Invoice" },
    ];
  }
  if (st === "Returned") {
    return [{ value: "Accepted", label: "Active" }];
  }
  if (st === "Delivered") {
    return [{ value: "__void__", label: "Void" }];
  }
  return [];
}

export function getRepairEditStatusOptions(currentStatus) {
  var st = currentStatus || "Accepted";
  return ["Accepted", "Third Party", "Ready", "Returned"]
    .filter(function (s) { return s !== st; })
    .filter(function (s) {
      if (st === "Delivered") return false;
      if (s === "Third Party" && st !== "Accepted") return false;
      return true;
    })
    .map(function (s) {
      return { value: s, label: STATUS_DISPLAY[s] || s };
    });
}

export function getRepairBulkStatusOptions() {
  return [
    { value: "Third Party", label: "Send all 3P" },
    { value: "Returned", label: "Return all" },
  ];
}

export function RepairStatusSelect(props) {
  var st = props.currentStatus || "Accepted";
  var pal = STATUS_STYLE[st] || STATUS_STYLE.Accepted;
  var options = (props.options || getRepairDeviceStatusOptions(st)).filter(function (opt) {
    if (!opt || !opt.value) return false;
    if (opt.value === st) return false;
    var display = STATUS_DISPLAY[st] || st;
    if (opt.label === display || opt.label === st) return false;
    return true;
  });
  var label = STATUS_DISPLAY[st] || st;
  var compact = !!props.compact;
  var [open, setOpen] = useState(false);
  var [menuPos, setMenuPos] = useState(null);
  var rootRef = useRef(null);
  var btnRef = useRef(null);

  useEffect(function () {
    if (!open) return;
    var place = function () {
      if (!btnRef.current) return;
      var rect = btnRef.current.getBoundingClientRect();
      var width = Math.max(compact ? 132 : 148, rect.width + 8);
      var left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      var top = rect.bottom + 4;
      var approxHeight = 8 + options.length * 34;
      if (top + approxHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - approxHeight - 2);
      }
      setMenuPos({ top: top, left: left, width: width });
    };
    place();
    var onDoc = function (e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    var onKey = function (e) {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return function () {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, compact, options.length]);

  var pick = function (value) {
    setOpen(false);
    if (!value || !props.onAction) return;
    props.onAction(value);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block", minWidth: compact ? 96 : 108 }}>
      <button
        ref={btnRef}
        type="button"
        className="erp-rep-status-btn"
        title={"Status: " + label}
        onClick={function () { setOpen(function (v) { return !v; }); }}
        style={{
          height: compact ? 26 : 28,
          minWidth: compact ? 96 : 108,
          width: "100%",
          padding: "0 18px 0 8px",
          borderRadius: 6,
          border: "1px solid " + pal.border,
          background: pal.bg + " url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 6px center",
          backgroundSize: "10px",
          color: pal.color,
          fontSize: compact ? 11 : 11.5,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
          outline: "none",
          lineHeight: 1,
          textAlign: "left",
        }}
      >
        {label}
      </button>
      {open && menuPos ? (
        <div
          className="erp-rep-status-menu"
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 5000,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 9,
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.16)",
            padding: 5,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "6px 8px", fontSize: 11, color: "#64748b" }}>No actions</div>
          ) : (
            options.map(function (opt) {
              var a = styleForAction(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="erp-rep-status-menu-item"
                  onClick={function () { pick(opt.value); }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    textAlign: "left",
                    border: "1px solid " + a.border,
                    background: a.bg,
                    color: a.color,
                    borderRadius: 6,
                    padding: "7px 9px",
                    fontSize: compact ? 11 : 11.5,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    lineHeight: 1.2,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
                    transition: "filter 0.12s ease, transform 0.12s ease",
                  }}
                  onMouseEnter={function (e) {
                    e.currentTarget.style.filter = "brightness(0.97)";
                    e.currentTarget.style.transform = "translateY(-0.5px)";
                  }}
                  onMouseLeave={function (e) {
                    e.currentTarget.style.filter = "none";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: a.dot || a.color,
                      flexShrink: 0,
                      boxShadow: "0 0 0 2px rgba(255,255,255,0.85)",
                    }}
                  />
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export { STATUS_DISPLAY, STATUS_STYLE, styleForAction };
