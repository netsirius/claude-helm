import { useState, useEffect, useCallback } from "react";
import { Settings, Terminal, RefreshCw, Power, PowerOff, Loader2, Plug } from "lucide-react";
import { tauriInvoke } from "../lib/tauri";

interface SettingRow {
  label: string;
  value: string;
}

interface McpStatus {
  running: boolean;
  pid: number | null;
  registered: boolean;
}

function SettingSection({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  rows: SettingRow[];
}) {
  return (
    <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-[#b0aea5]" />
        <h2 className="text-base font-semibold text-[#faf9f5]">{title}</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-2 border-b border-[#2a2a28] last:border-0"
          >
            <span className="text-sm text-[#b0aea5]">{row.label}</span>
            <span className="text-sm text-[#faf9f5] font-mono">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function McpSection() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await tauriInvoke<McpStatus>("mcp_server_status");
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-fade message
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const msg = await tauriInvoke<string>("start_mcp_server");
      setMessage(msg);
      await fetchStatus();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const msg = await tauriInvoke<string>("stop_mcp_server");
      setMessage(msg);
      await fetchStatus();
    } catch (e) {
      setMessage(`Error: ${e}`);
    }
    setLoading(false);
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="rounded-xl border border-[#2a2a28] bg-[#1e1e1c] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Plug size={18} className="text-[#b0aea5]" />
        <h2 className="text-base font-semibold text-[#faf9f5]">MCP Server</h2>
      </div>

      <p className="text-xs text-[#b0aea5] mb-4">
        The MCP server allows Claude Code to manage your remotes, agents, and sessions directly.
        When enabled, you can ask Claude to "list my agents" or "start the Deploy-Bot".
      </p>

      <div className="flex items-center justify-between py-3 border-b border-[#2a2a28]">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${isRunning ? "bg-[#788c5d]" : "bg-[#c45c4a]"}`} />
          <span className="text-sm text-[#faf9f5]">
            {isRunning ? "Running" : "Stopped"}
          </span>
          {status?.pid && (
            <span className="text-xs text-[#b0aea5] font-mono">PID {status.pid}</span>
          )}
        </div>

        <button
          onClick={isRunning ? handleStop : handleStart}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            isRunning
              ? "bg-[#c45c4a]/20 hover:bg-[#c45c4a]/40 text-[#c45c4a]"
              : "bg-[#788c5d]/20 hover:bg-[#788c5d]/40 text-[#788c5d]"
          }`}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isRunning ? (
            <PowerOff size={16} />
          ) : (
            <Power size={16} />
          )}
          {isRunning ? "Stop MCP" : "Start MCP"}
        </button>
      </div>

      <div className="flex items-center justify-between py-3 border-b border-[#2a2a28]">
        <span className="text-sm text-[#b0aea5]">Registered in Claude Code</span>
        <span className={`text-sm font-mono ${status?.registered ? "text-[#788c5d]" : "text-[#b0aea5]"}`}>
          {status?.registered ? "Yes" : "No"}
        </span>
      </div>

      <div className="flex items-center justify-between py-3">
        <span className="text-sm text-[#b0aea5]">Tools available</span>
        <span className="text-sm text-[#faf9f5] font-mono">13</span>
      </div>

      {message && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
          message.startsWith("Error")
            ? "bg-[#c45c4a]/10 text-[#c45c4a]"
            : "bg-[#788c5d]/10 text-[#788c5d]"
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const sshSettings: SettingRow[] = [
    { label: "Connection timeout", value: "10s" },
    { label: "Idle disconnect", value: "60s" },
    { label: "Retry attempts", value: "3" },
  ];

  const generalSettings: SettingRow[] = [
    { label: "Auto-refresh interval", value: "30s" },
    { label: "Theme", value: "Dark (Anthropic)" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-[#b0aea5]" />
        <h1 className="text-2xl font-bold text-[#faf9f5]">Settings</h1>
      </div>

      <McpSection />
      <SettingSection title="SSH" icon={Terminal} rows={sshSettings} />
      <SettingSection title="General" icon={RefreshCw} rows={generalSettings} />
    </div>
  );
}
