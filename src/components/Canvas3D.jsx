import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, TransformControls, Text } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useStore } from '../store/useStore'
import { useRef, useState, useEffect, useLayoutEffect, useCallback, Suspense } from 'react'
import * as THREE from 'three'
import { layerFiles } from '../store/layerFilesMap'

// ─── TriggerMesh ──────────────────────────────────────────────────────────────
function TriggerMesh({ triggerFile, triggerAncho, triggerAlto, triggerUnidad, isActive, onSelect, onDragChange, transformMode }) {
  const [triggerTexture, setTriggerTexture] = useState(null)
  const { setTriggerDims } = useStore()
  const meshRef = useRef(null)
  const tcRef   = useRef(null)

  // Refs para lectura sin stale closure dentro del event listener
  const anchoRef    = useRef(triggerAncho)
  const altoRef     = useRef(triggerAlto)
  const unidadRef   = useRef(triggerUnidad)
  const modeRef     = useRef(transformMode)
  useEffect(() => { anchoRef.current  = triggerAncho  }, [triggerAncho])
  useEffect(() => { altoRef.current   = triggerAlto   }, [triggerAlto])
  useEffect(() => { unidadRef.current = triggerUnidad }, [triggerUnidad])
  useEffect(() => { modeRef.current   = transformMode }, [transformMode])

  useEffect(() => {
    if (!triggerFile) return
    const url = URL.createObjectURL(triggerFile)
    const loader = new THREE.TextureLoader()
    let tex = null
    loader.load(url, (t) => {
      tex = t
      setTriggerTexture(t)
      const aspect = t.image.height / t.image.width
      setTriggerDims(triggerAncho, parseFloat((triggerAncho * aspect).toFixed(1)), triggerUnidad)
      URL.revokeObjectURL(url)
    }, undefined, () => URL.revokeObjectURL(url))
    return () => { tex?.dispose() }
  }, [triggerFile])

  // Listeners del TC del trigger — transformMode en deps porque el TC solo monta
  // cuando transformMode !== 'translate', así el effect re-corre al cambiar de modo.
  useEffect(() => {
    if (!tcRef.current) return
    const tc = tcRef.current

    // 'change' → feedback en tiempo real: aplica escala y actualiza el store cada frame
    const onChange = () => {
      if (!meshRef.current || modeRef.current !== 'scale') return
      const s = meshRef.current.scale.x
      if (Math.abs(s - 1) > 0.001) {
        const newAncho = parseFloat((anchoRef.current * s).toFixed(1))
        const newAlto  = parseFloat((altoRef.current  * s).toFixed(1))
        useStore.getState().setTriggerDims(newAncho, newAlto, unidadRef.current)
        // Bake inmediato: nueva geom = nuevas dims, scale vuelve a 1
        anchoRef.current = newAncho
        altoRef.current  = newAlto
        meshRef.current.scale.setScalar(1)
      }
    }

    // 'dragging-changed' → orbit pause
    const onDrag = (e) => { onDragChange?.(e.value) }

    tc.addEventListener('change', onChange)
    tc.addEventListener('dragging-changed', onDrag)
    return () => {
      tc.removeEventListener('change', onChange)
      tc.removeEventListener('dragging-changed', onDrag)
    }
  }, [onDragChange, isActive, transformMode])

  // Resetear scale del mesh cuando triggerAncho/Alto cambian desde los campos numéricos
  useEffect(() => {
    if (meshRef.current) meshRef.current.scale.setScalar(1)
  }, [triggerAncho, triggerAlto])

  if (!triggerTexture) return null

  const scaleFactor = triggerUnidad === 'm' ? 0.01 : 1
  const w = (triggerAncho * scaleFactor) / 100
  const h = (triggerAlto  * scaleFactor) / 100

  return (
    <>
      <mesh
        ref={meshRef}
        position={[0, 0, -0.001]}
        onClick={(e) => { e.stopPropagation(); onSelect?.() }}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          map={triggerTexture}
          opacity={isActive ? 0.85 : 0.6}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* El trigger NO se mueve: TC solo aparece en rotate y scale */}
      {isActive && transformMode !== 'translate' && (
        <TransformControls
          ref={tcRef}
          object={meshRef}
          mode={transformMode}
          size={1.2}
        />
      )}
    </>
  )
}

