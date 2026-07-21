import React from "react";
import { ErpClassicMenuBar } from "./ErpClassicMenuBar.jsx";

export function ErpClassicShellLayout(props) {
  var p = props;
  var active = p.active;
  var activeItem = p.activeItem;
  var children = p.children;
  var treeGroups = p.treeGroups || [];
  var toolbarItems = p.toolbarItems || [];
  var filterNavItems = p.filterNavItems;
  var onNavigate = p.onNavigate;
  var onMenuAction = p.onMenuAction;
  var menuOpen = p.menuOpen;
  var setMenuOpen = p.setMenuOpen;
  var shellAdminN = p.shellAdminN || "Admin";
  var shellModeLabel = p.shellModeLabel || "";
  var shellBranch = p.shellBranch || "";
  var shellDbLabel = p.shellDbLabel || "";
  var shellAppVersion = p.shellAppVersion || "";
  var shellClock = p.shellClock || "";
  var shellFiscalYear = p.shellFiscalYear || "";
  var showPeriodLockBanner = p.showPeriodLockBanner;
  var periodLockText = p.periodLockText;
  var licenseReadOnlyBanner = p.licenseReadOnlyBanner;
  var licenseWarningBanner = p.licenseWarningBanner;
  var dbHealthError = p.dbHealthError;
  var onDismissDbHealth = p.onDismissDbHealth;
  var isNetworkServer = p.isNetworkServer;
  var isNetworkMode = p.isNetworkMode;
  var shellNetUi = p.shellNetUi;
  var fmtDateFull = p.fmtDateFull;
  var today = p.today;
  var posRestaurantHeader = p.posRestaurantHeader;
  var onSwitchUser = p.onSwitchUser;
  var showAdminToggle = p.showAdminToggle;
  var onAdminToggle = p.onAdminToggle;
  var adminToggleLabel = p.adminToggleLabel;
  var HeaderKeysHint = p.HeaderKeysHint;

  /* Top nav: Menu replaces Dashboard only; other section menus stay */
  var navMenus = [];
  var menuLauncherItems = [];

  treeGroups.forEach(function (group) {
    var items = typeof filterNavItems === "function" ? filterNavItems(group.ids) : [];
    if (!items || items.length === 0) return;

    var isDashboard = group.label === "Dashboard" || (group.ids && group.ids[0] === "dashboard");
    if (isDashboard) return;

    var childItems = items.map(function (it) {
      return { label: it.label, pageId: it.id };
    });

    /* Always use parent → children (even for single-page groups like Reports/Settings) */
    navMenus.push({
      id: group.label,
      label: group.label,
      items: childItems,
    });
    menuLauncherItems.push({
      label: group.label,
      children: childItems,
    });
  });

  navMenus.unshift({
    id: "main-menu",
    label: "Menu",
    items: menuLauncherItems,
  });

  return (
    <div className="erp-app-root">
      <ErpClassicMenuBar
        menus={navMenus}
        openMenu={menuOpen}
        setOpenMenu={setMenuOpen}
        onNavigate={onNavigate}
        modeLabel={shellModeLabel}
        netUi={isNetworkMode ? shellNetUi : null}
        onSwitchUser={onSwitchUser}
        dateLabel={fmtDateFull(today())}
        dateValue={today()}
        HeaderKeysHint={HeaderKeysHint}
        activePageId={active}
        showAdminToggle={showAdminToggle}
        onAdminToggle={onAdminToggle}
        adminToggleLabel={adminToggleLabel}
      />

      <div className="erp-toolbar">
        {toolbarItems.map(function (tb, idx) {
          var navId = tb.pageId || tb.id;
          var isTbActive = !tb.action && active === navId;
          var prev = idx > 0 ? toolbarItems[idx - 1] : null;
          var showSep = prev && prev.group && tb.group && prev.group !== tb.group;
          return (
            <React.Fragment key={(tb.key || tb.id) + "-" + tb.label + "-" + idx}>
              {showSep ? <div className="erp-toolbar-spacer" aria-hidden="true" /> : null}
              <button
                type="button"
                className={"erp-toolbar-btn" + (isTbActive ? " active" : "") + (tb.exit ? " exit" : "")}
                title={tb.label}
                onClick={function () {
                  if (tb.action) onMenuAction(tb.action);
                  else onNavigate(navId);
                }}
              >
                <span className="erp-toolbar-icon" style={{ background: tb.bg || "#f0f0f0" }} aria-hidden="true">{tb.icon}</span>
                <span className="erp-toolbar-label">{tb.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="erp-body-row">
        <main className="erp-main">
          {showPeriodLockBanner ? (
            <div className="erp-banner erp-banner-lock">{periodLockText}</div>
          ) : null}
          {dbHealthError && isNetworkServer ? (
            <div className="erp-banner erp-banner-warn">
              Server database issue — {dbHealthError}. Please restore from backup.
              <button type="button" onClick={onDismissDbHealth} style={{ marginLeft: 8, border: "none", background: "transparent", cursor: "default", fontWeight: 700 }}>×</button>
            </div>
          ) : null}
          {licenseReadOnlyBanner ? (
            <div className="erp-banner erp-banner-readonly">{licenseReadOnlyBanner}</div>
          ) : null}
          {licenseWarningBanner ? (
            <div className="erp-banner erp-banner-warn">{licenseWarningBanner}</div>
          ) : null}

          <div className="erp-page-header">
            <span className="erp-page-header-title">{activeItem ? activeItem.label : "Dashboard"}</span>
            <div id="erp-module-bar-host" className="erp-module-bar-host" />
            <div className="erp-page-header-right">
              {posRestaurantHeader ? (
                <span>Logged in as: <strong>{posRestaurantHeader}</strong></span>
              ) : null}
            </div>
          </div>

          <div className={"erp-page-content erp-core-scope" + (active === "pos" || active === "purchase-entry" ? " pos-page" : "")}>
            {children}
          </div>
        </main>
      </div>

      <div className="erp-status-bar">
        <div className="erp-status-segment"><span className="erp-status-label">User:</span><span className="erp-status-value">{shellAdminN}</span></div>
        <div className="erp-status-segment"><span className="erp-status-label">Branch:</span><span className="erp-status-value">{shellBranch}</span></div>
        <div className="erp-status-segment grow"><span className="erp-status-label">Financial Year:</span><span className="erp-status-value">{shellFiscalYear}</span></div>
        <div className="erp-status-segment"><span className="erp-status-label">Database:</span><span className="erp-status-value">{shellDbLabel}</span></div>
        <div className="erp-status-segment"><span className="erp-status-label">Version:</span><span className="erp-status-value">{shellAppVersion}</span></div>
        <div className="erp-status-segment right"><span className="erp-status-value">{shellClock}</span></div>
      </div>
    </div>
  );
}
