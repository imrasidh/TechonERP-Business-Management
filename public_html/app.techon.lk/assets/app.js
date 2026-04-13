/* ── TechonERP Dashboard ── */
const API='https://api.techon.lk';
const token=localStorage.getItem('tc_token');
if(!token){location.href='index.html';}
const CUR=localStorage.getItem('tc_currency')||'Rs';
const USER=localStorage.getItem('tc_name')||'';
const SHOP=localStorage.getItem('tc_shop')||'';

/* Boot UI */
['ds-av','top-av'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=USER?USER[0].toUpperCase():'?';});
['ds-uname','top-name'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=USER;});
['ds-shop','mh-shop'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=SHOP;});
document.title='TechonERP — '+SHOP;

/* Helpers */
const n   = v=>parseFloat(v)||0;
const fmt = v=>CUR+' '+n(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN= v=>Number(v||0).toLocaleString('en-US');
const fd  = d=>d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const fds = d=>d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'—';
const pct = (v,t)=>t>0?Math.round(v/t*100)+'%':'0%';
const ah  = ()=>({'Content-Type':'application/json','Authorization':'Bearer '+token});

async function api(sec,par=''){
  try{
    const r=await fetch(API+'/get_data.php?section='+sec+(par?'&'+par:''),{headers:ah()});
    /* NEVER auto-logout — only the logout button should log out.
       Token lasts 1 year; login.php preserves it when ERP syncs.
       A 401 just means show an error, not kick the user out. */
    if(!r.ok){
      console.warn('API',sec,r.status);
      return null;
    }
    const txt=await r.text();
    if(!txt||!txt.trim()) return null;
    try{return JSON.parse(txt);}
    catch(e){console.error('JSON error',sec,txt.slice(0,300));return null;}
  }catch(e){
    console.error('API network error',sec,e.message);
    return null;
  }
}

function bdg(s,small=false){
  const m={Paid:'green',paid:'green',Active:'green',active:'green',Delivered:'green',Completed:'green',Cleared:'green',cleared:'green',Partial:'amber',partial:'amber',Pending:'amber',pending:'amber',Ready:'cyan',Repairing:'blue',Unpaid:'red',unpaid:'red',Bounced:'red',inactive:'gray',Cancelled:'gray',Voided:'gray'};
  const cl=m[s]||'gray';
  return `<span class="bdg bdg-${cl}">${s||'—'}</span>`;
}

/* Modal */
function showModal(title,html){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(){document.getElementById('modal').classList.remove('open');document.body.style.overflow='';}
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});

/* Nav */
const TITLES={home:'Dashboard',invoices:'Invoices',purchases:'Purchases',inventory:'Products',customers:'Customers',suppliers:'Suppliers',statements:'Statements',receivables:'Receivables',payables:'Payables',accounts:'Accounts',cheques:'Cheques',repairs:'Repairs',expenses:'Expenses',returns:'Returns',reports:'Reports'};
const loaded={};

function goTo(sec){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('[data-sec]').forEach(n=>n.classList.toggle('active',n.dataset.sec===sec));
  const el=document.getElementById('sec-'+sec);
  if(el)el.classList.add('active');
  const pt=document.getElementById('page-title');
  if(pt)pt.textContent=TITLES[sec]||sec;
  closeSidebar();
  if(!loaded[sec]){
    const L={home:loadHome,invoices:()=>{invOff=0;loadInvoices();},purchases:()=>{purOff=0;loadPurchases();},inventory:loadInventory,customers:loadCustomers,suppliers:loadSuppliers,statements:loadStatementsInit,receivables:loadReceivables,payables:loadPayables,accounts:loadAccounts,cheques:loadCheques,repairs:loadRepairs,expenses:loadExpenses,returns:loadReturns,reports:initReports};
    if(L[sec]){L[sec]();loaded[sec]=true;}
  }
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('show');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('show');}
function doLogout(){localStorage.clear();location.href='index.html';}

/* ═══════════════════════ HOME ═══════════════════════ */
async function loadHome(){
  const el=document.getElementById('home-content');
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const today=new Date().toISOString().slice(0,10);
  const [od,tsd,lsd]=await Promise.all([api('overview'),api('sales_items',`limit=8&from=${today}&to=${today}`),api('low_stock')]);
  if(!od||!od.success){el.innerHTML='<div class="empty-state"><div class="ei">⚠️</div><p>Failed to load</p></div>';return;}

  const o=od.data,s=o.snapshot||{},ts=o.today_sales||{},te=o.today_expenses||{},ms=o.month_sales||{},ls=o.low_stock||{},pc=o.pending_cheques||{},or_=o.open_repairs||{};
  const cash=n(s.cash_balance),bank=n(s.bank_balance),total=cash+bank;
  const todayRev=n(ts.rev),todayColl=n(ts.coll),todayExp=n(te.total),todayP=todayColl-todayExp;
  const recv=n(s.total_receivable),pay=n(s.total_payable);
  const me=o.month_expenses||{};
  const monthRev=n(ms.rev),monthExp=n(me.total||0),monthP=monthRev-monthExp;
  const monthProfit=monthRev-monthExp;
  document.getElementById('sync-txt').textContent=s.updated_at?'Synced '+new Date(s.updated_at).toLocaleTimeString():'Connected';

  const recentSales=tsd?.data||[];
  const lowP=(lsd?.data||[]).filter(p=>n(p.stock)>0).slice(0,8);
  const outP=(lsd?.data||[]).filter(p=>n(p.stock)===0);

  let subHtml='';
  try{const sub=JSON.parse(localStorage.getItem('tc_sub')||'null');if(sub?.expires_at){const d=new Date(sub.expires_at);const daysLeft=Math.ceil((d-new Date())/86400000);const color=daysLeft<30?'var(--red)':daysLeft<90?'var(--amber)':'var(--green)';subHtml=`<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:16px;padding:13px 16px;color:#fff;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between"><div><div style="font-size:10px;font-weight:700;opacity:.75;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Dashboard Subscription</div><div style="font-size:15px;font-weight:800">Active</div><div style="font-size:11px;opacity:.7;margin-top:2px">Expires ${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} · ${daysLeft}d left</div></div><div style="background:rgba(255,255,255,0.15);padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;color:${color}">✓ Active</div></div>`;}}catch{}

  el.innerHTML=subHtml+`
    <div class="hero-card blue" onclick="goTo('invoices')">
      <div class="hc-label">🧾 Today's Sales</div>
      <div class="hc-val">${fmt(todayRev)}</div>
      <div class="hc-sub">📊 ${ts.cnt||0} invoices &nbsp;·&nbsp; Collected ${fmt(todayColl)}</div>
    </div>
    <div class="hero-card ${todayP>=0?'green':'red'}" onclick="goTo('reports')">
      <div class="hc-label">🎯 Today's Profit</div>
      <div class="hc-val">${fmt(todayP)}</div>
      <div class="hc-sub">${todayP>=0?'▲':'▼'} Collected − Expenses</div>
    </div>
    <div class="hc-2col">
      <div class="mini-card red" onclick="goTo('expenses')"><div class="mc-label">Today Expenses</div><div class="mc-val">${fmt(todayExp)}</div></div>
      <div class="mini-card amber" onclick="goTo('accounts')"><div class="mc-label">Cash in Hand</div><div class="mc-val">${fmt(cash)}</div><div class="mc-sub">Bank: ${fmt(bank)}</div></div>
    </div>
    <div class="hc-2col">
      <div class="mini-card cyan" onclick="goTo('receivables')"><div class="mc-label">Receivable</div><div class="mc-val">${fmt(recv)}</div><div class="mc-sub">Customers owe you</div></div>
      <div class="mini-card purple" onclick="goTo('payables')"><div class="mc-label">Payable</div><div class="mc-val">${fmt(pay)}</div><div class="mc-sub">You owe others</div></div>
    </div>
    ${(pc.cnt||0)>0?`<div style="background:var(--amber-soft);border:1px solid #fde68a;border-radius:12px;padding:11px 14px;margin-bottom:10px;font-size:13px;font-weight:600;color:#b45309">🏦 ${pc.cnt} cheques pending — ${fmt(pc.total)} <button onclick="goTo('cheques')" style="float:right;background:none;border:none;color:#b45309;font-weight:700;cursor:pointer">View →</button></div>`:''}
    ${(or_.cnt||0)>0?`<div style="background:var(--accent-soft);border:1px solid #bfdbfe;border-radius:12px;padding:11px 14px;margin-bottom:10px;font-size:13px;font-weight:600;color:#1d4ed8">🔧 ${or_.cnt} open repair jobs <button onclick="goTo('repairs')" style="float:right;background:none;border:none;color:#1d4ed8;font-weight:700;cursor:pointer">View →</button></div>`:''}
    <div class="sec-card">
      <div class="sec-head"><div><div class="sec-title">Recent Sales Today</div><div class="sec-sub">${recentSales.length} invoices</div></div><button class="see-all" onclick="goTo('invoices')">View All →</button></div>
      ${recentSales.length===0?'<div class="empty-state"><div class="ei">🧾</div><p>No sales today yet</p></div>':recentSales.map(s=>`
        <div class="tx-row" onclick="goTo('invoices')" style="cursor:pointer">
          <div class="tx-av s">🧾</div>
          <div class="tx-body"><div class="tx-name">${s.customer_name||'Walk-in'}</div><div class="tx-meta">${s.invoice_no||'—'} · ${(s.items||[]).length} items</div></div>
          <div class="tx-right"><div class="tx-amt pos">${fmt(s.total)}</div><div class="tx-time">${bdg(s.pay_status)}</div></div>
        </div>`).join('')}
    </div>
    ${lowP.length>0?`
    <div class="sec-card">
      <div class="sec-head"><div><div class="sec-title">⚠️ Low Stock</div><div class="sec-sub">${fmtN(ls.cnt||0)} items need attention</div></div><button class="see-all" onclick="goTo('inventory')">View All</button></div>
      ${lowP.map(p=>`
        <div class="tx-row" onclick="goTo('inventory')" style="cursor:pointer">
          <div class="tx-av" style="background:var(--amber-soft);color:var(--amber)">📦</div>
          <div class="tx-body"><div class="tx-name">${p.name}</div><div class="tx-meta">${p.category||'General'} · Cost: ${fmt(p.cost)}</div></div>
          <div class="tx-right"><div class="tx-amt" style="color:${n(p.stock)<=2?'var(--red)':'var(--amber)'}">${fmtN(p.stock)} left</div><div class="tx-time">${n(p.stock)===0?'<span class="bdg bdg-red">OUT</span>':'<span class="bdg bdg-amber">Low</span>'}</div></div>
        </div>`).join('')}
    </div>`:''}
    ${outP.length>0?`
    <div class="sec-card">
      <div class="sec-head"><div><div class="sec-title">🚫 Out of Stock</div><div class="sec-sub">${outP.length} products</div></div><button class="see-all" onclick="goTo('inventory')">View</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">${outP.map(p=>`<div onclick="goTo('inventory')" style="background:var(--red-soft);border:1px solid #fecaca;border-radius:10px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px"><span style="font-size:13px;font-weight:700">${p.name}</span><span class="bdg bdg-red">OUT</span></div>`).join('')}</div>
    </div>`:''}`;
}

