<?php
/**
 * Merge two JSON record arrays by id — newest updatedAt/createdAt wins.
 * Used by sync_patch.php for multi-terminal conflict resolution.
 *
 * Products (tc3_products): metadata by updatedAt; stock/cost by stockUpdatedAt;
 * concurrent forks (same stockBaseAt + stockBefore) combine deltas.
 * Sales/purchases: paymentHistory unioned by id; paid/balance recalculated.
 * (Mirrors erp-app/src/utils/mergeRecordArrays.js.)
 */

function tcRecordSortTs($row) {
    if (!is_array($row)) return '';
    $ts = $row['updatedAt'] ?? $row['createdAt'] ?? $row['billedAt'] ?? $row['date'] ?? '';
    return (string)$ts;
}

function tcStockSortTs($row) {
    if (!is_array($row)) return '';
    $ts = $row['stockUpdatedAt'] ?? $row['updatedAt'] ?? $row['createdAt'] ?? '';
    return (string)$ts;
}

function tcPaymentEntryKey($ph) {
    if (!is_array($ph)) return '';
    if (isset($ph['id']) && (string)$ph['id'] !== '') return 'id:' . (string)$ph['id'];
    return 'fp:' . implode('|', [
        $ph['date'] ?? '',
        $ph['amount'] ?? 0,
        $ph['cashMethod'] ?? '',
        $ph['note'] ?? '',
        $ph['chequeId'] ?? '',
    ]);
}

function tcUnionPaymentHistory($aPh, $bPh) {
    $byKey = [];
    $order = [];
    $ingest = function ($arr) use (&$byKey, &$order) {
        if (!is_array($arr)) return;
        foreach ($arr as $ph) {
            if (!is_array($ph)) continue;
            $k = tcPaymentEntryKey($ph);
            if ($k === '') continue;
            if (!isset($byKey[$k])) {
                $byKey[$k] = $ph;
                $order[] = $k;
                continue;
            }
            $prev = $byKey[$k];
            if (isset($ph['id']) && !isset($prev['id'])) {
                $byKey[$k] = $ph;
            } else if ((float)($ph['amount'] ?? 0) > (float)($prev['amount'] ?? 0)) {
                $byKey[$k] = $ph;
            }
        }
    };
    $ingest($aPh);
    $ingest($bPh);
    $out = [];
    foreach ($order as $k) $out[] = $byKey[$k];
    return $out;
}

function tcSumPaymentHistoryAmounts($ph) {
    $sum = 0.0;
    if (!is_array($ph)) return 0.0;
    foreach ($ph as $p) {
        if (!is_array($p)) continue;
        $sum += (float)($p['amount'] ?? 0);
    }
    return $sum;
}

function tcIsVoidedDoc($row) {
    if (!is_array($row)) return false;
    if (!empty($row['voided'])) return true;
    $st = strtolower((string)($row['status'] ?? $row['payStatus'] ?? ''));
    return $st === 'voided';
}

function tcMergeDocumentWithPaymentHistory($a, $b, $kind) {
    $preferB = tcRecordSortTs($b) >= tcRecordSortTs($a);
    $out = array_merge($preferB ? $a : $b, $preferB ? $b : $a);
    $aPh = (isset($a['paymentHistory']) && is_array($a['paymentHistory'])) ? $a['paymentHistory'] : [];
    $bPh = (isset($b['paymentHistory']) && is_array($b['paymentHistory'])) ? $b['paymentHistory'] : [];
    if (!$aPh && !$bPh) return $out;

    $merged = tcUnionPaymentHistory($aPh, $bPh);
    $out['paymentHistory'] = $merged;
    if (tcIsVoidedDoc($out)) return $out;

    $phSum = round(tcSumPaymentHistoryAmounts($merged), 2);
    $total = (float)($out['total'] ?? 0);
    if ($kind === 'sale') {
        /* Cap paid at total after concurrent full pays; keep full PH for audit. */
        $paidCap = min($phSum, $total);
        $bal = round($total - $paidCap, 2);
        $out['paid'] = $paidCap;
        $out['balance'] = $bal;
        $out['payStatus'] = $bal <= 0 ? 'Paid' : ($paidCap > 0 ? 'Partial' : ($out['payStatus'] ?? 'Unpaid'));
        if ($phSum > $total + 0.009) $out['overpaidAmount'] = round($phSum - $total, 2);
    } else if ($kind === 'purchase') {
        /* Purchases intentionally allow overpayment (supplier credit). */
        $out['paidAmount'] = $phSum;
        $out['balance'] = round($total - $phSum, 2);
        $out['status'] = $out['balance'] <= 0 ? 'Paid' : ($phSum > 0 ? 'Partial' : ($out['status'] ?? 'Unpaid'));
    }
    return $out;
}

