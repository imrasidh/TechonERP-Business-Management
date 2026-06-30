import { computeSaleTax } from "../tax/taxCompute.js";

export function quotationLineSubtotal(items) {
  return (items || []).reduce(function (a, it) {
    return a + (Number(it.qty) || 0) * (Number(it.price) || 0);
  }, 0);
}

export function quotationGrandTotal(q, settings) {
  if (!q) return 0;
  if (q.total != null && !isNaN(q.total)) return q.total;
  var sub = q.subTotal != null ? q.subTotal : quotationLineSubtotal(q.items);
  var disc = q.discount || 0;
  var afterDisc = Math.max(0, sub - disc);
  return computeSaleTax(settings || {}, afterDisc).grandTotal;
}

export function buildQuotationTaxExtras(settings, subTotal, discount, taxCalcInput, posTaxCalc, total, posTaxLines, posTotalTax) {
  var disc = discount || 0;
  if (settings && settings.taxEnabled) {
    return {
      subTotal: subTotal,
      discount: disc,
      taxMode: (posTaxCalc && posTaxCalc.taxMode) || "exclusive",
      totalTax: posTotalTax || 0,
      taxApplyBase: (settings && settings.taxApplyBase) || "after_discount",
      selectedTaxes: (posTaxLines || []).map(function (t) {
        return { name: t.name, rate: t.rate, amount: t.amount };
      }),
      total: total,
    };
  }
  return {
    subTotal: subTotal,
    discount: disc,
    total: Math.max(0, subTotal - disc),
    totalTax: 0,
    selectedTaxes: [],
  };
}

export function mapCartLineToQuotationItem(it) {
  return {
    id: it.id,
    name: it.name,
    barcode: it.barcode || "",
    unit: it.unit || "Pcs",
    saleUnit: it.saleUnit || it.unit || "Pcs",
    qty: it.qty,
    price: it.price,
    description: it.description || "",
    comment: it.comment || "",
    commentLabel: it.commentLabel || "",
    customPrice: !!it.customPrice,
  };
}

export function quotationToPrintInv(q) {
  return {
    id: q.id,
    invoiceNo: q.quotationNo || q.id,
    date: q.date,
    customerName: q.customer || "",
    customerPhone: q.customerPhone || "",
    items: q.items || [],
    subTotal: q.subTotal != null ? q.subTotal : quotationLineSubtotal(q.items),
    discount: q.discount || 0,
    totalTax: q.totalTax || 0,
    selectedTaxes: q.selectedTaxes || [],
    total: q.total != null ? q.total : quotationGrandTotal(q, {}),
    paid: 0,
    quotationNotes: q.notes || "",
    quotationStatus: q.status || "Sent",
    cashier: q.createdBy || "",
  };
}
