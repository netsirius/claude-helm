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
  assignedVpsId: string | null;
  tags: string[];
  currentSessionId: string | null;
  currentVpsId: string | null;
  createdAt: string;
}

interface AgentState {
  agents: Agent[];
  loading: boolean;
  fetch: () => Promise<void>;
  add: (
    name: string,
    role: string,
    opts?: {
      icon?: string;
      color?: string;
      defaultModel?: string;
      assignedVpsId?: string;
    },
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const agents = await tauriInvoke<Agent[]>("list_agents");
      set({ agents, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  add: async (name, role, opts) => {
    set({ loading: true });
    try {
      await tauriInvoke<Agent>("add_agent", {
        name,
        role,
        icon: opts?.icon,
        color: opts?.color,
        defaultModel: opts?.defaultModel,
        assignedVpsId: opts?.assignedVpsId,
      });
      await get().fetch();
    } catch {
      set({ loading: false });
    }
  },

  remove: async (id) => {
    try {
      await tauriInvoke<boolean>("remove_agent", { id });
      await get().fetch();
    } catch {
      // silently handle
    }
  },
}));
