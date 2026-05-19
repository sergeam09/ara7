const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')

const isDev = process.env.NODE_ENV === 'development'

// ── Rutas base ────────────────────────────────────────────────────────────────
const PROJECTS_DIR = path.join(app.getPath('documents'), 'ARA7', 'proyectos')

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}
ensureDir(PROJECTS_DIR)

// ── Settings (electron-store via JSON manual para evitar ESM issues) ──────────
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
  } catch {
    return { githubToken: '', githubUser: '', githubRepo: 'ara7' }
  }
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2))
}

// ── Ventana principal ─────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#eeece8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,   // permite cargar CDN (MindAR) desde file://
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Settings ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_, data) => { writeSettings(data); return true })

// ── IPC: Projects ─────────────────────────────────────────────────────────────
ipcMain.handle('projects:list', () => {
  ensureDir(PROJECTS_DIR)
  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      try {
        const cfg = JSON.parse(
          fs.readFileSync(path.join(PROJECTS_DIR, d.name, 'config.json'), 'utf-8')
        )
        return { id: d.name, ...cfg }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return dirs
})

ipcMain.handle('projects:save', async (_, { id, config, files }) => {
  const dir      = path.join(PROJECTS_DIR, id)
  const assetsDir = path.join(dir, 'assets')
  ensureDir(dir)
  ensureDir(assetsDir)

  // Escribir config.json
  const meta = { ...config, id, updatedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(meta, null, 2))

  // Escribir archivos (base64)
  if (files) {
    for (const [name, b64] of Object.entries(files)) {
      const buf = Buffer.from(b64, 'base64')
      fs.writeFileSync(path.join(assetsDir, name), buf)
    }
  }

  return { id, path: dir }
})

ipcMain.handle('projects:delete', (_, id) => {
  const dir = path.join(PROJECTS_DIR, id)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  return true
})

ipcMain.handle('projects:openFolder', (_, id) => {
  shell.openPath(path.join(PROJECTS_DIR, id))
})

ipcMain.handle('projects:load', (_, id) => {
  const dir = path.join(PROJECTS_DIR, id)
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'))
    // Leer assets como base64
    const assetsDir = path.join(dir, 'assets')
    const assets = {}
    if (fs.existsSync(assetsDir)) {
      for (const f of fs.readdirSync(assetsDir)) {
        assets[f] = fs.readFileSync(path.join(assetsDir, f)).toString('base64')
      }
    }
    return { config, assets }
  } catch (e) {
    return null
  }
})

// ── IPC: File picker ──────────────────────────────────────────────────────────
ipcMain.handle('files:pick', async (_, { filters, multiple = false }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters,
  })
  if (result.canceled) return null
  // Devolver paths + contenido base64
  return result.filePaths.map(fp => ({
    path: fp,
    name: path.basename(fp),
    ext:  path.extname(fp).slice(1).toLowerCase(),
    data: fs.readFileSync(fp).toString('base64'),
  }))
})