// ─── LayerMesh ────────────────────────────────────────────────────────────────
function LayerMesh({ capa, isActive, transformMode, onDragChange }) {
  const meshRef = useRef(null)
  const tcRef   = useRef(null)
  const { updateCapaBatch, selectCapa } = useStore()
  const [texture,   setTexture]   = useState(null)
  const [gltfScene, setGltfScene] = useState(null)

  // ── Cargar archivo ──────────────────────────────────────────────────────────
  useEffect(() => {
    const file = layerFiles.get(capa.id)
    if (!file) return
    const tipo = capa.tipo

    if (tipo === 'image' || tipo === 'gif' || tipo === 'svg') {
      const url = URL.createObjectURL(file)
      const loader = new THREE.TextureLoader()
      let tex = null
      loader.load(url, (t) => {
        tex = t; setTexture(t)
        const aspect = t.image.height / t.image.width
        updateCapaBatch(capa.id, { altoReal: parseFloat((capa.anchoReal * aspect).toFixed(1)) })
        URL.revokeObjectURL(url)
      }, undefined, () => URL.revokeObjectURL(url))
      return () => { tex?.dispose() }
    }

    if (tipo === 'video' || tipo === 'webm') {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.src = url; video.loop = true; video.muted = true; video.playsInline = true
      const tex = new THREE.VideoTexture(video)
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight)
          updateCapaBatch(capa.id, { altoReal: parseFloat((capa.anchoReal * (video.videoHeight / video.videoWidth)).toFixed(1)) })
        video.play().catch(() => {})
      })
      setTexture(tex)
      return () => { video.pause(); video.src = ''; URL.revokeObjectURL(url); tex.dispose() }
    }

    if (tipo === 'glb') {
      const url = URL.createObjectURL(file)
      const loader = new GLTFLoader()
      loader.load(url, (gltf) => {
        const scene = gltf.scene
        const box = new THREE.Box3().setFromObject(scene)
        scene.position.sub(box.getCenter(new THREE.Vector3()))
        setGltfScene(scene); URL.revokeObjectURL(url)
      }, undefined, () => URL.revokeObjectURL(url))
      return () => setGltfScene(null)
    }
  }, [capa.id, capa.archivo])

  // ── Al activar: fijar transform desde el store UNA SOLA VEZ (antes del primer paint) ──
  // initializedRef evita que re-renders intermedios (por updateCapaBatch durante drag)
  // vuelvan a ejecutar el layout effect y reseteen el transform que TC ya controla.
  const initializedRef = useRef(false)
  const isDraggingRef  = useRef(false)

  useLayoutEffect(() => {
    if (!isActive) { initializedRef.current = false; return }
    if (initializedRef.current || !meshRef.current) return
    initializedRef.current = true
    meshRef.current.position.set(capa.posX / 100, capa.posY / 100, capa.posZ / 100)
    meshRef.current.rotation.set(
      (capa.rotX * Math.PI) / 180,
      (capa.rotY * Math.PI) / 180,
      (capa.rotZ * Math.PI) / 180
    )
    meshRef.current.scale.setScalar(capa.escala || 1)
  }, [isActive])

  // ── Sync desde sliders del panel → mesh en tiempo real ────────────────────
  useEffect(() => {
    if (!meshRef.current || isDraggingRef.current || !isActive) return
    meshRef.current.position.set(capa.posX / 100, capa.posY / 100, capa.posZ / 100)
    meshRef.current.rotation.set(
      (capa.rotX * Math.PI) / 180,
      (capa.rotY * Math.PI) / 180,
      (capa.rotZ * Math.PI) / 180
    )
    meshRef.current.scale.setScalar(capa.escala || 1)
  }, [isActive, capa.posX, capa.posY, capa.posZ,
      capa.rotX, capa.rotY, capa.rotZ, capa.escala])

  // ── Ref para transformMode sin stale closure ───────────────────────────────
  const transformModeRef = useRef(transformMode)
  useEffect(() => { transformModeRef.current = transformMode }, [transformMode])

  // ── Listeners del TC: 'change' (feedback en tiempo real) + 'dragging-changed' ──
  // Se adjuntan directamente al objeto Three.js para evitar cualquier problema
  // con la prop onChange de drei cuando el TC remonta al cambiar de modo.
  useEffect(() => {
    if (!tcRef.current) return
    const tc = tcRef.current

    // 'change' → sincronizar posición/rotación/escala al store en tiempo real
    const onChange = () => {
      if (!meshRef.current) return
      const p = meshRef.current.position
      const r = meshRef.current.rotation
      const updates = {
        posX: parseFloat((p.x * 100).toFixed(1)),
        posY: parseFloat((p.y * 100).toFixed(1)),
        posZ: parseFloat((p.z * 100).toFixed(1)),
        rotX: parseFloat(((r.x * 180) / Math.PI).toFixed(1)),
        rotY: parseFloat(((r.y * 180) / Math.PI).toFixed(1)),
        rotZ: parseFloat(((r.z * 180) / Math.PI).toFixed(1)),
      }
      if (transformModeRef.current === 'scale')
        updates.escala = parseFloat(meshRef.current.scale.x.toFixed(3))
      useStore.getState().updateCapaBatch(capa.id, updates)
    }

    // 'dragging-changed' → orbit pause + bake escala al soltar
    const onDrag = (e) => {
      isDraggingRef.current = e.value
      onDragChange?.(e.value)
      if (!e.value && transformModeRef.current === 'scale' && meshRef.current) {
        const s = meshRef.current.scale.x
        if (Math.abs(s - 1) > 0.001) {
          const { capas, updateCapaBatch: upd } = useStore.getState()
          const cur = capas.find(c => c.id === capa.id)
          if (cur) {
            upd(capa.id, {
              anchoReal: parseFloat((cur.anchoReal * s).toFixed(1)),
              altoReal:  parseFloat((cur.altoReal  * s).toFixed(1)),
              escala: 1,
            })
            meshRef.current.scale.setScalar(1)
          }
        }
      }
    }

    tc.addEventListener('change', onChange)
    tc.addEventListener('dragging-changed', onDrag)
    return () => {
      tc.removeEventListener('change', onChange)
      tc.removeEventListener('dragging-changed', onDrag)
    }
  // isActive y transformMode aseguran que el effect corre cuando el TC monta/desmonta
  }, [onDragChange, isActive, transformMode])

  // ── Click para seleccionar la capa ─────────────────────────────────────────
  const handleClick = useCallback((e) => {
    e.stopPropagation()
    selectCapa(capa.id)
  }, [capa.id, selectCapa])

  const w = capa.anchoReal / 100
  const h = capa.altoReal  / 100

  const ctrlPos = [capa.posX / 100, capa.posY / 100, capa.posZ / 100]
  const ctrlRot = [(capa.rotX * Math.PI) / 180, (capa.rotY * Math.PI) / 180, (capa.rotZ * Math.PI) / 180]
  const ctrlSc  = capa.escala || 1

  // ── Renderizar mesh ──────────────────────────────────────────────────────────
  let meshEl
  if (capa.tipo === 'texto') {
    const textContent = (
      <Text fontSize={Math.max(h * 0.4, 0.02)} color="#2a2826" anchorX="center" anchorY="middle" maxWidth={w * 2} textAlign="center" fillOpacity={capa.opacidad}>
        {capa.contenido || 'Texto'}
      </Text>
    )
    meshEl = isActive
      ? <group ref={meshRef} onClick={handleClick}>{textContent}</group>
      : <group ref={meshRef} position={ctrlPos} rotation={ctrlRot} scale={ctrlSc} onClick={handleClick}>{textContent}</group>

  } else if (capa.tipo === 'glb') {
    const inner = gltfScene
      ? <primitive object={gltfScene} />
      : <mesh><boxGeometry args={[w, h, 0.05]} /><meshStandardMaterial color="#b8b4ae" wireframe /></mesh>
    meshEl = isActive
      ? <group ref={meshRef} onClick={handleClick}>{inner}</group>
      : <group ref={meshRef} position={ctrlPos} rotation={ctrlRot} scale={ctrlSc} onClick={handleClick}>{inner}</group>

  } else {
    const mat = <meshStandardMaterial map={texture || null} color={texture ? '#ffffff' : '#b8b4ae'} opacity={capa.opacidad} transparent side={THREE.DoubleSide} />
    meshEl = isActive
      ? <mesh ref={meshRef} onClick={handleClick}><planeGeometry args={[w, h]} />{mat}</mesh>
      : <mesh ref={meshRef} position={ctrlPos} rotation={ctrlRot} scale={ctrlSc} onClick={handleClick}><planeGeometry args={[w, h]} />{mat}</mesh>
  }

  return (
    <>
      {meshEl}
      {isActive && transformMode && (
        <TransformControls
          ref={tcRef}
          object={meshRef}
          mode={transformMode}
          size={1.2}
        />
      )}
    </>
  )
}

