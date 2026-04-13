<?php
/**
 * get_products.php — Active products for POS clients.
 * Auth: X-TC-KEY required.
 */
require_once __DIR__ . '/config.php';

requireAuth();

$clientId = $_SERVER['HTTP_X_TC_CLIENT_ID'] ?? '';
$ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if ($clientId) touchSession($clientId, $ip);

$products = kvGet('tc3_products', []);
$active   = array_values(array_filter($products, function ($p) {
    return empty($p['deleted']);
}));

respond([
    'success'  => true,
    'message'  => count($active) . ' products',
    'data'     => ['products' => $active],
    'products' => $active,   // kept for backwards compat
    'count'    => count($active),
]);
?>
