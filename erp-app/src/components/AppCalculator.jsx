import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function formatDisplay(n) {
  if (n === null || n === undefined || n === "") return "0";
  if (typeof n === "string") return n;
  if (!isFinite(n)) return "Error";
  var s = String(n);
  if (s.indexOf("e") >= 0) return Number(n).toPrecision(10).replace(/\.?0+$/, "");
  if (Math.abs(n) >= 1e12) return n.toExponential(6);
  /* Trim floating noise */
  var rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

function applyOp(a, b, op) {
  var x = Number(a);
  var y = Number(b);
  if (!isFinite(x) || !isFinite(y)) return NaN;
  if (op === "+") return x + y;
  if (op === "−" || op === "-") return x - y;
  if (op === "×" || op === "*") return x * y;
  if (op === "÷" || op === "/") {
    if (y === 0) return NaN;
    return x / y;
  }
  return y;
}

/**
 * In-app professional calculator (toolbar 🧮).
 * Floating panel — does not block the rest of the ERP.
 */
export function AppCalculator(props) {
  var open = props.open === true;
  var onClose = props.onClose || function () {};

  var [display, setDisplay] = useState("0");
  var [acc, setAcc] = useState(null);
  var [op, setOp] = useState(null);
  var [fresh, setFresh] = useState(true);
  var [expr, setExpr] = useState("");
  var [memory, setMemory] = useState(0);
  var [error, setError] = useState(false);
  var panelRef = useRef(null);

  useEffect(function () {
    if (!open) return;
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
    setExpr("");
    setError(false);
  }, [open]);

  useEffect(function () {
    if (!open) return undefined;
    var onKey = function (e) {
      if (e.defaultPrevented) return;
      var tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : "";
      var typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
      if (typing) return;
      var k = e.key;
      if (k === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (k >= "0" && k <= "9") {
        e.preventDefault();
        inputDigit(k);
        return;
      }
      if (k === "." || k === ",") {
        e.preventDefault();
        inputDot();
        return;
      }
      if (k === "+" || k === "-" || k === "*" || k === "/") {
        e.preventDefault();
        inputOp(k === "*" ? "×" : (k === "/" ? "÷" : (k === "-" ? "−" : "+")));
        return;
      }
      if (k === "Enter" || k === "=") {
        e.preventDefault();
        doEquals();
        return;
      }
      if (k === "Backspace") {
        e.preventDefault();
        doBackspace();
        return;
      }
      if (k === "Delete" || k === "Escape") {
        e.preventDefault();
        doClear();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return function () { window.removeEventListener("keydown", onKey, true); };
  });

  var inputDigit = function (d) {
    setError(false);
    setDisplay(function (prev) {
      if (fresh || prev === "0" || prev === "Error") {
        setFresh(false);
        return d;
      }
      if (prev.length >= 16) return prev;
      return prev + d;
    });
  };

  var inputDot = function () {
    setError(false);
    setDisplay(function (prev) {
      if (fresh || prev === "Error") {
        setFresh(false);
        return "0.";
      }
      if (prev.indexOf(".") >= 0) return prev;
      return prev + ".";
    });
  };

  var inputOp = function (nextOp) {
    setError(false);
    var cur = parseFloat(display);
    if (!isFinite(cur)) {
      setDisplay("Error");
      setError(true);
      setFresh(true);
      return;
    }
    if (acc != null && op && !fresh) {
      var r = applyOp(acc, cur, op);
      if (!isFinite(r)) {
        setDisplay("Error");
        setError(true);
        setAcc(null);
        setOp(null);
        setExpr("");
        setFresh(true);
        return;
      }
      setAcc(r);
      setDisplay(formatDisplay(r));
      setExpr(formatDisplay(r) + " " + nextOp);
    } else {
      setAcc(cur);
      setExpr(formatDisplay(cur) + " " + nextOp);
    }
    setOp(nextOp);
    setFresh(true);
  };

  var doEquals = function () {
    if (acc == null || !op) return;
    var cur = parseFloat(display);
    var r = applyOp(acc, cur, op);
    if (!isFinite(r)) {
      setDisplay("Error");
      setError(true);
      setAcc(null);
      setOp(null);
      setExpr("");
      setFresh(true);
      return;
    }
    setExpr(formatDisplay(acc) + " " + op + " " + formatDisplay(cur) + " =");
    setDisplay(formatDisplay(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
    setError(false);
  };

  var doClear = function () {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
    setExpr("");
    setError(false);
  };

  var doClearEntry = function () {
    setDisplay("0");
    setFresh(true);
    setError(false);
  };

  var doBackspace = function () {
    if (fresh || error) return;
    setDisplay(function (prev) {
      if (prev.length <= 1 || prev === "Error") return "0";
      var next = prev.slice(0, -1);
      return next === "-" || next === "" ? "0" : next;
    });
  };

  var doPercent = function () {
    var cur = parseFloat(display);
    if (!isFinite(cur)) return;
    var r = cur / 100;
    if (acc != null && (op === "+" || op === "−")) {
      r = (Number(acc) * cur) / 100;
    }
    setDisplay(formatDisplay(r));
    setFresh(true);
  };

  var doNegate = function () {
    if (display === "0" || display === "Error") return;
    setDisplay(function (prev) {
      if (prev.charAt(0) === "-") return prev.slice(1) || "0";
      return "-" + prev;
    });
  };

  var memClear = function () { setMemory(0); };
  var memRecall = function () {
    setDisplay(formatDisplay(memory));
    setFresh(true);
    setError(false);
  };
  var memAdd = function () {
    var cur = parseFloat(display);
    if (isFinite(cur)) setMemory(function (m) { return m + cur; });
  };
  var memSub = function () {
    var cur = parseFloat(display);
    if (isFinite(cur)) setMemory(function (m) { return m - cur; });
  };

  if (!open) return null;

  var btn = function (label, className, onClick, aria) {
    return (
      <button
        key={label + (className || "")}
        type="button"
        className={"erp-calc-btn " + (className || "")}
        onClick={onClick}
        aria-label={aria || label}
      >
        {label}
      </button>
    );
  };

  var ui = (
    <div className="erp-calc-root" role="dialog" aria-modal="false" aria-label="Calculator">
      <div className="erp-calc-panel" ref={panelRef}>
        <div className="erp-calc-bar">
          <div className="erp-calc-bar-left">
            <span className="erp-calc-badge" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="8" y1="10" x2="10" y2="10" />
                <line x1="14" y1="10" x2="16" y2="10" />
                <line x1="8" y1="14" x2="10" y2="14" />
                <line x1="14" y1="14" x2="16" y2="14" />
                <line x1="8" y1="18" x2="16" y2="18" />
              </svg>
            </span>
            <div>
              <div className="erp-calc-title">Calculator</div>
              <div className="erp-calc-sub">Quick math · Esc to close</div>
            </div>
          </div>
          <div className="erp-calc-bar-right">
            {memory ? <span className="erp-calc-mem-pill" title={"Memory: " + formatDisplay(memory)}>M</span> : null}
            <button type="button" className="erp-calc-close" onClick={onClose} aria-label="Close calculator">✕</button>
          </div>
        </div>

        <div className={"erp-calc-screen" + (error ? " is-error" : "")}>
          <div className="erp-calc-expr">{expr || "\u00a0"}</div>
          <div className="erp-calc-value">{display}</div>
        </div>

        <div className="erp-calc-pad">
          <div className="erp-calc-mem-row">
            {btn("MC", "is-mem", memClear, "Memory clear")}
            {btn("MR", "is-mem", memRecall, "Memory recall")}
            {btn("M+", "is-mem", memAdd, "Memory add")}
            {btn("M−", "is-mem", memSub, "Memory subtract")}
          </div>

          {btn("C", "is-fn is-danger", doClear, "Clear all")}
          {btn("±", "is-fn", doNegate, "Change sign")}
          {btn("%", "is-fn", doPercent, "Percent")}
          {btn("÷", "is-op", function () { inputOp("÷"); })}

          {btn("7", "is-num", function () { inputDigit("7"); })}
          {btn("8", "is-num", function () { inputDigit("8"); })}
          {btn("9", "is-num", function () { inputDigit("9"); })}
          {btn("×", "is-op", function () { inputOp("×"); })}

          {btn("4", "is-num", function () { inputDigit("4"); })}
          {btn("5", "is-num", function () { inputDigit("5"); })}
          {btn("6", "is-num", function () { inputDigit("6"); })}
          {btn("−", "is-op", function () { inputOp("−"); })}

          {btn("1", "is-num", function () { inputDigit("1"); })}
          {btn("2", "is-num", function () { inputDigit("2"); })}
          {btn("3", "is-num", function () { inputDigit("3"); })}
          {btn("+", "is-op", function () { inputOp("+"); })}

          {btn("0", "is-num is-zero", function () { inputDigit("0"); })}
          {btn(".", "is-num", inputDot)}
          {btn("=", "is-eq", doEquals)}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return ui;
  return createPortal(ui, document.body);
}

export default AppCalculator;
