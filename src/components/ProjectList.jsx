import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { layerFiles } from '../store/layerFilesMap'
import LogoAra from './LogoAra'

export default function ProjectList() {
  const { setVista, nuevoProyecto, setProyectoId, setNombre, setModo } = useStore()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const list = await window.electron.projects.list()
      setProjects(list)
    } catch (e) {
      console.error('Error cargando proyectos:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleNew() {
    nuevoProyecto()
    layerFiles.clear()
    setVista('editor')
  }

  async function handleOpen(project) {
    // Cargar config + assets en memoria
    const data = await window.electron.projects.load(project.id)
    if (!data) return

    layerFiles.clear()
    const store = useStore.getState()

    // Reconstruir File objects desde base64
    for (const [name, b64] of Object.entries(data.assets || {})) {
      const byteStr = atob(b64)
      const bytes   = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
      const ext  = name.split('.').pop().toLowerCase()
      const mime = getMime(ext)
      const file = new File([bytes], name, { type: mime })

      // Mapear por ID de capa/objeto
      const idStr = name.split('.')[0]
      const id    = isNaN(Number(idStr)) ? idStr : Number(idStr)
      layerFiles.set(id, file)
    }

    // Restaurar estado del store
    const cfg = data.config
    useStore.setState({
      proyectoId:    project.id,
      nombre:        cfg.nombre || '',
      modo:          cfg.modo   || 'image',
      capas:         cfg.image?.capas  || [],
      objetos:       cfg.surface?.objetos || [],
      capaActiva:    null,
      objetoActivo:  null,
      triggerAncho:  cfg.image?.anchoReal || 60,
      triggerAlto:   cfg.image?.altoReal  || 40,
      triggerUnidad: cfg.image?.unidad    || 'cm',
      proyectoUrl:   cfg.proyectoUrl || null,
      publicado:     !!cfg.proyectoUrl,
      publishLog:    '',
    })

    setVista('editor')
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!window.confirm('¿Eliminar este proyecto? No se puede deshacer.')) return
    setDeleting(id)
    await window.electron.projects.delete(id)
    await loadProjects()
    setDeleting(null)
  }

  function handleOpenFolder(e, id) {
    e.stopPropagation()
    window.electron.projects.openFolder(id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        height: '60px', display: 'flex', alignItems: 'center',
        padding: '0 32px', gap: '20px',
        borderBottom: '1px solid rgba(190,186,178,0.2)',
        flexShrink: 0,
      }}>
        <LogoAra width={90} />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setVista('settings')}
          style={btnStyle('ghost')}
        >
          ⚙ Ajustes
        </button>
        <button onClick={handleNew} style={btnStyle('primary')}>
          + Nuevo proyecto
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--t2)', marginBottom: '24px' }}>
          Proyectos guardados
        </h2>

        {loading ? (
          <div style={{ color: 'var(--t3)', fontSize: '14px' }}>Cargando…</div>
        ) : projects.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '80px' }}>
            <div style={{ fontSize: '48px', opacity: 0.2 }}>◈</div>
            <div style={{ fontSize: '16px', color: 'var(--t3)', textAlign: 'center' }}>
              No hay proyectos todavía.<br />
              <span style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={handleNew}>
                Crea tu primer proyecto →
              </span>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '16px',
          }}>
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => handleOpen(p)}
                style={{
                  background: 'var(--bg)',
                  borderRadius: '16px',
                  boxShadow: 'var(--sh-card)',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  position: 'relative',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {/* Modo badge */}
                <div style={{
                  display: 'inline-block',
                  fontSize: '9px', fontWeight: '700', textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: 'var(--accent)',
                  background: 'rgba(232,87,74,0.1)', borderRadius: '4px',
                  padding: '3px 7px', marginBottom: '10px',
                }}>
                  {p.modo === 'surface' ? 'Surface AR' : 'Image AR'}
                </div>

                {/* Nombre */}
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--t2)', marginBottom: '6px' }}>
                  {p.nombre || 'Sin nombre'}
                </div>

                {/* Capas/objetos */}
                <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '14px' }}>
                  {p.modo === 'surface'
                    ? `${(p.surface?.objetos || []).length} objeto(s)`
                    : `${(p.image?.capas || []).length} capa(s)`}
                  {p.updatedAt && ` · ${new Date(p.updatedAt).toLocaleDateString('es')}`}
                </div>

                {/* URL publicada */}
                {p.proyectoUrl && (
                  <div style={{ fontSize: '9px', color: '#6a9a50', marginBottom: '12px', wordBreak: 'break-all' }}>
                    ✓ Publicado
                  </div>
                )}

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={(e) => handleOpenFolder(e, p.id)}
                    style={btnStyle('ghost', true)}
                    title="Abrir carpeta"
                  >
                    📁
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, p.id)}
                    disabled={deleting === p.id}
                    style={btnStyle('danger', true)}
                    title="Eliminar proyecto"
                  >
                    {deleting === p.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function btnStyle(variant, small = false) {
  const base = {
    border: 'none', borderRadius: small ? '8px' : '10px',
    cursor: 'pointer', fontWeight: '600',
    fontSize: small ? '12px' : '13px',
    padding: small ? '6px 10px' : '8px 20px',
    transition: 'all 150ms ease',
  }
  if (variant === 'primary') return { ...base, background: 'var(--accent)', color: '#fff', boxShadow: '0 4px 12px rgba(232,87,74,0.3)' }
  if (variant === 'danger')  return { ...base, background: 'rgba(232,87,74,0.1)', color: 'var(--accent)' }
  return { ...base, background: 'var(--bg)', color: 'var(--t3)', boxShadow: 'var(--sh-out)' }
}

function getMime(ext) {
  const m = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
    webp:'image/webp', svg:'image/svg+xml', mp4:'video/mp4', webm:'video/webm',
    glb:'model/gltf-binary', gltf:'model/gltf+json', mind:'application/octet-stream' }
  return m[ext] || 'application/octet-stream'
}
