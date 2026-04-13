<?php
require_once 'config.php';

$user   = requireAuth();
$shopId = $user['shop_id'];
$pdo    = db();
$sec    = $_GET['section'] ?? 'overview';

function q($pdo, $sql, $p = []) {
    $s = $pdo->prepare($sql);
    $s->execute($p);
    return $s->fetchAll();
}
function q1($pdo, $sql, $p = []) {
    $r = q($pdo, $sql, $p);
    return $r[0] ?? [];
}
function jdArr(&$arr) {
    $fields = array_slice(func_get_args(), 1);
    foreach ($arr as &$r) {
        foreach ($fields as $f) {
            if (isset($r[$f])) $r[$f] = json_decode($r[$f], true) ?: [];
        }
    }
}
function sumField($arr, $field) {
    $total = 0;
    foreach ($arr as $r) { $total += floatval($r[$field] ?? 0); }
    return $total;
}

switch ($sec) {

case 'overview':
    $snap = q1($pdo, 'SELECT * FROM settings_snapshot WHERE shop_id=?', [$shopId]);
    $td   = date('Y-m-d');
    $ym   = date('Y-m');
    $ts   = q1($pdo, 'SELECT COALESCE(SUM(total),0) rev, COALESCE(SUM(paid),0) coll, COUNT(*) cnt FROM sales WHERE shop_id=? AND sale_date=?', [$shopId, $td]);
    $te   = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total, COUNT(*) cnt FROM expenses WHERE shop_id=? AND expense_date=?', [$shopId, $td]);
    $ms   = q1($pdo, "SELECT COALESCE(SUM(total),0) rev, COALESCE(SUM(paid),0) coll, COUNT(*) cnt FROM sales WHERE shop_id=? AND sale_date LIKE ?", [$shopId, $ym.'%']);
    $me   = q1($pdo, "SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE shop_id=? AND expense_date LIKE ?", [$shopId, $ym.'%']);
    $pc   = q1($pdo, 'SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) total FROM cheques WHERE shop_id=? AND status="Pending"', [$shopId]);
    $ls   = q1($pdo, 'SELECT COUNT(*) cnt FROM products WHERE shop_id=? AND stock > 0 AND stock <= 5 AND (status IS NULL OR status != "inactive")', [$shopId]);
    $or_  = q1($pdo, 'SELECT COUNT(*) cnt FROM repairs WHERE shop_id=? AND status NOT IN ("Delivered","Cancelled")', [$shopId]);
    $us   = q1($pdo, 'SELECT COUNT(*) cnt, COALESCE(SUM(balance),0) total FROM sales WHERE shop_id=? AND balance > 0', [$shopId]);
    $sR   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM sales WHERE shop_id=? AND balance > 0', [$shopId]);
    $mR   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM manual_receivables WHERE shop_id=?', [$shopId]);
    $sP   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM purchases WHERE shop_id=? AND balance > 0', [$shopId]);
    $mP   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM manual_payables WHERE shop_id=?', [$shopId]);
    $snap['total_receivable'] = floatval($sR['t']) + floatval($mR['t']);
    $snap['total_payable']    = floatval($sP['t']) + floatval($mP['t']);
    respond(['success' => true, 'data' => [
        'snapshot'       => $snap,
        'today_sales'    => $ts,
        'today_expenses' => $te,
        'month_sales'    => $ms,
        'month_expenses' => $me,
        'pending_cheques'=> $pc,
        'low_stock'      => $ls,
        'open_repairs'   => $or_,
        'unpaid_sales'   => $us,
    ]]);

case 'sales':
case 'sales_items':
    $lim  = min((int)($_GET['limit'] ?? 50), 500);
    $off  = (int)($_GET['offset'] ?? 0);
    $from = $_GET['from'] ?? null;
    $to   = $_GET['to']   ?? null;
    $st   = $_GET['status'] ?? null;
    $w = 'WHERE shop_id=?'; $p = [$shopId];
    if ($from) { $w .= ' AND sale_date >= ?'; $p[] = $from; }
    if ($to)   { $w .= ' AND sale_date <= ?'; $p[] = $to; }
    if ($st)   { $w .= ' AND pay_status = ?'; $p[] = $st; }
    $rows = q($pdo, "SELECT * FROM sales $w ORDER BY sale_date DESC, created_at DESC LIMIT $lim OFFSET $off", $p);
    $tot  = q1($pdo, "SELECT COUNT(*) c FROM sales $w", $p);
    jdArr($rows, 'items', 'payment_history');
    respond(['success' => true, 'data' => $rows, 'total' => $tot['c']]);

case 'purchases':
    $lim  = min((int)($_GET['limit'] ?? 100), 500);
    $off  = (int)($_GET['offset'] ?? 0);
    $from = $_GET['from'] ?? null;
    $to   = $_GET['to']   ?? null;
    $w = 'WHERE shop_id=?'; $p = [$shopId];
    if ($from) { $w .= ' AND purchase_date >= ?'; $p[] = $from; }
    if ($to)   { $w .= ' AND purchase_date <= ?'; $p[] = $to; }
    $rows = q($pdo, "SELECT * FROM purchases $w ORDER BY purchase_date DESC LIMIT $lim OFFSET $off", $p);
    $tot  = q1($pdo, "SELECT COUNT(*) c FROM purchases $w", $p);
    jdArr($rows, 'items', 'payment_history');
    respond(['success' => true, 'data' => $rows, 'total' => $tot['c']]);

case 'products':
    $rows = q($pdo, 'SELECT * FROM products WHERE shop_id=? AND (status IS NULL OR status != "inactive") ORDER BY name', [$shopId]);
    respond(['success' => true, 'data' => $rows]);

case 'low_stock':
    $rows = q($pdo, 'SELECT * FROM products WHERE shop_id=? AND stock <= 5 AND (status IS NULL OR status != "inactive") ORDER BY stock ASC', [$shopId]);
    respond(['success' => true, 'data' => $rows]);

case 'customers':
    $custs = q($pdo, 'SELECT * FROM customers WHERE shop_id=? ORDER BY name', [$shopId]);
    foreach ($custs as &$c) {
        $b = q1($pdo, 'SELECT COALESCE(SUM(balance),0) bal, COALESCE(SUM(total),0) spent, COALESCE(SUM(paid),0) paid, COUNT(*) cnt FROM sales WHERE shop_id=? AND (customer_id=? OR customer_name=?)', [$shopId, $c['id'], $c['name']]);
        $c['credit']        = $b['bal'];
        $c['total_spent']   = $b['spent'];
        $c['total_paid']    = $b['paid'];
        $c['invoice_count'] = $b['cnt'];
    }
    unset($c);
    respond(['success' => true, 'data' => $custs]);

case 'suppliers':
    $supps = q($pdo, 'SELECT * FROM suppliers WHERE shop_id=? ORDER BY name', [$shopId]);
    foreach ($supps as &$s) {
        $b = q1($pdo, 'SELECT COALESCE(SUM(balance),0) bal, COALESCE(SUM(total),0) total, COALESCE(SUM(paid_amount),0) paid, COUNT(*) cnt FROM purchases WHERE shop_id=? AND (supplier_id=? OR supplier=?)', [$shopId, $s['id'], $s['name']]);
        $s['balance']         = $b['bal'];
        $s['total_purchased'] = $b['total'];
        $s['total_paid']      = $b['paid'];
        $s['purchase_count']  = $b['cnt'];
    }
    unset($s);
    respond(['success' => true, 'data' => $supps]);

case 'receivables_by_customer':
    /* Get all sales with outstanding balance, then group in PHP — avoids MySQL COALESCE GROUP BY issues */
    $rawSales = q($pdo,
        'SELECT id, invoice_no, customer_id, customer_name, customer_phone,
                total, paid, balance, pay_status, sale_date, payment_history
         FROM sales
         WHERE shop_id=? AND balance > 0
         ORDER BY sale_date DESC',
        [$shopId]);
    jdArr($rawSales, 'payment_history');
    /* Group by customer */
    $grouped = [];
    foreach ($rawSales as $s) {
        $key = $s['customer_id'] ?: ($s['customer_name'] ?: 'Walk-in');
        if (!isset($grouped[$key])) {
            $grouped[$key] = [
                'customer_id'    => $s['customer_id'],
                'customer_name'  => $s['customer_name'] ?: 'Walk-in',
                'customer_phone' => $s['customer_phone'],
                'billed'  => 0, 'paid' => 0, 'balance' => 0, 'cnt' => 0,
            ];
        }
        $grouped[$key]['billed']  += floatval($s['total']);
        $grouped[$key]['paid']    += floatval($s['paid']);
        $grouped[$key]['balance'] += floatval($s['balance']);
        $grouped[$key]['cnt']++;
    }
    $byCustomer = array_values($grouped);
    usort($byCustomer, function($a, $b) { return $b['balance'] <=> $a['balance']; });
    $manual = q($pdo, 'SELECT * FROM manual_receivables WHERE shop_id=? ORDER BY entry_date DESC', [$shopId]);
    jdArr($manual, 'payment_history');
    $salesTotal  = sumField($byCustomer, 'balance');
    $manualTotal = sumField($manual,     'balance');
    respond(['success' => true, 'data' => [
        'by_customer'  => $byCustomer,
        'manual'       => $manual,
        'sales_total'  => $salesTotal,
        'manual_total' => $manualTotal,
        'grand_total'  => $salesTotal + $manualTotal,
    ]]);

case 'payables_by_supplier':
    /* Get all purchases with outstanding balance, then group in PHP */
    $rawPurch = q($pdo,
        'SELECT id, invoice_no, supplier_id, supplier,
                total, paid_amount, balance, status, purchase_date, payment_history
         FROM purchases
         WHERE shop_id=? AND balance > 0
         ORDER BY purchase_date DESC',
        [$shopId]);
    jdArr($rawPurch, 'payment_history');
    /* Group by supplier */
    $grouped = [];
    foreach ($rawPurch as $p) {
        $key = $p['supplier_id'] ?: ($p['supplier'] ?: 'Unknown');
        if (!isset($grouped[$key])) {
            $grouped[$key] = [
                'supplier_id' => $p['supplier_id'],
                'supplier'    => $p['supplier'] ?: 'Unknown',
                'total' => 0, 'paid' => 0, 'balance' => 0, 'cnt' => 0,
            ];
        }
        $grouped[$key]['total']   += floatval($p['total']);
        $grouped[$key]['paid']    += floatval($p['paid_amount']);
        $grouped[$key]['balance'] += floatval($p['balance']);
        $grouped[$key]['cnt']++;
    }
    $bySupplier = array_values($grouped);
    usort($bySupplier, function($a, $b) { return $b['balance'] <=> $a['balance']; });
    $manual = q($pdo, 'SELECT * FROM manual_payables WHERE shop_id=? ORDER BY entry_date DESC', [$shopId]);
    jdArr($manual, 'payment_history');
    $purTotal = sumField($bySupplier, 'balance');
    $manTotal = sumField($manual,     'balance');
    respond(['success' => true, 'data' => [
        'by_supplier'     => $bySupplier,
        'manual'          => $manual,
        'purchases_total' => $purTotal,
        'manual_total'    => $manTotal,
        'grand_total'     => $purTotal + $manTotal,
    ]]);

case 'customer_statement':
    $cid  = $_GET['customer_id'] ?? '';
    $name = $_GET['name'] ?? '';
    $cust = $cid ? q1($pdo, 'SELECT * FROM customers WHERE id=? AND shop_id=?', [$cid, $shopId]) : [];
    $cn   = $cust['name'] ?? $name;
    $sales = $cid
        ? q($pdo, 'SELECT * FROM sales WHERE shop_id=? AND (customer_id=? OR customer_name=?) ORDER BY sale_date ASC', [$shopId, $cid, $cn])
        : q($pdo, 'SELECT * FROM sales WHERE shop_id=? AND customer_name=? ORDER BY sale_date ASC', [$shopId, $name]);
    jdArr($sales, 'items', 'payment_history');
    $returns = $cid
        ? q($pdo, 'SELECT * FROM sales_returns WHERE shop_id=? AND (customer_id=? OR customer=?) ORDER BY return_date ASC', [$shopId, $cid, $cn])
        : q($pdo, 'SELECT * FROM sales_returns WHERE shop_id=? AND customer=? ORDER BY return_date ASC', [$shopId, $name]);
    respond(['success' => true, 'data' => ['customer' => $cust, 'sales' => $sales, 'returns' => $returns]]);

case 'supplier_statement':
    $sid  = $_GET['supplier_id'] ?? '';
    $name = $_GET['name'] ?? '';
    $supp = $sid ? q1($pdo, 'SELECT * FROM suppliers WHERE id=? AND shop_id=?', [$sid, $shopId]) : [];
    $sn   = $supp['name'] ?? $name;
    $purch = $sid
        ? q($pdo, 'SELECT * FROM purchases WHERE shop_id=? AND (supplier_id=? OR supplier=?) ORDER BY purchase_date ASC', [$shopId, $sid, $sn])
        : q($pdo, 'SELECT * FROM purchases WHERE shop_id=? AND supplier=? ORDER BY purchase_date ASC', [$shopId, $name]);
    jdArr($purch, 'items', 'payment_history');
    respond(['success' => true, 'data' => ['supplier' => $supp, 'purchases' => $purch]]);

case 'cheques':
    $today = date('Y-m-d');
    $rows  = q($pdo, 'SELECT * FROM cheques WHERE shop_id=? ORDER BY due_date ASC', [$shopId]);
    /* Enrich with computed fields */
    foreach ($rows as &$c) {
        $c['is_overdue']  = ($c['status'] === 'Pending' && $c['due_date'] < $today) ? 1 : 0;
        $c['days_until']  = $c['due_date'] ? (int)ceil((strtotime($c['due_date']) - strtotime($today)) / 86400) : null;
    }
    unset($c);
    respond(['success' => true, 'data' => $rows]);

case 'repairs':
    $rows = q($pdo, 'SELECT * FROM repairs WHERE shop_id=? ORDER BY date_in DESC', [$shopId]);
    respond(['success' => true, 'data' => $rows]);

case 'expenses':
    $lim  = min((int)($_GET['limit'] ?? 500), 1000);
    $from = $_GET['from'] ?? null;
    $to   = $_GET['to']   ?? null;
    $w = 'WHERE shop_id=?'; $p = [$shopId];
    if ($from) { $w .= ' AND expense_date >= ?'; $p[] = $from; }
    if ($to)   { $w .= ' AND expense_date <= ?'; $p[] = $to; }
    $rows = q($pdo, "SELECT * FROM expenses $w ORDER BY expense_date DESC LIMIT $lim", $p);
    $tot  = q1($pdo, "SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM expenses $w", $p);
    respond(['success' => true, 'data' => $rows, 'total' => $tot['c'], 'grand_total' => $tot['total']]);

case 'returns':
    $rows = q($pdo, 'SELECT * FROM sales_returns WHERE shop_id=? ORDER BY return_date DESC', [$shopId]);
    respond(['success' => true, 'data' => $rows]);

case 'accounts':
    $snap = q1($pdo, 'SELECT * FROM settings_snapshot WHERE shop_id=?', [$shopId]);
    $ts   = q1($pdo, 'SELECT COALESCE(SUM(total),0) rev, COALESCE(SUM(paid),0) coll FROM sales WHERE shop_id=?', [$shopId]);
    $te   = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE shop_id=?', [$shopId]);
    $tp   = q1($pdo, 'SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid_amount),0) paid FROM purchases WHERE shop_id=?', [$shopId]);
    $tr   = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total FROM sales_returns WHERE shop_id=?', [$shopId]);
    $sR   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM sales WHERE shop_id=? AND balance > 0', [$shopId]);
    $mR   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM manual_receivables WHERE shop_id=?', [$shopId]);
    $sP   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM purchases WHERE shop_id=? AND balance > 0', [$shopId]);
    $mP   = q1($pdo, 'SELECT COALESCE(SUM(balance),0) t FROM manual_payables WHERE shop_id=?', [$shopId]);
    $snap['total_receivable'] = floatval($sR['t']) + floatval($mR['t']);
    $snap['total_payable']    = floatval($sP['t']) + floatval($mP['t']);
    respond(['success' => true, 'data' => [
        'snapshot'        => $snap,
        'total_sales'     => $ts,
        'total_expenses'  => $te,
        'total_purchases' => $tp,
        'total_returns'   => $tr,
    ]]);

case 'monthly':
    $yr   = (int)($_GET['year']  ?? date('Y'));
    $mo   = (int)($_GET['month'] ?? date('n'));
    $from = "$yr-" . str_pad($mo, 2, '0', STR_PAD_LEFT) . "-01";
    $to   = date('Y-m-t', strtotime($from));
    $s = q1($pdo, 'SELECT COALESCE(SUM(total),0) rev, COALESCE(SUM(paid),0) coll, COUNT(*) cnt FROM sales WHERE shop_id=? AND sale_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    $e = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE shop_id=? AND expense_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    $p = q1($pdo, 'SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid_amount),0) paid FROM purchases WHERE shop_id=? AND purchase_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    respond(['success' => true, 'data' => ['sales' => $s, 'expenses' => $e, 'purchases' => $p, 'from' => $from, 'to' => $to]]);

