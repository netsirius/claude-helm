import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  defaultModel: string;
  defaultDir: string;
  claudeMd: string;
  assignedRemoteId: string | null;
  tags: string[];
  currentSessionId: string | null;
  currentRemoteId: string | null;
  createdAt: string;
}

interface AgentState {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  add: (
    name: string,
    role: string,
    opts?: {
      icon?: string;
      color?: string;
      defaultModel?: string;
      assignedRemoteId?: string;
      claudeMd?: string;
    },
  ) => Promise<void>;
  update: (id: string, updates: Partial<Omit<Agent, "id" | "createdAt" | "tags" | "currentSessionId" | "currentRemoteId">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await tauriInvoke<Agent[]>("list_agents");
      set({ agents, loading: false, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: `Failed to fetch agents: ${message}` });
    }
  },

  add: async (name, role, opts) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Agent>("add_agent", {
        name,
        role,
        icon: opts?.icon,
        color: opts?.color,
        defaultModel: opts?.defaultModel,
        assignedRemoteId: opts?.assignedRemoteId,
        claudeMd: opts?.claudeMd,
      });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: `Failed to add agent: ${message}` });
    }
  },

  update: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Agent>("update_agent", {
        id,
        name: updates.name,
        role: updates.role,
        icon: updates.icon,
        color: updates.color,
        defaultModel: updates.defaultModel,
        assignedRemoteId: updates.assignedRemoteId,
        claudeMd: updates.claudeMd,
      });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: `Failed to update agent: ${message}` });
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      await tauriInvoke<boolean>("remove_agent", { id });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to remove agent: ${message}` });
    }
  },
}));
