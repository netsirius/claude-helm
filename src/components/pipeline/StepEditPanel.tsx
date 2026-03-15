import { useState, useEffect } from "react";
import { Trash2, Save } from "lucide-react";
import type { PipelineStep } from "../../stores/pipelineStore";
import type { Agent } from "../../stores/agentStore";

interface StepEditPanelProps {
  step: PipelineStep;
  allSteps: PipelineStep[];
  agents: Agent[];
  onSave: (stepId: string, updates: Partial<PipelineStep>) => void;
  onDelete: (stepId: string) => void;
  readOnly: boolean;
}

export default function StepEditPanel({
  step,
  allSteps,
  agents,
  onSave,
  onDelete,
  readOnly,
}: StepEditPanelProps) {
  const [agentId, setAgentId] = useState(step.agentId);
  const [prompt, setPrompt] = useState(step.prompt);
  const [timeout, setTimeout_] = useState(step.timeout);
  const [dependsOn, setDependsOn] = useState<string[]>(step.dependsOn);

  // Reset form when selected step changes
  useEffect(() => {
    setAgentId(step.agentId);
    setPrompt(step.prompt);
    setTimeout_(step.timeout);
    setDependsOn(step.dependsOn);
  }, [step.id, step.agentId, step.prompt, step.timeout, step.dependsOn]);

  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  const toggleDep = (depId: string) => {
    setDependsOn((prev) =>
      prev.includes(depId) ? prev.filter((d) => d !== depId) : [...prev, depId],
    );
  };

  const handleSave = () => {
    onSave(step.id, { agentId, prompt, timeout, dependsOn });
  };

  const hasChanges =
    agentId !== step.agentId ||
    prompt !== step.prompt ||
    timeout !== step.timeout ||
    JSON.stringify(dependsOn.sort()) !==
      JSON.stringify([...step.dependsOn].sort());

  const agent = agents.find((a) => a.id === agentId);

  return (
    <div className="w-80 border-l border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Edit Step</h3>
        {agent && (
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: agent.color }}
          />
        )}
      </div>

      {/* Agent selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400">Agent</label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        >
          <option value="">Select agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} - {a.role}
            </option>
          ))}
        </select>
      </div>

      {/* Prompt */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={readOnly}
          rows={5}
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
          placeholder="Enter the prompt for this step..."
        />
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-400">Timeout (seconds)</label>
        <input
          type="number"
          value={timeout}
          onChange={(e) => setTimeout_(Number(e.target.value))}
          disabled={readOnly}
          min={0}
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
      </div>

      {/* Dependencies */}
      {otherSteps.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400">Depends On</label>
          <div className="space-y-1">
            {otherSteps.map((s) => {
              const depAgent = agents.find((a) => a.id === s.agentId);
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={dependsOn.includes(s.id)}
                    onChange={() => toggleDep(s.id)}
                    disabled={readOnly}
                    className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                  />
                  <span className="text-xs text-zinc-300">
                    {depAgent?.name || s.agentId}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {!readOnly && (
        <div className="mt-auto flex gap-2 pt-4 border-t border-zinc-800">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            Save
          </button>
          <button
            onClick={() => onDelete(step.id)}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
