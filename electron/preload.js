const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // Configuración
  settings: {
    get: ()         => ipcRenderer.invoke('settings:get'),
    set: (data)     => ipcRenderer.invoke('settings:set', data),
  },

  // Proyectos
  projects: {
    list:       ()           => ipcRenderer.invoke('projects:list'),
    save:       (data)       => ipcRenderer.invoke('projects:save', data),
    load:       (id)         => ipcRenderer.invoke('projects:load', id),
    delete:     (id)         => ipcRenderer.invoke('projects:delete', id),
    openFolder: (id)         => ipcRenderer.invoke('projects:openFolder', id),
  },

  // Selector de archivos
  files: {
    pick: (opts) => ipcRenderer.invoke('files:pick', opts),
  },

  // GitHub publish
  github: {
    publish: (data) => ipcRenderer.invoke('github:publish', data),
  },

  // Progreso de publicación (push desde main)
  onPublishProgress: (cb) => {
    const handler = (_, msg) => cb(msg)
    ipcRenderer.on('publish:progress', handler)
    return () => ipcRenderer.removeListener('publish:progress', handler)
  },
})
