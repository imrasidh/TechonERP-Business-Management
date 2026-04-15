<?php
/**
 * Shared license API bootstrap: server secret from environment / .env
 * (must match Electron: LICENSE_SECRET / TC_LIC_SERVER_SECRET).
 */
require_once __DIR__ . '/env_load.php';
techon_load_dotenv(__DIR__);

if (!function_exists('tc_license_server_secret')) {
    function tc_license_server_secret() {
        foreach (array('LICENSE_SECRET', 'TC_LIC_SERVER_SECRET') as $envKey) {
            $s = getenv($envKey);
            if ($s !== false && $s !== '') {
                return $s;
            }
        }
        return '';
    }
}

if (!function_exists('tc_license_warn_missing_secret_once')) {
    /**
     * Internal only (error_log) — not shown to end users.
     */
    function tc_license_warn_missing_secret_once() {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        if (tc_license_server_secret() !== '') {
            return;
        }
        @error_log('[Techon License] LICENSE_SECRET not configured');
    }
}

tc_license_warn_missing_secret_once();