// ─── Scene (image mode) ───────────────────────────────────────────────────────
function Scene({ transformMode }) {
  const { capas, capaActiva, selectCapa, triggerFile, triggerAncho, triggerAlto, triggerUnidad } = useStore()
  const [dragging,      setDragging]      = useState(false)
  const [triggerActivo, setTriggerActivo] = useState(false)

  // Seleccionar trigger → deseleccionar capa activa
  const handleSelectTrigger = useCallback(() => {
    selectCapa(null)
    setTriggerActivo(true)
  }, [selectCapa])

  // Click en fondo vacío → deseleccionar todo
  const handleBackgroundClick = useCallback(() => {
    selectCapa(null)
    setTriggerActivo(false)
  }, [selectCapa])

  // Si el usuario selecciona una capa desde el panel, deseleccionar trigger
  useEffect(() => {
    if (capaActiva !== null) setTriggerActivo(false)
  }, [capaActiva])

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 2]} intensity={0.8} />
      <Grid args={[10, 10]} cellSize={0.1} sectionSize={1} cellColor="#b8b4ae" sectionColor="#9a9690" fadeDistance={8} />

      {/* Orbit: siempre activo, se pausa solo mientras se arrastra un gizmo */}
      <OrbitControls makeDefault enabled={!dragging} />

      <TriggerMesh
        triggerFile={triggerFile}
        triggerAncho={triggerAncho}
        triggerAlto={triggerAlto}
        triggerUnidad={triggerUnidad}
        isActive={triggerActivo}
        onSelect={handleSelectTrigger}
        onDragChange={setDragging}
        transformMode={transformMode}
      />

      {capas.map((capa) => (
        <LayerMesh
          key={capa.id}
          capa={capa}
          isActive={capaActiva === capa.id}
          transformMode={transformMode}
          onDragChange={setDragging}
        />
      ))}
    </>
  )
}