/**
 * Merge two product rows: keep newest metadata, but stock/cost from newest stockUpdatedAt.
 * Concurrent forks from the same stockBaseAt combine stock deltas.
 */
function tcMergeProductRow($a, $b) {
    $preferBMeta = tcRecordSortTs($b) >= tcRecordSortTs($a);
    $out = array_merge($preferBMeta ? $a : $b, $preferBMeta ? $b : $a);
    $aTs = tcStockSortTs($a);
    $bTs = tcStockSortTs($b);
    $aBase = isset($a['stockBaseAt']) ? (string)$a['stockBaseAt'] : '';
    $bBase = isset($b['stockBaseAt']) ? (string)$b['stockBaseAt'] : '';

    if (
        $aBase !== '' &&
        $aBase === $bBase &&
        isset($a['stockBefore']) &&
        isset($b['stockBefore']) &&
        abs((float)$a['stockBefore'] - (float)$b['stockBefore']) < 1e-9
    ) {
        $parentStock = (float)$a['stockBefore'];
        $dA = (float)$a['stock'] - (float)$a['stockBefore'];
        $dB = (float)$b['stock'] - (float)$b['stockBefore'];
        $out['stock'] = $parentStock + $dA + $dB;
        if ($bTs >= $aTs) {
            if (array_key_exists('cost', $b)) $out['cost'] = $b['cost'];
            if (isset($b['stockUpdatedAt'])) $out['stockUpdatedAt'] = $b['stockUpdatedAt'];
        } else {
            if (array_key_exists('cost', $a)) $out['cost'] = $a['cost'];
            if (isset($a['stockUpdatedAt'])) $out['stockUpdatedAt'] = $a['stockUpdatedAt'];
        }
        $out['stockBefore'] = $parentStock;
        $out['stockBaseAt'] = $aBase;
        return $out;
    }

    if ($bBase !== '' && $bBase === (string)($a['stockUpdatedAt'] ?? '') && array_key_exists('stock', $b)) {
        $out['stock'] = $b['stock'];
        if (array_key_exists('cost', $b)) $out['cost'] = $b['cost'];
        if (isset($b['stockUpdatedAt'])) $out['stockUpdatedAt'] = $b['stockUpdatedAt'];
        if (isset($b['stockBefore'])) $out['stockBefore'] = $b['stockBefore'];
        if (isset($b['stockBaseAt'])) $out['stockBaseAt'] = $b['stockBaseAt'];
        return $out;
    }
    if ($aBase !== '' && $aBase === (string)($b['stockUpdatedAt'] ?? '') && array_key_exists('stock', $a)) {
        $out['stock'] = $a['stock'];
        if (array_key_exists('cost', $a)) $out['cost'] = $a['cost'];
        if (isset($a['stockUpdatedAt'])) $out['stockUpdatedAt'] = $a['stockUpdatedAt'];
        if (isset($a['stockBefore'])) $out['stockBefore'] = $a['stockBefore'];
        if (isset($a['stockBaseAt'])) $out['stockBaseAt'] = $a['stockBaseAt'];
        return $out;
    }

    if ($bTs >= $aTs) {
        if (array_key_exists('stock', $b)) $out['stock'] = $b['stock'];
        if (array_key_exists('cost', $b)) $out['cost'] = $b['cost'];
        if (isset($b['stockUpdatedAt'])) $out['stockUpdatedAt'] = $b['stockUpdatedAt'];
        if (isset($b['stockBefore'])) $out['stockBefore'] = $b['stockBefore'];
        if (isset($b['stockBaseAt'])) $out['stockBaseAt'] = $b['stockBaseAt'];
    } else {
        if (array_key_exists('stock', $a)) $out['stock'] = $a['stock'];
        if (array_key_exists('cost', $a)) $out['cost'] = $a['cost'];
        if (isset($a['stockUpdatedAt'])) $out['stockUpdatedAt'] = $a['stockUpdatedAt'];
        if (isset($a['stockBefore'])) $out['stockBefore'] = $a['stockBefore'];
        if (isset($a['stockBaseAt'])) $out['stockBaseAt'] = $a['stockBaseAt'];
    }
    return $out;
}

