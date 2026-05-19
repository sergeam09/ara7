// Map en memoria: capaId → File object
// Persiste durante la sesión; se limpia al cerrar o cambiar de proyecto
export const layerFiles = new Map()
