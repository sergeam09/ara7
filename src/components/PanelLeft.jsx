import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { layerFiles } from '../store/layerFilesMap'

const LAYER_TYPES = {
  image: { label: 'Imagen',  accept: 'image/*' },
  video: { label: 'Video',   accept: 'video/*' },
  webm:  { label: 'WebM',    accept: '.webm' },
  gif:   { label: 'GIF',     accept: '.gif' },
  svg:   { label: 'SVG',     accept: '.svg' },
  glb:   { label: 'GLB',     accept: '.glb,.gltf' },
  texto: { label: 'Texto',   accept: null },
}

export default function PanelLeft() {
  const {
    modo, triggerFile, triggerAncho, triggerAlto, triggerUnidad,
    setTriggerFile, setTriggerMind, setTriggerDims,
    capas, capaActiva, selectCapa, addCapa, removeCapa, updateCapa,
    objetos, objetoActivo, selectObjeto, addObjeto, removeObjeto,
  } = useStore()

  const [compilationStatus, setCompilationStatus] = useState(null)
  const [triggerPreview,    setTriggerPreview]    = useState(null)
  const [showTypeModal,     setShowTypeModal]     = useState(false)

  const glbInputRef     = useRef(null)
  const pendingObjIdRef = useRef(null)

  // ── Trigger upload ──────────────────────────────────────────────────────────
  async function handleTriggerFile(file) {
    if (!file) return
    setTriggerFile(file)
    setTriggerPreview(URL.createObjectURL(file))

    if (modo === 'image') {
      setCompilationStatus('loading')
      try {
        const mindAR = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js'
        )
        const Compiler = mindAR.Compiler ?? mindAR.default?.Compiler ?? mindAR.IMAGE?.Compiler
        if (!Compiler) throw new Error('MindAR Compiler no encontrado')

        const imgEl  = new Image()
        const objUrl = URL.createObjectURL(file)
        await new Promise((res, rej) => { imgEl.onload = res; imgEl.onerror = rej; imgEl.src = objUrl })

        const compiler = new Compiler()
        await compiler.compileImageTargets([imgEl], (p) => setCompilationStatus(Math.round(p * 100)))
        URL.revokeObjectURL(objUrl)

        const buffer  = await compiler.exportData()
        const mindFile = new File([new Blob([buffer])], 'targets.mind', { type: 'application/octet-stream' })
        setTriggerMind(mindFile)
        setCompilationStatus('ready')
      } catch (err) {
        setCompilationStatus(`error:${err.message}`)
        setTimeout(() => setCompilationStatus(null), 6000)
      }
    }
  }

  // ── Archivo de layer via picker nativo ────────────────────────────────────
  async function pickLayerFile(capa) {
    const tipo   = capa.tipo
    const filters = tipo === 'glb'
      ? [{ name: 'Modelos 3D', extensions: ['glb', 'gltf'] }]
      : tipo === 'video' || tipo === 'webm'
      ? [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }]
      : tipo === 'image'
      ? [{ name: 'Imagen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      : tipo === 'gif'
      ? [{ name: 'GIF', extensions: ['gif'] }]
      : tipo === 'svg'
      ? [{ name: 'SVG', extensions: ['svg'] }]
      : [{ name: 'Todos', extensions: ['*'] }]

    const picked = await window.electron.files.pick({ filters })
    if (!picked || picked.length === 0) return
    const { name, data, ext } = picked[0]

    // Reconstruir File desde base64
    const byteStr = atob(data)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const mime = getMime(ext)
    const file = new File([bytes], name, { type: mime })

    layerFiles.set(capa.id, file)
    updateCapa(capa.id, 'archivo', name)
  }

  async function pickObjFile(objId) {
    const picked = await window.electron.files.pick({
      filters: [{ name: 'Modelos 3D', extensions: ['glb', 'gltf'] }],
    })
    if (!picked || picked.length === 0) return
    const { name, data, ext } = picked[0]

    const byteStr = atob(data)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const file = new File([bytes], name, { type: 'model/gltf-binary' })

    layerFiles.set(objId, file)
    useStore.getState().updateObjeto(objId, 'archivo', name)
  }

  async function pickTrigger() {
    const picked = await window.electron.files.pick({
      filters: [{ name: 'Imagen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })
    if (!picked || picked.length === 0) return
    const { name, data, ext } = picked[0]
    const byteStr = atob(data)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const file = new File([bytes], name, { type: getMime(ext) })
    await handleTriggerFile(file)
  }

  // ── Shared styles ───────────────────────────────────────────────────────────
  const panelStyle = {
    width: '200px', borderRadius: '16px', boxShadow: 'var(--sh-card)',
    background: 'var(--bg)', display: 'flex', flexDirection: 'column',
    flexShrink: 0, overflow: 'hidden',
  }
  const headerStyle = {
    height: '40px', borderBottom: '1px solid rgba(190,186,178,0.2)',
    padding: '0 14px', display: 'flex', alignItems: 'center', flexShrink: 0,
    fontSize: '9px', color: 'var(--t3)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '1.4px',
  }
  const bodyStyle = {
    flex: 1, padding: '10px', display: 'flex', flexDirection: 'column',
    gap: '6px', overflow: 'hidden', overflowY: 'auto',
  }

  // ── IMAGE MODE ──────────────────────────────────────────────────────────────
  if (modo === 'image') {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Image AR</div>
        <div style={bodyStyle}>

          {/* Trigger */}
          <div style={{ marginBottom: '8px' }}>
            <div style={sectionLabel}>Trigger</div>
            <button onClick={pickTrigger} style={uploadBtn}>
              {triggerPreview
                ? <img src={triggerPreview} style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '8px' }} alt="" />
                : <span style={{ fontSize: '11px', color: 'var(--t3)' }}>+ Seleccionar imagen</span>
              }
            </button>

            {/* Compilation status */}
            {compilationStatus !== null && (
              <div style={{ fontSize: '10px', marginTop: '6px', color: 'var(--t3)', textAlign: 'center' }}>
                {compilationStatus === 'loading'  && '⏳ Cargando MindAR…'}
                {compilationStatus === 'ready'    && <span style={{ color: '#6a9a50' }}>✓ Trigger listo</span>}
                {typeof compilationStatus === 'number' && `Compilando ${compilationStatus}%`}
                {typeof compilationStatus === 'string' && compilationStatus.startsWith('error:') && (
                  <span style={{ color: 'var(--accent)' }}>✗ {compilationStatus.replace('error:', '')}</span>
                )}
              </div>
            )}

            {/* Dimensiones */}
            {triggerFile && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                <input
                  type="number" value={triggerAncho} min={1} step={0.5}
                  onChange={e => setTriggerDims(parseFloat(e.target.value) || triggerAncho, triggerAlto, triggerUnidad)}
                  style={dimInput}
                />
                <span style={{ fontSize: '10px', color: 'var(--t3)', alignSelf: 'center' }}>×</span>
                <input
                  type="number" value={triggerAlto} min={1} step={0.5}
                  onChange={e => setTriggerDims(triggerAncho, parseFloat(e.target.value) || triggerAlto, triggerUnidad)}
                  style={dimInput}
                />
                <select value={triggerUnidad} onChange={e => setTriggerDims(triggerAncho, triggerAlto, e.target.value)}
                  style={{ ...dimInput, width: '36px', padding: '3px 2px' }}>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ height: '1px', background: 'rgba(190,186,178,0.3)', margin: '2px 0' }} />

          {/* Capas */}
          <div style={sectionLabel}>Capas ({capas.length}/6)</div>

          {capas.map((capa) => (
            <div
              key={capa.id}
              onClick={() => selectCapa(capa.id)}
              style={{
                padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
                background: capaActiva === capa.id ? 'var(--bg)' : 'transparent',
                boxShadow: capaActiva === capa.id ? 'var(--sh-press)' : 'none',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: capaActiva === capa.id ? 'var(--accent)' : 'var(--t2)' }}>
                  {LAYER_TYPES[capa.tipo]?.label || capa.tipo}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                  {capa.archivo || '— sin archivo'}
                </div>
              </div>
              {capaActiva === capa.id && (
                <button
                  onClick={e => { e.stopPropagation(); pickLayerFile(capa) }}
                  style={{ ...iconBtn, fontSize: '13px' }} title="Cambiar archivo"
                >⤢</button>
              )}
            </div>
          ))}

          {capas.length < 6 && (
            <button onClick={() => setShowTypeModal(true)} style={addLayerBtn}>
              + Añadir capa
            </button>
          )}

          {/* Modal selector de tipo */}
          {showTypeModal && (
            <div style={{
              position: 'absolute', left: '210px', top: '200px',
              background: 'var(--bg)', borderRadius: '14px', boxShadow: 'var(--sh-card)',
              padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px',
              zIndex: 100, minWidth: '140px',
            }}>
              <div style={{ fontSize: '9px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Tipo de capa</div>
              {Object.entries(LAYER_TYPES).map(([tipo, { label }]) => (
                <button key={tipo} onClick={() => {
                  addCapa(tipo)
                  setShowTypeModal(false)
                }} style={typeBtn}>
                  {label}
                </button>
              ))}
              <button onClick={() => setShowTypeModal(false)} style={{ ...typeBtn, color: 'var(--t3)', marginTop: '4px' }}>Cancelar</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── SURFACE MODE ─────────────────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>Surface AR</div>
      <div style={bodyStyle}>
        <div style={sectionLabel}>Objetos 3D</div>

        {objetos.map((obj) => (
          <div
            key={obj.id}
            onClick={() => selectObjeto(obj.id)}
            style={{
              padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
              background: objetoActivo === obj.id ? 'var(--bg)' : 'transparent',
              boxShadow: objetoActivo === obj.id ? 'var(--sh-press)' : 'none',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: objetoActivo === obj.id ? 'var(--accent)' : 'var(--t2)' }}>
                GLB {objetos.indexOf(obj) + 1}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                {obj.archivo || '— sin archivo'}
              </div>
            </div>
            {objetoActivo === obj.id && (
              <button
                onClick={e => { e.stopPropagation(); pickObjFile(obj.id) }}
                style={{ ...iconBtn, fontSize: '13px' }}
              >⤢</button>
            )}
          </div>
        ))}

        <button
          onClick={async () => {
            addObjeto('glb')
            const newId = useStore.getState().objetos.at(-1)?.id
            if (newId) setTimeout(() => pickObjFile(newId), 50)
          }}
          style={addLayerBtn}
        >
          + Añadir objeto
        </button>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const sectionLabel = {
  fontSize: '9px', color: 'var(--t3)', textTransform: 'uppercase',
  letterSpacing: '0.8px', fontWeight: '600', marginBottom: '6px',
}
const uploadBtn = {
  width: '100%', minHeight: '56px', borderRadius: '10px', border: '1px dashed rgba(190,186,178,0.5)',
  background: 'rgba(190,186,178,0.06)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '4px', transition: 'all 150ms ease',
}
const dimInput = {
  flex: 1, padding: '4px 4px', borderRadius: '6px',
  border: '1px solid #e5e7eb', background: 'var(--bg)',
  color: 'var(--t2)', fontSize: '10px', textAlign: 'center', outline: 'none',
}
const addLayerBtn = {
  padding: '8px 10px', borderRadius: '10px', border: '1px dashed rgba(190,186,178,0.5)',
  background: 'transparent', color: 'var(--accent)', fontSize: '11px',
  fontWeight: '600', cursor: 'pointer', textAlign: 'center', marginTop: '4px',
  transition: 'all 150ms ease',
}
const iconBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--t3)', padding: '2px 4px', borderRadius: '4px',
  transition: 'color 150ms ease',
}
const typeBtn = {
  padding: '8px 12px', borderRadius: '8px', border: 'none',
  background: 'transparent', color: 'var(--t2)', fontSize: '12px',
  cursor: 'pointer', textAlign: 'left', transition: 'background 150ms ease',
}

function getMime(ext) {
  const m = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
    webp:'image/webp', svg:'image/svg+xml', mp4:'video/mp4', webm:'video/webm',
    glb:'model/gltf-binary', gltf:'model/gltf+json' }
  return m[ext] || 'application/octet-stream'
}
