/**
 * Techon ERP — Setup Wizard
 * File: src/SetupWizard.jsx
 *
 * Shown once on first launch (before LicenseGate).
 * Guides the user through choosing a system mode:
 *   1. Standalone   — single PC, IndexedDB only
 *   2. Network Server — this PC stores all data (XAMPP + MySQL)
 *   3. Network Client — connect to the server PC (POS only)
 *
 * After completion, saves config via window.electronAPI.saveNetworkConfig()
 * and calls props.onComplete({ role, apiUrl }).
 *
 * MODE LOCK: Once completed, the mode cannot be changed without
 * explicitly triggering "Reset Setup" from Settings.
 */

import React, { useState, useEffect, useRef } from 'react';
import packageJson from '../package.json';

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
  bg        : 'radial-gradient(1200px 600px at 20% 10%, rgba(41,121,255,0.22) 0%, rgba(15,23,42,0.0) 55%), radial-gradient(900px 520px at 85% 18%, rgba(18,176,122,0.18) 0%, rgba(15,23,42,0.0) 55%), linear-gradient(180deg, #0b1324 0%, #0a1628 55%, #081023 100%)',
  card      : '#ffffff',
  border    : '#e1e8f5',
  text      : '#0d1b3e',
  textMd    : '#3d5280',
  muted     : '#8fa3c8',
  blue      : '#2979ff',
  blueLight : '#e8eeff',
  green     : '#0f9e6e',
  greenLight: '#e6f7f2',
  orange    : '#e07a10',
  orangeLight:'#fef3e2',
  red       : '#e03151',
  redLight  : '#fde8ed',
  shadow    : '0 4px 24px rgba(13,27,62,0.10)',
  shadowLg  : '0 8px 40px rgba(13,27,62,0.18)',
};

function WizardGlyph({ tone }) {
  var c = tone === 'green' ? '#12b07a' : tone === 'orange' ? '#e07a10' : '#2979ff';
  var bg = tone === 'green' ? 'rgba(18,176,122,0.12)' : tone === 'orange' ? 'rgba(224,122,16,0.12)' : 'rgba(41,121,255,0.12)';
  var bd = tone === 'green' ? 'rgba(18,176,122,0.28)' : tone === 'orange' ? 'rgba(224,122,16,0.28)' : 'rgba(41,121,255,0.28)';
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg, border: '1.5px solid ' + bd, flexShrink: 0,
      boxShadow: '0 10px 24px rgba(2,6,23,0.12)',
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {tone === 'green' ? (
          <>
            <path d="M4 7h16" />
            <path d="M7 7v12" />
            <path d="M17 7v12" />
            <path d="M5 19h14" />
          </>
        ) : tone === 'orange' ? (
          <>
            <path d="M4 6h16v10H4z" />
            <path d="M7 20h10" />
            <path d="M12 16v4" />
          </>
        ) : (
          <>
            <path d="M4 7h16" />
            <path d="M6 7v12" />
            <path d="M18 7v12" />
            <path d="M9 11h6" />
            <path d="M9 15h6" />
          </>
        )}
      </svg>
    </div>
  );
}

/* ─── Shared styled primitives ───────────────────────────────────── */
function Card({ children, style }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, border: '1.5px solid rgba(226,232,240,0.9)',
      boxShadow: '0 20px 70px rgba(2,6,23,0.22)', padding: '18px 20px',
      ...style
    }}>
      {children}
    </div>
  );
}

/* Inject hover/active CSS once so PrimaryBtn feels responsive */
if (typeof document !== 'undefined' && !document.getElementById('tc-btn-styles')) {
  const s = document.createElement('style');
  s.id = 'tc-btn-styles';
  s.textContent = `
    .tc-btn { transition: opacity .12s, transform .1s, box-shadow .12s !important; }
    .tc-btn:hover:not(:disabled) { opacity: .88 !important; transform: translateY(-1px) !important; }
    .tc-btn:active:not(:disabled) { opacity: .95 !important; transform: translateY(1px) scale(0.97) !important; box-shadow: none !important; }
    .tc-btn:disabled { cursor: not-allowed !important; }
  `;
  document.head.appendChild(s);
}

