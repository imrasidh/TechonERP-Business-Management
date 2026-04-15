/**
 * Production accounting hardening — module flags set from LicenseGate / IPC (no posting changes).
 */

var _packagedMissingLicenseSecret = false;

export function setPackagedMissingLicenseSecretBlock(v) {
  _packagedMissingLicenseSecret = !!v;
}

/** Installed app without LICENSE_SECRET (or tc_license_secret.txt) — journal/snapshots must not run. */
export function isProductionLicenseSecretMissingBlock() {
  return _packagedMissingLicenseSecret === true;
}
