<?php
/**
 * Techon ERP — License Admin Panel
 * File: admin/index.php
 */
require_once __DIR__ . '/config.php';
requireLogin();
error_reporting(0);

$licenses = readLicenses();
$csrf     = csrfToken();
$flash    = getFlash();

/* ── Stats ── */
$total    = count($licenses);
$activated = $available = $blocked = $expired = 0;
foreach ($licenses as $l) {
    $s = licStatus($l);
    if ($s === 'active')   $activated++;
    if ($s === 'unused')   $available++;
    if ($s === 'blocked')  $blocked++;
    if ($s === 'expired')  $expired++;
}

/* ── Filter / search ── */
$q      = trim($_GET['q']      ?? '');
$filter = trim($_GET['filter'] ?? 'all');
$valid_filters = ['all','active','unused','blocked','expired'];
if (!in_array($filter, $valid_filters)) $filter = 'all';

$display = $licenses;
if ($q !== '') {
    $ql = strtolower($q);
    $display = array_filter($display, fn($l) =>
        str_contains(strtolower($l['key']    ?? ''), $ql) ||
        str_contains(strtolower($l['shop']   ?? ''), $ql) ||
        str_contains(strtolower($l['device'] ?? ''), $ql) ||
        str_contains(strtolower($l['plan']   ?? ''), $ql)
    );
}
if ($filter !== 'all') {
    $display = array_filter($display, fn($l) => licStatus($l) === $filter);
}
$display = array_values($display);
$shown   = count($display);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>License Dashboard — Techon ERP Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
<style>
:root {
  --ink:     #07090f;
  --base:    #0d1117;
  --panel:   #0f1623;
  --card:    #131c2e;
  --edge:    #1e2d45;
  --edge2:   #253450;
  --blue:    #2563eb;
  --blue2:   #3b82f6;
  --blue-gl: rgba(37,99,235,.15);
  --green:   #10b981;
  --amber:   #f59e0b;
  --red:     #ef4444;
  --purple:  #8b5cf6;
  --cyan:    #06b6d4;
  --orange:  #f97316;
  --text:    #dde6f5;
  --muted:   #4d6080;
  --muted2:  #7d92b0;
  --mono:    'JetBrains Mono', monospace;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Space Grotesk', sans-serif;
  background: var(--base);
  color: var(--text);
  min-height: 100vh;
  font-size: 14px;
}

/* ══════════ TOPBAR ══════════ */
.topbar {
  position: sticky; top: 0; z-index: 200;
  height: 54px;
  background: rgba(13,17,23,.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--edge);
  display: flex; align-items: center;
  padding: 0 28px;
  gap: 16px;
}
.topbar-brand {
  display: flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 800; color: var(--text);
  letter-spacing: -.02em; white-space: nowrap;
}
.brand-icon {
  width: 30px; height: 30px;
  background: linear-gradient(135deg, var(--blue), var(--blue2));
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 900; color: #fff;
  box-shadow: 0 0 16px rgba(37,99,235,.4);
  flex-shrink: 0;
}
.topbar-spacer { flex: 1; }
.topbar-user {
  font-size: 12px; font-weight: 600; color: var(--muted2);
  display: flex; align-items: center; gap: 8px;
}
.topbar-user::before {
  content: '';
  width: 6px; height: 6px;
  background: var(--green);
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 6px var(--green);
}
.topbar-logout {
  color: var(--muted2);
  font-size: 12px; font-weight: 700;
  text-decoration: none;
  padding: 5px 12px;
  border: 1px solid var(--edge);
  border-radius: 6px;
  transition: .15s;
  white-space: nowrap;
}
.topbar-logout:hover { color: var(--text); border-color: var(--edge2); background: var(--edge); }

/* ══════════ MAIN ══════════ */
.main { max-width: 1400px; margin: 0 auto; padding: 28px 24px 48px; }

