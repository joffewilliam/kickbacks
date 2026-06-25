import { contextBridge, ipcRenderer } from 'electron';
import {
  AdsChannels,
  AuthChannels,
  EarningChannels,
  PtyChannels,
  SettingsChannels,
  ShellChannels,
  TerminalSettingsChannels,
  type KickbacksApi,
  type PtyDataEvent,
  type PtyExitEvent,
  type PtyLaunchFailedEvent,
} from '../shared/ipc';

const api: KickbacksApi = {
  login: (req) => ipcRenderer.invoke(AuthChannels.login, req),
  loadSettings: () => ipcRenderer.invoke(SettingsChannels.load),
  saveSettings: (settings) => ipcRenderer.invoke(SettingsChannels.save, settings),
  spawnTerminal: (req) => ipcRenderer.invoke(PtyChannels.spawn, req),
  writeTerminal: (req) => ipcRenderer.send(PtyChannels.write, req),
  resizeTerminal: (req) => ipcRenderer.send(PtyChannels.resize, req),
  killTerminal: (req) => ipcRenderer.send(PtyChannels.kill, req),
  detachTerminal: (req) => ipcRenderer.send(PtyChannels.detach, req),
  replayTerminal: (req) => ipcRenderer.send(PtyChannels.replay, req),
  reapTerminals: (req) => ipcRenderer.send(PtyChannels.reap, req),
  onTerminalData: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyDataEvent) =>
      listener(payload);
    ipcRenderer.on(PtyChannels.data, handler);
    return () => ipcRenderer.off(PtyChannels.data, handler);
  },
  onTerminalExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PtyExitEvent) =>
      listener(payload);
    ipcRenderer.on(PtyChannels.exit, handler);
    return () => ipcRenderer.off(PtyChannels.exit, handler);
  },
  onTerminalLaunchFailed: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: PtyLaunchFailedEvent,
    ) => listener(payload);
    ipcRenderer.on(PtyChannels.launchFailed, handler);
    return () => ipcRenderer.off(PtyChannels.launchFailed, handler);
  },
  recordAdImpression: (req) => ipcRenderer.invoke(AdsChannels.impression, req),
  recordAdClick: (req) => ipcRenderer.invoke(AdsChannels.click, req),
  listAdEvents: () => ipcRenderer.invoke(AdsChannels.list),
  earningStatus: (req) => ipcRenderer.invoke(EarningChannels.status, req),
  openExternal: (req) => ipcRenderer.invoke(ShellChannels.openExternal, req),
  loadTerminalSettings: () =>
    ipcRenderer.invoke(TerminalSettingsChannels.load),
  saveTerminalSettings: (settings) =>
    ipcRenderer.invoke(TerminalSettingsChannels.save, settings),
};

contextBridge.exposeInMainWorld('kickbacks', api);
