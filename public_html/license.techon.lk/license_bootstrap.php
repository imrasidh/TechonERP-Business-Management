<?php
/**
 * Shared license API bootstrap: server secret from environment or a single .env in this folder.
 * Set TC_LIC_SERVER_SECRET in Apache/nginx env OR in public_html/license.techon.lk/.env only
 * (must match erp-app/.env / tc_license_secret.txt on clients).
 */
if (!function_exists('tc_license_server_secret')) {
    function tc_license_server_secret() {
        $s = getenv('TC_LIC_SERVER_SECRET');
        if ($s !== false && $s !== '') {
            return $s;
        }
        $envfile = __DIR__ . '/.env';
        if (!is_readable($envfile)) {
            return '';
        }
        $lines = @file($envfile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return '';
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || (isset($line[0]) && $line[0] === '#')) {
                continue;
            }
            if (preg_match('/^TC_LIC_SERVER_SECRET\s*=\s*(.*)$/', $line, $m)) {
                $val = trim($m[1]);
                $len = strlen($val);
                if ($len >= 2) {
                    $q0 = $val[0];
                    $q1 = $val[$len - 1];
                    if (($q0 === '"' && $q1 === '"') || ($q0 === "'" && $q1 === "'")) {
                        $val = substr($val, 1, -1);
                    }
                }
                return $val;
            }
        }
        return '';
    }
}
