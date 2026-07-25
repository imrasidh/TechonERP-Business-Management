/**
 * Techon ERP — Electron Main Process
 * File: main.cjs
 *
 * FIXES APPLIED:
 *   1. SERVER_URL changed from http:// → https://  (server is HTTPS-only on cPanel)
 *   2. tcRequest() now sends JSON body, not URLSearchParams
 *      — PHP reads: file_get_contents('php://input') + json_decode()
 *      — Content-Type changed to application/json
 *   3. Content-Length now calculated from the JSON string (not URLSearchParams)
 *   4. Timeout handler now uses req.destroy() correctly (was already correct, kept)
 *   5. HTTPS to license server uses Node default TLS verification (strict).
 *   6. REMOVED forward jump detection — caused customers to be locked out every
 *      morning (12h overnight gap > 2h threshold). Forward jumps are harmless
 *      anyway — they only accelerate the user's own trial expiry.
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { execFile, exec } = require('child_process');
const { pathToFileURL } = require('url');
const lanWsSync = require('./lan-ws-sync.cjs');
const { buildLanAuthHeaders, stripInternalHeaders } = require('./lan-auth.cjs');
const { createDeviceStore } = require('./device-store.cjs');
const appUpdater = require('./updater.cjs');

/** Opaque ERP login sessions (per BrowserWindow / webContents). */
const tcErpSessions = new Map();
const TC_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function tcSessionKeyFromEvent(event) {
  try {
    const wc = event && event.sender;
    return wc && typeof wc.id === 'number' ? wc.id : null;
  } catch (_e) {
    return null;
  }
}

function tcGetSession(event) {
  const id = tcSessionKeyFromEvent(event);
  if (id == null) return null;
  const s = tcErpSessions.get(id);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    tcErpSessions.delete(id);
    return null;
  }
  return s;
}

function tcRequireSessionRole(event, roles) {
  const s = tcGetSession(event);
  if (!s) return { ok: false, message: 'Sign in required.' };
  const need = Array.isArray(roles) ? roles : [roles];
  const role = String(s.role || '').toLowerCase();
  if (need.length && need.indexOf(role) < 0 && need.indexOf('*') < 0) {
    return { ok: false, message: 'Permission denied for role ' + role + '.' };
  }
  return { ok: true, session: s };
}

/* Dev / unpackaged only: erp-app/.env → LICENSE_SECRET / TC_LIC_SERVER_SECRET.
 * Packaged .exe: set OS env LICENSE_SECRET (preferred) or TC_LIC_SERVER_SECRET, or tc_license_secret.txt beside .exe. */
try {
  if (app.isPackaged === false) {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
  }
} catch (_e) { /* dotenv optional if missing */ }

/* ═══════════════════════════════════════════════════════════════════
   LEGACY USERDATA MIGRATION (v2.0.1+)
   Before 2.0.1, Electron stored shop data in %APPDATA%/Techon-ERP/.
   From 2.0.1 onward it lives in %APPDATA%/TechonERP/UserData/.
   Upgrading without migration looks like a brand-new install (setup wizard + empty data).
   ═══════════════════════════════════════════════════════════════════ */
function _dirHasEntries(dir) {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch (_e) {
    return false;
  }
}

function _legacyUserDataHasShopData(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    if (fs.existsSync(path.join(dir, 'tc_network.json'))) return true;
    if (fs.existsSync(path.join(dir, 'tc_lic.dat'))) return true;
    if (_dirHasEntries(path.join(dir, 'IndexedDB'))) return true;
    if (_dirHasEntries(path.join(dir, 'Local Storage'))) return true;
  } catch (_e) { /* ignore */ }
  return false;
}

function _dirSizeBytes(dir, depth) {
  if (!dir || !fs.existsSync(dir)) return 0;
  if (depth == null) depth = 0;
  if (depth > 8) return 0;
  try {
    let total = 0;
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) total += _dirSizeBytes(p, depth + 1);
        else total += st.size;
      } catch (_e) { /* skip */ }
    }
    return total;
  } catch (_e) {
    return 0;
  }
}

function _newUserDataLooksEmpty(dir) {
  if (!dir || !fs.existsSync(dir)) return true;
  try {
    if (fs.existsSync(path.join(dir, '.tc_legacy_migrated'))) return false;
    if (_legacyUserDataHasShopData(dir)) return false;
    const entries = fs.readdirSync(dir).filter(function (e) {
      return e !== '.tc_legacy_migrated';
    });
    return entries.length === 0;
  } catch (_e) {
    return true;
  }
}

/** True when user already set a fresh password but legacy folder still has the real shop DB. */
function _shouldForceLegacyMigration(legacyDir, userDataDir) {
  if (!legacyDir || !userDataDir) return false;
  if (fs.existsSync(path.join(userDataDir, '.tc_legacy_migrated'))) return false;
  if (!_legacyUserDataHasShopData(legacyDir)) return false;
  if (_newUserDataLooksEmpty(userDataDir)) return true;
  try {
    const legacyIdb = _dirSizeBytes(path.join(legacyDir, 'IndexedDB'));
    const newIdb = _dirSizeBytes(path.join(userDataDir, 'IndexedDB'));
    const legacyLs = _dirSizeBytes(path.join(legacyDir, 'Local Storage'));
    const newLs = _dirSizeBytes(path.join(userDataDir, 'Local Storage'));
    /* Fresh setup is tiny; real shops are usually hundreds of KB or more. */
    if (legacyIdb > 80000 && newIdb < legacyIdb * 0.5) return true;
    if (legacyLs > 40000 && newLs < legacyLs * 0.5) return true;
    if (fs.existsSync(path.join(legacyDir, 'tc_network.json'))
      && !fs.existsSync(path.join(userDataDir, 'tc_network.json'))) return true;
  } catch (_e) { /* ignore */ }
  return false;
}

function _removePathRecursive(target) {
  if (!target || !fs.existsSync(target)) return;
  try {
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    }
  } catch (_e) { /* fall through */ }
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        _removePathRecursive(path.join(target, entry));
      }
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
  } catch (_e) { /* ignore */ }
}

function _copyLegacyEntry(srcRoot, destRoot, entry, force) {
  const src = path.join(srcRoot, entry);
  if (!fs.existsSync(src)) return;
  const dest = path.join(destRoot, entry);
  try {
    if (force && fs.existsSync(dest)) _removePathRecursive(dest);
    if (fs.statSync(src).isDirectory()) {
      if (typeof fs.cpSync === 'function') {
        fs.cpSync(src, dest, { recursive: true, force: !!force, errorOnExist: false });
      } else {
        _copyDirRecursiveEarly(src, dest, !!force);
      }
    } else if (force || !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  } catch (_e) { /* best effort */ }
}

function _copyDirRecursiveEarly(src, dest, force) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) {
      _copyDirRecursiveEarly(s, d, force);
    } else if (force || !fs.existsSync(d)) {
      fs.copyFileSync(s, d);
    }
  }
}

function _runLegacyUserDataMigration(userDataDir, legacyDir, forceReplace) {
  fs.mkdirSync(userDataDir, { recursive: true });
  if (forceReplace) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = userDataDir + '.fresh-backup-' + stamp;
    try {
      if (typeof fs.cpSync === 'function') {
        fs.cpSync(userDataDir, backupDir, { recursive: true, force: true });
      }
      console.log('[TechonERP] Backed up fresh UserData to ' + backupDir);
    } catch (_e) { /* ignore */ }
  }
  const copyEntries = [
    'IndexedDB', 'Local Storage', 'Session Storage', 'databases',
    'tc_network.json', 'tc_lic.dat', 'tc_cli_lic.dat', 'tc_did.dat',
    'tc_clock.dat', 'tc_last_known_time.dat', 'tc_local_enc.key',
    'tc_device.dat',
  ];
  for (const entry of copyEntries) {
    _copyLegacyEntry(legacyDir, userDataDir, entry, forceReplace);
  }
  try {
    for (const f of fs.readdirSync(legacyDir)) {
      if (f.startsWith('tc_') && !copyEntries.includes(f)) {
        _copyLegacyEntry(legacyDir, userDataDir, f, forceReplace);
      }
    }
  } catch (_e) { /* ignore */ }
  fs.writeFileSync(
    path.join(userDataDir, '.tc_legacy_migrated'),
    'from=' + legacyDir + '\n' + 'at=' + new Date().toISOString() + '\n' + 'force=' + String(!!forceReplace) + '\n',
    'utf8'
  );
  console.log('[TechonERP] Migrated legacy user data from ' + legacyDir + ' → ' + userDataDir + (forceReplace ? ' (replaced fresh setup)' : ''));
  return legacyDir;
}

