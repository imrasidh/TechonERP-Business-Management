/**
 * One-time backfill of createdAt on legacy sales/purchases/returns for inventory ordering.
 */

export var CREATED_AT_MIGRATION_FLAG = "tc3_migrated_created_at_v1";

export var CREATED_AT_BACKFILL_KEYS = [
  "tc3_sales",
  "tc3_purchases",
  "tc3_salesReturns",
  "tc3_purchaseReturns",
];

function syntheticCreatedAt(row, index) {
  var d = row && row.date ? String(row.date) : "1970-01-01";
  return d + "T12:00:00." + String(index).padStart(6, "0") + "Z";
}

export function backfillCreatedAtOnArray(arr) {
  if (!Array.isArray(arr)) return { rows: arr, changed: false };
  var changed = false;
  var out = arr.map(function (row, i) {
    if (!row || row.createdAt) return row;
    changed = true;
    return Object.assign({}, row, { createdAt: syntheticCreatedAt(row, i) });
  });
  return { rows: out, changed: changed };
}

/**
 * @returns {boolean} true if any storage key was updated
 */
export function runCreatedAtBackfillMigration(S, coreStorageSet) {
  if (S.get(CREATED_AT_MIGRATION_FLAG)) return false;
  var any = false;
  CREATED_AT_BACKFILL_KEYS.forEach(function (key) {
    var res = backfillCreatedAtOnArray(S.get(key, []));
    if (res.changed) {
      coreStorageSet(key, res.rows);
      any = true;
    }
  });
  coreStorageSet(CREATED_AT_MIGRATION_FLAG, true);
  return any;
}
