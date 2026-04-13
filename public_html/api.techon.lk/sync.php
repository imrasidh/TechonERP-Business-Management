<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

/* Auth: accept api_key in POST body (most reliable — headers get stripped on cPanel)
   Fallback to header-based auth for backward compatibility */
$data_raw = getInput();
$bodyApiKey = isset($data_raw['api_key']) && $data_raw['api_key'] !== null && $data_raw['api_key'] !== ''
    ? trim((string) $data_raw['api_key'])
    : '';

if ($bodyApiKey !== '') {
    $user = validateApiKey($bodyApiKey);
    if (!$user) {
        respond(['success' => false, 'error' => 'Invalid API key'], 401);
    }
} else {
    $user = requireAuth(); /* Bearer token and/or X-API-Key header */
}

/*
 * Shop id must come from shops.id. Never rely only on $user['shop_id'] / shop_pk — PDO rows can
 * omit keys. Always resolve with the same credential used to authenticate (body or header).
 *
 * shops.id is a hex string (see register.php: bin2hex(random_bytes(16))), NOT an int — casting
 * to (int) yields 0 and breaks sync with "Invalid shop".
 */
$pdo    = db();
$authKey = $bodyApiKey !== '' ? $bodyApiKey : (function_exists('getApiKey') ? trim((string) getApiKey()) : '');
$shopId  = '';
if ($authKey !== '') {
    $st = $pdo->prepare('SELECT id FROM shops WHERE api_key = ? LIMIT 1');
    $st->execute([$authKey]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row && isset($row['id'])) {
        $shopId = trim((string) $row['id']);
    }
}
if ($shopId === '') {
    $fallback = $user['shop_pk'] ?? $user['shop_id'] ?? null;
    if ($fallback !== null && $fallback !== '') {
        $shopId = trim((string) $fallback);
    }
}
if ($shopId === '') {
    respond(['success' => false, 'error' => 'Invalid shop — re-connect cloud sync in Settings (Dashboard login).'], 400);
}
$data   = $data_raw; /* already parsed above */
$synced = [];

/**
 * ERP is the source of truth. Upserts alone leave "ghost" rows on the server when records
 * are deleted in the app — dashboard totals (payables, stock, lists) then drift from the ERP.
 * After each sync pass, delete shop rows whose id is not in the current payload.
 *
 * @param string $idCol Primary key column (always `id` for these tables)
 * @param array<int|string> $keepIds
 */
function deleteShopRowsNotInIds(PDO $pdo, string $table, string $idCol, string $shopId, array $keepIds): void {
    $allowedTables = [
        'sales', 'purchases', 'products', 'customers', 'suppliers', 'expenses', 'repairs', 'cheques',
        'sales_returns', 'manual_receivables', 'manual_payables',
    ];
    if (!in_array($table, $allowedTables, true)) {
        return;
    }
    $keepIds = array_values(array_unique(array_filter($keepIds, static function ($v) {
        return $v !== null && $v !== '';
    })));
    if (count($keepIds) === 0) {
        $stmt = $pdo->prepare("DELETE FROM `$table` WHERE shop_id = ?");
        $stmt->execute([$shopId]);
        return;
    }
    $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
    $sql = "DELETE FROM `$table` WHERE shop_id = ? AND `$idCol` NOT IN ($placeholders)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_merge([$shopId], $keepIds));
}

/** @param array<int, array<string, mixed>> $rows */
function collectRowIds(array $rows): array {
    $ids = [];
    foreach ($rows as $r) {
        if (!empty($r['id'])) {
            $ids[] = $r['id'];
        }
    }
    return $ids;
}

