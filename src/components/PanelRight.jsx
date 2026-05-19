import { useEffect } from 'react'
import { useStore } from '../store/useStore'

// ── Inyectar estilos CSS para pseudo-elementos (thumb/track no son inline) ─────
const PANEL_CSS = `
  /* ── Range slider reset + estilo custom ── */
  .ara-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    border: none;
    padding: 0;
    margin: 0;
    display: block;
  }
  .ara-slider::-webkit-slider-container { border-radius: 2px; }
  .ara-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: transparent;
  }
  .ara-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #e8574a;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 1px 6px rgba(232,87,74,0.45);
    transition: width 150ms ease, height 150ms ease, box-shadow 150ms ease;
    margin-top: -5px;
  }
  .ara-slider:hover::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    box-shadow: 0 2px 10px rgba(232,87,74,0.55);
    margin-top: -6px;
  }
  .ara-slider::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: transparent;
    border: none;
  }
  .ara-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #e8574a;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 1px 6px rgba(232,87,74,0.45);
    transition: width 150ms ease, height 150ms ease;
  }
  .ara-slider:hover::-moz-range-thumb {
    width: 16px;
    height: 16px;
  }
  .ara-slider::-moz-range-progress {
    background: rgba(232,87,74,0.35);
    border-radius: 2px;
    height: 4px;
  }

  /* ── Input numérico ── */
  .ara-num {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .ara-num:focus {
    outline: none;
    border-color: #e8574a !important;
    box-shadow: 0 0 0 2px rgba(232,87,74,0.15) !important;
  }
  .ara-num::-webkit-inner-spin-button,
  .ara-num::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .ara-num[type=number] { -moz-appearance: textfield; }

  /* ── Toggle buttons ── */
  .ara-toggle {
    transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
  }
  .ara-toggle:hover { opacity: 0.88; }

  /* ── Delete button ── */
  .ara-delete {
    transition: background 150ms ease, transform 150ms ease;
  }
  .ara-delete:hover {
    background: rgba(232,87,74,0.22) !important;
    transform: translateY(-1px);
  }

  /* ── Select ── */
  .ara-select {
    transition: border-color 150ms ease;
  }
  .ara-select:focus {
    outline: none;
    border-color: #e8574a !important;
  }
`

function injectPanelStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('ara-panel-css')) return
  const el = document.createElement('style')
  el.id = 'ara-panel-css'
  el.textContent = PANEL_CSS
  document.head.appendChild(el)
}