function PrimaryBtn({ children, onClick, disabled, loading, col = 'blue', style }) {
  const colors = {
    blue  : { bg: 'linear-gradient(135deg,#2979ff,#2255d4)', txt: '#fff', shadow: '0 3px 14px rgba(41,121,255,0.38)' },
    green : { bg: 'linear-gradient(135deg,#12b07a,#0d8a5e)', txt: '#fff', shadow: '0 3px 14px rgba(18,176,122,0.38)' },
    orange: { bg: 'linear-gradient(135deg,#e07a10,#c85e00)', txt: '#fff', shadow: '0 3px 14px rgba(224,122,16,0.38)' },
    gray  : { bg: '#eef2fb', txt: C.textMd, shadow: 'none' },
  };
  const c = colors[col] || colors.blue;
  return (
    <button className="tc-btn" onClick={onClick} disabled={disabled || loading} style={{
      background: c.bg, color: c.txt, border: 'none', borderRadius: 8,
      padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      opacity: (disabled || loading) ? 0.55 : 1,
      boxShadow: (disabled || loading) ? 'none' : c.shadow,
      fontFamily: 'inherit',
      ...style
    }}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner({ size = 14 }) {
  return (
    <span style={{
      width: size, height: size, border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff', borderRadius: '50%',
      display: 'inline-block', animation: 'tc-spin 0.7s linear infinite', flexShrink: 0,
    }} />
  );
}

function StatusRow({ icon, text, status }) {
  /* status: 'pending' | 'running' | 'done' | 'error' */
  const iconMap = {
    pending: <span style={{ color: C.muted }}>○</span>,
    running: <Spinner size={13} />,
    done   : <span style={{ color: C.green, fontWeight: 900 }}>✓</span>,
    error  : <span style={{ color: C.red, fontWeight: 900 }}>✗</span>,
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', borderBottom: '1px solid ' + C.border,
      fontSize: 12, color: status === 'error' ? C.red : status === 'done' ? C.green : C.textMd,
    }}>
      <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {iconMap[status] || iconMap.pending}
      </span>
      <span>{text}</span>
    </div>
  );
}