function upsert($pdo, $table, $fields, $shopId, $record) {
    $id = $record['id'] ?? null;
    if (!$id) return false;

    $stmt = $pdo->prepare("SELECT id FROM $table WHERE id = ? AND shop_id = ?");
    $stmt->execute([$id, $shopId]);
    $exists = $stmt->fetch();

    if ($exists) {
        /* Always update — ERP has no per-record updated_at so we never skip */
        $sets = array_map(fn($f) => "$f = ?", $fields);
        $vals = array_map(fn($f) => is_array($record[$f] ?? null) ? json_encode($record[$f]) : ($record[$f] ?? null), $fields);
        $vals[] = $id;
        $vals[] = $shopId;
        $sql = "UPDATE $table SET " . implode(', ', $sets) . ", updated_at = NOW() WHERE id = ? AND shop_id = ?";
        $pdo->prepare($sql)->execute($vals);
        return 'updated';
    } else {
        $allFields    = array_merge(['id', 'shop_id'], $fields, ['updated_at']);
        $vals         = array_merge([$id, $shopId], array_map(fn($f) => is_array($record[$f] ?? null) ? json_encode($record[$f]) : ($record[$f] ?? null), $fields), [date('Y-m-d H:i:s')]);
        $placeholders = implode(', ', array_fill(0, count($allFields), '?'));
        $sql = "INSERT INTO $table (" . implode(', ', $allFields) . ") VALUES ($placeholders)";
        $pdo->prepare($sql)->execute($vals);
        return 'inserted';
    }
}