// ─── SurfaceGLBModel ──────────────────────────────────────────────────────────
function SurfaceGLBModel({ objeto, isActive, onSelect, onDragChange, transformMode }) {
  const groupRef  = useRef(null)
  const tcRef     = useRef(null)
  const mixerRef  = useRef(null)
  const [gltfScene, setGltfScene] = useState(null)
  const [loaded, setLoaded]       = useState(false)

  const transformModeRef = useRef(transformMode)
  useEffect(() => { transformModeRef.current = transformMode }, [transformMode])

  // Actualizar AnimationMixer cada frame con velocidad del objeto
  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.timeScale = objeto.velocidad !== undefined ? objeto.velocidad : 1
      mixerRef.current.update(delta)
    }
  })

  // ── Load GLB from local file ────────────────────────────────────────────────
  useEffect(() => {
    const file = layerFiles.get(objeto.id)
    if (!file) return
    const url = URL.createObjectURL(file)
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      const scene = gltf.scene
      // Centrar el modelo dentro de sí mismo
      const box = new THREE.Box3().setFromObject(scene)
      scene.position.sub(box.getCenter(new THREE.Vector3()))

      // Animaciones propias del GLB
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(scene)
        gltf.animations.forEach(clip => mixer.clipAction(clip).play())
        mixerRef.current = mixer
      }

      setGltfScene(scene)
      setLoaded(true)
      URL.revokeObjectURL(url)
    }, undefined, (err) => {
      console.error('[SurfaceGLBModel] GLB load error:', err)
      URL.revokeObjectURL(url)
    })
    return () => {
      setGltfScene(null)
      setLoaded(false)
    }
  }, [objeto.id, objeto.archivo])

  // ── Sync group transform from store when first activated ───────────────────
  const initializedRef = useRef(false)
  useLayoutEffect(() => {
    if (!isActive) { initializedRef.current = false; return }
    if (initializedRef.current || !groupRef.current) return
    initializedRef.current = true
    groupRef.current.position.set(objeto.posX / 100, objeto.posY / 100, objeto.posZ / 100)
    groupRef.current.rotation.set(
      (objeto.rotX * Math.PI) / 180,
      (objeto.rotY * Math.PI) / 180,
      (objeto.rotZ * Math.PI) / 180
    )
    groupRef.current.scale.setScalar(objeto.escala || 1)
  }, [isActive])

  // ── Sync desde campos numéricos del panel (activo O inactivo) ─────────────
  // Permite que cambiar un número en PanelRight actualice el canvas en tiempo real
  const isDraggingRef = useRef(false)
  useEffect(() => {
    if (!groupRef.current || isDraggingRef.current) return
    if (isActive) {
      // Activo: actualizar directamente el objeto Three.js (TC lo tomará desde aquí)
      groupRef.current.position.set(objeto.posX / 100, objeto.posY / 100, objeto.posZ / 100)
      groupRef.current.rotation.set(
        (objeto.rotX * Math.PI) / 180,
        (objeto.rotY * Math.PI) / 180,
        (objeto.rotZ * Math.PI) / 180
      )
      groupRef.current.scale.setScalar(objeto.escala || 1)
    }
    // Inactivo: R3F lo maneja via props (ctrlPos/ctrlRot/ctrlSc), no hace falta nada
  }, [isActive, objeto.posX, objeto.posY, objeto.posZ,
      objeto.rotX, objeto.rotY, objeto.rotZ, objeto.escala])

  // ── TC event listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tcRef.current) return
    const tc = tcRef.current

    const onChange = () => {
      if (!groupRef.current) return
      const p = groupRef.current.position
      const r = groupRef.current.rotation
      // NOTE: escala is NOT updated here during drag — only committed on drag-end (onDrag)
      // Updating escala live would corrupt the accumulation logic in onDrag
      useStore.getState().updateObjeto(objeto.id, 'posX', parseFloat((p.x * 100).toFixed(1)))
      useStore.getState().updateObjeto(objeto.id, 'posY', parseFloat((p.y * 100).toFixed(1)))
      useStore.getState().updateObjeto(objeto.id, 'posZ', parseFloat((p.z * 100).toFixed(1)))
      useStore.getState().updateObjeto(objeto.id, 'rotX', parseFloat(((r.x * 180) / Math.PI).toFixed(1)))
      useStore.getState().updateObjeto(objeto.id, 'rotY', parseFloat(((r.y * 180) / Math.PI).toFixed(1)))
      useStore.getState().updateObjeto(objeto.id, 'rotZ', parseFloat(((r.z * 180) / Math.PI).toFixed(1)))
    }

    const onDrag = (e) => {
      isDraggingRef.current = e.value
      onDragChange?.(e.value)
      if (!e.value && transformModeRef.current === 'scale' && groupRef.current) {
        // s = absolute scale the group is at right now (TC applies on top of existing scale)
        const s = groupRef.current.scale.x
        const { objetos } = useStore.getState()
        const cur = objetos.find(o => o.id === objeto.id)
        if (cur) {
          // cur.escala = scale stored BEFORE this drag (onChange does NOT touch it)
          // s = absolute new scale; ratio = relative change for updating real dimensions
          const prevEscala = cur.escala || 1
          const newEscala  = parseFloat(s.toFixed(3))       // absolute — no accumulation
          const ratio      = s / prevEscala                 // relative change this drag
          useStore.getState().updateObjeto(objeto.id, 'escala',    newEscala)
          useStore.getState().updateObjeto(objeto.id, 'anchoReal', parseFloat((cur.anchoReal * ratio).toFixed(1)))
          useStore.getState().updateObjeto(objeto.id, 'altoReal',  parseFloat((cur.altoReal  * ratio).toFixed(1)))
          useStore.getState().updateObjeto(objeto.id, 'profReal',  parseFloat((cur.profReal  * ratio).toFixed(1)))
          // Keep group at the new absolute scale — no reset to 1, no visual jump
          groupRef.current.scale.setScalar(newEscala)
        }
      }
    }

    tc.addEventListener('change', onChange)
    tc.addEventListener('dragging-changed', onDrag)
    return () => {
      tc.removeEventListener('change', onChange)
      tc.removeEventListener('dragging-changed', onDrag)
    }
  }, [onDragChange, isActive, transformMode])

  const ctrlPos = [objeto.posX / 100, objeto.posY / 100, objeto.posZ / 100]
  const ctrlRot = [(objeto.rotX * Math.PI) / 180, (objeto.rotY * Math.PI) / 180, (objeto.rotZ * Math.PI) / 180]
  const ctrlSc  = objeto.escala || 1

  const inner = gltfScene
    ? <primitive object={gltfScene} />
    : (
      <mesh>
        <boxGeometry args={[(objeto.anchoReal || 80) / 100, (objeto.altoReal || 120) / 100, (objeto.profReal || 40) / 100]} />
        <meshStandardMaterial color="#b8b4ae" wireframe />
      </mesh>
    )

  const groupEl = isActive
    ? <group ref={groupRef} onClick={(e) => { e.stopPropagation(); onSelect() }}>{inner}</group>
    : <group ref={groupRef} position={ctrlPos} rotation={ctrlRot} scale={ctrlSc} onClick={(e) => { e.stopPropagation(); onSelect() }}>{inner}</group>

  return (
    <>
      {groupEl}
      {isActive && transformMode && (
        <TransformControls
          ref={tcRef}
          object={groupRef}
          mode={transformMode}
          size={1.2}
        />
      )}
    </>
  )
}