function migrateLegacyUserDataIfNeeded(userDataDir) {
  const appData = app.getPath('appData');
  const legacyCandidates = [
    path.join(appData, 'Techon-ERP'),
    path.join(appData, 'techon-erp'),
  ];
  const normalizedNew = path.normalize(userDataDir);
  for (const legacyDir of legacyCandidates) {
    const normalizedLegacy = path.normalize(legacyDir);
    if (normalizedLegacy === normalizedNew) continue;
    if (normalizedNew.startsWith(normalizedLegacy + path.sep)) continue;
    const forceReplace = _shouldForceLegacyMigration(legacyDir, userDataDir);
    if (!_newUserDataLooksEmpty(userDataDir) && !forceReplace) continue;
    if (!_legacyUserDataHasShopData(legacyDir)) continue;
    try {
      return _runLegacyUserDataMigration(userDataDir, legacyDir, forceReplace);
    } catch (err) {
      console.error('[TechonERP] Legacy userData migration failed:', err && err.message ? err.message : err);
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   CHROMIUM STORAGE PATH FIX (Windows)
   Avoid "Access is denied" errors for disk cache / quota DB which can
   delay first paint by several seconds and show a blank window.
   Put all runtime data under %APPDATA%/TechonERP.
   ═══════════════════════════════════════════════════════════════════ */
let _legacyMigrationFrom = null;
try {
  const base = path.join(app.getPath('appData'), 'TechonERP');
  fs.mkdirSync(base, { recursive: true });
  const userDataDir = path.join(base, 'UserData');
  const cacheDir = path.join(base, 'Cache');
  const tempDir = path.join(base, 'Temp');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  _legacyMigrationFrom = migrateLegacyUserDataIfNeeded(userDataDir);
  app.setPath('userData', userDataDir);
  app.setPath('cache', cacheDir);
  app.setPath('temp', tempDir);

  /* Force Chromium disk cache into our writable cache folder. */
  app.commandLine.appendSwitch('disk-cache-dir', path.join(cacheDir, 'disk'));
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (_e) { /* never block startup */ }

if (process.env.TC_LIC_DEBUG === '1' && app && app.isPackaged !== true) {
  const s = process.env.LICENSE_SECRET || process.env.TC_LIC_SERVER_SECRET;
  console.log('[TC_LIC_DEBUG] LICENSE_SECRET/TC_LIC_SERVER_SECRET: ' + (s ? 'SET (length ' + String(s.length) + ')' : 'NOT SET'));
}

/* ═══════════════════════════════════════════════════════════════════
   FILE LOGGER  (Documents/TechonERP/logs/techon-YYYY-MM-DD.log)
   ═══════════════════════════════════════════════════════════════════ */
function getLogDir() {
  return path.join(app.getPath('documents'), 'TechonERP', 'logs');
}

function writeLogFile(level, message) {
  try {
    const dir = getLogDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now  = new Date();
    const date = now.toISOString().slice(0, 10);
    const entry = '[' + now.toISOString() + '] [' + String(level).toUpperCase() + '] ' + message + '\n';
    fs.appendFileSync(path.join(dir, 'techon-' + date + '.log'), entry, 'utf8');
    /* Prune logs older than 30 days */
    const files = fs.readdirSync(dir).filter(f => f.startsWith('techon-') && f.endsWith('.log'));
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const f of files) {
      try {
        if (fs.statSync(path.join(dir, f)).mtimeMs < cutoff) fs.unlinkSync(path.join(dir, f));
      } catch (_) {}
    }
  } catch (_) {}
}

/* Suppress known LAN WebSocket teardown errors — must not crash the ERP UI */
process.on('uncaughtException', function (err) {
  var msg = err && err.message ? String(err.message) : String(err);
  if (
    msg.indexOf('handshake has timed out') !== -1 ||
    msg.indexOf('closed before the connection was established') !== -1 ||
    msg.indexOf('WebSocket is not open') !== -1
  ) {
    writeLogFile('warn', '[Main] Suppressed WS error: ' + msg);
    return;
  }
  writeLogFile('error', '[Main] Uncaught: ' + msg);
});

let mainWindow = null;
let splash     = null;
/** ms splash stays visible from first paint; then crossfade to main */
const SPLASH_VISIBLE_MS = 2500;
/** Crossfade duration (splash out + main in) */
const SPLASH_FADE_MS = 420;
let splashShownAt = 0;
let mainReadyToShow = false;
let splashRevealScheduled = false;

/** Smoothstep 0..1 for a softer fade than linear */
function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Fade splash out while fading main in (reduces the hard cut / glitch at handoff).
 * Falls back to instant handoff if setOpacity is not supported.
 */
function crossfadeSplashToMain() {
  const mainWin = mainWindow;
  const splashWin = splash;

  if (!mainWin || mainWin.isDestroyed()) {
    splashRevealScheduled = false;
    return;
  }

  let opacitySupported = true;
  try {
    mainWin.setOpacity(0);
  } catch (e) {
    opacitySupported = false;
  }

  mainWin.setSkipTaskbar(false);
  mainWin.maximize();
  mainWin.show();

  if (!opacitySupported || !splashWin || splashWin.isDestroyed()) {
    try {
      if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
    } catch (e) {}
    splash = null;
    splashShownAt = 0;
    splashRevealScheduled = false;
    try {
      mainWin.setOpacity(1);
      mainWin.focus();
    } catch (e) {}
    return;
  }

  try {
    splashWin.setOpacity(1);
  } catch (e) {
    try {
      if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
    } catch (e2) {}
    splash = null;
    splashShownAt = 0;
    splashRevealScheduled = false;
    try {
      mainWin.setOpacity(1);
      mainWin.focus();
    } catch (e3) {}
    return;
  }

  const start = Date.now();
  const step = () => {
    const t = Math.min(1, (Date.now() - start) / SPLASH_FADE_MS);
    const s = smoothstep01(t);
    try {
      if (!mainWin.isDestroyed()) mainWin.setOpacity(s);
      if (splashWin && !splashWin.isDestroyed()) splashWin.setOpacity(1 - s);
    } catch (e) {
      try {
        if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
      } catch (e2) {}
      splash = null;
      splashShownAt = 0;
      splashRevealScheduled = false;
      try {
        if (!mainWin.isDestroyed()) {
          mainWin.setOpacity(1);
          mainWin.focus();
        }
      } catch (e3) {}
      return;
    }
    if (t >= 1) {
      try {
        if (splashWin && !splashWin.isDestroyed()) splashWin.destroy();
      } catch (e) {}
      splash = null;
      splashShownAt = 0;
      splashRevealScheduled = false;
      try {
        if (!mainWin.isDestroyed()) {
          mainWin.setOpacity(1);
          mainWin.focus();
        }
      } catch (e) {}
      return;
    }
    setTimeout(step, 16);
  };
  setTimeout(step, 16);
}

function scheduleSplashThenMain() {
  if (!mainReadyToShow || !splashShownAt || !mainWindow || mainWindow.isDestroyed()) return;
  if (splashRevealScheduled) return;
  splashRevealScheduled = true;
  const elapsed = Date.now() - splashShownAt;
  const wait = Math.max(0, SPLASH_VISIBLE_MS - elapsed);
  setTimeout(() => {
    crossfadeSplashToMain();
  }, wait);
}

/* ═══════════════════════════════════════════════════════════════════
   TECHON ERP LICENSE SERVER CONFIG
   ═══════════════════════════════════════════════════════════════════ */
const SERVER_URL = 'https://license.techon.lk';

let _tcLicMissingSecretLogged = false;

/**
 * Read first non-empty, non-comment line from tc_license_secret.txt (handles BOM, multiple lines).
 */
function readFirstSecretLineFromTxt(fp) {
  try {
    if (!fs.existsSync(fp)) return '';
    const raw = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line[0] === '#') continue;
      return line;
    }
  } catch (_) {}
  return '';
}

/** License API HMAC secret for X-TC-Token (same algorithm as PHP).
 *  1) process.env.LICENSE_SECRET (preferred) or process.env.TC_LIC_SERVER_SECRET
 *  2) tc_license_secret.txt — fallback only; production dist injects this file at build time from env
 *     (UTF-8, first non-empty non-# line), same value as server LICENSE_SECRET
 */
function getLicenseServerSecret() {
  const env = process.env.LICENSE_SECRET || process.env.TC_LIC_SERVER_SECRET;
  if (env && String(env).trim()) return String(env).trim();

  const fileCandidates = [];
  try {
    if (process.execPath) {
      fileCandidates.push(path.join(path.dirname(process.execPath), 'tc_license_secret.txt'));
    }
    try {
      if (typeof app.getPath === 'function') {
        const ex = app.getPath('exe');
        if (ex) fileCandidates.push(path.join(path.dirname(ex), 'tc_license_secret.txt'));
      }
    } catch (_) {}
    const rp = process.resourcesPath;
    if (rp && String(rp).trim()) {
      fileCandidates.push(path.join(rp, 'tc_license_secret.txt'));
    }
    try {
      if (typeof app.getPath === 'function') {
        fileCandidates.push(path.join(app.getPath('userData'), 'tc_license_secret.txt'));
      }
    } catch (_) {}
    fileCandidates.push(path.join(process.cwd(), 'tc_license_secret.txt'));
    fileCandidates.push(path.join(__dirname, '..', 'tc_license_secret.txt'));
    if (app.isPackaged === false) {
      fileCandidates.push(path.join(__dirname, 'tc_license_secret.txt'));
    }
  } catch (_) { /* no crash if paths unavailable */ }

  const debugPaths = (app.isPackaged === false || process.env.TC_LIC_DEBUG === '1');
  if (debugPaths) {
    try {
      console.log('[TC_LIC] Checking license file paths:', fileCandidates.slice());
    } catch (_e) {}
  }

  for (let i = 0; i < fileCandidates.length; i++) {
    const line = readFirstSecretLineFromTxt(fileCandidates[i]);
    if (line) return line;
  }
  if (app.isPackaged === true && !_tcLicMissingSecretLogged) {
    _tcLicMissingSecretLogged = true;
    try {
      writeLogFile(
        'warn',
        '[TC_LIC] LICENSE_SECRET not configured (set LICENSE_SECRET or TC_LIC_SERVER_SECRET, or tc_license_secret.txt beside the app).'
      );
    } catch (_) {}
  }
  return '';
}

/* ═══════════════════════════════════════════════════════════════════
   LICENSE STORAGE  (userData/tc_lic.dat — encrypted JSON)
   ═══════════════════════════════════════════════════════════════════ */
const LIC_FILE              = path.join(app.getPath('userData'), 'tc_lic.dat');
/* Encrypted local snapshot of the last successful server license check (clients only) */
const CLIENT_LIC_CACHE_FILE = path.join(app.getPath('userData'), 'tc_cli_lic.dat');
/* HMAC-signed file recording the last time a valid license check completed (all modes) */
const LAST_VERIFIED_FILE    = path.join(app.getPath('userData'), 'tc_clock.dat');
const LAST_KNOWN_TIME_FILE  = path.join(app.getPath('userData'), 'tc_last_known_time.dat');
/** Legacy passphrase (pre–per-user key file). Used only when upgrading or if key file missing. */
const LEGACY_ENC_PASS       = 'TC-ERP-2025-X9K7-HARDKEY-OBFS';
const LEGACY_CACHE_HMAC_KEY = 'TC-ERP-CACHE-HMAC-2025-v1';

const LOCAL_ENC_KEY_FILE    = () => path.join(app.getPath('userData'), 'tc_local_enc.key');
let _cryptoRootCached       = null;

/**
 * Root secret for local AES + HMAC. Prefer: env TC_LOCAL_ENC_KEY → userData file →
 * legacy constant if existing license/cache files predate key file → random new file on fresh install.
 */
function getCryptoRootSecret() {
  if (_cryptoRootCached !== null) return _cryptoRootCached;
  if (process.env.TC_LOCAL_ENC_KEY && String(process.env.TC_LOCAL_ENC_KEY).length >= 16) {
    _cryptoRootCached = String(process.env.TC_LOCAL_ENC_KEY);
    return _cryptoRootCached;
  }
  const kf = LOCAL_ENC_KEY_FILE();
  try {
    if (fs.existsSync(kf)) {
      const s = fs.readFileSync(kf, 'utf8').trim();
      if (s.length >= 16) {
        _cryptoRootCached = s;
        return _cryptoRootCached;
      }
    }
  } catch (e) {
    writeLogFile('warn', '[Crypto] read key file: ' + e.message);
  }
  const hasLegacyBlob =
    fs.existsSync(LIC_FILE) || fs.existsSync(CLIENT_LIC_CACHE_FILE) || fs.existsSync(LAST_VERIFIED_FILE);
  if (hasLegacyBlob) {
    _cryptoRootCached = LEGACY_ENC_PASS;
    return _cryptoRootCached;
  }
  try {
    const rnd = crypto.randomBytes(48).toString('base64');
    fs.mkdirSync(path.dirname(kf), { recursive: true });
    fs.writeFileSync(kf, rnd, { mode: 0o600 });
    _cryptoRootCached = rnd;
    return _cryptoRootCached;
  } catch (e) {
    writeLogFile('warn', '[Crypto] fallback to legacy secret: ' + e.message);
    _cryptoRootCached = LEGACY_ENC_PASS;
    return _cryptoRootCached;
  }
}

function migrateLegacyCryptoKeyFile(licensePayload) {
  const kf = LOCAL_ENC_KEY_FILE();
  if (fs.existsSync(kf)) return;
  if (!licensePayload) return;
  if (getCryptoRootSecret() !== LEGACY_ENC_PASS) return;
  try {
    const rnd = crypto.randomBytes(48).toString('base64');
    fs.mkdirSync(path.dirname(kf), { recursive: true });
    fs.writeFileSync(kf, rnd, { mode: 0o600 });
    _cryptoRootCached = rnd;
    saveLicense(licensePayload);
  } catch (e) {
    _cryptoRootCached = null;
    writeLogFile('warn', '[Crypto] migrate key file failed: ' + e.message);
  }
}

function encryptData(obj) {
  try {
    const json    = JSON.stringify(obj);
    const key     = crypto.scryptSync(getCryptoRootSecret(), 'tc-salt-9x', 32);
    const iv      = crypto.randomBytes(16);
    const cipher  = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc     = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  } catch (e) { return null; }
}

function decryptData(str) {
  try {
    const [ivHex, encHex] = str.split(':');
    const key    = crypto.scryptSync(getCryptoRootSecret(), 'tc-salt-9x', 32);
    const iv     = Buffer.from(ivHex, 'hex');
    const enc    = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const dec    = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch (e) { return null; }
}

function loadLicense() {
  try {
    if (!fs.existsSync(LIC_FILE)) return null;
    const raw = fs.readFileSync(LIC_FILE, 'utf8').trim();
    const data = decryptData(raw);
    if (data) migrateLegacyCryptoKeyFile(data);
    return data;
  } catch (e) { return null; }
}

function saveLicense(obj) {
  try {
    const enc = encryptData(obj);
    if (enc) fs.writeFileSync(LIC_FILE, enc, 'utf8');
  } catch (e) {}
}

/* ── Client license cache (offline fallback, max 2-hour validity) ──
   Encrypted with AES-256-CBC AND integrity-protected with an HMAC.
   The HMAC covers the canonical JSON of all payload fields; it is
   stored inside the encrypted blob as the `_hmac` key.             */
function saveClientLicCache(data) {
  try {
    /* Build payload (no _hmac yet) */
    const payload  = Object.assign({}, data, { cachedAt: Date.now() });
    const canonical = JSON.stringify(payload);
    const hmacKey   = crypto.scryptSync(getCryptoRootSecret(), 'tc-cache-hmac-k', 32);
    const hmac     = crypto.createHmac('sha256', hmacKey).update(canonical).digest('hex');
    const enc      = encryptData(Object.assign({}, payload, { _hmac: hmac }));
    if (enc) fs.writeFileSync(CLIENT_LIC_CACHE_FILE, enc, 'utf8');
  } catch (e) {
    writeLogFile('warn', '[ClientCache] Save failed: ' + e.message);
  }
}

function loadClientLicCache() {
  try {
    if (!fs.existsSync(CLIENT_LIC_CACHE_FILE)) return null;
    const raw = fs.readFileSync(CLIENT_LIC_CACHE_FILE, 'utf8').trim();
    const data = decryptData(raw);
    if (!data) return null;

    /* ── HMAC integrity check ──────────────────────────────────────
       The cache was saved with an _hmac field covering all other
       fields.  If it is missing or wrong the file has been tampered
       with — reject it completely and delete so the next successful
       server fetch rebuilds a clean copy.                           */
    const storedHmac = data._hmac;
    if (!storedHmac) {
      writeLogFile('warn', '[ClientCache] No HMAC in cache — old format or tampered. Rejecting.');
      try { fs.unlinkSync(CLIENT_LIC_CACHE_FILE); } catch (_e) {}
      return null;
    }
    /* Reconstruct payload without _hmac to verify signature */
    const payload    = Object.assign({}, data);
    delete payload._hmac;
    const canonical  = JSON.stringify(payload);
    const hmacKeyNew = crypto.scryptSync(getCryptoRootSecret(), 'tc-cache-hmac-k', 32);
    let expected     = crypto.createHmac('sha256', hmacKeyNew).update(canonical).digest('hex');
    let ok = false;
    try {
      if (storedHmac.length === expected.length && crypto.timingSafeEqual(Buffer.from(storedHmac, 'hex'), Buffer.from(expected, 'hex'))) ok = true;
    } catch (_e) {}
    if (!ok) {
      expected = crypto.createHmac('sha256', LEGACY_CACHE_HMAC_KEY).update(canonical).digest('hex');
      try {
        if (storedHmac.length === expected.length && crypto.timingSafeEqual(Buffer.from(storedHmac, 'hex'), Buffer.from(expected, 'hex'))) ok = true;
      } catch (_e2) {}
    }
    if (!ok) {
      writeLogFile('warn', '[ClientCache] HMAC mismatch — cache integrity check FAILED. Deleting.');
      try { fs.unlinkSync(CLIENT_LIC_CACHE_FILE); } catch (_e) {}
      return null;
    }

    return payload; /* return without _hmac field */
  } catch (e) {
    writeLogFile('warn', '[ClientCache] Load failed: ' + e.message);
    return null;
  }
}

/* ── Universal last-verified-time tracker (clock tampering, all modes) ──
   Stores the last timestamp at which a license check succeeded.
   The value is HMAC-signed so writing a fake timestamp is detectable.   */

function saveLastVerifiedTime() {
  try {
    const ts  = String(Date.now());
    const lvK = crypto.scryptSync(getCryptoRootSecret(), 'tc-last-verified', 32);
    const sig = crypto.createHmac('sha256', lvK).update(ts).digest('hex');
    fs.writeFileSync(LAST_VERIFIED_FILE, ts + ':' + sig, 'utf8');
  } catch (e) { /* non-fatal */ }
}

function loadLastVerifiedTime() {
  try {
    if (!fs.existsSync(LAST_VERIFIED_FILE)) return null;
    const raw      = fs.readFileSync(LAST_VERIFIED_FILE, 'utf8').trim();
    const sepIdx   = raw.lastIndexOf(':');
    if (sepIdx === -1) return null;
    const ts       = raw.slice(0, sepIdx);
    const sig      = raw.slice(sepIdx + 1);
    const lvK      = crypto.scryptSync(getCryptoRootSecret(), 'tc-last-verified', 32);
    let expected   = crypto.createHmac('sha256', lvK).update(ts).digest('hex');
    let match      = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    if (!match) {
      expected = crypto.createHmac('sha256', LEGACY_ENC_PASS + ':lv-2025').update(ts).digest('hex');
      match = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    }
    if (!match) {
      writeLogFile('warn', '[ClockCheck] Last-verified file signature invalid — possible tampering.');
      return null;
    }
    return parseInt(ts, 10);
  } catch (e) { return null; }
}

function saveLastKnownTime(ts) {
  try {
    const v = String(parseInt(ts || Date.now(), 10));
    const k = crypto.scryptSync(getCryptoRootSecret(), 'tc-last-known-time', 32);
    const sig = crypto.createHmac('sha256', k).update(v).digest('hex');
    fs.writeFileSync(LAST_KNOWN_TIME_FILE, v + ':' + sig, 'utf8');
  } catch (_e) {}
}

function loadLastKnownTime() {
  try {
    if (!fs.existsSync(LAST_KNOWN_TIME_FILE)) return null;
    const raw = fs.readFileSync(LAST_KNOWN_TIME_FILE, 'utf8').trim();
    const sep = raw.lastIndexOf(':');
    if (sep < 1) return null;
    const v = raw.slice(0, sep);
    const sig = raw.slice(sep + 1);
    const k = crypto.scryptSync(getCryptoRootSecret(), 'tc-last-known-time', 32);
    const exp = crypto.createHmac('sha256', k).update(v).digest('hex');
    if (sig.length !== exp.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(exp, 'hex'))) return null;
    return parseInt(v, 10);
  } catch (_e) { return null; }
}

/* ═══════════════════════════════════════════════════════════════════
   DEVICE ID GENERATION
   ═══════════════════════════════════════════════════════════════════ */
function generateDeviceId() {
  try {
    const cpus    = os.cpus();
    const cpuInfo = cpus && cpus.length > 0 ? (cpus[0].model || '') : '';
    const raw     = [
      os.hostname(),
      os.userInfo().username,
      os.platform(),
      os.arch(),
      cpuInfo
    ].join('|');
    return crypto.createHmac('sha256', 'tc-device-2025').update(raw).digest('hex').slice(0, 32);
  } catch (e) {
    const fbFile = path.join(app.getPath('userData'), 'tc_did.dat');
    if (fs.existsSync(fbFile)) {
      return fs.readFileSync(fbFile, 'utf8').trim().slice(0, 32);
    }
    const id = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(fbFile, id, 'utf8');
    return id;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HTTP/HTTPS REQUEST HELPER
   ═══════════════════════════════════════════════════════════════════ */
function tcRequest(endpoint, payload) {
  return new Promise((resolve, reject) => {
    try {
      const phpEndpoint = endpoint === '/activate' ? '/activate.php' : '/verify.php';
      const url = new URL(SERVER_URL + phpEndpoint);

      const body = JSON.stringify(payload);

      const secret = getLicenseServerSecret();
      if (!secret) {
        reject(new Error('License API secret missing: set LICENSE_SECRET or TC_LIC_SERVER_SECRET (or tc_license_secret.txt beside the app) — must match server LICENSE_SECRET.'));
        return;
      }

      const token = crypto
        .createHmac('sha256', secret)
        .update('techon-client')
        .digest('hex')
        .slice(0, 16);

      const options = {
        hostname : url.hostname,
        port     : url.port || (url.protocol === 'https:' ? 443 : 80),
        path     : url.pathname,
        method   : 'POST',
        headers  : {
          'Content-Type'   : 'application/json',
          'Content-Length' : Buffer.byteLength(body),
          'X-TC-Token'     : token,
          'User-Agent'     : 'TechonERP-Client/1.0',
          'Accept'         : 'application/json'
        }
      };

      /* Prefer strict TLS; license.techon.lk should present a valid chain. */
      if (url.protocol === 'https:') {
        options.agent = new https.Agent({ rejectUnauthorized: true });
      }

      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const clean = data.replace(/^[\s\uFEFF]+/, '');
          try {
            const json = JSON.parse(clean);
            resolve(json);
          } catch (e) {
            console.error('TC LICENSE: Invalid JSON from server. Raw response:', clean);
            reject(new Error('Bad server response'));
          }
        });
      });

      req.on('error', (err) => {
        console.error('TC LICENSE NETWORK ERROR:', err.message);
        reject(err);
      });

      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });

      req.write(body);
      req.end();

    } catch (e) {
      console.error('TC LICENSE REQUEST FAILED:', e.message);
      reject(e);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   TRIAL LOGIC
   ═══════════════════════════════════════════════════════════════════ */
const TRIAL_DAYS = 7;

/* ── Trial usage ceiling — unified 20-record limit per module ──────
   Applies to: products, sales, customers, expenses, purchases,
   suppliers, quotations, repairs.
   Enforced in the renderer (LicenseGate + tcTrialGuard in App).
   Main process returns TRIAL_MAX_RECORDS so both layers stay in sync. */
const TRIAL_MAX_RECORDS   = 20;
const TRIAL_MAX_SALES     = TRIAL_MAX_RECORDS;
const TRIAL_MAX_PRODUCTS  = TRIAL_MAX_RECORDS;
const TRIAL_MAX_CUSTOMERS = TRIAL_MAX_RECORDS;
const TRIAL_MAX_CLIENTS   = 2;

/* ── ProgramData anti-wipe device cache ────────────────────────────
   Stored in C:\ProgramData\TechonERP — survives per-user AppData wipes.
   Used as a secondary validation layer for device binding.            */
const PROGDATA_DIR  = 'C:\\ProgramData\\TechonERP';
const PROGDATA_FILE = path.join(PROGDATA_DIR, 'tc_device.dat');

function saveProgramDataCache(info) {
  try {
    if (!fs.existsSync(PROGDATA_DIR)) fs.mkdirSync(PROGDATA_DIR, { recursive: true });
    const enc = encryptData({ deviceId: info.deviceId, trialStart: info.trialStart, savedAt: Date.now() });
    if (enc) fs.writeFileSync(PROGDATA_FILE, enc, 'utf8');
  } catch (e) { /* non-fatal — ProgramData may not be writable in all environments */ }
}

function loadProgramDataCache() {
  try {
    if (!fs.existsSync(PROGDATA_FILE)) return null;
    return decryptData(fs.readFileSync(PROGDATA_FILE, 'utf8').trim());
  } catch (e) { return null; }
}

/* ── How often each plan must phone home ──────────────────────────
   3-day demo  → verify every 3 days (matches key lifetime)
   All paid    → verify every 7 days (weekly check)
   ─────────────────────────────────────────────────────────────── */
const VERIFY_INTERVALS = {
  '3days'   : 3,
  'monthly' : 7,
  'yearly'  : 7,
  '2year'   : 7,
  'lifetime': 7
};

/* Extra grace days if server unreachable when verification is due.
   3-day demo → 0 grace (strict, must verify exactly on day 3)
   All others → 2 days grace (brief internet outage buffer)    */
const OFFLINE_GRACE = {
  '3days'   : 0,
  'monthly' : 2,
  'yearly'  : 2,
  '2year'   : 2,
  'lifetime': 2
};
/* Extended offline policy (standalone + network_server only):
   0-7 days   : full access
   7-15 days  : warning (non-blocking)
   15+ days   : read-only until next successful sync */
const OFFLINE_FULL_ACCESS_DAYS = 7;
const OFFLINE_READONLY_DAYS    = 15;
const CLOUD_SYNC_INTERVAL_MS   = 8 * 60 * 60 * 1000; /* every 8 hours */

function getVerifyInterval(plan) {
  return VERIFY_INTERVALS[String(plan).toLowerCase()] || 7;
}

function getGraceDays(plan) {
  const g = OFFLINE_GRACE[String(plan).toLowerCase()];
  return g !== undefined ? g : 2;
}

function getTrialInfo() {
  const lic = loadLicense();
  if (!lic) {
    const deviceId = generateDeviceId();
    const info = {
      mode          : 'trial',
      trialStart    : Date.now(),
      trialMaxTs    : Date.now() + TRIAL_DAYS * 24 * 3600 * 1000,
      lastClockCheck: Date.now(),
      deviceId      : deviceId,   /* bind trial to this machine */
    };
    saveLicense(info);
    /* Also persist to ProgramData — survives per-user AppData wipes */
    saveProgramDataCache(info);
    return info;
  }
  /* Ensure ProgramData cache exists even on upgrades from older versions */
  if (lic.deviceId && !fs.existsSync(PROGDATA_FILE)) {
    saveProgramDataCache(lic);
  }
  return lic;
}

function isTrialExpired(lic) {
  if (lic.mode !== 'trial') return false;
  const now = Date.now();
  /* Only check backward clock tampering — forward jumps are harmless
     (they only accelerate the user's own trial expiry, not extend it) */
  if (lic.lastClockCheck && now < lic.lastClockCheck - 60000) {
    return true; // clock rolled back — treat as expired
  }
  if (now > (lic.lastClockCheck || 0)) {
    lic.lastClockCheck = now;
    saveLicense(lic);
  }
  return now > lic.trialMaxTs;
}

/* ── License grace period (3 days after expiry before hard lock) ──
   Gives shop owners buffer time to renew without an immediate lockout. */
const LICENSE_GRACE_DAYS = 3;

/**
 * Returns { inGrace: bool, graceDaysLeft: int } for a given expiry string.
 * Call ONLY when the license is already past its expiry date.
 */
function checkGracePeriod(expiresStr) {
  if (!expiresStr) return { inGrace: false, graceDaysLeft: 0 };
  const expTs = new Date(expiresStr).getTime();
  if (isNaN(expTs)) return { inGrace: false, graceDaysLeft: 0 };
  const now     = Date.now();
  const GRACE_MS = LICENSE_GRACE_DAYS * 24 * 3600 * 1000;
  if (now < expTs + GRACE_MS) {
    const graceDaysLeft = Math.max(1, Math.ceil((expTs + GRACE_MS - now) / (24 * 3600 * 1000)));
    return { inGrace: true, graceDaysLeft };
  }
  return { inGrace: false, graceDaysLeft: 0 };
}

function getDeviceStore() {
  return createDeviceStore(getCryptoRootSecret);
}

function resolveNetCfgArg(cfgOrKey) {
  if (cfgOrKey && typeof cfgOrKey === 'object') return cfgOrKey;
  return { apiKey: cfgOrKey || '' };
}

function buildLanHeaders(method, url, body, cfgOrKey, extraHeaders) {
  const cfg = resolveNetCfgArg(cfgOrKey);
  const bodyStr = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const forceLegacy = !!(cfg && cfg.forceLegacy);
  return stripInternalHeaders(buildLanAuthHeaders({
    method,
    url,
    body: bodyStr,
    networkConfig: cfg,
    deviceStore: getDeviceStore(),
    userDataPath: app.getPath('userData'),
    extraHeaders: extraHeaders || {},
    forceLegacy: forceLegacy,
  }));
}

/** GET a JSON endpoint on the LAN API. */
function lanGet(url, cfgOrKey) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const lib    = parsed.protocol === 'https:' ? https : http;
      const headers = Object.assign({
        'Accept': 'application/json',
      }, buildLanHeaders('GET', url, '', cfgOrKey));
      const opts   = {
        hostname : parsed.hostname,
        port     : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path     : parsed.pathname + (parsed.search || ''),
        method   : 'GET',
        headers  : headers,
      };
      const req = lib.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('lanGet: bad JSON from ' + url)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('lanGet timeout')); });
      req.end();
    } catch (e) { reject(e); }
  });
}