function tcPickNewerRow($prev, $row, $storageKey = null) {
    if ($storageKey === 'tc3_products') {
        return tcMergeProductRow($prev, $row);
    }
    if ($storageKey === 'tc3_sales') {
        return tcMergeDocumentWithPaymentHistory($prev, $row, 'sale');
    }
    if ($storageKey === 'tc3_purchases') {
        return tcMergeDocumentWithPaymentHistory($prev, $row, 'purchase');
    }
    if ($storageKey === 'tc3_customers') {
        return tcMergeCustomerRow($prev, $row);
    }
    if ($storageKey === 'tc3_manualReceivables' || $storageKey === 'tc3_manualPayables') {
        return tcMergeManualWithPaymentHistory($prev, $row);
    }
    return (tcRecordSortTs($row) >= tcRecordSortTs($prev)) ? $row : $prev;
}

function tcMergeManualWithPaymentHistory($a, $b) {
    $preferB = tcRecordSortTs($b) >= tcRecordSortTs($a);
    $out = array_merge($preferB ? $a : $b, $preferB ? $b : $a);
    $aPh = (isset($a['paymentHistory']) && is_array($a['paymentHistory'])) ? $a['paymentHistory'] : [];
    $bPh = (isset($b['paymentHistory']) && is_array($b['paymentHistory'])) ? $b['paymentHistory'] : [];
    if ($aPh || $bPh) {
        $out['paymentHistory'] = tcUnionPaymentHistory($aPh, $bPh);
    }
    return $out;
}

