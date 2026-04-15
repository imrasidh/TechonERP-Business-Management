/**
 * Sync engine: patch chunking + storage validators (disconnect/reconnect scenarios use same queue/chunk rules).
 */
import { chunkPatches, validateSyncStorageValue } from "../../src/sync/SyncEngine.js";

export function runSyncChunkingTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var err = validateSyncStorageValue("tc3_products", [{ id: "p1", name: "x" }]);
  if (err) return fail("Sync validate: valid products", err);

  err = validateSyncStorageValue("tc3_products", "bad");
  if (!err) return fail("Sync validate: reject non-array products");

  err = validateSyncStorageValue("tc3_settings", { shopName: "s" });
  if (err) return fail("Sync validate: valid settings");

  err = validateSyncStorageValue("tc3_settings", []);
  if (!err) return fail("Sync validate: reject array settings");

  var big = [];
  var i;
  for (i = 0; i < 150; i++) {
    big.push({ id: "s" + i, x: 1 });
  }
  var groups = chunkPatches([{ key: "tc3_sales", value: big, patch_id: "p1" }]);
  if (!groups || groups.length < 2) return fail("Sync chunking: large array split", groups && groups.length);

  var smallGroups = chunkPatches([
    { key: "tc3_settings", value: { a: 1 }, patch_id: "a" },
    { key: "tc3_products", value: [{ id: "1" }], patch_id: "b" },
  ]);
  if (!smallGroups || smallGroups.length < 1) return fail("Sync chunking: small batch");

  pass("Sync engine — chunking + validators");
}
