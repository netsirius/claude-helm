import { useEffect, useState } from "react";
import { Plus, RefreshCw, Bot } from "lucide-react";
import { useAgentStore, type Agent } from "../stores/agentStore";
import { useVpsStore, type Vps } from "../stores/vpsStore";
import { tauriInvoke } from "../lib/tauri";
import AgentCard from "../components/agents/AgentCard";
import CreateAgentDialog from "../components/agents/CreateAgentDialog";

export default function Agents() {
  const { agents, loading, fetch: fetchAgents } = useAgentStore();
  const { servers, fetch: fetchVps } = useVpsStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchVps();
  }, [fetchAgents, fetchVps]);

  const vpsMap = new Map(servers.map((v) => [v.id, v]));

  const handleStart = async (agent: Agent) => {
    const vpsId = agent.assignedVpsId;
    if (!vpsId) {
      alert("Assign a VPS to this agent before starting a session.");
      return;
    }

    const workingDir = agent.defaultDir || "~";
    const model = agent.defaultModel || undefined;

    try {
      // Ensure VPS has been probed (needed to find claude binary path)
      await tauriInvoke("probe_vps", { id: vpsId });

      await tauriInvoke<string>("create_session", {
        vpsId,
        agentId: agent.id,
        workingDir: workingDir,
        model,
      });
      await fetchAgents();
    } catch (e) {
      alert(`Failed to start agent: ${e}`);
    }
  };

  const handleStop = async (agent: Agent) => {
    if (!agent.currentSessionId || !agent.currentVpsId) return;

    try {
      await tauriInvoke<null>("stop_session", {
        vpsId: agent.currentVpsId,
        sessionId: agent.currentSessionId,
      });
      await fetchAgents();
    } catch (e) {
      alert(`Failed to stop agent: ${e}`);
    }
  };

  const handleOpen = (agent: Agent, vps: Vps) => {
    if (!agent.currentSessionId) return;
    const cmd = `ssh ${vps.user}@${vps.host} -p ${vps.port} -t 'tmux attach -t ${agent.currentSessionId}'`;
    navigator.clipboard.writeText(cmd).then(() => {
      alert("SSH command copied to clipboard!");
    });
  };

  const handleDelete = async (agent: Agent) => {
    // Stop session first if running
    if (agent.currentSessionId && agent.currentVpsId) {
      try {
        await tauriInvoke<null>("stop_session", {
          vpsId: agent.currentVpsId,
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
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={16} />
            New Agent
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <Bot size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Create your first agent
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Agents represent Claude instances running on your VPS servers.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
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
              vps={
                vpsMap.get(agent.currentVpsId ?? "") ??
                vpsMap.get(agent.assignedVpsId ?? "")
              }
              onStart={handleStart}
              onStop={handleStop}
              onOpen={handleOpen}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateAgentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        vpsList={servers}
      />
    </div>
  );
}
