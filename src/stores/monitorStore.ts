import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface MonitoredAgent {
  agentId: string;
  remoteId: string;
  sessionId: string;
  output: string;
}

interface MonitorState {
  monitored: MonitoredAgent[];
  addMonitor: (agentId: string, remoteId: string, sessionId: string) => void;
  removeMonitor: (agentId: string) => void;
  refreshOutput: (agentId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const MAX_MONITORS = 4;

export const useMonitorStore = create<MonitorState>((set, get) => ({
  monitored: [],

  addMonitor: (agentId, remoteId, sessionId) => {
    const { monitored } = get();
    if (monitored.length >= MAX_MONITORS) return;
    if (monitored.some((m) => m.agentId === agentId)) return;

    set({
      monitored: [
        ...monitored,
        { agentId, remoteId, sessionId, output: "" },
      ],
    });
  },

  removeMonitor: (agentId) => {
    set({ monitored: get().monitored.filter((m) => m.agentId !== agentId) });
  },

  refreshOutput: async (agentId) => {
    const { monitored } = get();
    const entry = monitored.find((m) => m.agentId === agentId);
    if (!entry) return;

    try {
      const output = await tauriInvoke<string>("capture_session_output", {
        remoteId: entry.remoteId,
        sessionId: entry.sessionId,
      });

      set({
        monitored: get().monitored.map((m) =>
          m.agentId === agentId ? { ...m, output } : m,
        ),
      });
    } catch {
      // Session may have ended; leave existing output
    }
  },

  refreshAll: async () => {
    const { monitored, refreshOutput } = get();
    await Promise.allSettled(monitored.map((m) => refreshOutput(m.agentId)));
  },
}));