function getClientDeviceName() {
  try { return os.hostname() || 'Client-PC'; } catch (_e) { return 'Client-PC'; }
}

function applyVerifyPayloadToLicense(lic, resp, nowTs) {
  if (!lic || !resp) return lic;
  const now = nowTs || Date.now();
  lic.lastVerify = now;
  lic.lastSuccessfulSyncTime = now;
  if (resp.plan) lic.plan = resp.plan;
  if (resp.expires !== undefined) lic.expires = resp.expires;
  if (resp.max_clients !== undefined && resp.max_clients !== null && !isNaN(parseInt(resp.max_clients, 10))) {
    lic.max_clients = parseInt(resp.max_clients, 10);
  }
  return lic;
}

/** POST JSON to a LAN API endpoint with optional extra headers.
 *  optsOrTimeout: number (ms) or { timeoutMs } — wipe/large ops need >10s. */
function lanPost(url, body, extraHeaders, cfgOrKey, optsOrTimeout) {
  var timeoutMs = 10000;
  if (typeof optsOrTimeout === 'number' && optsOrTimeout > 0) timeoutMs = optsOrTimeout;
  else if (optsOrTimeout && typeof optsOrTimeout.timeoutMs === 'number' && optsOrTimeout.timeoutMs > 0) {
    timeoutMs = optsOrTimeout.timeoutMs;
  }
  return new Promise((resolve, reject) => {
    try {
      const parsed  = new URL(url);
      const bodyStr = JSON.stringify(body);
      const lib     = parsed.protocol === 'https:' ? https : http;
      const cfg = extraHeaders && extraHeaders._tcNetCfg ? extraHeaders._tcNetCfg : cfgOrKey;
      const extra = Object.assign({}, extraHeaders || {});
      delete extra._tcNetCfg;
      const opts    = {
        hostname : parsed.hostname,
        port     : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path     : parsed.pathname + (parsed.search || ''),
        method   : 'POST',
        headers  : Object.assign({
          'Content-Type'   : 'application/json',
          'Content-Length' : Buffer.byteLength(bodyStr),
          'Accept'         : 'application/json',
        }, buildLanHeaders('POST', url, bodyStr, cfg || loadNetworkConfig(), extra)),
      };
      const req = lib.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('lanPost: bad JSON from ' + url)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('lanPost timeout')); });
      req.write(bodyStr);
      req.end();
    } catch (e) { reject(e); }
  });
}

/**
 * Internal retry helper — not called directly.
 * Attempt to POST license snapshot to save_license.php.
 * Retries up to 3 times with exponential-ish back-off (500 → 1000 → 2000 ms).
 * After a successful save, re-fetches check_license.php to verify consistency.
 */
async function _syncAttempt(payload, cfg, attempt) {
  const DELAYS = [0, 500, 1000, 2000];
  if (attempt > 0 && attempt < DELAYS.length) {
    await new Promise(function(r) { setTimeout(r, DELAYS[attempt]); });
  }
  try {
    const headers = { 'X-TC-License-Sync': cfg.apiKey };
    const saveUrl = lanMainLoopbackUrl(cfg, 'save_license.php') || (cfg.apiUrl + 'save_license.php');
    const r = await lanPost(
      saveUrl,
      payload,
      headers,
      cfg
    );
    if (!r.success) throw new Error(r.message || 'save_license returned success:false');

    writeLogFile('info', '[LicenseSync] Saved' +
      (attempt > 0 ? ' (attempt ' + (attempt + 1) + ')' : '') +
      ': status=' + payload.status);

    /* ── Post-save consistency check ───────────────────────────────
       Re-fetch check_license.php immediately to confirm MySQL has
       the correct data.  A mismatch here is logged but never blocks
       the caller — the next sync will correct it.                   */
    try {
      const verify = await lanGet(cfg.apiUrl + 'check_license.php', cfg.apiKey);
      if (verify.success) {
        writeLogFile('info', '[LicenseSync] Verified post-save: ' + (verify.status || 'ok'));
      } else {
        writeLogFile('warn', '[LicenseSync] Post-save verify returned failure: ' + (verify.message || '?'));
      }
    } catch (ve) {
      writeLogFile('warn', '[LicenseSync] Post-save verify fetch failed: ' + ve.message);
    }

  } catch (e) {
    writeLogFile('warn', '[LicenseSync] Attempt ' + (attempt + 1) + ' failed: ' + e.message);
    if (attempt < 3) {
      _syncAttempt(payload, cfg, attempt + 1); /* fire next retry (no await) */
    } else {
      writeLogFile('warn', '[LicenseSync] All retries exhausted. MySQL license snapshot may be stale.');
    }
  }
}

function buildMysqlLicensePayload(licData) {
  const status = licData.status || 'none';
  return {
    status        : status,
    shop_name     : licData.shopName != null ? licData.shopName : null,
    license_key   : (licData.key != null && licData.key !== '') ? licData.key : (status === 'trial' ? '' : null),
    plan          : licData.plan != null ? licData.plan : null,
    expires_at    : licData.expires != null ? licData.expires : null,
    trial_ends_at : licData.trialEndsAt != null ? licData.trialEndsAt : null,
    max_clients   : licData.maxClients != null ? licData.maxClients : null,
    read_only     : licData.readOnly ? 1 : 0,
  };
}

function isLocalTrialLicense() {
  const lic = loadLicense();
  if (!lic) return true;
  if (lic.mode !== 'activated') return !isTrialExpired(lic);
  return false;
}

function getTrialLicenseSnapshot() {
  const lic = getTrialInfo();
  return {
    status     : 'trial',
    shopName   : lic.shopName || '',
    key        : null,
    plan       : 'trial',
    expires    : null,
    trialEndsAt: new Date(lic.trialMaxTs).toISOString(),
    maxClients : TRIAL_MAX_CLIENTS,
    readOnly   : false,
  };
}

async function syncTrialLicenseToMySQLNow(cfg) {
  if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl || !cfg.apiKey) {
    return { ok: false, message: 'Network server not configured.' };
  }
  if (!isLocalTrialLicense()) {
    return { ok: false, message: 'Not in trial mode.' };
  }
  const payload = buildMysqlLicensePayload(getTrialLicenseSnapshot());
  try {
    const saveUrl = (typeof lanMainLoopbackUrl === 'function' ? lanMainLoopbackUrl(cfg, 'save_license.php') : '') || (cfg.apiUrl + 'save_license.php');
    const r = await lanPost(saveUrl, payload, { 'X-TC-License-Sync': cfg.apiKey }, cfg);
    if (!r.success) throw new Error(r.message || 'save_license returned success:false');
    writeLogFile('info', '[LicenseSync] Trial synced to MySQL — max_clients=' + TRIAL_MAX_CLIENTS);
    return { ok: true, message: 'Trial license synced to server database.', max_clients: TRIAL_MAX_CLIENTS };
  } catch (e) {
    writeLogFile('warn', '[LicenseSync] Trial sync failed: ' + (e && e.message ? e.message : String(e)));
    return { ok: false, message: e && e.message ? e.message : 'Trial sync failed.' };
  }
}

function syncTrialLicenseToMySQL(cfg) {
  if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl || !cfg.apiKey) return;
  if (!isLocalTrialLicense()) return;
  syncLicenseToMySQL(getTrialLicenseSnapshot(), cfg);
}

/**
 * Sync the current license snapshot to MySQL on the server.
 * Fire-and-forget with automatic retry — never blocks the caller.
 */
function syncLicenseToMySQL(licData, cfg) {
  if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl || !cfg.apiKey) return;
  _syncAttempt(buildMysqlLicensePayload(licData), cfg, 0);
}

function isCloudVerifySuccess(status) {
  const s = String(status || '').toUpperCase();
  return s === 'OK' || s === 'VALID';
}

async function forceCloudLicenseSync(manualTrigger) {
  const cfg = loadNetworkConfig();
  if (cfg && cfg.role === 'network_client') {
    return { ok: false, message: 'Network clients sync from server automatically.' };
  }
  const lic = loadLicense();
  if (!lic || lic.mode !== 'activated' || !lic.key) {
    if (cfg && cfg.role === 'network_server' && isLocalTrialLicense()) {
      const trialRes = await syncTrialLicenseToMySQLNow(cfg);
      if (trialRes.ok) {
        writeLogFile('info', '[LicenseSync] Trial MySQL sync OK' + (manualTrigger ? ' (manual)' : ' (background)'));
      }
      return trialRes;
    }
    return { ok: false, message: 'No activated license found on this PC.' };
  }
  const deviceId = generateDeviceId();
  const now = Date.now();
  const resp = await tcRequest('/verify', { license_key: lic.key, device_id: deviceId });
  if (!isCloudVerifySuccess(resp.status)) {
    if (resp.status === 'EXPIRED') return { ok: false, needsReactivation: true, message: 'License expired on cloud. Please renew.' };
    if (resp.status === 'INVALID') {
      try { fs.unlinkSync(LIC_FILE); } catch (_e) {}
      return { ok: false, needsReactivation: true, message: 'License invalid on cloud. Please reactivate.' };
    }
    return { ok: false, message: resp.message || 'License sync failed.' };
  }
  applyVerifyPayloadToLicense(lic, resp, now);
  saveLicense(lic);
  saveLastVerifiedTime();
  syncLicenseToMySQL(
    { status: 'activated', shopName: lic.shopName, key: lic.key, plan: lic.plan, expires: lic.expires, maxClients: lic.max_clients, readOnly: false },
    cfg
  );
  writeLogFile('info', '[LicenseSync] Cloud sync OK' + (manualTrigger ? ' (manual)' : ' (background)'));
  return { ok: true, plan: lic.plan || null, expires: lic.expires || null, max_clients: lic.max_clients || null, syncedAt: now };
}

