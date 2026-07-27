/**
 * Account statement GL reference matching — sales/purchase returns must map to return.id.
 */
import {
  collectStatementGlRefIds,
  sumGlControlNetForRefIds,
  journalLineMatchesRefId,
} from "../../src/utils/statementGlRefs.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function runStatementGlRefsTests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var saleId = "sale-abc";
    var returnId = "ret-xyz";
    var idSet = collectStatementGlRefIds({
      mode: "customer",
      rows: [
        { sourceId: saleId, type: "Invoice" },
        { sourceId: saleId, glRefId: returnId, type: "Return" },
      ],
      salesReturns: [{ id: returnId, customerId: "c1", amount: 66800 }],
      partyMatchesCustomer: function () { return true; },
    });
    assert(idSet[saleId] && idSet[returnId], "sale + return ids in ref set");
    assert(journalLineMatchesRefId(returnId + "-c", idSet), "cogs suffix matches return id");

    var jlines = [
      { accountId: "1100", referenceId: saleId, debit: 56500, credit: 0 },
      { accountId: "1100", referenceId: saleId, debit: 257800, credit: 0 },
      { accountId: "1100", referenceId: returnId, debit: 0, credit: 66800 },
    ];
    var glNet = sumGlControlNetForRefIds(jlines, "1100", idSet);
    assert(glNet === 247500, "GL AR net includes sales return credit");

    var idSetMissingReturn = collectStatementGlRefIds({
      mode: "customer",
      rows: [{ sourceId: saleId }],
      salesReturns: [],
      partyMatchesCustomer: function () { return false; },
    });
    var glWrong = sumGlControlNetForRefIds(jlines, "1100", idSetMissingReturn);
    assert(glWrong === 314300, "without return id GL omits return credit (old bug)");

    pass("Statement GL refs — return id reconciliation");
  } catch (e) {
    fail("Statement GL refs", e && e.message ? e.message : e);
  }
}