try {
    $pdo->beginTransaction();
    /* Child rows (e.g. sales_returns → sales) must not block pruning; order alone is not enough */
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    // SALES RETURNS — must run before SALES so deletes/upserts never violate FK from returns → invoices
    if (array_key_exists('salesReturns', $data)) {
        $srRows = is_array($data['salesReturns']) ? $data['salesReturns'] : [];
        deleteShopRowsNotInIds($pdo, 'sales_returns', 'id', $shopId, collectRowIds($srRows));
        $fields = ['return_id','invoice_id','invoice_no','product_id','product_name','qty','amount','cost','reason','customer','customer_id','is_refund','refund_method','refund_amount','return_date'];
        foreach ($srRows as $r) {
            $r['return_id']    = $r['returnId'] ?? null;
            $r['invoice_id']   = $r['invoiceId'] ?? null;
            $r['invoice_no']   = $r['invoiceNo'] ?? null;
            $r['product_id']   = $r['productId'] ?? null;
            $r['product_name'] = $r['productName'] ?? null;
            $r['is_refund']    = (int)($r['isRefund'] ?? 0);
            $r['refund_method']= $r['refundMethod'] ?? null;
            $r['refund_amount']= $r['refundAmount'] ?? 0;
            $r['customer_id']  = $r['customerId'] ?? null;
            $r['return_date']  = $r['date'] ?? null;
            $r['updated_at']   = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'sales_returns', $fields, $shopId, $r);
        }
        $synced['sales_returns'] = count($srRows);
    }

    // SALES
    if (array_key_exists('sales', $data)) {
        $salesRows = is_array($data['sales']) ? $data['sales'] : [];
        deleteShopRowsNotInIds($pdo, 'sales', 'id', $shopId, collectRowIds($salesRows));
        $fields = ['invoice_no','customer_name','customer_phone','customer_id','items','sub_total','discount','total','paid','balance','pay_status','cash_method','payment_history','sale_date','include_warranty','from_repair_id'];
        foreach ($salesRows as $r) {
            $r['sale_date']       = $r['date'] ?? null;
            $r['sub_total']       = $r['subTotal'] ?? 0;
            $r['pay_status']      = $r['payStatus'] ?? null;
            $r['cash_method']     = $r['cashMethod'] ?? null;
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $r['include_warranty']= (int)($r['includeWarranty'] ?? 0);
            $r['from_repair_id']  = $r['fromRepairId'] ?? null;
            $r['customer_name']   = $r['customerName'] ?? null;
            $r['customer_phone']  = $r['customerPhone'] ?? null;
            $r['customer_id']     = $r['customerId'] ?? null;
            $r['invoice_no']      = $r['invoiceNo'] ?? null;
            $r['updated_at']      = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'sales', $fields, $shopId, $r);
        }
        $synced['sales'] = count($salesRows);
    }

    // PURCHASES
    if (array_key_exists('purchases', $data)) {
        $purchaseRows = is_array($data['purchases']) ? $data['purchases'] : [];
        deleteShopRowsNotInIds($pdo, 'purchases', 'id', $shopId, collectRowIds($purchaseRows));
        $fields = ['invoice_no','supplier','supplier_id','items','total','paid_amount','balance','status','pay_mode','payment_history','purchase_date'];
        foreach ($purchaseRows as $r) {
            $r['purchase_date']   = $r['date'] ?? null;
            $r['paid_amount']     = $r['paidAmount'] ?? 0;
            $r['pay_mode']        = $r['payMode'] ?? null;
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $r['supplier_id']     = $r['supplierId'] ?? null;
            $r['invoice_no']      = $r['invoiceNo'] ?? null;
            $r['updated_at']      = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'purchases', $fields, $shopId, $r);
        }
        $synced['purchases'] = count($purchaseRows);
    }

    // PRODUCTS
    if (array_key_exists('products', $data)) {
        $productRows = is_array($data['products']) ? $data['products'] : [];
        deleteShopRowsNotInIds($pdo, 'products', 'id', $shopId, collectRowIds($productRows));
        $fields = ['product_id','name','barcode','category','description','cost','price','stock','damaged','status'];
        foreach ($productRows as $r) {
            $r['product_id'] = $r['productId'] ?? null;
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'products', $fields, $shopId, $r);
        }
        $synced['products'] = count($productRows);
    }

    // CUSTOMERS
    if (array_key_exists('customers', $data)) {
        $customerRows = is_array($data['customers']) ? $data['customers'] : [];
        deleteShopRowsNotInIds($pdo, 'customers', 'id', $shopId, collectRowIds($customerRows));
        $fields = ['name','phone','email','address','credit','total_spent'];
        foreach ($customerRows as $r) {
            $r['total_spent'] = $r['totalSpent'] ?? 0;
            $r['updated_at']  = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'customers', $fields, $shopId, $r);
        }
        $synced['customers'] = count($customerRows);
    }

    // SUPPLIERS
    if (array_key_exists('suppliers', $data)) {
        $supplierRows = is_array($data['suppliers']) ? $data['suppliers'] : [];
        deleteShopRowsNotInIds($pdo, 'suppliers', 'id', $shopId, collectRowIds($supplierRows));
        $fields = ['name','phone','email','address'];
        foreach ($supplierRows as $r) {
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'suppliers', $fields, $shopId, $r);
        }
        $synced['suppliers'] = count($supplierRows);
    }

    // EXPENSES
    if (array_key_exists('expenses', $data)) {
        $expenseRows = is_array($data['expenses']) ? $data['expenses'] : [];
        deleteShopRowsNotInIds($pdo, 'expenses', 'id', $shopId, collectRowIds($expenseRows));
        $fields = ['category','description','amount','cash_method','expense_date'];
        foreach ($expenseRows as $r) {
            $r['expense_date'] = $r['date'] ?? null;
            $r['cash_method']  = $r['cashMethod'] ?? null;
            $r['updated_at']   = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'expenses', $fields, $shopId, $r);
        }
        $synced['expenses'] = count($expenseRows);
    }

    // REPAIRS
    if (array_key_exists('repairs', $data)) {
        $repairRows = is_array($data['repairs']) ? $data['repairs'] : [];
        deleteShopRowsNotInIds($pdo, 'repairs', 'id', $shopId, collectRowIds($repairRows));
        $fields = ['customer','phone','device_type','brand','model_no','problem','description','status','estimated_cost','technician','date_in','date_out'];
        foreach ($repairRows as $r) {
            $r['device_type']    = $r['deviceType'] ?? null;
            $r['model_no']       = $r['modelNo'] ?? null;
            $r['estimated_cost'] = $r['estimatedCost'] ?? 0;
            $r['date_in']        = $r['dateIn'] ?? null;
            $r['date_out']       = $r['dateOut'] ?? null;
            $r['updated_at']     = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'repairs', $fields, $shopId, $r);
        }
        $synced['repairs'] = count($repairRows);
    }

    // CHEQUES
    if (array_key_exists('cheques', $data)) {
        $chequeRows = is_array($data['cheques']) ? $data['cheques'] : [];
        deleteShopRowsNotInIds($pdo, 'cheques', 'id', $shopId, collectRowIds($chequeRows));
        $fields = ['type','status','cheque_no','bank_name','amount','due_date','issued_date','customer_name','supplier','note'];
        foreach ($chequeRows as $r) {
            $r['cheque_no']    = $r['chequeNo'] ?? null;
            $r['bank_name']    = $r['bankName'] ?? null;
            $r['due_date']     = $r['dueDate'] ?? null;
            $r['issued_date']  = $r['issuedDate'] ?? null;
            $r['customer_name']= $r['customerName'] ?? null;
            $r['updated_at']   = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'cheques', $fields, $shopId, $r);
        }
        $synced['cheques'] = count($chequeRows);
    }

    // MANUAL RECEIVABLES
    if (array_key_exists('manualReceivables', $data)) {
        $mrRows = is_array($data['manualReceivables']) ? $data['manualReceivables'] : [];
        deleteShopRowsNotInIds($pdo, 'manual_receivables', 'id', $shopId, collectRowIds($mrRows));
        $fields = ['person','type','amount','paid','balance','reference','note','payment_history','entry_date','is_opening'];
        foreach ($mrRows as $r) {
            $r['entry_date']      = $r['date'] ?? null;
            $r['is_opening']      = (int)($r['_isOpening'] ?? 0);
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $paid = array_reduce($r['paymentHistory'] ?? [], fn($a, $ph) => $a + ($ph['amount'] ?? 0), 0);
            $r['paid']    = $paid;
            $r['balance'] = max(0, ($r['amount'] ?? 0) - $paid);
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'manual_receivables', $fields, $shopId, $r);
        }
        $synced['manual_receivables'] = count($mrRows);
    }

    // MANUAL PAYABLES
    if (array_key_exists('manualPayables', $data)) {
        $mpRows = is_array($data['manualPayables']) ? $data['manualPayables'] : [];
        deleteShopRowsNotInIds($pdo, 'manual_payables', 'id', $shopId, collectRowIds($mpRows));
        $fields = ['source','type','amount','paid','balance','reference','note','payment_history','entry_date','is_opening'];
        foreach ($mpRows as $r) {
            $r['entry_date']      = $r['date'] ?? null;
            $r['is_opening']      = (int)($r['_isOpening'] ?? 0);
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $paid = array_reduce($r['paymentHistory'] ?? [], fn($a, $ph) => $a + ($ph['amount'] ?? 0), 0);
            $r['paid']    = $paid;
            $r['balance'] = max(0, ($r['amount'] ?? 0) - $paid);
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'manual_payables', $fields, $shopId, $r);
        }
        $synced['manual_payables'] = count($mpRows);
    }

    // SETTINGS SNAPSHOT
    if (!empty($data['snapshot'])) {
        $s = $data['snapshot'];
        $stmt = $pdo->prepare('INSERT INTO settings_snapshot
            (shop_id, shop_name, address, phone, email, website, currency, capital_invested, cash_balance, bank_balance, total_receivable, total_payable, stock_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            shop_name=VALUES(shop_name), address=VALUES(address), phone=VALUES(phone),
            email=VALUES(email), website=VALUES(website), currency=VALUES(currency),
            capital_invested=VALUES(capital_invested), cash_balance=VALUES(cash_balance),
            bank_balance=VALUES(bank_balance), total_receivable=VALUES(total_receivable),
            total_payable=VALUES(total_payable), stock_value=VALUES(stock_value), updated_at=NOW()');
        $stmt->execute([
            $shopId,
            $s['shopName'] ?? '', $s['address'] ?? '', $s['phone'] ?? '',
            $s['email'] ?? '',    $s['website'] ?? '', $s['currency'] ?? 'Rs',
            $s['capitalInvested'] ?? 0, $s['cashBalance'] ?? 0, $s['bankBalance'] ?? 0,
            $s['totalReceivable'] ?? 0, $s['totalPayable'] ?? 0, $s['stockValue'] ?? 0
        ]);
        $synced['snapshot'] = 1;
    }

    // Log sync
    foreach ($synced as $table => $count) {
        $pdo->prepare('INSERT INTO sync_log (shop_id, table_name, records_synced) VALUES (?, ?, ?)')->execute([$shopId, $table, $count]);
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->commit();
    respond(['success' => true, 'synced' => $synced, 'synced_at' => date('Y-m-d H:i:s')]);

} catch (Throwable $e) {
    try {
        $pdo->rollBack();
    } catch (Throwable $ignored) {
    }
    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    } catch (Throwable $ignored) {
    }
    $msg = $e->getMessage();
    if (strlen($msg) > 500) {
        $msg = substr($msg, 0, 500) . '…';
    }
    respond(['success' => false, 'error' => 'Sync failed: ' . $msg], 500);
}
?>
