import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Server,
  Wifi,
  WifiOff,
  Bot,
  DollarSign,
  Zap,
  Database,
  BarChart3,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useRemoteStore } from "../stores/remoteStore";
import { useAgentStore } from "../stores/agentStore";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelUsage {
  model: string;
  tokens: number;
  percentage: number;
}

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  estimatedCostUsd: number;
  cacheHitRate: number;
  sessionCount: number;
  modelDistribution: ModelUsage[];
  dailyUsage: DailyUsage[];
}

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface HeatmapData {
  cells: HeatmapCell[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { remotes, fetch: fetchRemotes } = useRemoteStore();
  const { agents, fetch: fetchAgents } = useAgentStore();
  const navigate = useNavigate();

  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>("");

  useEffect(() => {
    fetchRemotes();
    fetchAgents();
  }, [fetchRemotes, fetchAgents]);

  // Auto-select first online remote
  useEffect(() => {
    if (selectedRemoteId) return;
    const onlineRemote = remotes.find((r) => r.status === "online");
    if (onlineRemote) {
      setSelectedRemoteId(onlineRemote.id);
    } else if (remotes.length > 0) {
      setSelectedRemoteId(remotes[0].id);
    }
  }, [remotes, selectedRemoteId]);

  const fetchAnalytics = useCallback(async () => {
    if (!selectedRemoteId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const [usage, heatmap] = await Promise.all([
        invoke<UsageStats>("get_remote_usage_stats", {
          remoteId: selectedRemoteId,
        }),
        invoke<HeatmapData>("get_session_heatmap", {
          remoteId: selectedRemoteId,
        }),
      ]);
      setUsageStats(usage);
      setHeatmapData(heatmap);
    } catch (err) {
      setAnalyticsError(String(err));
    } finally {
      setAnalyticsLoading(false);
    }
  }, [selectedRemoteId]);

  // Fetch analytics when remote selection changes
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const totalRemotes = remotes.length;
  const onlineRemotes = remotes.filter((s) => s.status === "online").length;
  const offlineRemotes = remotes.filter((s) => s.status === "offline").length;
  const activeAgents = agents.filter(
    (a) => a.currentSessionId !== null
  ).length;

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

  // Heatmap helpers
  const maxHeatmapCount =
    heatmapData?.cells.reduce((max, c) => Math.max(max, c.count), 0) ?? 0;

  function heatmapIntensity(count: number): number {
    if (maxHeatmapCount === 0) return 0;
    return count / maxHeatmapCount;
  }

  // Daily chart helpers
  const maxDailyCost =
    usageStats?.dailyUsage.reduce((max, d) => Math.max(max, d.costUsd), 0) ??
    0;

  return (
    <div className="p-6 space-y-6">
      <h1
        className="text-2xl font-bold text-[#faf9f5]"
        style={{ fontFamily: "Poppins, sans-serif" }}
      >
        Dashboard
      </h1>

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
                    style={{
                      backgroundColor: agent.color + "22",
                      color: agent.color,
                    }}
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

      {/* ─── Token / Cost Analytics ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-lg font-semibold text-[#faf9f5]"
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            Token &amp; Cost Analytics
          </h2>
          {remotes.length > 0 && (
            <select
              value={selectedRemoteId}
              onChange={(e) => setSelectedRemoteId(e.target.value)}
              className="text-sm bg-[#1e1e1c] border border-[#2a2a28] rounded-lg px-3 py-1.5 text-[#faf9f5] focus:outline-none focus:border-[#d97757]"
            >
              {remotes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {analyticsLoading ? (
          <div className="flex items-center justify-center py-12 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <div className="flex items-center gap-3 text-[#b0aea5]">
              <div className="w-5 h-5 border-2 border-[#d97757] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading analytics...</span>
            </div>
          </div>
        ) : analyticsError ? (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <p className="text-sm text-[#c45c4a] mb-2">
              Failed to load analytics
            </p>
            <p className="text-xs text-[#b0aea5] max-w-md text-center">
              {analyticsError}
            </p>
            <button
              onClick={fetchAnalytics}
              className="mt-3 text-xs text-[#d97757] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : usageStats ? (
          <div className="space-y-4">
            {/* Cost overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#d97757]/10">
                    <DollarSign size={18} className="text-[#d97757]" />
                  </div>
                  <span className="text-sm text-[#b0aea5]">
                    Estimated Cost
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#d97757]">
                  {formatCost(usageStats.estimatedCostUsd)}
                </p>
                <p className="text-xs text-[#b0aea5] mt-1">Last 30 days</p>
              </div>

              <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#6a9bcc]/10">
                    <Zap size={18} className="text-[#6a9bcc]" />
                  </div>
                  <span className="text-sm text-[#b0aea5]">Total Tokens</span>
                </div>
                <p className="text-3xl font-bold text-[#faf9f5]">
                  {formatTokens(
                    usageStats.totalInputTokens + usageStats.totalOutputTokens
                  )}
                </p>
                <p className="text-xs text-[#b0aea5] mt-1">
                  {formatTokens(usageStats.totalInputTokens)} in /{" "}
                  {formatTokens(usageStats.totalOutputTokens)} out
                </p>
              </div>

              <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#788c5d]/10">
                    <Database size={18} className="text-[#788c5d]" />
                  </div>
                  <span className="text-sm text-[#b0aea5]">
                    Cache Hit Rate
                  </span>
                </div>
                <p className="text-3xl font-bold text-[#faf9f5]">
                  {usageStats.cacheHitRate.toFixed(1)}%
                </p>
                <p className="text-xs text-[#b0aea5] mt-1">
                  {formatTokens(usageStats.totalCacheReadTokens)} cached reads
                </p>
              </div>

              <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#6a9bcc]/10">
                    <BarChart3 size={18} className="text-[#6a9bcc]" />
                  </div>
                  <span className="text-sm text-[#b0aea5]">Sessions</span>
                </div>
                <p className="text-3xl font-bold text-[#faf9f5]">
                  {usageStats.sessionCount}
                </p>
                <p className="text-xs text-[#b0aea5] mt-1">Last 30 days</p>
              </div>
            </div>

            {/* Daily usage chart + Model distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Daily cost chart */}
              <div className="lg:col-span-2 rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <h3 className="text-sm font-medium text-[#faf9f5] mb-4">
                  Daily Cost (Last 14 Days)
                </h3>
                {usageStats.dailyUsage.length === 0 ? (
                  <p className="text-xs text-[#b0aea5] py-8 text-center">
                    No usage data available
                  </p>
                ) : (
                  <div className="flex items-end gap-1 h-32">
                    {usageStats.dailyUsage.map((day) => {
                      const height =
                        maxDailyCost > 0
                          ? (day.costUsd / maxDailyCost) * 100
                          : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center gap-1"
                        >
                          <div
                            className="w-full rounded-t-sm transition-all"
                            style={{
                              height: `${Math.max(height, 2)}%`,
                              backgroundColor: "#d97757",
                              opacity: Math.max(0.3, height / 100),
                            }}
                            title={`${day.date}: $${day.costUsd.toFixed(2)} (${formatTokens(day.inputTokens + day.outputTokens)} tokens)`}
                          />
                          <span className="text-[10px] text-[#b0aea5] rotate-[-45deg] origin-top-left whitespace-nowrap">
                            {day.date.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Model distribution */}
              <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
                <h3 className="text-sm font-medium text-[#faf9f5] mb-4">
                  Model Distribution
                </h3>
                {usageStats.modelDistribution.length === 0 ? (
                  <p className="text-xs text-[#b0aea5] py-8 text-center">
                    No model data
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Stacked bar */}
                    <div className="flex h-4 rounded-full overflow-hidden bg-[#2a2a28]">
                      {usageStats.modelDistribution.map((m, i) => {
                        const colors = [
                          "#d97757",
                          "#6a9bcc",
                          "#788c5d",
                          "#b0aea5",
                        ];
                        return (
                          <div
                            key={m.model}
                            style={{
                              width: `${m.percentage}%`,
                              backgroundColor: colors[i % colors.length],
                            }}
                            title={`${m.model}: ${m.percentage.toFixed(1)}%`}
                          />
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="space-y-2">
                      {usageStats.modelDistribution.map((m, i) => {
                        const colors = [
                          "#d97757",
                          "#6a9bcc",
                          "#788c5d",
                          "#b0aea5",
                        ];
                        return (
                          <div
                            key={m.model}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{
                                  backgroundColor: colors[i % colors.length],
                                }}
                              />
                              <span className="text-xs text-[#b0aea5] truncate max-w-[120px]">
                                {m.model}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-[#faf9f5]">
                              {m.percentage.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <p className="text-sm text-[#b0aea5]">
              {remotes.length === 0
                ? "Add a remote to view analytics"
                : "Select a remote to view analytics"}
            </p>
          </div>
        )}
      </div>

      {/* ─── Work Rhythm Heatmap ─────────────────────────────────────────── */}
      <div>
        <h2
          className="text-lg font-semibold text-[#faf9f5] mb-3"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          Work Rhythm
        </h2>

        {analyticsLoading ? (
          <div className="flex items-center justify-center py-12 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <div className="flex items-center gap-3 text-[#b0aea5]">
              <div className="w-5 h-5 border-2 border-[#d97757] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading heatmap...</span>
            </div>
          </div>
        ) : heatmapData ? (
          <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
            <div className="flex gap-2">
              {/* Day labels */}
              <div className="flex flex-col gap-[3px] pt-6">
                {DAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="h-4 flex items-center text-[10px] text-[#b0aea5] pr-2"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-x-auto">
                {/* Hour labels */}
                <div className="flex gap-[3px] mb-1">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="w-4 text-center text-[10px] text-[#b0aea5]"
                    >
                      {h % 3 === 0 ? h : ""}
                    </div>
                  ))}
                </div>

                {/* Cells */}
                {Array.from({ length: 7 }, (_, day) => (
                  <div key={day} className="flex gap-[3px] mb-[3px]">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = heatmapData.cells.find(
                        (c) => c.day === day && c.hour === hour
                      );
                      const count = cell?.count ?? 0;
                      const intensity = heatmapIntensity(count);
                      return (
                        <div
                          key={hour}
                          className="w-4 h-4 rounded-sm transition-colors"
                          style={{
                            backgroundColor:
                              count === 0
                                ? "#2a2a28"
                                : `rgba(217, 119, 87, ${Math.max(0.15, intensity)})`,
                          }}
                          title={`${DAY_LABELS[day]} ${hour}:00 -- ${count} session${count !== 1 ? "s" : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}

                {/* Scale legend */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] text-[#b0aea5]">Less</span>
                  {[0, 0.25, 0.5, 0.75, 1].map((level) => (
                    <div
                      key={level}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        backgroundColor:
                          level === 0
                            ? "#2a2a28"
                            : `rgba(217, 119, 87, ${Math.max(0.15, level)})`,
                      }}
                    />
                  ))}
                  <span className="text-[10px] text-[#b0aea5]">More</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]">
            <p className="text-sm text-[#b0aea5]">
              {remotes.length === 0
                ? "Add a remote to view work rhythm"
                : "Select a remote to view work rhythm"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