function tcMergeCustomerRow($a, $b) {
    $preferBMeta = tcRecordSortTs($b) >= tcRecordSortTs($a);
    $out = array_merge($preferBMeta ? $a : $b, $preferBMeta ? $b : $a);
    $aBase = isset($a['creditBaseAt']) ? (string)$a['creditBaseAt'] : '';
    $bBase = isset($b['creditBaseAt']) ? (string)$b['creditBaseAt'] : '';
    $aTs = tcRecordSortTs($a);
    $bTs = tcRecordSortTs($b);

    if (
        $aBase !== '' &&
        $aBase === $bBase &&
        isset($a['creditBefore']) &&
        isset($b['creditBefore']) &&
        abs((float)$a['creditBefore'] - (float)$b['creditBefore']) < 1e-9
    ) {
        $parentCredit = (float)$a['creditBefore'];
        $out['credit'] = max(0, $parentCredit + ((float)$a['credit'] - (float)$a['creditBefore']) + ((float)$b['credit'] - (float)$b['creditBefore']));
        $out['creditBefore'] = $parentCredit;
        $out['creditBaseAt'] = $aBase;
    } else if ($bBase !== '' && $bBase === (string)($a['updatedAt'] ?? '') && array_key_exists('credit', $b)) {
        $out['credit'] = $b['credit'];
        if (isset($b['creditBefore'])) $out['creditBefore'] = $b['creditBefore'];
        if (isset($b['creditBaseAt'])) $out['creditBaseAt'] = $b['creditBaseAt'];
    } else if ($aBase !== '' && $aBase === (string)($b['updatedAt'] ?? '') && array_key_exists('credit', $a)) {
        $out['credit'] = $a['credit'];
        if (isset($a['creditBefore'])) $out['creditBefore'] = $a['creditBefore'];
        if (isset($a['creditBaseAt'])) $out['creditBaseAt'] = $a['creditBaseAt'];
    } else if ($bTs >= $aTs) {
        if (array_key_exists('credit', $b)) $out['credit'] = $b['credit'];
    } else if (array_key_exists('credit', $a)) {
        $out['credit'] = $a['credit'];
    }

    $aSpentBase = isset($a['spentBaseAt']) ? (string)$a['spentBaseAt'] : '';
    $bSpentBase = isset($b['spentBaseAt']) ? (string)$b['spentBaseAt'] : '';
    if (
        $aSpentBase !== '' &&
        $aSpentBase === $bSpentBase &&
        isset($a['spentBefore']) &&
        isset($b['spentBefore']) &&
        abs((float)$a['spentBefore'] - (float)$b['spentBefore']) < 1e-9
    ) {
        $parentSpent = (float)$a['spentBefore'];
        $out['totalSpent'] = max(0, $parentSpent + ((float)$a['totalSpent'] - (float)$a['spentBefore']) + ((float)$b['totalSpent'] - (float)$b['spentBefore']));
        $out['spentBefore'] = $parentSpent;
        $out['spentBaseAt'] = $aSpentBase;
    } else if ($bSpentBase !== '' && $bSpentBase === (string)($a['updatedAt'] ?? '') && array_key_exists('totalSpent', $b)) {
        $out['totalSpent'] = $b['totalSpent'];
        if (isset($b['spentBefore'])) $out['spentBefore'] = $b['spentBefore'];
        if (isset($b['spentBaseAt'])) $out['spentBaseAt'] = $b['spentBaseAt'];
    } else if ($aSpentBase !== '' && $aSpentBase === (string)($b['updatedAt'] ?? '') && array_key_exists('totalSpent', $a)) {
        $out['totalSpent'] = $a['totalSpent'];
        if (isset($a['spentBefore'])) $out['spentBefore'] = $a['spentBefore'];
        if (isset($a['spentBaseAt'])) $out['spentBaseAt'] = $a['spentBaseAt'];
    } else if ($bTs >= $aTs) {
        if (array_key_exists('totalSpent', $b)) $out['totalSpent'] = $b['totalSpent'];
    } else if (array_key_exists('totalSpent', $a)) {
        $out['totalSpent'] = $a['totalSpent'];
    }

    return $out;
}

function tcMergeRecordArraysByNewest($localArr, $remoteArr, $storageKey = null) {
    $byId = [];
    $noId = [];

    $ingest = function ($arr) use (&$byId, &$noId, $storageKey) {
        if (!is_array($arr)) return;
        foreach ($arr as $row) {
            if (!is_array($row)) continue;
            if (!isset($row['id'])) {
                $noId[] = $row;
                continue;
            }
            $id = (string)$row['id'];
            if (!isset($byId[$id])) {
                $byId[$id] = $row;
                continue;
            }
            $byId[$id] = tcPickNewerRow($byId[$id], $row, $storageKey);
        }
    };

    $ingest($localArr);
    $ingest($remoteArr);

    return array_merge(array_values($byId), $noId);
}

/**
 * Full-array snapshot from a terminal: incoming defines which record ids exist.
 * Per-id field conflicts resolve by newest timestamp. Ids only on server but
 * absent from incoming are removed (handles deletes).
 */