/** Force online license check (Settings → About). Ignores periodic verify interval. */
async function verifyLicenseOnlineNow() {
  const cfg = loadNetworkConfig();
  const checkedAt = new Date().toLocaleString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  if (cfg && cfg.role === 'network_client' && cfg.apiUrl) {
    try {
      const _devId = generateDeviceId();
      const qs = '?deviceId=' + encodeURIComponent(_devId) +
        '&deviceName=' + encodeURIComponent(getClientDeviceName());
      const data = await lanGet(cfg.apiUrl + 'check_license.php' + qs, cfg.apiKey);
      const d = data.data || {};
      let mappedStatus = 'locked';
      if (data.success && data.valid) {
        mappedStatus = data.status || 'activated';
      } else if (data.status === 'blocked') {
        mappedStatus = 'blocked';
      } else if (data.status === 'expired') {
        const { inGrace } = checkGracePeriod(d.expires);
        mappedStatus = inGrace ? 'grace' : 'expired';
      }
      const graceDaysLeft = mappedStatus === 'grace'
        ? checkGracePeriod(d.expires).graceDaysLeft
        : undefined;
      const status = {
        status         : mappedStatus,
        shopName       : d.shop_name || '',
        plan           : d.plan || '',
        expires        : d.expires || null,
        daysLeft       : d.days_left !== undefined ? d.days_left : null,
        graceDaysLeft  : graceDaysLeft,
        fromServer     : true,
        checkedAt      : checkedAt,
        message        : data.message || '',
        networkRole    : 'network_client',
        deviceId       : _devId,
      };
      if (['activated', 'trial', 'grace'].indexOf(mappedStatus) !== -1) {
        saveClientLicCache(status);
      }
      const needsReactivation = ['locked', 'expired', 'blocked'].includes(mappedStatus);
      return {
        ok: true,
        status,
        needsReactivation,
        message: needsReactivation
          ? (data.message || 'Server license is not active. Reactivate on the Main PC.')
          : 'License verified with the main server.',
      };
    } catch (e) {
      return {
        ok: false,
        message: 'Cannot reach the main server. Check that the Main PC is running and connected.',
      };
    }
  }

  const lic = loadLicense();
  if (!lic || lic.mode !== 'activated' || !lic.key) {
    return {
      ok: true,
      status: { status: 'trial', checkedAt },
      needsReactivation: true,
      message: 'No activated license found on this PC. Enter a license key to activate.',
    };
  }

  const deviceId = generateDeviceId();
  const now = Date.now();
  try {
    const resp = await tcRequest('/verify', { license_key: lic.key, device_id: deviceId });

    if (resp.status === 'INVALID') {
      try { fs.unlinkSync(LIC_FILE); } catch (_e) {}
      const reason = 'License deactivated or reset. Please reactivate with a valid key.';
      writeLogFile('warn', '[LicenseVerifyNow] Cloud returned INVALID — local license cleared.');
      return {
        ok: true,
        status: { status: 'locked', reason, checkedAt },
        needsReactivation: true,
        message: reason,
      };
    }

    if (resp.status === 'EXPIRED') {
      const _expiresStr = resp.expires || lic.expires || null;
      const { inGrace, graceDaysLeft } = checkGracePeriod(_expiresStr);
      if (inGrace) {
        return {
          ok: true,
          status: {
            status: 'grace',
            shopName: lic.shopName,
            key: lic.key,
            plan: resp.plan || lic.plan || null,
            expires: _expiresStr,
            graceDaysLeft,
            deviceId,
            checkedAt,
          },
          needsReactivation: false,
          message: 'License expired but you are still in the grace period (' + graceDaysLeft + ' day(s) left).',
        };
      }
      const reason = 'Your Techon ERP license has expired. Please renew or reactivate.';
      return {
        ok: true,
        status: { status: 'expired', reason, plan: lic.plan || null, expires: _expiresStr, checkedAt },
        needsReactivation: true,
        message: reason,
      };
    }

    if (!isCloudVerifySuccess(resp.status)) {
      return { ok: false, message: resp.message || 'License verification failed.' };
    }

    applyVerifyPayloadToLicense(lic, resp, now);
    lic.lastVerify = now;
    lic.lastSuccessfulSyncTime = now;
    saveLicense(lic);
    saveLastVerifiedTime();
    saveLastKnownTime(now);
    syncLicenseToMySQL(
      {
        status: 'activated',
        shopName: lic.shopName,
        key: lic.key,
        plan: lic.plan,
        expires: lic.expires,
        maxClients: lic.max_clients,
        readOnly: false,
      },
      cfg
    );
    writeLogFile('info', '[LicenseVerifyNow] Cloud verify OK');
    return {
      ok: true,
      status: {
        status: 'activated',
        shopName: lic.shopName,
        key: lic.key,
        plan: lic.plan || null,
        expires: lic.expires || null,
        deviceId,
        maxClients: lic.max_clients != null ? parseInt(lic.max_clients, 10) || 0 : null,
        checkedAt,
      },
      needsReactivation: false,
      message: 'License verified with Techon cloud. Your license is active.',
    };
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : 'Network error';
    writeLogFile('warn', '[LicenseVerifyNow] ' + msg);
    return {
      ok: false,
      message: 'Cannot reach the license server. Check your internet connection and try again.',
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   IPC HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

ipcMain.handle('tc-license-status', async () => {
  /* ══════════════════════════════════════════════════════════════
     UNIVERSAL CLOCK TAMPERING DETECTION  (all modes)
     Checks whether the system clock has been wound backwards since
     the last successful license verification.  Uses a HMAC-signed
     timestamp file so the record cannot be silently overwritten.
     ══════════════════════════════════════════════════════════════ */
  const _clockNow      = Date.now();
  const _lastVerified  = loadLastVerifiedTime();
  const _lastKnownTime = loadLastKnownTime();
  const _clockBackwards = _lastKnownTime && _clockNow < (_lastKnownTime - 60000);
  const _debugLic = app && app.isPackaged === false;
  if (_clockBackwards && _debugLic) {
    writeLogFile('info', '[LicenseDebug] Clock rollback detected: now=' + _clockNow + ' lastKnown=' + _lastKnownTime);
  }
  if (_lastVerified && _clockNow < _lastVerified - 90000) {
    /* > 90 s backward jump — clock was tampered or rollback tool used */
    writeLogFile('warn',
      '[ClockCheck] Backward jump detected. now=' + _clockNow +
      ' lastVerified=' + _lastVerified +
      ' diff=' + (_lastVerified - _clockNow) + 'ms'
    );
    return {
      status       : 'locked',
      clockTampered: true,
      isReadOnly   : true,
      readOnlyReason: 'clock_tamper',
      reason       : 'System time has changed.\nPlease correct your computer clock and restart the app.\n\nContact Techon Computers support if this keeps happening.',
    };
  }
  if (_clockBackwards) {
    return {
      status: 'activated',
      isReadOnly: true,
      readOnlyReason: 'clock_tamper',
      message: 'System clock moved backwards. Connect internet to verify license.',
      clockTampered: true,
    };
  }
  /* Record the current time as "last verified" (before any early returns) */
  saveLastVerifiedTime();
  saveLastKnownTime(_clockNow);

  /* ── NETWORK CLIENT: read license from the LAN server ───────────
     Clients never check the external license server directly.
     They read the snapshot the server writes to shop_license.
     Offline cache (max 2 hours) used as fallback.                   */
  const _netCfg = loadNetworkConfig();
  if (_netCfg && _netCfg.role === 'network_client' && _netCfg.apiUrl) {
    const checkedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    try {
      const qs = '?deviceId=' + encodeURIComponent(generateDeviceId()) + '&deviceName=' + encodeURIComponent(getClientDeviceName());
      const data = await lanGet(_netCfg.apiUrl + 'check_license.php' + qs, _netCfg.apiKey);
      const d    = data.data || {};

      /* Determine mapped status, applying grace period for expired */
      let mappedStatus = 'locked';
      if (data.success) {
        if (data.status === 'blocked') {
          mappedStatus = 'blocked';
        } else if (data.status === 'read_only') {
          mappedStatus = (d.read_only_reason === 'trial_limit_reached') ? 'trial' : 'activated';
        } else
        if (data.valid) {
          mappedStatus = data.status || 'activated';
        } else {
          /* Server says expired — apply local grace period before locking */
          const { inGrace, graceDaysLeft } = checkGracePeriod(d.expires);
          if (inGrace) {
            mappedStatus = 'grace';
            writeLogFile('info', '[LicenseClient] Server license expired; grace ' + graceDaysLeft + 'd left');
          } else {
            mappedStatus = 'expired';
            writeLogFile('warn', '[LicenseClient] Server license expired and grace period over');
          }
        }
      } else {
        writeLogFile('warn', '[LicenseClient] check_license returned failure: ' + (data.message || '?'));
        if (data.status === 'blocked') mappedStatus = 'blocked';
        else if (data.status === 'expired') mappedStatus = 'expired';
      }

      const _devId = generateDeviceId();
      const result = {
        status         : mappedStatus,
        shopName       : d.shop_name || '',
        plan           : d.plan      || '',
        expires        : d.expires   || null,
        daysLeft       : d.days_left !== undefined ? d.days_left : null,
        graceDaysLeft  : (mappedStatus === 'grace') ? checkGracePeriod(d.expires).graceDaysLeft : undefined,
        fromServer     : true,
        checkedAt      : checkedAt,
        message        : data.message || '',
        isReadOnly     : data.status === 'read_only' || d.read_only === 1 || d.read_only === true,
        maxClients     : d.max_clients != null ? parseInt(d.max_clients, 10) || 0 : null,
        connectedClients: d.connected_clients != null ? parseInt(d.connected_clients, 10) || 0 : null,
        readOnlyReason : d.read_only_reason || (mappedStatus === 'blocked' ? 'blocked' : ''),
        /* Server-provided counts — clients use these instead of local arrays.
           Only present when server is in trial mode.                          */
        serverCounts   : d.serverCounts    || null,
        trialMaxRecords: d.trialMaxRecords || 20,
        networkRole    : 'network_client', /* flag so renderer knows not to use local counts */
        /* supportsCounts=true means this server version CAN supply module counts.
           If false/absent, the server is an older version that needs updating.  */
        supportsCounts : data.supportsCounts === true,
        /* Terminal identity (display + sale tagging) — does not affect license decisions */
        clientLabel    : d.client_label ? String(d.client_label) : '',
        terminalDeviceId: _devId,
        deviceId       : _devId,
      };

      /* ── Cache mismatch protection ─────────────────────────────
         If the server returns different shop_name or plan from what
         is stored in the local cache, the cache is stale or has been
         tampered with.  Delete it and write fresh data from server.  */
      if (['activated', 'trial', 'grace'].indexOf(mappedStatus) !== -1) {
        const _existing = loadClientLicCache();
        if (_existing) {
          const _shopMismatch = _existing.shopName && result.shopName &&
                                _existing.shopName !== result.shopName;
          const _planMismatch = _existing.plan     && result.plan     &&
                                _existing.plan     !== result.plan;
          if (_shopMismatch || _planMismatch) {
            writeLogFile('warn',
              '[LicenseClient] Cache mismatch! ' +
              'shopName: "' + _existing.shopName + '" vs "' + result.shopName + '" | ' +
              'plan: "' + _existing.plan + '" vs "' + result.plan + '". ' +
              'Invalidating old cache.'
            );
            try { fs.unlinkSync(CLIENT_LIC_CACHE_FILE); } catch (_e) {}
          }
        }
        saveClientLicCache(result);
      }

      if (_debugLic) {
        writeLogFile('info', '[LicenseDebug] client status=' + String(result.status) + ' readonly=' + (result.isReadOnly ? '1' : '0'));
        if (result.maxClients != null || result.connectedClients != null) {
          writeLogFile('info', '[LicenseDebug] clients count=' + String(result.connectedClients || 0) + ' max=' + String(result.maxClients || 0) + ' decision=' + String(result.status || 'unknown'));
        }
      }
      return result;

    } catch (e) {
      writeLogFile('warn', '[LicenseClient] Cannot reach server: ' + e.message);

      /* ── Offline fallback: three-tier cache policy ───────────────
         Tier 1  (<  2 h): allow silently — normal fromCache
         Tier 2  (2–24 h): allow with visible cacheWarning flag
         Tier 3  (> 24 h): hard lock — cache has expired            */
      const cache       = loadClientLicCache();
      const TWO_HRS     = 2  * 3600 * 1000;
      const TWENTYFOUR  = 24 * 3600 * 1000;

      if (cache && cache.cachedAt) {
        const ageMs  = Date.now() - cache.cachedAt;
        const ageMin = Math.round(ageMs / 60000);
        const ageHrs = (ageMs / 3600000).toFixed(1);

        if (ageMs < TWO_HRS) {
          /* Tier 1 — recent cache, no extra warning */
          writeLogFile('info',
            '[LicenseClient] Tier-1 cache (' + ageMin + ' min). Server unreachable.');
          return Object.assign({}, cache, {
            fromCache    : true,
            cacheWarning : false,
            checkedAt    : checkedAt,
            message      : 'Using last known license. Server not reachable.',
          });
        }

        if (ageMs < TWENTYFOUR) {
          /* Tier 2 — aged cache, warn the user */
          writeLogFile('warn',
            '[LicenseClient] Tier-2 cache (' + ageHrs + 'h). Warning shown.');
          return Object.assign({}, cache, {
            fromCache    : true,
            cacheWarning : true,
            checkedAt    : checkedAt,
            message      : 'Server unreachable for ' + ageHrs + 'h. License check overdue.',
          });
        }

        /* Tier 3 — cache older than 24 h, hard lock */
        writeLogFile('warn',
          '[LicenseClient] Tier-3: cache expired (' + ageHrs + 'h > 24h). Locking.');
      } else {
        writeLogFile('warn', '[LicenseClient] No valid cache found. Locking client.');
      }

      return {
        status    : 'locked',
        fromServer: true,
        checkedAt : checkedAt,
        message   : 'Server not reachable. Please start the main server PC.',
      };
    }
  }

  /* ── STANDALONE + NETWORK SERVER: existing local license logic ── */
  const deviceId     = generateDeviceId();
  /* Capture whether the license file existed BEFORE getTrialInfo() creates it.
     Used by the renderer to detect trial-reset tampering (no file + has sales). */
  const licFileExisted = fs.existsSync(LIC_FILE);
  const lic            = getTrialInfo();

  if (lic.mode === 'activated') {
    const now = Date.now();

    /* ── BACKWARD CLOCK TAMPERING DETECTION ──────────────────────────
       Only block backward jumps. A user rolling the clock backward
       could extend their trial or delay expiry checks.
       Forward jumps are intentionally NOT blocked — if someone rolls
       their clock forward they only accelerate their own expiry,
       and blocking it would lock out every customer every morning
       (overnight gap of 8-12h easily exceeds any "safe" threshold). */
    if (lic.lastClockCheck && now < lic.lastClockCheck - 60000) {
      return {
        status : 'locked',
        reason : 'System clock tampering detected.\nPlease set your computer date/time correctly.\n\nContact Techon Computers support if this is an error.'
      };
    }

    /* Update clock check timestamp */
    lic.lastClockCheck = now;
    saveLicense(lic);

    /* ── LOCAL EXPIRY CHECK (fast path, no network needed) ────────── */
    if (lic.expires && lic.plan !== 'lifetime') {
      const expTs = new Date(lic.expires).getTime();
      if (!isNaN(expTs) && now > expTs) {
        /* Apply grace period before hard lock */
        const { inGrace, graceDaysLeft } = checkGracePeriod(lic.expires);
        if (inGrace) {
          writeLogFile('info', '[LicenseStatus] Local expiry grace: ' + graceDaysLeft + 'd left');
          return {
            status        : 'grace',
            shopName      : lic.shopName,
            key           : lic.key,
            plan          : lic.plan    || null,
            expires       : lic.expires || null,
            graceDaysLeft : graceDaysLeft,
            deviceId      : deviceId,
            reason        : 'License expired. Please renew soon.',
          };
        }
        return {
          status : 'expired',
          reason : 'Your Techon ERP license has expired.\nPlease renew your license.\nContact Techon Computers.',
          plan   : lic.plan    || 'monthly',
          expires: lic.expires || null
        };
      }
    }

    const verifyInterval  = getVerifyInterval(lic.plan);
    const daysSinceVerify = (now - (lic.lastVerify || 0)) / (24 * 3600 * 1000);

    if (daysSinceVerify >= verifyInterval) {
      try {
        // ── Online: server reachable ─────────────────────────────
        const resp = await tcRequest('/verify', { license_key: lic.key, device_id: deviceId });

        if (resp.status === 'EXPIRED') {
          const _expiresStr = resp.expires || lic.expires || null;
          const { inGrace, graceDaysLeft } = checkGracePeriod(_expiresStr);
          if (inGrace) {
            writeLogFile('info', '[LicenseStatus] Online verify expired; grace ' + graceDaysLeft + 'd left');
            return {
              status        : 'grace',
              shopName      : lic.shopName,
              key           : lic.key,
              plan          : resp.plan    || lic.plan    || null,
              expires       : _expiresStr,
              graceDaysLeft : graceDaysLeft,
              deviceId      : deviceId,
              reason        : 'License expired. Please renew soon.',
            };
          }
          return {
            status : 'expired',
            reason : 'Your Techon ERP license has expired.\nPlease renew your license.\nContact Techon Computers.',
            plan   : resp.plan    || lic.plan    || 'monthly',
            expires: _expiresStr
          };
        }

        if (resp.status === 'INVALID') {
          try { fs.unlinkSync(LIC_FILE); } catch(e) {}
          return { status: 'locked', reason: 'License deactivated or reset. Please reactivate with a valid key.' };
        }

        // VALID — update local cache with latest server data
        applyVerifyPayloadToLicense(lic, resp, now);
        saveLicense(lic);
        saveLastKnownTime(now);
        /* Sync refreshed data to MySQL (network_server only) */
        syncLicenseToMySQL({ status: 'activated', shopName: lic.shopName, key: lic.key, plan: lic.plan, expires: lic.expires, maxClients: lic.max_clients, readOnly: false }, _netCfg);
        if (_debugLic) writeLogFile('info', '[LicenseDebug] verify success, synced to mysql');

      } catch (e) {
        // ── Offline / server unreachable: extended 15-day policy ───────────
        const baseSync = lic.lastSuccessfulSyncTime || lic.lastVerify || lic.activatedAt || now;
        const daysOffline = Math.max(0, (now - baseSync) / (24 * 3600 * 1000));
        const shouldWarn = daysOffline > OFFLINE_FULL_ACCESS_DAYS && daysOffline < OFFLINE_READONLY_DAYS;
        const shouldReadOnly = daysOffline >= OFFLINE_READONLY_DAYS;
        if (shouldReadOnly && _netCfg && _netCfg.role === 'network_server') {
          syncLicenseToMySQL(
            { status: 'activated', shopName: lic.shopName, key: lic.key, plan: lic.plan, expires: lic.expires, maxClients: lic.max_clients, readOnly: true },
            _netCfg
          );
        }
        if (_debugLic) {
          writeLogFile('info', '[LicenseDebug] offline days=' + Math.floor(daysOffline) + ' readonly=' + (shouldReadOnly ? '1' : '0'));
        }

        // Within grace — double-check local expiry
        if (lic.expires && lic.plan !== 'lifetime') {
          const expTs = new Date(lic.expires).getTime();
          if (!isNaN(expTs) && now > expTs) {
            return {
              status : 'expired',
              reason : 'Your Techon ERP license has expired.\nPlease renew your license.\nContact Techon Computers.',
              plan   : lic.plan    || 'monthly',
              expires: lic.expires || null
            };
          }
        }
        // Offline allowed by policy — attach warning / readonly flags in response
        if (shouldWarn) {
          writeLogFile('warn', '[LicenseStatus] Offline sync overdue ' + Math.floor(daysOffline) + ' day(s) — warning only.');
        }
        if (shouldReadOnly) {
          writeLogFile('warn', '[LicenseStatus] Offline > ' + OFFLINE_READONLY_DAYS + ' days — read-only mode.');
          if (_debugLic) writeLogFile('info', '[LicenseDebug] read-only reason=offline_timeout');
        }
        lic._offlineWarning = shouldWarn;
        lic._offlineReadOnly = shouldReadOnly;
        lic._offlineDays = daysOffline;
      }
    }

    /* For 3-day demo keys, calculate remaining days for banner */
    let daysLeft3d = null;
    if (lic.plan === '3days' && lic.expires) {
      const expTs  = new Date(lic.expires).getTime();
      const msLeft = expTs - Date.now();
      daysLeft3d   = Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000)));
    }

    /* Days until expiry (for pre-expiry reminder banners) */
    let daysUntilExpiry = null;
    if (lic.expires && lic.plan !== 'lifetime') {
      const expTs  = new Date(lic.expires).getTime();
      const msLeft = expTs - Date.now();
      if (msLeft > 0) {
        daysUntilExpiry = Math.ceil(msLeft / (24 * 3600 * 1000));
      }
    }

    /* Device binding — detect if ERP folder was copied to another machine */
    const actDeviceMismatch = lic.deviceId && lic.deviceId !== deviceId;
    if (actDeviceMismatch) {
      writeLogFile('warn', '[DeviceBinding] Activated license device mismatch. stored=' + lic.deviceId + ' current=' + deviceId);
    }

    return {
      status         : 'activated',
      shopName       : lic.shopName,
      key            : lic.key,
      plan           : lic.plan    || null,
      expires        : lic.expires || null,
      deviceId       : deviceId,
      daysLeft       : daysLeft3d,
      daysUntilExpiry: daysUntilExpiry,
      deviceMismatch : actDeviceMismatch || false,
      maxClients     : lic.max_clients != null ? parseInt(lic.max_clients, 10) || 0 : null,
      isReadOnly     : !!lic._offlineReadOnly,
      offlineWarning : !!lic._offlineWarning,
      offlineDays    : lic._offlineDays != null ? Math.floor(lic._offlineDays) : 0,
      lastSuccessfulSyncTime: lic.lastSuccessfulSyncTime || lic.lastVerify || null,
      readOnlyReason : lic._offlineReadOnly ? 'offline_timeout' : '',
      readOnlyReasonText : lic._offlineReadOnly ? 'No successful cloud sync for more than 15 days.' : '',
    };
  }

  if (isTrialExpired(lic)) {
    writeLogFile('info', '[Trial] Trial expired (time limit reached)');
    return { status: 'expired', deviceId };
  }

  /* Device binding check for trial — detects copied ERP installation */
  const trialDeviceMismatch = lic.deviceId && lic.deviceId !== deviceId;
  if (trialDeviceMismatch) {
    writeLogFile('warn', '[DeviceBinding] Trial device mismatch. stored=' + lic.deviceId + ' current=' + deviceId);
  }

  /* ProgramData secondary check — if AppData was wiped but ProgramData survived,
     the cached deviceId should match.  A mismatch means the data folder was copied. */
  const pdCache = loadProgramDataCache();
  const pdMismatch = pdCache && pdCache.deviceId && pdCache.deviceId !== deviceId;
  if (pdMismatch) {
    writeLogFile('warn', '[DeviceBinding] ProgramData device mismatch. cached=' + pdCache.deviceId + ' current=' + deviceId);
  }

  const msLeft   = lic.trialMaxTs - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000)));
  const _trialNetCfg = loadNetworkConfig();
  syncTrialLicenseToMySQL(_trialNetCfg);
  return {
    status            : 'trial',
    daysLeft          : daysLeft,
    deviceId          : deviceId,
    deviceMismatch    : (trialDeviceMismatch || pdMismatch) || false,
    maxClients        : TRIAL_MAX_CLIENTS,
    isNewTrial        : !licFileExisted,        /* true only when file was just created */
    trialMaxRecords   : TRIAL_MAX_RECORDS,      /* unified limit for all modules */
    trialMaxSales     : TRIAL_MAX_SALES,
    trialMaxProducts  : TRIAL_MAX_PRODUCTS,
    trialMaxCustomers : TRIAL_MAX_CUSTOMERS,
    trialDays         : TRIAL_DAYS,
  };
});

ipcMain.handle('tc-activate', async (_event, { licenseKey, shopName }) => {
  /* ── Block activation on network client PCs ─────────────────── */
  const _activateCfg = loadNetworkConfig();
  if (_activateCfg && _activateCfg.role === 'network_client') {
    return { ok: false, message: 'License activation is only allowed on the main server PC. Clients read the license from the server automatically.' };
  }

  const deviceId = generateDeviceId();
  const key      = String(licenseKey || '').trim().toUpperCase();

  if (!key || !shopName) {
    return { ok: false, message: 'Please enter both Shop Name and License Key.' };
  }

  const parts = key.split('-');
  if (parts.length !== 3 || parts[0] !== 'TCERP') {
    return { ok: false, message: 'Invalid license key format.' };
  }

  try {
    const resp = await tcRequest('/activate', {
      license_key : key,
      device_id   : deviceId,
      device_name : getClientDeviceName(),
      shop_name   : shopName.trim()
    });

    if (resp.status === 'OK') {
      const lic = {
        mode          : 'activated',
        key           : key,
        shopName      : resp.shop_name || shopName.trim(),
        deviceId      : deviceId,
        plan          : resp.plan    || null,
        expires       : resp.expires || null,
        max_clients   : (resp.max_clients != null && !isNaN(parseInt(resp.max_clients, 10)))
          ? parseInt(resp.max_clients, 10)
          : null,
        activatedAt   : Date.now(),
        lastVerify    : Date.now(),
        lastSuccessfulSyncTime: Date.now(),
        lastClockCheck: Date.now()
      };
      saveLicense(lic);
      /* Align universal clock anchor so post-activation license check is not blocked */
      saveLastVerifiedTime();
      /* Sync new activation to MySQL immediately (network_server only) */
      syncLicenseToMySQL({ status: 'activated', shopName: lic.shopName, key: lic.key, plan: lic.plan, expires: lic.expires, maxClients: lic.max_clients, readOnly: false }, _activateCfg);
      return { ok: true, shopName: lic.shopName, plan: lic.plan, expires: lic.expires, max_clients: lic.max_clients || null };
    }

    if (resp.status === 'blocked' || resp.status === 'DEVICE_MISMATCH') {
      return {
        ok: false,
        status: 'blocked',
        message: 'This license key is already activated on another device.'
      };
    }

    if (resp.status === 'INVALID') {
      return { ok: false, message: 'Invalid license key. Please check and try again.' };
    }

    return { ok: false, message: resp.message || 'Activation failed. Please try again.' };

  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e || '');
    writeLogFile('warn', '[tc-activate] ' + msg);
    if (msg.indexOf('License API secret missing') !== -1) {
      return {
        ok     : false,
        message:
          'Missing license API secret on this PC.\n\n' +
          'Use the same LICENSE_SECRET (or TC_LIC_SERVER_SECRET) as on license.techon.lk.\n' +
          '• Dev: erp-app/.env with LICENSE_SECRET=...\n' +
          '• Installed app: Set OS env LICENSE_SECRET, or put tc_license_secret.txt (one line, no quotes) in ONE of these places:\n' +
          '  – Next to Techon ERP.exe or in the resources folder\n' +
          '  – Or in AppData (recommended if Program Files is read-only):\n' +
          '    %APPDATA%\\TechonERP\\tc_license_secret.txt\n\n' +
          'Then restart the app.',
      };
    }
    if (msg === 'Bad server response') {
      return {
        ok     : false,
        message: 'License server returned an unexpected response. Try again later or contact support if this continues.',
      };
    }
    if (msg === 'Connection timeout') {
      return { ok: false, message: 'Connection to the license server timed out. Check your internet and try again.' };
    }
    /* TLS / certificate (common with wrong system date or antivirus HTTPS scanning) */
    if (/certificate|SSL|TLS|UNABLE_TO_VERIFY|unable to verify|cert/i.test(msg)) {
      return {
        ok     : false,
        message:
          'Secure connection to license.techon.lk failed.\n\n' +
          'Check Windows date/time, disable VPN/antivirus HTTPS scanning for this app, or try another network.\n\n' +
          'Detail: ' + msg.slice(0, 200),
      };
    }
    if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(msg)) {
      return {
        ok     : false,
        message: 'Could not resolve license.techon.lk (DNS). Check internet or try another DNS (e.g. 8.8.8.8).\n\nDetail: ' + msg.slice(0, 160),
      };
    }
    if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|EPIPE/i.test(msg)) {
      return {
        ok     : false,
        message: 'Network error talking to the license server.\n\nDetail: ' + msg.slice(0, 200),
      };
    }
    /* Surface Node’s message so support can diagnose */
    const detail = msg.replace(/\s+/g, ' ').trim().slice(0, 220);
    return {
      ok     : false,
      message:
        'Cannot complete activation.\n\n' +
        (detail ? detail + '\n\n' : '') +
        'If the problem persists: confirm LICENSE_SECRET / tc_license_secret.txt matches the server, or contact Techon support with the detail above.',
    };
  }
});

/**
 * Recovery when universal clock check blocks the app: verify license with the same
 * servers used for normal operation, then reset the signed clock anchor (tc_clock.dat)
 * and license lastClockCheck so the user can continue without only relying on local time.
 */
