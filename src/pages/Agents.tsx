import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, RefreshCw, Bot } from "lucide-react";
import { useAgentStore, type Agent } from "../stores/agentStore";
import { useRemoteStore, type Remote } from "../stores/remoteStore";
import { tauriInvoke } from "../lib/tauri";
import AgentCard from "../components/agents/AgentCard";
import type { AgentActivity } from "../components/agents/AgentCard";
import CreateAgentDialog from "../components/agents/CreateAgentDialog";
import FileBrowser from "../components/remote/FileBrowser";

const ACTIVITY_POLL_INTERVAL = 5000;

export default function Agents() {
  const { agents, loading, fetch: fetchAgents } = useAgentStore();
  const { remotes, fetch: fetchRemotes } = useRemoteStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Activity state for running agents
  const [activityMap, setActivityMap] = useState<Map<string, AgentActivity>>(
    new Map(),
  );
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // File browser state for agent start flow
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [pendingStartAgent, setPendingStartAgent] = useState<Agent | null>(
    null,
  );

  useEffect(() => {
    fetchAgents();
    fetchRemotes();
  }, [fetchAgents, fetchRemotes]);

  const remoteMap = new Map(remotes.map((v) => [v.id, v]));

  // Identify running agents
  const runningAgents = agents.filter(
    (a) => a.currentSessionId && a.currentRemoteId,
  );

  // Poll activity for running agents
  const fetchActivities = useCallback(async () => {
    const running = agents.filter(
      (a) => a.currentSessionId && a.currentRemoteId,
    );
    if (running.length === 0) return;

    const entries = await Promise.allSettled(
      running.map(async (agent) => {
        const activity = await tauriInvoke<AgentActivity>(
          "get_agent_activity",
          {
            remoteId: agent.currentRemoteId!,
            sessionId: agent.currentSessionId!,
          },
        );
        return [agent.id, activity] as [string, AgentActivity];
      }),
    );

    setActivityMap((prev) => {
      const next = new Map(prev);
      for (const result of entries) {
        if (result.status === "fulfilled") {
          const [id, activity] = result.value;
          next.set(id, activity);
        }
      }
      return next;
    });
  }, [agents]);

  useEffect(() => {
    // Clear any previous interval
    if (activityIntervalRef.current) {
      clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    }

    if (runningAgents.length > 0) {
      // Fetch immediately, then poll
      fetchActivities();
      activityIntervalRef.current = setInterval(
        fetchActivities,
        ACTIVITY_POLL_INTERVAL,
      );
    } else {
      // No running agents; clear stale activity data
      setActivityMap(new Map());
    }

    return () => {
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }
    };
  }, [runningAgents.length, fetchActivities]);

  const startAgent = async (agent: Agent, workingDir: string) => {
    const remoteId = agent.assignedRemoteId;
    if (!remoteId) {
      alert("Assign a remote to this agent before starting a session.");
      return;
    }

    const model = agent.defaultModel || undefined;

    try {
      await tauriInvoke("probe_remote", { id: remoteId });
      await tauriInvoke<string>("create_session", {
        remoteId,
        agentId: agent.id,
        workingDir,
        model,
      });
      await fetchAgents();
    } catch (e) {
      alert(`Failed to start agent: ${e}`);
    }
  };

  const handleStart = async (agent: Agent) => {
    // Start directly with defaultDir or ~ (home directory)
    await startAgent(agent, agent.defaultDir || "~");
  };

  const handleStartWithBrowse = (agent: Agent) => {
    setPendingStartAgent(agent);
    setFileBrowserOpen(true);
  };

  const handleDirSelected = useCallback(
    async (path: string) => {
      setFileBrowserOpen(false);
      const agent = pendingStartAgent;
      setPendingStartAgent(null);
      if (!agent) return;
      await startAgent(agent, path);
    },
    [pendingStartAgent],
  );

  const handleStop = async (agent: Agent) => {
    if (!agent.currentSessionId || !agent.currentRemoteId) return;

    try {
      await tauriInvoke<null>("stop_session", {
        remoteId: agent.currentRemoteId,
        sessionId: agent.currentSessionId,
      });
      // Clear activity for this agent
      setActivityMap((prev) => {
        const next = new Map(prev);
        next.delete(agent.id);
        return next;
      });
      await fetchAgents();
    } catch (e) {
      alert(`Failed to stop agent: ${e}`);
    }
  };

  const handleOpenTerminal = (agent: Agent, remote: Remote) => {
    if (!agent.currentSessionId) return;
    tauriInvoke("open_session_terminal", {
      remoteId: remote.id,
      sessionId: agent.currentSessionId,
    }).catch((e) => {
      alert(`Failed to open terminal: ${e}`);
    });
  };

  const handleCopySSH = (agent: Agent, remote: Remote) => {
    if (!agent.currentSessionId) return;
    const cmd = `ssh ${remote.user}@${remote.host} -p ${remote.port} -t 'tmux attach -t ${agent.currentSessionId}'`;
    navigator.clipboard.writeText(cmd).then(() => {
      alert("SSH command copied to clipboard!");
    });
  };

  const handleOpenRemote = async (agent: Agent) => {
    if (!agent.currentSessionId || !agent.currentRemoteId) return;
    try {
      const url = await tauriInvoke<string>("start_remote_control", {
        remoteId: agent.currentRemoteId,
        sessionId: agent.currentSessionId,
      });

      if (!url || !url.startsWith("https://")) {
        alert("Could not get remote control URL.");
        return;
      }

      await navigator.clipboard.writeText(url);

      // Try opening with Tauri opener, fallback to window.open
      let opened = false;
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
        opened = true;
      } catch {
        try {
          const w = window.open(url, "_blank");
          opened = !!w;
        } catch { /* ignore */ }
      }

      if (!opened) {
        alert(`Open this URL in your browser:\n\n${url}\n\n(Copied to clipboard)`);
      }
    } catch (e) {
      alert(`Remote control error: ${e}`);
    }
  };

  const handleDelete = async (agent: Agent) => {
    // Stop session first if running
    if (agent.currentSessionId && agent.currentRemoteId) {
      try {
        await tauriInvoke<null>("stop_session", {
          remoteId: agent.currentRemoteId,
          sessionId: agent.currentSessionId,
        });
      } catch {
        // Session may already be gone; continue with deletion
      }
    }

    await tauriInvoke<boolean>("remove_agent", { id: agent.id });
    await fetchAgents();
  };

  const isEmpty = agents.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#faf9f5]">Agents</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#2a2a28] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
          >
            <Plus size={16} />
            New Agent
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-[#1e1e1c] rounded-2xl mb-4">
            <Bot size={32} className="text-[#b0aea5]" />
          </div>
          <h2 className="text-lg font-semibold text-[#faf9f5] mb-1">
            Create your first agent
          </h2>
          <p className="text-sm text-[#b0aea5] mb-4">
            Agents represent Claude instances running on your remotes.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
          >
            <Plus size={16} />
            New Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              remote={
                remoteMap.get(agent.currentRemoteId ?? "") ??
                remoteMap.get(agent.assignedRemoteId ?? "")
              }
              activity={activityMap.get(agent.id)}
              onStart={handleStart}
              onStartWithBrowse={handleStartWithBrowse}
              onStop={handleStop}
              onOpenTerminal={handleOpenTerminal}
              onCopySSH={handleCopySSH}
              onOpenRemote={handleOpenRemote}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateAgentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        remoteList={remotes}
      />

      {pendingStartAgent?.assignedRemoteId && (
        <FileBrowser
          open={fileBrowserOpen}
          onClose={() => {
            setFileBrowserOpen(false);
            setPendingStartAgent(null);
          }}
          onSelect={handleDirSelected}
          remoteId={pendingStartAgent.assignedRemoteId}
        />
      )}
    </div>
  );
}
