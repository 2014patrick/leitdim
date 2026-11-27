// LeitDim Lizenzen – Brücke zur Oberfläche
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('adm', {
  version: ipcRenderer.sendSync('appVersion'),
  status: call('status'),
  dbLoad: call('db:load'),
  dbSave: call('db:save'),
  keyImport: call('key:import'),
  keyBackup: call('key:exportBackup'),
  create: call('license:create'),
  saveFile: call('license:saveFile'),
  setRevoked: call('license:setRevoked'),
  setToken: call('github:setToken'),
  testGithub: call('github:test'),
  banList: call('github:banList'),
  releases: call('github:releases'),
  publish: call('github:publish'),
  chooseDataDir: call('settings:chooseDataDir'),
  exportCsv: call('export:csv'),
  copy: call('clipboard'),
  open: call('open'),
  confirm: call('confirm'),
  updateGet: call('update:get'),
  onMenu: (cb) => ipcRenderer.on('menu', (e, c) => cb(c)),
  onUpdate: (cb) => ipcRenderer.on('update', (e, s) => cb(s)),
});