/* ══════════ FLASH ══════════ */
.flash {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 13px; font-weight: 600;
  margin-bottom: 22px;
  border: 1px solid;
  animation: fadeSlide .3s ease;
}
.flash.ok  { background: rgba(16,185,129,.08); border-color: rgba(16,185,129,.3); color: #6ee7b7; }
.flash.err { background: rgba(239,68,68,.08);  border-color: rgba(239,68,68,.3);  color: #fca5a5; }
@keyframes fadeSlide { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }

/* ══════════ SECTION HEADER ══════════ */
.section-hd {
  font-size: 11px; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: .12em;
  margin-bottom: 12px;
}

/* ══════════ STATS GRID ══════════ */
.stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}
@media (max-width: 900px) { .stats { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 480px) { .stats { grid-template-columns: 1fr 1fr; } }

.stat-card {
  background: var(--card);
  border: 1px solid var(--edge);
  border-radius: 14px;
  padding: 20px 20px 18px;
  position: relative;
  overflow: hidden;
  transition: border-color .2s;
}
.stat-card:hover { border-color: var(--edge2); }
.stat-accent {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
}
.stat-label {
  font-size: 10px; font-weight: 700;
  color: var(--muted);
  text-transform: uppercase; letter-spacing: .1em;
  margin-bottom: 10px;
}
.stat-value {
  font-size: 36px; font-weight: 900;
  letter-spacing: -.04em;
  line-height: 1;
}
.stat-sub { font-size: 11px; color: var(--muted2); font-weight: 500; margin-top: 6px; }
.c-blue   { color: var(--blue2); }
.c-green  { color: var(--green); }
.c-purple { color: var(--purple); }
.c-red    { color: var(--red); }
.c-amber  { color: var(--amber); }

/* ══════════ TABLE CARD ══════════ */
.table-card {
  background: var(--card);
  border: 1px solid var(--edge);
  border-radius: 14px;
  overflow: hidden;
}
.table-head {
  padding: 16px 20px;
  border-bottom: 1px solid var(--edge);
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.table-title {
  font-size: 15px; font-weight: 800; color: var(--text);
  letter-spacing: -.02em; white-space: nowrap;
}
.shown-count {
  font-size: 12px; font-weight: 500; color: var(--muted2);
  background: var(--panel); border: 1px solid var(--edge);
  padding: 2px 9px; border-radius: 20px;
}
.table-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }

/* Search */
.search-wrap { position: relative; }
.search-wrap input {
  padding: 7px 12px 7px 34px;
  background: var(--panel);
  border: 1px solid var(--edge);
  border-radius: 8px;
  color: var(--text);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px; font-weight: 500;
  width: 210px; outline: none;
  transition: border-color .15s;
}
.search-wrap input::placeholder { color: var(--muted); }
.search-wrap input:focus { border-color: var(--blue); }
.search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--muted); font-size: 13px; pointer-events: none;
}

/* Filter tabs */
.filters { display: flex; gap: 4px; }
.filter-btn {
  padding: 5px 13px;
  border-radius: 6px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 12px; font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--edge);
  background: transparent;
  color: var(--muted2);
  text-decoration: none;
  white-space: nowrap;
  transition: .13s;
}
.filter-btn:hover { background: var(--edge); color: var(--text); }
.filter-btn.on { background: var(--blue); border-color: var(--blue); color: #fff; }

/* Generate button */
.btn-gen {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 15px;
  background: var(--green);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px; font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .15s;
}
.btn-gen:hover { opacity: .88; }

/* Generic action button (e.g. Support Desk) */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 15px;
  border: none;
  border-radius: 8px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px; font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .15s;
  color: #fff;
}
.btn:hover { opacity: .88; }

/* ══════════ TABLE ══════════ */
.tbl-wrap { overflow-x: auto; }
table {
  width: 100%; border-collapse: collapse;
  font-size: 13px;
}
thead th {
  padding: 10px 14px;
  text-align: left;
  font-size: 10px; font-weight: 700;
  color: var(--muted);
  text-transform: uppercase; letter-spacing: .1em;
  background: var(--panel);
  border-bottom: 1px solid var(--edge);
  white-space: nowrap;
}
tbody tr { border-bottom: 1px solid var(--edge); transition: background .1s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: rgba(255,255,255,.02); }
tbody td { padding: 11px 14px; vertical-align: middle; }

