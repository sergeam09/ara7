import { useState } from 'react'
import { useStore } from '../store/useStore'
import { layerFiles } from '../store/layerFilesMap'
import LogoAra from './LogoAra'
import QRModal from './QRModal'

export default function Topbar() {
  const {
    modo, setModo, nombre, setNombre,
    capas, objetos, triggerFile, triggerMind,
    proyectoId, proyectoUrl, publicado,
    publishing, publishLog, setPublishing, setPublishLog,
    setProyectoId, setProyectoUrl, setPublicado,
    setVista,
  } = useStore()

  const [saving,  setSaving]  = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [showQR,  setShowQR]  = useState(false)

  // ── Guardar proyecto localmente ─────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const id      = proyectoId || String(Date.now())
      const config  = buildConfig()
      const files   = await buildFilesMap()

      const result = await window.electron.projects.save({ id, config, files })
      useStore.getState().setProyectoId(result.id)

      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Publicar en GitHub ──────────────────────────────────────────────────────
  async function handlePublish() {
    if (!triggerMind && modo === 'image') {
      alert('Primero compila el trigger (carga una imagen de referencia en el panel izquierdo).')
      return
    }

    setPublishing(true)
    setPublishLog('Preparando archivos…')

    // Remover listener anterior si existe
    const removeListener = window.electron.onPublishProgress((msg) => {
      setPublishLog(msg)
    })

    try {
      // Guardar primero
      const id     = proyectoId || String(Date.now())
      const config = buildConfig()
      const files  = await buildFilesMap()
      await window.electron.projects.save({ id, config, files })
      useStore.getState().setProyectoId(id)

      // Publicar
      const result = await window.electron.github.publish({ projectId: id, config, files })
      setProyectoUrl(result.url)
      setPublicado(true)
      setPublishLog('✓ Publicado')
      setShowQR(true)
    } catch (e) {
      setPublishLog('✗ Error: ' + e.message)
      alert('Error al publicar: ' + e.message)
    } finally {
      setPublishing(false)
      removeListener()
    }
  }

  // ── Build helpers ───────────────────────────────────────────────────────────
  function buildConfig() {
    const state = useStore.getState()
    return {
      nombre:     state.nombre || 'Sin nombre',
      modo:       state.modo,
      updatedAt:  new Date().toISOString(),
      proyectoUrl: state.proyectoUrl || null,
      image: {
        anchoReal:  state.triggerAncho,
        altoReal:   state.triggerAlto,
        unidad:     state.triggerUnidad,
        mind:       'targets.mind',
        capas: state.capas.map(c => ({
          id:        c.id,
          tipo:      c.tipo,
          archivo:   c.archivo ? `${c.id}.${c.archivo.split('.').pop().toLowerCase()}` : '',
          anchoReal: c.anchoReal, altoReal: c.altoReal,
          posX: c.posX||0, posY: c.posY||0, posZ: c.posZ||0,
          rotX: c.rotX||0, rotY: c.rotY||0, rotZ: c.rotZ||0,
          escala: c.escala||1, opacidad: c.opacidad!==undefined ? c.opacidad : 1,
          animacion: c.animacion||'', delay: c.delay||0, loop: c.loop!==false,
        })),
      },
      surface: {
        objetos: state.objetos.map(o => ({
          id:        o.id,
          tipo:      'glb',
          archivo:   o.archivo ? `${o.id}.${o.archivo.split('.').pop().toLowerCase()}` : '',
          anchoReal: o.anchoReal||80, altoReal: o.altoReal||120, profReal: o.profReal||40,
          posX: o.posX||0, posY: o.posY||0, posZ: o.posZ||0,
          rotX: o.rotX||0, rotY: o.rotY||0, rotZ: o.rotZ||0,
          escala: o.escala||1, opacidad: o.opacidad!==undefined ? o.opacidad : 1,
          animacion: o.animacion||'', velocidad: o.velocidad||1,
          sombra: o.sombra!==false,
        })),
      },
    }
  }

  async function buildFilesMap() {
    const state  = useStore.getState()
    const result = {}

    // Helper: File → base64
    async function fileToB64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    }

    // Trigger + mind (image mode)
    if (state.triggerFile) {
      const ext = state.triggerFile.name.split('.').pop().toLowerCase()
      result[`trigger.${ext}`] = await fileToB64(state.triggerFile)
    }
    if (state.triggerMind) {
      result['targets.mind'] = await fileToB64(state.triggerMind)
    }

    // Archivos de capas / objetos
    for (const [id, file] of layerFiles.entries()) {
      const ext  = file.name.split('.').pop().toLowerCase()
      result[`${id}.${ext}`] = await fileToB64(file)
    }

    return result
  }

  const isReady = modo === 'image'
    ? (triggerMind !== null)
    : (objetos.length > 0)

  return (
    <>
      <div style={{
        display: 'flex', height: '52px',
        background: 'var(--bg)',
        boxShadow: '0 2px 10px rgba(180,176,168,0.3)',
        padding: '0 18px', gap: '12px', alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Volver */}
        <button
          onClick={() => setVista('projects')}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: '13px', color: 'var(--t3)', padding: '6px 8px',
            borderRadius: '8px', flexShrink: 0, transition: 'color 150ms ease',
          }}
        >
          ← Proyectos
        </button>

        <div style={{ width: '1px', height: '20px', background: 'rgba(190,186,178,0.3)' }} />

        {/* Logo */}
        <LogoAra width={80} />

        {/* Toggle modo */}
        <div style={{
          background: 'var(--bg)', borderRadius: '10px', padding: '3px',
          display: 'flex', boxShadow: 'var(--sh-in)', gap: '2px',
        }}>
          {['image', 'surface'].map(m => (
            <button key={m} onClick={() => setModo(m)} style={{
              border: 'none', background: modo === m ? 'var(--bg)' : 'transparent',
              color: modo === m ? 'var(--accent)' : 'var(--t3)',
              borderRadius: '7px', padding: '5px 16px', cursor: 'pointer',
              fontSize: '11px', fontWeight: '600',
              boxShadow: modo === m ? 'var(--sh-out)' : 'none',
              transition: 'all 200ms ease', textTransform: 'capitalize',
            }}>
              {m === 'image' ? 'Image' : 'Surface'}
            </button>
          ))}
        </div>

        {/* Nombre */}
        <input
          type="text" value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del proyecto…"
          style={{
            flex: 1, maxWidth: '240px', background: 'var(--bg)', border: 'none',
            borderRadius: '9px', boxShadow: 'var(--sh-in)',
            padding: '6px 12px', fontSize: '12px', color: 'var(--t2)', outline: 'none',
          }}
        />

        <div style={{ flex: 1 }} />

        {/* Log de publicación */}
        {publishing && (
          <div style={{
            fontSize: '11px', color: 'var(--accent)', maxWidth: '220px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {publishLog}
          </div>
        )}

        {/* URL publicada */}
        {proyectoUrl && !publishing && (
          <button
            onClick={() => setShowQR(true)}
            style={{
              background: 'rgba(106,154,80,0.12)', border: 'none',
              borderRadius: '8px', padding: '5px 12px',
              fontSize: '11px', color: '#4a7a30', fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            ✓ Ver QR
          </button>
        )}

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'var(--bg)', border: 'none', borderRadius: '9px',
            boxShadow: 'var(--sh-out)', color: saving ? 'var(--t3)' : 'var(--t2)',
            padding: '7px 16px', fontSize: '12px', fontWeight: '600',
            cursor: saving ? 'default' : 'pointer', transition: 'all 150ms ease',
          }}
        >
          {savedOk ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
        </button>

        {/* Publicar */}
        <button
          onClick={handlePublish}
          disabled={publishing}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: '9px', padding: '7px 20px',
            fontSize: '12px', fontWeight: '700', cursor: publishing ? 'default' : 'pointer',
            boxShadow: '0 3px 10px rgba(232,87,74,0.35)',
            opacity: publishing ? 0.7 : 1, transition: 'all 150ms ease',
          }}
        >
          {publishing ? 'Publicando…' : 'Publicar'}
        </button>
      </div>

      {showQR && proyectoUrl && (
        <QRModal url={proyectoUrl} onClose={() => setShowQR(false)} />
      )}
    </>
  )
}