case 'yearly':
    $yr     = (int)($_GET['year'] ?? date('Y'));
    $months = [];
    for ($m = 1; $m <= 12; $m++) {
        $from = "$yr-" . str_pad($m, 2, '0', STR_PAD_LEFT) . "-01";
        $to   = date('Y-m-t', strtotime($from));
        $s = q1($pdo, 'SELECT COALESCE(SUM(total),0) revenue, COALESCE(SUM(paid),0) collected FROM sales WHERE shop_id=? AND sale_date BETWEEN ? AND ?', [$shopId, $from, $to]);
        $e = q1($pdo, 'SELECT COALESCE(SUM(amount),0) expenses FROM expenses WHERE shop_id=? AND expense_date BETWEEN ? AND ?', [$shopId, $from, $to]);
        $months[] = ['month' => $m, 'revenue' => $s['revenue'], 'collected' => $s['collected'], 'expenses' => $e['expenses']];
    }
    respond(['success' => true, 'data' => $months]);

case 'reports_pnl':
    $from = $_GET['from'] ?? date('Y-m-01');
    $to   = $_GET['to']   ?? date('Y-m-d');
    $s = q1($pdo, 'SELECT COALESCE(SUM(total),0) rev, COALESCE(SUM(paid),0) coll, COUNT(*) cnt FROM sales WHERE shop_id=? AND sale_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    $e = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE shop_id=? AND expense_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    $p = q1($pdo, 'SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(paid_amount),0) paid FROM purchases WHERE shop_id=? AND purchase_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    $r = q1($pdo, 'SELECT COALESCE(SUM(amount),0) total FROM sales_returns WHERE shop_id=? AND return_date BETWEEN ? AND ?', [$shopId, $from, $to]);
    respond(['success' => true, 'data' => ['sales' => $s, 'expenses' => $e, 'purchases' => $p, 'returns' => $r, 'from' => $from, 'to' => $to]]);

default:
    respond(['success' => false, 'error' => 'Unknown section: ' . $sec], 400);
}
?>
