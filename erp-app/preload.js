/**
 * Techon ERP — Electron Preload Script
 * File: preload.js
 *
 * Exposes window.electronAPI to the renderer.
 * Added: license activation bridge (tc-license-status, tc-activate)
 * Preserved: saveBackup (unchanged from original)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  /**
   * Save a backup JSON file to Documents/TechonERP/backups/
   * @param {object} payload - { filename: string, content: string }
   */
  saveBackup: function(payload) {
    ipcRenderer.send('save-backup', payload);
  },

  selectFolder: function() {
    return ipcRenderer.invoke('tc-select-folder');
  },

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

  /**
   * Get the current app version from package.json (via app.getVersion()).
   * Returns: string e.g. "1.0.0"
   */
  getAppVersion: function() {
    return ipcRenderer.invoke('tc-app-version');
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

  /** Save network config { role, apiUrl, xamppPath, port, wizardComplete } */
  saveNetworkConfig: function(cfg) {
    return ipcRenderer.invoke('tc-network-config-save', cfg);
  },

  /** Delete network config — resets to first-run wizard on next launch */
  resetNetworkConfig: function() {
    return ipcRenderer.invoke('tc-network-config-reset');
  },

  /* ── XAMPP Detection & Control ──────────────────────────────────── */

  /** Check if XAMPP is installed. Returns { found: bool, path?: string } */
  checkXampp: function() {
    return ipcRenderer.invoke('tc-check-xampp');
  },

  /** Start Apache + MySQL services. Returns { ok: bool, message?: string } */
  startXamppServices: function(payload) {
    return ipcRenderer.invoke('tc-start-xampp-services', payload || {});
  },

  /** Stop XAMPP services. Returns { ok: bool } */
  stopXamppServices: function(payload) {
    return ipcRenderer.invoke('tc-stop-xampp-services', payload || {});
  },

  /** Open the XAMPP installer (bundled or web download). */
  openXamppInstaller: function() {
    return ipcRenderer.invoke('tc-open-xampp-installer');
  },

  /* ── Network Setup Helpers ──────────────────────────────────────── */

  /** Test HTTP ports 80/8080/8000/3000 and return the first open one. */
  testHttpPort: function() {
    return ipcRenderer.invoke('tc-test-http-port');
  },

  /** Get the LAN IPv4 address of this machine. Returns { ip, iface } */
  getLanIp: function() {
    return ipcRenderer.invoke('tc-get-lan-ip');
  },

  /** Copy network-api/ folder to XAMPP htdocs/api/. Returns { ok, dest? } */
  copyApiFiles: function(payload) {
    return ipcRenderer.invoke('tc-copy-api-files', payload || {});
  },

  /** Create MySQL DB and import schema.sql. Returns { ok, message? } */
  setupDatabase: function(payload) {
    return ipcRenderer.invoke('tc-setup-database', payload || {});
  },

  /* ── Security ────────────────────────────────────────────────────── */

  /** Generate a cryptographically random API key. Returns { key: string } */
  generateApiKey: function() {
    return ipcRenderer.invoke('tc-generate-api-key');
  },

  /** Write the API key to XAMPP htdocs/api/tc_api_key.php */
  writeApiKey: function(payload) {
    return ipcRenderer.invoke('tc-write-api-key', payload || {});
  },

  /* ── Backup ──────────────────────────────────────────────────────── */

  /** Run mysqldump to Documents/TechonERP/backups/. Returns { ok, path? } */
  backupDatabase: function(payload) {
    return ipcRenderer.invoke('tc-backup-database', payload || {});
  },

  /** Open the backups folder in Explorer. */
  openBackupFolder: function() {
    return ipcRenderer.invoke('tc-open-backup-folder');
  },

  /** Get the date of the last DB backup. Returns { date: ISO string | null } */
  getLastBackupDate: function() {
    return ipcRenderer.invoke('tc-last-db-backup-date');
  },

  /* ── Logging ─────────────────────────────────────────────────────── */

  /** Write a log entry to Documents/TechonERP/logs/ */
  writeLog: function(payload) {
    return ipcRenderer.invoke('tc-write-log', payload || {});
  },

  /** Open the logs folder in Explorer. */
  openLogFolder: function() {
    return ipcRenderer.invoke('tc-open-log-folder');
  },

});