function tcApplyFullArraySnapshot($existingArr, $incomingArr, $storageKey = null) {
    $existingById = [];
    if (is_array($existingArr)) {
        foreach ($existingArr as $row) {
            if (is_array($row) && isset($row['id'])) {
                $existingById[(string)$row['id']] = $row;
            }
        }
    }
    $result = [];
    $noId = [];
    if (!is_array($incomingArr)) return [];
    foreach ($incomingArr as $row) {
        if (!is_array($row)) continue;
        if (!isset($row['id'])) {
            $noId[] = $row;
            continue;
        }
        $id = (string)$row['id'];
        $prev = $existingById[$id] ?? null;
        if ($prev) {
            $result[] = tcPickNewerRow($prev, $row, $storageKey);
        } else {
            $result[] = $row;
        }
    }
    return array_merge($result, $noId);
}

function tcParentIdsFromReturns($returns, $parentField) {
    $ids = [];
    if (!is_array($returns)) return $ids;
    foreach ($returns as $r) {
        if (!is_array($r) || !isset($r[$parentField])) continue;
        $ids[(string)$r[$parentField]] = true;
    }
    return $ids;
}

function tcDropReturnsOnVoidedParents($sales, $salesReturns, $purchases, $purchaseReturns) {
    $voidedSaleIds = [];
    if (is_array($sales)) {
        foreach ($sales as $s) {
            if (is_array($s) && isset($s['id']) && tcIsVoidedDoc($s)) {
                $voidedSaleIds[(string)$s['id']] = true;
            }
        }
    }
    $voidedPurchaseIds = [];
    if (is_array($purchases)) {
        foreach ($purchases as $p) {
            if (is_array($p) && isset($p['id']) && tcIsVoidedDoc($p)) {
                $voidedPurchaseIds[(string)$p['id']] = true;
            }
        }
    }
    $cleanSalesReturns = [];
    $strippedSalesReturns = [];
    if (is_array($salesReturns)) {
        foreach ($salesReturns as $r) {
            if (!is_array($r) || !isset($r['invoiceId'])) {
                $cleanSalesReturns[] = $r;
                continue;
            }
            if (!empty($voidedSaleIds[(string)$r['invoiceId']])) {
                $strippedSalesReturns[] = $r;
                continue;
            }
            $cleanSalesReturns[] = $r;
        }
    }
    $cleanPurchaseReturns = [];
    $strippedPurchaseReturns = [];
    if (is_array($purchaseReturns)) {
        foreach ($purchaseReturns as $r) {
            if (!is_array($r) || !isset($r['purchaseId'])) {
                $cleanPurchaseReturns[] = $r;
                continue;
            }
            if (!empty($voidedPurchaseIds[(string)$r['purchaseId']])) {
                $strippedPurchaseReturns[] = $r;
                continue;
            }
            $cleanPurchaseReturns[] = $r;
        }
    }
    return [
        'salesReturns' => $cleanSalesReturns,
        'purchaseReturns' => $cleanPurchaseReturns,
        'strippedSalesReturns' => $strippedSalesReturns,
        'strippedPurchaseReturns' => $strippedPurchaseReturns,
    ];
}

function tcPreferActiveDocWhenReturnsExist($docs, $parentIds, $versionsById) {
    if (empty($parentIds) || !is_array($docs)) return $docs;
    $out = [];
    foreach ($docs as $doc) {
        if (!is_array($doc) || !isset($doc['id'])) {
            $out[] = $doc;
            continue;
        }
        $id = (string)$doc['id'];
        if (empty($parentIds[$id]) || !tcIsVoidedDoc($doc)) {
            $out[] = $doc;
            continue;
        }
        $versions = $versionsById[$id] ?? [];
        $active = null;
        $activeTs = '';
        foreach ($versions as $v) {
            if (!is_array($v) || tcIsVoidedDoc($v)) continue;
            $ts = tcRecordSortTs($v);
            if ($active === null || $ts >= $activeTs) {
                $active = $v;
                $activeTs = $ts;
            }
        }
        $out[] = $active ?? $doc;
    }
    return $out;
}

function tcEventSortTs($row) {
    if (!is_array($row)) return '';
    if (!empty($row['isoDateTime'])) return (string)$row['isoDateTime'];
    return tcRecordSortTs($row);
}

