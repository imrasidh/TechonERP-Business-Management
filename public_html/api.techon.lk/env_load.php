<?php
/**
 * Env loader + shared security helpers (keep copies in api.techon.lk / license.techon.lk in sync).
 * Priority: getenv() → .env → caller defaults.
 */
@ini_set('display_errors', '0');

if (!function_exists('techon_security_guard_early')) {
    /**
     * Parsed path only — no raw ".env" substring false positives.
     */
    function techon_security_guard_early() {
        $qs = isset($_SERVER['QUERY_STRING']) ? (string) $_SERVER['QUERY_STRING'] : '';
        if (strlen($qs) > 8192) {
            header('Content-Type: text/plain; charset=utf-8');
            http_response_code(400);
            exit('Invalid request');
        }

        $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
        $path = parse_url($uri, PHP_URL_PATH);
        if ($path === false || $path === null) {
            $path = '';
        } else {
            $path = (string) $path;
        }
        $path = str_replace('\\', '/', $path);
        $path = rawurldecode($path);

        $lower = strtolower($path);
        foreach (['.env', '.sqlite', '.sqlite3', '.db'] as $ext) {
            $len = strlen($ext);
            if ($len > 0 && $lower !== '' && substr($lower, -$len) === $ext) {
                header('Content-Type: text/plain; charset=utf-8');
                http_response_code(403);
                exit('Forbidden');
            }
        }
        if (strpos($path, '/.env') !== false) {
            header('Content-Type: text/plain; charset=utf-8');
            http_response_code(403);
            exit('Forbidden');
        }
    }
}

if (!function_exists('techon_trust_proxy_enabled')) {
    function techon_trust_proxy_enabled() {
        return getenv('TECHON_TRUST_PROXY') === '1';
    }
}

if (!function_exists('techon_trusted_client_ip')) {
    /**
     * Uses X-Forwarded-For only when TECHON_TRUST_PROXY=1 (after .env load); otherwise REMOTE_ADDR.
     */
    function techon_trusted_client_ip() {
        if (techon_trust_proxy_enabled() && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']);
            $ip = trim($parts[0]);
            if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    }
}

if (!function_exists('techon_append_api_log_line_locked')) {
    /**
     * Append one line under exclusive lock; rotate when > 5MB (chain .1 ← .2 ← .3).
     */
    function techon_append_api_log_line_locked($logFile, $line) {
        $line = (string) $line;
        $dir = dirname($logFile);
        if (!is_dir($dir)) {
            if (!@mkdir($dir, 0755, true)) {
                return false;
            }
        }
        $fp = @fopen($logFile, 'a+b');
        if (!$fp) {
            return false;
        }
        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            return false;
        }
        try {
            clearstatcache(true, $logFile);
            $sz = file_exists($logFile) ? (int) filesize($logFile) : 0;
            $maxBytes = 5 * 1024 * 1024;
            if ($sz > $maxBytes) {
                flock($fp, LOCK_UN);
                fclose($fp);
                $p3 = $logFile . '.3';
                $p2 = $logFile . '.2';
                $p1 = $logFile . '.1';
                if (is_file($p3)) {
                    @unlink($p3);
                }
                if (is_file($p2)) {
                    @rename($p2, $p3);
                }
                if (is_file($p1)) {
                    @rename($p1, $p2);
                }
                if (is_file($logFile)) {
                    @rename($logFile, $p1);
                }
                $fp = @fopen($logFile, 'a+b');
                if (!$fp) {
                    return false;
                }
                if (!flock($fp, LOCK_EX)) {
                    fclose($fp);
                    return false;
                }
            }
            fwrite($fp, $line);
            fflush($fp);
        } finally {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
        return true;
    }
}

if (!function_exists('techon_load_dotenv')) {
    function techon_load_dotenv($directory) {
        static $dirsLoaded = [];
        $path = rtrim($directory, '/\\') . DIRECTORY_SEPARATOR . '.env';
        if (isset($dirsLoaded[$path])) {
            return;
        }
        $dirsLoaded[$path] = true;
        if (!is_readable($path)) {
            return;
        }
        $lines = @file($path, FILE_IGNORE_NEW_LINES);
        if (!is_array($lines)) {
            return;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || (isset($line[0]) && $line[0] === '#')) {
                continue;
            }
            if (!preg_match('/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/', $line, $m)) {
                continue;
            }
            $key = $m[1];
            $val = trim($m[2]);
            $len = strlen($val);
            if ($len >= 2) {
                $q0 = $val[0];
                $q1 = $val[$len - 1];
                if (($q0 === '"' && $q1 === '"') || ($q0 === "'" && $q1 === "'")) {
                    $val = substr($val, 1, -1);
                }
            }
            if (getenv($key) !== false) {
                continue;
            }
            putenv($key . '=' . $val);
            if (!isset($_ENV) || !is_array($_ENV)) {
                $_ENV = [];
            }
            $_ENV[$key] = $val;
        }
    }
}

