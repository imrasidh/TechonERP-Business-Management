/**
 * Techon ERP — Electron Preload Script
 * File: preload.js
 *
 * Exposes window.electronAPI to the renderer.
 * Added: license activation bridge (tc-license-status, tc-activate)
 * Preserved: saveBackup (unchanged from original)
 */

const { contextBridge, ipcRenderer } = require('electron');

var CLIENT_BLOCKED_RESPONSE = { status: 'blocked', message: 'Restricted in client mode' };

var CLIENT_BLOCKED_METHODS = {
  saveBackup: true,
  selectFolder: true,
  syncLicenseNow: true,
  getConnectedClients: true,
  removeConnectedClient: true,
  checkXampp: true,
  startXamppServices: true,
  stopXamppServices: true,
  openXamppInstaller: true,
  testHttpPort: true,
  getLanIp: true,
  copyApiFiles: true,
  setupDatabase: true,
  generateApiKey: true,
  writeApiKey: true,
  backupDatabase: true,
  openBackupFolder: true,
  getLastBackupDate: true,
  openLogFolder: true,
};

function isNetworkClientRoleSync() {
  try {
    return ipcRenderer.sendSync('tc-is-network-client-sync') === true;
  } catch (_e) {
    return false;
  }
}

function guardClientMethod(name, fn) {
  return function () {
    if (!CLIENT_BLOCKED_METHODS[name] || !isNetworkClientRoleSync()) {
      return fn.apply(this, arguments);
    }
    if (name === 'saveBackup') {
      return undefined;
    }
    return Promise.resolve(CLIENT_BLOCKED_RESPONSE);
  };
}

