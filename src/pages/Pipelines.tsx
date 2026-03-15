import { type ReactNode, useEffect, useRef, useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  GitBranch,
  Trash2,
  ChevronUp,
  Pencil,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
} from "lucide-react";
import { usePipelineStore, type Pipeline, type PipelineStep } from "../stores/pipelineStore";
import { useAgentStore } from "../stores/agentStore";
import { tauriInvoke } from "../lib/tauri";
import PipelineEditorModal from "../components/pipeline/PipelineEditorModal";

const stepStatusIcon: Record<string, ReactNode> = {
  pending: <Clock size={14} className="text-zinc-500" />,
  running: <Loader2 size={14} className="text-blue-400 animate-spin" />,
  completed: <CheckCircle2 size={14} className="text-emerald-400" />,
  failed: <XCircle size={14} className="text-red-400" />,
};

export default function Pipelines() {
  const { pipelines, loading, fetch: fetchPipelines, create, remove } = usePipelineStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Poll a running pipeline for status updates every 2 seconds
  const startPolling = useCallback(
    (pipelineId: string) => {
      if (pollTimers.current.has(pipelineId)) return;

      const timer = setInterval(async () => {
        try {
          const updated = await tauriInvoke<Pipeline>("get_pipeline_status", {
            pipelineId,
          });
          if (updated.status !== "running") {
            clearInterval(pollTimers.current.get(pipelineId)!);
            pollTimers.current.delete(pipelineId);
            setExecutingIds((prev) => {
              const next = new Set(prev);
              next.delete(pipelineId);
              return next;
            });
          }
          await fetchPipelines();
        } catch {
          clearInterval(pollTimers.current.get(pipelineId)!);
          pollTimers.current.delete(pipelineId);
          setExecutingIds((prev) => {
            const next = new Set(prev);
            next.delete(pipelineId);
            return next;
          });
        }
      }, 2000);

      pollTimers.current.set(pipelineId, timer);
    },
    [fetchPipelines],
  );

  // Cleanup poll timers on unmount
  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    fetchPipelines();
    fetchAgents();
  }, [fetchPipelines, fetchAgents]);

  // Start polling for any pipelines that are already running on load
  useEffect(() => {
    pipelines.forEach((p) => {
      if (p.status === "running" && !pollTimers.current.has(p.id)) {
        setExecutingIds((prev) => new Set(prev).add(p.id));
        startPolling(p.id);
      }
    });
  }, [pipelines, startPolling]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const handleCreate = async () => {
    if (!name.trim()) return;
    await create(name.trim(), description.trim());
    setName("");
    setDescription("");
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this pipeline?")) return;
    await remove(id);
  };

  const handleExecute = async (pipelineId: string) => {
    try {
      setExecutingIds((prev) => new Set(prev).add(pipelineId));
      await tauriInvoke("execute_pipeline", { pipelineId });
      await fetchPipelines();
      startPolling(pipelineId);
    } catch (e) {
      setExecutingIds((prev) => {
        const next = new Set(prev);
        next.delete(pipelineId);
        return next;
      });
      alert(`Failed to execute pipeline: ${e}`);
      await fetchPipelines();
    }
  };

  const handleCancel = async (pipelineId: string) => {
    try {
      await tauriInvoke("cancel_pipeline", { pipelineId });
      await fetchPipelines();
    } catch (e) {
      alert(`Failed to cancel pipeline: ${e}`);
    }
  };

  const toggleOutput = (stepId: string) => {
    setExpandedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const canRun = (pipeline: Pipeline) =>
    pipeline.steps.length > 0 &&
    !executingIds.has(pipeline.id) &&
    (pipeline.status === "idle" || pipeline.status === "completed" || pipeline.status === "failed");

  const isRunning = (pipeline: Pipeline) =>
    pipeline.status === "running" || executingIds.has(pipeline.id);

  const statusColor: Record<string, string> = {
    idle: "bg-zinc-700/50 text-zinc-400",
    running: "bg-blue-400/10 text-blue-400",
    completed: "bg-emerald-400/10 text-emerald-400",
    failed: "bg-red-400/10 text-red-400",
  };

  const stepBorderColor: Record<string, string> = {
    pending: "border-zinc-700",
    running: "border-blue-500/50",
    completed: "border-emerald-500/50",
    failed: "border-red-500/50",
  };

  const isEmpty = pipelines.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Pipelines</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPipelines}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            {showForm ? <ChevronUp size={16} /> : <Plus size={16} />}
            New Pipeline
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Pipeline name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <GitBranch size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            No pipelines yet
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Create a pipeline to orchestrate multi-agent workflows.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={16} />
            New Pipeline
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {pipelines.map((pipeline: Pipeline) => (
            <div
              key={pipeline.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-semibold text-white">
                      {pipeline.name}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor[pipeline.status] || statusColor.idle}`}
                    >
                      {pipeline.status}
                    </span>
                  </div>
                  {pipeline.description && (
                    <p className="text-sm text-zinc-400">{pipeline.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Run / Cancel button */}
                  {isRunning(pipeline) ? (
                    <button
                      onClick={() => handleCancel(pipeline.id)}
                      className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
                      title="Cancel execution"
                    >
                      <Square size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExecute(pipeline.id)}
                      disabled={!canRun(pipeline)}
                      className="p-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        pipeline.steps.length === 0
                          ? "Add steps before running"
                          : "Run pipeline"
                      }
                    >
                      <Play size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setEditingPipelineId(pipeline.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800 transition-colors"
                    title="Edit pipeline"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(pipeline.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    title="Delete pipeline"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Step visualization with execution status */}
              {pipeline.steps.length > 0 ? (
                <div className="space-y-2 mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pipeline.steps.map((step: PipelineStep, idx: number) => {
                      const agent = agentMap.get(step.agentId);
                      return (
                        <div key={step.id} className="flex items-center gap-2">
                          {idx > 0 && (
                            <span className="text-zinc-600 text-sm font-mono">
                              &rarr;
                            </span>
                          )}
                          <button
                            onClick={() => step.output && toggleOutput(step.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border ${stepBorderColor[step.status] || "border-zinc-700"} ${step.output ? "cursor-pointer hover:bg-zinc-750" : "cursor-default"} transition-colors`}
                          >
                            {stepStatusIcon[step.status] || stepStatusIcon.pending}
                            {agent && (
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                                style={{
                                  backgroundColor: agent.color + "22",
                                  color: agent.color,
                                }}
                              >
                                {agent.icon || agent.name.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs text-zinc-300">
                              {agent?.name || step.agentId}
                            </span>
                            {step.output && (
                              <ChevronDown
                                size={12}
                                className={`text-zinc-500 transition-transform ${expandedOutputs.has(step.id) ? "rotate-180" : ""}`}
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Expanded step output previews */}
                  {pipeline.steps
                    .filter((step) => step.output && expandedOutputs.has(step.id))
                    .map((step) => {
                      const agent = agentMap.get(step.agentId);
                      return (
                        <div
                          key={`output-${step.id}`}
                          className="mt-2 rounded-lg bg-zinc-950 border border-zinc-800 p-3"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-zinc-400">
                              Output from {agent?.name || step.agentId}
                            </span>
                          </div>
                          <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">
                            {step.output}
                          </pre>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 mt-2">No steps configured</p>
              )}

              {/* Last run timestamp */}
              {pipeline.lastRunAt && (
                <p className="text-xs text-zinc-600 mt-3">
                  Last run: {new Date(pipeline.lastRunAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pipeline Editor Modal */}
      {editingPipelineId && (() => {
        const editingPipeline = pipelines.find((p) => p.id === editingPipelineId);
        if (!editingPipeline) return null;
        return (
          <PipelineEditorModal
            pipeline={editingPipeline}
            agents={agents}
            onClose={() => setEditingPipelineId(null)}
          />
        );
      })()}
    </div>
  );
}
