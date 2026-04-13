import { useState, useEffect } from "react";

const goto = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

/* ─── LOGO SVG ──────────────────────────────────────────────────── */
const LOGO_SRC = "data:image/png;base64,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";
const TechonLogo = ({ size = 40 }) => (
  <img src={LOGO_SRC} width={size} height={size} alt="TechonERP Logo" style={{borderRadius:"22%",display:"block"}}/>
);

/* ─── SHARED APP UI COMPONENTS ──────────────────────────────────── */
const AppSidebar = ({ active }) => {
  const groups = [
    { s:"MAIN", links:["Dashboard","Sales","Invoices"] },
    { s:"STOCK", links:["Purchases","Inventory"] },
    { s:"PEOPLE", links:["Customers","Suppliers"] },
    { s:"FINANCE", links:["Receivables","Payables","Accounts","Cheques"] },
    { s:"OPS", links:["Repairs","Expenses","Returns"] },
    { s:"INSIGHT", links:["Reports","Barcodes","Audit Log","Settings"] },
  ];
  return (
    <div className="w-36 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-100">
        <img src={LOGO_SRC} alt="TechonERP" style={{width:28,height:28,borderRadius:"22%",flexShrink:0,display:"block"}}/>
        <div><p className="font-black text-gray-900 text-[9px] leading-tight">Techon</p><p className="text-[7px] text-gray-400">ERP SYSTEM</p></div>
      </div>
      <div className="flex-1 overflow-hidden py-1">
        {groups.map(g => (
          <div key={g.s}>
            <p className="px-3 pt-1.5 pb-0.5 text-[7px] text-gray-400 font-bold tracking-widest">{g.s}</p>
            {g.links.map(l => (
              <div key={l} className={`flex items-center gap-1.5 mx-1 px-2 py-1 rounded-lg cursor-default ${active===l?"bg-indigo-600 text-white":"text-gray-600"}`}>
                <div className={`w-1 h-1 rounded-full flex-shrink-0 ${active===l?"bg-white":"bg-gray-300"}`}/>
                <span className="text-[8px] font-medium truncate">{l}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="px-2 py-2 border-t border-gray-100 flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[7px] font-bold flex-shrink-0">R</div>
        <div><p className="text-[7px] font-bold text-gray-800">Rashid</p><p className="text-[6px] text-gray-400">ADMIN MODE</p></div>
      </div>
    </div>
  );
};

const AppTopBar = ({ title }) => (
  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white flex-shrink-0">
    <div className="flex items-center gap-1.5">
      <div className="w-4 h-4 rounded bg-indigo-100 flex items-center justify-center"><div className="w-2 h-2 bg-indigo-500 rounded-sm"/></div>
      <span className="font-bold text-gray-800 text-[10px]">{title}</span>
    </div>
    <div className="flex items-center gap-1.5">
      <div className="text-[7px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full hidden sm:flex items-center gap-0.5">📋 Backup <span className="bg-amber-500 text-white px-1 rounded ml-0.5">Now</span></div>
      <div className="text-[7px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full">🔒 ADMIN</div>
      <div className="text-[7px] text-gray-400">Mar 23</div>
      <div className="text-[7px] bg-green-50 border border-green-200 text-green-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-green-500 inline-block"/>Online</div>
    </div>
  </div>
);

const SCard = ({ label, value, sub, color="blue" }) => {
  const t = {blue:"border-t-blue-500",violet:"border-t-violet-500",green:"border-t-green-500",orange:"border-t-orange-500",red:"border-t-red-400",indigo:"border-t-indigo-500"};
  return (
    <div className={`bg-white rounded-lg border border-gray-100 border-t-2 ${t[color]} p-2.5`}>
      <p className="text-[7px] text-gray-400 uppercase tracking-wide font-semibold leading-tight">{label}</p>
      <p className="text-xs font-black text-gray-800 mt-0.5 leading-tight">{value}</p>
      {sub && <p className="text-[6px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  );
};

/* ── DASHBOARD ── */
const DashboardScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Dashboard"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Dashboard"/>
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        <div className="grid grid-cols-4 gap-2">
          <SCard label="TOTAL CASH" value="Rs 84,500" sub="Cash: 52k | Bank: 32.5k" color="orange"/>
          <SCard label="STOCK VALUE" value="Rs 265,900" sub="Low stock: 2" color="violet"/>
          <SCard label="TODAY SALES" value="Rs 18,200" sub="Mar 23" color="green"/>
          <SCard label="TODAY PROFIT" value="Rs 4,650" sub="+32% vs yesterday" color="blue"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SCard label="RECEIVABLES" value="Rs 12,400" sub="3 pending" color="indigo"/>
          <SCard label="PAYABLES" value="Rs 6,800" sub="2 pending" color="red"/>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-3 bg-white rounded-lg border border-gray-100 p-2">
            <div className="flex justify-between mb-1.5">
              <p className="text-[8px] font-bold text-gray-800">Recent Sales</p>
              <span className="text-[7px] text-indigo-600">View All →</span>
            </div>
            {[["INV-20260323-001","Nimal","Rs 12,500","Paid"],["INV-20260323-002","Walk-in","Rs 4,200","Paid"],["INV-20260322-018","Ravi","Rs 8,750","Paid"]].map(([id,c,a,s])=>(
              <div key={id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                <span className="text-[7px] text-indigo-500 font-mono truncate">{id}</span>
                <span className="text-[7px] text-gray-500">{c}</span>
                <span className="text-[7px] font-bold text-gray-700">{a}</span>
                <span className="text-[6px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">{s}</span>
              </div>
            ))}
          </div>
          <div className="col-span-2 bg-white rounded-lg border border-gray-100 p-2">
            <p className="text-[8px] font-bold text-gray-800 mb-1">Low Stock Products</p>
            {[["Dell Latitude 5400","3 left"],["Kingston 256GB SSD","5 left"]].map(([n,s])=>(
              <div key={n} className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-[7px] text-gray-700 truncate">{n}</span>
                <span className="text-[7px] font-bold text-yellow-600 ml-1">{s}</span>
              </div>
            ))}
            <p className="text-[6px] text-green-600 mt-1">✅ No out-of-stock items!</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ── SALES ── */
const SalesScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Sales"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Sales"/>
      <div className="flex-1 overflow-hidden p-2.5">
        <div className="grid grid-cols-3 gap-2.5 h-full">
          <div className="col-span-2 bg-white rounded-lg border border-gray-100 p-3 space-y-2.5 overflow-hidden">
            <div><p className="text-[10px] font-black text-gray-800">New Sale</p><p className="text-[7px] text-gray-400">Invoice: INV-20260324-000917</p></div>
            <div>
              <p className="text-[7px] text-gray-500 uppercase font-semibold mb-1">Customer</p>
              <div className="flex gap-1 mb-1.5">
                {["Existing","New","Walk-in"].map((t,i)=>(
                  <button key={t} className={`text-[7px] px-2 py-0.5 rounded-full border ${i===0?"bg-indigo-600 text-white border-indigo-600":"border-gray-200 text-gray-500"}`}>{t}</button>
                ))}
              </div>
              <div className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[7px] text-gray-400">Search customer...</div>
            </div>
            <div>
              <p className="text-[7px] text-gray-500 uppercase font-semibold mb-1">Add Product (Name or Barcode)</p>
              <div className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[7px] text-gray-400">Type name, barcode, or scan...</div>
            </div>
            <div className="border-t border-gray-100 pt-2">
              <div className="flex justify-between text-[6px] text-gray-400 pb-1 uppercase">
                <span className="flex-1">Product</span><span className="w-8 text-center">Qty</span><span className="w-14 text-right">Price</span><span className="w-14 text-right">Total</span>
              </div>
              {[["Samsung Galaxy A54","1","Rs 89,500","Rs 89,500"],["Screen Guard (A54)","2","Rs 350","Rs 700"]].map(([p,q,pr,t])=>(
                <div key={p} className="flex items-center py-1 border-b border-gray-50">
                  <span className="text-[7px] text-gray-700 flex-1 truncate">{p}</span>
                  <span className="text-[7px] text-gray-500 w-8 text-center">{q}</span>
                  <span className="text-[7px] text-gray-600 w-14 text-right">{pr}</span>
                  <span className="text-[7px] font-bold text-gray-800 w-14 text-right">{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-3 flex flex-col gap-2">
            <div className="bg-indigo-50 rounded-lg p-2 text-center">
              <p className="text-[7px] text-indigo-600 font-semibold">TOTAL</p>
              <p className="text-lg font-black text-gray-800">Rs 90,200</p>
            </div>
            <span className="text-[7px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold text-center">✅ Fully Paid</span>
            <button className="w-full bg-green-500 text-white text-[8px] font-bold py-1.5 rounded-lg">💰 Pay</button>
            <button className="w-full bg-indigo-600 text-white text-[7px] py-1.5 rounded-lg">Save Only</button>
            <button className="w-full border border-gray-200 text-gray-600 text-[7px] py-1.5 rounded-lg">Save + A4</button>
            <button className="w-full border border-gray-200 text-gray-600 text-[7px] py-1.5 rounded-lg">⟿ Save + Thermal (80mm)</button>
            <div className="flex items-center gap-1 p-1.5 bg-blue-50 rounded-lg mt-auto">
              <input type="checkbox" className="w-2 h-2" readOnly/>
              <span className="text-[6px] text-gray-600">Include Warranty Policy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ── INVENTORY ── */
const InventoryScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Inventory"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Inventory"/>
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        <div className="grid grid-cols-4 gap-2">
          <SCard label="TOTAL PRODUCTS" value="5" sub="37 units in stock" color="blue"/>
          <SCard label="RETAIL STOCK VALUE" value="Rs 265,900" sub="Cost: Rs 209,300" color="violet"/>
          <SCard label="POTENTIAL PROFIT" value="Rs 56,600" sub="Avg margin: 32%" color="green"/>
          <SCard label="OUT OF STOCK" value="0" sub="2 low stock" color="orange"/>
        </div>
        <div className="flex gap-1 border-b border-gray-200 items-center">
          {["Overview","Products","Damaged","Log"].map((t,i)=>(
            <span key={t} className={`text-[7px] px-2 py-1 cursor-default ${i===0?"border-b-2 border-indigo-600 text-indigo-700 font-bold":"text-gray-500"}`}>{t}</span>
          ))}
          <button className="ml-auto text-[7px] bg-indigo-600 text-white px-2 py-0.5 rounded mb-0.5">+ Add Product</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[8px] font-bold text-gray-700 mb-1.5">Stock Value Breakdown</p>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[["Rs 265,900","Retail","text-indigo-600"],["Rs 209,300","Cost","text-gray-600"],["Rs 56,600","Gross Profit","text-green-600"],["Rs 0","Damaged","text-orange-500"]].map(([v,l,c])=>(
                <div key={l} className="border border-gray-100 rounded p-1.5">
                  <p className={`text-[9px] font-black ${c}`}>{v}</p>
                  <p className="text-[6px] text-gray-400">{l}</p>
                </div>
              ))}
            </div>
            <p className="text-[7px] font-bold text-gray-700 mb-1">Category Overview</p>
            <table className="w-full">
              <thead><tr className="text-[6px] text-gray-400 border-b border-gray-100">
                <th className="text-left py-0.5 font-semibold">CATEGORY</th><th className="text-right font-semibold">UNITS</th><th className="text-right font-semibold">RETAIL</th><th className="text-right font-semibold">PROFIT</th><th className="text-right font-semibold">MARGIN</th>
              </tr></thead>
              <tbody>
                {[["Accessories","bg-blue-100 text-blue-700","12","Rs 10,800","Rs 3,600","33%"],["Components","bg-purple-100 text-purple-700","14","Rs 82,000","Rs 29,500","36%"],["Laptops","bg-gray-100 text-gray-600","3","Rs 163,500","Rs 19,500","12%"],["Peripherals","bg-orange-100 text-orange-700","8","Rs 9,600","Rs 4,000","42%"]].map(([cat,cls,u,r,p,m])=>(
                  <tr key={cat} className="border-b border-gray-50">
                    <td className="py-0.5"><span className={`text-[6px] px-1 py-0.5 rounded font-semibold ${cls}`}>{cat}</span></td>
                    <td className="text-right text-[7px]">{u}</td>
                    <td className="text-right text-[7px] font-semibold text-indigo-600">{r}</td>
                    <td className="text-right text-[7px] text-green-600">{p}</td>
                    <td className="text-right text-[7px] font-bold text-gray-700">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[8px] font-bold text-gray-700 mb-2">Stock Health</p>
            {[["In Stock","3 (60%)","60","bg-green-500"],["Low Stock (≤5)","2 (40%)","40","bg-yellow-400"],["Out of Stock","0 (0%)","0","bg-gray-200"],["Has Damage","0 (0%)","0","bg-gray-200"]].map(([l,v,w,c])=>(
              <div key={l} className="mb-2">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[6px] text-gray-500">{l}</span>
                  <span className="text-[6px] font-bold text-gray-700">{v}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`${c} h-1.5 rounded-full`} style={{width:`${w}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ── REPAIRS ── */
const RepairsScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Repairs"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Repairs"/>
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        <div className="grid grid-cols-5 gap-2">
          {[["⏱","0","Pending","bg-yellow-50 border-yellow-200 text-yellow-600"],["🔧","2","Repairing","bg-blue-50 border-blue-200 text-blue-600"],["✅","1","Ready","bg-green-50 border-green-200 text-green-600"],["📦","4","Delivered","bg-gray-50 border-gray-200 text-gray-600"],["✖","0","Cancelled","bg-red-50 border-red-200 text-red-500"]].map(([ic,n,l,cls])=>(
            <div key={l} className={`border rounded-xl p-2.5 text-center ${cls}`}>
              <div className="text-base mb-0.5">{ic}</div>
              <div className="text-xl font-black">{n}</div>
              <div className="text-[7px] font-semibold">{l}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-2.5 flex-1">
          <div className="flex items-center justify-between mb-2">
            <div><p className="text-[8px] font-bold text-gray-800">Repair Jobs</p><p className="text-[6px] text-gray-400">3 active repairs</p></div>
            <button className="text-[7px] bg-indigo-600 text-white px-2 py-0.5 rounded">+ New Repair Job</button>
          </div>
          <table className="w-full">
            <thead><tr className="text-[6px] text-gray-400 border-b border-gray-100 uppercase">
              {["Date","Customer","Device","Brand/Model","Problem","Est. Cost","Status"].map(h=><th key={h} className="text-left py-0.5 font-semibold pr-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {[["Mar 20","Kamal P.","iPhone 13","Apple/13","Screen","Rs 4,500","Repairing","blue"],["Mar 21","Saman S.","Samsung A52","Samsung/A52","Battery","Rs 2,800","Repairing","blue"],["Mar 22","Nimal R.","HP Laptop","HP/Pavilion","Keyboard","Rs 3,500","Ready","green"]].map(([d,c,dev,b,p,cost,s,sc])=>(
                <tr key={c} className="border-b border-gray-50">
                  <td className="py-1 text-[7px] text-gray-500 pr-2">{d}</td>
                  <td className="text-[7px] font-medium text-gray-700 pr-2">{c}</td>
                  <td className="text-[7px] text-gray-600 pr-2">{dev}</td>
                  <td className="text-[7px] text-gray-500 pr-2">{b}</td>
                  <td className="text-[7px] text-gray-600 pr-2">{p}</td>
                  <td className="text-[7px] font-semibold text-indigo-600 pr-2">{cost}</td>
                  <td><span className={`text-[6px] px-1.5 py-0.5 rounded-full font-semibold ${sc==="blue"?"bg-blue-100 text-blue-700":"bg-green-100 text-green-700"}`}>{s}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

/* ── ACCOUNTS ── */
const AccountsScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Accounts"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Accounts"/>
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        <div className="flex gap-1 border-b border-gray-200 mb-1">
          {["Overview","Capital","Opening Balance","Ledger","Assets","Profit Distribution"].map((t,i)=>(
            <span key={t} className={`text-[7px] px-2 py-1 cursor-default ${i===0?"border-b-2 border-indigo-600 text-indigo-700 font-bold":"text-gray-500"}`}>{t}</span>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {[["CASH IN HAND","Rs 52,000","Physical cash"],["BANK BALANCE","Rs 32,500","Account"],["TOTAL RECEIVABLE","Rs 12,400","Owed to biz"],["TOTAL PAYABLE","Rs 6,800","Biz owes"],["NET CAPITAL","Rs 95,000","Invested"],["NET PROFIT","Rs 38,400","Available"]].map(([l,v,s])=>(
            <div key={l} className="bg-white rounded-lg border border-gray-100 p-2">
              <p className="text-[6px] text-gray-400 font-semibold uppercase leading-tight">{l}</p>
              <p className="text-[10px] font-black text-gray-800 mt-0.5">{v}</p>
              <p className="text-[6px] text-gray-400">{s}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[8px] font-bold text-gray-700 mb-1.5">Balance Summary</p>
            {[["Total Revenue","Rs 284,500"],["Cost of Goods Sold","Rs 209,300"],["Gross Profit","Rs 75,200"],["Total Expenses","Rs 24,800"],["Net Profit","Rs 50,400"],["Profit Distributed","Rs 12,000"],["Available Profit","Rs 38,400"]].map(([l,v])=>(
              <div key={l} className="flex justify-between py-0.5 border-b border-gray-50">
                <span className="text-[7px] text-gray-600">{l}</span>
                <span className="text-[7px] font-bold text-indigo-600">{v}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[8px] font-bold text-gray-700 mb-1.5">Liquidity Overview</p>
            {[["Cash in Hand","Rs 52,000"],["Bank Balance","Rs 32,500"],["Total Liquid","Rs 84,500"],["Total Assets (Fixed)","Rs 45,000"],["Net Capital Invested","Rs 95,000"],["Total Receivable","Rs 12,400"],["Total Payable","Rs 6,800"]].map(([l,v])=>(
              <div key={l} className="flex justify-between py-0.5 border-b border-gray-50">
                <span className="text-[7px] text-gray-600">{l}</span>
                <span className="text-[7px] font-bold text-indigo-600">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ── REPORTS ── */
const ReportsScreen = () => (
  <div className="flex h-full bg-gray-50">
    <AppSidebar active="Reports"/>
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <AppTopBar title="Reports"/>
      <div className="flex-1 overflow-hidden p-2.5 space-y-2">
        <div className="flex gap-0.5 border-b border-gray-200 flex-wrap">
          {["Overview","P&L Summary","Daily","Monthly","Inventory","Customers","Expenses","Repairs","Assets","Full Report"].map((t,i)=>(
            <span key={t} className={`text-[7px] px-2 py-1 cursor-default ${i===0?"border-b-2 border-indigo-600 text-indigo-700 font-bold":"text-gray-500"}`}>{t}</span>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <SCard label="TOTAL CASH" value="Rs 84,500" sub="Cash + Bank" color="blue"/>
          <SCard label="STOCK VALUE" value="Rs 265,900" sub="Cost: Rs 209,300" color="violet"/>
          <SCard label="TOTAL RECEIVABLE" value="Rs 12,400" sub="Payable: Rs 6,800" color="green"/>
          <SCard label="NET WORTH" value="Rs 209,300" sub="Gross Margin: 32%" color="orange"/>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[7px] font-bold text-gray-700 mb-1.5">INCOME & CASH FLOW</p>
            {[["Capital Invested","Rs 95,000"],["Sales Income","Rs 284,500"],["Repair Revenue","Rs 18,200"],["Purchases Paid","Rs 209,300"],["Operating Expenses","Rs 24,800"],["Cash in Hand","Rs 84,500"]].map(([l,v])=>(
              <div key={l} className="flex justify-between py-0.5 border-b border-gray-50">
                <span className="text-[6px] text-gray-600">{l}</span>
                <span className="text-[6px] font-bold text-indigo-600">{v}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[7px] font-bold text-gray-700 mb-1.5">PROFIT & LOSS</p>
            {[["Total Revenue","Rs 284,500"],["Cost of Goods Sold","Rs 209,300"],["Gross Profit","Rs 75,200"],["Repair Revenue","Rs 18,200"],["Operating Expenses","Rs 24,800"],["Net Profit","Rs 68,600"]].map(([l,v])=>(
              <div key={l} className={`flex justify-between py-0.5 border-b border-gray-50 ${l==="Net Profit"?"font-bold":""}`}>
                <span className="text-[6px] text-gray-600">{l}</span>
                <span className={`text-[6px] font-bold ${l==="Net Profit"?"text-green-600":"text-indigo-600"}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-gray-100 p-2.5">
            <p className="text-[7px] font-bold text-gray-700 mb-1.5">BUSINESS SUMMARY</p>
            {[["Total Invoices","284"],["Total Products","5"],["Total Customers","2"],["Repair Jobs Done","7"],["Active Repairs","3 jobs"],["Total Expenses","Rs 24,800"]].map(([l,v])=>(
              <div key={l} className="flex justify-between py-0.5 border-b border-gray-50">
                <span className="text-[6px] text-gray-600">{l}</span>
                <span className="text-[6px] font-bold text-indigo-600">{v}</span>
              </div>
            ))}
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              {[["GROSS PROFIT","Rs 75,200","text-green-600"],["NET PROFIT","Rs 68,600","text-green-600"]].map(([l,v,c])=>(
                <div key={l} className="bg-gray-50 rounded p-1 text-center">
                  <p className="text-[5px] text-gray-400">{l}</p>
                  <p className={`text-[7px] font-black ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ─── NAVBAR ────────────────────────────────────────────────────── */
const Navbar = () => {
  const [onDark, setOnDark] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => setOnDark(entry.isIntersecting),
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" }
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);
  const links = [["Features","features"],["Screenshots","screenshots"],["Pricing","pricing"],["How It Works","howitworks"],["Contact","footer"]];
  const navBg   = onDark ? "rgba(8,6,20,0.60)"        : "rgba(255,255,255,0.97)";
  const shadow  = onDark ? "none"                      : "0 2px 24px rgba(99,102,241,0.10)";
  const blur    = onDark ? "blur(0px)"                 : "blur(18px)";
  const txtMain = onDark ? "#ffffff"                   : "#111827";
  const txtSub  = onDark ? "rgba(255,255,255,0.55)"    : "#9ca3af";
  const txtNav  = onDark ? "#ffffff"                   : "#374151";
  const accent  = onDark ? "#a78bfa"                   : "#6d28d9";
  return (
    <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:50,
      background:navBg,backdropFilter:blur,WebkitBackdropFilter:blur,
      boxShadow:shadow,transition:"background 0.3s,box-shadow 0.3s"}}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between" style={{height:72}}>
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer select-none" onClick={()=>goto("hero")}>
          <TechonLogo size={42}/>
          <div>
            <p style={{fontSize:"1.2rem",fontWeight:900,letterSpacing:"-0.02em",lineHeight:1,
              color:txtMain,transition:"color 0.3s",margin:0}}>
              Techon<span style={{color:accent,transition:"color 0.3s"}}>ERP</span>
            </p>
            <p style={{fontSize:"0.6rem",lineHeight:1,marginTop:3,color:txtSub,transition:"color 0.3s"}}>
              by Techon Computers
            </p>
          </div>
        </div>
        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7">
          {links.map(([l,id])=>(
            <button key={id} onClick={()=>goto(id)}
              style={{fontSize:"0.875rem",fontWeight:600,background:"none",border:"none",
                cursor:"pointer",color:txtNav,transition:"color 0.3s",padding:"4px 0"}}
              onMouseEnter={e=>e.currentTarget.style.color="#7c3aed"}
              onMouseLeave={e=>e.currentTarget.style.color=txtNav}
            >{l}</button>
          ))}
        </div>
        {/* CTA */}
        <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer"
          className="hidden md:flex items-center gap-2 text-sm font-bold text-white rounded-xl hover:scale-105 transition-transform"
          style={{padding:"10px 20px",background:"linear-gradient(135deg,#4f46e5,#7c3aed)",
            boxShadow:"0 4px 18px rgba(99,51,255,0.40)"}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Free Trial
        </a>
        {/* Mobile toggle */}
        <button className="md:hidden p-2" onClick={()=>setOpen(!open)} style={{background:"none",border:"none",cursor:"pointer"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={txtNav} strokeWidth="2.2" strokeLinecap="round">
            {open?<path d="M18 6L6 18M6 6l12 12"/>:<path d="M3 12h18M3 6h18M3 18h18"/>}
          </svg>
        </button>
      </div>
      {open && (
        <div style={{background:"white",margin:"0 12px 12px",borderRadius:16,
          boxShadow:"0 8px 40px rgba(99,102,241,0.15)",border:"1px solid #e0e7ff",padding:16}}>
          {links.map(([l,id])=>(
            <button key={id} onClick={()=>{goto(id);setOpen(false)}}
              className="block w-full text-left px-4 py-3 text-gray-700 font-semibold hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">{l}</button>
          ))}
          <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer"
            style={{display:"block",textAlign:"center",marginTop:8,padding:"12px",
              background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"white",
              fontWeight:700,borderRadius:12,fontSize:"0.875rem"}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Free Trial</a>
        </div>
      )}
    </nav>
  );
};


/* ─── HERO ──────────────────────────────────────────────────────── */
const Hero = () => (
  <section id="hero" className="relative min-h-screen flex flex-col justify-center overflow-hidden"
    style={{background:"linear-gradient(160deg,#0a0818 0%,#160d3a 45%,#1a1245 100%)"}}>
    {/* Ambient glow layers — soft, no hard edges */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div style={{position:"absolute",top:"-10%",left:"-5%",width:"60%",height:"70%",background:"radial-gradient(ellipse,rgba(99,51,255,0.18) 0%,transparent 70%)"}}/>
      <div style={{position:"absolute",bottom:"-10%",right:"-5%",width:"55%",height:"65%",background:"radial-gradient(ellipse,rgba(56,106,255,0.15) 0%,transparent 70%)"}}/>
      <div style={{position:"absolute",top:"40%",left:"40%",width:"40%",height:"40%",background:"radial-gradient(ellipse,rgba(139,92,246,0.10) 0%,transparent 70%)"}}/>
    </div>

    {/* Main content */}
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-20 sm:pt-24 pb-12 sm:pb-16">

      {/* Badge */}
      <div className="flex justify-center mb-6 sm:mb-10">
        <div className="inline-flex items-center gap-2 border border-white/10 text-white/60 font-medium rounded-full"
          style={{background:"rgba(255,255,255,0.05)",backdropFilter:"blur(12px)",fontSize:"0.65rem",padding:"6px 14px"}}>
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse flex-shrink-0"/>
          <span className="hidden sm:inline">Offline-First Desktop App · Optional Online Sync · Windows 10 / 11</span>
          <span className="sm:hidden">Offline-First · Optional Online Sync · Windows 10/11</span>
        </div>
      </div>

      {/* Logo + Headline */}
      <div className="text-center mb-8 sm:mb-12">
        <div className="flex justify-center mb-4 sm:mb-6">
          <img src={LOGO_SRC} alt="TechonERP" style={{width:72,height:72,borderRadius:"22%",boxShadow:"0 0 50px rgba(139,92,246,0.5)"}} className="sm:w-24 sm:h-24"/>
        </div>
        <h1 className="font-black text-white tracking-tight mb-4"
          style={{fontSize:"clamp(2rem,8vw,4.5rem)",lineHeight:1.05}}>
          All-in-One Smart ERP<br/>
          <span style={{background:"linear-gradient(95deg,#c4b5fd 0%,#818cf8 40%,#60a5fa 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            for Every Business
          </span>
        </h1>
        <p className="text-white/55 mx-auto leading-relaxed mb-6 px-2"
          style={{fontSize:"clamp(0.875rem,3.5vw,1.125rem)",maxWidth:"38rem"}}>
          Sales · Inventory · Invoices · Repairs · Accounts — all in one Windows .exe.
          Works 100% offline. Optional Online Sync to view your data from anywhere.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4 sm:px-0">
          <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 font-bold rounded-2xl text-white transition-all duration-200 hover:scale-105"
            style={{padding:"14px 28px",background:"linear-gradient(135deg,#6d28d9,#4f46e5)",boxShadow:"0 8px 32px rgba(99,51,255,0.45)",fontSize:"0.9rem"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Free Trial
          </a>
          <button onClick={()=>goto("screenshots")}
            className="flex items-center justify-center gap-2 font-bold rounded-2xl text-white/80 border border-white/20 hover:border-white/40 hover:text-white transition-all duration-200"
            style={{padding:"14px 28px",background:"rgba(255,255,255,0.06)",backdropFilter:"blur(10px)",fontSize:"0.9rem"}}>
            <span className="text-violet-400">▶</span>See Screenshots
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 sm:gap-x-12 mb-10 sm:mb-14 px-4 sm:px-0">
        {[["20+","Modules"],["32+","Currencies"],["Offline","+ Sync"],["7 Days","Free Trial"],["Win 10/11","Support"]].map(([v,l])=>(
          <div key={l} className="text-center" style={{minWidth:60}}>
            <p className="text-lg sm:text-xl font-black text-white leading-none">{v}</p>
            <p className="text-white/40 mt-0.5 tracking-wide" style={{fontSize:"0.65rem"}}>{l}</p>
          </div>
        ))}
      </div>

      {/* Dashboard Preview — hidden on very small, shown from sm up */}
      <div className="relative mx-auto hidden sm:block" style={{maxWidth:960}}>
        <div style={{position:"absolute",inset:"-20px",background:"radial-gradient(ellipse at 50% 60%,rgba(99,51,255,0.25) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div className="relative rounded-2xl overflow-hidden border border-white/10"
          style={{boxShadow:"0 40px 120px rgba(0,0,20,0.8),0 0 0 1px rgba(255,255,255,0.06)",transform:"perspective(1200px) rotateX(4deg)"}}>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5"
            style={{background:"rgba(15,10,40,0.95)",backdropFilter:"blur(20px)"}}>
            <div className="w-3 h-3 rounded-full bg-red-500/80"/>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"/>
            <div className="w-3 h-3 rounded-full bg-green-500/80"/>
            <div className="flex-1 mx-4">
              <div className="mx-auto w-48 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[9px] text-white/30 text-center">TechonERP — Dashboard</div>
            </div>
            <span className="text-[9px] font-semibold px-2.5 py-1 rounded-full" style={{background:"rgba(34,197,94,0.15)",color:"#4ade80",border:"1px solid rgba(74,222,128,0.2)"}}>● Online</span>
            <span className="hidden sm:inline text-[9px] font-semibold px-2.5 py-1 rounded-full ml-2" style={{background:"rgba(99,102,241,0.15)",color:"#818cf8",border:"1px solid rgba(129,140,248,0.2)"}}>🔒 Admin Mode</span>
          </div>
          <div style={{height:400,background:"#f8fafc"}}>
            <DashboardScreen/>
          </div>
        </div>
      </div>

      {/* Mobile: show 3 floating feature pills instead of dashboard */}
      <div className="sm:hidden grid grid-cols-1 gap-3 px-2">
        {[
          {icon:"📊",text:"Live Dashboard — Cash, Sales & Profit"},
          {icon:"🛒",text:"POS Sales — Scan Barcode & Invoice"},
          {icon:"🔧",text:"Repair Jobs — Track Every Device"},
        ].map((item,i)=>(
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10"
            style={{background:"rgba(255,255,255,0.06)",backdropFilter:"blur(12px)"}}>
            <span className="text-2xl flex-shrink-0">{item.icon}</span>
            <span className="text-white/80 text-sm font-medium">{item.text}</span>
          </div>
        ))}
        <p className="text-center text-white/30 text-xs mt-2">+ 17 more modules included</p>
      </div>
    </div>

    {/* Smooth wave into white section */}
    <div className="absolute bottom-0 inset-x-0">
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full">
        <path d="M0 80 C360 40 720 20 1080 50 C1260 65 1380 72 1440 80 L1440 80 L0 80Z" fill="white" opacity="0.06"/>
        <path d="M0 80 C480 50 960 60 1440 44 L1440 80 L0 80Z" fill="white"/>
      </svg>
    </div>
  </section>
);

/* ─── FEATURES ──────────────────────────────────────────────────── */
const featureGroups = [
  {
    id:"dashboard", icon:"📊", label:"Dashboard",
    headline:"Your Business at a Glance",
    summary:"See everything that matters the moment you open the app.",
    color:"from-indigo-500 to-violet-600",
    light:"bg-indigo-50 text-indigo-700 border-indigo-100",
    items:[
      {icon:"💵", title:"Cash & Bank Balance", desc:"Live view of cash in hand and bank balance, always up to date."},
      {icon:"📈", title:"Today's Sales & Profit", desc:"See today's revenue and net profit at the top of every session."},
      {icon:"📋", title:"Recent Sales Feed", desc:"Latest 5 transactions with customer name, amount and status."},
      {icon:"⚠️", title:"Low Stock Alerts", desc:"Instantly see which products are running low or out of stock."},
      {icon:"💳", title:"Receivables & Payables", desc:"Outstanding money owed to you and by you — visible at all times."},
    ]
  },
  {
    id:"sales", icon:"🛒", label:"Sales & Invoicing",
    headline:"Sell Fast. Invoice in Seconds.",
    summary:"A smooth POS experience built for speed and accuracy.",
    color:"from-blue-500 to-indigo-600",
    light:"bg-blue-50 text-blue-700 border-blue-100",
    items:[
      {icon:"🔍", title:"Search or Scan to Add Products", desc:"Add items by product name, code or USB barcode scanner — instantly."},
      {icon:"👤", title:"Walk-in, New or Existing Customer", desc:"Choose customer type in one click. No bottlenecks at the counter."},
      {icon:"🖨️", title:"A4, A5 & Thermal Print", desc:"Print invoices in any format — laser, inkjet or 80mm thermal receipt."},
      {icon:"📝", title:"Quotations", desc:"Create quotes and convert them to invoices with a single click."},
      {icon:"🛡️", title:"Warranty Policy on Invoice", desc:"Enable or disable warranty text on any invoice automatically."},
      {icon:"💰", title:"Instant Payment Tracking", desc:"Mark invoices as paid, partial or outstanding. Track every rupee."},
    ]
  },
  {
    id:"inventory", icon:"📦", label:"Inventory",
    headline:"Know Your Stock. Know Your Margins.",
    summary:"Full visibility into what you have, what it's worth and what's low.",
    color:"from-violet-500 to-purple-600",
    light:"bg-violet-50 text-violet-700 border-violet-100",
    items:[
      {icon:"💲", title:"Cost vs Retail Value", desc:"See total stock value at purchase price and selling price side by side."},
      {icon:"📉", title:"Profit Margin Per Category", desc:"Understand which categories earn most — with percentage breakdown."},
      {icon:"🗂️", title:"Category-wise Overview", desc:"Group products by type. View units, value and margin per category."},
      {icon:"🚨", title:"Low Stock & Out-of-Stock Alerts", desc:"Get instant visibility on items needing reorder."},
      {icon:"💔", title:"Damaged Item Tracking", desc:"Record and monitor damaged goods separately from sellable stock."},
    ]
  },
  {
    id:"purchases", icon:"🏪", label:"Purchases & Suppliers",
    headline:"Stay on Top of Every Order.",
    summary:"Manage what you buy and who you buy from — all in one place.",
    color:"from-emerald-500 to-teal-600",
    light:"bg-emerald-50 text-emerald-700 border-emerald-100",
    items:[
      {icon:"🏢", title:"Supplier Profiles", desc:"Store supplier contact, location and full transaction history."},
      {icon:"🧾", title:"Purchase Records", desc:"Log every purchase with invoice number, items, cost and date."},
      {icon:"⏳", title:"Outstanding Payment Tracking", desc:"See exactly how much you owe each supplier and what's been cleared."},
      {icon:"📊", title:"Purchase History", desc:"Full chronological history of all purchases per supplier."},
    ]
  },
  {
    id:"customers", icon:"👥", label:"Customers",
    headline:"Build Better Customer Relationships.",
    summary:"Everything you need to know about your customers — always ready.",
    color:"from-orange-500 to-amber-500",
    light:"bg-orange-50 text-orange-700 border-orange-100",
    items:[
      {icon:"📇", title:"Customer Profiles", desc:"Store name, phone, address and custom notes for every customer."},
      {icon:"🕑", title:"Full Purchase History", desc:"View all past invoices for any customer in seconds."},
      {icon:"💳", title:"Credit Balance Tracking", desc:"Monitor outstanding balances and credit given to each customer."},
      {icon:"💸", title:"Total Spent Overview", desc:"See lifetime spending for any customer at a glance."},
    ]
  },
  {
    id:"finance", icon:"📒", label:"Accounts & Finance",
    headline:"Complete Financial Control.",
    summary:"Real accounting built in — no separate software needed.",
    color:"from-indigo-600 to-blue-600",
    light:"bg-indigo-50 text-indigo-700 border-indigo-100",
    items:[
      {icon:"🏦", title:"Cash in Hand & Bank Balance", desc:"Track physical cash and bank account balances separately."},
      {icon:"📤", title:"Receivables & Payables", desc:"Full ledger of money owed to you and money you owe others."},
      {icon:"📋", title:"Capital & Opening Balance", desc:"Record business capital invested and set opening balances."},
      {icon:"🏷️", title:"Expense Tracking", desc:"Categorise and monitor all operational expenses over time."},
      {icon:"🔖", title:"Cheque Register", desc:"Track cheques by party, bank, amount and status — Pending, Cleared, Bounced."},
      {icon:"📊", title:"Net Profit Overview", desc:"See gross profit, total expenses and available profit at any time."},
    ]
  },
  {
    id:"reports", icon:"📈", label:"Reports & Analytics",
    headline:"Insights That Drive Decisions.",
    summary:"Nine report types covering every angle of your business.",
    color:"from-cyan-500 to-blue-500",
    light:"bg-cyan-50 text-cyan-700 border-cyan-100",
    items:[
      {icon:"📑", title:"Profit & Loss Summary", desc:"Clear P&L view: revenue, cost of goods, expenses and net profit."},
      {icon:"📅", title:"Daily & Monthly Reports", desc:"Track sales and performance over any day or month."},
      {icon:"🏭", title:"Inventory Report", desc:"Full stock value, category breakdown and margin analysis."},
      {icon:"👥", title:"Customer Report", desc:"Top customers, total spent and outstanding balances."},
      {icon:"🔧", title:"Repairs & Expenses Reports", desc:"Revenue from service jobs and full expense breakdown."},
      {icon:"📃", title:"Full Business Report", desc:"One comprehensive report covering every aspect of your business."},
    ]
  },
  {
    id:"repairs", icon:"🔧", label:"Repairs",
    headline:"Run Your Repair Workshop Professionally.",
    summary:"Every job tracked from intake to delivery — nothing falls through the cracks.",
    color:"from-rose-500 to-pink-600",
    light:"bg-rose-50 text-rose-700 border-rose-100",
    items:[
      {icon:"📥", title:"Job Intake", desc:"Log device, brand, model, customer and problem description at intake."},
      {icon:"🔄", title:"Status Pipeline", desc:"Move jobs through Pending → Repairing → Ready → Delivered."},
      {icon:"💵", title:"Estimated Cost Tracking", desc:"Set and update repair cost estimates for each job."},
      {icon:"🖨️", title:"Job Card Printing", desc:"Print a repair receipt for the customer with full job details."},
      {icon:"📊", title:"Repair Analytics", desc:"Track total jobs, revenue from repairs and completion rates."},
    ]
  },
  {
    id:"returns", icon:"↩️", label:"Returns",
    headline:"Handle Returns Without the Hassle.",
    summary:"Process refunds and restocks cleanly — for both sales and purchases.",
    color:"from-amber-500 to-orange-500",
    light:"bg-amber-50 text-amber-700 border-amber-100",
    items:[
      {icon:"🔙", title:"Sales Returns", desc:"Accept returned items from customers and issue refunds instantly."},
      {icon:"🏭", title:"Auto Restock", desc:"Returned items are automatically added back to inventory."},
      {icon:"🏪", title:"Purchase Returns", desc:"Record items returned to suppliers with reason and amount."},
      {icon:"📋", title:"Return History", desc:"Full log of all returns with original invoice reference."},
    ]
  },
  {
    id:"barcode", icon:"🏷️", label:"Barcode System",
    headline:"Label Every Product Professionally.",
    summary:"Print clean barcode labels for any product in your inventory.",
    color:"from-slate-600 to-gray-700",
    light:"bg-slate-50 text-slate-700 border-slate-100",
    items:[
      {icon:"🔍", title:"Search & Select Products", desc:"Find any product by name or code and queue it for printing."},
      {icon:"🖨️", title:"Batch Label Printing", desc:"Set quantity and print multiple labels in one go."},
      {icon:"🎨", title:"Label Design Customisation", desc:"Customise label layout and content to match your brand."},
    ]
  },
  {
    id:"audit", icon:"📋", label:"Audit Log",
    headline:"Total Transparency. Zero Blind Spots.",
    summary:"Every action in the system is tracked and searchable.",
    color:"from-purple-600 to-indigo-700",
    light:"bg-purple-50 text-purple-700 border-purple-100",
    items:[
      {icon:"🛒", title:"Sales Event Log", desc:"Every sale, edit and deletion is recorded with timestamp."},
      {icon:"📦", title:"Purchase Event Log", desc:"All purchase entries and edits logged automatically."},
      {icon:"💳", title:"Payment Event Log", desc:"Track every payment received or made — fully auditable."},
      {icon:"🔍", title:"Searchable History", desc:"Filter logs by type — Sale, Purchase, Product, Repair or Payment."},
    ]
  },
  {
    id:"settings", icon:"⚙️", label:"Settings",
    headline:"Fully Configured for Your Business.",
    summary:"Set up once and the system works exactly the way you need.",
    color:"from-gray-600 to-slate-700",
    light:"bg-gray-50 text-gray-700 border-gray-100",
    items:[
      {icon:"🏪", title:"Shop Information", desc:"Set your shop name, address, phone, email, website and currency."},
      {icon:"🧾", title:"Invoice Design", desc:"Customise invoice layout, footer message and display options."},
      {icon:"🛡️", title:"Warranty Policy", desc:"Define warranty terms that auto-print on every invoice."},
      {icon:"☁️", title:"Backup & Restore", desc:"One-click data backup with restore support for any Windows PC."},
      {icon:"🔒", title:"Security & Access", desc:"Admin and Sales mode to control staff access to sensitive data."},
    ]
  },
  {
    id:"sync", icon:"🌐", label:"Online Sync",
    headline:"View Your Business from Anywhere.",
    summary:"Optional add-on — monitor your offline shop data live from any device, any location.",
    color:"from-sky-500 to-cyan-600",
    light:"bg-sky-50 text-sky-700 border-sky-100",
    badge:"New",
    items:[
      {icon:"📱", title:"Access from Any Device", desc:"Open app.techon.lk on your phone, tablet or any browser — no installation needed."},
      {icon:"👁️", title:"Read-Only Live View", desc:"View all your shop data in real time. Sales, inventory, accounts, reports — everything visible, nothing editable."},
      {icon:"📊", title:"Live Dashboard", desc:"See today's sales, profit, stock value and receivables remotely — exactly as shown in the desktop app."},
      {icon:"🧾", title:"Invoice & Sales History", desc:"Browse past invoices and sales records from anywhere without being at your shop."},
      {icon:"📦", title:"Inventory Monitoring", desc:"Check stock levels, low-stock alerts and category breakdowns remotely at any time."},
      {icon:"🔐", title:"Secure & Private", desc:"Your data stays on your PC. Sync is encrypted and read-only. Nothing can be changed remotely."},
    ]
  },
];

const Features = () => {
  const [active, setActive] = useState("dashboard");
  const group = featureGroups.find(g => g.id === active);
  return (
    <section id="features" className="py-16 sm:py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Everything You Need
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">
            Everything You Need to<br/>Run Your Business
          </h2>
          <p className="text-gray-500 text-lg mb-5">
            13 module groups · 50+ features · offline-first Windows app · optional online sync
          </p>
          {/* Quick stats row */}
          <div className="flex flex-wrap justify-center gap-4">
            {[["🖥️","Desktop App"],["📴","Offline-First"],["🌐","Online Sync"],["🌍","32+ Currencies"]].map(([ic,lb])=>(
              <span key={lb} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                <span>{ic}</span>{lb}
              </span>
            ))}
          </div>
        </div>

        {/* Tab bar — horizontal scroll on mobile */}
        <div className="sm:hidden rounded-2xl mb-6 overflow-hidden" style={{background:"linear-gradient(135deg,#0d0b24 0%,#1a1150 50%,#0f1040 100%)",border:"1px solid rgba(139,92,246,0.2)"}}>
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b" style={{borderColor:"rgba(139,92,246,0.15)"}}>
            <div className="flex items-center justify-between">
              <div>
                <p style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase"}}>Module Browser</p>
                <p style={{fontSize:"0.75rem",color:"rgba(255,255,255,0.5)",marginTop:2}}>Tap a module to explore its features</p>
              </div>
              <div className="flex items-center gap-1" style={{background:"rgba(167,139,250,0.15)",borderRadius:20,padding:"4px 10px",border:"1px solid rgba(167,139,250,0.2)"}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                <span style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:700,letterSpacing:"0.06em"}}>SWIPE</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </div>
          {/* Scrollable icon+label tabs */}
          <div className="relative px-2 py-3">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10" style={{background:"linear-gradient(to right,#0d0b24,transparent)"}}/>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10" style={{background:"linear-gradient(to left,#0d0b24,transparent)"}}/>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
              {featureGroups.map(g => (
                <button key={g.id} onClick={()=>setActive(g.id)}
                  className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl flex-shrink-0 transition-all duration-200"
                  style={active===g.id ? {
                    background:"linear-gradient(135deg,#6d28d9,#4f46e5)",
                    boxShadow:"0 4px 20px rgba(99,51,255,0.50)",
                    border:"1px solid rgba(167,139,250,0.4)"
                  } : {
                    background:"rgba(255,255,255,0.05)",
                    border:"1px solid rgba(255,255,255,0.08)"
                  }}>
                  <span style={{fontSize:"1.4rem",lineHeight:1}}>{g.icon}</span>
                  <span style={{fontSize:"0.6rem",fontWeight:700,color: active===g.id ? "#fff" : "rgba(255,255,255,0.55)",whiteSpace:"nowrap",letterSpacing:"0.02em"}}>{g.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop tab bar */}
        <div className="hidden sm:flex flex-wrap justify-center gap-2 mb-8">
          {featureGroups.map(g => (
            <button key={g.id} onClick={()=>setActive(g.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={active===g.id ? {
                background:"linear-gradient(135deg,#4f46e5,#7c3aed)",
                color:"#fff",
                boxShadow:"0 4px 20px rgba(99,51,255,0.40)",
                transform:"translateY(-2px)"
              } : {
                background:"#f3f4f6",
                color:"#374151",
                border:"1px solid #e5e7eb"
              }}>
              <div className="relative inline-flex">
                <span>{g.icon}</span>
                {g.badge && <span style={{position:"absolute",top:-6,right:-10,background:"#f59e0b",color:"#fff",fontSize:"0.5rem",fontWeight:800,padding:"1px 4px",borderRadius:4}}>{g.badge}</span>}
              </div>
              <span>{g.label}</span>
            </button>
          ))}
        </div>

        {/* Active group panel */}
        {group && (
          <div className="rounded-3xl overflow-hidden border border-gray-100"
            style={{boxShadow:"0 8px 40px rgba(99,102,241,0.08)"}}>
            {/* Group header banner */}
            <div className={`bg-gradient-to-r ${group.color} px-5 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-4xl flex-shrink-0">
                  {group.icon}
                </div>
                <div>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Module</p>
                  <h3 className="text-2xl font-black text-white leading-tight">{group.headline}</h3>
                  <p className="text-white/75 text-sm mt-1">{group.summary}</p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                  {group.items.length} features
                </span>
              </div>
            </div>

            {/* Feature cards grid */}
            <div className="bg-white p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
              {group.items.map((item, i) => (
                <div key={i}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-gray-50 cursor-default"
                  style={{transition:"background 0.2s, border-color 0.2s, box-shadow 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#f8f7ff";e.currentTarget.style.borderColor="#e0e7ff";e.currentTarget.style.boxShadow="0 4px 16px rgba(99,102,241,0.08)"}}
                  onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.borderColor="#fafafa";e.currentTarget.style.boxShadow=""}}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{background:"linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))"}}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-0.5">{item.title}</p>
                    <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom nav hint */}
            <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                <span className="sm:hidden">Tap a tab above</span><span className="hidden sm:inline">Click any tab above</span> to explore more modules
              </p>
              <div className="flex gap-1">
                {featureGroups.map(g=>(
                  <div key={g.id} onClick={()=>setActive(g.id)}
                    className="w-2 h-2 rounded-full cursor-pointer transition-all duration-200"
                    style={{background: g.id===active ? "#6d28d9" : "#e5e7eb", transform: g.id===active?"scale(1.3)":"scale(1)"}}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

/* ─── SCREENSHOTS ───────────────────────────────────────────────── */
const screens = [
  {label:"Dashboard",comp:<DashboardScreen/>},
  {label:"Sales & POS",comp:<SalesScreen/>},
  {label:"Inventory",comp:<InventoryScreen/>},
  {label:"Repairs",comp:<RepairsScreen/>},
  {label:"Accounts",comp:<AccountsScreen/>},
  {label:"Reports",comp:<ReportsScreen/>},
];

const Screenshots = () => {
  const [active, setActive] = useState(0);
  return (
    <section id="screenshots" className="py-16 sm:py-24 bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4"><span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Real UI · Actual Screens</span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">See the Real TechonERP</h2>
          <p className="text-gray-500 text-lg">Every screen shown is a faithful recreation of the actual app UI — exactly what you get after installation.</p>
        </div>
        {/* Mobile dark tab bar */}
        <div className="sm:hidden rounded-2xl mb-5 overflow-hidden" style={{background:"linear-gradient(135deg,#0d0b24 0%,#1a1150 50%,#0f1040 100%)",border:"1px solid rgba(139,92,246,0.2)"}}>
          <div className="px-4 pt-4 pb-3 border-b" style={{borderColor:"rgba(139,92,246,0.15)"}}>
            <div className="flex items-center justify-between">
              <div>
                <p style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase"}}>App Screenshots</p>
                <p style={{fontSize:"0.75rem",color:"rgba(255,255,255,0.5)",marginTop:2}}>Tap a screen to preview</p>
              </div>
              <div className="flex items-center gap-1" style={{background:"rgba(167,139,250,0.15)",borderRadius:20,padding:"4px 10px",border:"1px solid rgba(167,139,250,0.2)"}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                <span style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:700,letterSpacing:"0.06em"}}>SWIPE</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </div>
          <div className="relative px-2 py-3">
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10" style={{background:"linear-gradient(to right,#0d0b24,transparent)"}}/>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10" style={{background:"linear-gradient(to left,#0d0b24,transparent)"}}/>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
              {screens.map((s,i)=>(
                <button key={i} onClick={()=>setActive(i)}
                  className="flex-shrink-0 px-4 py-2.5 rounded-xl font-semibold transition-all duration-200"
                  style={active===i ? {
                    background:"linear-gradient(135deg,#6d28d9,#4f46e5)",
                    color:"#ffffff",
                    fontSize:"0.8rem",
                    fontWeight:700,
                    boxShadow:"0 4px 20px rgba(99,51,255,0.50)",
                    border:"1px solid rgba(167,139,250,0.4)"
                  } : {
                    background:"rgba(255,255,255,0.05)",
                    color:"rgba(255,255,255,0.6)",
                    fontSize:"0.8rem",
                    fontWeight:600,
                    border:"1px solid rgba(255,255,255,0.08)"
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Desktop tab bar */}
        <div className="hidden sm:flex flex-wrap justify-center gap-2 mb-6">
          {screens.map((s,i)=>(
            <button key={i} onClick={()=>setActive(i)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${active===i?"bg-indigo-600 text-white shadow-lg shadow-indigo-300/40":"bg-white text-gray-600 border border-gray-200 hover:border-indigo-200 hover:text-indigo-600"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-indigo-200/60 border border-gray-200">
          <div className="bg-gray-800 px-5 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"/><div className="w-3 h-3 rounded-full bg-yellow-400"/><div className="w-3 h-3 rounded-full bg-green-400"/>
            <div className="flex-1 bg-gray-700 rounded-full px-4 py-1 text-[10px] text-gray-400 ml-3">TechonERP — {screens[active].label}</div>
            <span className="text-[9px] text-indigo-300 font-semibold">Admin Mode</span>
          </div>
          <div className="h-64 sm:h-96 lg:h-[500px] bg-gray-50 overflow-hidden">{screens[active].comp}</div>
        </div>
        <p className="text-center text-sm text-gray-400 mt-4"><span className="sm:hidden">Tap the module tabs above to switch screens</span><span className="hidden sm:inline">Click tabs above to explore different modules →</span></p>
      </div>
    </section>
  );
};

/* ─── PRODUCT HIGHLIGHTS (tax, language, setup, invoices, trust, why) ─ */
const ProductHighlights = () => {
  const cards = [
    {
      title:"Smart Tax System",
      icon:"🧾",
      items:["Country-based tax suggestions (VAT, GST, and more)","Supports multiple taxes","Inclusive and exclusive modes","Fully customizable"],
    },
    {
      title:"Multi-Language Invoices",
      icon:"🌐",
      items:["Invoice language based on country","Multiple language support","Switch language per invoice","Customer-friendly receipts"],
    },
    {
      title:"Smart Setup",
      icon:"⚡",
      items:["Auto currency selection","Auto language suggestions","Auto tax setup","Optimized for real-world business use"],
    },
    {
      title:"Professional Invoices",
      icon:"🖨️",
      items:["Clean thermal and A4 invoice design","Supports tax breakdown","Supports multi-language printing","Easy to read and customer-friendly"],
    },
  ];
  const whyPoints = ["Built for real businesses","Simple but powerful","Smart automation","Clean user interface","No confusion setup"];
  return (
    <section id="highlights" className="py-16 sm:py-24 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
          <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Latest capabilities
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Smarter tools for everyday business</h2>
          <p className="text-gray-500 text-lg">Tax, languages, setup and invoices — designed to stay simple as you grow.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5 sm:gap-6 mb-8 sm:mb-10">
          {cards.map((c) => (
            <div key={c.title} className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl" aria-hidden>{c.icon}</span>
                <h3 className="text-lg sm:text-xl font-black text-gray-900">{c.title}</h3>
              </div>
              <ul className="space-y-2.5">
                {c.items.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white mb-8 sm:mb-10 border border-white/10">
          <h3 className="text-xl sm:text-2xl font-black mb-4">Reliable &amp; Safe</h3>
          <ul className="space-y-2.5 text-white/85 text-sm sm:text-base leading-relaxed max-w-2xl">
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>Your data is सुरक्षित (safe)</li>
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>Works offline and online</li>
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>No data loss risk</li>
          </ul>
        </div>
        <div className="rounded-2xl sm:rounded-3xl border border-indigo-100 bg-indigo-50/50 p-6 sm:p-10">
          <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 text-center">Why Techon ERP</h3>
          <p className="text-center text-gray-500 text-sm sm:text-base mb-8 max-w-xl mx-auto">Everything we build is aimed at clarity, speed and trust — not clutter.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {whyPoints.map((p) => (
              <div key={p} className="flex items-center gap-3 bg-white rounded-xl border border-indigo-100/80 px-4 py-3 shadow-sm">
                <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-black flex-shrink-0">✓</span>
                <span className="font-semibold text-gray-800 text-sm">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── HOW IT WORKS ──────────────────────────────────────────────── */
const HowItWorks = () => (
  <section id="howitworks" className="py-16 sm:py-24 bg-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-16">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Simple Setup
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Up & Running in 4 Steps</h2>
        <p className="text-gray-500 text-lg">From download to a fully working ERP in under 5 minutes.</p>
      </div>
      <div className="relative">
        <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-indigo-200 via-violet-300 to-indigo-200"/>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {[
            {n:"01",
              svg:<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
              title:"Download EXE",desc:"Download the installer directly from techon.lk/downloads or contact us via WhatsApp. No account needed."},
            {n:"02",
              svg:<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>,
              title:"Install on Windows",desc:"Run the .exe installer on Windows 10 or 11. Setup completes in under 2 minutes. No internet required."},
            {n:"03",
              svg:<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
              title:"Activate with Key",desc:"7-day free trial starts immediately — full access, no restrictions, no risk. Buy a plan and receive your unique license key via WhatsApp or email."},
            {n:"04",
              svg:<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
              title:"Run Offline + Sync Optionally",desc:"TechonERP works 100% offline after activation. Optionally add Online Sync to view your data live from app.techon.lk on any device."},
          ].map((s,i)=>(
            <div key={i} className="flex flex-col items-center text-center">
              <div className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-xl shadow-indigo-300/40 mb-4 sm:mb-5">
                <div>{s.svg}</div>
              </div>
              <span className="text-xs font-black text-indigo-400 mb-2">{s.n}</span>
              <h3 className="font-black text-gray-900 text-base sm:text-lg mb-2">{s.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-10 sm:mt-14 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-5 sm:gap-6 justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <div>
            <h4 className="font-black text-gray-900 mb-1">How License Activation Works</h4>
            <p className="text-gray-500 text-sm leading-relaxed max-w-lg">After the <strong>7-day free trial</strong> — full access, no restrictions, no risk — (extra demo time available on request), the app prompts you for your license key. Purchase any plan and we send your key via <strong>WhatsApp</strong> or <strong>email</strong>. Enter it once — you're permanently activated. Internet is only needed for this single step.</p>
          </div>
        </div>
        <a href="https://wa.me/94701234678?text=I+need+a+TechonERP+license+key" target="_blank" rel="noreferrer"
          className="flex-shrink-0 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg hover:scale-105 transition-all flex items-center gap-2 text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
          Get License Key
        </a>
      </div>
    </div>
  </section>
);

/* ─── PRICING ───────────────────────────────────────────────────── */
const plans = [
  {name:"Free Trial",price:"Free",period:"7 Days",desc:"Full access · No restrictions · No risk",badge:null,highlight:false,
    features:["All 20 modules unlocked — full access","No restrictions during the trial","No risk — try everything before you buy","Internet for activation only","App locks after trial expires","Request extra demo time on request","WhatsApp / email support"]},
  {name:"Monthly",price:"1,000",period:"/ month",desc:"Flexible, cancel anytime",badge:null,highlight:false,
    features:["All 20 modules unlocked","Unlimited transactions","100% offline operation","License key via WhatsApp/email","Priority support"]},
  {name:"Yearly",price:"7,500",period:"/ year",desc:"Save 37% vs monthly",badge:"Most Popular",highlight:true,
    features:["All 20 modules unlocked","Unlimited transactions","100% offline operation","License key via WhatsApp/email","Priority support","Free onboarding help"]},
  {name:"2 Years",price:"15,000",period:"/ 2 years",desc:"Best for growing businesses",badge:null,highlight:false,
    features:["All 20 modules unlocked","Unlimited transactions","100% offline operation","License key via WhatsApp/email","Dedicated support","Free updates included"]},
  {name:"Lifetime",price:"30,000",period:"one-time",desc:"Pay once, use forever",badge:"Best Value",highlight:false,
    features:["All 20 modules unlocked","Unlimited transactions","All future updates free","License key via WhatsApp/email","Dedicated account support","Free onboarding & setup"]},
];

const Pricing = () => (
  <section id="pricing" className="py-16 sm:py-24 bg-gradient-to-b from-slate-50 to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-16">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Pricing Plans
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Simple Plans.<br/>No Hidden Fees.</h2>
        <p className="text-gray-500 text-lg">Start free for 7 days — full access, no credit card, no account needed. Buy a plan and get your license key instantly.</p>
        <p className="text-sm text-gray-400 mt-2">All prices in LKR (Sri Lankan Rupees) · License delivered via WhatsApp or email</p>
      </div>
      {/* Mobile swipe hint */}
      <div className="sm:hidden rounded-2xl mb-4 px-4 py-3 overflow-hidden" style={{background:"linear-gradient(135deg,#0d0b24,#1a1150)",border:"1px solid rgba(139,92,246,0.2)"}}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase"}}>Pricing Plans</p>
            <p style={{fontSize:"0.75rem",color:"rgba(255,255,255,0.5)",marginTop:2}}>5 plans + Online Sync add-on · Swipe to browse</p>
          </div>
          <div className="flex items-center gap-1" style={{background:"rgba(167,139,250,0.15)",borderRadius:20,padding:"5px 12px",border:"1px solid rgba(167,139,250,0.2)"}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            <span style={{fontSize:"0.6rem",color:"#a78bfa",fontWeight:700,letterSpacing:"0.06em"}}>SWIPE</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>
      </div>
      {/* Mobile: horizontal scroll with fade edges. Desktop: grid */}
      <div className="relative">

      <div className="pricing-scroll flex gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5 sm:pb-0 items-stretch" style={{paddingTop:16}}>
        {plans.map((p,i)=>(
          <div key={i}
            className={`pricing-card relative rounded-2xl p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 mt-3 sm:mt-0 ${p.highlight?"bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-2xl shadow-indigo-400/50 scale-[1.03] ring-2 ring-indigo-400/30":"bg-white border border-gray-100 hover:shadow-xl hover:shadow-indigo-100 hover:border-indigo-200"}`}>
            {p.badge && (
              <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${p.highlight?"bg-amber-400 text-amber-900":"bg-indigo-600 text-white"}`}>{p.badge}</div>
            )}
            <div className="mb-5">
              <h3 className={`font-black text-lg mb-1 ${p.highlight?"text-white":"text-gray-900"}`}>{p.name}</h3>
              <div className="flex items-end gap-1 mb-1">
                {p.price!=="Free"&&<span className={`text-sm font-semibold mb-1 ${p.highlight?"text-violet-200":"text-gray-400"}`}>LKR</span>}
                <span className={`text-3xl font-black ${p.highlight?"text-white":"text-gray-900"}`}>{p.price}</span>
              </div>
              <p className={`text-xs font-bold ${p.highlight?"text-violet-200":"text-indigo-600"}`}>{p.period}</p>
              <p className={`text-xs mt-1 ${p.highlight?"text-violet-200":"text-gray-400"}`}>{p.desc}</p>
            </div>
            <ul className="space-y-2 flex-1 mb-6">
              {p.features.map((f,j)=>(
                <li key={j} className="flex items-start gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p.highlight?"#c4b5fd":"#6366f1"} strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  <span className={`text-xs leading-relaxed ${p.highlight?"text-violet-100":"text-gray-600"}`}>{f}</span>
                </li>
              ))}
            </ul>
            <a href={p.price==="Free"?"https://techon.lk/downloads/latest.zip":"https://wa.me/94701234678?text=I+want+to+purchase+TechonERP"} target="_blank" rel="noreferrer"
              className={`w-full py-3 rounded-xl text-sm font-bold text-center transition-all hover:scale-105 flex items-center justify-center gap-2 ${p.highlight?"bg-white text-indigo-700 shadow-lg":"bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200"}`}>
              {p.price==="Free" ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Free</>) : "Get License Key"}
            </a>
          </div>
        ))}
      </div>
      </div>

      {/* Online Sync Add-on */}
      <div className="mt-12 sm:mt-16">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-3">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse"/>New Feature
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">Optional Add-on: Online Sync</h3>
          <p className="text-gray-500 max-w-xl mx-auto">Your ERP stays 100% offline. Add Online Sync to view your shop data from anywhere — phone, tablet or any browser.</p>
        </div>
        <div className="max-w-3xl mx-auto rounded-3xl overflow-hidden border border-sky-100" style={{boxShadow:"0 8px 40px rgba(14,165,233,0.12)"}}>
          {/* Top banner */}
          <div className="px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6" style={{background:"linear-gradient(135deg,#0ea5e9,#0284c7)"}}>
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-4xl" style={{background:"rgba(255,255,255,0.15)"}}>🌐</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-2xl font-black text-white">Online Sync</h4>
                  <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded-full">NEW</span>
                </div>
                <p className="text-sky-100 text-sm">View your offline ERP data live from <strong className="text-white">app.techon.lk</strong> — any device, anywhere</p>
              </div>
            </div>
            <div className="flex-shrink-0 text-center sm:text-right">
              <p className="text-sky-200 text-xs font-semibold uppercase tracking-wide mb-1">Add-on Price</p>
              <p className="text-white font-black leading-none"><span className="text-sky-200 text-sm font-semibold">LKR </span><span className="text-4xl">10,000</span></p>
              <p className="text-sky-200 text-xs mt-1">per year · billed annually</p>
            </div>
          </div>
          {/* Features grid */}
          <div className="bg-white px-6 sm:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {icon:"📱",title:"Any Device, Any Browser",desc:"Access from your phone, tablet or laptop at app.techon.lk. No app to install."},
              {icon:"👁️",title:"Read-Only Access",desc:"View everything — sales, inventory, accounts, reports. Nothing can be edited or deleted remotely."},
              {icon:"📊",title:"Live Dashboard",desc:"See today's sales, profit, stock value and receivables in real time from anywhere."},
              {icon:"🧾",title:"Invoice & Sales History",desc:"Browse all past invoices and transaction records without being at your shop."},
              {icon:"📦",title:"Inventory Monitoring",desc:"Check stock levels and low-stock alerts remotely. Know what needs reordering before you arrive."},
              {icon:"🔐",title:"Secure & Encrypted",desc:"Data stays on your PC. Sync is encrypted end-to-end. Nothing can be changed remotely."},
            ].map((item,i)=>(
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{background:"#f0f9ff",border:"1px solid #e0f2fe"}}>
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <p className="font-bold text-gray-900 text-sm mb-0.5">{item.title}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Bottom CTA */}
          <div className="bg-sky-50 border-t border-sky-100 px-6 sm:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-gray-900 text-sm">Already have TechonERP?</p>
              <p className="text-gray-500 text-xs mt-0.5">Add Online Sync to your existing plan. Contact us via WhatsApp to activate.</p>
            </div>
            <a href="https://wa.me/94701234678?text=I+want+to+add+Online+Sync+to+my+TechonERP" target="_blank" rel="noreferrer"
              className="flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-sm hover:scale-105 transition-transform"
              style={{background:"linear-gradient(135deg,#0ea5e9,#0284c7)",boxShadow:"0 4px 20px rgba(14,165,233,0.35)"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              Add Online Sync — LKR 10,000/yr
            </a>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">Online Sync is an optional yearly add-on. The core TechonERP app always works 100% offline without it.</p>
      </div>
    </div>
  </section>
);

/* ─── TESTIMONIALS ──────────────────────────────────────────────── */
const testimonialList = [
  {biz:"Techzone Qatar",loc:"Al Wakrah, Qatar",type:"Mobile & Electronics Shop",av:"T",flag:"🇶🇦",text:"We were looking for an ERP that works offline since internet can be unreliable at our shop. TechonERP is exactly that — installs on Windows, runs perfectly without internet, and the QAR currency support made it ready to use from day one. Excellent product from the Techon team."},
  {biz:"Macline Computers",loc:"Akurana, Kandy — 🇱🇰",type:"Computer & Mobile Shop",av:"M",flag:"🇱🇰",text:"We've been running TechonERP at our computer and mobile shop. Managing inventory, invoicing and repairs all in one place has saved us hours daily. The barcode printing module alone is worth every rupee."},
  {biz:"The Multi Store",loc:"Katugastota, Kandy — 🇱🇰",type:"Multi-Product Retail",av:"T",flag:"🇱🇰",text:"Perfect for our multi-category retail shop. The inventory breakdown by category, stock health alerts and margin tracking are things we never had before. Simple enough that any staff member can use it."},
  {biz:"Pradeep Electronics",loc:"Gampaha — 🇱🇰",type:"Electronics & Repair Shop",av:"P",flag:"🇱🇰",text:"The repair job management module is excellent. We track every device from intake to delivery, customers get printed job receipts, and the full pipeline is visible at a glance. Running 100% offline is a huge advantage for us."},
  {biz:"Nimal Mobile Hub",loc:"Kurunegala — 🇱🇰",type:"Mobile Phone Retailer",av:"N",flag:"🇱🇰",text:"We moved from spreadsheets to TechonERP and the difference is massive. Receivables and payables tracking alone paid back the lifetime licence cost within the first month of use."},
  {biz:"Al Safa Tech Shop",loc:"Doha, Qatar — 🇶🇦",type:"Mobile Accessories & Repair",av:"A",flag:"🇶🇦",text:"TechonERP supports QAR and runs fully offline which is exactly what we needed. The repair tracking and customer history features have transformed how we manage our daily operations. Very easy to set up and use."},
  {biz:"Desert Tech Dubai",loc:"Deira, Dubai — 🇦🇪",type:"Mobile & Computer Shop",av:"D",flag:"🇦🇪",text:"We run a busy mobile and computer shop in Deira and TechonERP handles everything — sales, repairs, inventory and invoicing. The AED currency support worked perfectly out of the box. Offline capability is a major advantage since we don't rely on any cloud service."},
  {biz:"Al Noor Electronics",loc:"Al Quoz, Dubai — 🇦🇪",type:"Electronics & Accessories",av:"A",flag:"🇦🇪",text:"Managing stock across multiple categories used to be a nightmare. TechonERP's inventory with category breakdown, margin tracking and low-stock alerts has made it so much easier. The reports section gives us everything we need to make smart decisions."},
  {biz:"Burj Mobile Center",loc:"Bur Dubai — 🇦🇪",type:"Smartphone Repair & Sales",av:"B",flag:"🇦🇪",text:"The repair job module is perfectly designed for our workshop. We log every device, track repair status from pending to delivered and print job cards for customers. TechonERP is the best investment we have made for our shop in Dubai."},
  {biz:"Galaxy Phone Center",loc:"Colombo 07 — 🇱🇰",type:"Smartphone Retail & Service",av:"G",flag:"🇱🇰",text:"The admin and sales mode feature is brilliant. Our sales staff use the POS view while I handle the finances separately in admin mode. The cheque register is something I've never seen in any other local ERP."},
  {biz:"Ruhunu Tech Hub",loc:"Matara — 🇱🇰",type:"Computer & Accessories Store",av:"R",flag:"🇱🇰",text:"We handle both retail sales and service jobs at the same shop. TechonERP manages both perfectly — the inventory tracks our stock while the repair module handles all our service jobs with status updates. Great value for the price."},
];

const Testimonials = () => {
  const [show, setShow] = useState(6);
  return (
  <section className="py-16 sm:py-24 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Real Customers
        </span>
        <h2 className="text-4xl lg:text-5xl font-black text-gray-900 mb-3 leading-tight">Trusted Across the Globe</h2>
        <p className="text-gray-500 text-lg">From Sri Lanka to Qatar — businesses of all sizes rely on TechonERP every day.</p>
        <p className="text-gray-400 text-sm mt-3 max-w-xl mx-auto">Carefully selected global countries for real business use.</p>
        {/* Country flags strip */}
        <div className="flex justify-center gap-3 mt-5 flex-wrap">
          {[["🇱🇰","Sri Lanka"],["🇶🇦","Qatar"],["🇦🇪","UAE / Dubai"]].map(([flag,name])=>(
            <div key={name} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="text-base">{flag}</span>{name}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {testimonialList.slice(0,show).map((t,i)=>(
          <div key={i} className="bg-gradient-to-br from-slate-50 to-indigo-50 border border-indigo-100 rounded-2xl p-4 sm:p-6 hover:shadow-xl hover:shadow-indigo-100 transition-all hover:-translate-y-0.5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-0.5">{[1,2,3,4,5].map(s=><span key={s} className="text-amber-400 text-sm">★</span>)}</div>
              <span className="text-xl">{t.flag}</span>
            </div>
            <p className="text-gray-700 leading-relaxed text-sm flex-1">"{t.text}"</p>
            <div className="flex items-center gap-3 pt-4 mt-4 border-t border-indigo-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-base flex-shrink-0">{t.av}</div>
              <div>
                <p className="font-black text-gray-900 text-sm leading-tight">{t.biz}</p>
                <p className="text-xs text-indigo-600 font-semibold">{t.type}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.loc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {show < testimonialList.length && (
        <div className="text-center mt-10">
          <button onClick={()=>setShow(testimonialList.length)}
            className="px-8 py-3 border-2 border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-all text-sm">
            Show All Reviews ({testimonialList.length}) ↓
          </button>
        </div>
      )}
    </div>
  </section>
  );
};

/* ─── WHY CHOOSE US ─────────────────────────────────────────────── */
const WhyUs = () => (
  <section className="py-16 sm:py-24 relative overflow-hidden" style={{background:"linear-gradient(135deg,#0f0c29 0%,#1a1050 50%,#1e1b4b 100%)"}}>
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-14">
        <span className="inline-flex items-center gap-2 bg-white/10 text-violet-300 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4 border border-white/10">
          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full"/>The Techon difference
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">Built Differently</h2>
        <p className="text-white/60 text-lg">Most ERPs are cloud-based, expensive and complicated. TechonERP is not.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {[
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/><line x1="2" y1="20" x2="5" y2="20"/><line x1="19" y1="20" x2="22" y2="20"/></svg>,
            bg:"rgba(99,102,241,0.25)",
            title:"Offline-First, Sync Optional",desc:"Works 100% offline with no internet needed. Add Online Sync to view your data remotely — your PC stays the only place data is stored and edited."},
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
            bg:"rgba(251,191,36,0.25)",
            title:"Fast & Lightweight",desc:"Built on Electron. Loads in seconds and runs smoothly on any Windows 10/11 machine with 4GB RAM minimum."},
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
            bg:"rgba(239,68,68,0.25)",
            title:"Built for Real Shops",desc:"Designed around real feedback from shop owners. Every feature solves a real, everyday business problem."},
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
            bg:"rgba(16,185,129,0.25)",
            title:"Your Data, Your Control",desc:"All data stored locally on your PC. One-click backup and restore. You own everything completely."},
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
            bg:"rgba(59,130,246,0.25)",
            title:"32+ Currencies",desc:"LKR, INR, USD, AED, SAR, EUR, GBP, SGD, JPY, CNY and 22+ more. Each business picks their own currency."},
          {
            svg:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
            bg:"rgba(139,92,246,0.25)",
            title:"Supported by Our Technical Team",desc:"Built and fully supported by our dedicated technical team in Sri Lanka. Direct WhatsApp support — real people, not a chatbot."},
        ].map((w,i)=>(
          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{background:w.bg}}>
              {w.svg}
            </div>
            <h3 className="text-white font-black text-lg mb-2">{w.title}</h3>
            <p className="text-white/55 text-sm leading-relaxed">{w.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── SYSTEM REQUIREMENTS ───────────────────────────────────────── */
const SysReq = () => (
  <section className="py-20 bg-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl p-10 text-white">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-white/10 text-indigo-300 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4 border border-white/10">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"/>System Requirements
            </span>
            <h2 className="text-3xl lg:text-4xl font-black mb-4 leading-tight">Runs on Your Existing<br/>Windows PC</h2>
            <p className="text-white/60 leading-relaxed">No expensive server hardware needed. TechonERP runs on whatever Windows computer your business already has.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-2 sm:gap-3">
            {[["🖥","OS","Windows 10 / 11"],["🧠","RAM","4 GB min · 8 GB recommended"],["💾","Storage","500 MB free disk space"],["🌐","Internet","Only for license activation"],["🖨","Printing","Any A4, A5 or 80mm thermal"],["📦","Install","Single .exe installer setup"]].map(([ic,l,v])=>(
              <div key={l} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p style={{fontSize:"1.4rem",lineHeight:1,marginBottom:6,fontFamily:"Apple Color Emoji,Segoe UI Emoji,NotoColorEmoji,sans-serif"}}>{ic}</p>
                <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wide">{l}</p>
                <p className="text-xs font-semibold text-white mt-0.5 leading-snug">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ─── CURRENCIES ────────────────────────────────────────────────── */
const currencies = ["LKR — Sri Lankan Rupee","₹ — Indian Rupee","$ — US Dollar","€ — Euro","£ — British Pound","AED — UAE Dirham","SAR — Saudi Riyal","QAR — Qatari Riyal","KWD — Kuwaiti Dinar","BHD — Bahraini Dinar","OMR — Omani Rial","AUD — Australian Dollar","CAD — Canadian Dollar","SGD — Singapore Dollar","MYR — Malaysian Ringgit","IDR — Indonesian Rupiah","¥ — Japanese Yen","₩ — South Korean Won","฿ — Thai Baht","PKR — Pakistani Rupee","BDT — Bangladeshi Taka","NPR — Nepali Rupee","MVR — Maldivian Rufiyaa","CHF — Swiss Franc","NZD — New Zealand Dollar","ZAR — South African Rand","NGN — Nigerian Naira","KES — Kenyan Shilling","₱ — Philippine Peso","HKD — Hong Kong Dollar","CNY — Chinese Yuan"];

const Currencies = () => (
  <section className="py-12 sm:py-20 bg-gradient-to-b from-slate-50 to-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-12">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Global Ready
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Global currencies &amp; regions</h2>
        <p className="text-gray-500">Carefully selected global countries for real business use. Each business picks one currency — invoices, reports and dashboards stay consistent.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {currencies.map((c,i)=>(
          <div key={i} className={`px-3 py-2 rounded-xl text-xs font-medium border ${i===0?"bg-indigo-600 text-white border-indigo-600":"bg-white border-gray-100 text-gray-600 hover:border-indigo-200 hover:text-indigo-700 transition-colors"}`}>{c}</div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── CTA ───────────────────────────────────────────────────────── */
const CTA = () => (
  <section className="py-14 sm:py-24 bg-white">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden p-7 sm:p-12 text-center" style={{background:"linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)"}}>
        <div className="absolute inset-0 opacity-10" style={{backgroundImage:"linear-gradient(white 1px,transparent 1px),linear-gradient(90deg,white 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 text-white/90 text-xs font-medium px-4 py-2 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
            7-Day Free Trial · Full access · No restrictions · No risk · No credit card · No account needed
          </div>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white mb-4 sm:mb-5 leading-tight">Ready to Transform<br/>Your Business?</h2>
          <p className="text-white/70 text-lg mb-10 max-w-lg mx-auto">Download TechonERP today. Install in 2 minutes. Your data stays on your own PC — forever.</p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center">
            <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer"
              className="px-8 py-4 bg-white text-indigo-700 font-bold rounded-xl shadow-xl hover:scale-105 transition-all text-sm flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Free Trial
            </a>
            <a href="https://wa.me/94701234678?text=I+want+to+know+more+about+TechonERP" target="_blank" rel="noreferrer"
              className="w-full sm:w-auto px-8 py-4 border-2 border-white/40 text-white font-bold rounded-xl hover:bg-white/10 transition-all text-sm flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ─── FOOTER ────────────────────────────────────────────────────── */
const Footer = () => (
  <footer id="footer" style={{background:"linear-gradient(180deg,#0a0a14 0%,#06060e 100%)"}}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 mb-10 sm:mb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <TechonLogo size={44}/>
            <div><p className="text-xl font-black text-white">Techon<span className="text-violet-400">ERP</span></p><p className="text-xs text-gray-500">by Techon Computers</p></div>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">All-in-One Smart ERP for Every Business. Desktop app for Windows. Data stored locally on your own PC.</p>
          <a href="https://wa.me/94701234678" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            WhatsApp Us
          </a>
        </div>
        <div>
          <h4 className="text-white font-bold mb-5">Quick Links</h4>
          <ul className="space-y-3">
            {[["Features","features"],["Screenshots","screenshots"],["How It Works","howitworks"],["Pricing","pricing"]].map(([l,id])=>(
              <li key={id}><button onClick={()=>goto(id)} className="text-sm text-gray-500 hover:text-indigo-400 transition-colors">{l}</button></li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold mb-5">Built For</h4>
          <ul className="space-y-2">
            {["Computer & Mobile Shops","Repair & Service Centers","Grocery & Supermarkets","Electrical & Paint Shops","Restaurants & Cafés","All Retail Businesses"].map(b=>(
              <li key={b} className="text-sm text-gray-500 flex items-start gap-2"><span className="text-indigo-500">›</span>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-bold mb-5">Contact Us</h4>
          <div className="space-y-3">
            {[["🌐","www.erp.techon.lk","https://www.erp.techon.lk"],["✉","info@techon.lk","mailto:info@techon.lk"],["📞","+94 70 1234 678","tel:+94701234678"],["📞","+94 70 1234 178","tel:+94701234178"]].map(([ic,l,h])=>(
              <a key={l} href={h} target={h.startsWith("http")?"_blank":undefined} rel="noreferrer" className="flex items-center gap-2.5 text-sm text-gray-500 hover:text-indigo-400 transition-colors">
                <span>{ic}</span>{l}
              </a>
            ))}
            <div className="mt-4 bg-gray-900 rounded-xl p-3.5 border border-gray-800">
              <p className="text-xs text-gray-500 font-semibold">📍 Based in</p>
              <p className="text-sm text-white font-bold mt-0.5">Matale, Central Province</p>
              <p className="text-xs text-gray-500">Sri Lanka 🇱🇰</p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-gray-600">© 2026 <span className="text-indigo-400">TechonERP</span> · Developed by <span className="text-gray-400 font-semibold">Techon Computers</span> · All rights reserved.</p>
        <p className="text-xs text-gray-700">Electron · IndexedDB · Windows 10/11 · Online Sync at app.techon.lk</p>
      </div>
    </div>
  </footer>
);

/* ─── FLOATING WHATSAPP ─────────────────────────────────────────── */
const WAButton = () => (
  <a href="https://wa.me/94701234678?text=Hi%2C+I%27m+interested+in+TechonERP.+Can+you+help%3F" target="_blank" rel="noreferrer"
    className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-full shadow-2xl shadow-green-500/50 hover:scale-105 transition-all"
    style={{padding:"13px 20px 13px 16px"}}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
    <span className="text-sm whitespace-nowrap">Chat on WhatsApp</span>
  </a>
);


/* ─── FAVICON SETTER ────────────────────────────────────────────── */
const FaviconSetter = () => {
  useEffect(() => {
    const link = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.type = "image/png";
    link.rel = "shortcut icon";
    link.href = LOGO_SRC;
    document.getElementsByTagName("head")[0].appendChild(link);
    document.title = "TechonERP — All-in-One Smart ERP for Every Business";
  }, []);
  return null;
};

/* ─── ROOT ──────────────────────────────────────────────────────── */
export default function App() {
  return (
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap'); html{scroll-behavior:smooth} *{box-sizing:border-box} .pricing-scroll::-webkit-scrollbar{display:none} @media(max-width:639px){.pricing-card{min-width:82vw;flex-shrink:0;scroll-snap-align:start}.pricing-scroll{scroll-snap-type:x mandatory;overflow-y:visible;padding-left:12px;padding-right:12px}.tab-scroll{scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}.tab-scroll::-webkit-scrollbar{display:none}}`}</style>
      <FaviconSetter/>
      <Navbar/><Hero/><Features/><Screenshots/><ProductHighlights/><HowItWorks/><Pricing/><Testimonials/><WhyUs/><Currencies/><SysReq/><CTA/><Footer/><WAButton/>
    </div>
  );
}