function tcVoidEventTs($doc) {
    if (!is_array($doc)) return '';
    if (!empty($doc['voidedAt'])) return (string)$doc['voidedAt'];
    return tcRecordSortTs($doc);
}

function tcLatestReturnTs($returns, $parentField, $parentId) {
    $latest = '';
    if (!is_array($returns)) return $latest;
    foreach ($returns as $r) {
        if (!is_array($r) || !isset($r[$parentField])) continue;
        if ((string)$r[$parentField] !== (string)$parentId) continue;
        $ts = tcEventSortTs($r);
        if ($ts >= $latest) $latest = $ts;
    }
    return $latest;
}

function tcRestoreActiveSaleFromVoid($sale) {
    if (!is_array($sale) || !tcIsVoidedDoc($sale)) return $sale;
    $paid = (float)($sale['paid'] ?? 0);
    $total = (float)($sale['total'] ?? 0);
    $bal = round($total - $paid, 2);
    $payStatus = $bal <= 0 ? 'Paid' : ($paid > 0 ? 'Partial' : 'Unpaid');
    $out = $sale;
    $out['balance'] = $bal;
    $out['payStatus'] = $payStatus;
    $out['status'] = $payStatus;
    unset($out['voidedAt'], $out['voidReason'], $out['voidRefundCashBank'], $out['voidRefundNote']);
    return $out;
}

function tcRestoreActivePurchaseFromVoid($purchase) {
    if (!is_array($purchase) || !tcIsVoidedDoc($purchase)) return $purchase;
    $paid = (float)($purchase['paidAmount'] ?? 0);
    $total = (float)($purchase['total'] ?? 0);
    $bal = round($total - $paid, 2);
    $status = $bal <= 0 ? 'Paid' : ($paid > 0 ? 'Partial' : 'Unpaid');
    $out = $purchase;
    $out['balance'] = $bal;
    $out['status'] = $status;
    unset($out['voidedAt'], $out['voidReason']);
    return $out;
}

function tcResolveVoidReturnConflictsByTimestamp($sales, $salesReturns, $purchases, $purchaseReturns) {
    if (is_array($sales)) {
        foreach ($sales as $i => $s) {
            if (!is_array($s) || !isset($s['id']) || !tcIsVoidedDoc($s)) continue;
            $retTs = tcLatestReturnTs($salesReturns, 'invoiceId', $s['id']);
            if ($retTs === '') continue;
            $vTs = tcVoidEventTs($s);
            if ($vTs !== '' && $retTs <= $vTs) continue;
            $sales[$i] = tcRestoreActiveSaleFromVoid($s);
        }
    }
    if (is_array($purchases)) {
        foreach ($purchases as $i => $p) {
            if (!is_array($p) || !isset($p['id']) || !tcIsVoidedDoc($p)) continue;
            $retTs = tcLatestReturnTs($purchaseReturns, 'purchaseId', $p['id']);
            if ($retTs === '') continue;
            $vTs = tcVoidEventTs($p);
            if ($vTs !== '' && $retTs <= $vTs) continue;
            $purchases[$i] = tcRestoreActivePurchaseFromVoid($p);
        }
    }
    return ['sales' => $sales, 'purchases' => $purchases];
}

function tcReconcileVoidReturnArrays($sales, $salesReturns, $purchases, $purchaseReturns, $saleVersions = [], $purchaseVersions = []) {
    $saleReturnParents = tcParentIdsFromReturns($salesReturns, 'invoiceId');
    if (!empty($saleReturnParents)) {
        $sales = tcPreferActiveDocWhenReturnsExist($sales, $saleReturnParents, $saleVersions);
    }
    $purReturnParents = tcParentIdsFromReturns($purchaseReturns, 'purchaseId');
    if (!empty($purReturnParents)) {
        $purchases = tcPreferActiveDocWhenReturnsExist($purchases, $purReturnParents, $purchaseVersions);
    }
    $resolved = tcResolveVoidReturnConflictsByTimestamp($sales, $salesReturns, $purchases, $purchaseReturns);
    $sales = $resolved['sales'];
    $purchases = $resolved['purchases'];
    $cleaned = tcDropReturnsOnVoidedParents($sales, $salesReturns, $purchases, $purchaseReturns);
    return [
        'sales' => $sales,
        'purchases' => $purchases,
        'salesReturns' => $cleaned['salesReturns'],
        'purchaseReturns' => $cleaned['purchaseReturns'],
        'strippedSalesReturns' => $cleaned['strippedSalesReturns'] ?? [],
        'strippedPurchaseReturns' => $cleaned['strippedPurchaseReturns'] ?? [],
    ];
}

