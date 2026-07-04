/**
 * Techon ERP — Encrypted local device credential storage (main process only).
 *
 * Secrets never go to the renderer. Uses same AES-256-CBC pattern as license storage.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateDeviceId, generateDeviceSecret, generateTokenId } = require('./device-crypto.cjs');

const DEVICE_FILE_NAME = 'tc_device.dat';

function createEncryptFns(getCryptoRootSecret) {
  function encryptData(obj) {
    try {
      const json = JSON.stringify(obj);
      const key = crypto.scryptSync(getCryptoRootSecret(), 'tc-salt-9x', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      return iv.toString('hex') + ':' + enc.toString('hex');
    } catch (_e) {
      return null;
    }
  }

  function decryptData(str) {
    try {
      const parts = String(str).split(':');
      if (parts.length < 2) return null;
      const ivHex = parts[0];
      const encHex = parts.slice(1).join(':');
      const key = crypto.scryptSync(getCryptoRootSecret(), 'tc-salt-9x', 32);
      const iv = Buffer.from(ivHex, 'hex');
      const enc = Buffer.from(encHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return JSON.parse(dec.toString('utf8'));
    } catch (_e) {
      return null;
    }
  }

  function deviceFilePath(userDataPath) {
    return path.join(userDataPath, DEVICE_FILE_NAME);
  }

  function loadDeviceCredentials(userDataPath) {
    try {
      const fp = deviceFilePath(userDataPath);
      if (!fs.existsSync(fp)) return null;
      const raw = fs.readFileSync(fp, 'utf8').trim();
      const data = decryptData(raw);
      if (!data || !data.device_id || !data.device_secret) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function saveDeviceCredentials(userDataPath, creds) {
    try {
      const fp = deviceFilePath(userDataPath);
      const enc = encryptData(creds);
      if (!enc) return false;
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, enc, { mode: 0o600 });
      return true;
    } catch (_e) {
      return false;
    }
  }

  function clearDeviceCredentials(userDataPath) {
    try {
      const fp = deviceFilePath(userDataPath);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function createLocalDeviceIdentity(deviceName, computerName, softwareVersion) {
    return {
      device_id: generateDeviceId(),
      device_secret: generateDeviceSecret(),
      token_id: generateTokenId(),
      device_name: String(deviceName || 'Counter PC').slice(0, 255),
      computer_name: String(computerName || '').slice(0, 255),
      software_version: String(softwareVersion || '').slice(0, 64),
      status: 'pending',
      permissions: null,
      registered_at: new Date().toISOString(),
    };
  }

  function hasApprovedDevice(userDataPath) {
    const creds = loadDeviceCredentials(userDataPath);
    return !!(creds && creds.device_id && creds.device_secret && creds.status === 'approved');
  }

  return {
    DEVICE_FILE_NAME,
    deviceFilePath,
    loadDeviceCredentials,
    saveDeviceCredentials,
    clearDeviceCredentials,
    createLocalDeviceIdentity,
    hasApprovedDevice,
  };
}

module.exports = { createDeviceStore: createEncryptFns };
