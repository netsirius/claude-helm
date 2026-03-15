import { create } from "zustand";
import { tauriInvoke } from "../lib/tauri";

export interface PipelineStep {
  id: string;
  label: string;
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
  error: string | null;
  fetch: () => Promise<void>;
  create: (name: string, description: string) => Promise<void>;
  addStep: (
    pipelineId: string,
    agentId: string,
    prompt: string,
    dependsOn: string[],
    label?: string,
  ) => Promise<void>;
  updateStep: (
    pipelineId: string,
    stepId: string,
    updates: Partial<PipelineStep>,
  ) => Promise<void>;
  removeStep: (pipelineId: string, stepId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelines: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const pipelines = await tauriInvoke<Pipeline[]>("list_pipelines");
      set({ pipelines, loading: false, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: `Failed to fetch pipelines: ${message}` });
    }
  },

  create: async (name, description) => {
    set({ loading: true, error: null });
    try {
      await tauriInvoke<Pipeline>("create_pipeline", { name, description });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: `Failed to create pipeline: ${message}` });
    }
  },

  addStep: async (pipelineId, agentId, prompt, dependsOn, label) => {
    set({ error: null });
    try {
      await tauriInvoke<PipelineStep>("add_pipeline_step", {
        pipelineId,
        agentId,
        prompt,
        dependsOn,
        label: label ?? null,
      });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to add pipeline step: ${message}` });
    }
  },

  updateStep: async (pipelineId, stepId, updates) => {
    set({ error: null });
    try {
      await tauriInvoke("update_pipeline_step", {
        pipelineId,
        stepId,
        label: updates.label ?? null,
        agentId: updates.agentId ?? null,
        prompt: updates.prompt ?? null,
        dependsOn: updates.dependsOn ?? null,
        timeout: updates.timeout ?? null,
      });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to update step: ${message}` });
    }
  },

  removeStep: async (pipelineId, stepId) => {
    set({ error: null });
    try {
      await tauriInvoke("remove_pipeline_step", { pipelineId, stepId });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to remove step: ${message}` });
    }
  },

  remove: async (id) => {
    set({ error: null });
    try {
      await tauriInvoke<boolean>("delete_pipeline", { id });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to remove pipeline: ${message}` });
    }
  },
}));
