const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  applyProxy: (cfg) => ipcRenderer.invoke('proxy:apply', cfg),
  testProxy: (cfg) => ipcRenderer.invoke('proxy:test', cfg),
  publicIp: () => ipcRenderer.invoke('ip:public'),
  onOpenTab: (cb) => ipcRenderer.on('open-tab', (_e, url) => cb(url)),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, key) => cb(key))
});
