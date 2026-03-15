import { useState } from "react";
import { Play, Square, Copy, Trash2, Loader2 } from "lucide-react";
import type { Agent } from "../../stores/agentStore";
import type { Remote } from "../../stores/remoteStore";

interface AgentCardProps {
  agent: Agent;
  remote: Remote | undefined;
  onStart: (agent: Agent) => Promise<void>;
  onStop: (agent: Agent) => Promise<void>;
  onOpen: (agent: Agent, remote: Remote) => void;
  onDelete: (agent: Agent) => Promise<void>;
}

const statusConfig: Record<
  string,
  { label: string; dotClass: string; badgeClass: string }
> = {
  running: {
    label: "Running",
    dotClass: "bg-emerald-400",
    badgeClass: "bg-emerald-400/10 text-emerald-400",
  },
  exited: {
    label: "Exited",
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-400/10 text-amber-400",
  },
  idle: {
    label: "Idle",
    dotClass: "bg-zinc-500",
    badgeClass: "bg-zinc-500/10 text-zinc-400",
  },
};

function getAgentStatus(agent: Agent): string {
  if (!agent.currentSessionId) return "idle";
  // If there's a session assigned, we consider it running.
  // The actual status is refined when the Agents page polls list_sessions.
  return "running";
}

export default function AgentCard({
  agent,
  remote,
  onStart,
  onStop,
  onOpen,
  onDelete,
}: AgentCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const status = getAgentStatus(agent);
  const cfg = statusConfig[status];

  const handleAction = async (
    action: string,
    fn: () => Promise<void>,
  ) => {
    setActionLoading(action);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const isRunning = status === "running";
  const isIdle = status === "idle";
  const borderColor = agent.color || "#6366f1";

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3"
      style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg text-lg leading-none">
            {agent.icon || "\u{1F916}"}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
            <p className="text-xs text-zinc-400">{agent.role}</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${cfg.badgeClass}`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
          {cfg.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>
          Model:{" "}
          <span className="text-zinc-300">
            {agent.defaultModel.split("-").slice(0, 2).join("-")}
          </span>
        </span>
        {remote && (
          <span>
            Remote: <span className="text-zinc-300">{remote.name}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-zinc-800">
        {isIdle && (
          <button
            onClick={() => handleAction("start", () => onStart(agent))}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
          >
            {actionLoading === "start" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Start
          </button>
        )}

        {isRunning && (
          <>
            <button
              onClick={() => handleAction("stop", () => onStop(agent))}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
            >
              {actionLoading === "stop" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Square size={14} />
              )}
              Stop
            </button>

            {remote && (
              <button
                onClick={() => onOpen(agent, remote)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Copy size={14} />
                Open
              </button>
            )}
          </>
        )}

        <button
          onClick={() => handleAction("delete", () => onDelete(agent))}
          disabled={actionLoading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-red-600/20 hover:text-red-400 text-zinc-400 transition-colors disabled:opacity-50 ml-auto"
        >
          {actionLoading === "delete" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          Delete
        </button>
      </div>
    </div>
  );
}
