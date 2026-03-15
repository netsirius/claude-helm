import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Server, Wifi, WifiOff, Bot } from "lucide-react";
import { useRemoteStore } from "../stores/remoteStore";
import { useAgentStore } from "../stores/agentStore";

export default function Dashboard() {
  const { remotes, fetch: fetchRemotes } = useRemoteStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRemotes();
    fetchAgents();
  }, [fetchRemotes, fetchAgents]);

  const totalRemotes = remotes.length;
  const onlineRemotes = remotes.filter((s) => s.status === "online").length;
  const offlineRemotes = remotes.filter((s) => s.status === "offline").length;
  const activeAgents = agents.filter((a) => a.currentSessionId !== null).length;

  const stats = [
    {
      label: "Total Remotes",
      value: totalRemotes,
      icon: Server,
      color: "text-[#6a9bcc]",
      bg: "bg-[#6a9bcc]/10",
    },
    {
      label: "Online",
      value: onlineRemotes,
      icon: Wifi,
      color: "text-[#788c5d]",
      bg: "bg-[#788c5d]/10",
    },
    {
      label: "Offline",
      value: offlineRemotes,
      icon: WifiOff,
      color: "text-[#c45c4a]",
      bg: "bg-[#c45c4a]/10",
    },
    {
      label: "Active Agents",
      value: activeAgents,
      icon: Bot,
      color: "text-[#d97757]",
      bg: "bg-[#d97757]/10",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#faf9f5]">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon size={18} className={stat.color} />
              </div>
              <span className="text-sm text-[#b0aea5]">{stat.label}</span>
            </div>
            <p className="text-3xl font-bold text-[#faf9f5]">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Agent grid */}
      <div>
        <h2 className="text-lg font-semibold text-[#faf9f5] mb-3">Agents</h2>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <div className="p-4 bg-[#2a2a28] rounded-2xl mb-4">
              <Bot size={32} className="text-[#b0aea5]" />
            </div>
            <p className="text-sm text-[#b0aea5]">
              No agents configured yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {agents.map((agent) => {
              const isRunning = agent.currentSessionId !== null;
              return (
                <button
                  key={agent.id}
                  onClick={() => navigate("/agents")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#2a2a28] bg-[#1e1e1c] hover:bg-[#2a2a28] hover:border-[#3a3a37] transition-colors cursor-pointer"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: agent.color + "22", color: agent.color }}
                  >
                    {agent.icon || agent.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-[#faf9f5] truncate w-full text-center">
                    {agent.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isRunning
                        ? "bg-[#788c5d]/10 text-[#788c5d]"
                        : "bg-[#3a3a37]/50 text-[#b0aea5]"
                    }`}
                  >
                    {isRunning ? "Running" : "Idle"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
