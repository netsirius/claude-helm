import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import StepNodeComponent, { type StepNodeData } from "./StepNode";
import type { Pipeline, PipelineStep } from "../../stores/pipelineStore";
import type { Agent } from "../../stores/agentStore";

interface PipelineDAGEditorProps {
  pipeline: Pipeline;
  agents: Agent[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
}

const nodeTypes = {
  stepNode: StepNodeComponent,
};

/**
 * Compute depth for each step based on dependency chains.
 * Steps with no dependencies are depth 0.
 */
function computeDepths(steps: PipelineStep[]): Map<string, number> {
  const depths = new Map<string, number>();
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  function getDepth(id: string, visited: Set<string>): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0; // circular guard
    visited.add(id);

    const step = stepMap.get(id);
    if (!step || step.dependsOn.length === 0) {
      depths.set(id, 0);
      return 0;
    }

    const maxParentDepth = Math.max(
      ...step.dependsOn.map((depId) => getDepth(depId, visited)),
    );
    const depth = maxParentDepth + 1;
    depths.set(id, depth);
    return depth;
  }

  for (const step of steps) {
    getDepth(step.id, new Set());
  }

  return depths;
}

export default function PipelineDAGEditor({
  pipeline,
  agents,
  selectedStepId,
  onSelectStep,
}: PipelineDAGEditorProps) {
  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  const isRunning = pipeline.status === "running";

  const { initialNodes, initialEdges } = useMemo(() => {
    const depths = computeDepths(pipeline.steps);

    // Group steps by depth for vertical positioning
    const depthGroups = new Map<number, PipelineStep[]>();
    for (const step of pipeline.steps) {
      const d = depths.get(step.id) || 0;
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(step);
    }

    const nodes: Node<StepNodeData>[] = pipeline.steps.map((step) => {
      const depth = depths.get(step.id) || 0;
      const group = depthGroups.get(depth) || [];
      const indexInGroup = group.indexOf(step);

      return {
        id: step.id,
        type: "stepNode" as const,
        position: { x: depth * 300 + 50, y: indexInGroup * 140 + 50 },
        data: {
          step,
          agent: agentMap.get(step.agentId),
          selected: step.id === selectedStepId,
        },
      };
    });

    const edges: Edge[] = pipeline.steps.flatMap((step) =>
      step.dependsOn.map((depId) => ({
        id: `${depId}->${step.id}`,
        source: depId,
        target: step.id,
        animated: step.status === "running",
        style: { stroke: "#3a3a37", strokeWidth: 2 },
      })),
    );

    return { initialNodes: nodes, initialEdges: edges };
  }, [pipeline.steps, agentMap, selectedStepId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Keep nodes/edges in sync when pipeline changes
  useMemo(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectStep(node.id);
    },
    [onSelectStep],
  );

  const onPaneClick = useCallback(() => {
    onSelectStep(null);
  }, [onSelectStep]);

  return (
    <div className="flex-1 min-h-[500px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isRunning ? undefined : onNodesChange}
        onEdgesChange={isRunning ? undefined : onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        className="bg-[#141413]"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2a28" gap={20} />
        <Controls
          className="!bg-[#2a2a28] !border-[#3a3a37] !rounded-lg [&>button]:!bg-[#2a2a28] [&>button]:!border-[#3a3a37] [&>button]:!text-[#b0aea5] [&>button:hover]:!bg-[#3a3a37]"
        />
      </ReactFlow>
    </div>
  );
}