// ─── SurfaceScene ─────────────────────────────────────────────────────────────
function SurfaceScene({ transformMode }) {
  const { objetos, objetoActivo, selectObjeto } = useStore()
  const [dragging, setDragging] = useState(false)

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 3]} intensity={0.7} castShadow />
      <OrbitControls makeDefault enabled={!dragging} />
      <Grid args={[20, 20]} cellSize={0.2} sectionSize={1} sectionColor="#bebab2" cellColor="#d0ccc8" infiniteGrid />
      {objetos.map(obj => (
        <SurfaceGLBModel
          key={obj.id}
          objeto={obj}
          isActive={objetoActivo === obj.id}
          onSelect={() => selectObjeto(obj.id)}
          onDragChange={setDragging}
          transformMode={transformMode}
        />
      ))}
    </>
  )
}

// ─── Canvas3D ─────────────────────────────────────────────────────────────────
export default function Canvas3D() {
  const [transformMode, setTransformMode] = useState('translate')
  const { modo } = useStore()

  useEffect(() => {
    if (typeof document === 'undefined' || document.querySelector('style[data-blink]')) return
    const s = document.createElement('style')
    s.setAttribute('data-blink', 'true')
    s.innerHTML = `@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`
    document.head.appendChild(s)
  }, [])

  return (
    <div style={{ flex:1, borderRadius:'16px', overflow:'hidden', boxShadow:'var(--sh-card)', background:'var(--bg)', position:'relative', display:'flex', flexDirection:'column' }}>

      {/* Barra superior */}
      <div style={{ height:'40px', background:'var(--bg)', display:'flex', alignItems:'center', padding:'0 14px', gap:'7px', flexShrink:0, borderBottom:'1px solid rgba(190,186,178,0.15)' }}>
        {[['#c0553a'],['#c8a840'],['#6a9a50']].map(([color], i) => (
          <div key={i} style={{ width:'9px', height:'9px', borderRadius:'50%', background:color, boxShadow:'var(--sh-out)', flexShrink:0 }} />
        ))}
        <span style={{ fontSize:'10px', color:'var(--t3)' }}>Canvas 3D</span>
        <div style={{ flex:1 }} />

        {/* Vista / Mover / Rotar / Escalar — click en activo lo desactiva (regresa a órbita libre) */}
        <div style={{ display:'flex', gap:'5px' }}>
          {[['translate','Mover'],['rotate','Rotar'],['scale','Escalar']].map(([mode, label]) => (
            <button key={mode}
              onClick={() => setTransformMode(cur => cur === mode ? null : mode)}
              title={transformMode === mode ? 'Click para desactivar y volver a órbita libre' : label}
              style={{
              padding:'3px 8px', borderRadius:'6px', border:'none',
              background: transformMode === mode ? 'var(--accent)' : 'rgba(190,186,178,0.2)',
              color: transformMode === mode ? '#fff' : 'var(--t2)',
              fontSize:'9px', fontWeight:'600', cursor:'pointer', textTransform:'uppercase', boxShadow:'var(--sh-out)',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ display:'flex', gap:'5px', fontSize:'10px', color:'var(--accent)', padding:'3px 10px', borderRadius:'20px', boxShadow:'var(--sh-press)', background:'var(--bg)', alignItems:'center' }}>
          <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:'var(--accent)', animation:'blink 1.5s ease-in-out infinite' }} />
          En vivo
        </div>
      </div>

      {/* Canvas R3F */}
      <div style={{ flex:1, background:'#d8d4ce', position:'relative' }}>
        <Canvas
          camera={{ position:[0, 0.5, 1.5], fov:50 }}
          gl={{ alpha:true }}
          style={{ width:'100%', height:'100%', position:'absolute' }}
        >
          <Suspense fallback={null}>
            {modo === 'surface'
              ? <SurfaceScene transformMode={transformMode} />
              : <Scene transformMode={transformMode} />
            }
          </Suspense>
        </Canvas>
      </div>

      {/* Ejes XYZ */}
      <div style={{ position:'absolute', bottom:'14px', left:'14px', display:'flex', gap:'7px', zIndex:2 }}>
        {[['X','#c0553a'],['Y','#6a9a50'],['Z','#4a72b0']].map(([label, color]) => (
          <span key={label} style={{ fontSize:'10px', fontWeight:'700', padding:'4px 9px', borderRadius:'6px', background:'var(--bg)', boxShadow:'var(--sh-out)', color }}>{label}</span>
        ))}
      </div>

      {/* Hint */}
      <div style={{ position:'absolute', bottom:'14px', right:'14px', fontSize:'9px', color:'var(--t3)', zIndex:2, pointerEvents:'none' }}>
        {transformMode ? 'Click activo → desactiva gizmo · Orbita libre' : 'Órbita libre · Selecciona Mover/Rotar/Escalar para transformar'}
      </div>
    </div>
  )
}