ipcMain.handle('tc-sync-clock-via-license', async () => {
  const _netCfg = loadNetworkConfig();
  if (_netCfg && _netCfg.role === 'network_client' && _netCfg.apiUrl) {
    try {
      const data = await lanGet(_netCfg.apiUrl + 'check_license.php', _netCfg.apiKey);
      if (data && data.success && data.valid) {
        saveLastVerifiedTime();
        writeLogFile('info', '[ClockRecover] LAN client: license confirmed — clock anchor reset.');
        return { ok: true };
      }
      return {
        ok     : false,
        message: (data && data.message) ? data.message : 'Server did not report an active license. Correct the system clock or contact support.'
      };
    } catch (e) {
      return { ok: false, message: 'Cannot reach the main server: ' + e.message };
    }
  }

  const lic = loadLicense();
  if (!lic || lic.mode !== 'activated') {
    return {
      ok     : false,
      code   : 'NEED_ACTIVATION',
      message: 'This PC has no activated license yet. Enter your license key below, or fix the system clock and use Check Now.'
    };
  }

  const deviceId = generateDeviceId();
  try {
    const resp = await tcRequest('/verify', { license_key: lic.key, device_id: deviceId });
    if (resp.status === 'EXPIRED') {
      return { ok: false, message: 'Your license has expired. Renew, then try again or fix the system clock.' };
    }
    if (resp.status === 'INVALID') {
      return { ok: false, message: 'License is no longer valid on the server. Reactivate with a valid key.' };
    }
    const now = Date.now();
    applyVerifyPayloadToLicense(lic, resp, now);
    lic.lastClockCheck = now;
    saveLicense(lic);
    saveLastVerifiedTime();
    writeLogFile('info', '[ClockRecover] Online verify OK — clock anchor and license timestamps reset.');
    return { ok: true };
  } catch (e) {
    return {
      ok     : false,
      message: 'Cannot reach the license server. Connect to the internet, or correct your system clock and tap Check Now.'
    };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   APP VERSION
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('tc-update-check', async () => {
  return appUpdater.checkForUpdates();
});

ipcMain.handle('tc-update-download', async () => {
  return appUpdater.downloadUpdate();
});

ipcMain.handle('tc-update-install', async () => {
  return appUpdater.quitAndInstall();
});

ipcMain.handle('tc-update-install-prompt', async () => {
  return appUpdater.promptAndInstall();
});

function tcNormalizeSessionRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'admin' || r === 'manager' || r === 'cashier') return r;
  return 'cashier';
}

function tcSafeTimingEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (_e) {
    return false;
  }
}

/** Verify login password against stored hash (pbkdf2 / sha256 / legacy plaintext). */
function tcPasswordMatchesStored(input, stored) {
  if (!stored) return false;
  const s = String(stored);
  const pw = String(input == null ? '' : input);
  if (s.startsWith('pbkdf2:')) {
    const parts = s.split(':');
    if (parts.length < 4) return false;
    const iters = parseInt(parts[1], 10) || 100000;
    let salt;
    try {
      salt = Buffer.from(parts[2], 'hex');
    } catch (_e) {
      return false;
    }
    if (!salt.length) return false;
    const derived = crypto.pbkdf2Sync(pw, salt, iters, 32, 'sha256').toString('hex');
    return tcSafeTimingEqualHex(derived, parts[3]);
  }
  if (s.startsWith('sha256:')) {
    const hex = crypto.createHash('sha256').update(pw, 'utf8').digest('hex');
    return ('sha256:' + hex) === s;
  }
  return pw === s;
}

function tcFindLoginUser(users, username) {
  const list = Array.isArray(users) ? users : [];
  const uname = String(username || '').trim().toLowerCase();
  let user = list.find(function (u) {
    return u && u.active !== false && String(u.username || '').trim().toLowerCase() === uname;
  });
  if (!user && (uname === 'admin' || !uname)) {
    user = list.find(function (u) { return u && String(u.role || '').toLowerCase() === 'admin'; }) || list[0];
  }
  return user || null;
}

function tcPutErpSession(event, sessionFields) {
  const id = tcSessionKeyFromEvent(event);
  if (id == null) return { ok: false, message: 'No window' };
  const username = String(sessionFields.username || '').trim();
  if (!username) return { ok: false, message: 'username required' };
  const token = crypto.randomBytes(24).toString('hex');
  const session = {
    token: token,
    userId: String(sessionFields.userId || username),
    username: username,
    name: String(sessionFields.name || username),
    role: tcNormalizeSessionRole(sessionFields.role),
    expiresAt: Date.now() + TC_SESSION_TTL_MS,
  };
  tcErpSessions.set(id, session);
  return {
    ok: true,
    token: token,
    role: session.role,
    username: session.username,
    userId: session.userId,
    name: session.name,
    expiresAt: session.expiresAt,
  };
}

/** Main-owned credential seal — login verifies against this, not renderer-supplied hashes. */
const tcElevateTokens = new Map();
const tcSupportUnlockAttempts = new Map();

function tcCredsSealPath() {
  return path.join(app.getPath('userData'), 'tc_erp_creds.json');
}

function tcLoadSealedCreds() {
  try {
    const p = tcCredsSealPath();
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch (_e) {
    return null;
  }
}

function tcSanitizeUsersForSeal(users) {
  return (Array.isArray(users) ? users : []).map(function (u) {
    if (!u) return null;
    return {
      id: u.id || '',
      username: String(u.username || '').trim(),
      name: String(u.name || u.username || '').trim(),
      role: tcNormalizeSessionRole(u.role),
      passwordHash: String(u.passwordHash || ''),
      active: u.active !== false,
    };
  }).filter(function (u) { return u && u.username; });
}

function tcSaveSealedCreds(creds) {
  const out = {
    users: tcSanitizeUsersForSeal(creds.users),
    apppass: String(creds.apppass || ''),
    mainAdminPassHash: String(creds.mainAdminPassHash || ''),
    passwordLockRequired: creds.passwordLockRequired !== false,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(tcCredsSealPath(), JSON.stringify(out), 'utf8');
  return out;
}

function tcIssueElevateToken(event, role) {
  const id = tcSessionKeyFromEvent(event);
  if (id == null) return false;
  tcElevateTokens.set(id, {
    role: tcNormalizeSessionRole(role || 'admin'),
    expiresAt: Date.now() + 120000,
  });
  return true;
}

function tcConsumeElevateToken(event) {
  const id = tcSessionKeyFromEvent(event);
  if (id == null) return null;
  const elev = tcElevateTokens.get(id);
  if (!elev) return null;
  tcElevateTokens.delete(id);
  if (elev.expiresAt < Date.now()) return null;
  return elev.role;
}

/**
 * Seal / refresh main-owned credentials (post-login, password change).
 * First seal is created only by tc-session-login after a verified password match —
 * never from unauthenticated renderer-supplied hashes.
 */
ipcMain.handle('tc-credentials-seal', (event, payload) => {
  try {
    const existing = tcLoadSealedCreds();
    if (!existing) {
      return { ok: false, message: 'Credentials seal bootstrap requires a verified login first' };
    }
    const users = tcSanitizeUsersForSeal(payload && payload.users);
    const apppass = String((payload && payload.apppass) || '');
    const mainAdmin = String((payload && payload.mainAdminPassHash) || '');
    const lockReq = payload && payload.passwordLockRequired;
    const gate = tcRequireSessionRole(event, ['admin']);
    const pw = String((payload && payload.password) || '');
    const pwOk = !!pw && (
      tcPasswordMatchesStored(pw, existing.apppass)
      || tcPasswordMatchesStored(pw, existing.mainAdminPassHash)
      || (existing.users || []).some(function (u) {
        return u && String(u.role || '').toLowerCase() === 'admin'
          && tcPasswordMatchesStored(pw, u.passwordHash);
      })
    );
    if (!gate.ok && !pwOk) {
      return { ok: false, message: 'Admin session or current password required to update credentials' };
    }
    tcSaveSealedCreds({
      users: users.length ? users : existing.users,
      apppass: apppass || existing.apppass,
      mainAdminPassHash: mainAdmin || existing.mainAdminPassHash,
      passwordLockRequired: typeof lockReq === 'boolean' ? lockReq : existing.passwordLockRequired,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: 'seal failed' };
  }
});

/**
 * Unauthenticated open — cashier only, unless one-time elevate token or sealed password-lock-off.
 * Role never comes from a client-asserted forge flag.
 */
ipcMain.handle('tc-session-open', (event, payload) => {
  try {
    const username = String((payload && payload.username) || '').trim();
    const userId = String((payload && payload.userId) || '').trim();
    const name = String((payload && payload.name) || username || '').trim();
    if (!username) return { ok: false, message: 'username required' };
    let role = tcConsumeElevateToken(event) || 'cashier';
    const sealed = tcLoadSealedCreds();
    if (role === 'cashier' && sealed && sealed.passwordLockRequired === false) {
      const u = tcFindLoginUser(sealed.users, username);
      if (u) role = tcNormalizeSessionRole(u.role);
    }
    return tcPutErpSession(event, {
      userId: userId || (sealed && tcFindLoginUser(sealed.users, username) && tcFindLoginUser(sealed.users, username).id) || username,
      username: username,
      name: name,
      role: role,
    });
  } catch (e) {
    return { ok: false, message: 'session open failed' };
  }
});

/**
 * Password-verified login against main-owned seal.
 * One-time migration: if no seal exists, verify password against local hashes in-memory,
 * then persist seal only after a successful match (prevents unauthenticated hash planting).
 */
ipcMain.handle('tc-session-login', (event, payload) => {
  try {
    const password = String((payload && payload.password) || '');
    if (!password) return { ok: false, message: 'password required' };
    const username = String((payload && payload.username) || '').trim();
    const bootUsers = tcSanitizeUsersForSeal(payload && payload.users);
    const bootApp = String((payload && payload.apppass) || '');
    const bootMain = String((payload && payload.mainAdminPassHash) || '');
    const bootCandidate = {
      users: bootUsers,
      apppass: bootApp,
      mainAdminPassHash: bootMain,
      passwordLockRequired: true,
    };
    const bootPasswordMatches = function () {
      if (!bootUsers.length && !bootApp && !bootMain) return false;
      const matchUser = tcFindLoginUser(bootUsers, username);
      return !!(
        (matchUser && matchUser.passwordHash && tcPasswordMatchesStored(password, matchUser.passwordHash))
        || (bootApp && tcPasswordMatchesStored(password, bootApp))
        || (bootMain && tcPasswordMatchesStored(password, bootMain))
        || bootUsers.some(function (u) {
          return u && String(u.role || '').toLowerCase() === 'admin'
            && u.passwordHash && tcPasswordMatchesStored(password, u.passwordHash);
        })
      );
    };

    let sealed = tcLoadSealedCreds();
    let migrating = false;
    if (!sealed) {
      if (!bootPasswordMatches()) {
        return { ok: false, message: 'Incorrect password' };
      }
      sealed = bootCandidate;
      migrating = true;
    }

    let users = sealed.users || [];
    let apppass = sealed.apppass || '';
    let mainAdminPassHash = sealed.mainAdminPassHash || '';
    let user = tcFindLoginUser(users, username);

    const finish = function (fields) {
      if (migrating || !tcLoadSealedCreds()) {
        try {
          tcSaveSealedCreds({
            users: users,
            apppass: apppass,
            mainAdminPassHash: mainAdminPassHash,
            passwordLockRequired: true,
          });
        } catch (_e) { /* ignore */ }
      }
      return tcPutErpSession(event, fields);
    };

    const adminFromHashes = function () {
      if (tcPasswordMatchesStored(password, apppass) || tcPasswordMatchesStored(password, mainAdminPassHash)) {
        const admin = users.find(function (u) {
          return u && String(u.role || '').toLowerCase() === 'admin';
        });
        return finish({
          userId: (admin && admin.id) || 'main-admin-sync',
          username: (admin && admin.username) || 'admin',
          name: (admin && admin.name) || 'Admin',
          role: 'admin',
        });
      }
      /*
       * Restore / demo reseed can leave tc_erp_creds.json out of sync with IndexedDB.
       * If the live shop password matches renderer hashes, refresh the seal and continue.
       */
      if (bootPasswordMatches()) {
        users = bootUsers;
        apppass = bootApp;
        mainAdminPassHash = bootMain;
        migrating = true;
        user = tcFindLoginUser(users, username);
        const admin = user && String(user.role || '').toLowerCase() === 'admin'
          ? user
          : users.find(function (u) {
            return u && String(u.role || '').toLowerCase() === 'admin';
          });
        return finish({
          userId: (admin && admin.id) || (user && user.id) || 'main-admin-sync',
          username: (admin && admin.username) || (user && user.username) || username || 'admin',
          name: (admin && admin.name) || (user && user.name) || String((payload && payload.name) || 'Admin'),
          role: 'admin',
        });
      }
      return { ok: false, message: 'Incorrect password' };
    };

    if (user) {
      const hash = user.passwordHash || '';
      const isAdmin = String(user.role || '').toLowerCase() === 'admin'
        || String(user.username || '').trim().toLowerCase() === 'admin';
      if (hash && tcPasswordMatchesStored(password, hash)) {
        return finish({
          userId: user.id || user.username,
          username: user.username || username,
          name: user.name || user.username || username,
          role: user.role || (isAdmin ? 'admin' : 'cashier'),
        });
      }
      if (isAdmin && apppass && tcPasswordMatchesStored(password, apppass)) {
        return finish({
          userId: user.id || user.username,
          username: user.username || username,
          name: user.name || user.username || username,
          role: 'admin',
        });
      }
      return adminFromHashes();
    }

    if (apppass && tcPasswordMatchesStored(password, apppass)) {
      return finish({
        userId: 'legacy-admin',
        username: username || 'admin',
        name: String((payload && payload.name) || 'Admin'),
        role: 'admin',
      });
    }
    return adminFromHashes();
  } catch (e) {
    return { ok: false, message: 'session login failed' };
  }
});

ipcMain.handle('tc-session-close', (event) => {
  const id = tcSessionKeyFromEvent(event);
  if (id != null) {
    tcErpSessions.delete(id);
    tcElevateTokens.delete(id);
  }
  return { ok: true };
});

ipcMain.handle('tc-session-get', (event) => {
  const s = tcGetSession(event);
  if (!s) return { ok: false, session: null };
  return {
    ok: true,
    session: {
      token: s.token,
      userId: s.userId,
      username: s.username,
      name: s.name,
      role: s.role,
      expiresAt: s.expiresAt,
    },
  };
});

ipcMain.handle('tc-session-assert', (event, payload) => {
  const roles = (payload && payload.roles) || ['*'];
  const r = tcRequireSessionRole(event, roles);
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, role: r.session.role, username: r.session.username };
});

/** Same secret as license API — for snapshot HMAC-SHA256 v2 (renderer never stores it). */
ipcMain.handle('tc-snapshot-hmac-secret', () => {
  return '';
});

ipcMain.handle('tc-snapshot-hmac-sign', (event, canonicalBody) => {
  try {
    const gate = tcRequireSessionRole(event, ['admin', 'manager', 'cashier']);
    if (!gate.ok) return { ok: false, hex: '', message: gate.message };
    const secret = getLicenseServerSecret();
    if (!secret || typeof secret !== 'string') return { ok: false, hex: '' };
    const hex = crypto.createHmac('sha256', secret).update(String(canonicalBody || ''), 'utf8').digest('hex');
    return { ok: true, hex: hex };
  } catch (e) {
    return { ok: false, hex: '' };
  }
});

ipcMain.handle('tc-snapshot-hmac-verify', (_event, payload) => {
  try {
    const body = String((payload && payload.canonicalBody) || '');
    const hexSig = String((payload && payload.hexSig) || '').toLowerCase();
    if (!hexSig) return { ok: false };
    const secrets = [];
    const primary = getLicenseServerSecret();
    if (primary) secrets.push(primary);
    const prev = process.env.TC_SNAPSHOT_HMAC_SECRET_PREVIOUS;
    if (prev && String(prev).trim()) secrets.push(String(prev).trim());
    for (let i = 0; i < secrets.length; i++) {
      const hex = crypto.createHmac('sha256', secrets[i]).update(body, 'utf8').digest('hex');
      if (hex === hexSig) return { ok: true, matched: i === 0 ? 'v2_license' : 'v2_license_previous' };
    }
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
});

ipcMain.handle('tc-snapshot-hmac-configured', () => {
  try {
    const s = getLicenseServerSecret();
    return !!(s && String(s).trim());
  } catch (e) {
    return false;
  }
});

/**
 * Support unlock salt must match license.techon.lk admin Support Desk
 * (SHA-256(challenge + salt) → first 6 hex chars).
 */
function getSupportUnlockSalt() {
  const env = process.env.TC_SUPPORT_UNLOCK_SALT && String(process.env.TC_SUPPORT_UNLOCK_SALT).trim();
  if (env) return env;
  try {
    const candidates = [];
    if (app.isPackaged) {
      candidates.push(path.join(path.dirname(process.execPath), 'tc_support_unlock_salt.txt'));
      try {
        candidates.push(path.join(app.getPath('userData'), 'tc_support_unlock_salt.txt'));
      } catch (_eUd) { /* ignore */ }
    } else {
      candidates.push(path.join(__dirname, 'tc_support_unlock_salt.txt'));
      candidates.push(path.join(process.cwd(), 'tc_support_unlock_salt.txt'));
    }
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) {
        const raw = fs.readFileSync(candidates[i], 'utf8');
        const line = String(raw || '')
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .map(function (l) { return l.trim(); })
          .find(function (l) { return l && l.charAt(0) !== '#'; });
        if (line) return line;
      }
    }
  } catch (_eFile) { /* ignore */ }
  /* Same default as public_html/license.techon.lk/admin Support Desk — required for verify. */
  return 'techon-master-salt-2026';
}

/**
 * Support unlock — challenge-response verified ONLY in main (salt never shipped to renderer).
 * Allowed without session (forgot-password) with rate limit; grants one-time elevate token.
 */
ipcMain.handle('tc-verify-support-unlock', async (event, payload) => {
  try {
    const wid = tcSessionKeyFromEvent(event);
    const attemptKey = wid != null ? String(wid) : 'unknown';
    const prev = tcSupportUnlockAttempts.get(attemptKey) || { n: 0, resetAt: Date.now() + 900000 };
    if (Date.now() > prev.resetAt) {
      prev.n = 0;
      prev.resetAt = Date.now() + 900000;
    }
    if (prev.n >= 8) {
      return { ok: false, message: 'Too many unlock attempts. Try again later.' };
    }
    prev.n += 1;
    tcSupportUnlockAttempts.set(attemptKey, prev);

    const challenge = String((payload && payload.challenge) || '').trim().toUpperCase();
    const code = String((payload && payload.code) || '').replace(/\s/g, '').toUpperCase();
    if (!challenge || code.length !== 6) {
      return { ok: false, message: 'Invalid challenge or unlock code.' };
    }
    const salt = getSupportUnlockSalt();
    if (!salt) {
      return {
        ok: false,
        message: "Support unlock is not configured on this installation (set TC_SUPPORT_UNLOCK_SALT).",
      };
    }
    const hex = crypto.createHash('sha256').update(challenge + salt, 'utf8').digest('hex');
    const expected = hex.substring(0, 6).toUpperCase();
    if (code !== expected) {
      return { ok: false, message: 'Incorrect support unlock code.' };
    }
    tcIssueElevateToken(event, 'admin');
    prev.n = 0;
    tcSupportUnlockAttempts.set(attemptKey, prev);
    return { ok: true, elevate: true };
  } catch (e) {
    return { ok: false, message: 'Verification failed.' };
  }
});

/** Previous HMAC secret is verify-only in main — never expose raw secret to renderer. */
ipcMain.handle('tc-snapshot-hmac-secret-previous', () => {
  return '';
});

/** Packaged production runtime guard — LICENSE_SECRET required for accounting HMAC / API. */
ipcMain.handle('tc-runtime-production-guard', () => {
  try {
    const secret = getLicenseServerSecret();
    return {
      isPackaged: app.isPackaged === true,
      licenseSecretConfigured: !!(secret && String(secret).trim()),
      blockWritesOnCritical: process.env.TC_BLOCK_WRITES_ON_CRITICAL === '1',
    };
  } catch (e) {
    return {
      isPackaged: false,
      licenseSecretConfigured: true,
      blockWritesOnCritical: false,
    };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   OPEN EXTERNAL URL
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-open-url', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, message: 'Invalid URL' };
});

/* ═══════════════════════════════════════════════════════════════════
   WHATSAPP PDF SHARE
   Generates a real PDF from HTML, saves to Documents/TechonERP/Invoices
   (or payload.invoicePdfFolder), opens WhatsApp.
   payload: { html, filename, phone, pageFormat?, invoicePdfFolder? }
   ═══════════════════════════════════════════════════════════════════ */
function getInvoicePdfDir(customPath) {
  let dir = customPath;
  if (!dir || typeof dir !== 'string' || !String(dir).trim()) {
    dir = path.join(app.getPath('documents'), 'TechonERP', 'Invoices');
  } else {
    dir = String(dir).trim();
  }
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      dir = path.join(app.getPath('documents'), 'TechonERP', 'Invoices');
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e2) {}
      }
    }
  }
  return dir;
}

