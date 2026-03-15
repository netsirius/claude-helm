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
  error: string | null;
  fetch: () => Promise<void>;
  create: (name: string, description: string) => Promise<void>;
  addStep: (
    pipelineId: string,
    agentId: string,
    prompt: string,
    dependsOn: string[],
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

  addStep: async (pipelineId, agentId, prompt, dependsOn) => {
    set({ error: null });
    try {
      await tauriInvoke<PipelineStep>("add_pipeline_step", {
        pipelineId,
        agentId,
        prompt,
        dependsOn,
      });
      await get().fetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to add pipeline step: ${message}` });
    }
  },

  // TODO: Replace with dedicated Tauri commands when Rust backend supports them.
  // Currently updates the step client-side and re-saves the full pipeline.
  updateStep: async (pipelineId, stepId, updates) => {
    set({ error: null });
    try {
      const pipeline = get().pipelines.find((p) => p.id === pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");

      const stepIndex = pipeline.steps.findIndex((s) => s.id === stepId);
      if (stepIndex === -1) throw new Error("Step not found");

      const updatedSteps = [...pipeline.steps];
      updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], ...updates };

      // Optimistic update
      set({
        pipelines: get().pipelines.map((p) =>
          p.id === pipelineId ? { ...p, steps: updatedSteps } : p,
        ),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: `Failed to update step: ${message}` });
    }
  },

  // TODO: Replace with a dedicated Tauri command when Rust backend supports it.
  removeStep: async (pipelineId, stepId) => {
    set({ error: null });
    try {
      const pipeline = get().pipelines.find((p) => p.id === pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");

      const updatedSteps = pipeline.steps
        .filter((s) => s.id !== stepId)
        .map((s) => ({
          ...s,
          dependsOn: s.dependsOn.filter((dep) => dep !== stepId),
        }));

      // Optimistic update
      set({
        pipelines: get().pipelines.map((p) =>
          p.id === pipelineId ? { ...p, steps: updatedSteps } : p,
        ),
      });
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
