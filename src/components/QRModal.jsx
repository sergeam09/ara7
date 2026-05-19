import { useEffect, useRef } from 'react'

export default function QRModal({ url, onClose }) {
  const overlayRef = useRef(null)

  // QR via API externa (no requiere dependencia)
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&bgcolor=eeece8&color=2a2826&margin=16&qzone=2`

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleCopy() {
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(42,40,38,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        background: 'var(--bg)', borderRadius: '24px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        padding: '40px 36px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '24px', maxWidth: '420px', width: '90%',
      }}>
        {/* Logo pequeño */}
        <div style={{ fontSize: '9px', color: 'var(--t3)', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
          ARA 7 — Escanea para ver la experiencia
        </div>

        {/* QR */}
        <div style={{
          background: '#eeece8', borderRadius: '20px', padding: '20px',
          boxShadow: 'var(--sh-card)',
        }}>
          <img
            src={qrSrc}
            width={260} height={260}
            alt="QR de la experiencia AR"
            style={{ display: 'block', borderRadius: '10px' }}
          />
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
              background: 'rgba(190,186,178,0.15)', color: 'var(--t2)',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            Copiar URL
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
