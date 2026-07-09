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

// Renderer records 16kHz mono PCM and ships a finished WAV — no ffmpeg needed.
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

// ---------- the agent (Claude Code as a library) ----------
// Each balloon = one independent headless run. The SDK reuses the user's
// existing Claude Code login — zero setup. The stream's `result` message is
// the balloon's pop.
let sdk = null;
async function agentQuery() {
  if (!sdk) sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query;
}

ipcMain.on('run-task', async (e, { id, prompt, cwd }) => {
  const send = (payload) => { if (!e.sender.isDestroyed()) e.sender.send('task-event', { id, ...payload }); };
  try {
    const query = await agentQuery();
    const stream = query({
      prompt,
      options: {
        cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
        permissionMode: 'acceptEdits', // edits inside the balloon's folder don't stall
      },
    });
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        // narrate the work: one compact line per thought / tool call
        const blocks = (msg.message && msg.message.content) || [];
        for (const c of blocks) {
          if (c.type === 'text' && c.text && c.text.trim()) {
            send({ type: 'progress', line: '💭 ' + c.text.trim().slice(0, 90) });
          } else if (c.type === 'tool_use') {
            const i = c.input || {};
            const what = i.file_path || i.command || i.pattern || i.description || i.prompt || '';
            send({ type: 'progress', line: `⚒ ${c.name}  ${String(what).slice(0, 70)}` });
          }
        }
        if (!blocks.length) send({ type: 'progress' });
      }
      if (msg.type === 'result') {
        const failed = msg.is_error || (msg.subtype && msg.subtype !== 'success');
        send(failed
          ? { type: 'error', detail: (msg.result || msg.subtype || 'task failed').slice(0, 400) }
          : { type: 'done', result: (msg.result || 'done').slice(0, 600) });
        return;
      }
    }
    send({ type: 'error', detail: 'agent stream ended without a result' });
  } catch (err) {
    send({ type: 'error', detail: String(err.message || err).slice(0, 400) });
  }
});

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ title: 'Where should balloon tasks work?', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  return { path: r.filePaths[0] };
});

// balloons float over everything; the window ignores the mouse except when
// the renderer says the pointer is on something interactive
let win = null;
ipcMain.on('set-interactive', (_e, on) => { if (win) win.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('quit', () => app.quit());
ipcMain.on('reveal', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); });

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...workArea,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  // balloons live ON THE DESKTOP — behind every window, visible when you
  // look at your wallpaper. kCGDesktopWindowLevel is -2147483623; Electron
  // reaches it via a negative relativeLevel on top of 'normal' (0).
  try { win.setAlwaysOnTop(true, 'normal', -2147483623); }
  catch { win.setAlwaysOnTop(false); } // fallback: bottom of the normal stack
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