// ── IPC: GitHub publish ───────────────────────────────────────────────────────
ipcMain.handle('github:publish', async (event, { projectId, config, files }) => {
  const settings = readSettings()
  const { githubToken, githubUser, githubRepo } = settings

  if (!githubToken || !githubUser || !githubRepo) {
    throw new Error('Configura tu token, usuario y repositorio de GitHub en Ajustes.')
  }

  const base    = `https://api.github.com/repos/${githubUser}/${githubRepo}/contents`
  const headers = {
    Authorization: `token ${githubToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ARA7-Desktop',
  }

  const send = (msg) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('publish:progress', msg)
  }

  // Helper: crear/actualizar archivo en GitHub
  async function putFile(repoPath, content64, message) {
    const url = `${base}/${repoPath}`
    // Obtener SHA si el archivo ya existe (para actualizar)
    let sha
    try {
      const r = await fetch(url, { headers })
      if (r.ok) { const j = await r.json(); sha = j.sha }
    } catch {}

    const body = { message, content: content64, ...(sha ? { sha } : {}) }
    const res  = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`GitHub API error en ${repoPath}: ${err.message || res.status}`)
    }
  }

  send('Verificando repositorio…')

  // Verificar que el repo existe
  const repoRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}`, { headers })
  if (!repoRes.ok) throw new Error(`Repositorio "${githubUser}/${githubRepo}" no encontrado. Créalo en GitHub primero.`)

  const prefix = `proyectos/${projectId}`

  // 1. Subir config.json
  send('Subiendo configuración…')
  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64')
  await putFile(`${prefix}/config.json`, configB64, `ARA7: update project ${projectId} config`)

  // 2. Subir assets
  const total = Object.keys(files).length
  let i = 0
  for (const [name, b64] of Object.entries(files)) {
    i++
    send(`Subiendo archivo ${i}/${total}: ${name}`)
    await putFile(`${prefix}/assets/${name}`, b64, `ARA7: add asset ${name}`)
  }

  // 3. Generar y subir viewer.html
  send('Generando viewer…')
  const viewerHtml = generateViewer(config)
  const viewerB64  = Buffer.from(viewerHtml).toString('base64')
  await putFile(`${prefix}/viewer.html`, viewerB64, `ARA7: update viewer for ${projectId}`)

  // 4. Activar GitHub Pages si no está activado
  send('Verificando GitHub Pages…')
  try {
    const pagesRes = await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/pages`, { headers })
    if (!pagesRes.ok) {
      // Intentar activar Pages
      await fetch(`https://api.github.com/repos/${githubUser}/${githubRepo}/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
      })
    }
  } catch {}

  const pageUrl = `https://${githubUser}.github.io/${githubRepo}/${prefix}/viewer.html`
  send(`✓ Publicado: ${pageUrl}`)
  return { url: pageUrl }
})

// ── Viewer HTML template ──────────────────────────────────────────────────────
function generateViewer(config) {
  const modo = config.modo || 'image'
  if (modo === 'surface') return generateSurfaceViewer(config)
  return generateImageViewer(config)
}

