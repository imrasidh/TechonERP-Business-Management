/** 3rd-party repair bill rows — created for convert-to-invoice only; not retail inventory. */
export function isRepair3pInternalProduct(p) {
  if (!p) return false;
  if (p._repair3pOneTime === true || p._repairInternal === true) return true;
  return !!(p._repairId && String(p.category || "").toLowerCase() === "repair 3rd party");
}
