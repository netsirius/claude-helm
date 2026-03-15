import { useState, useEffect, useCallback } from "react";
import {
  X,
  RefreshCw,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Server,
  Zap,
  Webhook,
  Bot,
  Settings,
  Puzzle,
} from "lucide-react";
import { tauriInvoke } from "../../lib/tauri";
import ClaudeSettingsEditor from "./ClaudeSettingsEditor";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RemoteMcp {
  name: string;
  command: string;
  args: string[];
  env: unknown;
  enabled: boolean;
  config: unknown;
}

interface RemoteSkill {
  name: string;
  path: string;
}

interface RemoteHook {
  event: string;
  command: string;
  config: unknown;
}

interface RemoteAgent {
  name: string;
  description: string;
  config: unknown;
}

type TabKey = "mcps" | "skills" | "hooks" | "agents" | "settings";

interface RemoteAdminPanelProps {
  open: boolean;
  onClose: () => void;
  remoteId: string;
  remoteName: string;
}

const TABS: { key: TabKey; label: string; icon: typeof Server }[] = [
  { key: "mcps", label: "MCPs", icon: Puzzle },
  { key: "skills", label: "Skills", icon: Zap },
  { key: "hooks", label: "Hooks", icon: Webhook },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "settings", label: "Settings", icon: Settings },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function RemoteAdminPanel({
  open,
  onClose,
  remoteId,
  remoteName,
}: RemoteAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("mcps");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [mcps, setMcps] = useState<RemoteMcp[]>([]);
  const [skills, setSkills] = useState<RemoteSkill[]>([]);
  const [hooks, setHooks] = useState<RemoteHook[]>([]);
  const [agents, setAgents] = useState<RemoteAgent[]>([]);

  // Expanded items
  const [expandedMcps, setExpandedMcps] = useState<Set<string>>(new Set());

  // Settings sub-modal
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadTab = useCallback(
    async (tab: TabKey) => {
      if (tab === "settings") return;
      setLoading(true);
      setError(null);
      try {
        switch (tab) {
          case "mcps": {
            const result = await tauriInvoke<RemoteMcp[]>(
              "list_remote_mcps",
              { remoteId },
            );
            setMcps(result);
            break;
          }
          case "skills": {
            const result = await tauriInvoke<RemoteSkill[]>(
              "list_remote_skills",
              { remoteId },
            );
            setSkills(result);
            break;
          }
          case "hooks": {
            const result = await tauriInvoke<RemoteHook[]>(
              "list_remote_hooks",
              { remoteId },
            );
            setHooks(result);
            break;
          }
          case "agents": {
            const result = await tauriInvoke<RemoteAgent[]>(
              "list_remote_agents",
              { remoteId },
            );
            setAgents(result);
            break;
          }
        }
      } catch (e) {
        setError(typeof e === "string" ? e : String(e));
      } finally {
        setLoading(false);
      }
    },
    [remoteId],
  );

  useEffect(() => {
    if (open) {
      loadTab(activeTab);
    }
  }, [open, activeTab, loadTab]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === "settings") {
      setSettingsOpen(true);
    }
  };

  const handleToggleMcp = async (name: string, enabled: boolean) => {
    try {
      await tauriInvoke("toggle_remote_extension", {
        remoteId,
        extType: "mcp",
        name,
        enabled,
      });
      setMcps((prev) =>
        prev.map((m) => (m.name === name ? { ...m, enabled } : m)),
      );
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const handleRemove = async (extType: string, name: string) => {
    const label =
      extType === "mcp"
        ? "MCP server"
        : extType === "skill"
          ? "skill"
          : "hook";
    if (!window.confirm(`Remove ${label} "${name}" from this remote?`)) return;

    try {
      await tauriInvoke("remove_remote_extension", {
        remoteId,
        extType,
        name,
      });
      // Refresh the current tab
      await loadTab(activeTab);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const toggleExpandMcp = (name: string) => {
    setExpandedMcps((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/80">
        <div className="bg-[#1e1e1c] border border-[#2a2a28] rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a28]">
            <div className="flex items-center gap-2.5">
              <Server size={18} className="text-[#d97757]" />
              <h2 className="text-sm font-semibold text-[#faf9f5]">
                Remote Administration
              </h2>
              <span className="text-xs text-[#b0aea5]/60">
                ({remoteName})
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 px-5 border-b border-[#2a2a28]">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? "text-[#d97757] border-b-[#d97757]"
                      : "text-[#b0aea5] border-b-transparent hover:text-[#e8e6dc]"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}

            {/* Refresh button */}
            {activeTab !== "settings" && (
              <button
                onClick={() => loadTab(activeTab)}
                disabled={loading}
                className="ml-auto p-1.5 rounded-lg text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#2a2a28] transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#c45c4a]/10 border border-[#c45c4a]/20 text-xs text-[#c45c4a]">
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-[#c45c4a]/60 hover:text-[#c45c4a] transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-[#b0aea5]" />
              </div>
            ) : activeTab === "settings" ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Settings size={32} className="text-[#b0aea5] mb-3" />
                <p className="text-sm text-[#b0aea5] mb-3">
                  Open the Claude settings editor for this remote.
                </p>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
                >
                  Open Settings Editor
                </button>
              </div>
            ) : activeTab === "mcps" ? (
              <McpList
                mcps={mcps}
                expandedMcps={expandedMcps}
                onToggle={handleToggleMcp}
                onRemove={handleRemove}
                onToggleExpand={toggleExpandMcp}
              />
            ) : activeTab === "skills" ? (
              <SkillList skills={skills} onRemove={handleRemove} />
            ) : activeTab === "hooks" ? (
              <HookList hooks={hooks} onRemove={handleRemove} />
            ) : activeTab === "agents" ? (
              <AgentList agents={agents} />
            ) : null}
          </div>
        </div>
      </div>

      <ClaudeSettingsEditor
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        remoteId={remoteId}
        remoteName={remoteName}
      />
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function McpList({
  mcps,
  expandedMcps,
  onToggle,
  onRemove,
  onToggleExpand,
}: {
  mcps: RemoteMcp[];
  expandedMcps: Set<string>;
  onToggle: (name: string, enabled: boolean) => void;
  onRemove: (extType: string, name: string) => void;
  onToggleExpand: (name: string) => void;
}) {
  if (mcps.length === 0) {
    return (
      <EmptyState icon={Puzzle} label="No MCP servers found on this remote." />
    );
  }

  return (
    <div className="space-y-2">
      {mcps.map((mcp) => {
        const expanded = expandedMcps.has(mcp.name);
        return (
          <div
            key={mcp.name}
            className="bg-[#141413] border border-[#2a2a28] rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Expand toggle */}
              <button
                onClick={() => onToggleExpand(mcp.name)}
                className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>

              {/* Icon */}
              <div className="p-1.5 bg-[#2a2a28] rounded-lg">
                <Puzzle size={14} className="text-[#b0aea5]" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-[#faf9f5] truncate">
                  {mcp.name}
                </h4>
                <p className="text-xs text-[#b0aea5]/60 truncate">
                  {mcp.command} {mcp.args.join(" ")}
                </p>
              </div>

              {/* Status badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${
                  mcp.enabled
                    ? "bg-[#788c5d]/10 text-[#788c5d]"
                    : "bg-[#b0aea5]/10 text-[#b0aea5]"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    mcp.enabled ? "bg-[#788c5d]" : "bg-[#b0aea5]"
                  }`}
                />
                {mcp.enabled ? "Enabled" : "Disabled"}
              </span>

              {/* Toggle */}
              <button
                onClick={() => onToggle(mcp.name, !mcp.enabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  mcp.enabled ? "bg-[#788c5d]" : "bg-[#3a3a37]"
                }`}
                title={mcp.enabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    mcp.enabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>

              {/* Delete */}
              <button
                onClick={() => onRemove("mcp", mcp.name)}
                className="p-1.5 rounded-lg text-[#b0aea5] hover:text-[#c45c4a] hover:bg-[#c45c4a]/10 transition-colors"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Expanded config */}
            {expanded && (
              <div className="px-4 pb-3 pt-0 border-t border-[#2a2a28]">
                <pre className="mt-2 text-xs text-[#b0aea5] bg-[#1e1e1c] rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(mcp.config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkillList({
  skills,
  onRemove,
}: {
  skills: RemoteSkill[];
  onRemove: (extType: string, name: string) => void;
}) {
  if (skills.length === 0) {
    return <EmptyState icon={Zap} label="No skills found on this remote." />;
  }

  return (
    <div className="space-y-2">
      {skills.map((skill) => (
        <div
          key={skill.path}
          className="flex items-center gap-3 px-4 py-3 bg-[#141413] border border-[#2a2a28] rounded-xl"
        >
          <div className="p-1.5 bg-[#2a2a28] rounded-lg">
            <Zap size={14} className="text-[#b0aea5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-[#faf9f5] truncate">
              {skill.name}
            </h4>
            <p className="text-xs text-[#b0aea5]/60 truncate">{skill.path}</p>
          </div>
          <button
            onClick={() => onRemove("skill", skill.name)}
            className="p-1.5 rounded-lg text-[#b0aea5] hover:text-[#c45c4a] hover:bg-[#c45c4a]/10 transition-colors"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function HookList({
  hooks,
  onRemove,
}: {
  hooks: RemoteHook[];
  onRemove: (extType: string, name: string) => void;
}) {
  if (hooks.length === 0) {
    return (
      <EmptyState icon={Webhook} label="No hooks found on this remote." />
    );
  }

  return (
    <div className="space-y-2">
      {hooks.map((hook, idx) => (
        <div
          key={`${hook.event}-${idx}`}
          className="flex items-center gap-3 px-4 py-3 bg-[#141413] border border-[#2a2a28] rounded-xl"
        >
          <div className="p-1.5 bg-[#2a2a28] rounded-lg">
            <Webhook size={14} className="text-[#b0aea5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-[#faf9f5] truncate">
              {hook.event}
            </h4>
            <p className="text-xs text-[#b0aea5]/60 truncate font-mono">
              {hook.command || "—"}
            </p>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#2a2a28] text-[#b0aea5]">
            {hook.event}
          </span>
          <button
            onClick={() => onRemove("hook", hook.event)}
            className="p-1.5 rounded-lg text-[#b0aea5] hover:text-[#c45c4a] hover:bg-[#c45c4a]/10 transition-colors"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AgentList({ agents }: { agents: RemoteAgent[] }) {
  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        label="No custom agents found on this remote."
      />
    );
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <div
          key={agent.name}
          className="flex items-center gap-3 px-4 py-3 bg-[#141413] border border-[#2a2a28] rounded-xl"
        >
          <div className="p-1.5 bg-[#2a2a28] rounded-lg">
            <Bot size={14} className="text-[#b0aea5]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-[#faf9f5] truncate">
              {agent.name}
            </h4>
            <p className="text-xs text-[#b0aea5]/60 truncate">
              {agent.description || "No description"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: typeof Server;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 bg-[#2a2a28] rounded-xl mb-3">
        <Icon size={24} className="text-[#b0aea5]" />
      </div>
      <p className="text-sm text-[#b0aea5]">{label}</p>
    </div>
  );
}
