import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { PipelineStep } from "../../stores/pipelineStore";
import type { Agent } from "../../stores/agentStore";

export type StepNodeData = {
  step: PipelineStep;
  agent: Agent | undefined;
  selected: boolean;
};

type StepNodeType = Node<StepNodeData, "stepNode">;

const statusStyles: Record<string, string> = {
  pending: "bg-zinc-700/50 text-zinc-400",
  running: "bg-amber-400/10 text-amber-400",
  completed: "bg-emerald-400/10 text-emerald-400",
  failed: "bg-red-400/10 text-red-400",
};

function StepNodeComponent({ data }: NodeProps<StepNodeType>) {
  const { step, agent, selected } = data;
  const borderColor = agent?.color || "#71717a";
  const promptPreview =
    step.prompt.length > 60 ? step.prompt.slice(0, 60) + "..." : step.prompt;

  return (
    <div
      className={`rounded-xl bg-zinc-900 border-2 px-4 py-3 min-w-[200px] max-w-[240px] transition-shadow ${
        selected ? "shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500" : ""
      }`}
      style={{ borderColor }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-zinc-600 !border-zinc-500"
      />

      <div className="flex items-center gap-2 mb-2">
        {agent && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              backgroundColor: agent.color + "22",
              color: agent.color,
            }}
          >
            {agent.icon || agent.name.charAt(0)}
          </div>
        )}
        <span className="text-sm font-medium text-white truncate">
          {agent?.name || step.agentId}
        </span>
        <span
          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full capitalize whitespace-nowrap ${statusStyles[step.status] || statusStyles.pending}`}
        >
          {step.status}
        </span>
      </div>

      {step.prompt && (
        <p className="text-xs text-zinc-400 leading-relaxed">{promptPreview}</p>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-zinc-600 !border-zinc-500"
      />
    </div>
  );
}

export default memo(StepNodeComponent);
