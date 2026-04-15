/**
 * Additional sync chunking edge cases (read-only against exported chunkPatches; does not change SyncEngine).
 */
import { chunkPatches } from "../../src/sync/SyncEngine.js";

export function runSyncEdgeExtraTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  /* Exactly CHUNK_SIZE (100): typically one chunk group for the array itself */
  var exact = [];
  var i;
  for (i = 0; i < 100; i++) {
    exact.push({ id: "e" + i });
  }
  var g1 = chunkPatches([{ key: "tc3_sales", value: exact, patch_id: "ex" }]);
  if (!g1 || g1.length < 1) return fail("Sync edge: exactly 100 rows produces groups");

  /* Empty array: still a valid patch payload */
  var g2 = chunkPatches([{ key: "tc3_sales", value: [], patch_id: "empty" }]);
  if (!g2 || g2.length < 1) return fail("Sync edge: empty array");

  /* Two oversized arrays in one logical batch → multiple groups */
  var a = [];
  var b = [];
  for (i = 0; i < 120; i++) {
    a.push({ id: "a" + i });
    b.push({ id: "b" + i });
  }
  var g3 = chunkPatches([
    { key: "tc3_sales", value: a, patch_id: "a" },
    { key: "tc3_purchases", value: b, patch_id: "b" },
  ]);
  if (!g3 || g3.length < 2) return fail("Sync edge: two large arrays → multiple chunk groups", g3 && g3.length);

  pass("Sync edge cases — chunk boundaries (extra)");
}
