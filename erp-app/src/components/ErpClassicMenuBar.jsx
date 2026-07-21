import React, { useEffect, useState } from "react";

export function ErpClassicMenuBar(props) {
  var openMenu = props.openMenu;
  var setOpenMenu = props.setOpenMenu;
  var onNavigate = props.onNavigate;
  var menus = props.menus || [];
  var modeLabel = props.modeLabel || "";
  var netUi = props.netUi;
  var onSwitchUser = props.onSwitchUser;
  var dateLabel = props.dateLabel || "";
  var dateValue = props.dateValue || "";
  var HeaderKeysHint = props.HeaderKeysHint;
  var activePageId = props.activePageId;
  var showAdminToggle = props.showAdminToggle;
  var onAdminToggle = props.onAdminToggle;
  var adminToggleLabel = props.adminToggleLabel;
  var openSubMenu = props.openSubMenu;
  var setOpenSubMenu = props.setOpenSubMenu;

  var [localSub, setLocalSub] = useState(null);
  var subOpen = typeof setOpenSubMenu === "function" ? openSubMenu : localSub;
  var setSubOpen = typeof setOpenSubMenu === "function" ? setOpenSubMenu : setLocalSub;

  useEffect(function () {
    if (!openMenu) {
      setSubOpen(null);
      return;
    }
    var close = function () {
      setOpenMenu(null);
      setSubOpen(null);
    };
    document.addEventListener("mousedown", close);
    return function () { document.removeEventListener("mousedown", close); };
  }, [openMenu, setOpenMenu, setSubOpen]);

  return (
    <div className="erp-menu-bar" onMouseDown={function (e) { e.stopPropagation(); }}>
      <div className="erp-menu-bar-left">
        {menus.map(function (menu) {
          var isOpen = openMenu === menu.id;
          var isFlat = !!menu.flat && menu.pageId;

          if (isFlat) {
            return (
              <div key={menu.id} className="erp-menu-item">
                <button
                  type="button"
                  className="erp-menu-btn"
                  onMouseDown={function (e) {
                    e.stopPropagation();
                    setOpenMenu(null);
                    setSubOpen(null);
                    onNavigate(menu.pageId);
                  }}
                >
                  {menu.label}
                </button>
              </div>
            );
          }

          return (
            <div key={menu.id} className={"erp-menu-item" + (isOpen ? " open" : "")}>
              <button
                type="button"
                className="erp-menu-btn"
                onMouseDown={function (e) {
                  e.stopPropagation();
                  if (isOpen) {
                    setOpenMenu(null);
                    setSubOpen(null);
                  } else {
                    setOpenMenu(menu.id);
                    setSubOpen(null);
                  }
                }}
              >
                {menu.label}
                <span className="erp-menu-caret" aria-hidden="true">▾</span>
              </button>
              <div className={"erp-menu-dropdown" + (menu.id === "main-menu" ? " erp-menu-dropdown-has-flyout" : "")}>
                {(menu.items || []).map(function (item, idx) {
                  if (item.sep) {
                    return <div key={"sep-" + idx} className="erp-menu-dropdown-sep" aria-hidden="true" />;
                  }
                  if (item.header) {
                    return (
                      <div key={"hdr-" + idx} className="erp-menu-dropdown-hdr">
                        {item.label}
                      </div>
                    );
                  }

                  var hasChildren = item.children && item.children.length > 0;
                  var childKey = item.label || ("child-" + idx);
                  var isSubOpen = hasChildren && subOpen === childKey;

                  if (hasChildren) {
                    return (
                      <div
                        key={childKey + "-" + idx}
                        className={"erp-menu-flyout-row" + (isSubOpen ? " open" : "")}
                      >
                        <button
                          type="button"
                          className={"erp-menu-flyout-parent" + (isSubOpen ? " open" : "")}
                          onMouseDown={function (e) {
                            e.stopPropagation();
                            setSubOpen(isSubOpen ? null : childKey);
                          }}
                        >
                          <span>{item.label}</span>
                          <span className="erp-menu-flyout-caret" aria-hidden="true">▸</span>
                        </button>
                        {isSubOpen ? (
                          <div className="erp-menu-flyout">
                            {item.children.map(function (child, cIdx) {
                              return (
                                <button
                                  key={(child.pageId || "c") + "-" + cIdx}
                                  type="button"
                                  onMouseDown={function (e) {
                                    e.stopPropagation();
                                    setOpenMenu(null);
                                    setSubOpen(null);
                                    if (child.pageId) onNavigate(child.pageId);
                                  }}
                                >
                                  {child.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={(item.pageId || "item") + "-" + idx}
                      type="button"
                      onMouseDown={function (e) {
                        e.stopPropagation();
                        setOpenMenu(null);
                        setSubOpen(null);
                        if (item.pageId) onNavigate(item.pageId);
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="erp-menu-bar-right">
        {netUi ? (
          <span className="erp-menu-chip" title={netUi.title || netUi.label}>
            <span className="erp-menu-chip-dot" style={{ background: netUi.dot || "#94a3b8" }} aria-hidden="true" />
            <span className="erp-menu-chip-text">{netUi.label}</span>
          </span>
        ) : null}

        {HeaderKeysHint ? (
          <div className="erp-menu-chip erp-menu-chip-keys">
            <HeaderKeysHint pageId={activePageId} />
          </div>
        ) : null}

        {onSwitchUser ? (
          <button
            type="button"
            className="erp-menu-chip erp-menu-chip-btn"
            title="Switch user"
            onMouseDown={function (e) { e.stopPropagation(); }}
            onClick={onSwitchUser}
          >
            <span className="erp-menu-chip-ico" aria-hidden="true">👤</span>
            <span className="erp-menu-chip-text">Switch User</span>
          </button>
        ) : null}

        {showAdminToggle && onAdminToggle ? (
          <button
            type="button"
            className="erp-menu-chip erp-menu-chip-btn"
            title={adminToggleLabel || "Admin"}
            onMouseDown={function (e) { e.stopPropagation(); }}
            onClick={onAdminToggle}
          >
            <span className="erp-menu-chip-text">{adminToggleLabel === "Lock to Sales Mode" ? "Admin" : "Sales"}</span>
          </button>
        ) : null}

        {dateLabel ? (
          <time className="erp-menu-chip erp-menu-chip-date" dateTime={dateValue || undefined}>
            {dateLabel}
          </time>
        ) : null}

        {modeLabel ? (
          <span className="erp-menu-chip erp-menu-chip-mode">{modeLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
