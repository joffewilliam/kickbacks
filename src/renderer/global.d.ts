import type { KickbacksApi } from '../shared/ipc';

declare global {
  interface Window {
    kickbacks: KickbacksApi;
  }
}

export {};
