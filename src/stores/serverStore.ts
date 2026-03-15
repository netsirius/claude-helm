import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface Server {
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

export interface ServerUpdates {
  name?: string;
  host?: string;
  user?: string;
  sshKeyPath?: string;
  port?: number;
  tags?: string[];
  group?: string;
}

interface ServerState {
  servers: Server[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  add: (server: {
    name: string;
    host: string;
    user: string;
    sshKeyPath: string;
    port?: number;
    tags?: string[];
    group?: string;
  }) => Promise<void>;
  update: (id: string, updates: ServerUpdates) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<boolean>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const servers = await tauriInvoke<Server[]>("list_servers");
      set({ servers, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  add: async (server) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Server>("add_server", {
        name: server.name,
        host: server.host,
        user: server.user,
        sshKeyPath: server.sshKeyPath,
        port: server.port,
        tags: server.tags,
        group: server.group,
      });
      await get().fetch();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  update: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Server>("update_server", {
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
      await tauriInvoke<boolean>("remove_server", { id });
      await get().fetch();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  testConnection: async (id) => {
    try {
      const result = await tauriInvoke<boolean>("test_server_connection", { id });
      await get().fetch();
      return result;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));