/* ═══════════════════════ INVOICES ═══════════════════════ */
let invOff=0,invTot=0;
const SL=30;
function loadInvoices(){
  const c=document.getElementById('invoices-content');
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Invoices</div><span id="inv-count" class="page-sub"></span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['invoices'];invOff=0;loadInvoices()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <input type="text" class="search-box" id="inv-q" placeholder="Search invoice no, customer…" oninput="debounce(fetchInvoices,400)()"/>
    <div class="filter-row">
      <div class="fchip active" data-ist="" onclick="setFC(this,'inv-st','');invOff=0;fetchInvoices()">All</div>
      <div class="fchip" data-ist="Paid" onclick="setFC(this,'inv-st','Paid');invOff=0;fetchInvoices()">Paid</div>
      <div class="fchip" data-ist="Partial" onclick="setFC(this,'inv-st','Partial');invOff=0;fetchInvoices()">Partial</div>
      <div class="fchip" data-ist="Unpaid" onclick="setFC(this,'inv-st','Unpaid');invOff=0;fetchInvoices()">Unpaid</div>
    </div>
    <div class="filter-bar">
      <div class="fb-group"><div class="fb-label">From</div><input class="fb-input" type="date" id="inv-f"/></div><div class="fb-group"><div class="fb-label">To</div><input class="fb-input" type="date" id="inv-t"/></div>
      <button class="btn-sm btn-blue" onclick="invOff=0;fetchInvoices()">Go</button>
      <button class="btn-sm btn-gray" onclick="['inv-f','inv-t','inv-q'].forEach(x=>{const e=document.getElementById(x);if(e)e.value='';});invOff=0;fetchInvoices()">Clear</button>
    </div>
    <div id="inv-list"></div>
    <div id="inv-totals" class="totals-bar"></div>
    <div class="pager" id="inv-pager" style="display:none"><span class="pager-info" id="inv-pi"></span><div class="pager-btns"><button class="btn-sm btn-gray" onclick="invPage(-1)">← Prev</button><button class="btn-sm btn-gray" onclick="invPage(1)">Next →</button></div></div>`;
  fetchInvoices();
}
let _invSt='';
function setFC(el,key,val){document.querySelectorAll('[data-ist]').forEach(x=>x.classList.remove('active'));el.classList.add('active');_invSt=val;}
async function fetchInvoices(){
  document.getElementById('inv-list').innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const from=v('inv-f'),to=v('inv-t');
  let p=`limit=${SL}&offset=${invOff}`;if(from)p+='&from='+from;if(to)p+='&to='+to;if(_invSt)p+='&status='+encodeURIComponent(_invSt);
  const d=await api('sales_items',p);if(!d||!d.success){document.getElementById('inv-list').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  invTot=d.total||0;
  const cntEl=document.getElementById('inv-count');if(cntEl)cntEl.textContent=fmtN(invTot)+' invoices';
  let data=d.data;
  const q=(v('inv-q')||'').toLowerCase();
  if(q)data=data.filter(s=>(s.invoice_no||'').toLowerCase().includes(q)||(s.customer_name||'').toLowerCase().includes(q));
  if(!data.length){document.getElementById('inv-list').innerHTML='<div class="empty-state"><div class="ei">🧾</div><p>No invoices found</p></div>';document.getElementById('inv-totals').innerHTML='';document.getElementById('inv-pager').style.display='none';return;}
  const tT=data.reduce((a,s)=>a+n(s.total),0),tP=data.reduce((a,s)=>a+n(s.paid),0),tB=data.reduce((a,s)=>a+n(s.balance),0);
  document.getElementById('inv-list').innerHTML=data.map((s,i)=>invCard(s,i,'inv')).join('');
  document.getElementById('inv-totals').innerHTML=`<span>Total: <b style="color:var(--accent)">${fmt(tT)}</b></span><span>Paid: <b style="color:var(--green)">${fmt(tP)}</b></span><span>Balance: <b style="color:${tB>0?'var(--red)':'var(--green)'}">${fmt(tB)}</b></span>`;
  const pg=document.getElementById('inv-pager');pg.style.display=invTot>SL?'flex':'none';
  const pi=document.getElementById('inv-pi');if(pi)pi.textContent=`${invOff+1}–${Math.min(invOff+SL,invTot)} of ${fmtN(invTot)}`;
}
function invCard(s,i,prefix){
  const bal=n(s.balance),ph=(s.payment_history||[]).slice(-1)[0];
  return `<div class="list-item" onclick="toggleExp('${prefix}-exp-${i}')">
    <div class="li-top"><span class="li-ref">${s.invoice_no||s.id?.slice(0,8)||'—'}</span><span class="li-date">${fd(s.sale_date||s.date)}</span></div>
    <div class="li-name">${s.customer_name||'Walk-in'}${s.customer_phone?` <span style="font-size:11px;color:var(--muted)">· ${s.customer_phone}</span>`:''}</div>
    <div class="li-row2"><span class="li-total">${fmt(s.total)}</span><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--muted)">${(s.items||[]).length} items</span>${bdg(s.pay_status)}</div></div>
    <div class="li-expand" id="${prefix}-exp-${i}">
      <div class="li-sub-row"><span class="li-sub-l">Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(s.paid)}</span></div>
      <div class="li-sub-row"><span class="li-sub-l">Balance</span><span class="li-sub-v" style="color:${bal>0?'var(--red)':'var(--green)'}">${bal>0?fmt(bal):'Settled ✓'}</span></div>
      ${ph?`<div class="li-sub-row"><span class="li-sub-l">Last Payment</span><span class="li-sub-v">${fd(ph.date)} · ${fmt(ph.amount)}</span></div>`:''}
      ${(s.items||[]).length?`<div style="margin-top:8px"><div class="data-label">Items</div>
        <table class="mini-tbl"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${(s.items||[]).map(it=>`<tr><td style="font-weight:600">${it.name||'—'}</td><td style="text-align:center">${it.qty||1}</td><td>${fmt(it.price||0)}</td><td style="font-weight:700">${fmt((it.price||0)*(it.qty||1))}</td></tr>`).join('')}
        </tbody></table></div>`:''}
      ${(s.payment_history||[]).filter(ph=>ph.amount>0).length?`<div style="margin-top:8px"><div class="data-label">Payment History</div>
        ${(s.payment_history||[]).filter(ph=>ph.amount>0).map(ph=>`<div class="ph-row"><span style="color:var(--muted)">${fd(ph.date)}</span><span style="color:var(--text-md);font-size:11px">${ph.cashMethod||ph.method||'Cash'}${ph.note?' · '+ph.note:''}</span><span class="ph-amt">${fmt(ph.amount)}</span></div>`).join('')}</div>`:''}
    </div>
  </div>`;
}
function invPage(dir){invOff=Math.max(0,Math.min(invOff+dir*SL,invTot-1));fetchInvoices();}

/* ═══════════════════════ PURCHASES ═══════════════════════ */
let purOff=0,purTot=0;
function loadPurchases(){
  const c=document.getElementById('purchases-content');
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Purchases</div><span id="pur-count" class="page-sub"></span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['purchases'];loadPurchases()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="filter-bar">
      <div class="fb-group"><div class="fb-label">From</div><input class="fb-input" type="date" id="pur-f"/></div>
      <div class="fb-group"><div class="fb-label">To</div><input class="fb-input" type="date" id="pur-t"/></div>
      <button class="btn-sm btn-blue" onclick="purOff=0;fetchPurchases()">Go</button>
      <button class="btn-sm btn-gray" onclick="['pur-f','pur-t'].forEach(x=>{const e=document.getElementById(x);if(e)e.value=''});purOff=0;fetchPurchases()">Clear</button>
    </div>
    <div id="pur-list"></div>
    <div id="pur-totals" class="totals-bar"></div>`;
  fetchPurchases();
}
async function fetchPurchases(){
  document.getElementById('pur-list').innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const from=v('pur-f'),to=v('pur-t');
  let p=`limit=50&offset=${purOff}`;if(from)p+='&from='+from;if(to)p+='&to='+to;
  const d=await api('purchases',p);if(!d||!d.success){document.getElementById('pur-list').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  purTot=d.total||d.data.length;
  const cEl=document.getElementById('pur-count');if(cEl)cEl.textContent=fmtN(purTot)+' orders';
  if(!d.data.length){document.getElementById('pur-list').innerHTML='<div class="empty-state"><div class="ei">🛒</div><p>No purchases found</p></div>';document.getElementById('pur-totals').innerHTML='';return;}
  const tT=d.data.reduce((a,p)=>a+n(p.total),0),tP=d.data.reduce((a,p)=>a+n(p.paid_amount),0),tB=d.data.reduce((a,p)=>a+n(p.balance),0);
  document.getElementById('pur-list').innerHTML=d.data.map((p,i)=>`
    <div class="list-item" onclick="toggleExp('pur-exp-${i}')">
      <div class="li-top"><span class="li-ref">${p.invoice_no||'—'}</span><span class="li-date">${fd(p.purchase_date||p.date)}</span></div>
      <div class="li-name">${p.supplier||'—'}</div>
      <div class="li-row2"><span class="li-total">${fmt(p.total)}</span><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;color:var(--muted)">${(p.items||[]).length} items</span>${bdg(p.status)}</div></div>
      <div class="li-expand" id="pur-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(p.paid_amount)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Balance</span><span class="li-sub-v" style="color:${n(p.balance)>0?'var(--red)':'var(--green)'}">${n(p.balance)>0?fmt(p.balance):'Settled ✓'}</span></div>
        ${(p.items||[]).length?`<div style="margin-top:8px"><div class="data-label">Items</div>
          <table class="mini-tbl"><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead><tbody>
          ${(p.items||[]).map(it=>`<tr><td style="font-weight:600">${it.name||'—'}</td><td style="text-align:center">${it.qty||1}</td><td>${fmt(it.cost||0)}</td><td style="font-weight:700">${fmt((it.cost||0)*(it.qty||1))}</td></tr>`).join('')}
          </tbody></table></div>`:''}
        ${(p.payment_history||[]).filter(ph=>ph.amount>0).length?`<div style="margin-top:8px"><div class="data-label">Payment History</div>
          ${(p.payment_history||[]).filter(ph=>ph.amount>0).map(ph=>`<div class="ph-row"><span style="color:var(--muted)">${fd(ph.date)}</span><span style="color:var(--text-md);font-size:11px">${ph.method||'Cash'}${ph.note?' · '+ph.note:''}</span><span class="ph-amt">${fmt(ph.amount)}</span></div>`).join('')}</div>`:''}
      </div>
    </div>`).join('');
  document.getElementById('pur-totals').innerHTML=`<span>Total: <b style="color:var(--accent)">${fmt(tT)}</b></span><span>Paid: <b style="color:var(--green)">${fmt(tP)}</b></span><span>Balance: <b style="color:${tB>0?'var(--red)':'var(--green)'}">${fmt(tB)}</b></span>`;
}

/* ═══════════════════════ INVENTORY ═══════════════════════ */
let allProds=[];
async function loadInventory(){
  const c=document.getElementById('inventory-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('products');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allProds=d.data;
  const tv=allProds.reduce((a,p)=>a+n(p.cost)*n(p.stock),0);
  const tvR=allProds.reduce((a,p)=>a+n(p.price)*n(p.stock),0);
  const ls=allProds.filter(p=>n(p.stock)>0&&n(p.stock)<=5).length;
  const os=allProds.filter(p=>n(p.stock)===0).length;
  const is_=allProds.filter(p=>n(p.stock)>5).length;
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Products</div><span class="page-sub">${fmtN(allProds.length)} products</span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['inventory'];loadInventory()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="hc-2col" style="margin-bottom:10px">
      <div class="mini-card"><div class="mc-label">Retail Value</div><div class="mc-val" style="font-size:15px">${fmt(tvR)}</div><div class="mc-sub">Cost: ${fmt(tv)}</div></div>
      <div class="mini-card amber"><div class="mc-label">Low Stock</div><div class="mc-val" style="color:var(--amber)">${fmtN(ls)}</div><div class="mc-sub" style="color:var(--red)">${fmtN(os)} out of stock</div></div>
    </div>
    <input type="text" class="search-box" id="prod-q" placeholder="Search name, barcode, category…" oninput="filterProds()"/>
    <div class="filter-row">
      <div class="fchip active" data-pf="all" onclick="setPF(this,'all')">All</div>
      <div class="fchip" data-pf="in" onclick="setPF(this,'in')">In Stock (${fmtN(is_)})</div>
      <div class="fchip" data-pf="low" onclick="setPF(this,'low')">Low (${fmtN(ls)})</div>
      <div class="fchip" data-pf="out" onclick="setPF(this,'out')">Out (${fmtN(os)})</div>
    </div>
    <div id="prod-list"></div>`;
  renderProds(allProds);
}
let _pf='all';
function setPF(el,f){document.querySelectorAll('[data-pf]').forEach(x=>x.classList.remove('active'));el.classList.add('active');_pf=f;filterProds();}
function filterProds(){
  const q=(v('prod-q')||'').toLowerCase();
  let pp=allProds.filter(p=>p.name.toLowerCase().includes(q)||(p.barcode||'').toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q));
  if(_pf==='low')pp=pp.filter(p=>n(p.stock)>0&&n(p.stock)<=5);
  else if(_pf==='out')pp=pp.filter(p=>n(p.stock)===0);
  else if(_pf==='in')pp=pp.filter(p=>n(p.stock)>5);
  renderProds(pp);
}
function renderProds(pp){
  const el=document.getElementById('prod-list');if(!el)return;
  if(!pp.length){el.innerHTML='<div class="empty-state"><div class="ei">📦</div><p>No products found</p></div>';return;}
  el.innerHTML=pp.map((p,i)=>{
    const sc=n(p.stock),col=sc===0?'var(--red)':sc<=5?'var(--amber)':'var(--green)';
    const potProfit=n(p.price)*sc-n(p.cost)*sc;
    return `<div class="list-item" onclick="toggleExp('pd-exp-${i}')">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:42px;height:42px;border-radius:11px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${p.category?p.category[0]:'📦'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${p.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">${p.category||'General'}${p.barcode?' · <span style="font-family:monospace">'+p.barcode+'</span>':''}</div>
          ${sc===0?'<span class="bdg bdg-red" style="margin-top:3px">Out of Stock</span>':sc<=5?`<span class="bdg bdg-amber" style="margin-top:3px">Low Stock</span>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:15px;font-weight:800">${fmt(p.price)}</div>
          <div style="font-size:11px;color:var(--muted)">Cost: ${fmt(p.cost)}</div>
          <div style="font-size:13px;font-weight:800;color:${col};margin-top:2px">${fmtN(sc)} units</div>
        </div>
      </div>
      <div class="li-expand" id="pd-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Stock Value (cost)</span><span class="li-sub-v">${fmt(n(p.cost)*sc)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Retail Value</span><span class="li-sub-v">${fmt(n(p.price)*sc)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Potential Profit</span><span class="li-sub-v" style="color:var(--green)">${fmt(potProfit)}</span></div>
        ${n(p.damaged)>0?`<div class="li-sub-row"><span class="li-sub-l">Damaged Units</span><span class="li-sub-v" style="color:var(--red)">${fmtN(p.damaged)}</span></div>`:''}
        ${p.description?`<div style="font-size:12px;color:var(--muted);margin-top:6px;padding-top:6px;border-top:1px solid var(--border-lt)">${p.description}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════ CUSTOMERS ═══════════════════════ */
let allCusts=[];
async function loadCustomers(){
  const c=document.getElementById('customers-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('customers');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allCusts=d.data;
  const totalOwed=allCusts.reduce((a,c)=>a+n(c.credit),0);
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Customers</div><span class="page-sub">${fmtN(allCusts.length)} customers</span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['customers'];allCusts=[];loadCustomers()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    ${totalOwed>0?`<div style="background:var(--amber-soft);border:1px solid #fde68a;border-radius:12px;padding:11px 14px;margin-bottom:10px;font-size:13px;font-weight:600;color:#b45309">💳 Total Outstanding: ${fmt(totalOwed)}</div>`:''}
    <input type="text" class="search-box" id="cust-q" placeholder="Search name, phone…" oninput="filterCusts()"/>
    <div id="cust-list"></div>`;
  renderCusts(allCusts);
}
function filterCusts(){const q=(v('cust-q')||'').toLowerCase();renderCusts(allCusts.filter(c=>c.name.toLowerCase().includes(q)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(q)));}
function renderCusts(cc){
  const el=document.getElementById('cust-list');if(!el)return;
  if(!cc.length){el.innerHTML='<div class="empty-state"><div class="ei">👤</div><p>No customers found</p></div>';return;}
  el.innerHTML=cc.map((c,i)=>`
    <div class="list-item" onclick="toggleExp('c-exp-${i}')">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:var(--accent);flex-shrink:0">${c.name?c.name[0].toUpperCase():'?'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700">${c.name}</div>
          <div style="font-size:11px;color:var(--muted)">${c.phone||'—'}${c.email?' · '+c.email:''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:800;color:var(--green)">${fmt(c.total_spent||0)}</div>
          ${n(c.credit)>0?`<div style="font-size:11px;font-weight:700;color:var(--red)">Owes: ${fmt(c.credit)}</div>`:'<div style="font-size:11px;color:var(--muted)">Settled</div>'}
        </div>
      </div>
      <div class="li-expand" id="c-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Total Billed</span><span class="li-sub-v">${fmt(c.total_spent||0)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Total Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(c.total_paid||0)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Outstanding</span><span class="li-sub-v" style="color:${n(c.credit)>0?'var(--red)':'var(--green)'}">${n(c.credit)>0?fmt(c.credit):'Settled ✓'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Total Invoices</span><span class="li-sub-v">${fmtN(c.invoice_count||0)}</span></div>
        ${c.address?`<div class="li-sub-row"><span class="li-sub-l">Address</span><span class="li-sub-v">${c.address}</span></div>`:''}
        <div style="margin-top:8px;display:flex;gap:7px">
          <button class="btn-sm btn-blue" onclick="event.stopPropagation();viewCustStmt('${c.id}','${(c.name||'').replace(/'/g,"\\'")}')">📋 Statement</button>
          <button class="btn-sm btn-gray" onclick="event.stopPropagation();viewCustInvoices('${c.id}','${(c.name||'').replace(/'/g,"\\'")}')">🧾 Invoices</button>
        </div>
      </div>
    </div>`).join('');
}
async function viewCustStmt(id,name){
  showModal('Statement — '+name,'<div class="loading"><div class="spinner"></div></div>');
  const d=await api('customer_statement','customer_id='+id);
  if(!d||!d.success){document.getElementById('modal-body').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  renderCustStmtModal(d.data,name);
}
async function viewCustInvoices(id,name){
  showModal('Invoices — '+name,'<div class="loading"><div class="spinner"></div></div>');
  const d=await api('customer_statement','customer_id='+id);
  if(!d||!d.success){document.getElementById('modal-body').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const sales=d.data.sales||[];
  if(!sales.length){document.getElementById('modal-body').innerHTML='<div class="empty-state"><div class="ei">🧾</div><p>No invoices</p></div>';return;}
  document.getElementById('modal-body').innerHTML=sales.map((s,i)=>invCard(s,i,'ci')).join('');
}
function renderCustStmtModal(data,name){
  const c=data.customer||{},sales=data.sales||[],returns=data.returns||[];
  const tBal=sales.reduce((a,s)=>a+n(s.balance),0);
  const tSpent=sales.reduce((a,s)=>a+n(s.total),0);
  const tPaid=sales.reduce((a,s)=>a+n(s.paid),0);
  /* Build ledger rows like ERP */
  let rows=[];
  sales.forEach(s=>{
    rows.push({date:s.sale_date||s.date,type:'Invoice',ref:s.invoice_no||'—',detail:(s.items||[]).map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')||'—',debit:n(s.total),credit:0});
    (s.payment_history||[]).filter(ph=>ph.amount>0).forEach(ph=>{rows.push({date:ph.date||s.sale_date,type:'Payment',ref:s.invoice_no||'—',detail:'Payment'+((ph.cashMethod||ph.method)?` — ${ph.cashMethod||ph.method}`:'')+(ph.note?' · '+ph.note:''),debit:0,credit:n(ph.amount)});});
  });
  returns.forEach(r=>{rows.push({date:r.return_date||r.date,type:'Return',ref:r.invoice_no||'—',detail:(r.product_name||'Return')+(r.reason?' — '+r.reason:''),debit:0,credit:n(r.amount||0)});});
  rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  let running=0;
  const withBal=rows.map(r=>{running+=r.debit-r.credit;return {...r,running};});
  document.getElementById('modal-body').innerHTML=`
    <div class="stmt-hero">
      <div class="stmt-name">${c.name||name}</div>
      <div class="stmt-contact">${c.phone||''}${c.email?' · '+c.email:''}${c.address?' · '+c.address:''}</div>
      <div class="stmt-kpis">
        <div class="stmt-kpi"><div class="stmt-kpi-l">Total Billed</div><div class="stmt-kpi-v">${fmt(tSpent)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Total Paid</div><div class="stmt-kpi-v" style="color:#6ee7b7">${fmt(tPaid)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Outstanding</div><div class="stmt-kpi-v" style="color:${tBal>0?'#fca5a5':'#6ee7b7'}">${fmt(tBal)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Invoices</div><div class="stmt-kpi-v">${fmtN(sales.length)}</div></div>
      </div>
    </div>
    <div style="overflow-x:auto;margin-top:10px">
      <table class="stmt-tbl"><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Detail</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        ${withBal.map(r=>`<tr>
          <td style="white-space:nowrap">${fd(r.date)}</td>
          <td><span class="bdg bdg-${r.type==='Payment'?'green':r.type==='Return'?'amber':'blue'}">${r.type}</span></td>
          <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.ref}</td>
          <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.detail}</td>
          <td style="font-weight:700;color:var(--red)">${r.debit>0?fmt(r.debit):'—'}</td>
          <td style="font-weight:700;color:var(--green)">${r.credit>0?fmt(r.credit):'—'}</td>
          <td style="font-weight:800;color:${r.running>0?'var(--red)':r.running<0?'var(--green)':'var(--muted)'}">${fmt(r.running)}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;
}

/* ═══════════════════════ SUPPLIERS ═══════════════════════ */
let allSupps=[];
async function loadSuppliers(){
  const c=document.getElementById('suppliers-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('suppliers');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allSupps=d.data;
  const totalOwed=allSupps.reduce((a,s)=>a+n(s.balance),0);
  c.innerHTML=`
    <div class="page-head"><div class="page-title">Suppliers</div><span class="page-sub">${fmtN(allSupps.length)} suppliers</span></div>
    ${totalOwed>0?`<div style="background:var(--red-soft);border:1px solid #fecaca;border-radius:12px;padding:11px 14px;margin-bottom:10px;font-size:13px;font-weight:600;color:#dc2626">🏭 Total Owed to Suppliers: ${fmt(totalOwed)}</div>`:''}
    <input type="text" class="search-box" id="supp-q" placeholder="Search supplier…" oninput="filterSupps()"/>
    <div id="supp-list"></div>`;
  renderSupps(allSupps);
}
function filterSupps(){const q=(v('supp-q')||'').toLowerCase();renderSupps(allSupps.filter(s=>s.name.toLowerCase().includes(q)||(s.phone||'').includes(q)));}
function renderSupps(ss){
  const el=document.getElementById('supp-list');if(!el)return;
  if(!ss.length){el.innerHTML='<div class="empty-state"><div class="ei">🏭</div><p>No suppliers found</p></div>';return;}
  el.innerHTML=ss.map((s,i)=>`
    <div class="list-item" onclick="toggleExp('sp-exp-${i}')">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--amber-soft);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:var(--amber);flex-shrink:0">${s.name?s.name[0].toUpperCase():'?'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700">${s.name}</div>
          <div style="font-size:11px;color:var(--muted)">${s.phone||'—'}${s.email?' · '+s.email:''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--muted)">${fmtN(s.purchase_count||0)} orders</div>
          ${n(s.balance)>0?`<div style="font-size:13px;font-weight:800;color:var(--red)">Owe: ${fmt(s.balance)}</div>`:`<span class="bdg bdg-green" style="margin-top:2px">Settled</span>`}
        </div>
      </div>
      <div class="li-expand" id="sp-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Total Purchased</span><span class="li-sub-v">${fmt(s.total_purchased||0)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Total Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(s.total_paid||0)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Balance Owed</span><span class="li-sub-v" style="color:${n(s.balance)>0?'var(--red)':'var(--green)'}">${n(s.balance)>0?fmt(s.balance):'Settled ✓'}</span></div>
        ${s.address?`<div class="li-sub-row"><span class="li-sub-l">Address</span><span class="li-sub-v">${s.address}</span></div>`:''}
        <div style="margin-top:8px">
          <button class="btn-sm btn-blue" onclick="event.stopPropagation();viewSuppStmt('${s.id}','${(s.name||'').replace(/'/g,"\\'")}')">📋 Statement</button>
        </div>
      </div>
    </div>`).join('');
}
async function viewSuppStmt(id,name){
  showModal('Statement — '+name,'<div class="loading"><div class="spinner"></div></div>');
  const d=await api('supplier_statement','supplier_id='+id);
  if(!d||!d.success){document.getElementById('modal-body').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const s=d.data.supplier||{},purch=d.data.purchases||[];
  const tBal=purch.reduce((a,p)=>a+n(p.balance),0);
  const tOrd=purch.reduce((a,p)=>a+n(p.total),0);
  const tPaid=purch.reduce((a,p)=>a+n(p.paid_amount),0);
  let rows=[];
  purch.forEach(p=>{
    rows.push({date:p.purchase_date||p.date,type:'Purchase',ref:p.invoice_no||'—',detail:(p.items||[]).map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')||'—',debit:n(p.total),credit:0});
    (p.payment_history||[]).filter(ph=>ph.amount>0).forEach(ph=>{rows.push({date:ph.date||p.purchase_date,type:'Payment',ref:p.invoice_no||'—',detail:'Payment made'+(ph.method?' — '+ph.method:''),debit:0,credit:n(ph.amount)});});
  });
  rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  let running=0;
  const withBal=rows.map(r=>{running+=r.debit-r.credit;return {...r,running};});
  document.getElementById('modal-body').innerHTML=`
    <div class="stmt-hero">
      <div class="stmt-name">${s.name||name}</div>
      <div class="stmt-contact">${s.phone||''}${s.email?' · '+s.email:''}</div>
      <div class="stmt-kpis">
        <div class="stmt-kpi"><div class="stmt-kpi-l">Total Ordered</div><div class="stmt-kpi-v">${fmt(tOrd)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Total Paid</div><div class="stmt-kpi-v" style="color:#6ee7b7">${fmt(tPaid)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Balance Owed</div><div class="stmt-kpi-v" style="color:${tBal>0?'#fca5a5':'#6ee7b7'}">${fmt(tBal)}</div></div>
        <div class="stmt-kpi"><div class="stmt-kpi-l">Orders</div><div class="stmt-kpi-v">${fmtN(purch.length)}</div></div>
      </div>
    </div>
    <div style="overflow-x:auto;margin-top:10px">
      <table class="stmt-tbl"><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Detail</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        ${withBal.map(r=>`<tr>
          <td style="white-space:nowrap">${fd(r.date)}</td>
          <td><span class="bdg bdg-${r.type==='Payment'?'green':'amber'}">${r.type}</span></td>
          <td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.ref}</td>
          <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.detail}</td>
          <td style="font-weight:700;color:var(--red)">${r.debit>0?fmt(r.debit):'—'}</td>
          <td style="font-weight:700;color:var(--green)">${r.credit>0?fmt(r.credit):'—'}</td>
          <td style="font-weight:800;color:${r.running>0?'var(--red)':r.running<0?'var(--green)':'var(--muted)'}">${fmt(r.running)}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;
}

/* ═══════════════════════ STATEMENTS ═══════════════════════ */
async function loadStatementsInit(){
  const c=document.getElementById('statements-content');
  c.innerHTML=`
    <div class="page-head"><div class="page-title">Statements</div></div>
    <div class="sec-card" style="margin-bottom:12px">
      <div style="margin-bottom:8px"><label style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Statement Type</label><select class="fi" id="stmt-type" onchange="populateStmtSel()"><option value="customer">👤 Customer Statement</option><option value="supplier">🏭 Supplier Statement</option></select></div>
      <div style="margin-bottom:10px"><label style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px">Select Person</label><select class="fi" id="stmt-id"><option value="">Choose…</option></select></div>
      <button class="btn-sm btn-blue" style="width:100%" onclick="loadStatement()">View Statement</button>
    </div>
    <div id="stmt-result"></div>`;
  if(!allCusts.length)await loadCustomers();
  if(!allSupps.length)await loadSuppliers();
  populateStmtSel();
}
function populateStmtSel(){
  const t=v('stmt-type');const sel=document.getElementById('stmt-id');if(!sel)return;
  sel.innerHTML='<option value="">Select…</option>';
  const list=t==='customer'?allCusts:allSupps;
  list.forEach(x=>{const o=new Option(x.name+(t==='customer'&&n(x.credit)>0?` (owes ${fmt(x.credit)})`:t==='supplier'&&n(x.balance)>0?` (owed ${fmt(x.balance)})`:' ✓'),x.id);sel.appendChild(o);});
}
async function loadStatement(){
  const t=v('stmt-type'),id=v('stmt-id'),name=document.getElementById('stmt-id')?.selectedOptions[0]?.text||'';
  if(!id){document.getElementById('stmt-result').innerHTML='<div class="sec-card"><div class="empty-state"><p>Select a person above</p></div></div>';return;}
  document.getElementById('stmt-result').innerHTML='<div class="loading"><div class="spinner"></div></div>';
  if(t==='customer'){
    const d=await api('customer_statement','customer_id='+id);
    if(!d||!d.success){document.getElementById('stmt-result').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
    const c=d.data.customer||{};
    const tmpModal={querySelector:()=>null};
    const sales=d.data.sales||[],returns=d.data.returns||[];
    const tBal=sales.reduce((a,s)=>a+n(s.balance),0),tSpent=sales.reduce((a,s)=>a+n(s.total),0),tPaid=sales.reduce((a,s)=>a+n(s.paid),0);
    let rows=[];
    sales.forEach(s=>{
      rows.push({date:s.sale_date||s.date,type:'Invoice',ref:s.invoice_no||'—',detail:(s.items||[]).map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')||'—',debit:n(s.total),credit:0});
      (s.payment_history||[]).filter(ph=>ph.amount>0).forEach(ph=>{rows.push({date:ph.date||s.sale_date,type:'Payment',ref:s.invoice_no||'—',detail:'Payment'+(ph.cashMethod?' — '+ph.cashMethod:''),debit:0,credit:n(ph.amount)});});
    });
    returns.forEach(r=>{rows.push({date:r.return_date,type:'Return',ref:r.invoice_no||'—',detail:r.product_name||'Return',debit:0,credit:n(r.amount||0)});});
    rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let running=0;const wb=rows.map(r=>{running+=r.debit-r.credit;return{...r,running};});
    document.getElementById('stmt-result').innerHTML=`
      <div class="stmt-hero"><div class="stmt-name">${c.name||name}</div><div class="stmt-contact">${c.phone||''}${c.email?' · '+c.email:''}</div>
        <div class="stmt-kpis">
          <div class="stmt-kpi"><div class="stmt-kpi-l">Billed</div><div class="stmt-kpi-v">${fmt(tSpent)}</div></div>
          <div class="stmt-kpi"><div class="stmt-kpi-l">Paid</div><div class="stmt-kpi-v" style="color:#6ee7b7">${fmt(tPaid)}</div></div>
          <div class="stmt-kpi"><div class="stmt-kpi-l">Outstanding</div><div class="stmt-kpi-v" style="color:${tBal>0?'#fca5a5':'#6ee7b7'}">${fmt(tBal)}</div></div>
        </div>
      </div>
      <div style="overflow-x:auto;margin-top:10px"><table class="stmt-tbl"><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Detail</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        ${wb.map(r=>`<tr><td style="white-space:nowrap">${fd(r.date)}</td><td>${bdg(r.type)}</td><td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.ref}</td><td style="font-size:12px">${r.detail}</td><td style="color:var(--red);font-weight:700">${r.debit>0?fmt(r.debit):'—'}</td><td style="color:var(--green);font-weight:700">${r.credit>0?fmt(r.credit):'—'}</td><td style="font-weight:800;color:${r.running>0?'var(--red)':r.running<0?'var(--green)':'var(--muted)'}">${fmt(r.running)}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else {
    const d=await api('supplier_statement','supplier_id='+id);
    if(!d||!d.success){document.getElementById('stmt-result').innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
    viewSuppStmt(id,name);// reuse modal but put in page... just call the stmt builder inline
    const s=d.data.supplier||{},purch=d.data.purchases||[];
    const tBal=purch.reduce((a,p)=>a+n(p.balance),0),tOrd=purch.reduce((a,p)=>a+n(p.total),0),tPaid=purch.reduce((a,p)=>a+n(p.paid_amount),0);
    let rows=[];
    purch.forEach(p=>{
      rows.push({date:p.purchase_date||p.date,type:'Purchase',ref:p.invoice_no||'—',detail:(p.items||[]).map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')||'—',debit:n(p.total),credit:0});
      (p.payment_history||[]).filter(ph=>ph.amount>0).forEach(ph=>{rows.push({date:ph.date||p.purchase_date,type:'Payment',ref:p.invoice_no||'—',detail:'Payment made',debit:0,credit:n(ph.amount)});});
    });
    rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let running=0;const wb=rows.map(r=>{running+=r.debit-r.credit;return{...r,running};});
    document.getElementById('stmt-result').innerHTML=`
      <div class="stmt-hero"><div class="stmt-name">${s.name||name}</div><div class="stmt-contact">${s.phone||''}${s.email?' · '+s.email:''}</div>
        <div class="stmt-kpis">
          <div class="stmt-kpi"><div class="stmt-kpi-l">Total Ordered</div><div class="stmt-kpi-v">${fmt(tOrd)}</div></div>
          <div class="stmt-kpi"><div class="stmt-kpi-l">Paid</div><div class="stmt-kpi-v" style="color:#6ee7b7">${fmt(tPaid)}</div></div>
          <div class="stmt-kpi"><div class="stmt-kpi-l">Balance Owed</div><div class="stmt-kpi-v" style="color:${tBal>0?'#fca5a5':'#6ee7b7'}">${fmt(tBal)}</div></div>
        </div>
      </div>
      <div style="overflow-x:auto;margin-top:10px"><table class="stmt-tbl"><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Detail</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        ${wb.map(r=>`<tr><td style="white-space:nowrap">${fd(r.date)}</td><td>${bdg(r.type)}</td><td style="font-family:monospace;font-size:11px;color:var(--accent)">${r.ref}</td><td style="font-size:12px">${r.detail}</td><td style="color:var(--red);font-weight:700">${r.debit>0?fmt(r.debit):'—'}</td><td style="color:var(--green);font-weight:700">${r.credit>0?fmt(r.credit):'—'}</td><td style="font-weight:800;color:${r.running>0?'var(--red)':r.running<0?'var(--green)':'var(--muted)'}">${fmt(r.running)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
}

/* ═══════════════════════ RECEIVABLES ═══════════════════════ */
async function loadReceivables(){
  const c=document.getElementById('receivables-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('receivables_by_customer');
  if(!d||!d.success){c.innerHTML='<div class="empty-state"><div class="ei">⚠️</div><p>Could not load receivables. Check console for details.</p></div>';return;}
  const byC=d.data.by_customer||[],manual=d.data.manual||[];
  const gt=n(d.data.grand_total);
  c.innerHTML=`
    <div class="page-head">
      <div class="page-title">Receivables</div>
      <button class="btn-sm btn-gray" onclick="delete loaded['receivables'];loadReceivables()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="hero-card amber" style="margin-bottom:12px" onclick="goTo('receivables')">
      <div class="hc-label">💰 Total Outstanding</div>
      <div class="hc-val">${fmt(gt)}</div>
      <div class="hc-sub">From sales: ${fmt(d.data.sales_total)} &nbsp;·&nbsp; Manual: ${fmt(d.data.manual_total)}</div>
    </div>
    ${byC.length?`
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Outstanding by Customer</div></div>
      ${byC.map((r,i)=>`
        <div class="tx-row" style="cursor:pointer" onclick="viewCustStmtFromRecv('${r.customer_id||''}','${(r.customer_name||'Walk-in').replace(/'/g,"\\'")}')">
          <div class="tx-av s">👤</div>
          <div class="tx-body">
            <div class="tx-name">${r.customer_name||'Walk-in'}</div>
            <div class="tx-meta">${r.cnt} invoice${r.cnt!==1?'s':''} · Billed ${fmt(r.billed)} · Paid ${fmt(r.paid)}</div>
          </div>
          <div class="tx-right">
            <div class="tx-amt neg">${fmt(r.balance)}</div>
            <div class="tx-time" style="color:var(--muted)">outstanding</div>
          </div>
        </div>`).join('')}
    </div>`:''}
    ${manual.length?`
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Manual Receivables</div><div class="sec-sub">Loans given, opening balances</div></div>
      ${manual.map((r,i)=>`
        <div class="list-item" onclick="toggleExp('mr-exp-${i}')" style="margin-bottom:6px">
          <div class="li-top"><span style="font-weight:700">${r.person||'—'}</span><span class="li-date">${fd(r.entry_date)}</span></div>
          <div class="li-name" style="font-size:12px;color:var(--muted)">${r.type||'—'}${r.reference?' · Ref: '+r.reference:''}</div>
          <div class="li-row2"><span class="li-total">${fmt(r.amount)}</span><span class="tx-amt neg">Balance: ${fmt(r.balance)}</span></div>
          <div class="li-expand" id="mr-exp-${i}">
            <div class="li-sub-row"><span class="li-sub-l">Amount</span><span class="li-sub-v">${fmt(r.amount)}</span></div>
            <div class="li-sub-row"><span class="li-sub-l">Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(r.paid||0)}</span></div>
            <div class="li-sub-row"><span class="li-sub-l">Balance</span><span class="li-sub-v" style="color:var(--red)">${fmt(r.balance||0)}</span></div>
            ${r.note?`<div class="li-sub-row"><span class="li-sub-l">Note</span><span class="li-sub-v">${r.note}</span></div>`:''}
            ${(r.payment_history||[]).length?`<div style="margin-top:6px"><div class="data-label">Payments</div>
              ${r.payment_history.map(ph=>`<div class="ph-row"><span style="color:var(--muted)">${fd(ph.date)}</span><span class="ph-amt">${fmt(ph.amount)}</span></div>`).join('')}</div>`:''}
          </div>
        </div>`).join('')}
    </div>`:''}
    ${!byC.length&&!manual.length?'<div class="empty-state"><div class="ei">✅</div><p>No outstanding receivables</p></div>':''}`;
}
async function viewCustStmtFromRecv(id,name){
  if(id){viewCustStmt(id,name);}
  else{showModal('Invoices — '+name,'<div class="loading"><div class="spinner"></div></div>');const d=await api('customer_statement',`name=${encodeURIComponent(name)}`);if(d?.success)renderCustStmtModal(d.data,name);}
}

/* ═══════════════════════ PAYABLES ═══════════════════════ */
async function loadPayables(){
  const c=document.getElementById('payables-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('payables_by_supplier');
  if(!d||!d.success){c.innerHTML='<div class="empty-state"><div class="ei">⚠️</div><p>Could not load payables. Check console for details.</p></div>';return;}
  const byS=d.data.by_supplier||[],manual=d.data.manual||[];
  const gt=n(d.data.grand_total);
  c.innerHTML=`
    <div class="page-head">
      <div class="page-title">Payables</div>
      <button class="btn-sm btn-gray" onclick="delete loaded['payables'];loadPayables()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="hero-card red" style="margin-bottom:12px">
      <div class="hc-label">💳 Total Owed</div>
      <div class="hc-val">${fmt(gt)}</div>
      <div class="hc-sub">To suppliers: ${fmt(d.data.purchases_total)} &nbsp;·&nbsp; Manual: ${fmt(d.data.manual_total)}</div>
    </div>
    ${byS.length?`
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Outstanding by Supplier</div></div>
      ${byS.map((r,i)=>`
        <div class="tx-row" style="cursor:pointer" onclick="viewSuppStmt('${r.supplier_id||''}','${(r.supplier||'—').replace(/'/g,"\\'")}')">
          <div class="tx-av p">🏭</div>
          <div class="tx-body">
            <div class="tx-name">${r.supplier||'—'}</div>
            <div class="tx-meta">${r.cnt} order${r.cnt!==1?'s':''} · Total ${fmt(r.total)} · Paid ${fmt(r.paid)}</div>
          </div>
          <div class="tx-right">
            <div class="tx-amt neg">${fmt(r.balance)}</div>
            <div class="tx-time" style="color:var(--muted)">owed</div>
          </div>
        </div>`).join('')}
    </div>`:''}
    ${manual.length?`
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Manual Payables</div><div class="sec-sub">Loans, opening balances</div></div>
      ${manual.map((r,i)=>`
        <div class="list-item" onclick="toggleExp('mp-exp-${i}')" style="margin-bottom:6px">
          <div class="li-top"><span style="font-weight:700">${r.source||'—'}</span><span class="li-date">${fd(r.entry_date)}</span></div>
          <div class="li-name" style="font-size:12px;color:var(--muted)">${r.type||'—'}${r.reference?' · Ref: '+r.reference:''}</div>
          <div class="li-row2"><span class="li-total">${fmt(r.amount)}</span><span class="tx-amt neg">Balance: ${fmt(r.balance)}</span></div>
          <div class="li-expand" id="mp-exp-${i}">
            <div class="li-sub-row"><span class="li-sub-l">Amount</span><span class="li-sub-v">${fmt(r.amount)}</span></div>
            <div class="li-sub-row"><span class="li-sub-l">Paid</span><span class="li-sub-v" style="color:var(--green)">${fmt(r.paid||0)}</span></div>
            <div class="li-sub-row"><span class="li-sub-l">Balance</span><span class="li-sub-v" style="color:var(--red)">${fmt(r.balance||0)}</span></div>
            ${r.note?`<div class="li-sub-row"><span class="li-sub-l">Note</span><span class="li-sub-v">${r.note}</span></div>`:''}
          </div>
        </div>`).join('')}
    </div>`:''}
    ${!byS.length&&!manual.length?'<div class="empty-state"><div class="ei">✅</div><p>No outstanding payables</p></div>':''}`;
}

/* ═══════════════════════ ACCOUNTS ═══════════════════════ */
async function loadAccounts(){
  const c=document.getElementById('accounts-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('accounts');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const a=d.data,sn=a.snapshot||{},ts=a.total_sales||{},te=a.total_expenses||{},tp=a.total_purchases||{},tr=a.total_returns||{};
  const cash=n(sn.cash_balance),bank=n(sn.bank_balance),total=cash+bank;
  const netRev=n(ts.rev)-n(tr.total),netP=netRev-n(te.total);
  c.innerHTML=`
    <div class="page-head"><div class="page-title">Accounts</div></div>
    <div class="hero-card blue" style="margin-bottom:10px">
      <div class="hc-label">💵 Total Cash + Bank</div>
      <div class="hc-val">${fmt(total)}</div>
      <div class="hc-sub">Cash: ${fmt(cash)} &nbsp;·&nbsp; Bank: ${fmt(bank)}</div>
    </div>
    <div class="hc-2col" style="margin-bottom:10px">
      <div class="mini-card amber" onclick="goTo('receivables')"><div class="mc-label">Receivable</div><div class="mc-val" style="font-size:16px;color:var(--amber)">${fmt(sn.total_receivable||0)}</div><div class="mc-sub">Customers owe you</div></div>
      <div class="mini-card red" onclick="goTo('payables')"><div class="mc-label">Payable</div><div class="mc-val" style="font-size:16px;color:var(--red)">${fmt(sn.total_payable||0)}</div><div class="mc-sub">You owe others</div></div>
    </div>
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Financial Overview</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#eff6ff">💼</div><div><div class="acc-label">Capital Invested</div></div></div><div class="acc-val">${fmt(sn.capital_invested||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#ecfdf5">📈</div><div><div class="acc-label">Total Sales Revenue</div><div class="acc-hint">Gross billing amount</div></div></div><div class="acc-val" style="color:var(--accent)">${fmt(ts.rev||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#ecfdf5">✅</div><div><div class="acc-label">Total Collected</div><div class="acc-hint">Cash actually received</div></div></div><div class="acc-val" style="color:var(--green)">${fmt(ts.coll||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#fef2f2">💸</div><div><div class="acc-label">Total Expenses</div></div></div><div class="acc-val" style="color:var(--red)">${fmt(te.total||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#fffbeb">🛒</div><div><div class="acc-label">Total Purchases</div><div class="acc-hint">Paid: ${fmt(tp.paid||0)}</div></div></div><div class="acc-val">${fmt(tp.total||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#fef2f2">↩</div><div><div class="acc-label">Sales Returns</div></div></div><div class="acc-val" style="color:var(--red)">${fmt(tr.total||0)}</div></div>
      <div class="acc-row"><div class="acc-row-l"><div class="acc-icon" style="background:#f5f3ff">📦</div><div><div class="acc-label">Stock Value (Cost)</div></div></div><div class="acc-val">${fmt(sn.stock_value||0)}</div></div>
      <div style="background:${netP>=0?'var(--green-soft)':'var(--red-soft)'};margin:8px -16px -16px;padding:14px 16px;border-radius:0 0 16px 16px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:14px;font-weight:800;color:${netP>=0?'var(--green)':'var(--red)'}">🎯 Net Profit / Loss</div>
        <div style="font-size:22px;font-weight:900;color:${netP>=0?'var(--green)':'var(--red)'}">${fmt(netP)}</div>
      </div>
    </div>`;
}

/* ═══════════════════════ CHEQUES ═══════════════════════ */
let allCheqs=[];
async function loadCheques(){
  const c=document.getElementById('cheques-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('cheques');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allCheqs=d.data;
  const today=new Date().toISOString().slice(0,10);
  const incoming=allCheqs.filter(x=>x.type==='incoming');
  const outgoing=allCheqs.filter(x=>x.type!=='incoming');
  const pend=allCheqs.filter(x=>x.status==='Pending');
  const over=pend.filter(x=>x.is_overdue==1||x.is_overdue===true);
  const due7=pend.filter(x=>!x.is_overdue&&x.days_until!==null&&x.days_until<=7);
  const pendAmt=pend.reduce((a,x)=>a+n(x.amount),0);
  const overAmt=over.reduce((a,x)=>a+n(x.amount),0);
  const inAmt=incoming.filter(x=>x.status==='Pending').reduce((a,x)=>a+n(x.amount),0);
  const outAmt=outgoing.filter(x=>x.status==='Pending').reduce((a,x)=>a+n(x.amount),0);

  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Cheques</div><span class="page-sub">${fmtN(allCheqs.length)} total</span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['cheques'];loadCheques()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>

    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px">
      <div class="mini-card amber"><div class="mc-label">⏳ Pending</div><div class="mc-val" style="color:var(--amber)">${fmtN(pend.length)}</div><div class="mc-sub">${fmt(pendAmt)}</div></div>
      <div class="mini-card red"><div class="mc-label">⚠️ Overdue</div><div class="mc-val" style="color:var(--red)">${fmtN(over.length)}</div><div class="mc-sub">${fmt(overAmt)}</div></div>
      <div class="mini-card blue"><div class="mc-label">📥 To Receive</div><div class="mc-val" style="color:var(--accent)">${fmtN(incoming.filter(x=>x.status==='Pending').length)}</div><div class="mc-sub">${fmt(inAmt)}</div></div>
      <div class="mini-card purple"><div class="mc-label">📤 To Pay</div><div class="mc-val" style="color:var(--purple)">${fmtN(outgoing.filter(x=>x.status==='Pending').length)}</div><div class="mc-sub">${fmt(outAmt)}</div></div>
    </div>

    <!-- Overdue alert -->
    ${over.length>0?`<div style="background:#fff1f2;border:1.5px solid var(--red);border-radius:13px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:800;color:var(--red);margin-bottom:6px">⚠️ ${over.length} Overdue Cheque${over.length!==1?'s':''} — Action Required</div>
      ${over.slice(0,3).map(x=>`<div style="font-size:12px;color:#9b1c1c;padding:4px 0;border-bottom:1px solid #fecaca;display:flex;justify-content:space-between"><span><b>${x.cheque_no||'—'}</b> · ${x.customer_name||x.supplier||'—'}</span><span style="font-weight:700">${fmt(x.amount)} · ${fd(x.due_date)}</span></div>`).join('')}
      ${over.length>3?`<div style="font-size:11px;color:#9b1c1c;margin-top:4px">+${over.length-3} more overdue</div>`:''}
    </div>`:''}

    <!-- Due soon alert -->
    ${due7.length>0?`<div style="background:#fffbeb;border:1.5px solid var(--amber);border-radius:13px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:800;color:var(--amber);margin-bottom:6px">🔔 ${due7.length} Cheque${due7.length!==1?'s':''} Due Within 7 Days</div>
      ${due7.slice(0,3).map(x=>`<div style="font-size:12px;color:#92400e;padding:4px 0;border-bottom:1px solid #fde68a;display:flex;justify-content:space-between"><span><b>${x.cheque_no||'—'}</b> · ${x.customer_name||x.supplier||'—'}</span><span style="font-weight:700">${fmt(x.amount)} · ${x.days_until}d left</span></div>`).join('')}
    </div>`:''}

    <div class="filter-row">
      <div class="fchip active" data-cf="all" onclick="setCF(this,'all')">All</div>
      <div class="fchip" data-cf="overdue" onclick="setCF(this,'overdue')">Overdue ⚠️</div>
      <div class="fchip" data-cf="Pending" onclick="setCF(this,'Pending')">Pending</div>
      <div class="fchip" data-cf="incoming" onclick="setCF(this,'incoming')">Incoming</div>
      <div class="fchip" data-cf="outgoing" onclick="setCF(this,'outgoing')">Outgoing</div>
      <div class="fchip" data-cf="Cleared" onclick="setCF(this,'Cleared')">Cleared</div>
      <div class="fchip" data-cf="Bounced" onclick="setCF(this,'Bounced')">Bounced</div>
    </div>
    <div id="cheq-list"></div>`;
  renderCheqs(allCheqs);
}
let _cf='all';
function setCF(el,f){document.querySelectorAll('[data-cf]').forEach(x=>x.classList.remove('active'));el.classList.add('active');_cf=f;
  let cc=allCheqs;
  if(f==='overdue')cc=allCheqs.filter(x=>x.is_overdue==1||x.is_overdue===true);
  else if(f==='incoming')cc=allCheqs.filter(x=>x.type==='incoming');
  else if(f==='outgoing')cc=allCheqs.filter(x=>x.type!=='incoming');
  else if(f!=='all')cc=allCheqs.filter(x=>x.status===f);
  renderCheqs(cc);
}
function renderCheqs(cc){
  const el=document.getElementById('cheq-list');if(!el)return;
  if(!cc.length){el.innerHTML='<div class="empty-state"><div class="ei">🏦</div><p>No cheques found</p></div>';return;}
  el.innerHTML=cc.map((c,i)=>{
    const over=c.is_overdue==1||c.is_overdue===true;
    const dueIn=c.days_until;
    const due7=!over&&dueIn!==null&&dueIn<=7;
    const isIn=c.type==='incoming';
    let urgency='';
    if(over)urgency='border-left:3px solid var(--red)';
    else if(due7)urgency='border-left:3px solid var(--amber)';
    let dueColor='var(--text)';
    if(over)dueColor='var(--red)';
    else if(due7)dueColor='var(--amber)';
    let dueLabel='';
    if(over)dueLabel=` <span style="color:var(--red);font-weight:700;font-size:11px">(${Math.abs(dueIn)}d overdue!)</span>`;
    else if(dueIn===0)dueLabel=` <span style="color:var(--orange);font-weight:700;font-size:11px">(TODAY!)</span>`;
    else if(dueIn!==null&&dueIn<=7)dueLabel=` <span style="color:var(--amber);font-weight:700;font-size:11px">(${dueIn}d left)</span>`;
    else if(dueIn!==null)dueLabel=` <span style="color:var(--muted);font-size:11px">(${dueIn}d)</span>`;
    return `<div class="list-item" onclick="toggleExp('chq-exp-${i}')" style="margin-bottom:8px;${urgency}">
      <div class="li-top">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-weight:700;font-family:monospace;color:var(--accent);font-size:12px">${c.cheque_no||'—'}</span>
          ${isIn?'<span class="bdg bdg-blue" style="font-size:10px">↙ Receive</span>':'<span class="bdg bdg-purple" style="font-size:10px">↗ Pay</span>'}
        </div>
        <span class="li-date" style="color:${dueColor}">${fd(c.due_date)}${over?' ⚠️':due7?' 🔔':''}</span>
      </div>
      <div class="li-name">${c.customer_name||c.supplier||'—'}</div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">${c.bank_name||'—'}${c.note?' · '+c.note:''}</div>
      <div class="li-row2">
        <span class="li-total" style="color:${isIn?'var(--green)':'var(--red)'}">${fmt(c.amount)}</span>
        <div style="display:flex;gap:5px;align-items:center">${bdg(c.status)}</div>
      </div>
      <div class="li-expand" id="chq-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Direction</span><span class="li-sub-v">${isIn?'📥 Incoming — you receive this':'📤 Outgoing — you pay this'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Party</span><span class="li-sub-v">${c.customer_name||c.supplier||'—'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Bank</span><span class="li-sub-v">${c.bank_name||'—'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Amount</span><span class="li-sub-v" style="font-size:16px;color:${isIn?'var(--green)':'var(--red)'}">${fmt(c.amount)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Due Date</span><span class="li-sub-v" style="color:${dueColor};font-weight:800">${fd(c.due_date)}${dueLabel}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Issued Date</span><span class="li-sub-v">${fd(c.issued_date)}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Status</span><span class="li-sub-v">${bdg(c.status)}</span></div>
        ${c.note?`<div class="li-sub-row"><span class="li-sub-l">Note</span><span class="li-sub-v">${c.note}</span></div>`:''}
        ${over?`<div style="background:var(--red-soft);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:var(--red);font-weight:600">⚠️ This cheque is ${Math.abs(dueIn)} day${Math.abs(dueIn)!==1?'s':''} overdue. Update status in ERP.</div>`:''}
        ${dueIn===0?`<div style="background:var(--amber-soft);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:var(--amber);font-weight:600">🔔 This cheque is due TODAY!</div>`:''}
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════ REPAIRS ═══════════════════════ */
let allRepairs=[];
async function loadRepairs(){
  const c=document.getElementById('repairs-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('repairs');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allRepairs=d.data;
  const open=allRepairs.filter(r=>!['Delivered','Cancelled'].includes(r.status));
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Repairs</div><span class="page-sub">${fmtN(allRepairs.length)} total</span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['repairs'];loadRepairs()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="hc-2col" style="margin-bottom:10px">
      <div class="mini-card red"><div class="mc-label">Open Jobs</div><div class="mc-val" style="color:var(--red)">${fmtN(open.length)}</div></div>
      <div class="mini-card green"><div class="mc-label">Delivered</div><div class="mc-val" style="color:var(--green)">${fmtN(allRepairs.filter(r=>r.status==='Delivered').length)}</div></div>
    </div>
    <div class="filter-row">
      <div class="fchip active" data-rf="" onclick="setRF(this,'')">All</div>
      <div class="fchip" data-rf="Pending" onclick="setRF(this,'Pending')">Pending</div>
      <div class="fchip" data-rf="Repairing" onclick="setRF(this,'Repairing')">Repairing</div>
      <div class="fchip" data-rf="Ready" onclick="setRF(this,'Ready')">Ready</div>
      <div class="fchip" data-rf="Delivered" onclick="setRF(this,'Delivered')">Delivered</div>
    </div>
    <input type="text" class="search-box" id="rep-q" placeholder="Search customer, device, brand…" oninput="filterRepairs()"/>
    <div id="rep-list"></div>`;
  renderRepairs(allRepairs);
}
let _rf='';
function setRF(el,f){document.querySelectorAll('[data-rf]').forEach(x=>x.classList.remove('active'));el.classList.add('active');_rf=f;filterRepairs();}
function filterRepairs(){
  const q=(v('rep-q')||'').toLowerCase();
  let rr=allRepairs;
  if(_rf)rr=rr.filter(r=>r.status===_rf);
  if(q)rr=rr.filter(r=>(r.customer||'').toLowerCase().includes(q)||(r.device_type||'').toLowerCase().includes(q)||(r.brand||'').toLowerCase().includes(q)||(r.model_no||'').toLowerCase().includes(q));
  renderRepairs(rr);
}
function renderRepairs(rr){
  const el=document.getElementById('rep-list');if(!el)return;
  el.innerHTML=rr.map((r,i)=>`
    <div class="list-item" onclick="toggleExp('rep-exp-${i}')" style="margin-bottom:8px">
      <div class="li-top"><span style="font-weight:700">${r.customer||'—'}</span><span class="li-date">${fds(r.date_in)}</span></div>
      <div class="li-name">${r.device_type||''}${r.brand?' · '+r.brand:''}${r.model_no?' '+r.model_no:''}</div>
      <div class="li-row2"><span class="li-total">${fmt(r.estimated_cost)}</span>${bdg(r.status)}</div>
      <div class="li-expand" id="rep-exp-${i}">
        <div class="li-sub-row"><span class="li-sub-l">Phone</span><span class="li-sub-v">${r.phone||'—'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Device</span><span class="li-sub-v">${r.device_type||'—'} ${r.brand||''} ${r.model_no||''}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Problem</span><span class="li-sub-v">${r.problem||'—'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Technician</span><span class="li-sub-v">${r.technician||'—'}</span></div>
        <div class="li-sub-row"><span class="li-sub-l">Date In</span><span class="li-sub-v">${fd(r.date_in)}</span></div>
        ${r.date_out?`<div class="li-sub-row"><span class="li-sub-l">Date Out</span><span class="li-sub-v">${fd(r.date_out)}</span></div>`:''}
        ${r.description?`<div style="font-size:12px;color:var(--muted);margin-top:6px;padding-top:6px;border-top:1px solid var(--border-lt)">${r.description}</div>`:''}
      </div>
    </div>`).join('')||'<div class="empty-state"><div class="ei">🔧</div><p>No repairs found</p></div>';
}

/* ═══════════════════════ EXPENSES ═══════════════════════ */
let allExp=[];
async function loadExpenses(){
  const c=document.getElementById('expenses-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('expenses','limit=500');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  allExp=d.data;
  const total=n(d.grand_total||allExp.reduce((a,e)=>a+n(e.amount),0));
  const byCat={};allExp.forEach(e=>{if(e.category)byCat[e.category]=(byCat[e.category]||0)+n(e.amount);});
  const topCats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  c.innerHTML=`
    <div class="page-head">
      <div><div class="page-title">Expenses</div><span class="page-sub">${fmtN(allExp.length)} records</span></div>
      <button class="btn-sm btn-gray" onclick="delete loaded['expenses'];loadExpenses()" style="display:flex;align-items:center;gap:5px">🔄 Refresh</button>
    </div>
    <div class="hero-card red" style="margin-bottom:10px">
      <div class="hc-label">💸 Total Expenses</div>
      <div class="hc-val">${fmt(total)}</div>
      <div class="hc-sub">${topCats.length?'Top: '+topCats[0][0]+' ('+fmt(topCats[0][1])+')':(allExp.length+' entries')}</div>
    </div>
    ${topCats.length>1?`<div class="sec-card" style="margin-bottom:10px"><div class="sec-head"><div class="sec-title">By Category</div></div>
      ${topCats.map(([cat,amt])=>`<div class="tx-row"><div class="tx-body"><div class="tx-name">${cat}</div><div style="background:var(--border-lt);border-radius:4px;height:5px;width:100%;margin-top:4px"><div style="background:var(--accent);height:5px;border-radius:4px;width:${pct(amt,total)}"></div></div></div><div class="tx-right"><div class="tx-amt neu">${fmt(amt)}</div><div class="tx-time">${pct(amt,total)}</div></div></div>`).join('')}
    </div>`:''}
    <div class="filter-bar"><div class="fb-group"><div class="fb-label">From</div><input class="fb-input" type="date" id="exp-f"/></div><div class="fb-group"><div class="fb-label">To</div><input class="fb-input" type="date" id="exp-t"/></div><button class="btn-sm btn-blue" onclick="fetchExpenses()">Go</button><button class="btn-sm btn-gray" onclick="['exp-f','exp-t'].forEach(x=>{const e=document.getElementById(x);if(e)e.value='';});fetchExpenses()">Clear</button></div>
    <div id="exp-list"></div>`;
  renderExp(allExp);
}
async function fetchExpenses(){
  const from=v('exp-f'),to=v('exp-t');
  let p='limit=500';if(from)p+='&from='+from;if(to)p+='&to='+to;
  const d=await api('expenses',p);if(d?.success){allExp=d.data;renderExp(allExp);}
}
function renderExp(ee){
  const el=document.getElementById('exp-list');if(!el)return;
  el.innerHTML=ee.map(e=>`
    <div class="list-item" style="margin-bottom:7px">
      <div class="li-top"><span class="bdg bdg-amber">${e.category||'—'}</span><span class="li-date">${fd(e.expense_date||e.date)}</span></div>
      <div class="li-name">${e.description||'—'}</div>
      <div class="li-row2"><span class="li-total" style="color:var(--red)">${fmt(e.amount)}</span><span class="bdg bdg-gray">${e.cash_method||'Cash'}</span></div>
    </div>`).join('')||'<div class="empty-state"><div class="ei">💸</div><p>No expenses found</p></div>';
}

/* ═══════════════════════ RETURNS ═══════════════════════ */
async function loadReturns(){
  const c=document.getElementById('returns-content');
  c.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const d=await api('returns');if(!d||!d.success){c.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const total=d.data.reduce((a,r)=>a+n(r.amount),0);
  c.innerHTML=`
    <div class="page-head"><div class="page-title">Returns</div><span class="page-sub">${d.data.length} returns</span></div>
    <div style="background:#fff;border-radius:14px;padding:13px 16px;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600;color:var(--muted)">Total Return Value</span>
      <span style="font-size:18px;font-weight:800;color:var(--red)">${fmt(total)}</span>
    </div>
    ${d.data.map((r,i)=>`
      <div class="list-item" onclick="toggleExp('ret-exp-${i}')" style="margin-bottom:8px">
        <div class="li-top"><span class="li-ref">${r.invoice_no||'—'}</span><span class="li-date">${fd(r.return_date||r.date)}</span></div>
        <div class="li-name">${r.customer||'Walk-in'} · ${r.product_name||'—'}</div>
        <div class="li-row2"><span class="li-total">${fmt(r.amount)}</span>${r.is_refund?`<span class="bdg bdg-red">Refunded ${fmt(r.refund_amount)}</span>`:'<span class="bdg bdg-gray">No refund</span>'}</div>
        <div class="li-expand" id="ret-exp-${i}">
          <div class="li-sub-row"><span class="li-sub-l">Product</span><span class="li-sub-v">${r.product_name||'—'}</span></div>
          <div class="li-sub-row"><span class="li-sub-l">Qty Returned</span><span class="li-sub-v">${r.qty||1}</span></div>
          <div class="li-sub-row"><span class="li-sub-l">Return Value</span><span class="li-sub-v" style="color:var(--red)">${fmt(r.amount)}</span></div>
          ${r.reason?`<div class="li-sub-row"><span class="li-sub-l">Reason</span><span class="li-sub-v">${r.reason}</span></div>`:''}
          ${r.is_refund?`<div class="li-sub-row"><span class="li-sub-l">Refund Method</span><span class="li-sub-v">${r.refund_method||'Cash'}</span></div>`:''}
        </div>
      </div>`).join('')||'<div class="empty-state"><div class="ei">↩</div><p>No returns</p></div>'}`;
}

/* ═══════════════════════ REPORTS ═══════════════════════ */
function initReports(){
  const c=document.getElementById('reports-content');
  const y=new Date().getFullYear();
  let yOpts='';for(let i=y;i>=y-5;i--)yOpts+=`<option value="${i}"${i===y?' selected':''}>${i}</option>`;
  let mOpts='';['January','February','March','April','May','June','July','August','September','October','November','December'].forEach((m,i)=>mOpts+=`<option value="${i+1}"${i+1===new Date().getMonth()+1?' selected':''}>${m}</option>`);
  const fd2=new Date();fd2.setDate(1);
  c.innerHTML=`
    <div class="page-head"><div class="page-title">Reports</div></div>
    <div class="sec-card" style="margin-bottom:10px">
      <div class="rpt-tabs">
        <button class="rpt-tab active" data-rt="pnl" onclick="setRT(this,'pnl')">P&L</button>
        <button class="rpt-tab" data-rt="monthly" onclick="setRT(this,'monthly')">Monthly</button>
        <button class="rpt-tab" data-rt="yearly" onclick="setRT(this,'yearly')">Yearly</button>
      </div>
    </div>
    <div id="r-pnl">
      <div class="sec-card" style="margin-bottom:10px"><div class="filter-bar"><div class="fb-group"><div class="fb-label">From</div><input class="fb-input" type="date" id="pf" value="${fd2.toISOString().slice(0,10)}"/></div><div class="fb-group"><div class="fb-label">To</div><input class="fb-input" type="date" id="pt" value="${new Date().toISOString().slice(0,10)}"/></div><button class="btn-sm btn-blue" onclick="fetchPnl()">Generate</button></div></div>
      <div id="pnl-r"></div>
    </div>
    <div id="r-monthly" style="display:none">
      <div class="sec-card" style="margin-bottom:10px">
        <div class="filter-bar">
          <div class="fb-group"><div class="fb-label">Year</div><select class="fb-input" id="ry">${yOpts}</select></div>
          <div class="fb-group" style="flex:2"><div class="fb-label">Month</div><select class="fb-input" id="rm">${mOpts}</select></div>
          <button class="btn-sm btn-blue" onclick="fetchMonthly()">View</button>
        </div>
      </div>
      <div id="mon-r"></div>
    </div>
    <div id="r-yearly" style="display:none">
      <div class="sec-card" style="margin-bottom:10px">
        <div class="filter-bar">
          <div class="fb-group"><div class="fb-label">Year</div><select class="fb-input" id="ry2">${yOpts}</select></div>
          <button class="btn-sm btn-blue" onclick="fetchYearly()">View</button>
        </div>
      </div>
      <div id="yr-r"></div>
    </div>`;
  fetchPnl();
}
function setRT(el,t){document.querySelectorAll('[data-rt]').forEach(b=>b.classList.toggle('active',b.dataset.rt===t));['pnl','monthly','yearly'].forEach(id=>{const e=document.getElementById('r-'+id);if(e)e.style.display=id===t?'':'none';});if(t==='pnl')fetchPnl();else if(t==='monthly')fetchMonthly();else fetchYearly();}
async function fetchPnl(){
  const el=document.getElementById('pnl-r');if(!el)return;
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const from=v('pf'),to=v('pt');
  const d=await api('reports_pnl',`from=${from}&to=${to}`);if(!d||!d.success){el.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const s=d.data.sales||{},e=d.data.expenses||{},p=d.data.purchases||{},r=d.data.returns||{};
  const rev=n(s.rev),ret=n(r.total),netRev=rev-ret,exp=n(e.total),netP=netRev-exp;
  el.innerHTML=`
    <div class="rpt-bar-card blue"><div class="rbc-left"><div class="rbc-label">Revenue</div><div class="rbc-val">${fmt(rev)}</div></div><div class="rbc-right"><div class="rbc-orig">${fmtN(s.cnt||0)} invoices</div><div class="rbc-pct">Collected: ${fmt(s.coll||0)}</div></div></div>
    <div class="rpt-bar-card ${netP>=0?'green':'red'}"><div class="rbc-left"><div class="rbc-label">Net Profit</div><div class="rbc-val">${fmt(netP)}</div></div><div class="rbc-right"><div class="rbc-orig">${netP>=0?'✅ Profitable':'❌ Loss'}</div><div class="rbc-pct">Margin: ${pct(netP,rev)}</div></div></div>
    <div class="rpt-bar-card red"><div class="rbc-left"><div class="rbc-label">Total Expenses</div><div class="rbc-val">${fmt(exp)}</div></div></div>
    <div class="pnl-block">
      <div class="pnl-header">📋 P&L — ${fd(from)} to ${fd(to)}</div>
      <div class="pnl-row"><span>Sales Revenue</span><span style="color:var(--accent);font-weight:700">${fmt(rev)}</span></div>
      ${ret>0?`<div class="pnl-row indent"><span>(−) Returns</span><span style="color:var(--red)">(${fmt(ret)})</span></div>`:''}
      <div class="pnl-row total"><span>Net Revenue</span><span>${fmt(netRev)}</span></div>
      <div class="pnl-row"><span>(−) Operating Expenses</span><span style="color:var(--red)">${fmt(exp)}</span></div>
      <div class="pnl-row net${netP<0?' loss':''}"><span>NET PROFIT / (LOSS)</span><span style="color:${netP>=0?'var(--green)':'var(--red)'}">${fmt(netP)}</span></div>
    </div>
    <div class="pnl-block" style="margin-top:8px">
      <div class="pnl-header">📦 Purchases (${fd(from)} – ${fd(to)})</div>
      <div class="pnl-row"><span>Total Ordered</span><span>${fmt(p.total||0)}</span></div>
      <div class="pnl-row"><span>Amount Paid</span><span style="color:var(--green)">${fmt(p.paid||0)}</span></div>
      <div class="pnl-row total"><span>Balance Owed</span><span style="color:${n(p.total)-n(p.paid)>0?'var(--red)':'var(--green)'}">${fmt(n(p.total)-n(p.paid))}</span></div>
    </div>`;
}
async function fetchMonthly(){
  const el=document.getElementById('mon-r');if(!el)return;
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const yr=v('ry'),mo=v('rm');
  const d=await api('monthly',`year=${yr}&month=${mo}`);if(!d||!d.success){el.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const s=d.data.sales||{},e=d.data.expenses||{},p=d.data.purchases||{},profit=n(s.rev)-n(e.total);
  const months=['','January','February','March','April','May','June','July','August','September','October','November','December'];
  el.innerHTML=`
    <div style="text-align:center;padding:8px 0 12px;font-size:14px;font-weight:700;color:var(--text)">${months[parseInt(mo)]} ${yr}</div>
    <div class="rpt-bar-card blue"><div class="rbc-left"><div class="rbc-label">Revenue</div><div class="rbc-val">${fmt(s.rev||0)}</div></div><div class="rbc-right"><div class="rbc-orig">${fmtN(s.cnt||0)} invoices</div><div class="rbc-pct">Collected: ${fmt(s.coll||0)}</div></div></div>
    <div class="rpt-bar-card red"><div class="rbc-left"><div class="rbc-label">Expenses</div><div class="rbc-val">${fmt(e.total||0)}</div></div></div>
    <div class="rpt-bar-card amber"><div class="rbc-left"><div class="rbc-label">Purchases</div><div class="rbc-val">${fmt(p.total||0)}</div></div><div class="rbc-right"><div class="rbc-pct">Paid: ${fmt(p.paid||0)}</div></div></div>
    <div class="rpt-bar-card ${profit>=0?'green':'red'}"><div class="rbc-left"><div class="rbc-label">Net Profit / Loss</div><div class="rbc-val">${fmt(profit)}</div></div></div>`;
}
async function fetchYearly(){
  const el=document.getElementById('yr-r');if(!el)return;
  el.innerHTML='<div class="loading"><div class="spinner"></div></div>';
  const yr=v('ry2');
  const d=await api('yearly',`year=${yr}`);if(!d||!d.success){el.innerHTML='<div class="empty-state"><p>Failed.</p></div>';return;}
  const mns=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let tR=0,tE=0;d.data.forEach(m=>{tR+=n(m.revenue);tE+=n(m.expenses);});const tP=tR-tE;
  const maxV=Math.max(...d.data.map(m=>n(m.revenue)),1);
  el.innerHTML=`
    <div class="rpt-bar-card blue" style="margin-bottom:8px"><div class="rbc-left"><div class="rbc-label">Year ${yr} Revenue</div><div class="rbc-val">${fmt(tR)}</div></div></div>
    <div class="rpt-bar-card ${tP>=0?'green':'red'}" style="margin-bottom:12px"><div class="rbc-left"><div class="rbc-label">Year Profit</div><div class="rbc-val">${fmt(tP)}</div></div></div>
    <div class="sec-card">
      <div class="sec-head"><div class="sec-title">Monthly Breakdown ${yr}</div></div>
      <div class="bar-chart">
        ${d.data.map(m=>{const pct2=Math.round((n(m.revenue)/maxV)*100);return`<div class="bar-col"><div class="bar-fill" style="height:${Math.max(pct2,3)}%"></div><div class="bar-label">${mns[m.month-1]}</div></div>`;}).join('')}
      </div>
      ${d.data.map(m=>{const pr=n(m.revenue)-n(m.expenses);return`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-lt);font-size:13px"><span style="font-weight:600">${mns[m.month-1]} ${yr}</span><div style="text-align:right"><div style="font-weight:700">${fmt(m.revenue)}</div><div style="font-size:11px;color:${pr>=0?'var(--green)':'var(--red)'};font-weight:700">${fmt(pr)}</div></div></div>`;}).join('')}
    </div>`;
}

/* ═══════════════════════ UTILS ═══════════════════════ */
function v(id){const e=document.getElementById(id);return e?e.value:'';}
function toggleExp(id){const e=document.getElementById(id);if(e)e.classList.toggle('open');}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

/* Sync status */
async function checkSync(){
  try{
    const d=await api('overview');
    const dot=document.getElementById('sync-dot');
    if(d&&d.success){
      dot?.classList.remove('off');
      const t=d.data.snapshot?.updated_at;
      const txt=document.getElementById('sync-txt');
      if(txt)txt.textContent=t?'Synced '+new Date(t).toLocaleTimeString():'Connected';
    }else{dot?.classList.add('off');}
  }catch{document.getElementById('sync-dot')?.classList.add('off');}
}

/* Boot */
loaded.home=false;
goTo('home');
checkSync();
setInterval(checkSync,60000);
