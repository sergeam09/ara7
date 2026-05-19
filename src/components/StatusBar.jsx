import { useStore } from '../store/useStore'

export default function StatusBar() {
  const { capas, objetos, modo, triggerAncho, triggerAlto, triggerUnidad, publicado, triggerMind, triggerFile } = useStore()

  const nCapas = modo === 'image' ? capas.length : objetos.length

  const triggerStatus = !triggerFile
    ? { color: 'var(--t3)', dot: '#bebab2', text: 'Sin trigger' }
    : !triggerMind
    ? { color: '#e8a23a', dot: '#e8a23a', text: 'Compilando trigger…' }
    : { color: '#6a9a50', dot: '#6a9a50', text: '✓ Trigger listo' }

  return (
    <div
      style={{
        height: '28px',
        background: 'var(--bg)',
        boxShadow: '0 -2px 8px rgba(180,176,168,0.2)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      {/* Trigger status dot + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: triggerStatus.dot,
          }}
        />
        <span style={{ fontSize: '11px', color: triggerStatus.color, fontWeight: triggerMind ? '600' : '400' }}>
          {triggerStatus.text}
        </span>
      </div>

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', background: 'rgba(190,186,178,0.2)' }} />

      {/* N Capas/Objetos */}
      <span style={{ fontSize: '11px', color: 'var(--t2)' }}>
        {nCapas} {modo === 'image' ? 'capa' : 'objeto'}{nCapas !== 1 ? 's' : ''}
      </span>

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', background: 'rgba(190,186,178,0.2)' }} />

      {/* Trigger dimensions */}
      <span style={{ fontSize: '11px', color: 'var(--t2)' }}>
        {triggerAncho} × {triggerAlto} {triggerUnidad}
      </span>

      {/* Separator */}
      <div style={{ width: '1px', height: '16px', background: 'rgba(190,186,178,0.2)' }} />

      {/* Publication status */}
      <div style={{ marginLeft: 'auto' }}>
        <span
          style={{
            fontSize: '11px',
            color: publicado ? 'var(--accent)' : 'var(--t3)',
            fontWeight: publicado ? '600' : '400',
          }}
        >
          {publicado ? 'Publicado' : 'Sin publicar'}
        </span>
      </div>
    </div>
  )
}
