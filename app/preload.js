// LeitDim – sichere Brücke zwischen Oberfläche und Hauptprozess
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ldNative', {
  version: ipcRenderer.sendSync('appVersion'),
  smoke: ipcRenderer.sendSync('isSmoke'),
  saveProject: (o) => ipcRenderer.invoke('saveProject', o),
  openProject: () => ipcRenderer.invoke('openProject'),
  saveText: (o) => ipcRenderer.invoke('saveText', o),
  printPDF: (o) => ipcRenderer.invoke('printPDF', o),
  confirm: (msg) => ipcRenderer.invoke('confirm', msg),
  getStartupFile: () => ipcRenderer.invoke('startupFile'),
  setDirty: (v) => ipcRenderer.send('setDirty', v),
  setTitle: (t) => ipcRenderer.send('setTitle', t),
  closeNow: () => ipcRenderer.send('closeNow'),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch (e) { return null; } },
  onMenu: (cb) => ipcRenderer.on('menu', (e, cmd) => cb(cmd)),
  onBusy: (cb) => ipcRenderer.on('busy', (e, b) => cb(b)),
  license: {
    get: () => ipcRenderer.invoke('license:get'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    remove: () => ipcRenderer.invoke('license:remove'),
    openFile: () => ipcRenderer.invoke('license:openFile'),
    onChange: (cb) => ipcRenderer.on('license', (e, s) => cb(s)),
  },
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    onChange: (cb) => ipcRenderer.on('update', (e, s) => cb(s)),
  },
});
