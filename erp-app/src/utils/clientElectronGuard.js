/**
 * Renderer-side guard for window.electronAPI when role is network_client.
 * Main process already enforces; this avoids unnecessary IPC and matches UX expectations.
 */

export function tcIsDevEnv() {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) return true;
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development") return true;
  return false;
}

export var CLIENT_BLOCKED_RESPONSE = { status: "blocked", message: "Restricted in client mode" };

var BLOCKED_METHODS = [
  "saveBackup",
  "selectFolder",
  "syncLicenseNow",
  "getConnectedClients",
  "removeConnectedClient",
  "checkXampp",
  "startXamppServices",
  "stopXamppServices",
  "openXamppInstaller",
  "testHttpPort",
  "getLanIp",
  "copyApiFiles",
  "setupDatabase",
  "generateApiKey",
  "writeApiKey",
  "backupDatabase",
  "openBackupFolder",
  "getLastBackupDate",
  "openLogFolder",
];

export function installClientElectronGuards() {
  var api = typeof window !== "undefined" ? window.electronAPI : null;
  if (!api || api.__tcClientGuardInstalled) {
    return function () {};
  }
  var originals = {};
  BLOCKED_METHODS.forEach(function (name) {
    var fn = api[name];
    if (typeof fn !== "function") return;
    originals[name] = fn.bind(api);
    api[name] = function () {
      if (tcIsDevEnv()) {
        console.warn("[TC_CLIENT] blocked electronAPI." + name);
      }
      if (name === "saveBackup") {
        return undefined;
      }
      return Promise.resolve(CLIENT_BLOCKED_RESPONSE);
    };
  });
  api.__tcClientGuardInstalled = true;
  return function restore() {
    Object.keys(originals).forEach(function (name) {
      api[name] = originals[name];
    });
    try {
      delete api.__tcClientGuardInstalled;
    } catch (e) {
      api.__tcClientGuardInstalled = false;
    }
  };
}
