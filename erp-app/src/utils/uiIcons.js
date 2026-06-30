/** Reliable UI symbols (Unicode escapes — safe on Windows/Electron). */
export var UI = {
  ok: "\u2705",
  check: "\u2713",
  warn: "\u26A0\uFE0F",
  info: "\u2139\uFE0F",
  error: "\u274C",
  cancel: "\u2715",
  hold: "\u23F8",
  clipboard: "\u{1F4CB}",
  back: "\u2190",
  stay: "\u21A9",
  sync: "\u{1F504}",
  cash: "\u{1F4B5}",
  cheque: "\u{1F4B3}",
  backspace: "\u232B",
  wait: "\u23F3",
  download: "\u2B07",
  infinity: "\u267E",
  globe: "\u{1F310}",
  email: "\u2709",
  phone: "\u{1F4DE}",
  package: "\u{1F4E6}",
  bulb: "\u{1F4A1}",
};

export function uiIcon(name) {
  return UI[name] || "";
}
