/**
 * In-app auto-update via electron-updater (GitHub Releases).
 * Upgrades the existing NSIS install — shop data in userData is preserved.
 */
const { autoUpdater } = require('electron-updater');
const { BrowserWindow, dialog, app } = require('electron');

const RELEASE_OWNER = 'imrasidh';
const RELEASE_REPO = 'TechonERP-releases';

let _setupDone = false;
let _downloadStarted = false;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send(channel, payload);
    } catch (_e) { /* ignore */ }
  }
}

function setupAutoUpdater() {
  if (_setupDone) return;
  _setupDone = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: RELEASE_OWNER,
      repo: RELEASE_REPO,
    });
  } catch (e) {
    console.warn('[updater] setFeedURL failed:', e && e.message ? e.message : e);
  }

  autoUpdater.on('checking-for-update', function () {
    broadcast('tc-update-event', { status: 'checking' });
  });

  autoUpdater.on('update-available', function (info) {
    broadcast('tc-update-event', {
      status: 'available',
      version: info && info.version,
      releaseNotes: info && (info.releaseNotes || info.releaseName) || '',
    });
  });

  autoUpdater.on('update-not-available', function (info) {
    broadcast('tc-update-event', {
      status: 'uptodate',
      version: info && info.version,
    });
  });

  autoUpdater.on('download-progress', function (progress) {
    broadcast('tc-update-event', {
      status: 'downloading',
      percent: progress && typeof progress.percent === 'number' ? progress.percent : 0,
      transferred: progress && progress.transferred,
      total: progress && progress.total,
      bytesPerSecond: progress && progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', function (info) {
    _downloadStarted = false;
    broadcast('tc-update-event', {
      status: 'downloaded',
      version: info && info.version,
    });
  });

  autoUpdater.on('error', function (err) {
    _downloadStarted = false;
    broadcast('tc-update-event', {
      status: 'error',
      message: err && err.message ? String(err.message) : 'Update failed',
    });
  });
}

async function checkForUpdates() {
  setupAutoUpdater();
  if (!app.isPackaged) {
    return {
      ok: false,
      status: 'dev',
      message: 'In-app updates work only in the installed app (not in development).',
    };
  }
  try {
    _downloadStarted = false;
    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result && result.updateInfo;
    const latest = updateInfo && updateInfo.version ? String(updateInfo.version) : null;
    const current = app.getVersion();
    if (!latest) {
      return { ok: true, status: 'uptodate', currentVersion: current };
    }
    /* Semver compare is handled by electron-updater; if we got here with updateInfo
       while channel says not-available, treat as uptodate. */
    return {
      ok: true,
      status: 'checked',
      currentVersion: current,
      latestVersion: latest,
    };
  } catch (e) {
    return {
      ok: false,
      status: 'error',
      message: e && e.message ? String(e.message) : 'Could not check for updates',
    };
  }
}

async function downloadUpdate() {
  setupAutoUpdater();
  if (!app.isPackaged) {
    return { ok: false, message: 'Updates require the installed app.' };
  }
  if (_downloadStarted) {
    return { ok: true, status: 'downloading' };
  }
  try {
    _downloadStarted = true;
    await autoUpdater.downloadUpdate();
    return { ok: true, status: 'downloading' };
  } catch (e) {
    _downloadStarted = false;
    return {
      ok: false,
      message: e && e.message ? String(e.message) : 'Download failed',
    };
  }
}

function quitAndInstall() {
  setupAutoUpdater();
  try {
    /* isSilent=false so NSIS can run; isForceRunAfter=true restarts app */
    setImmediate(function () {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e && e.message ? String(e.message) : 'Could not start installer',
    };
  }
}

async function promptAndInstall() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  const choice = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update ready',
    message: 'TechonERP update is ready to install.',
    detail: 'Your shop data stays on this PC. The app will restart to finish the update (not a fresh install).',
  });
  if (choice.response === 0) {
    return quitAndInstall();
  }
  return { ok: true, status: 'deferred' };
}

module.exports = {
  setupAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  promptAndInstall,
};
