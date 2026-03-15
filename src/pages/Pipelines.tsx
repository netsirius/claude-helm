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
  Timer,
  X,
} from "lucide-react";
import { usePipelineStore, type Pipeline, type PipelineStep } from "../stores/pipelineStore";
import { useAgentStore } from "../stores/agentStore";
import { tauriInvoke } from "../lib/tauri";
import PipelineEditorModal from "../components/pipeline/PipelineEditorModal";

// ── Schedule helpers ──────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day 9am", cron: "0 9 * * *" },
  { label: "Every day 6pm", cron: "0 18 * * *" },
  { label: "Mon-Fri 9am", cron: "0 9 * * 1-5" },
  { label: "Every Monday", cron: "0 9 * * 1" },
];

function cronToHuman(cron: string): string {
  const presetMatch = SCHEDULE_PRESETS.find((p) => p.cron === cron);
  if (presetMatch) return presetMatch.label;

  // Additional common patterns
  if (cron === "* * * * *") return "Every minute";
  if (/^\*\/(\d+) \* \* \* \*$/.test(cron)) {
    const m = cron.match(/^\*\/(\d+)/);
    return `Every ${m![1]} minutes`;
  }
  if (/^0 \*\/(\d+) \* \* \*$/.test(cron)) {
    const m = cron.match(/\*\/(\d+)/);
    return `Every ${m![1]} hours`;
  }
  if (/^(\d+) (\d+) \* \* \*$/.test(cron)) {
    const parts = cron.split(" ");
    return `Daily at ${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`;
  }

  return cron;
}

const stepStatusIcon: Record<string, ReactNode> = {
  pending: <Clock size={14} className="text-[#b0aea5]" />,
  running: <Loader2 size={14} className="text-[#6a9bcc] animate-spin" />,
  completed: <CheckCircle2 size={14} className="text-[#788c5d]" />,
  failed: <XCircle size={14} className="text-[#c45c4a]" />,
};