function ProgressBar({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, fontWeight: 700,
            background: i < current ? C.blue : i === current ? C.blue : '#e8eeff',
            color: i <= current ? '#fff' : C.muted,
            boxShadow: i === current ? '0 0 0 4px rgba(41,121,255,0.18)' : 'none',
            transition: 'all .25s',
          }}>
            {i < current ? '✓' : i + 1}
          </div>
          <div style={{ fontSize: 10, fontWeight: i === current ? 600 : 500, color: i === current ? '#7db8ff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{s}</div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? C.blue : 'rgba(255,255,255,0.15)', borderRadius: 2, minWidth: 12, transition: 'background .25s' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── STEP 1: Mode Selection ─────────────────────────────────────── */
function ModeSelector({ onSelect }) {
  const [hovered, setHovered] = useState(null);

  const modes = [
    {
      id: 'standalone',
      tone: 'blue',
      title: 'Single Computer',
      subtitle: 'Standalone Mode',
      desc: 'All your data stays on this computer. Perfect for a single-PC shop.',
      tags: ['Full ERP', 'No network needed', 'Simple setup'],
      color: C.blue,
      bg: 'rgba(41,121,255,0.08)',
    },
    {
      id: 'network_server',
      tone: 'green',
      title: 'Main Computer',
      subtitle: 'Network Server',
      desc: 'This PC stores all business data. Other computers connect to it for POS.',
      tags: ['Full ERP', 'Shares data', 'Auto setup'],
      color: C.green,
      bg: 'rgba(18,176,122,0.08)',
    },
    {
      id: 'network_client',
      tone: 'orange',
      title: 'Counter Computer',
      subtitle: 'Network Client',
      desc: 'POS terminal only. Connects to the main server computer.',
      tags: ['POS only', 'Needs server', 'Lightweight'],
      color: C.orange,
      bg: 'rgba(224,122,16,0.08)',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(41,121,255,0.18), rgba(18,176,122,0.12))',
          border: '1.5px solid rgba(148,163,184,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 14px 30px rgba(2,6,23,0.14)',
          flexShrink: 0,
        }}>
          <img
            src="./techonerp.ico"
            alt="Techon ERP"
            style={{
              width: 30,
              height: 30,
              objectFit: 'contain',
              display: 'block',
              filter: 'drop-shadow(0 6px 14px rgba(2,6,23,0.18))',
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>System setup</div>
          <div style={{ fontSize: 13, color: C.textMd, marginTop: 4, lineHeight: 1.45 }}>
            Choose how this computer will be used. You can reset this later from Settings.
          </div>
        </div>
      </div>

      <div className="tc-wizard-modes-grid">
        {modes.map(m => {
          const isHov = hovered === m.id;
          return (
            <div
              key={m.id}
              onClick={() => onSelect(m.id)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: '1.5px solid ' + (isHov ? 'rgba(15,23,42,0.18)' : C.border),
                borderRadius: 14, padding: '12px 12px', cursor: 'pointer',
                background: isHov ? 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)' : C.card,
                transition: 'all .18s cubic-bezier(.22,1,.36,1)',
                display: 'flex', alignItems: 'center', gap: 12,
                transform: isHov ? 'translateY(-2px)' : 'none',
                boxShadow: isHov ? '0 16px 46px rgba(2,6,23,0.14)' : '0 10px 26px rgba(2,6,23,0.06)',
                position: 'relative',
                overflow: 'hidden',
                minHeight: 158,
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(520px 220px at 10% 0%, ' + m.bg + ' 0%, rgba(255,255,255,0) 60%)', pointerEvents: 'none' }} />
              <WizardGlyph tone={m.tone} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{m.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: m.color, background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 999, padding: '2px 8px' }}>{m.subtitle}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMd, lineHeight: 1.4, marginBottom: 7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.desc}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {m.tags.map(t => (
                    <span key={t} style={{ fontSize: 9.5, color: '#64748b', background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{
                width: 28, height: 28, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isHov ? m.bg : 'rgba(148,163,184,0.10)',
                border: '1px solid rgba(148,163,184,0.22)',
                color: isHov ? m.color : '#64748b',
                transition: 'all .18s',
                flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── SERVER SETUP STEPS ─────────────────────────────────────────── */
const SERVER_STEPS = [
  { key: 'xampp_check',    label: 'Check XAMPP installation' },
  { key: 'services_start', label: 'Start Apache & MySQL' },
  { key: 'port_detect',    label: 'Detect HTTP port' },
  { key: 'copy_api',       label: 'Copy API files to server' },
  { key: 'setup_db',       label: 'Create database & tables' },
  { key: 'verify_api',     label: 'Verify API is working' },
  { key: 'get_ip',         label: 'Detect network address' },
];

function ServerSetup({ onComplete }) {
  const api = window.electronAPI || {};
  const [phase, setPhase]         = useState('intro');
  const [steps, setSteps]         = useState(
    SERVER_STEPS.reduce((acc, s) => ({ ...acc, [s.key]: 'pending' }), {})
  );
  const [log, setLog]             = useState([]);
  const [apiUrl, setApiUrl]       = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [xamppPath, setXamppPath] = useState('');
  const [port, setPort]           = useState(80);
  const [errorMsg, setErrorMsg]   = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated]   = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const logRef = useRef(null);

  /* Existing-data detection + background migration hook
     NOTE: Hooks must run on every render; we gate by `phase` inside. */
  const hasExistingData = (() => {
    const cache = window._idbCache || {};
    return ['tc3_products','tc3_sales','tc3_customers'].some(k => Array.isArray(cache[k]) && cache[k].length > 0);
  })();

  async function handleMigrate() {
    setMigrating(true);
    try {
      const cache = window._idbCache || {};
      const TC_KEYS = [
        'tc3_settings','tc3_products','tc3_customers','tc3_suppliers',
        'tc3_sales','tc3_purchases','tc3_expenses','tc3_repairs',
        'tc3_assets','tc3_damageLog','tc3_productLog','tc3_repairDeleteLog',
        'tc3_salesReturns','tc3_purchaseReturns','tc3_quotations','tc3_cheques',
        'tc3_manualReceivables','tc3_manualPayables','tc3_capLedger','tc3_capLog',
        'tc3_profitDist','tc3_assetLog','tc3_openBal','tc3_labelDesigns','tc3_businessType',
      ];
      const patches = TC_KEYS
        .filter(k => cache[k] !== undefined && cache[k] !== null)
        .map(k => ({ key: k, value: cache[k] }));

      if (patches.length === 0) { setMigrating(false); setMigrated(true); return; }

      const headers = { 'Content-Type': 'application/json', 'X-TC-Client-ID': 'migration' };
      if (generatedKey) headers['X-TC-KEY'] = generatedKey;

      const res  = await fetch(apiUrl + 'sync_patch.php', {
        method: 'POST', headers,
        body: JSON.stringify({ patches, client_id: 'migration' }),
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Migration failed');
      setMigrated(true);
    } catch (err) {
      alert('Migration error: ' + err.message);
    }
    setMigrating(false);
  }

  useEffect(function () {
    if (phase !== 'done' || !hasExistingData || migrated || migrating || !apiUrl || !generatedKey) return;
    var t = setTimeout(function () { handleMigrate(); }, 800);
    return function () { clearTimeout(t); };
  }, [phase, hasExistingData, migrated, migrating, apiUrl, generatedKey]); /* eslint-disable-line react-hooks/exhaustive-deps */

  function addLog(msg) {
    setLog(prev => [...prev, msg]);
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }

  function setStep(key, status) {
    setSteps(prev => ({ ...prev, [key]: status }));
  }

  async function runAutoSetup(xamppBase) {
    setPhase('running');
    setErrorMsg('');
    const usedPath = xamppBase || xamppPath;

    try {
      // 1. Confirm XAMPP present
      setStep('xampp_check', 'running');
      addLog('Looking for XAMPP at ' + usedPath + '...');
      const check = await api.checkXampp();
      if (!check.found) throw new Error('XAMPP not found at expected location.');
      setStep('xampp_check', 'done');
      addLog('XAMPP found at ' + check.path);

      // 2. Start services
      setStep('services_start', 'running');
      addLog('Starting Apache and MySQL...');
      const started = await api.startXamppServices({ xamppPath: check.path });
      if (!started.ok) throw new Error('Failed to start services: ' + started.message);
      await sleep(2500); // let services stabilise
      setStep('services_start', 'done');
      addLog('Services started.');

      // 3. Detect port
      setStep('port_detect', 'running');
      addLog('Detecting HTTP port...');
      const portResult = await api.testHttpPort();
      if (!portResult.ok) throw new Error('Apache is not responding on any port. Check if port 80 or 8080 is free.');
      setPort(portResult.port);
      setStep('port_detect', 'done');
      addLog('Apache is running on port ' + portResult.port);

      // 4. Copy API files
      setStep('copy_api', 'running');
      addLog('Copying API files to htdocs/api...');
      const copied = await api.copyApiFiles({ xamppPath: check.path });
      if (!copied.ok) throw new Error('Could not copy API files: ' + copied.message);
      setStep('copy_api', 'done');
      addLog('API files copied.');

      // 5. Setup database
      setStep('setup_db', 'running');
      addLog('Creating database techon_erp_network...');
      const dbResult = await api.setupDatabase({ xamppPath: check.path });
      if (!dbResult.ok) throw new Error('Database setup failed: ' + dbResult.message);
      setStep('setup_db', 'done');
      addLog('Database ready.');

      // 6. Verify API
      setStep('verify_api', 'running');
      addLog('Verifying API endpoint...');
      await sleep(1000);
      const pingOk = await pingApi('http://127.0.0.1:' + portResult.port + '/api/');
      if (!pingOk) throw new Error('API did not respond to ping. Check XAMPP is running.');
      setStep('verify_api', 'done');
      addLog('API verified and responding.');

      // 7. Get LAN IP
      setStep('get_ip', 'running');
      addLog('Detecting LAN IP address...');
      const ipResult = await api.getLanIp();
      const lanIp = ipResult.ip || '127.0.0.1';
      const finalApiUrl = 'http://' + lanIp + ':' + portResult.port + '/api/';
      setApiUrl(finalApiUrl);
      setStep('get_ip', 'done');
      addLog('LAN address: ' + lanIp);

      // 8. Generate API key
      addLog('Generating security key...');
      const keyResult = await api.generateApiKey();
      const apiKey    = keyResult.key;

      // 9. Write key to htdocs/api/tc_api_key.php
      const keyWritten = await api.writeApiKey({ xamppPath: check.path, key: apiKey });
      if (!keyWritten.ok) throw new Error('Could not write API key: ' + keyWritten.message);
      addLog('Security key installed.');

      // 10. Save full config
      await api.saveNetworkConfig({
        role: 'network_server',
        apiUrl: finalApiUrl,
        apiKey,
        xamppPath: check.path,
        port: portResult.port,
        wizardComplete: true,
      });
      addLog('Configuration saved.');
      setApiUrl(finalApiUrl);
      // Store key for display on done screen
      setGeneratedKey(apiKey);

      setPhase('done');

    } catch (err) {
      const failedStep = Object.keys(steps).find(k => steps[k] === 'running');
      if (failedStep) setStep(failedStep, 'error');
      setErrorMsg(err.message);
      setPhase('error');
      addLog('ERROR: ' + err.message);
    }
  }

  async function pingApi(url) {
    try {
      const r = await fetch(url + 'ping.php', { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      return j.success === true;
    } catch (_) { return false; }
  }

  async function openXamppInstaller() {
    await api.openXamppInstaller();
  }

  // Intro phase
  if (phase === 'intro') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🗄️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Server Auto Setup</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
            This will install and configure XAMPP on your computer. It runs once and takes about 3–5 minutes.
          </div>
        </div>

        <div style={{ background: C.orangeLight, border: '1.5px solid ' + C.orange, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, color: C.orange, marginBottom: 4, fontSize: 13 }}>⚙️ Important Setup Step</div>
          <div style={{ fontSize: 12, color: '#7c4a00', lineHeight: 1.45 }}>
            • XAMPP must be installed at <strong>C:\xampp</strong> (recommended)<br />
            • <strong>Do NOT install inside Program Files</strong><br />
            • This is required only once. It takes 2–3 minutes.
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: C.textMd, marginBottom: 6 }}>Checklist:</div>
          {[
            { done: true,  text: 'Step 1 — Choose "Network Server" mode (done)' },
            { done: false, text: 'Step 2 — Install XAMPP (click button below if not installed)' },
            { done: false, text: 'Step 3 — Run automatic setup (everything else is handled)' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: item.done ? C.green : C.textMd }}>
              <span>{item.done ? '✅' : '⬜'}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PrimaryBtn col="orange" onClick={openXamppInstaller} style={{ flex: 1 }}>
            📥 Open XAMPP Installer
          </PrimaryBtn>
          <PrimaryBtn col="green" onClick={() => runAutoSetup()} style={{ flex: 1 }}>
            ▶ Run Automatic Setup
          </PrimaryBtn>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: 'center' }}>
          Already have XAMPP installed? Just click "Run Automatic Setup".
        </div>
      </div>
    );
  }

  // Running / error phase
  if (phase === 'running' || phase === 'error') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>{phase === 'error' ? '⚠️' : '⚙️'}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: phase === 'error' ? C.red : C.text }}>
            {phase === 'error' ? 'Setup Issue' : 'Setting Up Server...'}
          </div>
          {phase === 'running' && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Please wait. Do not close the app.</div>}
        </div>

        <div style={{ marginBottom: 10 }}>
          {SERVER_STEPS.map(s => (
            <StatusRow key={s.key} text={s.label} status={steps[s.key]} />
          ))}
        </div>

        <div ref={logRef} style={{
          background: '#0d1b3e', borderRadius: 8, padding: '8px 10px',
          fontFamily: 'monospace', fontSize: 10, color: '#7ed6a8',
          height: 72, overflowY: 'auto', marginBottom: 10,
        }}>
          {log.map((l, i) => <div key={i}>&gt; {l}</div>)}
          {phase === 'running' && <div style={{ color: '#5ca8ff' }}>&gt; _</div>}
        </div>

        {phase === 'error' && (
          <div style={{ background: C.redLight, border: '1.5px solid ' + C.red, borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: C.red }}>
            <strong>Error:</strong> {errorMsg}
            <div style={{ fontSize: 10, marginTop: 4, color: '#9f1239' }}>
              Make sure XAMPP is installed at C:\xampp, then click Retry.
            </div>
          </div>
        )}

        {phase === 'error' && (
          <PrimaryBtn col="blue" onClick={() => {
            setSteps(SERVER_STEPS.reduce((acc, s) => ({ ...acc, [s.key]: 'pending' }), {}));
            setLog([]);
            runAutoSetup();
          }}>
            🔄 Retry Setup
          </PrimaryBtn>
        )}
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.green, marginBottom: 4 }}>Server Setup Complete!</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>
        Your server is running. Use the details below on other computers.
      </div>

      <div className="tc-wizard-server-done-grid" style={{ marginBottom: 10 }}>
        {/* Network URL */}
        <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 10, padding: '10px 12px', textAlign: 'left' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Network Address</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 4 }}>{apiUrl}</div>
          <button onClick={() => { navigator.clipboard.writeText(apiUrl); }} style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>📋 Copy</button>
        </div>

        {/* Security Key */}
        <div style={{ background: '#fef3e2', border: '1.5px solid ' + C.orange, borderRadius: 10, padding: '10px 12px', textAlign: 'left' }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.orange, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Security Key <span style={{ color: C.red }}>(required for client PCs)</span></div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all', letterSpacing: '0.05em', marginBottom: 4 }}>{generatedKey}</div>
          <button onClick={() => { navigator.clipboard.writeText(generatedKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
            style={{ background: C.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {keyCopied ? '✓ Copied!' : '📋 Copy Key'}
          </button>
        </div>
      </div>

      {/* Data Migration */}
      {hasExistingData && !migrated && (
        <div style={{ background: '#e8eeff', border: '1.5px solid ' + C.blue, borderRadius: 10, padding: '10px 12px', marginBottom: 10, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, color: C.blue, marginBottom: 4, fontSize: 12 }}>📦 Existing Data Found</div>
          <div style={{ fontSize: 11, color: C.textMd, marginBottom: 8, lineHeight: 1.45 }}>
            You have existing shop data on this computer. Do you want to import it into the server?
          </div>
          <PrimaryBtn col="blue" onClick={handleMigrate} loading={migrating} style={{ fontSize: 12 }}>
            {migrating ? 'Importing...' : '⬆ Import Existing Data to Server'}
          </PrimaryBtn>
        </div>
      )}
      {migrated && (
        <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12, color: C.green, fontWeight: 600 }}>
          ✓ Existing data imported to server successfully
        </div>
      )}

      <div style={{ background: '#fff', border: '1.5px solid ' + C.border, borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: C.textMd, textAlign: 'left' }}>
        <strong>On each counter computer:</strong>
        <ol style={{ margin: '4px 0 0 14px', lineHeight: 1.55 }}>
          <li>Install Techon ERP → choose "Counter Computer"</li>
          <li>Enter the <strong>Network Address</strong> above</li>
          <li>Enter the <strong>Security Key</strong> above</li>
        </ol>
      </div>

      <PrimaryBtn col="green" onClick={() => onComplete({ role: 'network_server', apiUrl, apiKey: generatedKey })} style={{ width: '100%', justifyContent: 'center' }}>
        🚀 Start Using Techon ERP
      </PrimaryBtn>
    </div>
  );
}

/* ─── CLIENT SETUP ───────────────────────────────────────────────── */
function ClientSetup({ onComplete }) {
  const [url, setUrl]         = useState('');
  const [apiKey, setApiKey]   = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus]   = useState(null); // null | 'ok' | 'error'
  const [errMsg, setErrMsg]   = useState('');
  const api = window.electronAPI || {};

  function normalise(raw) {
    let u = raw.trim();
    if (!u.endsWith('/')) u += '/';
    if (!u.includes('/api/')) u += 'api/';
    return u;
  }

  const inputStyle = (hasErr) => ({
    width: '100%', border: '1.5px solid ' + (hasErr ? C.red : status === 'ok' ? C.green : C.border),
    borderRadius: 8, padding: '7px 10px', fontSize: 13, lineHeight: 1.25, outline: 'none',
    fontFamily: 'inherit', color: C.text, background: '#f8faff',
    boxSizing: 'border-box', transition: 'border-color .15s',
    minHeight: 36,
  });

  async function testAndSave() {
    if (isConnecting) return;
    const apiUrl = normalise(url);
    if (!apiUrl.startsWith('http')) {
      setStatus('error'); setErrMsg('Address must start with http://'); return;
    }
    if (!apiKey.trim()) {
      setStatus('error'); setErrMsg('Please enter the Security Key from your server computer.'); return;
    }

    setIsConnecting(true); setStatus(null); setErrMsg('');

    try {
      /* Step 1 — basic ping (no auth needed) */
      const pingRes = await fetch(apiUrl + 'ping.php', { signal: AbortSignal.timeout(8000) });
      if (!pingRes.ok) throw new Error('Server returned HTTP ' + pingRes.status);
      const pingJson = await pingRes.json();
      if (!pingJson.success) throw new Error('Server is not ready: ' + (pingJson.message || 'unknown'));

      /* Step 2 — verify products endpoint WITH auth key */
      const prodRes = await fetch(apiUrl + 'get_products.php', {
        headers: { 'X-TC-KEY': apiKey.trim() },
        signal: AbortSignal.timeout(8000),
      });
      if (prodRes.status === 401) throw new Error('Security Key is incorrect. Please check and try again.');
      if (!prodRes.ok) throw new Error('Server returned HTTP ' + prodRes.status);
      const prodJson = await prodRes.json();
      if (!Array.isArray(prodJson.products)) throw new Error('Invalid response from server. Products not found.');

      /* Step 3 — verify license allows counter PCs */
      const licRes = await fetch(
        apiUrl + 'check_license.php?deviceId=wizard00000001&deviceName=' + encodeURIComponent('Setup Wizard'),
        { headers: { 'X-TC-KEY': apiKey.trim() }, signal: AbortSignal.timeout(8000) }
      );
      const licJson = await licRes.json();
      const licMsg = String((licJson && licJson.message) || '').toLowerCase();
      if (licJson && (licJson.status === 'blocked' || licMsg.indexOf('does not allow client') !== -1)) {
        throw new Error(
          'This license does not allow counter PCs.\n\n' +
          'On the main server PC: Settings → Network → License Sync.\n' +
          'If "Allowed PCs" shows "Not Allowed", contact Techon Computers to upgrade your license.'
        );
      }
      if (licJson && !licJson.success && licMsg.indexOf('not activated') !== -1) {
        throw new Error('Server license is not activated yet. Activate the license on the main server PC first.');
      }

      /* Save config */
      await api.saveNetworkConfig({
        role: 'network_client', apiUrl, apiKey: apiKey.trim(), wizardComplete: true,
      });

      setStatus('ok');
      /* Keep isConnecting true until wizard unmounts — avoids double-submit during success delay */
      setTimeout(() => onComplete({ role: 'network_client', apiUrl, apiKey: apiKey.trim() }), 1200);

    } catch (err) {
      setStatus('error');
      setErrMsg(err.message || 'Cannot connect. Please check the address and key.');
      setIsConnecting(false);
    }
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 26, marginBottom: 4 }}>🖨️</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 4 }}>Connect to Server</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
          Enter the Network Address and Security Key shown on your server computer.
        </div>
      </div>

      <div className="tc-wizard-client-grid" style={{ marginBottom: 10 }}>
        {/* URL field */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: C.textMd, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
            Network Address
          </label>
          <input value={url} onChange={e => { setUrl(e.target.value); setStatus(null); }}
            placeholder="http://192.168.1.100/api/"
            style={inputStyle(status === 'error' && !url)} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            Shown on the server computer — starts with http://
          </div>
        </div>

        {/* API key field */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: C.textMd, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
            Security Key
          </label>
          <input value={apiKey} onChange={e => { setApiKey(e.target.value); setStatus(null); }}
            onKeyDown={e => e.key === 'Enter' && !isConnecting && url && apiKey && testAndSave()}
            placeholder="Paste security key from server computer"
            style={inputStyle(status === 'error' && !apiKey)} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            Found on the server computer's setup completion screen
          </div>
        </div>
      </div>

      {status === 'error' && (
        <div style={{ background: C.redLight, border: '1.5px solid ' + C.red, borderRadius: 8, padding: '8px 10px', marginTop: 10, marginBottom: 10, fontSize: 12, color: C.red }}>
          ⚠️ {errMsg}
        </div>
      )}
      {status === 'ok' && (
        <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 8, padding: '8px 10px', marginTop: 10, marginBottom: 10, fontSize: 12, color: C.green, fontWeight: 600 }}>
          ✓ Connected! Starting POS terminal...
        </div>
      )}

      <PrimaryBtn col="orange" onClick={testAndSave} disabled={!url.trim() || !apiKey.trim() || isConnecting} loading={isConnecting} style={{ width: '100%', justifyContent: 'center' }}>
        {isConnecting ? 'Connecting...' : '🔌 Connect to Server'}
      </PrimaryBtn>
    </div>
  );
}

/* ─── MAIN WIZARD COMPONENT ──────────────────────────────────────── */
export default function SetupWizard({ onComplete }) {
  const [step, setStep]   = useState('mode'); // mode | server | client
  const [mode, setMode]   = useState(null);
  const [appVersion, setAppVersion] = useState(packageJson.version || '—');

  useEffect(function () {
    if (window.electronAPI && window.electronAPI.getAppVersion) {
      window.electronAPI.getAppVersion().then(function (v) {
        if (v) setAppVersion(v);
      }).catch(function () { /* keep package.json */ });
    }
  }, []);

  function handleModeSelect(selectedMode) {
    setMode(selectedMode);
    if (selectedMode === 'standalone') {
      // Standalone needs no further setup
      const api = window.electronAPI || {};
      api.saveNetworkConfig && api.saveNetworkConfig({
        role: 'standalone',
        apiUrl: '',
        wizardComplete: true,
      }).then(() => {
        onComplete({ role: 'standalone', apiUrl: '' });
      }).catch(() => {
        onComplete({ role: 'standalone', apiUrl: '' });
      });
    } else if (selectedMode === 'network_server') {
      setStep('server');
    } else {
      setStep('client');
    }
  }

  const wizardSteps = step === 'mode'
    ? ['Choose Mode']
    : step === 'server'
      ? ['Choose Mode', 'Server Setup']
      : ['Choose Mode', 'Connect to Server'];

  return (
    <>
      <style>{`
        @keyframes tc-spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800;900&display=swap');
        .tc-wizard-modes-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          align-items: stretch;
        }
        @media (max-width: 980px) {
          .tc-wizard-modes-grid { grid-template-columns: 1fr; }
        }
        .tc-wizard-client-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 768px) {
          .tc-wizard-client-grid { grid-template-columns: 1fr 1fr; }
        }
        .tc-wizard-server-done-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 768px) {
          .tc-wizard-server-done-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", zIndex: 9999,
        padding: 16,
      }}>
        <div style={{ width: '100%', maxWidth: 980 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>
              Techon ERP — First-run setup
            </div>
          </div>

          {/* Step progress */}
          {wizardSteps.length > 1 && (
            <ProgressBar
              steps={wizardSteps}
              current={step === 'mode' ? 0 : 1}
            />
          )}

          <Card>
            {step === 'mode' && <ModeSelector onSelect={handleModeSelect} />}
            {step === 'server' && (
              <ServerSetup onComplete={result => {
                onComplete(result);
              }} />
            )}
            {step === 'client' && (
              <ClientSetup onComplete={result => {
                onComplete(result);
              }} />
            )}
          </Card>

          {/* Back button */}
          {step !== 'mode' && (
            <button
              onClick={() => setStep('mode')}
              style={{ marginTop: 10, background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
              ← Back to mode selection
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: C.muted }}>
            Techon ERP v{appVersion} — This setup runs once and can be reset from Settings.
          </div>
        </div>
      </div>
    </>
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
