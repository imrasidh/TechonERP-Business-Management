<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['success' => false, 'error' => 'Method not allowed'], 405);
}

/* Auth: accept api_key in POST body (most reliable — headers get stripped on cPanel)
   Fallback to header-based auth for backward compatibility */
$data_raw = getInput();
$bodyApiKey = $data_raw['api_key'] ?? null;

if ($bodyApiKey) {
    $user = validateApiKey($bodyApiKey);
    if (!$user) { respond(['success' => false, 'error' => 'Invalid API key'], 401); }
} else {
    $user = requireAuth(); /* fallback to header auth */
}
$shopId = $user['shop_id'];
$data   = $data_raw; /* already parsed above */
$pdo    = db();
$synced = [];

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

    // SALES
    if (!empty($data['sales'])) {
        $fields = ['invoice_no','customer_name','customer_phone','customer_id','items','sub_total','discount','total','paid','balance','pay_status','cash_method','payment_history','sale_date','include_warranty','from_repair_id'];
        foreach ($data['sales'] as $r) {
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
        $synced['sales'] = count($data['sales']);
    }

    // PURCHASES
    if (!empty($data['purchases'])) {
        $fields = ['invoice_no','supplier','supplier_id','items','total','paid_amount','balance','status','pay_mode','payment_history','purchase_date'];
        foreach ($data['purchases'] as $r) {
            $r['purchase_date']   = $r['date'] ?? null;
            $r['paid_amount']     = $r['paidAmount'] ?? 0;
            $r['pay_mode']        = $r['payMode'] ?? null;
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $r['supplier_id']     = $r['supplierId'] ?? null;
            $r['invoice_no']      = $r['invoiceNo'] ?? null;
            $r['updated_at']      = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'purchases', $fields, $shopId, $r);
        }
        $synced['purchases'] = count($data['purchases']);
    }

    // PRODUCTS
    if (!empty($data['products'])) {
        $fields = ['product_id','name','barcode','category','description','cost','price','stock','damaged','status'];
        foreach ($data['products'] as $r) {
            $r['product_id'] = $r['productId'] ?? null;
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'products', $fields, $shopId, $r);
        }
        $synced['products'] = count($data['products']);
    }

    // CUSTOMERS
    if (!empty($data['customers'])) {
        $fields = ['name','phone','email','address','credit','total_spent'];
        foreach ($data['customers'] as $r) {
            $r['total_spent'] = $r['totalSpent'] ?? 0;
            $r['updated_at']  = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'customers', $fields, $shopId, $r);
        }
        $synced['customers'] = count($data['customers']);
    }

    // SUPPLIERS
    if (!empty($data['suppliers'])) {
        $fields = ['name','phone','email','address'];
        foreach ($data['suppliers'] as $r) {
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'suppliers', $fields, $shopId, $r);
        }
        $synced['suppliers'] = count($data['suppliers']);
    }

    // EXPENSES
    if (!empty($data['expenses'])) {
        $fields = ['category','description','amount','cash_method','expense_date'];
        foreach ($data['expenses'] as $r) {
            $r['expense_date'] = $r['date'] ?? null;
            $r['cash_method']  = $r['cashMethod'] ?? null;
            $r['updated_at']   = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'expenses', $fields, $shopId, $r);
        }
        $synced['expenses'] = count($data['expenses']);
    }

    // REPAIRS
    if (!empty($data['repairs'])) {
        $fields = ['customer','phone','device_type','brand','model_no','problem','description','status','estimated_cost','technician','date_in','date_out'];
        foreach ($data['repairs'] as $r) {
            $r['device_type']    = $r['deviceType'] ?? null;
            $r['model_no']       = $r['modelNo'] ?? null;
            $r['estimated_cost'] = $r['estimatedCost'] ?? 0;
            $r['date_in']        = $r['dateIn'] ?? null;
            $r['date_out']       = $r['dateOut'] ?? null;
            $r['updated_at']     = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'repairs', $fields, $shopId, $r);
        }
        $synced['repairs'] = count($data['repairs']);
    }

    // CHEQUES
    if (!empty($data['cheques'])) {
        $fields = ['type','status','cheque_no','bank_name','amount','due_date','issued_date','customer_name','supplier','note'];
        foreach ($data['cheques'] as $r) {
            $r['cheque_no']    = $r['chequeNo'] ?? null;
            $r['bank_name']    = $r['bankName'] ?? null;
            $r['due_date']     = $r['dueDate'] ?? null;
            $r['issued_date']  = $r['issuedDate'] ?? null;
            $r['customer_name']= $r['customerName'] ?? null;
            $r['updated_at']   = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'cheques', $fields, $shopId, $r);
        }
        $synced['cheques'] = count($data['cheques']);
    }

    // SALES RETURNS
    if (!empty($data['salesReturns'])) {
        $fields = ['return_id','invoice_id','invoice_no','product_id','product_name','qty','amount','cost','reason','customer','customer_id','is_refund','refund_method','refund_amount','return_date'];
        foreach ($data['salesReturns'] as $r) {
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
        $synced['sales_returns'] = count($data['salesReturns']);
    }

    // MANUAL RECEIVABLES
    if (!empty($data['manualReceivables'])) {
        $fields = ['person','type','amount','paid','balance','reference','note','payment_history','entry_date','is_opening'];
        foreach ($data['manualReceivables'] as $r) {
            $r['entry_date']      = $r['date'] ?? null;
            $r['is_opening']      = (int)($r['_isOpening'] ?? 0);
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $paid = array_reduce($r['paymentHistory'] ?? [], fn($a, $ph) => $a + ($ph['amount'] ?? 0), 0);
            $r['paid']    = $paid;
            $r['balance'] = max(0, ($r['amount'] ?? 0) - $paid);
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'manual_receivables', $fields, $shopId, $r);
        }
        $synced['manual_receivables'] = count($data['manualReceivables']);
    }

    // MANUAL PAYABLES
    if (!empty($data['manualPayables'])) {
        $fields = ['source','type','amount','paid','balance','reference','note','payment_history','entry_date','is_opening'];
        foreach ($data['manualPayables'] as $r) {
            $r['entry_date']      = $r['date'] ?? null;
            $r['is_opening']      = (int)($r['_isOpening'] ?? 0);
            $r['payment_history'] = $r['paymentHistory'] ?? [];
            $paid = array_reduce($r['paymentHistory'] ?? [], fn($a, $ph) => $a + ($ph['amount'] ?? 0), 0);
            $r['paid']    = $paid;
            $r['balance'] = max(0, ($r['amount'] ?? 0) - $paid);
            $r['updated_at'] = $r['updated_at'] ?? date('Y-m-d H:i:s');
            upsert($pdo, 'manual_payables', $fields, $shopId, $r);
        }
        $synced['manual_payables'] = count($data['manualPayables']);
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

    $pdo->commit();
    respond(['success' => true, 'synced' => $synced, 'synced_at' => date('Y-m-d H:i:s')]);

} catch (Exception $e) {
    $pdo->rollBack();
    respond(['success' => false, 'error' => 'Sync failed: ' . $e->getMessage()], 500);
}
?>
