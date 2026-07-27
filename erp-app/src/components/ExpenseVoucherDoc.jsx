import React from "react";
import { VoucherSlipDoc } from "./VoucherSlipDoc.jsx";

export function ExpenseVoucherDoc(props) {
  return (
    <VoucherSlipDoc
      variant="expense"
      data={props.expense || {}}
      settings={props.settings}
      fmtDateFull={props.fmtDateFull}
      fmtNum={props.fmtNum}
      getCurrencySymbol={props.getCurrencySymbol}
    />
  );
}

export default ExpenseVoucherDoc;
