import { useState, useEffect } from "react";
import {
  BASE_PRICING_LKR,
  DEFAULT_COUNTRY,
  PLAN_PERIODS,
  PRICING_STORAGE_KEY,
  REGION_MULTIPLIERS,
} from "./config/pricingConfig";
import { getRegionByCountry } from "./config/regionMapping";
import {
  convertLkrNominalToDisplay,
  getCurrencyByCountry,
  isDebugPricing,
  SUPPORTED_FORCE_COUNTRY_CODES,
} from "./config/currencyMapping";

const goto = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

const SectionLabel = ({ children }) => (
  <span className="section-label mb-4">{children}</span>
);

const TrustBar = () => (
  <section className="border-y border-indigo-100/80 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/80">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
      {[
        ["📴", "Works offline"],
        ["🖥️", "Windows 10 / 11"],
        ["🌍", "26+ currencies"],
        ["🔒", "Data stays on your PC"],
      ].map(([icon, label]) => (
        <div key={label} className="flex items-center justify-center sm:justify-start gap-2.5 text-sm font-semibold text-gray-700">
          <span className="text-lg" aria-hidden>{icon}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  </section>
);

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
  const links = [["Features","features"],["Pricing","pricing"],["Contact","footer"]];
  const navBg   = onDark ? "rgba(8,6,20,0.75)"        : "rgba(255,255,255,0.97)";
  const shadow  = onDark ? "none"                      : "0 2px 24px rgba(99,102,241,0.10)";
  const blur    = onDark ? "blur(12px)"                : "blur(18px)";
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
  <section id="hero" className="relative overflow-hidden pt-24 pb-0 sm:pt-28"
    style={{background:"linear-gradient(165deg,#08061a 0%,#120a32 40%,#1a1048 100%)"}}>
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-violet-600/20 blur-[100px]" />
      <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-[90px]" />
    </div>

    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
      <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">
        <div className="text-center lg:text-left">
          <SectionLabel>Offline-first ERP</SectionLabel>
          <h1 className="font-black text-white tracking-tight mb-4 leading-[1.08]"
            style={{fontSize:"clamp(2rem,5vw,3.5rem)"}}>
            Run your shop on{" "}
            <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-blue-300 bg-clip-text text-transparent">
              one Windows app
            </span>
          </h1>
          <p className="text-white/60 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0 text-lg">
            Sales, stock, invoices, repairs and accounts — on your PC, no internet required. Add cloud view when you need it.
          </p>

          <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3">
            <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer" className="btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download free trial
            </a>
            <button type="button" onClick={() => goto("pricing")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10">
              View pricing
            </button>
          </div>

          <p className="mt-5 text-white/35 text-sm">7-day trial · No credit card · Human support on WhatsApp</p>
        </div>

        <div className="relative mt-12 lg:mt-0 mx-auto w-full max-w-lg lg:max-w-none">
          <div className="absolute -inset-4 rounded-2xl bg-indigo-500/20 blur-2xl" aria-hidden />
          <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-[#0f0a28]/95">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              <span className="flex-1 text-center text-[10px] text-white/40">TechonERP — Dashboard</span>
              <span className="text-[9px] font-medium text-emerald-400">● Live</span>
            </div>
            <div className="h-56 sm:h-72 bg-gray-50">
              <DashboardScreen />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="absolute bottom-0 inset-x-0 pointer-events-none">
      <svg viewBox="0 0 1440 64" preserveAspectRatio="none" className="w-full h-8 sm:h-12">
        <path d="M0 64 C360 20 720 48 1440 24 L1440 64 L0 64Z" fill="white" />
      </svg>
    </div>
  </section>
);

/* ─── FEATURES ──────────────────────────────────────────────────── */
const coreModules = [
  { icon: "📊", title: "Dashboard", desc: "Cash, sales, stock and profit in one view.", tint: "from-indigo-500/10 to-violet-500/10" },
  { icon: "🛒", title: "Sales & POS", desc: "Invoices, barcode scan, thermal and A4 print.", tint: "from-blue-500/10 to-indigo-500/10" },
  { icon: "📦", title: "Inventory", desc: "Stock levels, margins and low-stock alerts.", tint: "from-violet-500/10 to-purple-500/10" },
  { icon: "📒", title: "Accounts", desc: "Receivables, payables, expenses and cheques.", tint: "from-emerald-500/10 to-teal-500/10" },
  { icon: "🔧", title: "Repairs", desc: "Track jobs from intake to delivery.", tint: "from-rose-500/10 to-pink-500/10" },
  { icon: "📈", title: "Reports", desc: "P&L, daily sales and business summaries.", tint: "from-cyan-500/10 to-blue-500/10" },
  { icon: "👥", title: "Customers", desc: "Profiles, history and credit balances.", tint: "from-amber-500/10 to-orange-500/10" },
  { icon: "🌐", title: "Online Sync", desc: "Optional read-only view from any browser.", tint: "from-sky-500/10 to-cyan-500/10" },
];

const Features = () => (
  <section id="features" className="py-20 sm:py-28 bg-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <SectionLabel>Core modules</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4 leading-tight">
          Everything in one place
        </h2>
        <p className="text-gray-500 text-lg leading-relaxed">
          One Windows app for daily shop work — no juggling spreadsheets or multiple tools.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {coreModules.map((m) => (
          <div key={m.title} className={`card-lift rounded-2xl border border-gray-100 bg-gradient-to-br ${m.tint} p-5`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm text-xl" aria-hidden>
              {m.icon}
            </div>
            <h3 className="mt-4 font-bold text-gray-900">{m.title}</h3>
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{m.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-gray-400 mt-10">
        Plus purchases, returns, barcodes, suppliers, audit log and more.
      </p>
    </div>
  </section>
);

/* ─── SCREENSHOTS ───────────────────────────────────────────────── */
const screens = [
  { label: "Dashboard", comp: <DashboardScreen /> },
  { label: "Sales", comp: <SalesScreen /> },
  { label: "Inventory", comp: <InventoryScreen /> },
];

const Screenshots = () => {
  const [active, setActive] = useState(0);
  return (
    <section id="screenshots" className="py-20 sm:py-28 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <SectionLabel>Product preview</SectionLabel>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">See the app</h2>
          <p className="text-gray-500">Tap a screen to preview the real TechonERP interface.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-8 p-1.5 rounded-xl bg-white border border-gray-100 shadow-sm w-fit mx-auto">
          {screens.map((sc, i) => (
            <button
              key={sc.label}
              type="button"
              onClick={() => setActive(i)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                active === i
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                  : "text-gray-600 hover:text-indigo-600"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <div className="absolute -inset-3 rounded-2xl bg-indigo-400/10 blur-xl" aria-hidden />
          <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-xl shadow-indigo-100/50">
            <div className="bg-gray-900 px-4 py-2.5 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="flex-1 text-center text-[10px] text-gray-400 font-medium">
                TechonERP — {screens[active].label}
              </span>
            </div>
            <div key={active} className="h-56 sm:h-80 bg-gray-50 overflow-hidden animate-[fadeIn_0.3s_ease]">
              {screens[active].comp}
            </div>
          </div>
        </div>
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
      </div>

      {/* Reliable & Safe — full-width strip (matches module browser treatment) */}
      <div className="w-full border-y border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] mb-8 sm:mb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 text-white">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-violet-300/95 mb-1">Trust &amp; security</p>
          <h3 className="text-xl sm:text-2xl font-black mb-4">Reliable &amp; Safe</h3>
          <ul className="space-y-2.5 text-white/85 text-sm sm:text-base leading-relaxed max-w-2xl">
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>Your data stays secure on your own PC</li>
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>Works offline and online</li>
            <li className="flex items-start gap-2"><span className="text-emerald-400 flex-shrink-0 mt-0.5">✓</span>No data loss risk</li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
const setupSteps = [
  { title: "Download", desc: "Get the Windows installer — no signup needed.", icon: "⬇️" },
  { title: "Install", desc: "Run on Windows 10 or 11. Works offline after setup.", icon: "💻" },
  { title: "Activate", desc: "7-day full trial starts instantly. Buy anytime for a license key.", icon: "🔑" },
  { title: "Run your shop", desc: "Sell, stock and account from one app on your PC.", icon: "🏪" },
];

const HowItWorks = () => (
  <section id="howitworks" className="py-20 sm:py-28 bg-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-14">
        <SectionLabel>Getting started</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Up and running in minutes</h2>
        <p className="text-gray-500">Download, install, activate — then your data stays on your own computer.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {setupSteps.map((step, i) => (
          <div key={step.title} className="relative rounded-2xl border border-gray-100 bg-gray-50/50 p-5 card-lift">
            {i < setupSteps.length - 1 && (
              <div className="hidden lg:block absolute top-9 -right-3 w-6 h-px bg-indigo-200" aria-hidden />
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg shadow-md shadow-indigo-200 mb-4" aria-hidden>
              {step.icon}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Step {i + 1}</p>
            <h3 className="font-bold text-gray-900 mb-1.5">{step.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
        <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer" className="btn-primary">
          Download installer
        </a>
        <a href="https://wa.me/94701234678?text=Hi%2C+I+need+help+with+TechonERP+setup" target="_blank" rel="noreferrer" className="btn-ghost">
          WhatsApp support
        </a>
      </div>
    </div>
  </section>
);

/* ─── PRICING / ONLINE SYNC (copy aligned with erp-app cloud sync + Features sync module) ─ */
const onlineSyncFeatures = [
  { icon: "📱", title: "Access from Any Device", desc: "Use your phone, tablet or laptop in the browser — no extra app to install." },
  { icon: "👁️", title: "Read-Only Live View", desc: "View all your shop data in real time. Sales, inventory, accounts, reports — everything visible, nothing editable." },
  { icon: "📊", title: "Live Dashboard", desc: "See today's sales, profit, stock value and receivables remotely — aligned with the desktop app." },
  { icon: "🧾", title: "Invoice & Sales History", desc: "Browse past invoices and sales records from anywhere without being at your shop." },
  { icon: "📦", title: "Inventory Monitoring", desc: "Check stock levels, low-stock alerts and category breakdowns remotely at any time." },
  { icon: "🔐", title: "Secure & Private", desc: "Your data stays on your shop PC. The web view is read-only — nothing can be changed remotely." },
];

/* ─── PRICING ───────────────────────────────────────────────────── */
const planTemplates = [
  { id: "free", name: "Free Trial", period: PLAN_PERIODS.free, desc: "Try everything for 7 days", badge: null, highlight: false,
    features: ["All modules unlocked", "No credit card", "WhatsApp support"] },
  { id: "monthly", name: "Monthly", period: PLAN_PERIODS.monthly, desc: "Flexible billing", badge: null, highlight: false,
    features: ["Full ERP access", "Offline on your PC", "License via WhatsApp"] },
  { id: "yearly", name: "Yearly", period: PLAN_PERIODS.yearly, desc: "Best for most shops", badge: "Popular", highlight: true,
    features: ["Full ERP access", "Offline on your PC", "Free onboarding help"] },
  { id: "twoYears", name: "2 Years", period: PLAN_PERIODS.twoYears, desc: "Long-term savings", badge: null, highlight: false,
    features: ["Full ERP access", "All updates included", "Priority support"] },
  { id: "lifetime", name: "Lifetime", period: PLAN_PERIODS.lifetime, desc: "Pay once, use forever", badge: "Best Value", highlight: false,
    features: ["Full ERP access", "All future updates", "Dedicated support"] },
];

const formatAmount = (value) => Math.round(value).toLocaleString("en-US");

const Pricing = () => {
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  /** Bumped when `forceCountry` changes (same-tab event or cross-tab `storage`) — triggers re-read of localStorage only. */
  const [refreshKey, setRefreshKey] = useState(0);
  void refreshKey;

  useEffect(() => {
    // Manual override (no UI): localStorage `techonerp_selected_country` = ISO country code (e.g. "LK").
    const savedCountry = localStorage.getItem(PRICING_STORAGE_KEY);
    if (savedCountry) {
      setSelectedCountry(savedCountry);
      return;
    }

    let isMounted = true;
    const detectCountry = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        if (!response.ok) return;
        const payload = await response.json();
        const detected = String(payload?.country_code || "").toUpperCase();
        if (!detected || !isMounted) return;
        setSelectedCountry(detected);
        localStorage.setItem(PRICING_STORAGE_KEY, detected);
      } catch (error) {
        // Fallback stays on default pricing (USD / WEST).
      }
    };
    detectCountry();
    return () => { isMounted = false; };
  }, []);

  /** Cross-tab: `storage` fires when another document updates `forceCountry`. */
  useEffect(() => {
    function handleStorageChange(e) {
      if (e.key === "forceCountry") {
        setRefreshKey((prev) => prev + 1);
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  /** Same-tab: dispatch `forceCountryChange` after setItem/removeItem so pricing re-renders without reload. */
  useEffect(() => {
    function handleForceCountryChange() {
      setRefreshKey((prev) => prev + 1);
    }

    window.addEventListener("forceCountryChange", handleForceCountryChange);

    return () => {
      window.removeEventListener("forceCountryChange", handleForceCountryChange);
    };
  }, []);

  /** Dev only: `setCountry("AE")` / `setCountry("US")` in console — same as manual setItem + dispatch. */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.setCountry = (code) => {
      if (!code || typeof code !== "string") return;

      const clean = code.trim().toUpperCase();

      if (!SUPPORTED_FORCE_COUNTRY_CODES.includes(clean)) {
        console.warn("Invalid country code:", clean);
        return;
      }

      localStorage.setItem("forceCountry", clean);
      window.dispatchEvent(new Event("forceCountryChange"));
    };
    return () => {
      delete window.setCountry;
    };
  }, []);

  /** Internal admin preview only (no UI): `localStorage.setItem("forceCountry", "AE")` — remove with `removeItem`. */
  const forcedCountry =
    typeof window !== "undefined" ? localStorage.getItem("forceCountry") : null;
  const countryCode =
    (forcedCountry && String(forcedCountry).trim().toUpperCase()) || selectedCountry;

  if (isDebugPricing() && forcedCountry) {
    console.log("[pricing override]", { forcedCountry });
  }

  const region = getRegionByCountry(countryCode);
  const multiplier = REGION_MULTIPLIERS[region] || REGION_MULTIPLIERS.WEST;
  const currency = getCurrencyByCountry(countryCode);

  /** Pipeline: lkrValue = baseLKR × multiplier → FX → roundToNearest10 → MIN/MAX → comma format */
  const formatDisplayFromLkr = (amountLkr, meta) =>
    formatAmount(convertLkrNominalToDisplay(amountLkr, currency.code, meta));

  const plans = planTemplates.map((plan) => {
    if (plan.id === "free") {
      return { ...plan, amount: null, isFree: true };
    }

    const baseValue = BASE_PRICING_LKR.plans[plan.id];
    const lkrNominal = baseValue * multiplier;
    const finalValue = formatDisplayFromLkr(lkrNominal, { baseLKR: baseValue, multiplier });
    return { ...plan, amount: finalValue, isFree: false };
  });

  const onlineSyncPrice = formatDisplayFromLkr(BASE_PRICING_LKR.cloudAddonYearly * multiplier, {
    baseLKR: BASE_PRICING_LKR.cloudAddonYearly,
    multiplier,
  });

  return (
  <section id="pricing" className="py-20 sm:py-28 bg-gradient-to-b from-slate-50 via-white to-slate-50">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-12">
        <SectionLabel>Pricing</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Simple, honest pricing</h2>
        <p className="text-gray-500">7-day free trial · Prices in <strong className="text-gray-700">{currency.code}</strong> for your region · License via WhatsApp</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
        {plans.map((p,i)=>(
          <div key={i}
            className={`relative rounded-2xl p-5 flex flex-col card-lift ${p.highlight?"bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-xl shadow-indigo-300/40 ring-2 ring-indigo-400/40 lg:-mt-1 lg:mb-1":"bg-white border border-gray-200 shadow-sm"}`}>
            {p.badge && (
              <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${p.highlight?"bg-amber-400 text-amber-900":"bg-indigo-600 text-white"}`}>{p.badge}</div>
            )}
            <div className="mb-5">
              <h3 className={`font-black text-lg mb-1 ${p.highlight?"text-white":"text-gray-900"}`}>{p.name}</h3>
              <div className="flex items-end gap-1 mb-1">
                {!p.isFree && <span className={`text-sm font-semibold mb-1 ${p.highlight?"text-violet-200":"text-gray-400"}`}>{currency.symbol}</span>}
                <span className={`text-3xl font-black ${p.highlight?"text-white":"text-gray-900"}`}>{p.isFree ? "Free" : p.amount}</span>
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
            <a href={p.isFree?"https://techon.lk/downloads/latest.zip":"https://wa.me/94701234678?text=I+want+to+purchase+TechonERP"} target="_blank" rel="noreferrer"
              className={`w-full py-3 rounded-xl text-sm font-bold text-center transition-all hover:scale-105 flex items-center justify-center gap-2 ${p.highlight?"bg-white text-indigo-700 shadow-lg":"bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200"}`}>
              {p.isFree ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Free</>) : "Get License Key"}
            </a>
          </div>
        ))}
      </div>

      <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 text-sm text-gray-600 leading-relaxed">
          <p className="font-bold text-gray-900 mb-1">Multi-PC shops</p>
          <p>Main system uses the plans above. Extra counter PCs need a client license — message us on WhatsApp for LAN pricing.</p>
        </div>
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5 text-sm text-gray-600 leading-relaxed">
          <p className="font-bold text-gray-900 mb-1">Online Sync <span className="font-normal text-gray-500">(optional)</span></p>
          <p>{currency.symbol}{onlineSyncPrice} {PLAN_PERIODS.cloudAddon} — read-only view of your shop from any browser.</p>
        </div>
      </div>
    </div>
  </section>
);
};

/* ─── TESTIMONIALS ──────────────────────────────────────────────── */
const testimonialList = [
  {biz:"Macline Computers",loc:"Kandy, Sri Lanka",av:"M",text:"Managing inventory, invoicing and repairs in one place has saved us hours daily."},
  {biz:"Techzone Qatar",loc:"Al Wakrah, Qatar",av:"T",text:"Works offline perfectly — QAR support made it ready from day one."},
  {biz:"Desert Tech Dubai",loc:"Dubai, UAE",av:"D",text:"Sales, repairs and inventory in one app. Offline capability is a major advantage."},
];

const Testimonials = () => (
  <section className="py-20 sm:py-28 bg-white border-t border-gray-100">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-xl mx-auto mb-12">
        <SectionLabel>Reviews</SectionLabel>
        <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Trusted by shop owners</h2>
        <p className="text-gray-500">From Sri Lanka to the Middle East.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {testimonialList.map((t,i)=>(
          <div key={i} className="card-lift rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex gap-0.5 mb-3" aria-label="5 stars">
              {[1,2,3,4,5].map(s=><span key={s} className="text-amber-400 text-sm">★</span>)}
            </div>
            <p className="text-gray-700 text-sm leading-relaxed mb-5">"{t.text}"</p>
            <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">{t.av}</div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{t.biz}</p>
                <p className="text-xs text-gray-400">{t.loc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

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
            title:"26+ Currencies",desc:"Every supported country maps to a real ISO 4217 code (same as the desktop app). Choose one currency for invoices, reports, and dashboard."},
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
const deploymentModes = [
  {
    id: "standalone",
    icon: "🖥️",
    title: "Single Computer",
    subtitle: "Standalone Mode",
    description: "All data stays on one PC. Best for a single-counter business without local network sharing.",
    badges: ["Full ERP", "No network needed", "Simple setup"],
    accent: "from-indigo-600 to-blue-600",
    panel: "bg-indigo-50 border-indigo-100",
  },
  {
    id: "network_server",
    icon: "🗄️",
    title: "Main Computer",
    subtitle: "Network Server",
    description: "This computer stores business data and serves other counters on LAN. Built for multi-PC shops.",
    badges: ["Full ERP", "Shares data to clients", "Auto server setup"],
    accent: "from-emerald-600 to-green-600",
    panel: "bg-emerald-50 border-emerald-100",
  },
  {
    id: "network_client",
    icon: "🧾",
    title: "Counter Computer",
    subtitle: "Network Client",
    description: "POS-focused terminal connected to the main server PC. Ideal for billing counters and front desks.",
    badges: ["POS-focused", "Needs server connection", "Lightweight counter terminal"],
    accent: "from-orange-500 to-amber-500",
    panel: "bg-orange-50 border-orange-100",
  },
];

const SystemModes = () => (
  <section className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Real ERP Architecture
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">System Deployment Modes</h2>
        <p className="text-gray-500 text-base sm:text-lg">Directly based on TechonERP setup wizard logic: choose the right mode for your shop layout, counters, and network setup.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-5 mb-8">
        {deploymentModes.map((mode) => (
          <div key={mode.id} className={`rounded-2xl border p-5 sm:p-6 ${mode.panel}`}>
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${mode.accent} text-white flex items-center justify-center text-xl mb-4 shadow-lg`}>
              <span aria-hidden>{mode.icon}</span>
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-1">{mode.subtitle}</p>
            <h3 className="text-xl font-black text-gray-900 mb-2">{mode.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{mode.description}</p>
            <div className="flex flex-wrap gap-2">
              {mode.badges.map((b) => (
                <span key={b} className="px-2.5 py-1 rounded-full bg-white/80 border border-white text-[11px] font-semibold text-gray-700">
                  {b}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl sm:rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
        <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-4">Operational Notes from Live ERP Behavior</h3>
        <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Mode lock</p>
            <p className="text-sm text-gray-600 leading-relaxed">After setup is completed, mode is locked. Changes require explicit <strong>Reset Setup</strong> from Settings to avoid accidental architecture changes.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Client restrictions</p>
            <p className="text-sm text-gray-600 leading-relaxed">Network Client mode is intentionally restricted from server/admin operations (server setup, backup management, service control) for safer counter usage.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Sync visibility</p>
            <p className="text-sm text-gray-600 leading-relaxed">Network modes include real-time connection and sync status indicators (connected, reconnecting, disconnected, synced, saving, failed).</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-2">Server behavior</p>
            <p className="text-sm text-gray-600 leading-relaxed">Network Server mode keeps full ERP/admin access while handling shared data flow for connected client terminals on the LAN.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const supportedIndustries = [
  {
    key: "tech",
    name: "Tech & Electronics",
    icon: "🖥️",
    covers: "Computer Shops, Mobile Phone Shops, CCTV & Security, Electronics Retail, IT Service Centers, Repair Shops",
    modules: { repairs: true, barcode: true, serial: true, expiry: false },
  },
  {
    key: "grocery",
    name: "Grocery & Supermarket",
    icon: "🛒",
    covers: "Grocery Stores, Supermarkets, Mini Markets, Convenience Stores, Wholesale Food",
    modules: { repairs: false, barcode: true, serial: false, expiry: true },
  },
  {
    key: "fashion",
    name: "Fashion & Apparel",
    icon: "👗",
    covers: "Clothing Stores, Footwear Shops, Bag & Accessory Stores, Boutiques, Textile Shops",
    modules: { repairs: false, barcode: true, serial: false, expiry: false },
  },
  {
    key: "hardware",
    name: "Hardware & Construction",
    icon: "🔧",
    covers: "Hardware Stores, Building Material Suppliers, Plumbing Shops, Electrical Supply, Paint & Tool Shops",
    modules: { repairs: false, barcode: true, serial: false, expiry: false },
  },
  {
    key: "pharmacy",
    name: "Health & Pharmacy",
    icon: "💊",
    covers: "Pharmacies, Medical Supply Stores, Herbal Shops, Optical Stores, Health & Wellness Stores",
    modules: { repairs: false, barcode: true, serial: false, expiry: true },
  },
  {
    key: "jewelry",
    name: "Jewelry & Watches",
    icon: "💍",
    covers: "Gold & Silver Jewelry, Watch Retailers, Gem Dealers, Pawn Shops, Custom Jewelry Makers",
    modules: { repairs: true, barcode: true, serial: false, expiry: false },
  },
  {
    key: "automotive",
    name: "Automotive",
    icon: "🚗",
    covers: "Auto Spare Parts, Tyre & Wheel Shops, Battery Dealers, Car Accessories, Service Centers",
    modules: { repairs: true, barcode: true, serial: false, expiry: false },
  },
  {
    key: "agriculture",
    name: "Agriculture & Livestock",
    icon: "🌾",
    covers: "Seed & Fertilizer Dealers, Pesticide Shops, Animal Feed, Veterinary Supplies, Irrigation Stores",
    modules: { repairs: false, barcode: true, serial: false, expiry: true },
  },
  {
    key: "general",
    name: "General Retail & Services",
    icon: "🏪",
    covers: "Stationery, Gift Stores, Sports & Fitness, Toy Stores, Book Shops, Salons, Service Businesses",
    modules: { repairs: true, barcode: true, serial: false, expiry: false },
  },
];

const SupportedIndustries = () => (
  <section className="py-12 sm:py-20 bg-gradient-to-b from-white to-slate-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
        <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Original ERP Profiles
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Supported Business Industries</h2>
        <p className="text-gray-500 text-base sm:text-lg">Real industry profiles from TechonERP onboarding. Each profile enables the right module behavior such as Repairs, Serial/IMEI handling, and Expiry tracking.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Profiles</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{supportedIndustries.length}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Repairs-enabled</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{supportedIndustries.filter((x) => x.modules.repairs).length}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Expiry-enabled</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{supportedIndustries.filter((x) => x.modules.expiry).length}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Serial/IMEI</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{supportedIndustries.filter((x) => x.modules.serial).length}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {supportedIndustries.map((industry) => (
          <div key={industry.key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-2xl" aria-hidden>{industry.icon}</span>
              <h3 className="text-lg font-black text-gray-900">{industry.name}</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{industry.covers}</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${industry.modules.repairs ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>Repairs {industry.modules.repairs ? "On" : "Off"}</span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200">Barcode On</span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${industry.modules.serial ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>Serial/IMEI {industry.modules.serial ? "On" : "Off"}</span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${industry.modules.expiry ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>Expiry {industry.modules.expiry ? "On" : "Off"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const regionSupport = [
  {
    region: "South Asia",
    icon: "🌏",
    countries: [
      { flag: "🇱🇰", name: "Sri Lanka", currencyCode: "LKR", currencyName: "Sri Lankan Rupee", symbol: "Rs" },
      { flag: "🇮🇳", name: "India", currencyCode: "INR", currencyName: "Indian Rupee", symbol: "₹" },
      { flag: "🇵🇰", name: "Pakistan", currencyCode: "PKR", currencyName: "Pakistani Rupee", symbol: "PKR" },
      { flag: "🇧🇩", name: "Bangladesh", currencyCode: "BDT", currencyName: "Bangladeshi Taka", symbol: "BDT" },
      { flag: "🇲🇻", name: "Maldives", currencyCode: "MVR", currencyName: "Maldivian Rufiyaa", symbol: "MVR" },
      { flag: "🇳🇵", name: "Nepal", currencyCode: "NPR", currencyName: "Nepali Rupee", symbol: "NPR" },
    ],
  },
  {
    region: "GCC / Middle East",
    icon: "🏜️",
    countries: [
      { flag: "🇦🇪", name: "United Arab Emirates", currencyCode: "AED", currencyName: "UAE Dirham", symbol: "AED" },
      { flag: "🇸🇦", name: "Saudi Arabia", currencyCode: "SAR", currencyName: "Saudi Riyal", symbol: "SAR" },
      { flag: "🇶🇦", name: "Qatar", currencyCode: "QAR", currencyName: "Qatari Riyal", symbol: "QAR" },
      { flag: "🇰🇼", name: "Kuwait", currencyCode: "KWD", currencyName: "Kuwaiti Dinar", symbol: "KWD" },
      { flag: "🇧🇭", name: "Bahrain", currencyCode: "BHD", currencyName: "Bahraini Dinar", symbol: "BHD" },
      { flag: "🇴🇲", name: "Oman", currencyCode: "OMR", currencyName: "Omani Rial", symbol: "OMR" },
    ],
  },
  {
    region: "Southeast & East Asia",
    icon: "🧭",
    countries: [
      { flag: "🇲🇾", name: "Malaysia", currencyCode: "MYR", currencyName: "Malaysian Ringgit", symbol: "MYR" },
      { flag: "🇸🇬", name: "Singapore", currencyCode: "SGD", currencyName: "Singapore Dollar", symbol: "SGD" },
      { flag: "🇮🇩", name: "Indonesia", currencyCode: "IDR", currencyName: "Indonesian Rupiah", symbol: "IDR" },
      { flag: "🇹🇭", name: "Thailand", currencyCode: "THB", currencyName: "Thai Baht", symbol: "฿" },
      { flag: "🇵🇭", name: "Philippines", currencyCode: "PHP", currencyName: "Philippine Peso", symbol: "₱" },
      { flag: "🇻🇳", name: "Vietnam", currencyCode: "VND", currencyName: "Vietnamese Dong", symbol: "VND" },
      { flag: "🇨🇳", name: "China", currencyCode: "CNY", currencyName: "Chinese Yuan", symbol: "CNY" },
      { flag: "🇯🇵", name: "Japan", currencyCode: "JPY", currencyName: "Japanese Yen", symbol: "¥" },
      { flag: "🇰🇷", name: "South Korea", currencyCode: "KRW", currencyName: "South Korean Won", symbol: "₩" },
    ],
  },
  {
    region: "Western Markets",
    icon: "🌍",
    countries: [
      { flag: "🇺🇸", name: "United States", currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
      { flag: "🇬🇧", name: "United Kingdom", currencyCode: "GBP", currencyName: "British Pound", symbol: "£" },
      { flag: "🇨🇦", name: "Canada", currencyCode: "CAD", currencyName: "Canadian Dollar", symbol: "CAD" },
      { flag: "🇦🇺", name: "Australia", currencyCode: "AUD", currencyName: "Australian Dollar", symbol: "AUD" },
      { flag: "🇩🇪", name: "Germany", currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
      { flag: "🇫🇷", name: "France", currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
      { flag: "🇮🇹", name: "Italy", currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
    ],
  },
];

const Currencies = () => {
  const allCountries = regionSupport.flatMap((group) => group.countries);
  const uniqueCurrencies = Array.from(new Set(allCountries.map((c) => c.currencyCode)));
  return (
    <section className="py-12 sm:py-20 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
          <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"/>Global Ready
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 leading-tight">Global Currencies &amp; Regions</h2>
          <p className="text-gray-500 text-base sm:text-lg">Real support data from TechonERP country settings. Pick your country once and your invoices, reports, totals and dashboard use the correct currency format.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 sm:mb-10">
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Countries</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{allCountries.length}</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Currencies</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{uniqueCurrencies.length}</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Regions</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{regionSupport.length}</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Setup Model</p>
            <p className="text-xs sm:text-sm font-bold text-gray-700 mt-1">Country-first mapping</p>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-5">
          {regionSupport.map((group) => (
            <div key={group.region} className="rounded-2xl sm:rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 sm:px-7 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm sm:text-base font-black text-gray-900 flex items-center gap-2">
                    <span className="text-lg" aria-hidden>{group.icon}</span>
                    {group.region}
                  </p>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{group.countries.length} Countries</span>
                </div>
              </div>
              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.countries.map((country) => (
                  <div key={country.name} className="rounded-xl border border-gray-100 bg-slate-50/80 px-3.5 py-3 hover:border-indigo-200 hover:bg-white transition-colors">
                    <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span className="text-base" aria-hidden>{country.flag}</span>
                      {country.name}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold text-indigo-700">{country.currencyCode}</span>
                      {" · "}
                      {country.currencyName}
                      {" · "}
                      <span className="font-semibold text-gray-700">{country.symbol}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

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
  <footer id="footer" className="bg-gray-950 text-gray-400">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border border-white/10 p-8 sm:p-10 mb-12 text-center">
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Ready to try TechonERP?</h3>
        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">Download the free 7-day trial. Full access, no credit card.</p>
        <a href="https://techon.lk/downloads/latest.zip" target="_blank" rel="noreferrer" className="btn-primary">
          Download free trial
        </a>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-between gap-8">
        <div>
          <p className="text-lg font-bold text-white">TechonERP</p>
          <p className="text-sm text-gray-500 mt-1">by Techon Computers · Matale, Sri Lanka</p>
        </div>
        <div className="space-y-2 text-sm">
          <a href="mailto:info@techon.lk" className="block hover:text-white transition-colors">info@techon.lk</a>
          <a href="tel:+94701234678" className="block hover:text-white transition-colors">+94 70 1234 678</a>
          <a href="https://wa.me/94701234678" target="_blank" rel="noreferrer" className="block hover:text-white transition-colors">WhatsApp</a>
        </div>
      </div>
      <p className="border-t border-gray-800 mt-10 pt-6 text-xs text-gray-600 text-center">
        © {new Date().getFullYear()} TechonERP. All rights reserved.
      </p>
    </div>
  </footer>
);

/* ─── FLOATING WHATSAPP ─────────────────────────────────────────── */
const WAButton = () => (
  <a href="https://wa.me/94701234678?text=Hi%2C+I%27m+interested+in+TechonERP." target="_blank" rel="noreferrer"
    className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-colors"
    aria-label="Chat on WhatsApp">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a9 9 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
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
    <div style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
      <style>{`html{scroll-behavior:smooth} *{box-sizing:border-box} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <FaviconSetter/>
      <Navbar/><Hero/><TrustBar/><Features/><Screenshots/><HowItWorks/><Pricing/><Testimonials/><Footer/><WAButton/>
    </div>
  );
}
