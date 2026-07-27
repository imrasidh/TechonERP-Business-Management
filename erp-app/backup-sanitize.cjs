/**
 * Main-process backup sanitization — mirrors src/productionConfig.js sanitizeBackupDataForExport.
 * Strips credentials from every disk write (quit backup, IPC save-backup, manual export).
 */

const TC_BACKUP_EXCLUDE_KEYS = ['tc3_users', 'tc3_apppass', 'tc3_admin_name'];

function sanitizeBackupDataObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  Object.keys(data).forEach(function (k) {
    if (TC_BACKUP_EXCLUDE_KEYS.indexOf(k) >= 0) return;
    out[k] = data[k];
  });
  if (out.tc3_settings && typeof out.tc3_settings === 'object' && !Array.isArray(out.tc3_settings)) {
    const st = Object.assign({}, out.tc3_settings);
    delete st.adminPin;
    delete st.mainAdminPassHash;
    out.tc3_settings = st;
  }
  return out;
}

function sanitizeBackupPayload(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return backup;
  const out = Object.assign({}, backup);
  if (out.data) out.data = sanitizeBackupDataObject(out.data);
  return out;
}

function sanitizeBackupContent(content) {
  if (content == null) return content;
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    if (!parsed || typeof parsed !== 'object') return content;
    const sanitized = sanitizeBackupPayload(parsed);
    return JSON.stringify(sanitized, null, 2);
  } catch (_e) {
    return content;
  }
}

module.exports = {
  sanitizeBackupContent,
  sanitizeBackupPayload,
  sanitizeBackupDataObject,
  TC_BACKUP_EXCLUDE_KEYS,
};