function generateImageViewer(config) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${config.nombre || 'ARA 7'}</title>
<script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100%;height:100dvh;font-family:system-ui,sans-serif;overflow:hidden;background:#eeece8}
.a-loader,.a-loader-title,.a-loader-border,.a-enter-vr-button,.a-enter-ar-button,.mindar-ui-loading,.mindar-ui-scanning,.mindar-ui-error,.a-orientation-modal{display:none!important}
#splash{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#eeece8;flex-direction:column;gap:40px;position:fixed;top:0;left:0;z-index:1000}
#splash-bar{width:120px;height:1.5px;background:rgba(42,40,38,0.08);border-radius:1px;overflow:hidden}
#splash-fill{height:100%;background:#e8574a;width:0;animation:prog 3s ease-in-out forwards}
@keyframes prog{to{width:100%}}
#instruction{display:none;width:100%;height:100%;background:#eeece8;flex-direction:column;position:fixed;top:0;left:0;z-index:999}
#instruction.visible{display:flex}
#instruction-header{height:48px;background:#eeece8;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid rgba(184,180,174,0.2)}
#instruction-header svg{width:80px;height:auto}
#instruction-mode{font-size:9px;color:#b8b4ae}
#instruction-content{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:30px;padding:40px 30px}
#scan-frame{width:160px;height:160px;position:relative;animation:pulse 1.5s ease-in-out infinite}
.corner{position:absolute;width:20px;height:20px;border:2px solid #e8574a;border-radius:4px}
.corner.tl{top:0;left:0;border-right:none;border-bottom:none}
.corner.tr{top:0;right:0;border-left:none;border-bottom:none}
.corner.bl{bottom:0;left:0;border-right:none;border-top:none}
.corner.br{bottom:0;right:0;border-left:none;border-top:none}
#scan-line{position:absolute;top:0;left:0;width:100%;height:2px;background:#e8574a;animation:scan 2s ease-in-out infinite}
@keyframes scan{0%{top:0}50%{top:158px}100%{top:0}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
#instruction-text{text-align:center}
#instruction-title{font-size:22px;font-weight:700;color:#2a2826;margin-bottom:10px;line-height:1.2}
#instruction-subtitle{font-size:16px;color:#2a2826;max-width:260px;line-height:1.55}
#start-ar-btn{background:#e8574a;color:#fff;border:none;border-radius:14px;padding:16px 0;font-size:16px;font-weight:700;font-family:system-ui,sans-serif;cursor:pointer;width:100%;box-shadow:0 4px 16px rgba(200,80,55,0.35);letter-spacing:0.3px}
#ar-container{display:none;width:100%;height:100%;position:fixed;top:0;left:0;z-index:1}
#share-btn{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;display:none;background:#e8574a;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:14px;font-weight:700;font-family:system-ui,sans-serif;cursor:pointer;box-shadow:3px 3px 8px rgba(200,80,55,0.4)}
#share-btn.visible{display:block}
.hidden{display:none!important}
</style>
</head>
<body>
<div id="splash">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925 275" style="width:110px;height:auto">
<polygon points="300.11 224.54 325.11 224.54 325.11 174.54 450.11 174.54 450.11 224.54 475.11 224.54 475.11 149.54 300.11 149.54 300.11 224.54" fill="#2a2826"/>
<path d="M700.11,49.54v75h175V49.54h-175ZM850.11,99.54h-125v-25h125v25Z" fill="#2a2826"/>
<polygon points="700.11 224.54 725.11 224.54 725.11 174.54 850.11 174.54 850.11 224.54 875.11 224.54 875.11 149.54 700.11 149.54 700.11 224.54" fill="#2a2826"/>
<path d="M300.11,124.54h175V49.54h-175v75ZM325.11,74.54h125v25h-125v-25Z" fill="#2a2826"/>
<polygon points="500.11 224.54 525.11 224.54 525.11 74.54 650.11 74.54 650.11 99.54 550.11 99.54 550.11 174.54 650.11 174.54 650.11 224.54 675.11 224.54 675.11 149.54 575.11 149.54 575.11 124.54 675.11 124.54 675.11 49.54 500.11 49.54 500.11 224.54" fill="#2a2826"/>
<path d="M49.26,224.52h175V49.52H49.26v175ZM74.26,74.52h125v125h-125v-125Z" fill="#2a2826"/>
<path d="M99.26,174.52h75v-75h-75v75ZM124.26,124.52h25v25h-25v-25Z" fill="#2a2826"/>
</svg>
<div style="font-size:10px;color:#b8b4ae;letter-spacing:2px;text-transform:uppercase">Realidad Aumentada</div>
<div id="splash-bar"><div id="splash-fill"></div></div>
</div>
<div id="instruction">
<div id="instruction-header">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925 275">
<polygon points="300.11 224.54 325.11 224.54 325.11 174.54 450.11 174.54 450.11 224.54 475.11 224.54 475.11 149.54 300.11 149.54 300.11 224.54" fill="#2a2826"/>
<path d="M700.11,49.54v75h175V49.54h-175ZM850.11,99.54h-125v-25h125v25Z" fill="#2a2826"/>
<polygon points="700.11 224.54 725.11 224.54 725.11 174.54 850.11 174.54 850.11 224.54 875.11 224.54 875.11 149.54 700.11 149.54 700.11 224.54" fill="#2a2826"/>
<path d="M300.11,124.54h175V49.54h-175v75ZM325.11,74.54h125v25h-125v-25Z" fill="#2a2826"/>
<polygon points="500.11 224.54 525.11 224.54 525.11 74.54 650.11 74.54 650.11 99.54 550.11 99.54 550.11 174.54 650.11 174.54 650.11 224.54 675.11 224.54 675.11 149.54 575.11 149.54 575.11 124.54 675.11 124.54 675.11 49.54 500.11 49.54 500.11 224.54" fill="#2a2826"/>
<path d="M49.26,224.52h175V49.52H49.26v175ZM74.26,74.52h125v125h-125v-125Z" fill="#2a2826"/>
<path d="M99.26,174.52h75v-75h-75v75ZM124.26,124.52h25v25h-25v-25Z" fill="#2a2826"/>
</svg>
<span id="instruction-mode">Image AR</span>
</div>
<div id="instruction-content">
<div id="scan-frame">
<div class="corner tl"></div><div class="corner tr"></div>
<div class="corner bl"></div><div class="corner br"></div>
<div id="scan-line"></div>
</div>
<div id="instruction-text">
<div id="instruction-title">Apunta a el target o imagen de muestra</div>
<div id="instruction-subtitle">Enfoca tu cámara hacia la imagen para iniciar la experiencia</div>
</div>
<div style="width:100%;text-align:center">
<button id="start-ar-btn">Iniciar AR</button>
<div style="font-size:14px;color:#e8574a;margin-top:16px;text-align:center;line-height:1.5;font-weight:500">Importante:<br>Debes otorgar permiso<br>de uso de cámara.</div>
</div>
</div>
</div>
<div id="ar-container"></div>
<button id="share-btn">COMPARTIR</button>
<script>
(function(){
const CONFIG_URL = './config.json'
let scene, arStarted = false

setTimeout(() => {
  document.getElementById('splash').style.display = 'none'
  document.getElementById('instruction').classList.add('visible')
  loadConfig()
}, 3000)

async function loadConfig() {
  try {
    const cfg = await fetch(CONFIG_URL).then(r => r.json())
    window.__ara7config = cfg
  } catch(e) { console.warn('Config no disponible (preview local)') }
}

document.getElementById('start-ar-btn').addEventListener('click', async () => {
  const btn = document.getElementById('start-ar-btn')
  btn.disabled = true; btn.textContent = 'Iniciando…'
  const cfg = window.__ara7config
  if (!cfg) { btn.disabled=false; btn.textContent='Iniciar AR'; alert('Sin configuración'); return }

  const mindSrc  = './assets/' + (cfg.image?.mind || 'targets.mind')
  const capas    = cfg.image?.capas || []

  document.getElementById('instruction').classList.remove('visible')
  const container = document.getElementById('ar-container')
  container.style.display = 'block'

  scene = document.createElement('a-scene')
  scene.id = 'ar-scene'
  scene.setAttribute('mindar-image', \`imageTargetSrc:\${mindSrc};autoStart:false;uiLoading:no;uiError:no;uiScanning:no\`)
  scene.setAttribute('embedded','')
  scene.setAttribute('color-space','sRGB')
  scene.setAttribute('renderer','colorManagement:true')
  scene.setAttribute('vr-mode-ui','enabled:false')
  scene.setAttribute('device-orientation-permission-ui','enabled:false')
  scene.style.cssText='width:100%;height:100%'

  scene.appendChild(Object.assign(document.createElement('a-camera'),{id:'camera'}))
  const assets = document.createElement('a-assets')
  scene.appendChild(assets)

  const target = document.createElement('a-entity')
  target.setAttribute('mindar-image-target','targetIndex:0')

  capas.forEach(capa => {
    if(!capa.archivo) return
    const assetSrc = './assets/' + capa.archivo
    let el
    if(capa.tipo==='image'||capa.tipo==='gif'||capa.tipo==='svg'){
      el = document.createElement('a-image')
      el.setAttribute('src',assetSrc)
      el.setAttribute('width', (capa.anchoReal||60)/100)
      el.setAttribute('height',(capa.altoReal||40)/100)
    } else if(capa.tipo==='video'||capa.tipo==='webm'){
      const vid = document.createElement('video')
      vid.id='vid'+capa.id; vid.src=assetSrc; vid.loop=capa.loop!==false; vid.muted=true; vid.playsInline=true
      assets.appendChild(vid)
      el = document.createElement('a-video')
      el.setAttribute('src','#vid'+capa.id)
      el.setAttribute('width', (capa.anchoReal||60)/100)
      el.setAttribute('height',(capa.altoReal||40)/100)
    } else if(capa.tipo==='glb'){
      el = document.createElement('a-gltf-model')
      el.setAttribute('src',assetSrc)
    } else { return }
    const px=((capa.posX||0)/100).toFixed(3)
    const py=((capa.posY||0)/100).toFixed(3)
    const pz=((capa.posZ||0)/100).toFixed(3)
    el.setAttribute('position',\`\${px} \${py} \${pz}\`)
    el.setAttribute('rotation',\`\${capa.rotX||0} \${capa.rotY||0} \${capa.rotZ||0}\`)
    const sc=capa.escala||1; el.setAttribute('scale',\`\${sc} \${sc} \${sc}\`)
    if(capa.opacidad!==undefined) el.setAttribute('opacity',capa.opacidad)
    target.appendChild(el)
  })

  scene.appendChild(target)
  container.appendChild(scene)

  scene.addEventListener('loaded', () => {
    const sys = scene.systems['mindar-image-system']
    if(sys){ sys.start(); arStarted=true }
  })
  target.addEventListener('mindar-image-target-found', () => {
    capas.filter(c=>c.tipo==='video'||c.tipo==='webm').forEach(c=>{
      const v=document.getElementById('vid'+c.id); if(v) v.play().catch(()=>{})
    })
  })
  document.getElementById('share-btn').classList.add('visible')
})

document.getElementById('share-btn').addEventListener('click', () => {
  const btn = document.getElementById('share-btn')
  navigator.clipboard.writeText(location.href).then(() => {
    const t=btn.textContent; btn.textContent='¡Enlace copiado!'
    setTimeout(()=>{btn.textContent=t},2000)
  }).catch(()=>{})
})
})()
</script>
</body>
</html>`
}

function generateSurfaceViewer(config) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>${config.nombre || 'ARA 7'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100%;height:100dvh;min-height:-webkit-fill-available;font-family:system-ui,sans-serif;overflow:hidden;background:#eeece8}
#splash{position:fixed;inset:0;background:#eeece8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;z-index:100}
#splash-bar-track{width:180px;height:3px;background:rgba(190,186,178,0.3);border-radius:2px;overflow:hidden}
#splash-bar{height:100%;background:#e8574a;width:0;animation:prog 3s ease-in-out forwards}
@keyframes prog{to{width:100%}}
#instruction{display:none;position:fixed;inset:0;background:#eeece8;flex-direction:column;z-index:100}
#instruction.visible{display:flex}
#instruction-header{height:130px;background:#eeece8;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid rgba(184,180,174,0.2)}
#instruction-header svg{width:360px;height:auto}
#instruction-mode{font-size:15px;color:#b8b4ae}
#instruction-content{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:36px;padding:0 36px}
#surface-frame{width:180px;height:180px;position:relative;animation:pulse 1.5s ease-in-out infinite}
.s-corner{position:absolute;width:26px;height:26px;border:3px solid #e8574a;border-radius:5px}
.s-corner.tl{top:0;left:0;border-right:none;border-bottom:none}
.s-corner.tr{top:0;right:0;border-left:none;border-bottom:none}
.s-corner.bl{bottom:0;left:0;border-right:none;border-top:none}
.s-corner.br{bottom:0;right:0;border-left:none;border-top:none}
#surface-ring{position:absolute;top:50%;left:50%;width:50px;height:50px;border-radius:50%;border:2.5px solid rgba(232,87,74,0.7);animation:ring 2s ease-out infinite}
#surface-ring2{position:absolute;top:50%;left:50%;width:100px;height:100px;border-radius:50%;border:2px solid rgba(232,87,74,0.3);animation:ring 2s ease-out 0.6s infinite}
@keyframes ring{0%{opacity:1;transform:translate(-50%,-50%) scale(0.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.6)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
#instruction-text{text-align:center}
#instruction-title{font-size:28px;font-weight:800;color:#2a2826;margin-bottom:14px;line-height:1.2}
#instruction-subtitle{font-size:16px;color:#2a2826;max-width:290px;line-height:1.65}
#start-ar-btn{background:#e8574a;color:#fff;border:none;border-radius:14px;padding:16px 0;font-size:16px;font-weight:700;font-family:system-ui,sans-serif;cursor:pointer;width:100%;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(200,80,55,0.35)}
#ar-canvas{display:none;position:fixed;inset:0;width:100%;height:100%;touch-action:none}
#ar-canvas.visible{display:block}
#exit-btn{position:fixed;top:14px;right:14px;z-index:99999;background:rgba(0,0,0,0.55);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer;display:none;font-family:system-ui}
#exit-btn.visible{display:flex;align-items:center;justify-content:center}
#share-btn{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:99999;display:none;background:#e8574a;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:14px;font-weight:700;font-family:system-ui;cursor:pointer}
#share-btn.visible{display:block}
#scan-hint{position:fixed;top:56px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.5);color:#fff;font-size:12px;padding:7px 18px;border-radius:20px;white-space:nowrap;pointer-events:none;display:none}
</style>
</head>
<body>
<div id="splash">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925 275" style="width:110px;height:auto">
<polygon points="300.11 224.54 325.11 224.54 325.11 174.54 450.11 174.54 450.11 224.54 475.11 224.54 475.11 149.54 300.11 149.54 300.11 224.54" fill="#2a2826"/>
<path d="M700.11,49.54v75h175V49.54h-175ZM850.11,99.54h-125v-25h125v25Z" fill="#2a2826"/>
<polygon points="700.11 224.54 725.11 224.54 725.11 174.54 850.11 174.54 850.11 224.54 875.11 224.54 875.11 149.54 700.11 149.54 700.11 224.54" fill="#2a2826"/>
<path d="M300.11,124.54h175V49.54h-175v75ZM325.11,74.54h125v25h-125v-25Z" fill="#2a2826"/>
<polygon points="500.11 224.54 525.11 224.54 525.11 74.54 650.11 74.54 650.11 99.54 550.11 99.54 550.11 174.54 650.11 174.54 650.11 224.54 675.11 224.54 675.11 149.54 575.11 149.54 575.11 124.54 675.11 124.54 675.11 49.54 500.11 49.54 500.11 224.54" fill="#2a2826"/>
<path d="M49.26,224.52h175V49.52H49.26v175ZM74.26,74.52h125v125h-125v-125Z" fill="#2a2826"/>
<path d="M99.26,174.52h75v-75h-75v75ZM124.26,124.52h25v25h-25v-25Z" fill="#2a2826"/>
</svg>
<div style="font-size:11px;color:#8a8680">Realidad Aumentada de Superficies</div>
<div id="splash-bar-track"><div id="splash-bar"></div></div>
</div>
<div id="instruction">
<div id="instruction-header">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 925 275">
<polygon points="300.11 224.54 325.11 224.54 325.11 174.54 450.11 174.54 450.11 224.54 475.11 224.54 475.11 149.54 300.11 149.54 300.11 224.54" fill="#2a2826"/>
<path d="M700.11,49.54v75h175V49.54h-175ZM850.11,99.54h-125v-25h125v25Z" fill="#2a2826"/>
<polygon points="700.11 224.54 725.11 224.54 725.11 174.54 850.11 174.54 850.11 224.54 875.11 224.54 875.11 149.54 700.11 149.54 700.11 224.54" fill="#2a2826"/>
<path d="M300.11,124.54h175V49.54h-175v75ZM325.11,74.54h125v25h-125v-25Z" fill="#2a2826"/>
<polygon points="500.11 224.54 525.11 224.54 525.11 74.54 650.11 74.54 650.11 99.54 550.11 99.54 550.11 174.54 650.11 174.54 650.11 224.54 675.11 224.54 675.11 149.54 575.11 149.54 575.11 124.54 675.11 124.54 675.11 49.54 500.11 49.54 500.11 224.54" fill="#2a2826"/>
<path d="M49.26,224.52h175V49.52H49.26v175ZM74.26,74.52h125v125h-125v-125Z" fill="#2a2826"/>
<path d="M99.26,174.52h75v-75h-75v75ZM124.26,124.52h25v25h-25v-25Z" fill="#2a2826"/>
</svg>
<span id="instruction-mode">Surface AR</span>
</div>
<div id="instruction-content">
<div id="surface-frame">
<div class="s-corner tl"></div><div class="s-corner tr"></div>
<div class="s-corner bl"></div><div class="s-corner br"></div>
<div id="surface-ring"></div><div id="surface-ring2"></div>
</div>
<div id="instruction-text">
<div id="instruction-title">Apunta a una superficie horizontal</div>
<div id="instruction-subtitle">Mueve la cámara lentamente haciendo movimientos circulares sobre una superficie plana y toca el círculo rojo para colocar el objeto.</div>
</div>
<div style="width:100%;text-align:center">
<button id="start-ar-btn">Iniciar AR</button>
<div style="font-size:14px;color:#e8574a;margin-top:20px;line-height:1.5;font-weight:500">Importante:<br>Debes otorgar permiso<br>de uso de cámara.</div>
</div>
</div>
</div>
<canvas id="ar-canvas"></canvas>
<div id="scan-hint">Mueve la cámara sobre una superficie…</div>
<button id="exit-btn">✕</button>
<button id="share-btn">COMPARTIR</button>
<script type="module">
import * as THREE from 'https://esm.sh/three@0.160.0'
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'

let config = null
setTimeout(() => {
  document.getElementById('splash').style.display = 'none'
  document.getElementById('instruction').classList.add('visible')
  fetch('./config.json').then(r=>r.json()).then(c=>{ config=c }).catch(()=>{})
}, 3200)

const canvas = document.getElementById('ar-canvas')
const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:false })
renderer.setPixelRatio(Math.min(devicePixelRatio,2))
renderer.setSize(innerWidth, innerHeight)
renderer.xr.enabled = true
renderer.shadowMap.enabled = true

const scene  = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.01, 20)
scene.add(new THREE.AmbientLight(0xffffff,0.8))
const dl = new THREE.DirectionalLight(0xffffff,0.7)
dl.position.set(3,5,3); dl.castShadow=true; scene.add(dl)

const ringGeo = new THREE.RingGeometry(0.05,0.09,32)
ringGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI/2))
const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:0xe8574a,opacity:0.85,transparent:true,side:THREE.DoubleSide}))
ring.visible=false; scene.add(ring)

const objectGroup = new THREE.Group(); objectGroup.visible=false; scene.add(objectGroup)
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.ShadowMaterial({opacity:0.25}))
shadowPlane.rotation.x=-Math.PI/2; shadowPlane.receiveShadow=true; shadowPlane.visible=false; scene.add(shadowPlane)

const clock=new THREE.Clock(), mixers=[], customAnims=[]
let hitTestSource=null, anchored=false, lastHitResult=null
const smoothPos=new THREE.Vector3(), smoothQuat=new THREE.Quaternion(); let firstHit=false

function loadGLBs(cfg) {
  const loader=new GLTFLoader()
  ;(cfg.surface?.objetos||[]).forEach(obj=>{
    if(!obj.archivo) return
    loader.load('./assets/'+obj.archivo, gltf=>{
      const model=gltf.scene
      const baseY=(obj.posY||0)/100
      model.position.set((obj.posX||0)/100,baseY,(obj.posZ||0)/100)
      model.rotation.set((obj.rotX||0)*Math.PI/180,(obj.rotY||0)*Math.PI/180,(obj.rotZ||0)*Math.PI/180)
      const s=obj.escala||1; model.scale.set(s,s,s)
      model.traverse(c=>{ if(c.isMesh){ c.castShadow=c.receiveShadow=obj.sombra!==false }})
      objectGroup.add(model)
      if(gltf.animations?.length){
        const mx=new THREE.AnimationMixer(model)
        mx.timeScale=obj.velocidad||1
        gltf.animations.forEach(clip=>mx.clipAction(clip).play())
        mixers.push(mx)
      }
      if(obj.animacion) customAnims.push({model,animacion:obj.animacion,baseY,baseScale:s,vel:obj.velocidad||1})
    })
  })
}

document.getElementById('start-ar-btn').addEventListener('click', async ()=>{
  const btn=document.getElementById('start-ar-btn')
  btn.disabled=true; btn.textContent='Iniciando…'
  if(config) loadGLBs(config)
  const instr=document.getElementById('instruction')
  instr.style.opacity='0'
  try {
    const session=await navigator.xr.requestSession('immersive-ar',{
      requiredFeatures:['hit-test'],
      optionalFeatures:['dom-overlay','anchors','local-floor'],
      domOverlay:{root:document.body}
    })
    renderer.xr.setReferenceSpaceType('local-floor')
    try{ await renderer.xr.setSession(session) }catch{ renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session) }
    const vs=await session.requestReferenceSpace('viewer')
    hitTestSource=await session.requestHitTestSource({space:vs})
    session.addEventListener('end',()=>{
      hitTestSource=null; anchored=false; firstHit=false
      ring.visible=objectGroup.visible=shadowPlane.visible=false
      canvas.classList.remove('visible')
      document.getElementById('exit-btn').classList.remove('visible')
      document.getElementById('share-btn').classList.remove('visible')
      document.getElementById('instruction').classList.add('visible')
      btn.disabled=false; btn.textContent='Iniciar AR'
    })
    instr.classList.remove('visible')
    canvas.classList.add('visible')
    document.getElementById('scan-hint').style.display='block'
    document.getElementById('exit-btn').classList.add('visible')
    document.getElementById('share-btn').classList.add('visible')
    renderer.setAnimationLoop((_,frame)=>{
      const delta=clock.getDelta(), elapsed=clock.getElapsedTime()
      mixers.forEach(m=>m.update(delta))
      customAnims.forEach(({model,animacion,baseY,baseScale,vel})=>{
        const v=vel||1
        if(animacion==='float') model.position.y=baseY+Math.sin(elapsed*1.5*v)*0.05
        else if(animacion==='spin') model.rotation.y=elapsed*1.2*v
        else if(animacion==='pulse'){ const s=baseScale*(1+Math.sin(elapsed*2*v)*0.08); model.scale.setScalar(s) }
      })
      if(!frame){ renderer.render(scene,camera); return }
      const ref=renderer.xr.getReferenceSpace()
      if(anchored&&lastHitResult===null){ /* anchor mode */ }
      if(hitTestSource&&!anchored){
        const results=frame.getHitTestResults(hitTestSource)
        if(results.length){
          lastHitResult=results[0]
          const pose=lastHitResult.getPose(ref)
          if(pose){
            const p=pose.transform.position,q=pose.transform.orientation
            const nP=new THREE.Vector3(p.x,p.y,p.z),nQ=new THREE.Quaternion(q.x,q.y,q.z,q.w)
            if(!firstHit){ smoothPos.copy(nP); smoothQuat.copy(nQ); firstHit=true }
            else{ smoothPos.lerp(nP,0.18); smoothQuat.slerp(nQ,0.18) }
            ring.position.copy(smoothPos); ring.quaternion.copy(smoothQuat); ring.visible=true
            document.getElementById('scan-hint').style.display='none'
          }
        } else { ring.visible=false; lastHitResult=null }
      }
      renderer.render(scene,camera)
    })
  } catch(err){
    instr.style.opacity='1'; btn.disabled=false; btn.textContent='Iniciar AR'
    alert('No se pudo iniciar AR: '+err.message)
  }
})

canvas.addEventListener('click',async()=>{
  if(anchored||!ring.visible) return
  objectGroup.position.copy(smoothPos); objectGroup.quaternion.copy(smoothQuat)
  objectGroup.visible=true; shadowPlane.position.copy(smoothPos); shadowPlane.visible=true
  anchored=true; ring.visible=false
  document.getElementById('scan-hint').style.display='none'
})

document.getElementById('exit-btn').addEventListener('click',()=> renderer.xr.getSession()?.end())
document.getElementById('share-btn').addEventListener('click',()=>{
  const btn=document.getElementById('share-btn')
  navigator.clipboard.writeText(location.href).then(()=>{
    const t=btn.textContent; btn.textContent='¡Enlace copiado!'
    setTimeout(()=>btn.textContent=t,2000)
  }).catch(()=>{})
})
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth,innerHeight)
})
</script>
</body>
</html>`
}