function tcRound2($n) {
    return round((float)$n, 2);
}

function tcReverseStrippedSalesReturnStock($products, $strippedReturns) {
    if (empty($strippedReturns) || !is_array($products)) return $products;
    $at = gmdate('c');
    foreach ($strippedReturns as $r) {
        if (!is_array($r)) continue;
        $pid = $r['productId'] ?? null;
        $q = (float)($r['qty'] ?? 0);
        if ($pid === null || $q <= 0) continue;
        foreach ($products as $i => $p) {
            if (!is_array($p) || !isset($p['id'])) continue;
            if ((string)$p['id'] !== (string)$pid) continue;
            $stock = (float)($p['stock'] ?? 0);
            $products[$i]['stock'] = max(0, $stock - $q);
            $products[$i]['updatedAt'] = $at;
            break;
        }
    }
    return $products;
}

function tcReverseStrippedPurchaseReturnStock($products, $strippedReturns) {
    if (empty($strippedReturns) || !is_array($products)) return $products;
    $at = gmdate('c');
    foreach ($strippedReturns as $r) {
        if (!is_array($r)) continue;
        $pid = $r['productId'] ?? null;
        $q = (float)($r['qty'] ?? 0);
        if ($pid === null || $q <= 0) continue;
        foreach ($products as $i => $p) {
            if (!is_array($p) || !isset($p['id'])) continue;
            if ((string)$p['id'] !== (string)$pid) continue;
            $stock = (float)($p['stock'] ?? 0);
            $products[$i]['stock'] = $stock + $q;
            $products[$i]['updatedAt'] = $at;
            break;
        }
    }
    return $products;
}

function tcReverseStrippedSalesReturnCustomers($customers, $sales, $strippedReturns) {
    if (empty($strippedReturns) || !is_array($customers)) return $customers;
    $byInvoice = [];
    foreach ($strippedReturns as $r) {
        if (!is_array($r) || !isset($r['invoiceId'])) continue;
        $key = (string)$r['invoiceId'];
        if (!isset($byInvoice[$key])) {
            $byInvoice[$key] = ['returns' => [], 'customerId' => (string)($r['customerId'] ?? '')];
        }
        $byInvoice[$key]['returns'][] = $r;
        if (!empty($r['customerId'])) $byInvoice[$key]['customerId'] = (string)$r['customerId'];
    }
    $at = gmdate('c');
    foreach ($byInvoice as $invId => $grp) {
        if (empty($grp['customerId'])) continue;
        $sale = null;
        if (is_array($sales)) {
            foreach ($sales as $s) {
                if (is_array($s) && isset($s['id']) && (string)$s['id'] === (string)$invId) {
                    $sale = $s;
                    break;
                }
            }
        }
        if (!$sale) continue;
        $returnTotal = 0.0;
        foreach ($grp['returns'] as $r) {
            $returnTotal += (float)($r['amount'] ?? 0);
        }
        if ($returnTotal <= 0) continue;
        $origPaid = (float)($sale['paid'] ?? 0);
        $origTotal = (float)($sale['total'] ?? 0);
        $origOutstanding = max(0, $origTotal - $origPaid);
        $newTotal = max(0, $origTotal - $returnTotal);
        $newOutstanding = max(0, $newTotal - min($origPaid, $newTotal));
        $debtReduced = max(0, $origOutstanding - $newOutstanding);
        foreach ($customers as $i => $c) {
            if (!is_array($c) || !isset($c['id'])) continue;
            if ((string)$c['id'] !== (string)$grp['customerId']) continue;
            $customers[$i]['credit'] = tcRound2((float)($c['credit'] ?? 0) + $debtReduced);
            $customers[$i]['totalSpent'] = tcRound2((float)($c['totalSpent'] ?? 0) + $returnTotal);
            $customers[$i]['updatedAt'] = $at;
            break;
        }
    }
    return $customers;
}