.td-num  { color: var(--muted); font-size: 12px; font-weight: 500; width: 36px; }
.td-key  { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--text); letter-spacing: .04em; }
.td-shop { font-weight: 600; }
.td-dev  { font-family: var(--mono); font-size: 11px; color: var(--muted2); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-date { color: var(--muted2); font-size: 12px; white-space: nowrap; }
.td-exp  { font-size: 12px; white-space: nowrap; font-weight: 600; }
.dash    { color: var(--muted); }

/* Status badges */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10px; font-weight: 800;
  text-transform: uppercase; letter-spacing: .08em;
  white-space: nowrap;
}
.badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
.badge.active  { background: rgba(16,185,129,.12); color: #34d399; }
.badge.active::before  { background: #10b981; box-shadow: 0 0 4px #10b981; }
.badge.unused  { background: rgba(37,99,235,.12);  color: #93c5fd; }
.badge.unused::before  { background: var(--blue2); }
.badge.blocked { background: rgba(239,68,68,.12);  color: #fca5a5; }
.badge.blocked::before { background: var(--red); }
.badge.expired { background: rgba(245,158,11,.12); color: #fcd34d; }
.badge.expired::before { background: var(--amber); }

/* Plan badges */
.plan-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 20px;
  font-size: 10px; font-weight: 800;
  text-transform: uppercase; letter-spacing: .06em;
  white-space: nowrap;
}
.plan-monthly  { background: rgba(6,182,212,.12);  color: #67e8f9; border: 1px solid rgba(6,182,212,.2); }
.plan-yearly   { background: rgba(139,92,246,.12); color: #c4b5fd; border: 1px solid rgba(139,92,246,.2); }
.plan-2year    { background: rgba(249,115,22,.12); color: #fdba74; border: 1px solid rgba(249,115,22,.2); }
.plan-lifetime { background: rgba(16,185,129,.12); color: #6ee7b7; border: 1px solid rgba(16,185,129,.2); }
.plan-3days    { background: rgba(251,191,36,.12); color: #fde68a; border: 1px solid rgba(251,191,36,.25); }

/* Action buttons */
.actions { display: flex; gap: 4px; flex-wrap: wrap; }
.abt {
  padding: 3px 10px;
  border-radius: 5px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 11px; font-weight: 700;
  cursor: pointer; border: 1px solid;
  white-space: nowrap; transition: .13s;
}
.abt-reset   { color: var(--amber); border-color: rgba(245,158,11,.25); background: rgba(245,158,11,.07); }
.abt-reset:hover   { background: var(--amber); color: #000; border-color: var(--amber); }
.abt-block   { color: var(--red);   border-color: rgba(239,68,68,.25);  background: rgba(239,68,68,.07); }
.abt-block:hover   { background: var(--red); color: #fff; border-color: var(--red); }
.abt-unblock { color: var(--green); border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.07); }
.abt-unblock:hover { background: var(--green); color: #fff; border-color: var(--green); }
.abt-delete  { color: #f87171;     border-color: rgba(239,68,68,.2);   background: rgba(239,68,68,.05); }
.abt-delete:hover  { background: #7f1d1d; color: #fff; border-color: var(--red); }

.empty-row td {
  text-align: center; padding: 52px 16px;
  color: var(--muted); font-size: 14px; font-weight: 500;
}

/* ══════════ MODAL ══════════ */
.modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(7,9,15,.78);
  backdrop-filter: blur(6px);
  z-index: 1000;
  align-items: center; justify-content: center;
}
.modal-overlay.open { display: flex; }
.modal {
  background: var(--card);
  border: 1px solid var(--edge2);
  border-radius: 16px;
  padding: 32px;
  width: calc(100% - 32px); max-width: 440px;
  box-shadow: 0 40px 80px rgba(0,0,0,.6);
  animation: modalIn .2s ease;
}
@keyframes modalIn { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:none; } }
.modal-header {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--edge);
}
.modal-title { font-size: 17px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
.modal-header .modal-title { margin-bottom: 0; }
.modal-body  { font-size: 13px; color: var(--muted2); line-height: 1.6; margin-bottom: 24px; }
.support-pin-out {
  font-family: var(--mono);
  font-size: 32px;
  font-weight: 800;
  letter-spacing: .2em;
  color: var(--cyan);
  text-align: center;
  background: linear-gradient(145deg, rgba(6,182,212,.12), var(--panel));
  border: 1px solid rgba(6,182,212,.35);
  border-radius: 12px;
  padding: 22px 16px;
  margin: 16px 0 8px;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 0 24px rgba(6,182,212,.25);
}
.support-challenge-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--panel);
  border: 1px solid var(--edge2);
  border-radius: 8px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .15em;
  text-align: center;
  text-transform: uppercase;
  outline: none;
  margin-top: 8px;
}
.support-challenge-input:focus { border-color: var(--cyan); box-shadow: 0 0 0 2px rgba(6,182,212,.15); }
.support-challenge-label {
  font-size: 11px; font-weight: 700; color: var(--muted);
  text-transform: uppercase; letter-spacing: .1em;
  display: block; margin-bottom: 4px;
}
.modal-key   {
  font-family: var(--mono); font-size: 13px; font-weight: 700;
  color: var(--text);
  background: var(--panel); border: 1px solid var(--edge);
  padding: 6px 12px; border-radius: 7px;
  display: inline-block; margin-top: 8px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.mbtn {
  padding: 9px 22px;
  border-radius: 8px;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px; font-weight: 700;
  cursor: pointer; border: 1px solid; transition: .13s;
}
.mbtn-cancel { background: transparent; border-color: var(--edge2); color: var(--muted2); }
.mbtn-cancel:hover { background: var(--edge); color: var(--text); }
.mbtn-red    { background: var(--red);   border-color: var(--red);   color: #fff; }
.mbtn-red:hover { opacity: .88; }
.mbtn-amber  { background: var(--amber); border-color: var(--amber); color: #000; }
.mbtn-amber:hover { opacity: .88; }
.mbtn-green  { background: var(--green); border-color: var(--green); color: #fff; }
.mbtn-green:hover { opacity: .88; }

/* ══════════ GEN MODAL SPECIFIC ══════════ */
.gen-preview {
  font-family: var(--mono); font-size: 20px; font-weight: 700;
  color: var(--blue2);
  background: var(--panel); border: 1px dashed var(--edge2);
  border-radius: 10px; padding: 16px; text-align: center;
  margin: 16px 0 20px; letter-spacing: .08em;
}
.plan-select-label {
  font-size: 12px; font-weight: 700; color: var(--muted2);
  text-transform: uppercase; letter-spacing: .08em;
  display: block; margin-bottom: 8px;
}
.plan-select {
  width: 100%;
  padding: 10px 14px;
  background: var(--panel);
  border: 1px solid var(--edge2);
  border-radius: 8px;
  color: var(--text);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 13px; font-weight: 600;
  outline: none;
  cursor: pointer;
  margin-bottom: 20px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234d6080' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.plan-select:focus { border-color: var(--blue); }
.plan-select option { background: #1a2540; }

/* Plan pricing hint */
.plan-hint {
  font-size: 12px; color: var(--muted2); margin-bottom: 18px;
  background: var(--panel); border: 1px solid var(--edge);
  border-radius: 8px; padding: 10px 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.plan-hint-price { font-weight: 700; color: var(--green); font-size: 14px; }
</style>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="topbar-brand">
    <div class="brand-icon">T</div>
    Techon ERP <span style="color:var(--muted);font-weight:500;margin-left:4px">/ License Admin</span>
  </div>
  <div class="topbar-spacer"></div>
  <div class="topbar-user">admin</div>
  <a class="topbar-logout" href="logout.php">Sign out</a>
</div>

<div class="main">

  <!-- Flash message -->
  <?php if ($flash): ?>
  <div class="flash <?= h($flash['type']) ?>">
    <?= $flash['type'] === 'ok' ? '✓' : '⚠' ?> <?= h($flash['msg']) ?>
  </div>
  <?php endif; ?>

  <!-- Stats -->
  <div class="section-hd">Overview</div>
  <div class="stats">
    <div class="stat-card">
      <div class="stat-accent" style="background:var(--blue2)"></div>
      <div class="stat-label">Total Licenses</div>
      <div class="stat-value c-blue"><?= $total ?></div>
      <div class="stat-sub">in database</div>
    </div>
    <div class="stat-card">
      <div class="stat-accent" style="background:var(--green)"></div>
      <div class="stat-label">Activated</div>
      <div class="stat-value c-green"><?= $activated ?></div>
      <div class="stat-sub">device-bound</div>
    </div>
    <div class="stat-card">
      <div class="stat-accent" style="background:var(--purple)"></div>
      <div class="stat-label">Available</div>
      <div class="stat-value c-purple"><?= $available ?></div>
      <div class="stat-sub">ready to activate</div>
    </div>
    <div class="stat-card">
      <div class="stat-accent" style="background:var(--amber)"></div>
      <div class="stat-label">Expired</div>
      <div class="stat-value c-amber"><?= $expired ?></div>
      <div class="stat-sub">needs renewal</div>
    </div>
    <div class="stat-card">
      <div class="stat-accent" style="background:var(--red)"></div>
      <div class="stat-label">Blocked</div>
      <div class="stat-value c-red"><?= $blocked ?></div>
      <div class="stat-sub">access denied</div>
    </div>
  </div>

  <!-- License Table -->
  <div class="section-hd" style="margin-top:8px">License Keys</div>
  <div class="table-card">
    <div class="table-head">
      <div class="table-title">All Licenses</div>
      <span class="shown-count"><?= $shown ?> / <?= $total ?></span>

      <div class="table-controls">
        <!-- Search -->
        <form method="GET" style="display:contents">
          <div class="search-wrap">
            <span class="search-icon">⌕</span>
            <input type="text" name="q" placeholder="Search key, shop, plan…"
              value="<?= h($q) ?>" onchange="this.form.submit()"/>
            <input type="hidden" name="filter" value="<?= h($filter) ?>"/>
          </div>
        </form>

        <!-- Filter tabs -->
        <div class="filters">
          <?php foreach (['all'=>'All','active'=>'Active','unused'=>'Unused','expired'=>'Expired','blocked'=>'Blocked'] as $k=>$v):
            $qs = http_build_query(['filter'=>$k, 'q'=>$q]);
          ?>
          <a class="filter-btn <?= $filter===$k?'on':'' ?>" href="?<?= $qs ?>"><?= $v ?></a>
          <?php endforeach; ?>
        </div>

        <!-- Generate -->
        <button class="btn-gen" onclick="document.getElementById('genModal').classList.add('open')">
          <span style="font-size:16px;line-height:1">+</span> Generate Key
        </button>
        <button type="button" class="btn" style="background:#475569;" onclick="document.getElementById('supportModal').classList.add('open'); var i=document.getElementById('supportChallengeInput'); if(i){ i.focus(); updateSupportUnlockPin(); }">
          🛠 Support Desk
        </button>
      </div>
    </div>

    <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>License Key</th>
          <th>Plan</th>
          <th>Shop Name</th>
          <th>Device ID</th>
          <th>Activated Date</th>
          <th>Expiry Date</th>
          <th>Status</th>
          <th>Dashboard Access</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <?php if (!$display): ?>
        <tr class="empty-row">
          <td colspan="10">No licenses match your search.</td>
        </tr>
        <?php endif; ?>

        <?php foreach ($display as $i => $lic):
          $st       = licStatus($lic);
          $key      = $lic['key']          ?? '';
          $plan     = !empty($lic['plan']) ? strtolower($lic['plan']) : 'monthly';
          $shop     = $lic['shop']         ?? '';
          $dev      = $lic['device']       ?? '';
          $devTip   = h($dev);
          $devShort = $dev ? substr($dev, 0, 12).'…' : '';
          $actRaw   = $lic['activated_at'] ?? '';
          $actDate  = $actRaw  ? date('d M Y', strtotime($actRaw))  : '';
          $expRaw   = $lic['expires']      ?? '';
          $expDate  = $expRaw  ? date('d M Y', strtotime($expRaw))  : '';

          /* ── Dashboard access ── */
          $dashOn     = !empty($lic['dashboard_access']);
          $dashExp    = $lic['dashboard_expires'] ?? null;
          $dashActive = false;
          $dashLabel  = '—';
          $dashStyle  = 'color:var(--muted2);font-size:11px';
          if ($dashOn && $dashExp) {
              $today    = new DateTime(date('Y-m-d'));
              $dashDate = new DateTime($dashExp);
              if ($today <= $dashDate) {
                  $daysLeft   = (int)ceil(($dashDate->getTimestamp() - $today->getTimestamp()) / 86400);
                  $dashActive = true;
                  $dashLabel  = 'ON · ' . date('d M Y', strtotime($dashExp));
                  $dashStyle  = $daysLeft <= 30 ? 'color:var(--amber);font-weight:700;font-size:11px'
                                                : 'color:var(--green);font-weight:700;font-size:11px';
              } else {
                  $dashLabel = 'EXPIRED · ' . date('d M Y', strtotime($dashExp));
                  $dashStyle = 'color:var(--red);font-weight:700;font-size:11px';
              }
          } elseif ($dashOn) {
              /* enabled but no expiry set — treat as active */
              $dashActive = true;
              $dashLabel  = 'ON (no expiry)';
              $dashStyle  = 'color:var(--green);font-weight:700;font-size:11px';
          }

          // Colour expiry date red if expired or within 7 days
          $expStyle = '';
          if ($expRaw) {
              $daysLeft = (strtotime($expRaw) - time()) / 86400;
              if ($daysLeft < 0)   $expStyle = 'color:var(--red)';
              elseif ($daysLeft < 7) $expStyle = 'color:var(--amber)';
              else                   $expStyle = 'color:var(--green)';
          }
        ?>
        <tr>
          <td class="td-num"><?= $i + 1 ?></td>
          <td class="td-key"><?= h($key) ?></td>
          <td><span class="plan-badge <?= planClass($plan) ?>"><?= planLabel($plan) ?></span></td>
          <td class="td-shop"><?= $shop ? h($shop) : '<span class="dash">—</span>' ?></td>
          <td class="td-dev" title="<?= $devTip ?>">
            <?= $dev ? h($devShort) : '<span class="dash">—</span>' ?>
          </td>
          <td class="td-date"><?= $actDate ?: '<span class="dash">—</span>' ?></td>
          <td class="td-exp" style="<?= $expStyle ?>">
            <?php if ($plan === 'lifetime'): ?>
              <span style="color:var(--green);font-size:11px">♾ Lifetime</span>
            <?php elseif ($expDate): ?>
              <?= h($expDate) ?>
            <?php else: ?>
              <span class="dash">—</span>
            <?php endif; ?>
          </td>
          <td><span class="badge <?= $st ?>"><?= $st ?></span></td>

          <!-- Dashboard Access column -->
          <td>
            <div style="margin-bottom:5px;white-space:nowrap">
              <span style="<?= $dashStyle ?>"><?= h($dashLabel) ?></span>
            </div>
            <div class="actions">
              <?php if (!$dashActive): ?>
              <!-- Enable button -->
              <form method="POST" action="dashboard.php" style="display:inline"
                onsubmit="return confirm('Enable dashboard access for:\n<?= addslashes(h($key)) ?>\n\nThis allows them to sync to app.techon.lk.\nExpires in 365 days.')">
                <input type="hidden" name="csrf"   value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"    value="<?= h($key) ?>"/>
                <input type="hidden" name="action" value="enable"/>
                <button type="submit" class="abt" style="background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3)">Enable</button>
              </form>
              <?php else: ?>
              <!-- Renew button -->
              <form method="POST" action="dashboard.php" style="display:inline"
                onsubmit="return confirm('Renew dashboard access for:\n<?= addslashes(h($key)) ?>\n\nThis resets expiry to +365 days from today.')">
                <input type="hidden" name="csrf"   value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"    value="<?= h($key) ?>"/>
                <input type="hidden" name="action" value="renew"/>
                <button type="submit" class="abt" style="background:rgba(6,182,212,.15);color:#06b6d4;border:1px solid rgba(6,182,212,.3)">Renew</button>
              </form>
              <!-- Disable button -->
              <form method="POST" action="dashboard.php" style="display:inline"
                onsubmit="return confirm('Disable dashboard access for:\n<?= addslashes(h($key)) ?>\n\nThey will be locked out of app.techon.lk immediately.')">
                <input type="hidden" name="csrf"   value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"    value="<?= h($key) ?>"/>
                <input type="hidden" name="action" value="disable"/>
                <button type="submit" class="abt abt-block">Disable</button>
              </form>
              <?php endif; ?>
            </div>
          </td>

          <td>
            <div class="actions">

              <?php if ($dev || $st === 'active' || $st === 'expired'): ?>
              <form method="POST" action="reset.php" style="display:inline"
                onsubmit="return confirm('Reset license binding for:\n<?= addslashes(h($key)) ?>\n\nThis clears the device, shop and expiry so it can be activated on a new device.')">
                <input type="hidden" name="csrf" value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"  value="<?= h($key) ?>"/>
                <button type="submit" class="abt abt-reset">Reset</button>
              </form>
              <?php endif; ?>

              <?php if ($st !== 'blocked'): ?>
              <form method="POST" action="block.php" style="display:inline"
                onsubmit="return confirm('Block license:\n<?= addslashes(h($key)) ?>\n\nThe ERP will reject all activation attempts with this key.')">
                <input type="hidden" name="csrf"   value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"    value="<?= h($key) ?>"/>
                <input type="hidden" name="action" value="block"/>
                <button type="submit" class="abt abt-block">Block</button>
              </form>
              <?php else: ?>
              <form method="POST" action="block.php" style="display:inline"
                onsubmit="return confirm('Unblock license:\n<?= addslashes(h($key)) ?>\n\nThis key will be allowed to activate again.')">
                <input type="hidden" name="csrf"   value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"    value="<?= h($key) ?>"/>
                <input type="hidden" name="action" value="unblock"/>
                <button type="submit" class="abt abt-unblock">Unblock</button>
              </form>
              <?php endif; ?>

              <form method="POST" action="delete.php" style="display:inline"
                onsubmit="return confirm('PERMANENTLY DELETE:\n<?= addslashes(h($key)) ?>\n\nThis cannot be undone!')">
                <input type="hidden" name="csrf" value="<?= h($csrf) ?>"/>
                <input type="hidden" name="key"  value="<?= h($key) ?>"/>
                <button type="submit" class="abt abt-delete">Delete</button>
              </form>

            </div>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    </div>
  </div>

</div><!-- /main -->

<!-- ══ GENERATE MODAL ══ -->
<div class="modal-overlay" id="genModal">
  <div class="modal">
    <div class="modal-title">Generate New License Key</div>
    <div class="modal-body">
      Select a plan and a unique key will be created in the format below and saved to
      <code style="color:var(--blue2);background:var(--panel);padding:1px 6px;border-radius:4px">licenses.json</code> instantly.
    </div>
    <div class="gen-preview">TCERP-XXXX-XXXX</div>

    <form method="POST" action="generate.php">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>"/>

      <label class="plan-select-label">License Plan</label>
      <select name="plan" class="plan-select" id="planSelect" onchange="updatePlanHint(this.value)">
        <option value="3days">3-Day Demo — Trial Extension</option>
        <option value="monthly">Monthly — 1 Month</option>
        <option value="yearly">Yearly — 1 Year</option>
        <option value="2year">2 Year — 2 Years</option>
        <option value="lifetime">Lifetime — No Expiry</option>
      </select>

      <div class="plan-hint" id="planHint">
        <span id="planHintLabel">Monthly plan</span>
        <span class="plan-hint-price" id="planHintPrice">LKR 1,000</span>
      </div>

      <div class="modal-actions">
        <button type="button" class="mbtn mbtn-cancel" onclick="closeModals()">Cancel</button>
        <button type="submit" class="mbtn mbtn-green">Generate →</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ SUPPORT DESK — Master Unlock PIN (matches ERP App.jsx challenge–response) ══ -->
<div class="modal-overlay" id="supportModal">
  <div class="modal" style="max-width:420px">
    <div class="modal-header">
      <div class="modal-title">Generate Support PIN</div>
    </div>
    <div class="modal-body" style="margin-bottom:16px">
      Enter the <strong style="color:var(--text)">6-character challenge code</strong> the customer read from the ERP unlock screen.
      The unlock PIN updates as you type (same algorithm as the app: SHA-256 of challenge + salt, first 6 hex chars).
    </div>
    <label class="support-challenge-label" for="supportChallengeInput">Challenge code</label>
    <input type="text" id="supportChallengeInput" class="support-challenge-input" maxlength="6" autocomplete="off" spellcheck="false" placeholder="XXXXXX" inputmode="text"/>
    <div class="support-pin-out" id="supportPinOut" title="Unlock PIN to give the customer">—</div>
    <p style="font-size:11px;color:var(--muted);text-align:center;margin:0 0 20px;line-height:1.5">Give this <strong style="color:var(--cyan)">Unlock PIN</strong> to the customer. They enter it in the ERP Support unlock field.</p>
    <div class="modal-actions">
      <button type="button" class="mbtn mbtn-cancel" onclick="closeModals()">Close</button>
    </div>
  </div>
</div>

<script>
function closeModals() {
  document.querySelectorAll('.modal-overlay').forEach(function(m){ m.classList.remove('open'); });
}
document.querySelectorAll('.modal-overlay').forEach(function(el) {
  el.addEventListener('click', function(e) { if (e.target === el) closeModals(); });
});
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeModals(); });

/* Plan hint in Generate modal */
var planData = {
  '3days':  { label: '3-Day Demo  · expires in 3 days',    price: 'FREE'        },
  monthly:  { label: 'Monthly plan  · expires in 1 month',  price: 'LKR 1,000'  },
  yearly:   { label: 'Yearly plan  · expires in 1 year',    price: 'LKR 7,500'  },
  '2year':  { label: '2 Year plan  · expires in 2 years',   price: 'LKR 15,000' },
  lifetime: { label: 'Lifetime plan  · never expires',      price: 'LKR 30,000' }
};
function updatePlanHint(val) {
  var d = planData[val] || planData['monthly'];
  document.getElementById('planHintLabel').textContent = d.label;
  document.getElementById('planHintPrice').textContent = d.price;
}
updatePlanHint('3days');

/* Support Desk — SHA-256(challenge + salt), hex[0:6].uppercase — must match erp-app/src/App.jsx */
var TC_SUPPORT_UNLOCK_SALT = 'techon-master-salt-2026';
async function updateSupportUnlockPin() {
  var input = document.getElementById('supportChallengeInput');
  var out = document.getElementById('supportPinOut');
  if (!input || !out) return;
  var raw = (input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length > 6) raw = raw.slice(0, 6);
  input.value = raw;
  if (raw.length < 6) {
    out.textContent = '—';
    return;
  }
  try {
    var enc = new TextEncoder();
    var buf = await crypto.subtle.digest('SHA-256', enc.encode(raw + TC_SUPPORT_UNLOCK_SALT));
    var hex = Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    out.textContent = hex.substring(0, 6).toUpperCase();
  } catch (err) {
    out.textContent = 'Error';
    console.error(err);
  }
}
(function initSupportDesk() {
  var el = document.getElementById('supportChallengeInput');
  if (!el) return;
  el.addEventListener('input', function () { updateSupportUnlockPin(); });
  el.addEventListener('paste', function () {
    setTimeout(function () { updateSupportUnlockPin(); }, 0);
  });
})();
</script>
</body>
</html>
