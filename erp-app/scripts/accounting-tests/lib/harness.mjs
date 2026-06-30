/**
 * Shared helpers for accounting test harness (Node).
 */
import {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  trialBalance,
  profitAndLossFromLedger,
  balanceSheetFromLedger,
  validateJournalBalanced,
  GL,
  round2,
  sumAccount,
  signedBalanceForAccount,
} from "../../../src/accounting/generalLedger.js";
import { mergeJournalLinesByTransactionId } from "../../../src/accounting/journalMerge.js";
import { collectStrictPeriodLockOverrideIds } from "../../../src/accounting/periodLockOverride.js";
import { validateAccountingCommitInvariants } from "../../../src/accounting/commitInvariants.js";
import { deriveInventoryEconomics, reconcileInventoryToLedger, isInventoryReconcileOk } from "../../../src/accounting/inventoryEngine.js";
import { evaluateArApPolicy } from "../../../src/accounting/arApPolicy.js";

export {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  trialBalance,
  profitAndLossFromLedger,
  balanceSheetFromLedger,
  validateJournalBalanced,
  mergeJournalLinesByTransactionId,
  collectStrictPeriodLockOverrideIds,
  validateAccountingCommitInvariants,
  deriveInventoryEconomics,
  reconcileInventoryToLedger,
  isInventoryReconcileOk,
  evaluateArApPolicy,
  GL,
  round2,
  sumAccount,
  signedBalanceForAccount,
};

export function uid() {
  return "t_" + Math.random().toString(36).slice(2, 10);
}

export function baseState() {
  return {
    settings: {
      inventoryCostingMethod: "wac",
      taxEnabled: false,
      glVatPostingEnabled: false,
      strictPeriodLock: true,
      glArApNegativeTolerance: 50,
      glArApHardBlockAt: 1000000,
    },
    products: [],
    sales: [],
    purchases: [],
    expenses: [],
    salesReturns: [],
    purchaseReturns: [],
    customers: [],
    suppliers: [],
  };
}

export function makeSmock(overrides) {
  var d = {
    tc3_openBal: null,
    tc3_manualReceivables: [],
    tc3_manualPayables: [],
    tc3_capLedger: [],
    tc3_profitDist: [],
    tc3_assets: [],
    tc3_gl_accounts: DEFAULT_GL_CHART,
  };
  if (overrides) Object.assign(d, overrides);
  return {
    get: function (k, def) {
      return d[k] !== undefined ? d[k] : def;
    },
  };
}

export function rebuild(state, Smock) {
  var invDer = deriveInventoryEconomics(state, Smock);
  var r = rebuildJournalFromState(state, Smock, uid, invDer);
  return { r: r, invDer: invDer };
}