ipcMain.handle('tc-share-pdf', async (_event, payload) => {
  try {
    const { html, filename, phone, pageFormat, invoicePdfFolder } = payload || {};

    /* ── 1. Write HTML to a temp file so BrowserWindow can load it cleanly ── */
    const tmpDir  = app.getPath('temp');
    const tmpFile = path.join(tmpDir, 'techon_pdf_tmp_' + Date.now() + '.html');
    fs.writeFileSync(tmpFile, html, 'utf8');

    /* ── 2. Create hidden off-screen BrowserWindow ── */
    const pdfWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: false
      }
    });

    /* ── 3. Load the temp HTML file and wait for it to finish painting ── */
    await pdfWin.loadFile(tmpFile);

    /* Wait 1.4 s so Google Fonts and layout settle before capture */
    await new Promise(resolve => setTimeout(resolve, 1400));

    /* ── 4. Print to PDF ──
       Respect renderer @page size (A4/A5/58mm/80mm). */
    const htmlLower = String(html || '').toLowerCase();
    const fmt = (pageFormat || '').toLowerCase();
    const isThermalFmt = fmt === 'thermal58' || fmt === 'thermal80';
    const isThermalHeuristic =
      !fmt &&
      (htmlLower.indexOf('58mm auto') >= 0 ||
        htmlLower.indexOf('80mm auto') >= 0 ||
        htmlLower.indexOf("font-family:'courier new'") >= 0);
    const isThermal = isThermalFmt || isThermalHeuristic;
    let pdfData;
    if (isThermal) {
      /* Thermal: fixed roll width, height = measured content (no huge blank tail). */
      const is58 = fmt === 'thermal58' || (!fmt && htmlLower.indexOf('58mm') >= 0);
      const thermalWidthIn = is58 ? 2.283 : 3.15; /* 58mm / 80mm */
      const thermalWidthPx = is58 ? 220 : 310; /* ~218/302 + scrollbar */
      try {
        /* Tall window so long receipts lay out fully; height is NOT used for PDF — we measure receipt root only */
        pdfWin.setSize(thermalWidthPx, 6000);
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (_) {}
      const heightPx = await pdfWin.webContents.executeJavaScript(`
        (function () {
          return new Promise(function (resolve) {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                /* body/documentElement scrollHeight matches viewport — wrong. Measure receipt root only. */
                var el = document.querySelector('[data-tc-thermal-receipt]') || (document.body && document.body.firstElementChild);
                var h = 0;
                if (el) {
                  var r = el.getBoundingClientRect();
                  h = Math.ceil(Math.max(r.height, el.scrollHeight, el.offsetHeight, el.clientHeight));
                }
                if (!h || h < 20) {
                  h = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                  );
                }
                resolve(h);
              });
            });
          });
        })()
      `);
      /* CSS px → inches (96 CSS px per inch in Chromium print) */
      var heightIn = Math.max(0.35, (Number(heightPx) || 400) / 96 + 0.06);
      if (heightIn > 48) heightIn = 48;
      heightIn = Math.round(heightIn * 1000) / 1000;
      pdfData = await pdfWin.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: false,
        pageSize: { width: thermalWidthIn, height: heightIn },
        margins: { marginType: 'none' }
      });
    } else {
      pdfData = await pdfWin.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      });
    }

    /* ── 5. Clean up PDF window and temp HTML ── */
    pdfWin.destroy();
    try { fs.unlinkSync(tmpFile); } catch (_) {}

    /* ── 6. Save PDF to invoice folder (default: Documents/TechonERP/Invoices) ── */
    const invoicesDir = getInvoicePdfDir(invoicePdfFolder);
    const baseName = (filename || 'techon-document').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    let safeFilename = baseName + '.pdf';
    let outPath = path.join(invoicesDir, safeFilename);
    let n = 0;
    while (fs.existsSync(outPath)) {
      n += 1;
      safeFilename = baseName + '_' + n + '.pdf';
      outPath = path.join(invoicesDir, safeFilename);
    }
    fs.writeFileSync(outPath, pdfData);

    /* ── 7. Reveal file in Explorer so user can attach it to WhatsApp ── */
    shell.showItemInFolder(outPath);

    /* ── 8. Open WhatsApp Desktop app first (fallback to web) ── */
    const cleanPhone = (phone || '').replace(/[\s\-\+\(\)]/g, '');
    const msg = encodeURIComponent('Please find the document attached.');
    const desktopUrl = cleanPhone
      ? 'whatsapp://send?phone=' + cleanPhone + '&text=' + msg
      : 'whatsapp://';
    const webUrl = cleanPhone
      ? 'https://web.whatsapp.com/send?phone=' + cleanPhone + '&text=' + msg
      : 'https://web.whatsapp.com/';
    try {
      /* Uses installed WhatsApp Desktop protocol handler if available */
      await shell.openExternal(desktopUrl);
    } catch (_) {
      /* Fallback for systems where whatsapp:// is not registered */
      await shell.openExternal(webUrl);
    }

    return { ok: true, path: outPath };
  } catch (err) {
    console.error('tc-share-pdf error:', err);
    return { ok: false, message: err.message || 'PDF generation failed' };
  }
});

function tcSafePrintHtmlId(id) {
  const s = String(id || '');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(s)) return null;
  return s;
}

/* Stream Business Report HTML to a temp file in small IPC chunks (avoids structured-clone limits on huge strings). */
ipcMain.handle('tc-print-html-disk-chunk', async (_event, { id, seq, part }) => {
  const safeId = tcSafePrintHtmlId(id);
  if (!safeId || typeof part !== 'string') return { ok: false, message: 'Invalid chunk' };
  const dir = app.getPath('temp');
  const p = path.join(dir, 'tc_print_html_' + safeId + '.html');
  if (path.dirname(p) !== dir) return { ok: false, message: 'Invalid path' };
  try {
    if (seq === 0) fs.writeFileSync(p, part, 'utf8');
    else fs.appendFileSync(p, part, 'utf8');
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
  return { ok: true };
});

ipcMain.handle('tc-print-html-disk-finish', async (_event, { id }) => {
  const safeId = tcSafePrintHtmlId(id);
  if (!safeId) return { ok: false, message: 'Invalid id' };
  const dir = app.getPath('temp');
  const p = path.join(dir, 'tc_print_html_' + safeId + '.html');
  if (path.dirname(p) !== dir || !fs.existsSync(p)) return { ok: false, message: 'Missing temp HTML file' };
  let html;
  try {
    html = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
  try { fs.unlinkSync(p); } catch (_) {}
  if (!html || html.length === 0) return { ok: false, message: 'Empty report HTML' };
  return await runTcPrintHtmlPdfOnly(html);
});

async function tcOpenPdfBestEffort(pdfPath) {
  const errMsg = await shell.openPath(pdfPath);
  if (errMsg === '') return { ok: true };
  /* Windows: shell.openPath sometimes fails for temp paths; cmd start uses file association */
  if (process.platform === 'win32') {
    try {
      await new Promise(function (resolve, reject) {
        execFile('cmd', ['/c', 'start', '""', pdfPath], { windowsHide: true }, function (err) {
          if (err) reject(err);
          else resolve();
        });
      });
      return { ok: true };
    } catch (_) { /* fall through */ }
  }
  try {
    await shell.openExternal(pathToFileURL(pdfPath).href);
    return { ok: true };
  } catch (e) {
    try {
      shell.showItemInFolder(pdfPath);
      return {
        ok: true,
        message: 'PDF saved. A File Explorer window was opened — double‑click the PDF to open it, then press Ctrl+P to print.'
      };
    } catch (e2) {
      return { ok: false, message: errMsg || (e && e.message) || 'Could not open PDF' };
    }
  }
}

async function runTcPrintHtmlPdfOnly(html) {
  const tmpDir = app.getPath('temp');
  const tmpFile = path.join(tmpDir, 'techon_print_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.html');
  let printWin;
  try {
    fs.writeFileSync(tmpFile, html, 'utf8');
    printWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        sandbox: false
      }
    });
    await printWin.loadFile(tmpFile);
    const settleMs = Math.min(4500, 1400 + Math.floor(html.length / 40000));
    await new Promise(function (resolve) { setTimeout(resolve, settleMs); });
    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    try {
      printWin.destroy();
    } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const pdfPath = path.join(tmpDir, 'techon_print_' + Date.now() + '.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    const opened = await tcOpenPdfBestEffort(pdfPath);
    if (!opened.ok) {
      return { ok: false, message: opened.message };
    }
    return {
      ok: true,
      openedPdf: true,
      message: opened.message || 'PDF opened in your default viewer. Use Print (Ctrl+P) to send to your printer.'
    };
  } catch (err) {
    console.error('runTcPrintHtmlPdfOnly error:', err);
    try {
      if (printWin && !printWin.isDestroyed()) printWin.destroy();
    } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

/* Open system print dialog for arbitrary HTML (Reports full report, etc.).
   Payload: string (HTML) OR { html: string, pdfOnly?: boolean }.
   pdfOnly: printToPDF + open PDF — Business Report uses chunked IPC when HTML is large. */
ipcMain.handle('tc-print-html', async (_event, payload) => {
  let html;
  let pdfOnly = false;
  if (typeof payload === 'string') {
    html = payload;
  } else if (payload && typeof payload === 'object' && typeof payload.html === 'string') {
    html = payload.html;
    pdfOnly = !!payload.pdfOnly;
  } else {
    return { ok: false, message: 'No HTML to print' };
  }
  if (html.length === 0) {
    return { ok: false, message: 'No HTML to print' };
  }
  const tmpDir = app.getPath('temp');
  const tmpFile = path.join(tmpDir, 'techon_print_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.html');
  let printWin;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  let disabledMain = false;

  if (pdfOnly) {
    return await runTcPrintHtmlPdfOnly(html);
  }

  try {
    fs.writeFileSync(tmpFile, html, 'utf8');
    printWin = new BrowserWindow({
      parent: parent || undefined,
      modal: !!parent,
      show: false,
      width: 1024,
      height: 768,
      minWidth: 400,
      minHeight: 300,
      center: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        sandbox: false
      }
    });
    try {
      printWin.setMenuBarVisibility(false);
    } catch (_) {}

    await printWin.loadFile(tmpFile);
    /* Match tc-share-pdf: allow remote fonts + layout before print */
    await new Promise(function (resolve) { setTimeout(resolve, 1200); });

    if (parent) {
      try {
        parent.setEnabled(false);
        disabledMain = true;
      } catch (_) {}
    }
    printWin.center();
    printWin.show();
    printWin.focus();
    try {
      printWin.moveTop();
    } catch (_) {}

    await printWin.webContents.print({ silent: false, printBackground: true });
  } catch (err) {
    console.error('tc-print-html error:', err);
    try {
      if (printWin && !printWin.isDestroyed()) {
        const pdfBuffer = await printWin.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
        });
        const pdfPath = path.join(tmpDir, 'techon_print_' + Date.now() + '.pdf');
        fs.writeFileSync(pdfPath, pdfBuffer);
        const openErr = await shell.openPath(pdfPath);
        if (openErr !== '') {
          return { ok: false, message: openErr || 'Could not open PDF for printing' };
        }
        return {
          ok: true,
          fallbackPdf: true,
          message: 'The print dialog could not be opened. A PDF was opened in your default viewer — use Print (Ctrl+P) there.'
        };
      }
    } catch (e2) {
      console.error('tc-print-html PDF fallback failed:', e2);
    }
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    if (disabledMain && parent && !parent.isDestroyed()) {
      try { parent.setEnabled(true); } catch (_) {}
    }
    try {
      if (printWin && !printWin.isDestroyed()) printWin.destroy();
    } catch (_) {}
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
  return { ok: true };
});

