import React from "react";

/**
 * Clickable reference that opens the unified source document viewer.
 * Pass either `nav` ({ sourceKind, sourceId }) or `input` for resolveFromNavInput.
 */
export function SourceDocLink(props) {
  var openSourceDocument = props.openSourceDocument;
  var label = props.label || props.children || "—";
  var nav = props.nav;
  var title = props.title || (nav && nav.label ? "Open " + nav.label : "Open document");
  var className = props.className || "erp-stmt-ref-btn";
  var onClick = props.onClick;

  if (!openSourceDocument || !nav) {
    return <span className={props.fallbackClassName} title={props.title}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      onClick={function (ev) {
        if (onClick) onClick(ev);
        if (ev && ev.defaultPrevented) return;
        openSourceDocument(nav);
      }}
    >
      {label}
    </button>
  );
}
