# Kickbacks Terminals — Architecture & Ported Fixes

This document compiles a complete understanding of how the virtual terminals
work, distilled from the upstream terminal subsystem (35 terminal/PTY commits
across its history) and the set of fixes ported into Kickbacks. Kickbacks shares
the upstream stack — `@lydell/node-pty` + `@xterm/xterm` with the fit,
web-links, unicode11, search, headless and serialize addons — so the fixes are
direct ports adapted to Kickbacks' single-terminal-per-card model.

---

## 1. How the terminals work

The terminal system spans five layers.

### 1.1 Main-process PTY layer (`src/main/main.ts`)

A registry of `PtySession` records owns every live pseudo-terminal. Each session
holds `{ id, proc, owner (WebContents), key?, launchMode, attached, recorder?,
pendingReplay, pendingResize, resizeTimer, activity, finalizer }`.

- **Shell resolution cascade** (`src/shared/shellResolver.ts`) — on Windows the
  default shell resolves **PowerShell 7 (`%ProgramFiles%\PowerShell\7\pwsh.exe`)
  → `pwsh.exe` on PATH → `powershell.exe` on PATH → `COMSPEC` → `cmd.exe`**.
  PowerShell variants spawn with `-NoLogo`. Off-Windows it is `$SHELL ?? /bin/bash`.
  PATH lookups cross `PATHEXT` on Windows with case-insensitive env-key handling,
  and are platform-parameterized so they behave deterministically on any host.
- **Configured shell** — `resolveConfiguredShell` maps the user's
  `TerminalSettings.defaultShell` (`auto | pwsh | powershell | cmd | {customPath}`)
  to a spawnable command; spawn consults persisted settings.
- **Terminal identity & env** — the PTY advertises `name: 'xterm-256color'` and
  exports `TERM=xterm-256color`, `COLORTERM=truecolor`. Env is compacted to
  string-only entries before reaching node-pty.
- **Ownership enforcement** — `write`/`resize`/`kill`/`detach`/`replay` each gate
  on `session.owner === event.sender` to prevent cross-window hijack.
- **Payload validation** (`src/shared/validate.ts`) — `pty:spawn` rejects
  non-records and NaN/Infinity dimensions and clamps cols/rows to `1..1000`.
- **Persistence / replay** — sessions are keyed by the renderer card id. A
  headless-xterm recorder (`src/main/sessionRecorder.ts`, `@xterm/headless` +
  `@xterm/addon-serialize`) records output. On reattach the serialized screen is
  replayed, then bytes buffered during the serialize, then live output resumes —
  exactly once and in order. A pending resize is flushed **before** serialize so
  the recorded grid matches the renderer (the "COOPER artifact" fix). Resize is
  debounced (~80 ms).
- **StrictMode-safe spawn** — `pendingSpawnsByKey` dedupes near-simultaneous
  spawns for the same card; a second mount reattaches to the first session rather
  than starting a second shell / Codex app-server.
- **Reaper** — a deck-driven reaper kills keyed sessions whose card is gone.
- **Structured failures** — `pty:spawn` returns a discriminated union
  `{ ok: true, ... } | { ok: false, error: { kind: 'binary-not-found' |
  'spawn-failed', command } }`; the renderer renders an install hint + Retry.

### 1.2 IPC contract (`src/shared/ipc.ts`, `src/preload/preload.ts`)

`PtyChannels`: `spawn` (invoke), `write`/`resize`/`kill`/`detach`/`replay`/`reap`
(send), plus `data`/`exit` (renderer-bound). `ShellChannels.openExternal`
validates http(s)-only URLs in main. `TerminalSettingsChannels` load/save the
persisted terminal settings.

### 1.3 Renderer xterm lifecycle (`src/renderer/App.tsx`, `TerminalView`)

