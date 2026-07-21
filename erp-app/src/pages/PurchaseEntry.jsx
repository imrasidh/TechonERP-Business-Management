import React from "react";
import Purchases from "./Purchases.jsx";

/**
 * Single shared New Purchase screen for the whole ERP.
 * Navigate here with setActive("purchase-entry") / openNewPurchase().
 * Do not duplicate purchase create UIs elsewhere.
 */
export default function PurchaseEntry(props) {
  return <Purchases {...props} viewMode="entry" />;
}
