import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function Settings() {
  const { setVista } = useStore()
  const [form,    setForm]    = useState({ githubToken: '', githubUser: '', githubRepo: 'ara7' })
  const [saved,   setSaved]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    window.electron.settings.get().then(s => {
      if (s) setForm(f => ({ ...f, ...s }))
    })
  }, [])

  async function handleSave() {
    await window.electron.settings.set(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestMsg('')
    try {
      const res = await fetch(`https://api.github.com/repos/${form.githubUser}/${form.githubRepo}`, {
        headers: {
          Authorization: `token ${form.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'ARA7-Desktop',
        },
      })
      if (res.ok) {
        const data = await res.json()
        setTestMsg(`✓ Repositorio encontrado: ${data.full_name} (${data.private ? 'privado' : 'público'})`)
      } else {
        setTestMsg(`✗ Error ${res.status}: repositorio no encontrado o token inválido`)
      }
    } catch (e) {
      setTestMsg(`✗ Error de red: ${e.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        height: '60px', display: 'flex', alignItems: 'center', gap: '14px',
        padding: '0 32px', borderBottom: '1px solid rgba(190,186,178,0.2)', flexShrink: 0,
      }}>
        <button onClick={() => setVista('projects')} style={backBtn}>
          ← Proyectos
        </button>
        <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--t2)' }}>Ajustes</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '40px', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {/* GitHub section */}
        <div>
          <div style={sectionTitle}>Conexión a GitHub</div>
          <div style={sectionDesc}>
            ARA 7 publica tus proyectos en <strong>GitHub Pages</strong>.<br />
            Necesitas un repositorio público y un token con permisos de escritura.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
            <Field label="Usuario de GitHub" hint="Tu username (ej: juanperez)">
              <input
                style={inputStyle}
                value={form.githubUser}
                onChange={e => setForm(f => ({ ...f, githubUser: e.target.value }))}
                placeholder="usuario"
                spellCheck={false}
              />
            </Field>

            <Field label="Nombre del repositorio" hint="El repo donde se publicarán los proyectos">
              <input
                style={inputStyle}
                value={form.githubRepo}
                onChange={e => setForm(f => ({ ...f, githubRepo: e.target.value }))}
                placeholder="ara7"
                spellCheck={false}
              />
            </Field>

            <Field label="GitHub Personal Access Token" hint="Settings → Developer settings → Tokens → Generate new token (scope: repo)">
              <input
                style={inputStyle}
                type="password"
                value={form.githubToken}
                onChange={e => setForm(f => ({ ...f, githubToken: e.target.value }))}
                placeholder="ghp_xxxxxxxxxxxx"
                spellCheck={false}
              />
            </Field>
          </div>

          {/* URL preview */}
          {form.githubUser && form.githubRepo && (
            <div style={{
              marginTop: '16px', padding: '12px 16px', borderRadius: '10px',
              background: 'rgba(106,154,80,0.08)', border: '1px solid rgba(106,154,80,0.2)',
              fontSize: '12px', color: '#4a7a30', fontFamily: 'monospace',
            }}>
              Tus proyectos se publicarán en:<br />
              <strong>https://{form.githubUser}.github.io/{form.githubRepo}/proyectos/[id]/viewer.html</strong>
            </div>
          )}

          {/* Test + Save */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={handleTest}
              disabled={testing || !form.githubToken || !form.githubUser || !form.githubRepo}
              style={{ ...actionBtn, background: 'rgba(190,186,178,0.15)', color: 'var(--t2)' }}
            >
              {testing ? 'Verificando…' : 'Verificar conexión'}
            </button>
            <button onClick={handleSave} style={{ ...actionBtn, background: 'var(--accent)', color: '#fff' }}>
              {saved ? '✓ Guardado' : 'Guardar ajustes'}
            </button>
          </div>

          {testMsg && (
            <div style={{
              marginTop: '12px', fontSize: '12px',
              color: testMsg.startsWith('✓') ? '#4a7a30' : '#e8574a',
              lineHeight: 1.5,
            }}>
              {testMsg}
            </div>
          )}
        </div>

        {/* Instrucciones GitHub Pages */}
        <div style={{
          padding: '20px', borderRadius: '14px',
          background: 'rgba(190,186,178,0.1)',
          border: '1px solid rgba(190,186,178,0.2)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--t2)', marginBottom: '10px' }}>
            Cómo configurar GitHub Pages
          </div>
          <ol style={{ fontSize: '12px', color: 'var(--t3)', lineHeight: 1.8, paddingLeft: '18px' }}>
            <li>Crea un repositorio en GitHub (debe ser <strong>público</strong>)</li>
            <li>Ve a Settings → Pages → Source: <strong>Deploy from a branch → main → / (root)</strong></li>
            <li>Crea un token: Settings → Developer settings → Personal access tokens → Generate new token → scope: <strong>repo</strong></li>
            <li>Pega el token aquí y guarda</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--t2)', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

const backBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: '13px', color: 'var(--t3)', padding: '6px 10px',
  borderRadius: '8px', transition: 'color 150ms ease',
}
const sectionTitle = {
  fontSize: '15px', fontWeight: '700', color: 'var(--t2)',
  marginBottom: '8px',
}
const sectionDesc = {
  fontSize: '13px', color: 'var(--t3)', lineHeight: 1.6,
}
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: '10px',
  border: '1px solid #e5e7eb', background: 'var(--bg)',
  color: 'var(--t2)', fontSize: '13px',
  fontFamily: "'SF Mono','Fira Code',monospace",
  outline: 'none', transition: 'border-color 150ms ease',
}
const actionBtn = {
  padding: '9px 20px', borderRadius: '10px', border: 'none',
  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
  transition: 'all 150ms ease',
}
