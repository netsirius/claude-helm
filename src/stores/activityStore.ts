import { create } from "zustand";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  remoteName: string;
  command: string;
  status: "success" | "failure";
  error?: string;
}

interface ActivityState {
  entries: ActivityEntry[];
  add: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  clear: () => void;
}

const MAX_ENTRIES = 500;

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],

  add: (entry) =>
    set((state) => {
      const newEntry: ActivityEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };
      const entries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);
      return { entries };
    }),

  clear: () => set({ entries: [] }),
}));
