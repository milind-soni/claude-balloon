const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('balloon', {
  transcribe: (wav) => ipcRenderer.invoke('transcribe', wav),
  runTask: (id, prompt, cwd) => ipcRenderer.send('run-task', { id, prompt, cwd }),
  onTaskEvent: (cb) => ipcRenderer.on('task-event', (_e, data) => cb(data)),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  setInteractive: (on) => ipcRenderer.send('set-interactive', on),
  reveal: (path) => ipcRenderer.send('reveal', path),
  quit: () => ipcRenderer.send('quit'),
});
