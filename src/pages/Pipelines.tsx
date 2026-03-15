import { useEffect, useState } from "react";
import { Plus, RefreshCw, GitBranch, Trash2, ChevronUp } from "lucide-react";
import { usePipelineStore, type Pipeline } from "../stores/pipelineStore";
import { useAgentStore } from "../stores/agentStore";

export default function Pipelines() {
  const { pipelines, loading, fetch: fetchPipelines, create, remove } = usePipelineStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchPipelines();
    fetchAgents();
  }, [fetchPipelines, fetchAgents]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const handleCreate = async () => {
    if (!name.trim()) return;
    await create(name.trim(), description.trim());
    setName("");
    setDescription("");
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
  };

  const statusColor: Record<string, string> = {
    idle: "bg-zinc-700/50 text-zinc-400",
    running: "bg-blue-400/10 text-blue-400",
    completed: "bg-emerald-400/10 text-emerald-400",
    failed: "bg-red-400/10 text-red-400",
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
                <button
                  onClick={() => handleDelete(pipeline.id)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                  title="Delete pipeline"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Step visualization */}
              {pipeline.steps.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {pipeline.steps.map((step, idx) => {
                    const agent = agentMap.get(step.agentId);
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        {idx > 0 && (
                          <span className="text-zinc-600 text-sm font-mono">
                            &rarr;
                          </span>
                        )}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 mt-2">No steps configured</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