One `XTerm` per terminal card. Open → defer (double-rAF) → measure the grid from
base-cell metrics (`fitTerminalWithGutter`, not FitAddon, so board zoom never
reflows the PTY) → spawn. Addons: Unicode11 (`activeVersion = '11'`), Search,
WebLinks (routed through `openExternal`). Options include `scrollback: 5000`,
`minimumContrastRatio: 3`, font weights, smooth scroll, and `windowsPty` (conpty)
on Windows. Copy/paste is custom and bracketed-paste aware
(`src/renderer/terminalClipboard.ts`). Outside-pointer blur uses
`src/renderer/terminalFocus.ts`. Viewport scroll is preserved across resize. PTY
resize IPC is debounced (~120 ms) so a zoom/drag gesture doesn't flood the child
with SIGWINCH. Teardown cancels timers, detaches shell integration, detaches
clipboard, disconnects observers, removes listeners, and disposes the terminal
last.

### 1.4 Board-zoom geometry

A single board-level CSS transform scales/pans the surface; the terminal grid is
pinned to its scale-invariant layout box, and pointer coordinates are remapped
(`src/renderer/terminalBoardPointer.ts`) so selection stays exact at any zoom.

### 1.5 Shell integration, heartbeat & settings

OSC 133 (FTCS) marks render as per-command exit-code gutter dots
(`src/renderer/terminalShellIntegration.ts`). A heartbeat glow ring tracks live
output flow (`src/renderer/activityMeter.ts`), disabled under reduced motion. The
Terminal settings panel exposes the shell picker (incl. custom path),
ConPTY-DLL, and shell-integration toggles, persisted with corruption-safe load.

---

## 2. What was ported into Kickbacks

| Area | Fixes | Where |
|---|---|---|
| Shell correctness | pwsh→cmd cascade, `-NoLogo`, PATH×PATHEXT resolution, configured shell | `src/shared/shellResolver.ts`, `src/shared/executableLookup.ts`, `src/main/main.ts` |
| Spawn hardening | runtime payload validation, env compaction, structured failures, app-menu hidden | `src/shared/validate.ts`, `src/main/main.ts` |
| Settings | versioned schema + tolerant (de)serialization, corruption-safe store, shell picker UI | `src/shared/terminalSettings.ts`, `src/main/terminalSettingsStore.ts`, `src/renderer/App.tsx` |
| xterm renderer | unicode11 + search addons, safe web-links, full options, font chain | `src/renderer/App.tsx` |
| Clipboard | bracketed-paste copy/paste, SIGINT-safe Ctrl+C | `src/renderer/terminalClipboard.ts` |
| Focus | outside-pointer blur boundary | `src/renderer/terminalFocus.ts` |
| Install hints | per-CLI hint catalog, install-hint panel + Retry | `src/renderer/installHintCatalog.ts`, `src/renderer/TerminalInstallHintPanel.tsx` |
| Resize | debounced PTY resize (renderer + main), flush-before-replay | `src/renderer/App.tsx`, `src/main/main.ts` |
| Shell integration | OSC 133 parser + exit-code gutter dots | `src/renderer/terminalShellIntegration.ts` |
| Heartbeat | decaying activity meter → glow ring (reduced-motion aware) | `src/renderer/activityMeter.ts`, `src/renderer/reducedMotion.ts` |
| Persistence | keyed sessions, StrictMode dedupe, headless recorder, detach/replay, reaper | `src/main/sessionRecorder.ts`, `src/shared/ptyPersistence.ts`, `src/main/main.ts` |

## 3. Deliberately not applicable

Upstream-only infrastructure with no Kickbacks counterpart was intentionally
not ported: WebGL renderer lifecycle (Kickbacks uses the DOM renderer), the
multi-card board counter-scaling experiments (superseded by the whole-board
transform + pointer remap), ACP/MCP terminal cards and per-session MCP context,
voice→TUI input, multi-CLI launch profiles, the theme catalog/preset picker, and
agent-startup-context injection.
