import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface Remote {
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

export interface RemoteUpdates {
  name?: string;
  host?: string;
  user?: string;
  sshKeyPath?: string;
  port?: number;
  tags?: string[];
  group?: string;
}

interface RemoteState {
  remotes: Remote[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  add: (remote: {
    name: string;
    host: string;
    user: string;
    sshKeyPath: string;
    port?: number;
    tags?: string[];
    group?: string;
  }) => Promise<void>;
  update: (id: string, updates: RemoteUpdates) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<boolean>;
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  remotes: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const remotes = await tauriInvoke<Remote[]>("list_remotes");
      set({ remotes, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  add: async (remote) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Remote>("add_remote", {
        name: remote.name,
        host: remote.host,
        user: remote.user,
        sshKeyPath: remote.sshKeyPath,
        port: remote.port,
        tags: remote.tags,
        group: remote.group,
      });
      await get().fetch();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  update: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Remote>("update_remote", {
        id,
        name: updates.name,
        host: updates.host,
        user: updates.user,
        port: updates.port,
        sshKeyPath: updates.sshKeyPath,
        tags: updates.tags,
        group: updates.group,
      });
      await get().fetch();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      await tauriInvoke<boolean>("remove_remote", { id });
      await get().fetch();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  testConnection: async (id) => {
    try {
      const result = await tauriInvoke<boolean>("test_remote_connection", { id });
      await get().fetch();
      return result;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
