# 🎈 Claude Balloon

Speak a task. A balloon inflates with your voice, floats away, and **pops when the agent is done** — raining down the result.

- **Hold the 🎈, talk, release** — transcribed locally with whisper.cpp, no API keys
- The task runs headless via the **Claude Agent SDK** (your existing Claude Code login), scoped to a folder you pick
- The balloon **fidgets while the agent works** — double-click it to watch a live console of every thought and tool call
- **Pop = done**: confetti + a result card with an open-the-folder link. Failures deflate sadly instead
- Speak again while one floats — **every balloon is its own parallel agent**
- Popped balloons leave a **knot** on the dock: click it to re-open the result

## Run it

```bash
brew install whisper-cpp
curl -L -o ~/.cache/whisper/ggml-base.en.bin --create-dirs \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
npm install
npm start
```

Needs [Claude Code](https://claude.com/claude-code) installed and logged in.

Made by [@milindlabs](https://x.com/milindlabs) — sibling of [Model Shift](https://stickshift-claude.vercel.app), the stick shifter for coding agents.
