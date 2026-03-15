import { useState } from "react";
import {
  Play,
  Square,
  Copy,
  Trash2,
  Loader2,
  FolderOpen,
  Terminal,
  Brain,
  Wrench,
  ChevronRight,
  Activity,
} from "lucide-react";
import type { Agent } from "../../stores/agentStore";
import type { Remote } from "../../stores/remoteStore";

export interface AgentActivity {
  status: string; // "waiting" | "thinking" | "working" | "busy"
  detail: string;
  lastOutput: string;
}

interface AgentCardProps {
  agent: Agent;
  remote: Remote | undefined;
  activity?: AgentActivity;
  onStart: (agent: Agent) => Promise<void>;
  onStartWithBrowse?: (agent: Agent) => void;
  onStop: (agent: Agent) => Promise<void>;
  onOpenTerminal: (agent: Agent, remote: Remote) => void;
  onCopySSH: (agent: Agent, remote: Remote) => void;
  onDelete: (agent: Agent) => Promise<void>;
}

const statusConfig: Record<
  string,
  { label: string; dotClass: string; badgeClass: string }
> = {
  running: {
    label: "Running",
    dotClass: "bg-[#788c5d]",
    badgeClass: "bg-[#788c5d]/10 text-[#788c5d]",
  },
  exited: {
    label: "Exited",
    dotClass: "bg-[#d97757]",
    badgeClass: "bg-[#d97757]/10 text-[#d97757]",
  },
  idle: {
    label: "Idle",
    dotClass: "bg-[#b0aea5]",
    badgeClass: "bg-[#b0aea5]/10 text-[#b0aea5]",
  },
};

function getAgentStatus(agent: Agent): string {
  if (!agent.currentSessionId) return "idle";
  // If there's a session assigned, we consider it running.
  // The actual status is refined when the Agents page polls list_sessions.
  return "running";
}

function ActivityIndicator({ activity }: { activity: AgentActivity }) {
  const { status, detail, lastOutput } = activity;

  let icon: React.ReactNode;
  let colorClass: string;

  switch (status) {
    case "waiting":
      icon = <ChevronRight size={12} />;
      colorClass = "text-[#b0aea5]";
      break;
    case "thinking":
      icon = <Brain size={12} className="animate-pulse" />;
      colorClass = "text-[#6a9bcc]";
      break;
    case "working":
      icon = <Wrench size={12} />;
      colorClass = "text-[#d97757]";
      break;
    default:
      icon = <Activity size={12} />;
      colorClass = "text-[#d97757]";
      break;
  }

  return (
    <div className="space-y-1.5">
      {/* Activity status line */}
      <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
        {icon}
        <span className="truncate">{detail}</span>
      </div>

      {/* Output preview */}
      {lastOutput && (
        <div className="bg-[#141413] rounded px-2 py-1 font-mono text-[10px] text-[#b0aea5] leading-relaxed overflow-hidden whitespace-pre-wrap break-all max-h-[36px]">
          {lastOutput}
        </div>
      )}
    </div>
  );
}

export default function AgentCard({
  agent,
  remote,
  activity,
  onStart,
  onStartWithBrowse,
  onStop,
  onOpenTerminal,
  onCopySSH,
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
  const borderColor = agent.color || "#d97757";

  return (
    <div
      className="bg-[#1e1e1c] border border-[#2a2a28] rounded-xl p-4 flex flex-col gap-3 hover:border-[#3a3a37] transition-colors"
      style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#2a2a28] rounded-lg text-lg leading-none">
            {agent.icon || "\u{1F916}"}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#faf9f5]">{agent.name}</h3>
            <p className="text-xs text-[#b0aea5]">{agent.role}</p>
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#b0aea5]/60">
        <span>
          Model:{" "}
          <span className="text-[#e8e6dc]">
            {agent.defaultModel.split("-").slice(0, 2).join("-")}
          </span>
        </span>
        {remote && (
          <span>
            Remote: <span className="text-[#e8e6dc]">{remote.name}</span>
          </span>
        )}
      </div>

      {/* Activity indicator for running agents */}
      {isRunning && activity && <ActivityIndicator activity={activity} />}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[#2a2a28]">
        {isIdle && (
          <>
            <button
              onClick={() => handleAction("start", () => onStart(agent))}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
            >
              {actionLoading === "start" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Start
            </button>
            {onStartWithBrowse && (
              <button
                onClick={() => onStartWithBrowse(agent)}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#e8e6dc] transition-colors disabled:opacity-50"
                title="Choose working directory before starting"
              >
                <FolderOpen size={14} />
              </button>
            )}
          </>
        )}

        {isRunning && (
          <>
            <button
              onClick={() => handleAction("stop", () => onStop(agent))}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#c45c4a]/20 hover:bg-[#c45c4a]/40 text-[#c45c4a] transition-colors disabled:opacity-50"
            >
              {actionLoading === "stop" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Square size={14} />
              )}
              Stop
            </button>

            {remote && (
              <>
                <button
                  onClick={() => onOpenTerminal(agent, remote)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
                  title="Open session in Terminal.app"
                >
                  <Terminal size={14} />
                  Open Terminal
                </button>
                <button
                  onClick={() => onCopySSH(agent, remote)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#e8e6dc] transition-colors"
                  title="Copy SSH command to clipboard"
                >
                  <Copy size={14} />
                  Copy SSH
                </button>
              </>
            )}
          </>
        )}

        <button
          onClick={() => handleAction("delete", () => onDelete(agent))}
          disabled={actionLoading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#c45c4a]/20 hover:text-[#c45c4a] text-[#b0aea5] transition-colors disabled:opacity-50 ml-auto"
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
