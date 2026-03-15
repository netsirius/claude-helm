import { useState, useCallback } from "react";
import { X, Plus } from "lucide-react";
import PipelineDAGEditor from "./PipelineDAGEditor";
import StepEditPanel from "./StepEditPanel";
import {
  usePipelineStore,
  type Pipeline,
  type PipelineStep,
} from "../../stores/pipelineStore";
import type { Agent } from "../../stores/agentStore";

interface PipelineEditorModalProps {
  pipeline: Pipeline;
  agents: Agent[];
  onClose: () => void;
}

export default function PipelineEditorModal({
  pipeline,
  agents,
  onClose,
}: PipelineEditorModalProps) {
  const { addStep, updateStep, removeStep } = usePipelineStore();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const selectedStep = pipeline.steps.find((s) => s.id === selectedStepId);
  const isRunning = pipeline.status === "running";

  const handleAddStep = useCallback(async () => {
    if (agents.length === 0) return;
    const defaultAgent = agents[0];
    await addStep(pipeline.id, defaultAgent.id, "", []);
    // The store will re-fetch; new step will appear in the DAG
  }, [addStep, pipeline.id, agents]);

  const handleSaveStep = useCallback(
    async (stepId: string, updates: Partial<PipelineStep>) => {
      await updateStep(pipeline.id, stepId, updates);
    },
    [updateStep, pipeline.id],
  );

  const handleDeleteStep = useCallback(
    async (stepId: string) => {
      await removeStep(pipeline.id, stepId);
      if (selectedStepId === stepId) {
        setSelectedStepId(null);
      }
    },
    [removeStep, pipeline.id, selectedStepId],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {pipeline.name}
            </h2>
            {pipeline.description && (
              <p className="text-xs text-zinc-400 mt-0.5">
                {pipeline.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isRunning && (
              <button
                onClick={handleAddStep}
                disabled={agents.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                Add Step
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {pipeline.steps.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <p className="text-zinc-400 text-sm mb-3">
                No steps in this pipeline yet.
              </p>
              {!isRunning && (
                <button
                  onClick={handleAddStep}
                  disabled={agents.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
                >
                  <Plus size={16} />
                  Add First Step
                </button>
              )}
            </div>
          ) : (
            <PipelineDAGEditor
              pipeline={pipeline}
              agents={agents}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
            />
          )}

          {selectedStep && (
            <StepEditPanel
              step={selectedStep}
              allSteps={pipeline.steps}
              agents={agents}
              onSave={handleSaveStep}
              onDelete={handleDeleteStep}
              readOnly={isRunning}
            />
          )}
        </div>
      </div>
    </div>
  );
}
