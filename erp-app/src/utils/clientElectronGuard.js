/**
 * Renderer-side guard for window.electronAPI when role is network_client.
 * Main process + preload enforce restrictions; contextBridge exposes a frozen API
 * so we must not assign api.saveBackup = ... in the renderer (throws in production).
 */

export function tcIsDevEnv() {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PROD === true) return false;
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) return true;
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development") return true;
  return false;
}

export var CLIENT_BLOCKED_RESPONSE = { status: "blocked", message: "Restricted in client mode" };

export function installClientElectronGuards() {
  // Blocked methods are guarded in preload.js (read-only contextBridge object).
  // Main process IPC handlers also enforce isNetworkClientRole().
  return function () {};
}
