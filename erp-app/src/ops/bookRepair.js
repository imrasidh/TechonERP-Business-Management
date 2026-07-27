/**
 * Safe standalone book repair — metadata heal + journal dedupe (no data deletion).
 */

import { healGlStorageMetadata, diagnoseGlStorage } from "./glStorageHealth.js";
import { dedupeJournalLinesAfterMerge } from "../accounting/journalMerge.js";
import { validateJournalBalanced } from "../accounting/generalLedger.js";

/**
 * @param {{ get: function(string, *): * }} storage
 * @param {function(string, *): void} writeFn
 * @returns {{ actions: string[], diagnosis: object, journalBalanced: boolean, removedDuplicates: number }}
 */
export function runStandaloneBookRepair(storage, writeFn) {
  var actions = [];
  var heal = healGlStorageMetadata(storage, writeFn);
  if (heal.healed && heal.healed.length) {
    actions.push("healed:" + heal.healed.join(","));
  }

  var lines = storage.get("tc3_journal_lines", []) || [];
  var before = Array.isArray(lines) ? lines.length : 0;
  var deduped = dedupeJournalLinesAfterMerge(lines);
  var removed = before - deduped.length;
  if (removed > 0) {
    writeFn("tc3_journal_lines", deduped);
    actions.push("deduped_journal:" + removed);
  }

  var finalLines = removed > 0 ? deduped : lines;
  var balanced = validateJournalBalanced(Array.isArray(finalLines) ? finalLines : []);
  var diagnosis = diagnoseGlStorage(storage);

  return {
    actions: actions,
    diagnosis: diagnosis,
    journalBalanced: !!(balanced && balanced.ok),
    removedDuplicates: removed,
  };
}
