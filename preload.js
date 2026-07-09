const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('balloon', {
  // tank side
  transcribe: (wav) => ipcRenderer.invoke('transcribe', wav),
  launchTask: (info) => ipcRenderer.invoke('launch-task', info),
  onTankEvent: (cb) => ipcRenderer.on('tank-event', (_e, d) => cb(d)),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  moveTank: (x, y) => ipcRenderer.send('move-tank', { x, y }),
  anchor: (sx, sy) => ipcRenderer.send('anchor', { sx, sy }),
  reveal: (path) => ipcRenderer.send('reveal', path),
  // sky side
  onSkyEvent: (cb) => ipcRenderer.on('sky-event', (_e, d) => cb(d)),
  // shared
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  quit: () => ipcRenderer.send('quit'),
});