function tcApplyVoidReturnSideEffectsOnServer(PDO $pdo, array $reconciled) {
    $strippedSales = $reconciled['strippedSalesReturns'] ?? [];
    $strippedPurch = $reconciled['strippedPurchaseReturns'] ?? [];
    if (empty($strippedSales) && empty($strippedPurch)) return;

    $stmt = $pdo->prepare('SELECT `value` FROM kv_store WHERE store_key = ?');
    $upsert = $pdo->prepare(
        'INSERT INTO kv_store (store_key, `value`) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
    );

    $products = [];
    $stmt->execute(['tc3_products']);
    $raw = $stmt->fetchColumn();
    $decoded = ($raw !== false && $raw !== null) ? json_decode((string)$raw, true) : [];
    if (is_array($decoded)) $products = $decoded;

    if (!empty($strippedSales)) {
        $products = tcReverseStrippedSalesReturnStock($products, $strippedSales);
    }
    if (!empty($strippedPurch)) {
        $products = tcReverseStrippedPurchaseReturnStock($products, $strippedPurch);
    }
    $json = json_encode($products, JSON_UNESCAPED_UNICODE);
    if ($json !== false) $upsert->execute(['tc3_products', $json]);

    if (!empty($strippedSales)) {
        $customers = [];
        $stmt->execute(['tc3_customers']);
        $rawC = $stmt->fetchColumn();
        $decodedC = ($rawC !== false && $rawC !== null) ? json_decode((string)$rawC, true) : [];
        if (is_array($decodedC)) $customers = $decodedC;
        $customers = tcReverseStrippedSalesReturnCustomers(
            $customers,
            $reconciled['sales'] ?? [],
            $strippedSales
        );
        $jsonC = json_encode($customers, JSON_UNESCAPED_UNICODE);
        if ($jsonC !== false) $upsert->execute(['tc3_customers', $jsonC]);
    }
}

/**
 * After sync patches touching sales/returns, keep server state free of orphan returns.
 */
function tcReconcileVoidReturnStateOnServer(PDO $pdo) {
    $keys = ['tc3_sales', 'tc3_salesReturns', 'tc3_purchases', 'tc3_purchaseReturns'];
    $data = [];
    $stmt = $pdo->prepare('SELECT `value` FROM kv_store WHERE store_key = ?');
    foreach ($keys as $key) {
        $stmt->execute([$key]);
        $raw = $stmt->fetchColumn();
        $decoded = ($raw !== false && $raw !== null) ? json_decode((string)$raw, true) : [];
        $data[$key] = is_array($decoded) ? $decoded : [];
    }
    $reconciled = tcReconcileVoidReturnArrays(
        $data['tc3_sales'],
        $data['tc3_salesReturns'],
        $data['tc3_purchases'],
        $data['tc3_purchaseReturns']
    );
    $upsert = $pdo->prepare(
        'INSERT INTO kv_store (store_key, `value`) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
    );
    foreach ($keys as $key) {
        $field = $key === 'tc3_sales' ? 'sales'
            : ($key === 'tc3_purchases' ? 'purchases'
            : ($key === 'tc3_salesReturns' ? 'salesReturns' : 'purchaseReturns'));
        $json = json_encode($reconciled[$field], JSON_UNESCAPED_UNICODE);
        if ($json !== false) $upsert->execute([$key, $json]);
    }
    tcApplyVoidReturnSideEffectsOnServer($pdo, $reconciled);
}