export default function Pipelines() {
  const { pipelines, loading, fetch: fetchPipelines, create, remove, setSchedule } = usePipelineStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [schedulingPipelineId, setSchedulingPipelineId] = useState<string | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
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
    // window.confirm may not work reliably in Tauri webview
    try {
      await remove(id);
    } catch (e) {
      alert(`Failed to delete pipeline: ${e}`);
    }
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

  const openScheduleEditor = (pipeline: Pipeline) => {
    setSchedulingPipelineId(pipeline.id);
    setScheduleInput(pipeline.schedule ?? "");
  };

  const closeScheduleEditor = () => {
    setSchedulingPipelineId(null);
    setScheduleInput("");
  };

  const handleSetSchedule = async (pipelineId: string, cron: string) => {
    await setSchedule(pipelineId, cron || null, !!cron);
    closeScheduleEditor();
  };

  const handleToggleSchedule = async (pipeline: Pipeline) => {
    if (!pipeline.schedule) return;
    await setSchedule(pipeline.id, pipeline.schedule, !pipeline.scheduleEnabled);
  };

  const handleRemoveSchedule = async (pipelineId: string) => {
    await setSchedule(pipelineId, null, false);
    closeScheduleEditor();
  };

  const canRun = (pipeline: Pipeline) =>
    pipeline.steps.length > 0 &&
    !executingIds.has(pipeline.id) &&
    (pipeline.status === "idle" || pipeline.status === "completed" || pipeline.status === "failed");

  const isRunning = (pipeline: Pipeline) =>
    pipeline.status === "running" || executingIds.has(pipeline.id);

  const statusColor: Record<string, string> = {
    idle: "bg-[#3a3a37]/50 text-[#b0aea5]",
    running: "bg-[#6a9bcc]/10 text-[#6a9bcc]",
    completed: "bg-[#788c5d]/10 text-[#788c5d]",
    failed: "bg-[#c45c4a]/10 text-[#c45c4a]",
  };

  const stepBorderColor: Record<string, string> = {
    pending: "border-[#3a3a37]",
    running: "border-[#6a9bcc]/50",
    completed: "border-[#788c5d]/50",
    failed: "border-[#c45c4a]/50",
  };

  const isEmpty = pipelines.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#faf9f5]">Pipelines</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPipelines}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#2a2a28] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
          >
            {showForm ? <ChevronUp size={16} /> : <Plus size={16} />}
            New Pipeline
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5 space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Pipeline name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-sm placeholder:text-[#b0aea5]/60 focus:outline-none focus:border-[#d97757]"
            />
            <input
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-sm placeholder:text-[#b0aea5]/60 focus:outline-none focus:border-[#d97757]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm rounded-lg text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-[#1e1e1c] rounded-2xl mb-4">
            <GitBranch size={32} className="text-[#b0aea5]" />
          </div>
          <h2 className="text-lg font-semibold text-[#faf9f5] mb-1">
            No pipelines yet
          </h2>
          <p className="text-sm text-[#b0aea5] mb-4">
            Create a pipeline to orchestrate multi-agent workflows.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
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
              className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-semibold text-[#faf9f5]">
                      {pipeline.name}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor[pipeline.status] || statusColor.idle}`}
                    >
                      {pipeline.status}
                    </span>
                    {pipeline.schedule && (
                      <button
                        onClick={() => handleToggleSchedule(pipeline)}
                        className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full transition-colors ${
                          pipeline.scheduleEnabled
                            ? "bg-[#6a9bcc]/10 text-[#6a9bcc]"
                            : "bg-[#3a3a37]/50 text-[#b0aea5] line-through"
                        }`}
                        title={
                          pipeline.scheduleEnabled
                            ? `Scheduled: ${cronToHuman(pipeline.schedule)} (click to disable)`
                            : `Schedule disabled: ${cronToHuman(pipeline.schedule)} (click to enable)`
                        }
                      >
                        {pipeline.scheduleEnabled && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#788c5d] inline-block" />
                        )}
                        <Timer size={11} />
                        {cronToHuman(pipeline.schedule)}
                      </button>
                    )}
                  </div>
                  {pipeline.description && (
                    <p className="text-sm text-[#b0aea5]">{pipeline.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Run / Cancel button */}
                  {isRunning(pipeline) ? (
                    <button
                      onClick={() => handleCancel(pipeline.id)}
                      className="p-2 rounded-lg text-[#c45c4a] hover:text-[#c45c4a] hover:bg-[#2a2a28] transition-colors"
                      title="Cancel execution"
                    >
                      <Square size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExecute(pipeline.id)}
                      disabled={!canRun(pipeline)}
                      className="p-2 rounded-lg text-[#788c5d] hover:text-[#788c5d] hover:bg-[#2a2a28] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                    onClick={() => openScheduleEditor(pipeline)}
                    className={`p-2 rounded-lg transition-colors ${
                      pipeline.schedule
                        ? "text-[#6a9bcc] hover:text-[#6a9bcc] hover:bg-[#2a2a28]"
                        : "text-[#b0aea5]/60 hover:text-[#6a9bcc] hover:bg-[#2a2a28]"
                    }`}
                    title="Schedule pipeline"
                  >
                    <Timer size={16} />
                  </button>
                  <button
                    onClick={() => setEditingPipelineId(pipeline.id)}
                    className="p-2 rounded-lg text-[#b0aea5]/60 hover:text-[#d97757] hover:bg-[#2a2a28] transition-colors"
                    title="Edit pipeline"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(pipeline.id)}
                    className="p-2 rounded-lg text-[#b0aea5]/60 hover:text-[#c45c4a] hover:bg-[#2a2a28] transition-colors"
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
                            <span className="text-[#b0aea5]/60 text-sm font-mono">
                              &rarr;
                            </span>
                          )}
                          <button
                            onClick={() => step.output && toggleOutput(step.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a28] border ${stepBorderColor[step.status] || "border-[#3a3a37]"} ${step.output ? "cursor-pointer hover:bg-[#3a3a37]" : "cursor-default"} transition-colors`}
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
                            <span className="text-xs text-[#e8e6dc]">
                              {step.label || agent?.name || step.agentId}
                            </span>
                            {step.output && (
                              <ChevronDown
                                size={12}
                                className={`text-[#b0aea5]/60 transition-transform ${expandedOutputs.has(step.id) ? "rotate-180" : ""}`}
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
                          className="mt-2 rounded-xl bg-[#141413] border border-[#2a2a28] overflow-hidden"
                        >
                          <div className="flex items-center gap-2 px-4 py-2 bg-[#1e1e1c] border-b border-[#2a2a28]">
                            {agent && (
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                                style={{ backgroundColor: agent.color + "22", color: agent.color }}
                              >
                                {agent.icon || agent.name.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs font-medium text-[#faf9f5]">
                              {step.label || agent?.name || "Step"}
                            </span>
                            <span className="text-[10px] text-[#b0aea5] ml-auto">
                              {step.output?.length} chars
                            </span>
                          </div>
                          <div className="p-4 max-h-[500px] overflow-y-auto">
                            <div className="text-sm text-[#e8e6dc] whitespace-pre-wrap break-words leading-relaxed font-mono">
                              {step.output}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-[#b0aea5]/60 mt-2">No steps configured</p>
              )}

              {/* Last run timestamp */}
              {pipeline.lastRunAt && (
                <p className="text-xs text-[#b0aea5]/60 mt-3">
                  Last run: {new Date(pipeline.lastRunAt).toLocaleString()}
                </p>
              )}

              {/* Schedule editor */}
              {schedulingPipelineId === pipeline.id && (
                <div className="mt-3 rounded-lg bg-[#141413] border border-[#2a2a28] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#faf9f5]">
                      Schedule
                    </span>
                    <button
                      onClick={closeScheduleEditor}
                      className="p-1 rounded text-[#b0aea5]/60 hover:text-[#faf9f5] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Preset buttons */}
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_PRESETS.map((preset) => (
                      <button
                        key={preset.cron}
                        onClick={() => {
                          setScheduleInput(preset.cron);
                          handleSetSchedule(pipeline.id, preset.cron);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          pipeline.schedule === preset.cron
                            ? "bg-[#6a9bcc]/10 border-[#6a9bcc]/50 text-[#6a9bcc]"
                            : "bg-[#2a2a28] border-[#3a3a37] text-[#b0aea5] hover:bg-[#3a3a37] hover:text-[#faf9f5]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom cron input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Custom cron: */5 * * * *"
                      value={scheduleInput}
                      onChange={(e) => setScheduleInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-xs font-mono placeholder:text-[#b0aea5]/40 focus:outline-none focus:border-[#6a9bcc]"
                    />
                    <button
                      onClick={() =>
                        handleSetSchedule(pipeline.id, scheduleInput.trim())
                      }
                      disabled={!scheduleInput.trim()}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#6a9bcc] hover:bg-[#5a8bbc] text-[#faf9f5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                    {pipeline.schedule && (
                      <button
                        onClick={() => handleRemoveSchedule(pipeline.id)}
                        className="px-3 py-1.5 text-xs rounded-lg text-[#c45c4a] hover:bg-[#2a2a28] transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-[#b0aea5]/50">
                    Format: minute hour day month weekday (e.g., 0 9 * * 1-5 = Mon-Fri at 9am)
                  </p>
                </div>
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