contextBridge.exposeInMainWorld('electronAPI', {

  /**
   * Save a backup JSON file to Documents/TechonERP/backups/
   * @param {object} payload - { filename: string, content: string }
   */
  saveBackup: guardClientMethod('saveBackup', function(payload) {
    ipcRenderer.send('save-backup', payload);
  }),

  selectFolder: guardClientMethod('selectFolder', function() {
    return ipcRenderer.invoke('tc-select-folder');
  }),

  /**
   * Get current license / trial status from main process.
   * Returns: { status: 'trial'|'activated'|'expired'|'locked', ... }
   */
  getLicenseStatus: function() {
    return ipcRenderer.invoke('tc-license-status');
  },

  /**
   * Attempt to activate the license.
   * @param {object} payload - { licenseKey: string, shopName: string }
   * Returns: { ok: boolean, shopName?: string, message?: string }
   */
  activateLicense: function(payload) {
    return ipcRenderer.invoke('tc-activate', payload);
  },

  /**
   * After server confirms license is valid, reset local clock tamper anchor (tc_clock.dat).
   * Use from System Clock Issue screen when the PC time was wrong but license is legitimate.
   */
  syncClockViaLicense: function() {
    return ipcRenderer.invoke('tc-sync-clock-via-license');
  },
  syncLicenseNow: guardClientMethod('syncLicenseNow', function() {
    return ipcRenderer.invoke('tc-license-sync-now');
  }),

  /** Force online license check (Settings → About). Returns { ok, status, needsReactivation, message }. */
  verifyLicenseNow: function() {
    return ipcRenderer.invoke('tc-license-verify-now');
  },
  getConnectedClients: guardClientMethod('getConnectedClients', function() {
    return ipcRenderer.invoke('tc-connected-clients-list');
  }),
  removeConnectedClient: guardClientMethod('removeConnectedClient', function(payload) {
    return ipcRenderer.invoke('tc-connected-client-remove', payload || {});
  }),
  setConnectedClientLabel: function(payload) {
    return ipcRenderer.invoke('tc-connected-client-set-label', payload || {});
  },

  /**
   * Get the current app version from package.json (via app.getVersion()).
   * Returns: string e.g. "1.0.0"
   */
  getAppVersion: function() {
    return ipcRenderer.invoke('tc-app-version');
  },

  /** In-app auto-update (NSIS upgrade — preserves shop data). */
  checkForAppUpdate: function() {
    return ipcRenderer.invoke('tc-update-check');
  },
  downloadAppUpdate: function() {
    return ipcRenderer.invoke('tc-update-download');
  },
  installAppUpdate: function() {
    return ipcRenderer.invoke('tc-update-install');
  },
  installAppUpdatePrompt: function() {
    return ipcRenderer.invoke('tc-update-install-prompt');
  },
  onAppUpdateEvent: function(callback) {
    if (typeof callback !== 'function') return function() {};
    var listener = function(_event, payload) { callback(payload); };
    ipcRenderer.on('tc-update-event', listener);
    return function() {
      ipcRenderer.removeListener('tc-update-event', listener);
    };
  },

  /**
   * LICENSE_SECRET (or file/env) for financial snapshot HMAC v2. Empty string if unset.
   */
  getSnapshotHmacSecret: function() {
    return ipcRenderer.invoke('tc-snapshot-hmac-secret');
  },

  getSnapshotHmacSecretPrevious: function() {
    return ipcRenderer.invoke('tc-snapshot-hmac-secret-previous');
  },

  /** { isPackaged, licenseSecretConfigured, blockWritesOnCritical } */
  getProductionGuard: function() {
    return ipcRenderer.invoke('tc-runtime-production-guard');
  },

  /**
   * Open a URL in the user's default browser using shell.openExternal()
   * @param {string} url - Must start with https:// or http://
   */
  openExternal: function(url) {
    return ipcRenderer.invoke('tc-open-url', url);
  },

  /**
   * Generate a PDF from HTML and open WhatsApp with the file.
   * @param {object} payload - { html, filename, phone, pageFormat?, invoicePdfFolder? }
   *   invoicePdfFolder: optional absolute path; if empty, uses Documents/TechonERP/Invoices
   * Returns: { ok: boolean, path?: string, message?: string }
   */
  sharePDF: function(payload) {
    return ipcRenderer.invoke('tc-share-pdf', payload);
  },

  /**
   * Print HTML: string, or { html: string, pdfOnly?: boolean }.
   * pdfOnly streams HTML to a temp file in 48KB chunks (reliable for large Business Report).
   */
  printHtml: async function(htmlOrPayload) {
    if (
      htmlOrPayload &&
      typeof htmlOrPayload === 'object' &&
      typeof htmlOrPayload.html === 'string' &&
      htmlOrPayload.pdfOnly
    ) {
      const html = htmlOrPayload.html;
      const id = 'pd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      const CHUNK = 48 * 1024;
      try {
        for (let i = 0, seq = 0; i < html.length; i += CHUNK, seq++) {
          const r = await ipcRenderer.invoke('tc-print-html-disk-chunk', {
            id: id,
            seq: seq,
            part: html.slice(i, i + CHUNK)
          });
          if (!r || r.ok !== true) {
            return { ok: false, message: (r && r.message) || 'Could not send report data' };
          }
        }
        return await ipcRenderer.invoke('tc-print-html-disk-finish', { id: id });
      } catch (e) {
        return { ok: false, message: e && e.message ? e.message : String(e) };
      }
    }
    return ipcRenderer.invoke('tc-print-html', htmlOrPayload);
  },

  /* ── Network Config ─────────────────────────────────────────────── */

  /** Load saved network config from userData/tc_network.json */
  loadNetworkConfig: function() {
    return ipcRenderer.invoke('tc-network-config-load');
  },

  /** POS client header: OS hostname + short device id (display only). */
  getClientMachineLabel: function() {
    return ipcRenderer.invoke('tc-client-machine-label');
  },

  /** Save network config { role, apiUrl, xamppPath, port, wizardComplete } */
  saveNetworkConfig: function(cfg) {
    return ipcRenderer.invoke('tc-network-config-save', cfg);
  },

  /** Test server address + security key before saving (main-process HTTP). */
  testNetworkConnection: function(cfg) {
    return ipcRenderer.invoke('tc-network-test-connection', cfg || {});
  },

  /** Delete network config — resets to first-run wizard on next launch */
  resetNetworkConfig: function() {
    return ipcRenderer.invoke('tc-network-config-reset');
  },

  /* ── XAMPP Detection & Control ──────────────────────────────────── */

  /** Check if XAMPP is installed. Returns { found: bool, path?: string } */
  checkXampp: guardClientMethod('checkXampp', function() {
    return ipcRenderer.invoke('tc-check-xampp');
  }),

  /** Start Apache + MySQL services. Returns { ok: bool, message?: string } */
  startXamppServices: guardClientMethod('startXamppServices', function(payload) {
    return ipcRenderer.invoke('tc-start-xampp-services', payload || {});
  }),

  /** Stop XAMPP services. Returns { ok: bool } */
  stopXamppServices: guardClientMethod('stopXamppServices', function(payload) {
    return ipcRenderer.invoke('tc-stop-xampp-services', payload || {});
  }),

  /** Open the XAMPP installer (bundled or web download). */
  openXamppInstaller: guardClientMethod('openXamppInstaller', function() {
    return ipcRenderer.invoke('tc-open-xampp-installer');
  }),

  /* ── Network Setup Helpers ──────────────────────────────────────── */

  /** Test HTTP ports 80/8080/8000/3000 and return the first open one. */
  testHttpPort: guardClientMethod('testHttpPort', function() {
    return ipcRenderer.invoke('tc-test-http-port');
  }),

  /** Get the LAN IPv4 address of this machine. Returns { ip, iface } */
  getLanIp: guardClientMethod('getLanIp', function() {
    return ipcRenderer.invoke('tc-get-lan-ip');
  }),

  /** Copy network-api/ folder to XAMPP htdocs/api/. Returns { ok, dest? } */
  copyApiFiles: guardClientMethod('copyApiFiles', function(payload) {
    return ipcRenderer.invoke('tc-copy-api-files', payload || {});
  }),

  /** Create MySQL DB and import schema.sql. Returns { ok, message? } */
  setupDatabase: guardClientMethod('setupDatabase', function(payload) {
    return ipcRenderer.invoke('tc-setup-database', payload || {});
  }),

  /* ── Security ────────────────────────────────────────────────────── */

  /** Generate a cryptographically random API key. Returns { key: string } */
  generateApiKey: guardClientMethod('generateApiKey', function() {
    return ipcRenderer.invoke('tc-generate-api-key');
  }),

  /** Write the API key to XAMPP htdocs/api/tc_api_key.php */
  writeApiKey: guardClientMethod('writeApiKey', function(payload) {
    return ipcRenderer.invoke('tc-write-api-key', payload || {});
  }),

  /* ── Backup ──────────────────────────────────────────────────────── */

  /** Run mysqldump to Documents/TechonERP/backups/. Returns { ok, path? } */
  backupDatabase: guardClientMethod('backupDatabase', function(payload) {
    return ipcRenderer.invoke('tc-backup-database', payload || {});
  }),

  /** Open the backups folder in Explorer. */
  openBackupFolder: guardClientMethod('openBackupFolder', function() {
    return ipcRenderer.invoke('tc-open-backup-folder');
  }),

  /** Get the date of the last DB backup. Returns { date: ISO string | null } */
  getLastBackupDate: guardClientMethod('getLastBackupDate', function() {
    return ipcRenderer.invoke('tc-last-db-backup-date');
  }),

  /* ── Logging ─────────────────────────────────────────────────────── */

  /** Write a log entry to Documents/TechonERP/logs/ */
  writeLog: function(payload) {
    return ipcRenderer.invoke('tc-write-log', payload || {});
  },

  /** Push key-value patches to LAN sync_patch.php (live sync — main + counter). */
  syncPatch: function(payload) {
    return ipcRenderer.invoke('tc-sync-patch', payload || {});
  },

  /** Start/restart LAN WebSocket sync (main process). */
  restartLanWebSocket: function(opts) {
    return ipcRenderer.invoke('tc-ws-restart', opts || {});
  },

  /** Stop LAN WebSocket sync (logout / mode change). */
  stopLanWebSocket: function() {
    return ipcRenderer.invoke('tc-ws-stop');
  },

  getLanWebSocketStatus: function() {
    return ipcRenderer.invoke('tc-ws-status');
  },

  onLanWebSocketStatus: function(callback) {
    if (typeof callback !== 'function') return function () {};
    var handler = function (_event, payload) { callback(payload); };
    ipcRenderer.on('tc-ws-status', handler);
    return function () { ipcRenderer.removeListener('tc-ws-status', handler); };
  },

  onLanWebSocketKvChanged: function(callback) {
    if (typeof callback !== 'function') return function () {};
    var handler = function (_event, payload) { callback(payload); };
    ipcRenderer.on('tc-ws-kv-changed', handler);
    return function () { ipcRenderer.removeListener('tc-ws-kv-changed', handler); };
  },

  /** Signed LAN HTTP request via main process (device or legacy auth). */
  lanRequest: function(payload) {
    return ipcRenderer.invoke('tc-lan-request', payload || {});
  },

  getDeviceAuthHeaders: function(payload) {
    return ipcRenderer.invoke('tc-device-auth-headers', payload || {});
  },

  loadDeviceCredentials: function() {
    return ipcRenderer.invoke('tc-device-credentials-load');
  },

  registerDevice: function(payload) {
    return ipcRenderer.invoke('tc-device-register', payload || {});
  },

  pollDeviceStatus: function() {
    return ipcRenderer.invoke('tc-device-poll-status');
  },

  manageDevices: function(payload) {
    return ipcRenderer.invoke('tc-device-manage', payload || {});
  },

  /** Open the logs folder in Explorer. */
  openLogFolder: guardClientMethod('openLogFolder', function() {
    return ipcRenderer.invoke('tc-open-log-folder');
  }),

});
