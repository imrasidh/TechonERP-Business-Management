<?php
/**
 * Techon Dashboard API — strict CORS allowlist (no wildcard).
 * Env: TECHON_ALLOWED_ORIGINS, TECHON_CORS_ALLOW_NULL_ORIGIN=1
 */
function techon_cors_origin_is_allowed($origin) {
    $origin = trim((string) $origin);
    if ($origin === '' || strcasecmp($origin, 'null') === 0) {
        return getenv('TECHON_CORS_ALLOW_NULL_ORIGIN') === '1';
    }
    $extra = getenv('TECHON_ALLOWED_ORIGINS');
    if ($extra !== false && $extra !== '') {
        foreach (array_map('trim', explode(',', $extra)) as $o) {
            if ($o !== '' && strcasecmp($origin, $o) === 0) {
                return true;
            }
        }
    }
    $patterns = array(
        '#^https?://localhost(:\d+)?$#i',
        '#^https?://127\.0\.0\.1(:\d+)?$#i',
        '#^https?://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$#',
        '#^https?://10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$#',
        '#^https?://172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$#',
        '#^https://([a-z0-9-]+\.)*techon\.lk(:\d+)?$#i',
    );
    foreach ($patterns as $p) {
        if (preg_match($p, $origin)) {
            return true;
        }
    }
    return false;
}

function techon_apply_api_cors_headers($allowHeaders) {
    header('Content-Type: application/json');
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string) $_SERVER['HTTP_ORIGIN']) : '';
    if ($origin !== '' && techon_cors_origin_is_allowed($origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: ' . $allowHeaders);
}
