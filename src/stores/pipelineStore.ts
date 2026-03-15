import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface PipelineStep {
  id: string;
  agentId: string;
  prompt: string;
  dependsOn: string[];
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  timeout: number;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  status: "idle" | "running" | "completed" | "failed";
  createdAt: string;
  lastRunAt: string | null;
}

interface PipelineState {
  pipelines: Pipeline[];
  loading: boolean;
  fetch: () => Promise<void>;
  create: (name: string, description: string) => Promise<void>;
  addStep: (
    pipelineId: string,
    agentId: string,
    prompt: string,
    dependsOn: string[],
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelines: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const pipelines = await tauriInvoke<Pipeline[]>("list_pipelines");
      set({ pipelines, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  create: async (name, description) => {
    set({ loading: true });
    try {
      await tauriInvoke<Pipeline>("create_pipeline", { name, description });
      await get().fetch();
    } catch {
      set({ loading: false });
    }
  },

  addStep: async (pipelineId, agentId, prompt, dependsOn) => {
    try {
      await tauriInvoke<PipelineStep>("add_pipeline_step", {
        pipelineId,
        agentId,
        prompt,
        dependsOn,
      });
      await get().fetch();
    } catch {
      // silently handle
    }
  },

  remove: async (id) => {
    try {
      await tauriInvoke<boolean>("delete_pipeline", { id });
      await get().fetch();
    } catch {
      // silently handle
    }
  },
}));
