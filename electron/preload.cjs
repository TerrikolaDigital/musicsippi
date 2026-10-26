/**
 * Único puente IPC del proyecto — expone SOLO lo mínimo que el renderer
 * necesita y no puede obtener de otra forma con contextIsolation:true.
 *
 * `File.path` (la propiedad no estándar que Electron agregaba al objeto
 * File del navegador) fue removida en Electron 32 — superada por
 * `webUtils.getPathForFile()` (ver node_modules/electron/electron.d.ts,
 * WebUtils). Sin este preload, `CargarMusicaLocal` (src/App.jsx) no tiene
 * forma de resolver la ruta absoluta de un archivo elegido con
 * `<input type="file" webkitdirectory>` — la app corría con
 * nodeIntegration:false y contextIsolation:true, pero SIN preload alguno,
 * así que la importación de música local nunca funcionó en esta versión de
 * Electron (probado: node_modules/electron/electron.d.ts confirma que la
 * augmentación de `path` "fue superada" por este método, no coexisten).
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Comandos que el reproductor miniatura le puede mandar a la ventana
 * principal. Lista cerrada a propósito: el puente reenvía lo que reciba, y
 * sin este filtro cualquier string viajaría tal cual hasta App.jsx. Son los
 * tres del transporte, nada más.
 */
const COMANDOS = new Set(['play-pausa', 'anterior', 'siguiente']);

contextBridge.exposeInMainWorld('musicsippi', {
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // --- Reproductor miniatura ---
  // Las dos ventanas comparten este preload y cada una usa su mitad: la
  // principal publica qué suena y escucha comandos; la miniatura escucha el
  // estado y manda comandos. Ninguna sabe de la otra, el proceso principal
  // hace de intermediario (ver electron/main.cjs).

  /** Ventana principal: avisa qué está sonando. */
  publicarEstado: (estado) => ipcRenderer.send('mini:estado', estado),
  /** Miniatura: se entera de qué está sonando. */
  alRecibirEstado: (cb) => {
    const manejador = (_evento, estado) => cb(estado);
    ipcRenderer.on('mini:estado', manejador);
    return () => ipcRenderer.off('mini:estado', manejador);
  },
  /** Miniatura: pide play/pausa, anterior o siguiente. */
  enviarComando: (comando) => {
    if (COMANDOS.has(comando)) ipcRenderer.send('mini:comando', comando);
  },
  /** Ventana principal: recibe esos pedidos. */
  alRecibirComando: (cb) => {
    const manejador = (_evento, comando) => {
      if (COMANDOS.has(comando)) cb(comando);
    };
    ipcRenderer.on('mini:comando', manejador);
    return () => ipcRenderer.off('mini:comando', manejador);
  },
  /** Miniatura: devuelve el foco a la ventana grande. */
  restaurarVentana: () => ipcRenderer.send('mini:restaurar'),
});