/* ═══════════════════════════════════════════════════════════════════
   BACKUP HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function getBackupDir(customPath) {
  let dir = customPath;
  if (!dir || typeof dir !== 'string') {
    const docsPath = app.getPath('documents');
    dir = path.join(docsPath, 'TechonERP', 'backups');
  }
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      const docsPath = app.getPath('documents');
      dir = path.join(docsPath, 'TechonERP', 'backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }
  return dir;
}

function pruneBackups(dir, keep) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('techon-backup-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(keep).forEach(f => { try { fs.unlinkSync(path.join(dir, f.name)); } catch (e) {} });
  } catch (e) {}
}

function writeBackup(filename, content, customPath) {
  try {
    const dir  = getBackupDir(customPath);
    const file = path.join(dir, filename);
    fs.writeFileSync(file, content, 'utf8');
    pruneBackups(dir, 8);
    try { writeLogFile('info', 'JSON backup saved: ' + file); } catch (e2) {}
  } catch (e) { console.error('Backup error:', e); }
}

let isSafeToQuit = false;
let lastBackupPayload = null;

function doWriteBackup(content, customPath, suffix) {
  suffix = suffix || '';
  const n = new Date();
  const filename =
    'techon-backup-' + n.getFullYear() + '-' +
    String(n.getMonth()+1).padStart(2,'0') + '-' +
    String(n.getDate()).padStart(2,'0') + '-' +
    String(n.getHours()).padStart(2,'0') +
    String(n.getMinutes()).padStart(2,'0') + suffix + '.json';
  writeBackup(filename, content, customPath);
}

function performBackupAndQuit() {
  if (isSafeToQuit) return;

  /* ── Check if sync is still pending (network modes) ────────────
     Ask the renderer to flush, then wait up to 15 seconds.        */
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        try {
          var s = window.TC_SYNC;
          if (!s) return 'idle';
          return s.status;
        } catch(e) { return 'idle'; }
      })()
    `).then(function(syncStatus) {
      if (syncStatus === 'saving') {
        /* Tell renderer to flush and wait */
        mainWindow.webContents.executeJavaScript(`
          (function() {
            try {
              if (window.TC_SYNC && window.TC_SYNC.flushNow) {
                return window.TC_SYNC.flushNow();
              }
            } catch(e) {}
            return Promise.resolve(true);
          })()
        `).then(function() {
          _doBackupAndQuit();
        }).catch(function() {
          _doBackupAndQuit();
        });
        /* Timeout safety — quit after 15 seconds regardless */
        setTimeout(_doBackupAndQuit, 15000);
        return;
      }
      _doBackupAndQuit();
    }).catch(function() {
      _doBackupAndQuit();
    });
    return;
  }

  _doBackupAndQuit();
}

function _doBackupAndQuit() {
  if (isSafeToQuit) return;

  if (lastBackupPayload) {
    isSafeToQuit = true;
    try {
      doWriteBackup(lastBackupPayload.content, lastBackupPayload.customPath, "-close");
      console.log('Close backup written from cache.');
    } catch (e) { console.error('Close backup (cache) failed:', e); }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    isSafeToQuit = true;
    app.quit();
    return;
  }

  try {
    mainWindow.webContents.executeJavaScript(`
      (function(){
        try {
          const keys = [
            "tc3_settings","tc3_products","tc3_customers","tc3_suppliers",
            "tc3_sales","tc3_purchases","tc3_expenses","tc3_repairs",
            "tc3_assets","tc3_damageLog","tc3_productLog","tc3_repairDeleteLog",
            "tc3_capLedger","tc3_capLog","tc3_manualPayables","tc3_manualReceivables",
            "tc3_profitDist","tc3_assetLog","tc3_openBal","tc3_auditLog",
            "tc3_salesReturns","tc3_purchaseReturns","tc3_quotations","tc3_cheques","tc3_labelDesigns",
            "tc3_startup_wizard_done","tc3_businessType"
          ];
          const cache = window._idbCache || window._tcCache || {};
          let backup = { version:2, timestamp:new Date().toISOString(), data:{} };
          keys.forEach(function(k){ if (cache[k] !== undefined) backup.data[k] = cache[k]; });
          const st = cache["tc3_settings"] || {};
          backup.shopName = st.shopName || "Techon";
          return { content: JSON.stringify(backup, null, 2), customPath: st.backupFolder || null };
        } catch(e) { return null; }
      })();
    `).then(function(result) {
      if (result && result.content) {
        try {
          doWriteBackup(result.content, result.customPath, "-close");
          console.log('Close backup written from renderer.');
        } catch (e) { console.error('Close backup (renderer) failed:', e); }
      }
    }).catch(function(e) {
      console.error('executeJavaScript backup failed:', e);
    }).finally(function() {
      isSafeToQuit = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      app.quit();
    });
  } catch (e) {
    console.error('performBackupAndQuit failed:', e);
    isSafeToQuit = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RENDERER URL (dev vs built)
   IndexedDB + localStorage are scoped by *web origin*. These are different:
     • http://127.0.0.1:5173  — Vite dev server (npm run dev:electron)
     • file://…/dist/index.html — built bundle (npm run build, then electron .)
   Switching between them looks like a “fresh” app. Use one workflow per machine,
   or restore from Settings backup when changing how you load the UI.
   ═══════════════════════════════════════════════════════════════════ */
function loadMainRenderer(window) {
  const useVite =
    app.isPackaged === false &&
    (process.env.ELECTRON_VITE === '1' || process.env.ELECTRON_VITE === 'true');
  const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  if (useVite) {
    window.loadURL(viteUrl).catch(function (err) {
      console.error('[TechonERP] Vite dev server not reachable (' + viteUrl + '), loading dist instead:', err && err.message);
      window.loadFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    window.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE WINDOW
   ═══════════════════════════════════════════════════════════════════ */
function createWindow() {
  mainReadyToShow = false;
  splashShownAt = 0;
  splashRevealScheduled = false;

  splash = new BrowserWindow({
    width: 600, height: 400,
    frame: false, alwaysOnTop: true, resizable: false,
    transparent: false, show: false,
    backgroundColor: '#0f172a'
  });
  splash.loadURL('file://' + path.join(__dirname, 'splash.html'));
  splash.webContents.once('did-finish-load', () => {
    splash.show();
    splashShownAt = Date.now();
    scheduleSplashThenMain();
  });

  mainWindow = new BrowserWindow({
    width: 1366, height: 768,
    minWidth: 1024, minHeight: 600,
    title: 'Techon-ERP',
    icon: path.join(__dirname, 'icons', 'techonERP.ico'),
    show: false,
    backgroundColor: '#0f172a',
    skipTaskbar: true,
    webPreferences: {
      preload         : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration : false,
      /* Required for window.open('','_blank') + document.write + print() used by Reports / invoices */
      nativeWindowOpen  : true
    }
  });

  loadMainRenderer(mainWindow);
  mainWindow.removeMenu();
  /* Native right-click menu for text copy/paste in renderer fields. */
  mainWindow.webContents.on('context-menu', function (_event, params) {
    const hasSelection = !!(params && params.selectionText && params.selectionText.trim());
    const isEditable = !!(params && params.isEditable);
    if (!hasSelection && !isEditable) return;
    const menuTemplate = [
      { role: 'copy', enabled: hasSelection },
      { role: 'selectAll' }
    ];
    if (isEditable) {
      menuTemplate.unshift({ role: 'paste' });
      menuTemplate.unshift({ role: 'cut', enabled: hasSelection });
    }
    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow });
  });

  mainWindow.once('ready-to-show', () => {
    mainReadyToShow = true;
    scheduleSplashThenMain();
  });

  mainWindow.on('close', function(e) {
    if (!isSafeToQuit) {
      e.preventDefault();
      performBackupAndQuit();
    }
  });

  mainWindow.on('closed', function() {
    try { lanWsSync.stopAll(); } catch (_e) {}
    mainWindow = null;
  });
}

/* ═══════════════════════════════════════════════════════════════════
   APP EVENTS
   ═══════════════════════════════════════════════════════════════════ */
app.whenReady().then(() => {
  if (_legacyMigrationFrom) {
    writeLogFile('info', '[Startup] Migrated legacy user data from ' + _legacyMigrationFrom);
  }
  ipcMain.on('save-backup', (_event, payload) => {
    if (isNetworkClientRole()) return;
    if (payload && payload.filename && payload.content) {
      lastBackupPayload = { content: payload.content, customPath: payload.customPath || null };
      writeBackup(payload.filename, payload.content, payload.customPath);
    }
  });

  ipcMain.handle('tc-select-folder', async () => {
    if (isNetworkClientRole()) return clientModeBlockedIpc();
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  getBackupDir();
  lanWsSync.setLogFn(writeLogFile);
  lanWsSync.setWsDeviceValidator(async function (msg) {
    const cfg = loadNetworkConfig();
    if (!cfg || !cfg.apiUrl) return { ok: false, message: 'no_config' };
    try {
      const r = await lanPost(
        cfg.apiUrl + 'device_validate.php',
        msg,
        { 'X-TC-KEY': cfg.apiKey || '' },
        Object.assign({}, cfg, { forceLegacy: true })
      );
      if (r && r.success) {
        return { ok: true, client_id: (r.data && r.data.client_id) || msg.client_id || '' };
      }
      return { ok: false, message: (r && r.message) || 'validate_failed' };
    } catch (e) {
      return { ok: false, message: e && e.message ? e.message : String(e) };
    }
  });
  createWindow();
  try { appUpdater.setupAutoUpdater(); } catch (_e) {}
  setTimeout(function () {
    try { restartLanWebSocket('', undefined); } catch (_e) {}
  }, 1500);
  /* Trial → MySQL sync for network server (counter PCs read shop_license, not local trial) */
  setTimeout(function () {
    const cfg = loadNetworkConfig();
    if (cfg && cfg.role === 'network_server' && isLocalTrialLicense()) {
      syncTrialLicenseToMySQLNow(cfg).catch(function (e) {
        writeLogFile('warn', '[LicenseSync] Startup trial sync: ' + (e && e.message ? e.message : String(e)));
      });
    }
  }, 4000);
  /* Dynamic cloud sync (server/standalone only): startup + periodic background */
  setTimeout(function () {
    forceCloudLicenseSync(false).catch(function (e) {
      writeLogFile('warn', '[LicenseSync] Startup sync skipped: ' + (e && e.message ? e.message : String(e)));
    });
  }, 20000);
  setInterval(function () {
    forceCloudLicenseSync(false).catch(function (e) {
      writeLogFile('warn', '[LicenseSync] Periodic sync skipped: ' + (e && e.message ? e.message : String(e)));
    });
  }, CLOUD_SYNC_INTERVAL_MS);

  app.on('activate', function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', function(e) {
  if (!isSafeToQuit) {
    e.preventDefault();
    performBackupAndQuit();
  }
});

app.on('window-all-closed', function() {
  try { lanWsSync.stopAll(); } catch (_e) {}
  if (process.platform !== 'darwin') app.quit();
});

/* ═══════════════════════════════════════════════════════════════════
   NETWORK CONFIG  (userData/tc_network.json)
   Stores: { role, apiUrl, xamppPath, port, wizardComplete }
   ═══════════════════════════════════════════════════════════════════ */
const NET_CONFIG_FILE = path.join(app.getPath('userData'), 'tc_network.json');

function loadNetworkConfig() {
  try {
    if (!fs.existsSync(NET_CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(NET_CONFIG_FILE, 'utf8'));
  } catch (e) { return null; }
}

function saveNetworkConfig(cfg) {
  try {
    fs.writeFileSync(NET_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

function isNetworkClientRole() {
  try {
    const cfg = loadNetworkConfig();
    return !!(cfg && cfg.role === 'network_client');
  } catch (e) {
    return false;
  }
}

function clientModeBlockedIpc() {
  return { status: 'blocked', message: 'Restricted in client mode' };
}

function enrichNetworkCfg(cfg) {
  if (!cfg) return cfg;
  const creds = getDeviceStore().loadDeviceCredentials(app.getPath('userData'));
  if (creds && creds.status === 'approved' && creds.device_secret) {
    cfg._deviceCreds = creds;
  }
  return cfg;
}

let _lanWsRestartTimer = null;

function restartLanWebSocket(clientId, lastRevision) {
  return new Promise(function (resolve) {
    if (_lanWsRestartTimer) clearTimeout(_lanWsRestartTimer);
    _lanWsRestartTimer = setTimeout(function () {
      _lanWsRestartTimer = null;
      try {
        const cfg = enrichNetworkCfg(loadNetworkConfig());
        if (clientId) lanWsSync.setRuntimeClientId(clientId);
        if (lastRevision != null) lanWsSync.setLastKnownRevision(lastRevision);
        resolve(lanWsSync.restart(cfg, function () { return mainWindow; }, writeLogFile));
      } catch (e) {
        writeLogFile('warn', '[LanWS] restartLanWebSocket: ' + (e && e.message ? e.message : String(e)));
        resolve({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    }, 250);
  });
}

ipcMain.handle('tc-ws-restart', (_event, opts) => {
  const clientId = opts && opts.clientId ? String(opts.clientId) : '';
  const lastRevision = opts && opts.lastRevision != null ? opts.lastRevision : undefined;
  return restartLanWebSocket(clientId, lastRevision);
});

ipcMain.handle('tc-ws-stop', () => {
  try { lanWsSync.stopAll(); } catch (_e) {}
  return { ok: true };
});

ipcMain.handle('tc-ws-status', () => {
  return lanWsSync.getStatus();
});

/** Prefer loopback for Main-PC-only admin APIs when role is network_server. */
function lanMainLoopbackUrl(cfg, relPath) {
  const base = (cfg && cfg.apiUrl) ? String(cfg.apiUrl) : '';
  const rel = String(relPath || '').replace(/^\//, '');
  if (!base) return '';
  try {
    if (cfg.role === 'network_server') {
      const u = new URL(base);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
        u.hostname = '127.0.0.1';
        return u.toString().replace(/\/?$/, '/') + rel;
      }
    }
  } catch (_e) { /* fall through */ }
  return base.replace(/\/?$/, '/') + rel;
}

/** Signed LAN GET/POST from renderer (device auth or legacy fallback). */
ipcMain.handle('tc-lan-request', async (event, payload) => {
  const cfg = loadNetworkConfig();
  if (!cfg || !cfg.apiUrl || cfg.role === 'standalone') {
    return { success: false, message: 'Not in network mode' };
  }
  const method = (payload && payload.method) ? String(payload.method).toUpperCase() : 'GET';
  const relPath = (payload && payload.path) ? String(payload.path).replace(/^\//, '') : '';
  if (/save_license\.php/i.test(relPath)) {
    return { success: false, message: 'save_license is main-process only' };
  }
  if (/device_manage\.php/i.test(relPath) || (/check_license\.php/i.test(relPath) && method === 'POST')) {
    const gate = tcRequireSessionRole(event, ['admin']);
    if (!gate.ok) {
      return { success: false, message: gate.message || 'Admin session required.' };
    }
  }
  /* Main-PC shop sync/wipe must hit loopback — LAN IP rejects legacy API-key auth. */
  const isWipe = /wipe_shop_data\.php/i.test(relPath);
  const isShopSync = /sync_patch\.php|server_state\.php|health_check\.php/i.test(relPath);
  const useLoopback = cfg.role === 'network_server' && (isWipe || isShopSync);
  const fullUrl = useLoopback
    ? (lanMainLoopbackUrl(cfg, relPath) || (cfg.apiUrl + relPath))
    : (cfg.apiUrl + relPath);
  const postTimeoutMs = (payload && payload.timeoutMs > 0)
    ? payload.timeoutMs
    : (isWipe || isShopSync ? 120000 : 10000);
  const extra = Object.assign({}, (payload && payload.headers) || {});
  if (payload && payload.clientId) extra['X-TC-Client-ID'] = String(payload.clientId);
  try {
    if (method === 'GET') {
      const data = await lanGet(fullUrl, cfg);
      return { success: true, data: data };
    }
    const body = (payload && payload.body) || {};
    const data = await lanPost(fullUrl, body, extra, cfg, postTimeoutMs);
    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: e && e.message ? e.message : String(e) };
  }
});

/** Build auth headers only (no secret returned). For renderer fetch fallback. */
ipcMain.handle('tc-device-auth-headers', (_event, payload) => {
  const cfg = loadNetworkConfig();
  const method = (payload && payload.method) ? String(payload.method) : 'GET';
  const url = (payload && payload.url) ? String(payload.url) : '';
  const body = (payload && payload.body != null) ? String(payload.body) : '';
  const headers = buildLanHeaders(method, url, body, cfg, (payload && payload.extraHeaders) || {});
  return { headers: headers, mode: headers['X-TC-DEVICE-ID'] ? 'device' : (cfg && cfg.apiKey ? 'legacy' : 'none') };
});

ipcMain.handle('tc-device-credentials-load', () => {
  const store = getDeviceStore();
  const creds = store.loadDeviceCredentials(app.getPath('userData'));
  if (!creds) return { ok: true, credentials: null };
  return {
    ok: true,
    credentials: {
      device_id: creds.device_id,
      device_name: creds.device_name,
      status: creds.status,
      token_id: creds.token_id,
      permissions: creds.permissions,
      computer_name: creds.computer_name,
      registered_at: creds.registered_at,
    },
  };
});

ipcMain.handle('tc-device-credentials-save', (event, payload) => {
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required' };
  const store = getDeviceStore();
  const existing = store.loadDeviceCredentials(app.getPath('userData')) || {};
  const merged = Object.assign({}, existing, payload || {});
  if (!merged.device_id || !merged.device_secret) {
    return { ok: false, message: 'device_id and device_secret required' };
  }
  return { ok: store.saveDeviceCredentials(app.getPath('userData'), merged) };
});

ipcMain.handle('tc-device-create-identity', (_event, payload) => {
  const store = getDeviceStore();
  const id = store.createLocalDeviceIdentity(
    payload && payload.device_name,
    payload && payload.computer_name,
    payload && payload.software_version
  );
  store.saveDeviceCredentials(app.getPath('userData'), id);
  return { ok: true, device_id: id.device_id, status: id.status };
});

ipcMain.handle('tc-device-register', async (_event, payload) => {
  const cfg = loadNetworkConfig();
  if (!cfg || !cfg.apiUrl) return { ok: false, message: 'Network not configured' };
  const store = getDeviceStore();
  let creds = store.loadDeviceCredentials(app.getPath('userData'));
  if (!creds || !creds.device_id) {
    creds = store.createLocalDeviceIdentity(
      payload && payload.device_name,
      getClientDeviceName(),
      app.getVersion()
    );
    store.saveDeviceCredentials(app.getPath('userData'), creds);
  }
  try {
    const r = await lanPost(cfg.apiUrl + 'device_register.php', {
      device_id: creds.device_id,
      device_name: creds.device_name || getClientDeviceName(),
      computer_name: getClientDeviceName(),
      software_version: app.getVersion(),
      mac_address: payload && payload.mac_address ? payload.mac_address : null,
    }, {}, cfg);
    if (r && r.success) {
      creds.status = 'pending';
      if (r.data && r.data.token_id) creds.token_id = r.data.token_id;
      store.saveDeviceCredentials(app.getPath('userData'), creds);
      return { ok: true, device_id: creds.device_id, status: 'pending', message: r.message };
    }
    return { ok: false, message: (r && r.message) || 'Registration failed' };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('tc-device-poll-status', async () => {
  const cfg = loadNetworkConfig();
  const store = getDeviceStore();
  const creds = store.loadDeviceCredentials(app.getPath('userData'));
  if (!cfg || !cfg.apiUrl || !creds || !creds.device_id) {
    return { ok: false, message: 'No device identity' };
  }
  try {
    let url = cfg.apiUrl + 'device_status.php?device_id=' + encodeURIComponent(creds.device_id);
    if (creds.token_id) url += '&token_id=' + encodeURIComponent(creds.token_id);
    const r = await lanGet(url, cfg);
    const d = (r && r.data) || {};
    if (d.status === 'approved' && d.device_secret) {
      creds.device_secret = d.device_secret;
      creds.status = 'approved';
      creds.token_id = d.token_id || creds.token_id;
      creds.permissions = d.permissions || creds.permissions;
      store.saveDeviceCredentials(app.getPath('userData'), creds);
    } else if (d.status) {
      creds.status = d.status;
      store.saveDeviceCredentials(app.getPath('userData'), creds);
    }
    return { ok: true, status: d.status, device_id: creds.device_id, has_secret: !!creds.device_secret };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('tc-device-manage', async (event, payload) => {
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) {
    return { ok: false, message: gate.message || 'Admin session required for device administration.' };
  }
  const cfg = loadNetworkConfig();
  if (!cfg || !cfg.apiUrl || cfg.role !== 'network_server') {
    return { ok: false, message: 'Main server only' };
  }
  const action = payload && payload.action;
  try {
    if (action === 'list' || action === 'list_pending') {
      const qs = action === 'list_pending' ? '?pending=1' : '';
      const r = await lanGet(cfg.apiUrl + 'device_manage.php' + qs, cfg);
      return { ok: !!(r && r.success), data: r && r.data, message: r && r.message };
    }
    const r = await lanPost(cfg.apiUrl + 'device_manage.php', payload || {}, {}, cfg);
    return { ok: !!(r && r.success), data: r && r.data, message: r && r.message };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('tc-network-config-load', () => {
  const cfg = loadNetworkConfig() || {};
  const hasApiKey = !!(cfg.apiKey && String(cfg.apiKey).length);
  /* Never ship the LAN secret to the renderer by default (XSS / DevTools). */
  return Object.assign({}, cfg, { apiKey: '', hasApiKey: hasApiKey });
});

/** Admin-only: reveal apiKey for Settings copy / client paste UX. */
ipcMain.handle('tc-network-api-key-reveal', (event) => {
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required', apiKey: '' };
  const cfg = loadNetworkConfig() || {};
  return { ok: true, apiKey: String(cfg.apiKey || '') };
});

/** Sync check for preload client-mode guards (contextBridge API is read-only in renderer). */
ipcMain.on('tc-is-network-client-sync', (event) => {
  event.returnValue = isNetworkClientRole();
});

/** Display-only: hostname + short device id for POS client header (not licensing). */
ipcMain.handle('tc-client-machine-label', () => {
  try {
    const deviceId = generateDeviceId();
    const short = deviceId.length > 10 ? deviceId.slice(0, 8) : deviceId.slice(0, Math.min(8, deviceId.length));
    return { hostname: getClientDeviceName(), deviceIdShort: short, deviceId: deviceId };
  } catch (_e) {
    return { hostname: '', deviceIdShort: '', deviceId: '' };
  }
});

function normalizeNetworkApiUrl(raw) {
  var u = String(raw || '').trim();
  if (!u) return u;
  if (!u.endsWith('/')) u += '/';
  if (u.indexOf('/api/') < 0) u += 'api/';
  return u;
}

function sanitizeNetworkConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') {
    return { role: 'standalone', apiUrl: '', apiKey: '', xamppPath: '', port: 80, wizardComplete: false };
  }
  const role = ['standalone', 'network_server', 'network_client'].includes(cfg.role) ? cfg.role : 'standalone';
  let apiUrl = '';
  if (typeof cfg.apiUrl === 'string' && cfg.apiUrl.trim()) {
    const raw = cfg.apiUrl.trim();
    if (raw.length <= 2048) {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
        if (u.username || u.password) throw new Error('credentials');
        const host = u.hostname.toLowerCase();
        const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (m) {
          const a = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
          const priv =
            a[0] === 10 ||
            (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
            (a[0] === 192 && a[1] === 168) ||
            a[0] === 127;
          if (!priv) {
            writeLogFile('warn', '[NetConfig] Rejected non-private IPv4 apiUrl');
          } else {
            apiUrl = u.href;
          }
        } else if (host === 'localhost' || host.endsWith('.local') || host === '::1') {
          apiUrl = u.href;
        } else {
          writeLogFile('warn', '[NetConfig] Rejected non-LAN hostname apiUrl: ' + host);
        }
      } catch (e) {
        writeLogFile('warn', '[NetConfig] Invalid apiUrl: ' + (e && e.message));
      }
    }
  }
  var apiKeySan = '';
  if (typeof cfg.apiKey === 'string' && cfg.apiKey.length) {
    apiKeySan = cfg.apiKey.replace(/[\r\n\x00]/g, '').slice(0, 512);
  }
  return {
    role,
    apiUrl,
    apiKey: apiKeySan,
    xamppPath: typeof cfg.xamppPath === 'string' ? cfg.xamppPath.slice(0, 512) : '',
    port: Math.min(65535, Math.max(1, parseInt(cfg.port, 10) || 80)),
    wsPort: Math.min(65535, Math.max(1024, parseInt(cfg.wsPort, 10) || lanWsSync.DEFAULT_WS_PORT)),
    wizardComplete: !!cfg.wizardComplete,
  };
}

/** Test server reachability + API key before saving network config (main-process HTTP — reliable in Electron). */
ipcMain.handle('tc-network-test-connection', async (_event, payload) => {
  const apiUrl = normalizeNetworkApiUrl(payload && payload.apiUrl);
  const apiKey = (payload && payload.apiKey) ? String(payload.apiKey).trim() : '';
  if (!apiUrl || apiUrl.indexOf('http') !== 0) {
    return { ok: false, message: 'Address must start with http:// or https://' };
  }
  if (!apiKey) {
    return { ok: false, message: 'Enter the Security Key from the server PC.' };
  }
  const testCfg = { apiUrl: apiUrl, apiKey: apiKey, forceLegacy: true, role: 'network_client' };
  try {
    const pingJson = await lanGet(apiUrl + 'ping.php', { forceLegacy: true });
    if (!pingJson || pingJson.success !== true) {
      return { ok: false, message: (pingJson && pingJson.message) ? pingJson.message : 'Server is not ready' };
    }
    const prodJson = await lanGet(apiUrl + 'get_products.php', testCfg);
    if (!prodJson || prodJson.success === false) {
      const m = String((prodJson && prodJson.message) || '').toLowerCase();
      if (m.indexOf('unauthorized') >= 0 || m.indexOf('invalid api key') >= 0) {
        return { ok: false, message: 'Security key is incorrect.' };
      }
      return { ok: false, message: (prodJson && prodJson.message) ? prodJson.message : 'Could not verify server key' };
    }
    const products = (prodJson && prodJson.products) || (prodJson.data && prodJson.data.products);
    if (!Array.isArray(products)) {
      return { ok: false, message: 'Invalid response from server.' };
    }
    return { ok: true, message: 'Connection OK', productCount: products.length };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.toLowerCase().indexOf('timeout') >= 0) {
      return { ok: false, message: 'Connection timed out — check the server address and that XAMPP is running on the main PC.' };
    }
    return { ok: false, message: 'Cannot reach server: ' + msg };
  }
});

ipcMain.handle('tc-network-config-save', (event, cfg) => {
  const existing = loadNetworkConfig();
  /* First-run wizard may save before login; later changes need admin session. */
  if (existing && existing.wizardComplete) {
    const gate = tcRequireSessionRole(event, ['admin']);
    if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required', config: null };
  }
  var merged = cfg;
  /* Counter PCs may update URL/key but must not silently change role — unless explicit upgrade/downgrade. */
  if (existing && existing.role === 'network_client' && cfg && cfg.role === 'network_client') {
    merged = Object.assign({}, existing, cfg || {}, { role: 'network_client' });
  }
  /* Standalone mode: drop network credentials so sync cannot reopen. */
  if (merged && merged.role === 'standalone') {
    merged = Object.assign({}, merged, {
      role: 'standalone',
      apiUrl: '',
      apiKey: '',
      xamppPath: '',
      wizardComplete: true,
    });
  } else if (merged && !(merged.apiKey && String(merged.apiKey).trim()) && existing && existing.apiKey) {
    /* Preserve stored apiKey when renderer sends empty (stripped load). */
    merged = Object.assign({}, merged, { apiKey: existing.apiKey });
  }
  const sanitized = sanitizeNetworkConfig(merged);
  const ok = saveNetworkConfig(sanitized);
  if (ok) {
    try { restartLanWebSocket('', undefined); } catch (_e) {}
  }
  if (ok && sanitized.role === 'network_server' && isLocalTrialLicense()) {
    setTimeout(function () {
      syncTrialLicenseToMySQLNow(sanitized).catch(function () {});
    }, 2500);
  }
  const safe = Object.assign({}, sanitized, {
    apiKey: '',
    hasApiKey: !!(sanitized.apiKey && String(sanitized.apiKey).length),
  });
  return { ok, config: safe };
});

ipcMain.handle('tc-network-config-reset', (event) => {
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required' };
  try {
    if (fs.existsSync(NET_CONFIG_FILE)) fs.unlinkSync(NET_CONFIG_FILE);
    return { ok: true };
  } catch (e) { return { ok: false, message: e.message }; }
});

/* ── License utilities for Settings -> Network tab ───────────────────────── */
ipcMain.handle('tc-license-sync-now', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    return await forceCloudLicenseSync(true);
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : 'Cloud sync failed.' };
  }
});

ipcMain.handle('tc-license-verify-now', async () => {
  try {
    return await verifyLicenseOnlineNow();
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : 'Verification failed.' };
  }
});

ipcMain.handle('tc-connected-clients-list', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const cfg = loadNetworkConfig();
    if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl) return { ok: false, message: 'Not in network server mode.' };
    const data = await lanGet(cfg.apiUrl + 'check_license.php?listClients=1', cfg.apiKey);
    const d = data && data.data ? data.data : {};
    return {
      ok: true,
      max_clients: d.max_clients != null ? (parseInt(d.max_clients, 10) || 0) : 0,
      connected: d.connected_clients != null ? (parseInt(d.connected_clients, 10) || 0) : 0,
      clients: Array.isArray(d.clients) ? d.clients : [],
    };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : 'Could not load connected clients.' };
  }
});

ipcMain.handle('tc-connected-client-remove', async (event, payload) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required.' };
  try {
    const cfg = loadNetworkConfig();
    if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl) return { ok: false, message: 'Not in network server mode.' };
    const deviceId = payload && payload.deviceId ? String(payload.deviceId) : '';
    if (!deviceId) return { ok: false, message: 'Missing deviceId.' };
    const url = lanMainLoopbackUrl(cfg, 'check_license.php') || (cfg.apiUrl + 'check_license.php');
    const res = await lanPost(url, { action: 'remove_client', deviceId: deviceId }, { 'X-TC-KEY': cfg.apiKey || '' }, cfg);
    return { ok: !!(res && res.success), message: (res && res.message) ? res.message : (res && res.success ? 'Removed' : 'Remove failed') };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : 'Could not remove client.' };
  }
});

ipcMain.handle('tc-connected-client-set-label', async (event, payload) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const gate = tcRequireSessionRole(event, ['admin']);
  if (!gate.ok) return { ok: false, message: gate.message || 'Admin session required.' };
  try {
    const cfg = loadNetworkConfig();
    if (!cfg || cfg.role !== 'network_server' || !cfg.apiUrl) return { ok: false, message: 'Not in network server mode.' };
    const deviceId = payload && payload.deviceId ? String(payload.deviceId) : '';
    const clientLabel = payload && payload.clientLabel != null ? String(payload.clientLabel) : '';
    if (!deviceId) return { ok: false, message: 'Missing deviceId.' };
    const url = lanMainLoopbackUrl(cfg, 'check_license.php') || (cfg.apiUrl + 'check_license.php');
    const res = await lanPost(url, { action: 'set_client_label', deviceId, clientLabel: clientLabel.trim() }, { 'X-TC-KEY': cfg.apiKey || '' }, cfg);
    return {
      ok: !!(res && res.success),
      message: (res && res.message) ? res.message : (res && res.success ? 'OK' : 'Update failed'),
      clientLabel: res && res.client_label != null ? String(res.client_label) : '',
      labelAdjusted: !!(res && res.label_adjusted),
    };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : 'Could not update label.' };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   XAMPP DETECTION
   ═══════════════════════════════════════════════════════════════════ */
const XAMPP_CANDIDATE_PATHS = ['C:\\xampp', 'D:\\xampp', 'C:\\Program Files\\XAMPP', 'C:\\Program Files (x86)\\XAMPP'];

function detectXamppPath() {
  for (const base of XAMPP_CANDIDATE_PATHS) {
    if (
      fs.existsSync(path.join(base, 'apache', 'bin', 'httpd.exe')) &&
      fs.existsSync(path.join(base, 'mysql', 'bin', 'mysql.exe'))
    ) {
      return base;
    }
  }
  return null;
}

ipcMain.handle('tc-check-xampp', () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const found = detectXamppPath();
  return found ? { found: true, path: found } : { found: false };
});

/* ═══════════════════════════════════════════════════════════════════
   XAMPP SERVICE CONTROL
   ═══════════════════════════════════════════════════════════════════ */
function runCmd(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * Spawn a long-running server process in the background (fire-and-forget).
 * The process is detached and stdio is ignored so it never blocks the caller.
 */
function spawnBackground(exe, args = []) {
  try {
    const { spawn: nodeSpawn } = require('child_process');
    const child = nodeSpawn(exe, args, {
      detached:    true,
      stdio:       'ignore',
      windowsHide: true,
    });
    child.unref();
    writeLogFile('info', '[spawnBackground] Launched: ' + exe + ' ' + args.join(' '));
    return true;
  } catch (e) {
    writeLogFile('error', '[spawnBackground] Failed: ' + e.message);
    return false;
  }
}

/**
 * Try to start a Windows service by name.
 * Resolves true  → started ok OR was already running.
 * Resolves false → not found / failed.
 */
function tryStartService(name) {
  return new Promise(resolve => {
    exec('net start "' + name + '"', { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) => {
      if (!err) { resolve(true); return; }
      const combined = (stdout + stderr + (err.message || '')).toLowerCase();
      /* "already started" is fine — service is running */
      resolve(combined.includes('already'));
    });
  });
}

ipcMain.handle('tc-start-xampp-services', async (_event, { xamppPath }) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const base = xamppPath || detectXamppPath();
  if (!base) return { ok: false, message: 'XAMPP not found.' };

  writeLogFile('info', '[XAMPP] Starting services at: ' + base);

  /* ── Apache ─────────────────────────────────────────────────────── */
  let apacheOk = await tryStartService('Apache2.4');
  if (!apacheOk) apacheOk = await tryStartService('Apache');
  if (!apacheOk) {
    /* Fall back: spawn httpd.exe detached (never blocks) */
    const httpdExe = path.join(base, 'apache', 'bin', 'httpd.exe');
    if (fs.existsSync(httpdExe)) {
      apacheOk = spawnBackground(httpdExe);
    }
  }
  writeLogFile('info', '[XAMPP] Apache start result: ' + apacheOk);

  /* ── MySQL ──────────────────────────────────────────────────────── */
  let mysqlOk = await tryStartService('MySQL');
  if (!mysqlOk) mysqlOk = await tryStartService('MySQL80');
  if (!mysqlOk) mysqlOk = await tryStartService('MySQL57');
  if (!mysqlOk) {
    /* Fall back: spawn mysqld.exe detached */
    const mysqldExe = path.join(base, 'mysql', 'bin', 'mysqld.exe');
    if (fs.existsSync(mysqldExe)) {
      mysqlOk = spawnBackground(mysqldExe, ['--standalone']);
    }
  }
  writeLogFile('info', '[XAMPP] MySQL start result: ' + mysqlOk);

  if (!apacheOk && !mysqlOk) {
    return { ok: false, message: 'Could not start Apache or MySQL. Try opening the XAMPP Control Panel manually.' };
  }

  /* Give services a moment to fully initialise before caller checks port */
  await new Promise(r => setTimeout(r, 3500));
  return { ok: true };
});

ipcMain.handle('tc-stop-xampp-services', async (_event, { xamppPath }) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const base = xamppPath || detectXamppPath();
  if (!base) return { ok: false, message: 'XAMPP not found.' };

  try {
    const stopBat = path.join(base, 'xampp_stop.bat');
    if (fs.existsSync(stopBat)) await runCmd('"' + stopBat + '"');
  } catch (e) { /* ignore */ }

  return { ok: true };
});

/* ═══════════════════════════════════════════════════════════════════
   OPEN XAMPP INSTALLER
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-open-xampp-installer', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  /* Search for bundled installer in several locations (handles .exe and .exe.exe) */
  const candidates = [
    path.join(__dirname, 'build', 'setup-bundles', 'xampp-installer.exe.exe'),
    path.join(__dirname, 'build', 'setup-bundles', 'xampp-installer.exe'),
    path.join(__dirname, 'setup-bundles', 'xampp-installer.exe.exe'),
    path.join(__dirname, 'setup-bundles', 'xampp-installer.exe'),
  ];

  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    writeLogFile('info', '[XAMPP] Launching bundled installer: ' + found);
    const err = await shell.openPath(found);
    if (err) {
      writeLogFile('error', '[XAMPP] openPath failed: ' + err);
      return { ok: false, error: err };
    }
    return { ok: true, source: 'bundled', path: found };
  }

  writeLogFile('warn', '[XAMPP] Bundled installer not found, opening download page');
  await shell.openExternal('https://www.apachefriends.org/download.html');
  return { ok: true, source: 'web' };
});

/* ═══════════════════════════════════════════════════════════════════
   HTTP PORT DETECTION
   ═══════════════════════════════════════════════════════════════════ */
function testPort(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/', method: 'GET', timeout: 2000 },
      (res) => { resolve(res.statusCode < 600); }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

ipcMain.handle('tc-test-http-port', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  for (const port of [80, 8080, 8000, 3000, 8888]) {
    const ok = await testPort(port);
    if (ok) return { ok: true, port };
  }
  return { ok: false };
});

/* ═══════════════════════════════════════════════════════════════════
   LAN IP DETECTION
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-get-lan-ip', () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of (addrs || [])) {
      if (!addr.internal && addr.family === 'IPv4') {
        return { ip: addr.address, iface: name };
      }
    }
  }
  return { ip: '127.0.0.1', iface: 'loopback' };
});

/* ═══════════════════════════════════════════════════════════════════
   COPY API FILES TO XAMPP HTDOCS
   ═══════════════════════════════════════════════════════════════════ */
/** PHP API folder: dev = next to main.cjs; packaged = extraResources → process.resourcesPath/network-api */
function getNetworkApiDir() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'network-api');
    if (fs.existsSync(bundled)) return bundled;
  }
  const dev = path.join(__dirname, 'network-api');
  if (fs.existsSync(dev)) return dev;
  /* Portable / odd installs: beside Techon-ERP.exe */
  try {
    const besideExe = path.join(path.dirname(process.execPath), 'network-api');
    if (fs.existsSync(besideExe)) return besideExe;
  } catch (_) {}
  return dev;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

ipcMain.handle('tc-copy-api-files', (_event, { xamppPath }) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const base = xamppPath || detectXamppPath();
    if (!base) return { ok: false, message: 'XAMPP path not found.' };

    const src  = getNetworkApiDir();
    const dest = path.join(base, 'htdocs', 'api');

    if (!fs.existsSync(src)) {
      return {
        ok: false,
        message: 'network-api folder not found. Reinstall the app or run from the project folder (erp-app/network-api).'
      };
    }

    copyDirRecursive(src, dest);
    return { ok: true, dest };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   DATABASE SETUP  (create DB + import schema.sql via mysql CLI)
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-setup-database', async (_event, { xamppPath }) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const base     = xamppPath || detectXamppPath();
    if (!base) return { ok: false, message: 'XAMPP not found.' };

    const mysqlBin = path.join(base, 'mysql', 'bin', 'mysql.exe');
    const schema   = path.join(getNetworkApiDir(), 'schema.sql');

    if (!fs.existsSync(mysqlBin)) return { ok: false, message: 'mysql.exe not found at ' + mysqlBin };
    if (!fs.existsSync(schema))   return { ok: false, message: 'schema.sql not found.' };

    /* Create database */
    await runCmd('"' + mysqlBin + '" -u root -e "CREATE DATABASE IF NOT EXISTS techon_erp_network CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"');

    /* Import schema */
    await runCmd('"' + mysqlBin + '" -u root techon_erp_network < "' + schema + '"');

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   API KEY GENERATION + WRITE TO XAMPP
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-generate-api-key', () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  return { key: crypto.randomBytes(32).toString('hex') };
});

ipcMain.handle('tc-write-api-key', (_event, { xamppPath, key }) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const base = xamppPath || detectXamppPath();
    if (!base) return { ok: false, message: 'XAMPP not found.' };

    const apiDir  = path.join(base, 'htdocs', 'api');
    const keyFile = path.join(apiDir, 'tc_api_key.php');

    if (!fs.existsSync(apiDir)) return { ok: false, message: 'API directory not found. Run "Copy API files" first.' };

    const content = '<?php\ndefine(\'TC_API_KEY\', \'' + String(key).replace(/'/g, '') + '\');\n?>';
    fs.writeFileSync(keyFile, content, 'utf8');
    writeLogFile('info', 'API key written to ' + keyFile);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   DATABASE BACKUP  (mysqldump → Documents/TechonERP/backups/)
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-backup-database', async (_event, payload) => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const cfg       = loadNetworkConfig();
    const xamppBase = (payload && payload.xamppPath) || (cfg && cfg.xamppPath) || detectXamppPath();
    if (!xamppBase) return { ok: false, message: 'XAMPP path not found.' };

    const dumpBin = path.join(xamppBase, 'mysql', 'bin', 'mysqldump.exe');
    if (!fs.existsSync(dumpBin)) return { ok: false, message: 'mysqldump.exe not found.' };

    const backupDir = path.join(app.getPath('documents'), 'TechonERP', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const stamp = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    const outFile = path.join(backupDir, 'techon-db-backup-' + stamp + '.sql');

    await runCmd('"' + dumpBin + '" -u root --databases techon_erp_network > "' + outFile + '"');

    /* Prune old DB backups (keep 30) */
    const sqlFiles = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('techon-db-backup-') && f.endsWith('.sql'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    sqlFiles.slice(30).forEach(f => { try { fs.unlinkSync(path.join(backupDir, f.name)); } catch (_) {} });

    writeLogFile('info', 'DB backup saved: ' + outFile);
    return { ok: true, path: outFile };
  } catch (e) {
    writeLogFile('error', 'DB backup failed: ' + e.message);
    return { ok: false, message: e.message };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   OPEN BACKUP FOLDER
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-open-backup-folder', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const dir = path.join(app.getPath('documents'), 'TechonERP', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return { ok: true };
});

/* ═══════════════════════════════════════════════════════════════════
   FILE LOGGER IPC
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-write-log', (_event, { level, message }) => {
  const msg = String(message || '').slice(0, 8000);
  writeLogFile(level || 'info', msg);
  return { ok: true };
});

/** Push ERP data patches to LAN sync_patch.php (main + counter). Reads fresh network config from disk. */
ipcMain.handle('tc-sync-patch', async (_event, payload) => {
  const cfg = loadNetworkConfig();
  const patches = payload && Array.isArray(payload.patches) ? payload.patches : [];
  const keys = patches.map(function (p) { return p && p.key; }).filter(Boolean).join(',');
  const clientId = (payload && payload.client_id) ? String(payload.client_id) : '';
  writeLogFile('info', '[SyncEngine:IPC] tc-sync-patch keys=[' + keys + '] role=' + (cfg && cfg.role ? cfg.role : 'null') + ' apiUrl=' + (cfg && cfg.apiUrl ? cfg.apiUrl : 'null'));
  try {
    if (!cfg || !cfg.apiUrl || cfg.role === 'standalone') {
      writeLogFile('error', '[SyncEngine:IPC] blocked — not in network mode');
      return { success: false, message: 'Not in network mode' };
    }
    if (!patches.length) {
      return { success: false, message: 'No patches provided' };
    }
    /* Main PC must POST legacy-key sync via loopback — LAN IP is blocked by PHP. */
    const postUrl = (cfg.role === 'network_server')
      ? (lanMainLoopbackUrl(cfg, 'sync_patch.php') || (cfg.apiUrl + 'sync_patch.php'))
      : (cfg.apiUrl + 'sync_patch.php');
    const extra = {};
    if (clientId) extra['X-TC-Client-ID'] = clientId;
    const isForce = patches.some(function (p) { return p && p._forceReplace; });
    const timeoutMs = isForce || patches.length > 8 ? 120000 : 30000;
    writeLogFile('info', '[SyncEngine:HTTP] POST ' + postUrl + ' keys=[' + keys + ']');
    const r = await lanPost(
      postUrl,
      { patches: patches, client_id: clientId },
      extra,
      cfg,
      timeoutMs
    );
    writeLogFile(
      r && r.success ? 'info' : 'error',
      '[SyncEngine] ' + cfg.role + ' pushed [' + keys + '] -> ' + (r && r.message ? r.message : (r && r.success ? 'ok' : 'failed'))
    );
    if (r && r.success) {
      const changedKeys = patches.map(function (p) { return p && p.key; }).filter(Boolean);
      if (cfg.role === 'network_server') {
        lanWsSync.broadcastAfterPatch(changedKeys, clientId);
      } else if (cfg.role === 'network_client') {
        lanWsSync.clientNotifyKeys(changedKeys, clientId);
      }
    }
    return r;
  } catch (e) {
    writeLogFile('error', '[SyncEngine] tc-sync-patch failed: ' + (e && e.message ? e.message : String(e)));
    return { success: false, message: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('tc-open-log-folder', async () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  const dir = getLogDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return { ok: true };
});

/* ═══════════════════════════════════════════════════════════════════
   LAST BACKUP DATE  (for daily reminder)
   ═══════════════════════════════════════════════════════════════════ */
ipcMain.handle('tc-last-db-backup-date', () => {
  if (isNetworkClientRole()) return clientModeBlockedIpc();
  try {
    const backupDir = path.join(app.getPath('documents'), 'TechonERP', 'backups');
    if (!fs.existsSync(backupDir)) return { date: null };
    const sqlFiles = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('techon-db-backup-') && f.endsWith('.sql'))
      .map(f => fs.statSync(path.join(backupDir, f)).mtimeMs);
    if (sqlFiles.length === 0) return { date: null };
    return { date: new Date(Math.max(...sqlFiles)).toISOString() };
  } catch (_) { return { date: null }; }
});