// ── SliderRow: label | input numérico | slider con fill ──────────────────────
function SliderRow({ label, value, step, min, max, onChange }) {
  const display = typeof value === 'number' && !isNaN(value) ? value : 0
  const clamped  = Math.min(Math.max(display, min), max)
  const pct      = max === min ? 0 : ((clamped - min) / (max - min)) * 100
  const fill     = `linear-gradient(to right, rgba(232,87,74,0.30) 0%, rgba(232,87,74,0.30) ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      {/* Label */}
      <label style={{
        fontSize: '11px', color: '#6b7280', fontWeight: '500',
        width: '30%', flexShrink: 0, textAlign: 'left',
        userSelect: 'none', lineHeight: 1,
      }}>
        {label}
      </label>

      {/* Input numérico */}
      <input
        type="number"
        className="ara-num"
        value={display}
        step={step}
        min={min}
        max={max}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
        style={{
          width: '25%', flexShrink: 0,
          padding: '4px 6px',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
          background: 'var(--bg)',
          color: 'var(--t2)',
          fontSize: '11px',
          textAlign: 'right',
        }}
      />

      {/* Slider con progress fill */}
      <input
        type="range"
        className="ara-slider"
        min={min} max={max} step={step}
        value={clamped}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, background: fill }}
      />
    </div>
  )
}

// ── Section: título con separador superior ────────────────────────────────────
function Section({ label, children, first = false }) {
  return (
    <div style={{ marginTop: first ? '4px' : '0' }}>
      <div style={{
        fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase',
        letterSpacing: '0.5px', fontWeight: '600',
        marginTop: first ? '8px' : '20px', marginBottom: '10px',
        paddingTop: first ? '0' : '16px',
        borderTop: first ? 'none' : '1px solid #e5e7eb',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ── Toggle button ─────────────────────────────────────────────────────────────
function ToggleBtn({ active, danger, onClick, children }) {
  return (
    <button
      className="ara-toggle"
      onClick={onClick}
      style={{
        flex: 1, padding: '6px 8px', borderRadius: '7px', border: 'none',
        background: active
          ? (danger ? 'rgba(232,87,74,0.15)' : '#e8574a')
          : 'rgba(190,186,178,0.12)',
        color: active ? (danger ? '#e8574a' : '#fff') : '#6b7280',
        fontSize: '11px', cursor: 'pointer', fontWeight: '600',
        boxShadow: active && !danger ? '0 2px 6px rgba(232,87,74,0.3)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

// ── Shared panel styles ───────────────────────────────────────────────────────
const panelStyle = {
  width: '240px', borderRadius: '16px', boxShadow: 'var(--sh-card)',
  background: 'var(--bg)', display: 'flex', flexDirection: 'column',
  flexShrink: 0, overflow: 'hidden',
}
const headerStyle = {
  height: '40px', borderBottom: '1px solid rgba(190,186,178,0.2)',
  padding: '0 16px', display: 'flex', alignItems: 'center', flexShrink: 0,
}
const headerTextStyle = {
  fontSize: '9px', color: 'var(--t3)', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '1.4px',
}
const emptyStyle = {
  flex: 1, display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: '20px 14px',
}
const bodyStyle = {
  flex: 1, padding: '8px 16px 16px', display: 'flex',
  flexDirection: 'column', overflow: 'hidden', overflowY: 'auto',
}
const sectionLabelStyle = {
  fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase',
  display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px',
}
const fileDisplayStyle = {
  flex: 1, padding: '5px 8px', borderRadius: '6px',
  background: 'rgba(190,186,178,0.1)', fontSize: '10px',
  color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const smallBtnStyle = {
  padding: '5px 9px', borderRadius: '6px', border: 'none',
  background: 'rgba(190,186,178,0.12)', color: 'var(--t2)',
  fontSize: '11px', cursor: 'pointer', transition: 'background 150ms ease',
}
const selectStyle = {
  width: '100%', padding: '6px 8px', borderRadius: '7px',
  border: '1px solid #e5e7eb', background: 'var(--bg)',
  color: 'var(--t2)', fontSize: '11px', cursor: 'pointer',
}
const deleteBtnStyle = {
  padding: '9px 12px', borderRadius: '8px', border: 'none',
  background: 'rgba(232,87,74,0.12)', color: '#e8574a',
  fontSize: '11px', fontWeight: '600', cursor: 'pointer',
  marginTop: 'auto', width: '100%',
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PanelRight() {
  // Inyectar CSS una sola vez al montar
  useEffect(() => { injectPanelStyles() }, [])

  const {
    modo, capas, capaActiva, updateCapa, removeCapa,
    objetos, objetoActivo, updateObjeto, removeObjeto,
  } = useStore()

  // ── SURFACE MODE ──────────────────────────────────────────────────────────────
  if (modo === 'surface') {
    const obj = objetos.find((o) => o.id === objetoActivo)
    const upd = (campo, val) => { if (obj) updateObjeto(obj.id, campo, val) }

    return (
      <div style={panelStyle}>
        <div style={headerStyle}><span style={headerTextStyle}>Propiedades</span></div>

        {!obj ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', lineHeight: 1.6 }}>
              Selecciona un objeto<br />
              <span style={{ fontSize: '10px', color: '#b8b4ae' }}>para ver sus propiedades</span>
            </div>
          </div>
        ) : (
          <div style={bodyStyle}>

            {/* Archivo */}
            <div style={{ marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #e5e7eb' }}>
              <label style={sectionLabelStyle}>Archivo</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={fileDisplayStyle}>{obj.archivo || '—'}</div>
              </div>
            </div>

            {/* Posición */}
            <Section label="Posición" first>
              <SliderRow label="X" value={obj.posX ?? 0} step={0.1} min={-150} max={150} onChange={v => upd('posX', v)} />
              <SliderRow label="Y" value={obj.posY ?? 0} step={0.1} min={-150} max={150} onChange={v => upd('posY', v)} />
              <SliderRow label="Z" value={obj.posZ ?? 0} step={0.1} min={-50}  max={50}  onChange={v => upd('posZ', v)} />
            </Section>

            {/* Rotación */}
            <Section label="Rotación">
              <SliderRow label="X°" value={obj.rotX ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotX', v)} />
              <SliderRow label="Y°" value={obj.rotY ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotY', v)} />
              <SliderRow label="Z°" value={obj.rotZ ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotZ', v)} />
            </Section>

            {/* Dimensiones */}
            <Section label="Dimensiones (cm)">
              <SliderRow label="Ancho" value={obj.anchoReal ?? 80}  step={0.5} min={1} max={300} onChange={v => upd('anchoReal', v)} />
              <SliderRow label="Alto"  value={obj.altoReal  ?? 120} step={0.5} min={1} max={300} onChange={v => upd('altoReal',  v)} />
              <SliderRow label="Prof"  value={obj.profReal  ?? 40}  step={0.5} min={1} max={300} onChange={v => upd('profReal',  v)} />
            </Section>

            {/* Transformación */}
            <Section label="Transformación">
              <SliderRow label="Escala" value={obj.escala   ?? 1} step={0.01} min={0.01} max={5} onChange={v => upd('escala',   v)} />
              <SliderRow label="Opac"   value={obj.opacidad ?? 1} step={0.01} min={0}    max={1} onChange={v => upd('opacidad', v)} />
            </Section>

            {/* Animación */}
            <Section label="Animación">
              <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '8px', lineHeight: 1.5 }}>
                Si el GLB tiene animación propia, correrá automáticamente.
              </div>
              <select
                className="ara-select"
                value={obj.animacion || ''}
                onChange={(e) => upd('animacion', e.target.value)}
                style={selectStyle}
              >
                <option value="">Ninguna</option>
                <option value="float">Float</option>
                <option value="spin">Spin</option>
                <option value="pulse">Pulse</option>
              </select>
            </Section>

            {/* Velocidad */}
            <Section label="Velocidad">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range" className="ara-slider" min="0.1" max="3" step="0.05"
                  value={obj.velocidad !== undefined ? obj.velocidad : 1}
                  onChange={(e) => upd('velocidad', parseFloat(e.target.value))}
                  style={{
                    flex: 1,
                    background: (() => {
                      const v = obj.velocidad !== undefined ? obj.velocidad : 1
                      const p = ((v - 0.1) / (3 - 0.1)) * 100
                      return `linear-gradient(to right, rgba(232,87,74,0.30) 0%, rgba(232,87,74,0.30) ${p}%, #e5e7eb ${p}%, #e5e7eb 100%)`
                    })(),
                  }}
                />
                <span style={{
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  fontSize: '11px', color: '#e8574a', fontWeight: '700',
                  minWidth: '36px', textAlign: 'right', flexShrink: 0,
                }}>
                  {(obj.velocidad !== undefined ? obj.velocidad : 1).toFixed(2)}×
                </span>
              </div>
            </Section>

            {/* Sombra */}
            <Section label="Sombra">
              <div style={{ display: 'flex', gap: '6px' }}>
                <ToggleBtn active={obj.sombra !== false} danger={false} onClick={() => upd('sombra', true)}>Activa</ToggleBtn>
                <ToggleBtn active={obj.sombra === false} danger={true}  onClick={() => upd('sombra', false)}>Inactiva</ToggleBtn>
              </div>
            </Section>

            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <button className="ara-delete" onClick={() => removeObjeto(obj.id)} style={deleteBtnStyle}>
                Eliminar objeto
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── IMAGE MODE ────────────────────────────────────────────────────────────────
  const capa = capas.find((c) => c.id === capaActiva)
  const upd  = (campo, val) => { if (capa) updateCapa(capa.id, campo, val) }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}><span style={headerTextStyle}>Propiedades</span></div>

      {!capa ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: '11px', color: 'var(--t3)', textAlign: 'center', lineHeight: 1.6 }}>
            Selecciona una capa<br />
            <span style={{ fontSize: '10px', color: '#b8b4ae' }}>para ver sus propiedades</span>
          </div>
        </div>
      ) : (
        <div style={bodyStyle}>

          {/* Archivo */}
          <div style={{ marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #e5e7eb' }}>
            <label style={sectionLabelStyle}>Archivo</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={fileDisplayStyle}>{capa.archivo || '—'}</div>
              <button
                onClick={() => document.getElementById(`change-file-${capa.id}`).click()}
                style={smallBtnStyle}
              >∷</button>
              <input
                id={`change-file-${capa.id}`}
                type="file"
                accept={capa.tipo === 'image' ? 'image/*' : 'video/*'}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    useStore.getState().addLayerFile(capa.id, file)
                    updateCapa(capa.id, 'archivo', file.name)
                  }
                }}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Posición */}
          <Section label="Posición" first>
            <SliderRow label="X" value={capa.posX ?? 0} step={0.1} min={-150} max={150} onChange={v => upd('posX', v)} />
            <SliderRow label="Y" value={capa.posY ?? 0} step={0.1} min={-150} max={150} onChange={v => upd('posY', v)} />
            <SliderRow label="Z" value={capa.posZ ?? 0} step={0.1} min={-50}  max={50}  onChange={v => upd('posZ', v)} />
          </Section>

          {/* Tamaño */}
          <Section label="Tamaño (cm)">
            <SliderRow label="Ancho" value={capa.anchoReal ?? 60} step={0.5} min={1} max={300} onChange={v => upd('anchoReal', v)} />
            <SliderRow label="Alto"  value={capa.altoReal  ?? 40} step={0.5} min={1} max={300} onChange={v => upd('altoReal',  v)} />
          </Section>

          {/* Transformación */}
          <Section label="Transformación">
            <SliderRow label="Escala" value={capa.escala   ?? 1} step={0.01} min={0.01} max={5} onChange={v => upd('escala',   v)} />
            <SliderRow label="Opac"   value={capa.opacidad ?? 1} step={0.01} min={0}    max={1} onChange={v => upd('opacidad', v)} />
          </Section>

          {/* Rotación */}
          <Section label="Rotación">
            <SliderRow label="X°" value={capa.rotX ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotX', v)} />
            <SliderRow label="Y°" value={capa.rotY ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotY', v)} />
            <SliderRow label="Z°" value={capa.rotZ ?? 0} step={1} min={-180} max={180} onChange={v => upd('rotZ', v)} />
          </Section>

          {/* Vídeo */}
          {['video', 'webm', 'mp4'].includes(capa.tipo) && (
            <Section label="Vídeo">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500', width: '30%', flexShrink: 0 }}>Loop</label>
                <div style={{ display: 'flex', flex: 1, gap: '6px' }}>
                  <ToggleBtn active={capa.loop !== false} danger={false} onClick={() => updateCapa(capa.id, 'loop', true)}>Activo</ToggleBtn>
                  <ToggleBtn active={capa.loop === false} danger={true}  onClick={() => updateCapa(capa.id, 'loop', false)}>Inactivo</ToggleBtn>
                </div>
              </div>
              <SliderRow label="Delay" value={capa.delay ?? 0} step={0.1} min={0} max={30} onChange={v => upd('delay', v)} />
            </Section>
          )}

          {/* Animación */}
          <Section label="Animación">
            <select
              className="ara-select"
              value={capa.animacion || ''}
              onChange={(e) => updateCapa(capa.id, 'animacion', e.target.value)}
              style={selectStyle}
            >
              <option value="">Ninguna</option>
              <option value="float">Float</option>
              <option value="spin">Spin</option>
              <option value="pulse">Pulse</option>
            </select>
          </Section>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            <button className="ara-delete" onClick={() => removeCapa(capa.id)} style={deleteBtnStyle}>
              Eliminar capa
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
