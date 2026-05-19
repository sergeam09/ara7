import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── Vista activa ────────────────────────────────────────────────────────────
  vista: 'projects',   // 'projects' | 'editor' | 'settings'

  // ── Proyecto activo ─────────────────────────────────────────────────────────
  proyectoId:  null,
  nombre:      '',
  modo:        'image',

  // ── Layers (image mode) ─────────────────────────────────────────────────────
  capas:      [],
  capaActiva: null,

  // ── Objetos (surface mode) ─────────────────────────────────────────────────
  objetos:      [],
  objetoActivo: null,

  // ── Trigger (image mode) ───────────────────────────────────────────────────
  triggerFile:   null,
  triggerMind:   null,
  triggerAncho:  60,
  triggerAlto:   40,
  triggerUnidad: 'cm',

  // ── Publicación ────────────────────────────────────────────────────────────
  proyectoUrl: null,
  publicado:   false,
  publishing:  false,
  publishLog:  '',

  // ── Acciones de vista ───────────────────────────────────────────────────────
  setVista: (vista) => set({ vista }),

  // ── Proyecto ────────────────────────────────────────────────────────────────
  setNombre:    (nombre)    => set({ nombre }),
  setModo:      (modo)      => set({ modo }),
  setProyectoId:(id)        => set({ proyectoId: id }),

  nuevoProyecto: () => set({
    proyectoId:    null,
    nombre:        'Nuevo proyecto',
    modo:          'image',
    capas:         [],
    objetos:       [],
    capaActiva:    null,
    objetoActivo:  null,
    triggerFile:   null,
    triggerMind:   null,
    triggerAncho:  60,
    triggerAlto:   40,
    triggerUnidad: 'cm',
    proyectoUrl:   null,
    publicado:     false,
    publishLog:    '',
  }),

  // ── Trigger ─────────────────────────────────────────────────────────────────
  setTriggerFile:  (file) => set({ triggerFile: file }),
  setTriggerMind:  (file) => set({ triggerMind: file }),
  setTriggerDims:  (ancho, alto, unidad) => set({ triggerAncho: ancho, triggerAlto: alto, triggerUnidad: unidad }),

  // ── Capas ───────────────────────────────────────────────────────────────────
  addCapa: (tipo) => set((state) => ({
    capas: [...state.capas, {
      id: Date.now(), tipo: typeof tipo === 'string' ? tipo : tipo.tipo,
      archivo: '', anchoReal: 60, altoReal: 40, unidad: 'cm',
      posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0,
      escala: 1, opacidad: 1, animacion: '', delay: 0, loop: true,
      ...(typeof tipo === 'object' ? tipo : {}),
    }],
  })),

  removeCapa: (id) => set((state) => ({
    capas: state.capas.filter((c) => c.id !== id),
    capaActiva: state.capaActiva === id ? null : state.capaActiva,
  })),

  selectCapa:      (id) => set({ capaActiva: id }),
  updateCapa:      (id, campo, valor) => set((state) => ({
    capas: state.capas.map((c) => c.id === id ? { ...c, [campo]: valor } : c),
  })),
  updateCapaBatch: (id, updates) => set((state) => ({
    capas: state.capas.map((c) => c.id === id ? { ...c, ...updates } : c),
  })),

  addLayerFile: (capaId, file) => {
    const { layerFiles } = get()
    const m = new Map(layerFiles)
    m.set(capaId, file)
    set({ layerFiles: m })
  },
  layerFiles: new Map(),

  // ── Objetos ─────────────────────────────────────────────────────────────────
  addObjeto: (tipo) => set((state) => ({
    objetos: [...state.objetos, {
      id: Date.now(), tipo, archivo: '',
      anchoReal: 80, altoReal: 120, profReal: 40, unidad: 'cm',
      posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0,
      escala: 1, opacidad: 1, animacion: '', velocidad: 1, sombra: true, archivoUsdz: '',
    }],
  })),

  removeObjeto:  (id) => set((state) => ({
    objetos: state.objetos.filter((o) => o.id !== id),
    objetoActivo: state.objetoActivo === id ? null : state.objetoActivo,
  })),

  selectObjeto: (id) => set({ objetoActivo: id }),
  updateObjeto: (id, campo, valor) => set((state) => ({
    objetos: state.objetos.map((o) => o.id === id ? { ...o, [campo]: valor } : o),
  })),

  // ── Publicación ─────────────────────────────────────────────────────────────
  setProyectoUrl: (url)  => set({ proyectoUrl: url }),
  setPublicado:   (bool) => set({ publicado: bool }),
  setPublishing:  (bool) => set({ publishing: bool }),
  setPublishLog:  (msg)  => set({ publishLog: msg }),
}))
