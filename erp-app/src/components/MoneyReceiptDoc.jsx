import React from "react";
import { VoucherSlipDoc } from "./VoucherSlipDoc.jsx";

/**
 * Money In / Money Out receipt — wide A5 landscape-half voucher slip.
 */
export function MoneyReceiptDoc(props) {
  var mode = props.mode === "out" ? "out" : "in";
  return (
    <VoucherSlipDoc
      variant={mode === "in" ? "money-in" : "money-out"}
      data={props.receipt || {}}
      settings={props.settings}
      fmtDateFull={props.fmtDateFull}
      fmtNum={props.fmtNum}
      getCurrencySymbol={props.getCurrencySymbol}
    />
  );
}

export default MoneyReceiptDoc;
