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
  pending: "bg-[#3a3a37]/50 text-[#b0aea5]",
  running: "bg-[#d97757]/10 text-[#d97757]",
  completed: "bg-[#788c5d]/10 text-[#788c5d]",
  failed: "bg-[#c45c4a]/10 text-[#c45c4a]",
};

function StepNodeComponent({ data }: NodeProps<StepNodeType>) {
  const { step, agent, selected } = data;
  const borderColor = agent?.color || "#71717a";
  const promptPreview =
    step.prompt.length > 50 ? step.prompt.slice(0, 50) + "..." : step.prompt;
  const displayTitle = step.label || agent?.name || step.agentId;

  return (
    <div
      className={`rounded-xl bg-[#1e1e1c] border-2 px-4 py-3 min-w-[200px] max-w-[240px] transition-shadow ${
        selected ? "shadow-lg shadow-[#d97757]/20 ring-1 ring-[#d97757]" : ""
      }`}
      style={{ borderColor }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-[#3a3a37] !border-[#b0aea5]"
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
        <span className="text-sm font-medium text-[#faf9f5] truncate">
          {displayTitle}
        </span>
        <span
          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full capitalize whitespace-nowrap ${statusStyles[step.status] || statusStyles.pending}`}
        >
          {step.status}
        </span>
      </div>

      {step.prompt && (
        <p className="text-xs text-[#b0aea5] leading-relaxed">{promptPreview}</p>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-[#3a3a37] !border-[#b0aea5]"
      />
    </div>
  );
}

export default memo(StepNodeComponent);
