const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('balloon', {
  // tank side
  transcribe: (wav) => ipcRenderer.invoke('transcribe', wav),
  launchTask: (info) => ipcRenderer.invoke('launch-task', info),
  onTankEvent: (cb) => ipcRenderer.on('tank-event', (_e, d) => cb(d)),
  reshowCard: (entry) => ipcRenderer.send('reshow-card', entry),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  // sky side
  onSkyEvent: (cb) => ipcRenderer.on('sky-event', (_e, d) => cb(d)),
  tiedKnot: (knot) => ipcRenderer.send('tied-knot', knot),
  reveal: (path) => ipcRenderer.send('reveal', path),
  // shared
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  quit: () => ipcRenderer.send('quit'),
});
