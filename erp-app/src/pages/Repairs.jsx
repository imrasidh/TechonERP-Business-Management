import React, { useState } from "react";

var Repairs = function (props) {
  var state = props.state;
  var setState = props.setState;
  var today = props.today;
  var uid = props.uid;
  var tcTrialGuard = props.tcTrialGuard;
  var S = props.S;
  var addAudit = props.addAudit;
  var showAlert = props.showAlert;
  var getCurrencySymbol = props.getCurrencySymbol;
  var fmtNum = props.fmtNum;
  var escapeHtml = props.escapeHtml;
  var PRINT_FONT_LINK = props.PRINT_FONT_LINK;
  var C = props.C;
  var usePager = props.usePager;
  var fmtDate = props.fmtDate;
  var fmtDateFull = props.fmtDateFull;
  var Card = props.Card;
  var CardTitle = props.CardTitle;
  var Btn = props.Btn;
  var Input = props.Input;
  var TH = props.TH;
  var TR = props.TR;
  var TD = props.TD;
  var Pager = props.Pager;
  var Modal = props.Modal;
  var Sel = props.Sel;
  var shareViaWhatsApp = props.shareViaWhatsApp;
  var WABtn = props.WABtn;
  var BLANK = { customer: "", phone: "", deviceType: "Laptop", brand: "", modelNo: "", problem: "", description: "", estimatedCost: "", status: "Pending", dateIn: today(), dateOut: "", technician: "", accessories: "" };
  var [show, setShow] = useState(false);
  var [f, setF] = useState(BLANK);
  var [editR, setEditR] = useState(null);
  var [viewR, setViewR] = useState(null);
  var [custSearch, setCustSearch] = useState(function () {
    var pf = S.get("tc3_repair_prefill", null);
    return pf ? (pf.customerName || "") : "";
  });
  var [repCustDropIdx, setRepCustDropIdx] = useState(-1);
  var [deleteModal, setDeleteModal] = useState(null);
  var [deleteReason, setDeleteReason] = useState("");
  var [readyPrompt, setReadyPrompt] = useState(null);
  var [repairPrintModal, setRepairPrintModal] = useState(null);
  var [filterStatus, setFilterStatus] = useState("All");
  var [search, setSearch] = useState("");
  /* Repair service cost fields for Convert-to-Invoice prefill */
  var [servicePrice, setServicePrice] = useState("");
  var [serviceCost, setServiceCost] = useState("");
  var [convertModal, setConvertModal] = useState(null); /* repair object awaiting convert */

  var STATUSES = ["Pending", "Repairing", "Ready", "Delivered", "Cancelled"];
  var DEVICE_TYPES = ["Laptop", "Desktop", "Printer", "Monitor", "Phone", "Tablet", "Server", "Network Device", "Other"];
  var STATUS_COLORS = { Pending: C.blue, Repairing: C.amber, Ready: C.green, Delivered: C.muted, Cancelled: C.red };
  var STATUS_BG    = { Pending: "#e8f0fe", Repairing: "#fef3e2", Ready: "#e6f7f2", Delivered: "#f7f9ff", Cancelled: "#fde8ed" };
  var STATUS_ICONS = { Pending: "🕐", Repairing: "🔧", Ready: "✅", Delivered: "📦", Cancelled: "❌" };

  var filteredCusts = state.customers.filter(function (c) {
    return custSearch && (c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || "").includes(custSearch));
  });

  var saveNew = function () {
    if (!f.customer || !f.deviceType) return;
    var r = {
      id: uid(), date: today(), dateIn: f.dateIn || today(), dateOut: f.dateOut || "",
      customer: f.customer, phone: f.phone || "",
      deviceType: f.deviceType, brand: f.brand || "", modelNo: f.modelNo || "",
      problem: f.problem || "", description: f.description || "",
      estimatedCost: parseFloat(f.estimatedCost) || 0,
      technician: f.technician || "", accessories: f.accessories || "",
      status: f.status || "Pending"
    };
    if (!tcTrialGuard(state.repairs, 'repairs')) return null;
    var nr = state.repairs.concat([r]);
    S.set("tc3_repairs", nr);
    setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    setShow(false); setF(BLANK); setCustSearch("");
    return r; /* return for print usage */
  };

  var saveEdit = function (skipPrompt) {
    if (!editR) return;
    var orig = state.repairs.find(function (r) { return r.id === editR.id; });
    var nr = state.repairs.map(function (r) { return r.id === editR.id ? editR : r; });
    S.set("tc3_repairs", nr);
    if (orig && orig.status !== editR.status) {
      addAudit("Repair Status: " + orig.status + " → " + editR.status, editR.customer + " | " + editR.deviceType + " " + (editR.brand || ""));
    }
    setState(function (st) { return Object.assign({}, st, { repairs: nr }); });
    /* Prompt to invoice when status newly becomes Ready */
    if (!skipPrompt && orig && orig.status !== "Ready" && editR.status === "Ready") {
      setReadyPrompt(editR);
    }
    setEditR(null);
  };

  var doDelete = function () {
    if (!deleteModal || !deleteReason.trim()) return;
    var nr = state.repairs.filter(function (r) { return r.id !== deleteModal.id; });
    var log = (state.repairDeleteLog || []).concat([{ id: uid(), date: today(), repairId: deleteModal.id, customer: deleteModal.customer, device: deleteModal.deviceType + " " + deleteModal.brand, reason: deleteReason }]);
    S.set("tc3_repairs", nr); S.set("tc3_repairDeleteLog", log);
    setState(function (st) { return Object.assign({}, st, { repairs: nr, repairDeleteLog: log }); });
    setDeleteModal(null); setDeleteReason("");
  };

  /* ── Open the "Convert to Invoice" config modal ── */
  var openConvertModal = function (r) {
    if (r.status !== "Ready") { showAlert("Only repairs with status \"Ready\" can be converted to an invoice."); return; }
    setServicePrice(String(r.estimatedCost || ""));
    setServiceCost("");
    setConvertModal(r);
  };

  /* ── Actually send to POS with prefill data ── */
  var doConvertToInvoice = function () {
    var r = convertModal;
    if (!r) return;
    var custObj = state.customers.find(function (c) { return c.name === r.customer; });
    var svcPrice = parseFloat(servicePrice) || 0;
    var svcCost  = parseFloat(serviceCost) || 0;
    /* Build service line item — cost stored for profit calculation */
    var repairItem = {
      id: uid(),
      name: "Repair Service — " + r.deviceType + (r.brand ? " " + r.brand : "") + (r.modelNo ? " (" + r.modelNo + ")" : "") + (r.problem ? " | " + r.problem : ""),
      qty: 1, price: svcPrice, cost: svcCost, barcode: "", fromRepairId: r.id
    };
    var prefill = {
      customerName: r.customer,
      customerPhone: r.phone || "",
      customerId: custObj ? custObj.id : "",
      items: [repairItem],
      fromRepairId: r.id
    };
    S.set("tc3_repair_prefill", prefill);
    /* NOTE: Do NOT set status to Delivered here.
       The repair status is updated to Delivered only when the POS invoice is actually saved.
       See saveAndFinish() in POS — it checks fromRepairId and updates the repair. */
    setConvertModal(null);
    props.setActive("pos");
  };

  /* ── Shared repair job HTML builder ── */
  var buildRepairJobHtml = function (r, size) {
    var shopName = props.state.settings.shopName || "Techon Computers";
    var shopAddr = props.state.settings.address || "";
    var shopPhone = props.state.settings.phone || "";
    var isA5 = size === "a5";
    var W = isA5 ? "148mm" : "210mm";
    var fs = isA5 ? "11px" : "12.5px";
    var statusColor = STATUS_COLORS[r.status] || C.blue;
    var statusBg    = STATUS_BG[r.status]    || "#e8f0fe";
    var css = [
      "* { box-sizing: border-box; margin: 0; padding: 0; }",
      "body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; font-size: " + fs + "; color: #1a2444; width: " + W + "; margin: 8mm auto; }",
      ".header { background: linear-gradient(135deg, #0d1b3e 0%, #1a3580 100%); color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }",
      ".shop-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }",
      ".shop-sub { font-size: 10px; opacity: 0.75; margin-top: 2px; }",
      ".job-badge { background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 6px 14px; text-align: center; }",
      ".job-badge-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }",
      ".job-badge-id { font-size: 13px; font-weight: 800; font-family: monospace; letter-spacing: 0.05em; }",
      ".status-bar { background: " + statusBg + "; border: 1.5px solid " + statusColor + "44; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; }",
      ".status-pill { background: " + statusColor + "; color: #fff; padding: 3px 14px; border-radius: 20px; font-weight: 800; font-size: 11px; letter-spacing: 0.04em; }",
      ".section { padding: 12px 16px; border-bottom: 1px solid #e8eeff; }",
      ".section-title { font-size: 9px; font-weight: 700; color: #6b82a8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }",
      ".grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }",
      ".grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }",
      ".field { background: #f7f9ff; border-radius: 6px; padding: 7px 10px; }",
      ".field-label { font-size: 9px; color: #8fa3c8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }",
      ".field-val { font-weight: 700; font-size: 13px; color: #0d1b3e; }",
      ".field-val.accent { color: #2255d4; }",
      ".field-val.green { color: #0f9e6e; }",
      ".problem-box { background: #fff8e1; border: 1.5px solid #fcd34d; border-radius: 8px; padding: 10px 14px; }",
      ".desc-box { background: #f0f4ff; border-radius: 8px; padding: 10px 14px; }",
      ".footer { padding: 10px 16px; text-align: center; font-size: 9px; color: #8fa3c8; }",
      ".sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 12px 16px; }",
      ".sig-box { border-top: 2px dashed #c8d8f0; padding-top: 8px; text-align: center; font-size: 9px; color: #8fa3c8; text-transform: uppercase; letter-spacing: 0.06em; }",
      ".divider { border-top: 2px dashed #e1e8f5; margin: 0 16px; }",
      "@media print { body { margin: 5mm auto; } }"
    ].join("\n");

    var body = "<style>" + css + "</style>";
    body += "<div class='header'>";
    body += "  <div><div class='shop-name'>" + escapeHtml(shopName) + "</div><div class='shop-sub'>" + escapeHtml(shopAddr) + (shopPhone ? " &middot; " + escapeHtml(shopPhone) : "") + "</div></div>";
    body += "  <div class='job-badge'><div class='job-badge-title'>Job Card</div><div class='job-badge-id'>#" + r.id.slice(0, 8).toUpperCase() + "</div></div>";
    body += "</div>";
    body += "<div class='status-bar'>";
    body += "  <span style='font-size:11px;font-weight:600;color:#3d5280;'>Date In: <strong>" + (r.dateIn || r.date) + "</strong>" + (r.dateOut ? " &nbsp;|&nbsp; Expected: <strong>" + r.dateOut + "</strong>" : "") + "</span>";
    body += "  <span class='status-pill'>" + STATUS_ICONS[r.status] + " " + (r.status || "Pending") + "</span>";
    body += "</div>";
    body += "<div class='section'><div class='section-title'>Customer &amp; Device</div><div class='grid2'>";
    body += "<div class='field'><div class='field-label'>Customer</div><div class='field-val'>" + escapeHtml(r.customer) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Phone</div><div class='field-val'>" + (r.phone || "—") + "</div></div>";
    body += "<div class='field'><div class='field-label'>Device Type</div><div class='field-val accent'>" + escapeHtml(r.deviceType) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Brand &amp; Model</div><div class='field-val'>" + (r.brand || "—") + " " + (r.modelNo || "") + "</div></div>";
    body += "</div></div>";
    body += "<div class='section'><div class='section-title'>Job Details</div><div class='grid3'>";
    body += "<div class='field'><div class='field-label'>Date Received</div><div class='field-val'>" + (r.dateIn || r.date) + "</div></div>";
    body += "<div class='field'><div class='field-label'>Est. Completion</div><div class='field-val'>" + (r.dateOut || "—") + "</div></div>";
    body += "<div class='field'><div class='field-label'>Est. Cost</div><div class='field-val green'>" + getCurrencySymbol() + " " + Number(r.estimatedCost || r.cost || 0).toLocaleString() + "</div></div>";
    if (r.technician) { body += "<div class='field'><div class='field-label'>Technician</div><div class='field-val'>" + escapeHtml(r.technician) + "</div></div>"; }
    body += "</div></div>";
    body += "<div class='section'><div class='section-title'>Problem Reported</div><div class='problem-box'><strong>" + escapeHtml(r.problem) + "</strong></div></div>";
    if (r.description) { body += "<div class='section'><div class='section-title'>Additional Notes</div><div class='desc-box' style='font-size:11px;line-height:1.6'>" + escapeHtml(r.description) + "</div></div>"; }
    if (r.accessories) { body += "<div class='section'><div class='section-title'>Accessories / Items Received</div><div class='desc-box' style='font-size:11px'>" + escapeHtml(r.accessories) + "</div></div>"; }
    body += "<div class='sig-row'><div class='sig-box'>Customer Signature</div><div class='sig-box'>Technician / Staff</div></div>";
    body += "<div class='divider'></div><div class='footer'>Printed: " + new Date().toLocaleString() + " &middot; " + escapeHtml(shopName) + "</div>";
    return body;
  };

  /* ── Enhanced job card print ── */
  var printRepairJob = function (r, size) {
    var body = buildRepairJobHtml(r, size);
    var w = window.open("", "_blank", "width=900,height=780");
    if (!w) return;
    w.document.write("<!DOCTYPE html><html><head>" + PRINT_FONT_LINK + "<title>Repair Job Card</title></head><body>" + body + "</body></html>");
    w.document.close();
    setTimeout(function () { w.print(); }, 400);
  };

  var whatsappRepairJob = function (r, size) {
    var body = buildRepairJobHtml(r, size);
    var filename = "RepairJob-" + r.id.slice(0, 8).toUpperCase();
    shareViaWhatsApp(body, filename, r.phone || "");
  };

  var filtered = state.repairs.slice().reverse().filter(function (r) {
    var matchS = filterStatus === "All" || r.status === filterStatus;
    var q = search.toLowerCase();
    var matchQ = !q || r.customer.toLowerCase().includes(q) || (r.brand || "").toLowerCase().includes(q) || (r.modelNo || "").toLowerCase().includes(q) || (r.problem || "").toLowerCase().includes(q);
    return matchS && matchQ;
  });

  var repPager = usePager(filtered, 50);
  var SC = STATUS_COLORS;
  var SB = STATUS_BG;

  return (
    <div className="erp-page" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Status Counter Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        {STATUSES.map(function (s) {
          var count = state.repairs.filter(function (r) { return r.status === s; }).length;
          var active = filterStatus === s;
          return (
            <div key={s} onClick={function () { setFilterStatus(active ? "All" : s); }}
              style={{ background: active ? SC[s] + "18" : "#fff", borderRadius: 12, padding: "14px 12px", border: "2px solid " + (active ? SC[s] : C.border), textAlign: "center", cursor: "pointer", transition: "all .15s", boxShadow: active ? "0 4px 16px " + SC[s] + "33" : C.shadowCard }}>
              <div style={{ fontSize: 26, marginBottom: 2 }}>{STATUS_ICONS[s]}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: SC[s] || C.blue, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 11, color: active ? SC[s] : C.muted, fontWeight: 700, marginTop: 3 }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* ── Main Table ── */}
      <Card>
        <CardTitle sub={filtered.length.toLocaleString() + " repairs"} action={<Btn sm col="blue" onClick={function () { setShow(true); setCustSearch(""); setF(BLANK); }}>+ New Repair Job</Btn>}>Repair Jobs</CardTitle>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 2 }}><Input value={search} onChange={function (e) { setSearch(e.target.value); }} placeholder="Search customer, brand, model, problem..." /></div>
          <div style={{ flex: 1 }}>
            <select value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value); }} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit" }}>
              <option value="All">All Status</option>
              {STATUSES.map(function (s) { return <option key={s}>{s}</option>; })}
            </select>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f7f9ff" }}><TH>Date In</TH><TH>Customer</TH><TH>Device</TH><TH>Brand / Model</TH><TH>Problem</TH><TH>Est. Cost</TH><TH>Status</TH><TH>Actions</TH></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: C.muted }}>No repair jobs found</td></tr>}
              {repPager.slice.map(function (r, i) {
                var isReady = r.status === "Ready";
                return (
                  <TR key={r.id} i={i}>
                    <TD>{fmtDate(r.dateIn || r.date)}</TD>
                    <TD bold>{r.customer}</TD>
                    <TD><span style={{ background: C.accentSoft, color: C.accent, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{r.deviceType}</span></TD>
                    <TD>{r.brand}{r.modelNo ? " — " + r.modelNo : ""}</TD>
                    <TD>{r.problem}</TD>
                    <TD bold color={C.blue}>{getCurrencySymbol()} {fmtNum(r.estimatedCost || r.cost || 0)}</TD>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ background: SB[r.status] || "#f7f9ff", color: SC[r.status] || C.blue, border: "1.5px solid " + (SC[r.status] || C.blue) + "44", padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>
                        {STATUS_ICONS[r.status]} {r.status || "Pending"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Btn sm col="gray" onClick={function () { setViewR(r); }}>View</Btn>
                        <Btn sm col="blue" onClick={function () { setEditR(Object.assign({}, r)); }}>Edit</Btn>
                        {/* Invoice button ONLY shown when status is Ready */}
                        {isReady && (
                          <Btn sm col="green" onClick={function () { openConvertModal(r); }}>📄 Invoice</Btn>
                        )}
                        <Btn sm col="red" onClick={function () { setDeleteModal(r); setDeleteReason(""); }}>Del</Btn>
                      </div>
                    </td>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager pager={repPager} />
      </Card>

      {/* ── Deleted Repairs Log ── */}
      {(state.repairDeleteLog || []).length > 0 && (
        <Card>
          <CardTitle sub="Deleted repair records with reasons">Deleted Repairs History</CardTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#fff5f5" }}><TH>Deleted On</TH><TH>Customer</TH><TH>Device</TH><TH>Reason</TH></tr></thead>
            <tbody>
              {(state.repairDeleteLog || []).slice().reverse().map(function (l, i) {
                return <TR key={l.id} i={i}><TD>{fmtDateFull(l.date)}</TD><TD bold>{l.customer}</TD><TD>{l.device}</TD><TD>{l.reason}</TD></TR>;
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── NEW REPAIR MODAL ── */}
      {show && (
        <Modal title="🔧 New Repair Job" onClose={function () { setShow(false); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Info banner */}
            <div style={{ background: "#e8f0fe", border: "1.5px solid #2255d430", borderRadius: 9, padding: "10px 14px", fontSize: 12.5, color: C.blue, fontWeight: 600 }}>
              📋 This creates a device tracking ticket. Revenue is recorded only when you convert this job to a Sales Invoice.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Input label="Customer Name" value={custSearch}
                  onChange={function (e) { setCustSearch(e.target.value); setF(function (x) { return Object.assign({}, x, { customer: e.target.value, phone: "" }); }); setRepCustDropIdx(-1); }}
                  onKeyDown={function (e) {
                    var list = filteredCusts;
                    if (e.key === "ArrowDown") { e.preventDefault(); setRepCustDropIdx(function (i) { return Math.min(i + 1, list.length - 1); }); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setRepCustDropIdx(function (i) { return Math.max(i - 1, -1); }); return; }
                    if (e.key === "Enter" && repCustDropIdx >= 0 && list[repCustDropIdx]) {
                      var c = list[repCustDropIdx]; setCustSearch(c.name); setF(function (x) { return Object.assign({}, x, { customer: c.name, phone: c.phone || "" }); }); setRepCustDropIdx(-1); e.preventDefault(); return;
                    }
                    if (e.key === "Escape") { setRepCustDropIdx(-1); }
                  }}
                  onFocus={function () { setRepCustDropIdx(-1); }}
                  onBlur={function () { setTimeout(function () { setRepCustDropIdx(-2); }, 180); }}
                  placeholder="Type to search or enter new..." />
                {custSearch && filteredCusts.length > 0 && repCustDropIdx !== -2 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid " + C.border, borderRadius: 8, zIndex: 50, maxHeight: 160, overflowY: "auto", boxShadow: "0 8px 24px rgba(13,27,62,0.12)" }}>
                    {filteredCusts.map(function (c, ridx) {
                      return <div key={c.id} onMouseDown={function (e) { e.preventDefault(); setCustSearch(c.name); setF(function (x) { return Object.assign({}, x, { customer: c.name, phone: c.phone || "" }); }); setRepCustDropIdx(-2); }} onMouseEnter={function () { setRepCustDropIdx(ridx); }} onMouseLeave={function () { setRepCustDropIdx(-1); }} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f0f4ff", display: "flex", justifyContent: "space-between", background: repCustDropIdx === ridx ? C.accentSoft : "#fff" }}><span style={{ fontWeight: 600 }}>{c.name}</span><span style={{ color: C.muted }}>{c.phone}</span></div>;
                    })}
                  </div>
                )}
              </div>
              <Input label="Phone" value={f.phone} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} placeholder="+94 7X XXX XXXX" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <Sel label="Device Type" value={f.deviceType} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { deviceType: e.target.value }); }); }}>{DEVICE_TYPES.map(function (d) { return <option key={d}>{d}</option>; })}</Sel>
              <Input label="Brand (e.g. Dell, HP)" value={f.brand} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { brand: e.target.value }); }); }} placeholder="Dell, HP, Lenovo..." />
              <Input label="Model Number" value={f.modelNo} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { modelNo: e.target.value }); }); }} placeholder="e.g. Latitude 5400" />
            </div>
            <Input label="Problem (short title)" value={f.problem} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { problem: e.target.value }); }); }} placeholder="e.g. Screen broken, Not powering on..." />
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Full Description / Notes</label>
              <textarea value={f.description} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Detailed description, physical condition, accessories included, etc." />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <Input label="Date Received" type="date" value={f.dateIn} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { dateIn: e.target.value }); }); }} />
              <Input label="Expected Date Out" type="date" value={f.dateOut} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { dateOut: e.target.value }); }); }} />
              <Input label="Estimated Cost (Rs)" type="number" value={f.estimatedCost} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { estimatedCost: e.target.value }); }); }} />
              <Input label="Technician (optional)" value={f.technician} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { technician: e.target.value }); }); }} placeholder="Assigned technician" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Accessories / Items Received</label>
              <textarea value={f.accessories} onChange={function (e) { setF(function (x) { return Object.assign({}, x, { accessories: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="e.g. Charger, Bag, Mouse — list accessories received with device" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Btn col="blue" onClick={function () { saveNew(); }} disabled={!f.customer || !f.deviceType}>Save Only</Btn>
              <Btn col="cyan" onClick={function () { var tmp = Object.assign({}, f, { id: uid(), date: today(), estimatedCost: parseFloat(f.estimatedCost) || 0 }); setRepairPrintModal(tmp); saveNew(); }} disabled={!f.customer || !f.deviceType}>Save + Print A4</Btn>
              <Btn col="purple" onClick={function () { var tmp = Object.assign({}, f, { id: uid(), date: today(), estimatedCost: parseFloat(f.estimatedCost) || 0 }); printRepairJob(tmp, "a5"); saveNew(); }} disabled={!f.customer || !f.deviceType}>Save + Print A5</Btn>
              <Btn col="gray" onClick={function () { setShow(false); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── VIEW REPAIR MODAL ── */}
      {viewR && (
        <Modal title={"🔧 Repair Job — " + viewR.customer} onClose={function () { setViewR(null); }} wide>
          {/* Header strip */}
          <div style={{ background: "linear-gradient(135deg, #0d1b3e, #1a3580)", borderRadius: 10, padding: "16px 20px", color: "#fff", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{viewR.customer}</div>
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{viewR.phone}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ background: SC[viewR.status] || C.blue, padding: "4px 14px", borderRadius: 20, fontWeight: 800, fontSize: 12, display: "inline-block" }}>
                {STATUS_ICONS[viewR.status]} {viewR.status || "Pending"}
              </div>
              <div style={{ opacity: 0.6, fontSize: 10, marginTop: 4 }}>Job #{viewR.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
          {/* Detail grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              ["Device", viewR.deviceType, C.accent],
              ["Brand / Model", (viewR.brand || "—") + " " + (viewR.modelNo || ""), C.text],
              ["Est. Cost", getCurrencySymbol() + " " + fmtNum(viewR.estimatedCost || viewR.cost || 0), C.green],
              ["Date In", fmtDateFull(viewR.dateIn || viewR.date), C.text],
              ["Expected Out", viewR.dateOut ? fmtDateFull(viewR.dateOut) : "—", C.text],
              ["Technician", viewR.technician || "—", C.text],
            ].map(function (x, i) {
              return (
                <div key={i} style={{ background: "#f7f9ff", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{x[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: x[2] }}>{x[1]}</div>
                </div>
              );
            })}
          </div>
          {/* Problem */}
          <div style={{ background: "#fff8e1", border: "1.5px solid #fcd34d", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Problem Reported</div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{viewR.problem}</div>
          </div>
          {viewR.description && (
            <div style={{ background: "#f0f4ff", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Notes / Description</div>
              <div style={{ color: C.textMd, fontSize: 13, lineHeight: 1.6 }}>{viewR.description}</div>
            </div>
          )}
          {viewR.accessories && (
            <div style={{ background: "#f0f4ff", borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Accessories Received</div>
              <div style={{ color: C.textMd, fontSize: 13 }}>{viewR.accessories}</div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <Btn col="blue" onClick={function () { setViewR(null); setEditR(Object.assign({}, viewR)); }}>✏️ Edit</Btn>
            {/* Convert to Invoice only available when Ready */}
            {viewR.status === "Ready" && (
              <Btn col="green" onClick={function () { setViewR(null); openConvertModal(viewR); }}>📄 Convert to Invoice</Btn>
            )}
            <Btn col="cyan" onClick={function () { printRepairJob(viewR, "a4"); }}>🖨 Print A4</Btn>
            <Btn col="purple" onClick={function () { printRepairJob(viewR, "a5"); }}>🖨 Print A5</Btn>
            <WABtn title="Share Job Card via WhatsApp" onClick={function () { whatsappRepairJob(viewR, "a4"); }} />
            <Btn col="gray" onClick={function () { setViewR(null); }}>Close</Btn>
          </div>
        </Modal>
      )}

      {/* ── EDIT REPAIR MODAL ── */}
      {editR && (
        <Modal title={"Edit Repair — " + editR.customer} onClose={function () { setEditR(null); }} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <Input label="Customer" value={editR.customer} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { customer: e.target.value }); }); }} />
              <Input label="Phone" value={editR.phone || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { phone: e.target.value }); }); }} />
              <Sel label="Device Type" value={editR.deviceType || "Laptop"} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { deviceType: e.target.value }); }); }}>{DEVICE_TYPES.map(function (d) { return <option key={d}>{d}</option>; })}</Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Brand" value={editR.brand || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { brand: e.target.value }); }); }} />
              <Input label="Model No." value={editR.modelNo || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { modelNo: e.target.value }); }); }} />
            </div>
            <Input label="Problem" value={editR.problem || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { problem: e.target.value }); }); }} />
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Description / Notes</label>
              <textarea value={editR.description || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { description: e.target.value }); }); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Accessories</label>
              <textarea value={editR.accessories || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { accessories: e.target.value }); }); }} rows={2} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              <Input label="Date In" type="date" value={editR.dateIn || editR.date} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { dateIn: e.target.value }); }); }} />
              <Input label="Date Out" type="date" value={editR.dateOut || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { dateOut: e.target.value }); }); }} />
              <Input label="Est. Cost (Rs)" type="number" value={editR.estimatedCost !== undefined ? editR.estimatedCost : (editR.cost || "")} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { estimatedCost: parseFloat(e.target.value) || 0 }); }); }} />
              <Input label="Technician" value={editR.technician || ""} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { technician: e.target.value }); }); }} />
              <Sel label="Status" value={editR.status || "Pending"} onChange={function (e) { setEditR(function (x) { return Object.assign({}, x, { status: e.target.value }); }); }}>{STATUSES.map(function (s) { return <option key={s}>{s}</option>; })}</Sel>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn col="cyan" onClick={saveEdit}>Save Changes</Btn>
              <Btn col="gray" onClick={function () { setEditR(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── READY PROMPT (after status→Ready) ── */}
      {readyPrompt && (
        <Modal title={"✅ Repair Ready — " + readyPrompt.customer} onClose={function () { setReadyPrompt(null); }}>
          <div style={{ background: C.successSoft, border: "1px solid #9ee8ce", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.green, marginBottom: 4 }}>✅ Repair marked as Ready!</div>
            <div style={{ fontSize: 13, color: C.textMd }}>{readyPrompt.deviceType} {readyPrompt.brand} {readyPrompt.modelNo} — {readyPrompt.customer}</div>
            <div style={{ fontWeight: 700, color: C.blue, marginTop: 4 }}>Est. Cost: {getCurrencySymbol()} {fmtNum(readyPrompt.estimatedCost || readyPrompt.cost || 0)}</div>
          </div>
          <div style={{ fontSize: 13, color: C.textMd, marginBottom: 14 }}>Would you like to create a Sales Invoice for this repair now?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="green" onClick={function () { openConvertModal(readyPrompt); setReadyPrompt(null); }}>📄 Yes — Create Invoice</Btn>
            <Btn col="gray" onClick={function () { setReadyPrompt(null); }}>Later</Btn>
          </div>
        </Modal>
      )}

      {/* ── CONVERT TO INVOICE MODAL ── */}
      {convertModal && (
        <Modal title={"📄 Convert to Sales Invoice — " + convertModal.customer} onClose={function () { setConvertModal(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Repair summary */}
            <div style={{ background: "#f7f9ff", border: "1.5px solid " + C.border, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Repair Summary</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{convertModal.customer} — {convertModal.deviceType} {convertModal.brand} {convertModal.modelNo}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{convertModal.problem}</div>
            </div>
            {/* Service pricing */}
            <div style={{ background: "#e6f7f2", border: "1px solid #9ee8ce", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Repair Service Charge</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <Input label="Service Price (charged to customer)" type="number" value={servicePrice} onChange={function (e) { setServicePrice(e.target.value); }} placeholder="e.g. 5000" />
                </div>
                <div>
                  <Input label="Internal Service Cost (optional, for profit calc)" type="number" value={serviceCost} onChange={function (e) { setServiceCost(e.target.value); }} placeholder="e.g. 2000" />
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#065f46", marginTop: 8, fontWeight: 500 }}>
                💡 You can also add inventory parts (e.g. Display, Battery) directly in the POS invoice after this step.
              </div>
              {servicePrice && serviceCost && parseFloat(servicePrice) > parseFloat(serviceCost) && (
                <div style={{ marginTop: 8, padding: "6px 12px", background: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 700, color: C.green }}>
                  Repair Profit: {getCurrencySymbol()} {fmtNum(parseFloat(servicePrice) - parseFloat(serviceCost))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              ℹ️ After clicking <strong>Open Invoice</strong>, the POS will open pre-filled with this repair's customer and service line. You can add inventory parts there.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn col="green" onClick={doConvertToInvoice} disabled={!servicePrice || parseFloat(servicePrice) <= 0}>📄 Open Invoice</Btn>
              <Btn col="gray" onClick={function () { setConvertModal(null); }}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── PRINT FORMAT MODAL ── */}
      {repairPrintModal && (
        <Modal title="🖨 Print Repair Job Card" onClose={function () { setRepairPrintModal(null); }}>
          <div style={{ fontSize: 13, color: C.textMd, marginBottom: 14 }}>Choose print format for the repair job card:</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="blue" onClick={function () { printRepairJob(repairPrintModal, "a4"); setRepairPrintModal(null); }}>Print A4</Btn>
            <Btn col="cyan" onClick={function () { printRepairJob(repairPrintModal, "a5"); setRepairPrintModal(null); }}>Print A5</Btn>
            <WABtn title="Share via WhatsApp" onClick={function () { whatsappRepairJob(repairPrintModal, "a4"); setRepairPrintModal(null); }} />
            <Btn col="gray" onClick={function () { setRepairPrintModal(null); }}>Skip</Btn>
          </div>
        </Modal>
      )}

      {/* ── DELETE MODAL ── */}
      {deleteModal && (
        <Modal title={"Delete Repair — " + deleteModal.customer} onClose={function () { setDeleteModal(null); }}>
          <div style={{ background: "#fde8ed", border: "1px solid #f9a8ba", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#c0152e" }}>
            This will permanently delete this repair record. This action is logged.
          </div>
          <div style={{ marginBottom: 6, fontSize: 13 }}>
            <strong>{deleteModal.customer}</strong> — {deleteModal.deviceType} {deleteModal.brand} {deleteModal.modelNo}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 }}>Reason for Deletion (required)</label>
            <textarea value={deleteReason} onChange={function (e) { setDeleteReason(e.target.value); }} rows={3} style={{ width: "100%", border: "1.5px solid " + C.border, borderRadius: 8, padding: "9px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} placeholder="Enter reason for deletion..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn col="red" onClick={doDelete} disabled={!deleteReason.trim()}>Confirm Delete</Btn>
            <Btn col="gray" onClick={function () { setDeleteModal(null); }}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Repairs;
