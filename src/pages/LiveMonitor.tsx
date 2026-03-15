import { useEffect, useRef, useState } from "react";
import { Monitor, Plus, RefreshCw } from "lucide-react";
import { useMonitorStore } from "../stores/monitorStore";
import { useAgentStore, type Agent } from "../stores/agentStore";
import TerminalPane from "../components/monitor/TerminalPane";

const MAX_MONITORS = 4;

export default function LiveMonitor() {
  const { monitored, addMonitor, removeMonitor, refreshAll } =
    useMonitorStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const [showPicker, setShowPicker] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshing = useRef(false);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Poll refreshAll every 2s while mounted, with in-flight guard
  useEffect(() => {
    // Initial refresh
    refreshAll();

    intervalRef.current = setInterval(async () => {
      if (isRefreshing.current) return;
      isRefreshing.current = true;
      try {
        await refreshAll();
      } finally {
        isRefreshing.current = false;
      }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshAll]);

  // Running agents not yet monitored
  const availableAgents = agents.filter(
    (a) =>
      a.currentSessionId &&
      a.currentRemoteId &&
      !monitored.some((m) => m.agentId === a.id),
  );

  const handleAdd = (agent: Agent) => {
    if (agent.currentSessionId && agent.currentRemoteId) {
      addMonitor(agent.id, agent.currentRemoteId, agent.currentSessionId);
    }
    setShowPicker(false);
  };

  // Grid: 1 col for 1, 2 cols for 2-4
  const gridCols =
    monitored.length <= 1
      ? "grid-cols-1"
      : "grid-cols-1 md:grid-cols-2";

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400">
            {monitored.length}/{MAX_MONITORS}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refreshAll()}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Refresh all"
          >
            <RefreshCw size={16} />
          </button>

          {monitored.length < MAX_MONITORS && (
            <div className="relative">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <Plus size={16} />
                Add Monitor
              </button>

              {showPicker && (
                <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
                  {availableAgents.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-zinc-400">
                      No running agents available
                    </div>
                  ) : (
                    availableAgents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => handleAdd(agent)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors"
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: agent.color || "#6366f1",
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {agent.name}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">
                            {agent.role}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {monitored.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <Monitor size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            No agents monitored
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Add a running agent to watch its terminal output in real time.
          </p>
          {availableAgents.length > 0 && (
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Plus size={16} />
              Add Monitor
            </button>
          )}
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4`}>
          {monitored.map((m) => {
            const agent = agentMap.get(m.agentId);
            return (
              <TerminalPane
                key={m.agentId}
                agentName={agent?.name ?? m.agentId}
                agentColor={agent?.color ?? "#6366f1"}
                output={m.output}
                onClose={() => removeMonitor(m.agentId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