if (!function_exists('techon_env')) {
    function techon_env($key, $default = null) {
        $v = getenv($key);
        if ($v !== false) {
            return $v;
        }
        return $default;
    }
}

if (!function_exists('techon_is_production_env')) {
    function techon_is_production_env() {
        $e = getenv('ENV');
        if ($e !== false && strcasecmp(trim((string) $e), 'production') === 0) {
            return true;
        }
        $a = getenv('APP_ENV');
        if ($a !== false && strcasecmp(trim((string) $a), 'production') === 0) {
            return true;
        }
        return false;
    }
}

if (!function_exists('techon_request_is_https')) {
    function techon_request_is_https() {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
            return true;
        }
        if (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443') {
            return true;
        }
        return false;
    }
}

if (!function_exists('techon_force_https_if_production')) {
    function techon_force_https_if_production() {
        if (!techon_is_production_env()) {
            return;
        }
        if (techon_request_is_https()) {
            return;
        }
        $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';
        if ($host === '') {
            return;
        }
        $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '/';
        header('Location: https://' . $host . $uri, true, 301);
        exit;
    }
}

if (!function_exists('techon_should_log_internal_details')) {
    /**
     * True when TECHON_DEBUG=1 or ENV/APP_ENV is development (after .env load — use from code after techon_load_dotenv).
     */
    function techon_should_log_internal_details() {
        if (getenv('TECHON_DEBUG') === '1') {
            return true;
        }
        $a = getenv('APP_ENV');
        if ($a !== false && strcasecmp(trim((string) $a), 'development') === 0) {
            return true;
        }
        $e = getenv('ENV');
        if ($e !== false && strcasecmp(trim((string) $e), 'development') === 0) {
            return true;
        }
        return false;
    }
}

if (!function_exists('techon_resolve_api_log_file')) {
    /**
     * Set TECHON_API_LOG_FILE to an absolute path outside the web root (recommended for production).
     */
    function techon_resolve_api_log_file($baseDir) {
        $override = getenv('TECHON_API_LOG_FILE');
        if ($override !== false && trim((string) $override) !== '') {
            return trim((string) $override);
        }
        return rtrim($baseDir, '/\\') . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'api.log';
    }
}

if (!function_exists('techon_register_safe_api_log')) {
    function techon_register_safe_api_log($baseDir) {
        static $reg = false;
        if ($reg) {
            return;
        }
        if (getenv('TECHON_ENABLE_LOGS') !== '1') {
            return;
        }
        $reg = true;
        register_shutdown_function(function () use ($baseDir) {
            if (getenv('TECHON_ENABLE_LOGS') !== '1') {
                return;
            }
            $code = function_exists('http_response_code') ? (int) http_response_code() : 0;
            if ($code === 0) {
                $code = 200;
            }
            $ok = ($code >= 200 && $code < 400);
            $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
            if (strlen($uri) > 500) {
                $uri = substr($uri, 0, 500) . '…';
            }
            $ip = function_exists('techon_trusted_client_ip') ? techon_trusted_client_ip() : (isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '');
            $line = date('c') . "\t" . $ip . "\t" . $uri . "\t" . $code . "\t" . ($ok ? 'success' : 'fail') . PHP_EOL;
            $logFile = techon_resolve_api_log_file($baseDir);
            try {
                techon_append_api_log_line_locked($logFile, $line);
            } catch (Exception $e) {
            }
        });
    }
}

if (!function_exists('techon_parse_json_body')) {
    /**
     * @return array<string,mixed>|null null = caller should respond with 400 (message: Invalid request)
     */
    function techon_parse_json_body($raw, $maxBytes = 2097152, $maxDepth = 20) {
        if (strlen($raw) > $maxBytes) {
            return null;
        }
        $rawTrim = ltrim($raw);
        if ($rawTrim === '') {
            return [];
        }
        $data = json_decode($raw, true, $maxDepth);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        if (!is_array($data)) {
            return null;
        }
        return $data;
    }
}

techon_security_guard_early();

