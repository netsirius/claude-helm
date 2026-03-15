import { useState } from "react";
import {
  Server as ServerIcon,
  Trash2,
  Loader2,
  Wifi,
  Pencil,
  Settings,
  Download,
  AlertCircle,
} from "lucide-react";
import type { Remote } from "../../stores/remoteStore";
import { useRemoteStore } from "../../stores/remoteStore";
import { tauriInvoke } from "../../lib/tauri";
import ClaudeSettingsEditor from "./ClaudeSettingsEditor";

interface ProbeResult {
  claudePath: string | null;
  claudeVersion: string | null;
  hasTmux: boolean;
  hasScreen: boolean;
  hasFlock: boolean;
  configDir: string | null;
  settingsFormat: string;
  shell: string;
}

interface RemoteCardProps {
  remote: Remote;
  onEdit?: (remote: Remote) => void;
}

const statusColor: Record<string, string> = {
  online: "bg-emerald-400",
  offline: "bg-red-400",
  unknown: "bg-zinc-500",
};

const statusLabel: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  unknown: "Unknown",
};

export default function RemoteCard({ remote, onEdit }: RemoteCardProps) {
  const [testing, setTesting] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probed, setProbed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const testConnection = useRemoteStore((s) => s.testConnection);
  const remove = useRemoteStore((s) => s.remove);

  const handleTest = async () => {
    setTesting(true);
    try {
      const online = await testConnection(remote.id);
      if (online) {
        // Run probe to discover Claude installation
        try {
          const probe = await tauriInvoke<ProbeResult>("probe_remote", {
            id: remote.id,
          });
          setProbeResult(probe);
          setProbed(true);
        } catch {
          setProbed(true);
          setProbeResult(null);
        }
      }
    } finally {
      setTesting(false);
    }
  };

  const handleInstall = async () => {
    if (
      !window.confirm(
        "Install Claude CLI on this remote? This will run the official install script.",
      )
    )
      return;

    setInstalling(true);
    try {
      const output = await tauriInvoke<string>("install_claude_remote", {
        remoteId: remote.id,
      });
      alert(`Claude installed successfully.\n\n${output.slice(0, 500)}`);
      // Re-probe
      const probe = await tauriInvoke<ProbeResult>("probe_remote", {
        id: remote.id,
      });
      setProbeResult(probe);
    } catch (e) {
      alert(`Install failed: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete remote "${remote.name}"?`,
      )
    )
      return;
    await remove(remote.id);
  };

  const claudeNotInstalled = probed && !probeResult?.claudePath;

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-lg">
              <ServerIcon size={20} className="text-zinc-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {remote.name}
              </h3>
              <p className="text-xs text-zinc-400">
                {remote.user}@{remote.host}:{remote.port}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${statusColor[remote.status]}`}
            />
            <span className="text-xs text-zinc-400">
              {statusLabel[remote.status]}
            </span>
          </div>
        </div>

        {remote.group && (
          <p className="text-xs text-zinc-500">
            Group: <span className="text-zinc-400">{remote.group}</span>
          </p>
        )}

        {remote.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {remote.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Claude status badge */}
        {claudeNotInstalled && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle size={14} className="text-amber-400" />
            <span className="text-xs text-amber-400">Claude not installed</span>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
            >
              {installing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Install
            </button>
          </div>
        )}

        {probed && probeResult?.claudePath && (
          <p className="text-xs text-zinc-500">
            Claude:{" "}
            <span className="text-zinc-400">
              {probeResult.claudeVersion || "installed"}
            </span>
          </p>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-zinc-800">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
          >
            {testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wifi size={14} />
            )}
            Test
          </button>
          <button
            onClick={() => onEdit?.(remote)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <Settings size={14} />
            Claude Settings
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-red-600/20 hover:text-red-400 text-zinc-400 transition-colors ml-auto"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <ClaudeSettingsEditor
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        remoteId={remote.id}
        remoteName={remote.name}
      />
    </>
  );
}
