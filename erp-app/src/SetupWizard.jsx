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

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
  bg        : 'linear-gradient(135deg, #0a1632 0%, #0d1b3e 100%)',
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

/* ─── Shared styled primitives ───────────────────────────────────── */
function Card({ children, style }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, border: '1.5px solid ' + C.border,
      boxShadow: C.shadow, padding: '28px 30px',
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
      background: c.bg, color: c.txt, border: 'none', borderRadius: 10,
      padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
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
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 0', borderBottom: '1px solid ' + C.border,
      fontSize: 13, color: status === 'error' ? C.red : status === 'done' ? C.green : C.textMd,
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 12, fontWeight: 800,
            background: i < current ? C.blue : i === current ? C.blue : '#e8eeff',
            color: i <= current ? '#fff' : C.muted,
            boxShadow: i === current ? '0 0 0 4px rgba(41,121,255,0.18)' : 'none',
            transition: 'all .25s',
          }}>
            {i < current ? '✓' : i + 1}
          </div>
          <div style={{ fontSize: 11, fontWeight: i === current ? 700 : 500, color: i === current ? '#7db8ff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{s}</div>
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
      icon: '🖥️',
      title: 'Single Computer',
      subtitle: 'Standalone Mode',
      desc: 'All your data stays on this computer. Perfect for a single-PC shop.',
      tags: ['Full ERP', 'No network needed', 'Simple setup'],
      color: C.blue,
      bg: C.blueLight,
    },
    {
      id: 'network_server',
      icon: '🗄️',
      title: 'Main Computer',
      subtitle: 'Network Server',
      desc: 'This PC stores all business data. Other computers connect to it for POS.',
      tags: ['Full ERP', 'Shares data', 'Auto setup'],
      color: C.green,
      bg: C.greenLight,
    },
    {
      id: 'network_client',
      icon: '🖨️',
      title: 'Counter Computer',
      subtitle: 'Network Client',
      desc: 'POS terminal only. Connects to the main server computer.',
      tags: ['POS only', 'Needs server', 'Lightweight'],
      color: C.orange,
      bg: C.orangeLight,
    },
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>👋</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6 }}>Welcome to Techon ERP</div>
        <div style={{ fontSize: 14, color: C.muted, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
          Let's set up your system. Choose how you'll use this computer.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modes.map(m => {
          const isHov = hovered === m.id;
          return (
            <div
              key={m.id}
              onClick={() => onSelect(m.id)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: '2px solid ' + (isHov ? m.color : C.border),
                borderRadius: 14, padding: '18px 20px', cursor: 'pointer',
                background: isHov ? m.bg : C.card,
                transition: 'all .18s cubic-bezier(.22,1,.36,1)',
                display: 'flex', alignItems: 'center', gap: 16,
                transform: isHov ? 'translateX(3px)' : 'none',
                boxShadow: isHov ? '0 4px 20px rgba(13,27,62,0.10)' : 'none',
              }}
            >
              <div style={{ fontSize: 34, flexShrink: 0 }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{m.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, border: '1px solid ' + m.color, borderRadius: 20, padding: '2px 9px' }}>{m.subtitle}</span>
                </div>
                <div style={{ fontSize: 13, color: C.textMd, lineHeight: 1.5, marginBottom: 8 }}>{m.desc}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.tags.map(t => (
                    <span key={t} style={{ fontSize: 11, color: C.muted, background: '#f0f4ff', border: '1px solid ' + C.border, borderRadius: 20, padding: '2px 9px' }}>{t}</span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 20, color: isHov ? m.color : C.muted, transition: 'color .18s' }}>›</span>
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
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🗄️</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>Server Auto Setup</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            This will install and configure XAMPP on your computer. It runs once and takes about 3–5 minutes.
          </div>
        </div>

        <div style={{ background: C.orangeLight, border: '1.5px solid ' + C.orange, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: C.orange, marginBottom: 6, fontSize: 14 }}>⚙️ Important Setup Step</div>
          <div style={{ fontSize: 13, color: '#7c4a00', lineHeight: 1.6 }}>
            • XAMPP must be installed at <strong>C:\xampp</strong> (recommended)<br />
            • <strong>Do NOT install inside Program Files</strong><br />
            • This is required only once. It takes 2–3 minutes.
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.textMd, marginBottom: 10 }}>Checklist:</div>
          {[
            { done: true,  text: 'Step 1 — Choose "Network Server" mode (done)' },
            { done: false, text: 'Step 2 — Install XAMPP (click button below if not installed)' },
            { done: false, text: 'Step 3 — Run automatic setup (everything else is handled)' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, color: item.done ? C.green : C.textMd }}>
              <span>{item.done ? '✅' : '⬜'}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PrimaryBtn col="orange" onClick={openXamppInstaller} style={{ flex: 1 }}>
            📥 Open XAMPP Installer
          </PrimaryBtn>
          <PrimaryBtn col="green" onClick={() => runAutoSetup()} style={{ flex: 1 }}>
            ▶ Run Automatic Setup
          </PrimaryBtn>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: 'center' }}>
          Already have XAMPP installed? Just click "Run Automatic Setup".
        </div>
      </div>
    );
  }

  // Running / error phase
  if (phase === 'running' || phase === 'error') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>{phase === 'error' ? '⚠️' : '⚙️'}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: phase === 'error' ? C.red : C.text }}>
            {phase === 'error' ? 'Setup Issue' : 'Setting Up Server...'}
          </div>
          {phase === 'running' && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Please wait. Do not close the app.</div>}
        </div>

        <div style={{ marginBottom: 14 }}>
          {SERVER_STEPS.map(s => (
            <StatusRow key={s.key} text={s.label} status={steps[s.key]} />
          ))}
        </div>

        <div ref={logRef} style={{
          background: '#0d1b3e', borderRadius: 8, padding: '10px 12px',
          fontFamily: 'monospace', fontSize: 11, color: '#7ed6a8',
          height: 90, overflowY: 'auto', marginBottom: 14,
        }}>
          {log.map((l, i) => <div key={i}>&gt; {l}</div>)}
          {phase === 'running' && <div style={{ color: '#5ca8ff' }}>&gt; _</div>}
        </div>

        {phase === 'error' && (
          <div style={{ background: C.redLight, border: '1.5px solid ' + C.red, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: C.red }}>
            <strong>Error:</strong> {errorMsg}
            <div style={{ fontSize: 11, marginTop: 6, color: '#9f1239' }}>
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

  // Done
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

  const hasExistingData = (() => {
    const cache = window._idbCache || {};
    return ['tc3_products','tc3_sales','tc3_customers'].some(k => Array.isArray(cache[k]) && cache[k].length > 0);
  })();

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 46, marginBottom: 10 }}>🎉</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: C.green, marginBottom: 6 }}>Server Setup Complete!</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 18, lineHeight: 1.6 }}>
        Your server is running. Use the details below on other computers.
      </div>

      {/* Network URL */}
      <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 12, padding: '14px 18px', marginBottom: 12, textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Network Address</div>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 6 }}>{apiUrl}</div>
        <button onClick={() => { navigator.clipboard.writeText(apiUrl); }} style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>📋 Copy</button>
      </div>

      {/* Security Key */}
      <div style={{ background: '#fef3e2', border: '1.5px solid ' + C.orange, borderRadius: 12, padding: '14px 18px', marginBottom: 12, textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Security Key <span style={{ color: C.red }}>(required for client PCs)</span></div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all', letterSpacing: '0.05em', marginBottom: 6 }}>{generatedKey}</div>
        <button onClick={() => { navigator.clipboard.writeText(generatedKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
          style={{ background: C.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {keyCopied ? '✓ Copied!' : '📋 Copy Key'}
        </button>
      </div>

      {/* Data Migration */}
      {hasExistingData && !migrated && (
        <div style={{ background: '#e8eeff', border: '1.5px solid ' + C.blue, borderRadius: 12, padding: '14px 18px', marginBottom: 14, textAlign: 'left' }}>
          <div style={{ fontWeight: 800, color: C.blue, marginBottom: 6, fontSize: 13 }}>📦 Existing Data Found</div>
          <div style={{ fontSize: 12, color: C.textMd, marginBottom: 10, lineHeight: 1.5 }}>
            You have existing shop data on this computer. Do you want to import it into the server?
          </div>
          <PrimaryBtn col="blue" onClick={handleMigrate} loading={migrating} style={{ fontSize: 12 }}>
            {migrating ? 'Importing...' : '⬆ Import Existing Data to Server'}
          </PrimaryBtn>
        </div>
      )}
      {migrated && (
        <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: C.green, fontWeight: 700 }}>
          ✓ Existing data imported to server successfully
        </div>
      )}

      <div style={{ background: '#fff', border: '1.5px solid ' + C.border, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: C.textMd, textAlign: 'left' }}>
        <strong>On each counter computer:</strong>
        <ol style={{ margin: '6px 0 0 14px', lineHeight: 1.9 }}>
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
    borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', color: C.text, background: '#f8faff',
    boxSizing: 'border-box', transition: 'border-color .15s',
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
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🖨️</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>Connect to Server</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Enter the Network Address and Security Key shown on your server computer.
        </div>
      </div>

      {/* URL field */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
          Network Address
        </label>
        <input value={url} onChange={e => { setUrl(e.target.value); setStatus(null); }}
          placeholder="http://192.168.1.100/api/"
          style={inputStyle(status === 'error' && !url)} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Shown on the server computer — starts with http://
        </div>
      </div>

      {/* API key field */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.textMd, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
          Security Key
        </label>
        <input value={apiKey} onChange={e => { setApiKey(e.target.value); setStatus(null); }}
          onKeyDown={e => e.key === 'Enter' && !isConnecting && url && apiKey && testAndSave()}
          placeholder="Paste security key from server computer"
          style={inputStyle(status === 'error' && !apiKey)} />
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Found on the server computer's setup completion screen
        </div>
      </div>

      {status === 'error' && (
        <div style={{ background: C.redLight, border: '1.5px solid ' + C.red, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: C.red }}>
          ⚠️ {errMsg}
        </div>
      )}
      {status === 'ok' && (
        <div style={{ background: C.greenLight, border: '1.5px solid ' + C.green, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: C.green, fontWeight: 700 }}>
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
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", zIndex: 9999,
        padding: 20,
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
              Techon ERP — First Run Setup
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
              style={{ marginTop: 14, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
              ← Back to mode selection
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: C.muted }}>
            Techon ERP v1.3.0 — This setup runs once and can be reset from Settings.
          </div>
        </div>
      </div>
    </>
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
