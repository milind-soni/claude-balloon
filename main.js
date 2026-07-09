const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------- whisper (local, offline) ----------
const WHISPER_BIN_CANDIDATES = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
const WHISPER_MODEL = path.join(os.homedir(), '.cache', 'whisper', 'ggml-base.en.bin');
function whisperBin() {
  return WHISPER_BIN_CANDIDATES.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;
}

ipcMain.handle('transcribe', async (_e, wavArrayBuffer) => {
  const bin = whisperBin();
  if (!bin) return { ok: false, detail: 'whisper-cli not found — brew install whisper-cpp' };
  if (!fs.existsSync(WHISPER_MODEL)) return { ok: false, detail: `model missing at ${WHISPER_MODEL}` };
  const tmp = path.join(os.tmpdir(), `balloon-${Date.now()}.wav`);
  fs.writeFileSync(tmp, Buffer.from(wavArrayBuffer));
  return new Promise((resolve) => {
    execFile(bin, ['-m', WHISPER_MODEL, '-f', tmp, '--no-timestamps'], { timeout: 30_000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (err) return resolve({ ok: false, detail: String(err.message || err) });
      const text = (stdout || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
      resolve(text ? { ok: true, text } : { ok: false, detail: 'heard nothing' });
    });
  });
});

// ---------- the agent ----------
let sdk = null;
async function agentQuery() {
  if (!sdk) sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query;
}

let nextId = 1;
function toSky(payload) { if (skyWin && !skyWin.isDestroyed()) skyWin.webContents.send('sky-event', payload); }
function toTank(payload) { if (tankWin && !tankWin.isDestroyed()) tankWin.webContents.send('tank-event', payload); }

// The tank hands a finished recording over. The sky gets the floating
// balloon (pure display, behind your windows); the tank keeps the
// interactive side: live console lines, the result card, the knot.
ipcMain.handle('launch-task', async (_e, { task, color, cwd }) => {
  const id = nextId++;
  toSky({ type: 'spawn', id, task, color });
  toTank({ type: 'spawn', id, task, color, cwd });
  runAgent(id, task, cwd);
  return { id };
});

async function runAgent(id, prompt, cwd) {
  const finish = (payload) => { toSky(payload); toTank(payload); };
  try {
    const query = await agentQuery();
    const stream = query({
      prompt,
      options: {
        cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
        permissionMode: 'acceptEdits',
      },
    });
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        const blocks = (msg.message && msg.message.content) || [];
        for (const c of blocks) {
          let line = null;
          if (c.type === 'text' && c.text && c.text.trim()) {
            line = '💭 ' + c.text.trim().slice(0, 90);
          } else if (c.type === 'tool_use') {
            const i = c.input || {};
            const what = i.file_path || i.command || i.pattern || i.description || i.prompt || '';
            line = `⚒ ${c.name}  ${String(what).slice(0, 70)}`;
          }
          if (line) { toTank({ type: 'progress', id, line }); toSky({ type: 'progress', id, line }); }
        }
        toSky({ type: 'progress', id });
      }
      if (msg.type === 'result') {
        const failed = msg.is_error || (msg.subtype && msg.subtype !== 'success');
        finish(failed
          ? { type: 'error', id, detail: (msg.result || msg.subtype || 'task failed').slice(0, 400) }
          : { type: 'done', id, result: (msg.result || 'done').slice(0, 600) });
        return;
      }
    }
    finish({ type: 'error', id, detail: 'agent stream ended without a result' });
  } catch (err) {
    finish({ type: 'error', id, detail: String(err.message || err).slice(0, 400) });
  }
}

// ---------- tank dragging + the rope anchor ----------
// The tank window moves wherever you drag it; the sky is told where the
// nozzle is so every balloon's string stays tied to it.
ipcMain.on('move-tank', (_e, { x, y }) => {
  if (tankWin) tankWin.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('anchor', (_e, { sx, sy }) => {
  const sb = skyWin ? skyWin.getBounds() : { x: 0, y: 0 };
  toSky({ type: 'anchor', x: sx - sb.x, y: sy - sb.y });
});

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ title: 'Where should balloon tasks work?', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  return { path: r.filePaths[0] };
});
ipcMain.on('reveal', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); });
ipcMain.on('quit', () => app.quit());

ipcMain.on('set-interactive', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setIgnoreMouseEvents(!on, { forward: true });
});

// ---------- windows ----------
let tankWin = null, skyWin = null;

function createWindows() {
  const { workArea } = screen.getPrimaryDisplay();

  const TW = 400, TH = 640;
  tankWin = new BrowserWindow({
    x: Math.round(workArea.x + workArea.width / 2 - TW / 2),
    y: workArea.y + workArea.height - TH,
    width: TW, height: TH,
    frame: false, transparent: true, resizable: false, hasShadow: false, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  tankWin.setAlwaysOnTop(true, 'screen-saver');
  tankWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  tankWin.setIgnoreMouseEvents(true, { forward: true });
  tankWin.loadFile(path.join(__dirname, 'renderer', 'tank.html'));

  skyWin = new BrowserWindow({
    ...workArea,
    frame: false, transparent: true, resizable: false, hasShadow: false, focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  // pure display: one notch above the desktop icons, below every app window,
  // and it NEVER takes the mouse (double-clicking wallpaper was triggering
  // macOS "reveal desktop" and scattering everything)
  try { skyWin.setAlwaysOnTop(true, 'normal', -2147483602); }
  catch { skyWin.setAlwaysOnTop(false); }
  skyWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  // forward:true is what lets the renderer SEE the pointer while ignored —
  // without it, hover never registers and nothing in the sky is clickable
  skyWin.setIgnoreMouseEvents(true, { forward: true });
  skyWin.loadFile(path.join(__dirname, 'renderer', 'sky.html'));
}

app.whenReady().then(createWindows);
app.on('window-all-closed', () => app.quit());
