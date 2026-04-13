import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { installProductionConsole, IS_PRODUCTION } from './productionConfig'
installProductionConsole()
import './index.css'
import LicenseGate from './licensing/LicenseGate.jsx'

type ErrorBoundaryProps = { children?: ReactNode }

type ErrorBoundaryState = { error: Error | null }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown): Pick<ErrorBoundaryState, 'error'> {
    const err = error instanceof Error ? error : new Error(String(error));
    return { error: err };
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      const stack = this.state.error.stack ?? '';
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#0d1b3e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', padding: 32, boxSizing: 'border-box',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px 36px',
            maxWidth: 700, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#e03151', marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{
              background: '#fde8ed', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '12px 14px', fontSize: 13, color: '#7f1d1d',
              marginBottom: 14, wordBreak: 'break-word', fontFamily: 'system-ui, sans-serif',
            }}>
              {IS_PRODUCTION ? 'An unexpected error occurred. Your data was not changed by this screen. Try reloading the app.' : msg}
            </div>
            {stack && !IS_PRODUCTION && (
              <pre style={{
                background: '#f8faff', border: '1px solid #e1e8f5', borderRadius: 8,
                padding: '12px', fontSize: 11, color: '#3d5280', overflowX: 'auto',
                maxHeight: 300, overflowY: 'auto', marginBottom: 14,
              }}>
                {stack}
              </pre>
            )}
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              style={{
                background: 'linear-gradient(135deg,#2979ff,#2255d4)', color: '#fff',
                border: 'none', borderRadius: 10, padding: '11px 28px',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LicenseGate />
    </ErrorBoundary>
  </StrictMode>,
)
