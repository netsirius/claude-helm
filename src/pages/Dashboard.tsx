import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Server, Wifi, WifiOff, Bot } from "lucide-react";
import { useVpsStore } from "../stores/vpsStore";
import { useAgentStore } from "../stores/agentStore";

export default function Dashboard() {
  const { servers, fetch: fetchVps } = useVpsStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchVps();
    fetchAgents();
  }, [fetchVps, fetchAgents]);

  const totalVps = servers.length;
  const onlineVps = servers.filter((s) => s.status === "online").length;
  const offlineVps = servers.filter((s) => s.status === "offline").length;
  const activeAgents = agents.filter((a) => a.currentSessionId !== null).length;

  const stats = [
    {
      label: "Total VPS",
      value: totalVps,
      icon: Server,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Online",
      value: onlineVps,
      icon: Wifi,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      label: "Offline",
      value: offlineVps,
      icon: WifiOff,
      color: "text-red-400",
      bg: "bg-red-400/10",
    },
    {
      label: "Active Agents",
      value: activeAgents,
      icon: Bot,
      color: "text-indigo-400",
      bg: "bg-indigo-400/10",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon size={18} className={stat.color} />
              </div>
              <span className="text-sm text-zinc-400">{stat.label}</span>
            </div>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Agent grid */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Agents</h2>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="p-4 bg-zinc-800 rounded-2xl mb-4">
              <Bot size={32} className="text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-400">
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
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: agent.color + "22", color: agent.color }}
                  >
                    {agent.icon || agent.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-white truncate w-full text-center">
                    {agent.name}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isRunning
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-zinc-700/50 text-zinc-400"
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
