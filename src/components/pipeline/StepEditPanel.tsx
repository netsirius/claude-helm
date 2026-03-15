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
    <div className="w-80 border-l border-[#2a2a28] bg-[#1e1e1c] p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#faf9f5]">Edit Step</h3>
        {agent && (
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: agent.color }}
          />
        )}
      </div>

      {/* Agent selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-[#b0aea5]">Agent</label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={readOnly}
          className="w-full px-3 py-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-sm focus:outline-none focus:border-[#d97757] disabled:opacity-50"
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
        <label className="text-xs text-[#b0aea5]">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={readOnly}
          rows={5}
          className="w-full px-3 py-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-sm placeholder:text-[#b0aea5]/60 focus:outline-none focus:border-[#d97757] resize-none disabled:opacity-50"
          placeholder="Enter the prompt for this step..."
        />
        {otherSteps.length > 0 && (
          <div className="text-[10px] text-[#b0aea5]/60 bg-[#2a2a28]/50 rounded p-2 space-y-0.5">
            <p className="font-medium text-[#b0aea5]">Available variables:</p>
            <p>
              <code className="text-[#d97757]">{"{{prev.output}}"}</code> —
              output from last dependency
            </p>
            {otherSteps.map((s) => {
              const depAgent = agents.find((a) => a.id === s.agentId);
              return (
                <p key={s.id}>
                  <code className="text-[#d97757]">{`{{step.${s.id}.output}}`}</code>{" "}
                  — {depAgent?.name || s.agentId}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs text-[#b0aea5]">Timeout (seconds)</label>
        <input
          type="number"
          value={timeout}
          onChange={(e) => setTimeout_(Number(e.target.value))}
          disabled={readOnly}
          min={0}
          className="w-full px-3 py-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-sm focus:outline-none focus:border-[#d97757] disabled:opacity-50"
        />
      </div>

      {/* Dependencies */}
      {otherSteps.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-[#b0aea5]">Depends On</label>
          <div className="space-y-1">
            {otherSteps.map((s) => {
              const depAgent = agents.find((a) => a.id === s.agentId);
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#2a2a28] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={dependsOn.includes(s.id)}
                    onChange={() => toggleDep(s.id)}
                    disabled={readOnly}
                    className="rounded border-[#3a3a37] bg-[#2a2a28] text-[#d97757] focus:ring-[#d97757] focus:ring-offset-0"
                  />
                  <span className="text-xs text-[#e8e6dc]">
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
        <div className="mt-auto flex gap-2 pt-4 border-t border-[#2a2a28]">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            Save
          </button>
          <button
            onClick={() => onDelete(step.id)}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg text-[#c45c4a] hover:bg-[#c45c4a]/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
