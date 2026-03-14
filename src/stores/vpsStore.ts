import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface Vps {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  sshKeyPath: string;
  tags: string[];
  group: string;
  status: "online" | "offline" | "unknown";
  lastSeen: string;
}

interface VpsState {
  servers: Vps[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  add: (vps: {
    name: string;
    host: string;
    user: string;
    sshKeyPath: string;
    port?: number;
    tags?: string[];
    group?: string;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<boolean>;
}

export const useVpsStore = create<VpsState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const servers = await tauriInvoke<Vps[]>("list_vps");
      set({ servers, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  add: async (vps) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Vps>("add_vps", {
        name: vps.name,
        host: vps.host,
        user: vps.user,
        sshKeyPath: vps.sshKeyPath,
        port: vps.port,
        tags: vps.tags,
        group: vps.group,
      });
      await get().fetch();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      await tauriInvoke<boolean>("remove_vps", { id });
      await get().fetch();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  testConnection: async (id) => {
    try {
      const result = await tauriInvoke<boolean>("test_vps_connection", { id });
      await get().fetch();
      return result;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
