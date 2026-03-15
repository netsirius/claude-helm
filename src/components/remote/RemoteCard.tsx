import { useState, useEffect } from "react";
import {
  Server as ServerIcon,
  Trash2,
  Loader2,
  Wifi,
  Pencil,
  Settings,
  Download,
  AlertCircle,
  ArrowUpCircle,
  Wrench,
} from "lucide-react";
import type { Remote } from "../../stores/remoteStore";
import { useRemoteStore } from "../../stores/remoteStore";
import { tauriInvoke } from "../../lib/tauri";
import ClaudeSettingsEditor from "./ClaudeSettingsEditor";
import RemoteAdminPanel from "./RemoteAdminPanel";

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

interface UpdateResult {
  updated: boolean;
  oldVersion: string;
  newVersion: string;
  message: string;
}

interface RemoteCardProps {
  remote: Remote;
  onEdit?: (remote: Remote) => void;
}

const statusColor: Record<string, string> = {
  online: "bg-[#788c5d]",
  offline: "bg-[#c45c4a]",
  unknown: "bg-[#b0aea5]",
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
  const [updating, setUpdating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [updateNotification, setUpdateNotification] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);
  const testConnection = useRemoteStore((s) => s.testConnection);
  const remove = useRemoteStore((s) => s.remove);

  // Auto-probe on mount if remote is online
  useEffect(() => {
    if (remote.status === "online" && !probed) {
      tauriInvoke<ProbeResult>("probe_remote", { id: remote.id })
        .then((probe) => { setProbeResult(probe); setProbed(true); })
        .catch(() => { setProbed(true); });
    }
  }, [remote.id, remote.status, probed]);

  // Auto-fade update notification
  useEffect(() => {
    if (!updateNotification) return;
    const duration = updateNotification.type === "success" ? 5000 : 3000;
    const timer = setTimeout(() => setUpdateNotification(null), duration);
    return () => clearTimeout(timer);
  }, [updateNotification]);

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

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateNotification(null);
    try {
      const result = await tauriInvoke<UpdateResult>("update_claude_remote", {
        remoteId: remote.id,
      });
      // Re-probe to get fresh data
      const probe = await tauriInvoke<ProbeResult>("probe_remote", {
        id: remote.id,
      });
      setProbeResult(probe);
      setUpdateNotification({
        message: result.message,
        type: result.updated ? "success" : "info",
      });
    } catch (e) {
      setUpdateNotification({
        message: `Update failed: ${e}`,
        type: "info",
      });
    } finally {
      setUpdating(false);
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
  const claudeInstalled = probed && probeResult?.claudePath;

  return (
    <>
      <div className="bg-[#1e1e1c] border border-[#2a2a28] rounded-xl p-4 flex flex-col gap-3 hover:border-[#3a3a37] transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#2a2a28] rounded-lg">
              <ServerIcon size={20} className="text-[#b0aea5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#faf9f5]">
                {remote.name}
              </h3>
              <p className="text-xs text-[#b0aea5]">
                {remote.user}@{remote.host}:{remote.port}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${statusColor[remote.status]}`}
            />
            <span className="text-xs text-[#b0aea5]">
              {statusLabel[remote.status]}
            </span>
          </div>
        </div>

        {remote.group && (
          <p className="text-xs text-[#b0aea5]/60">
            Group: <span className="text-[#b0aea5]">{remote.group}</span>
          </p>
        )}

        {remote.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {remote.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-full bg-[#2a2a28] text-[#b0aea5]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Claude not installed badge */}
        {claudeNotInstalled && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#c45c4a]/10 border border-[#c45c4a]/20">
            <AlertCircle size={14} className="text-[#c45c4a]" />
            <span className="text-xs text-[#c45c4a]">Not installed</span>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
            >
              {installing ? (
                <Loader2 size={12} className="animate-spin text-[#6a9bcc]" />
              ) : (
                <Download size={12} />
              )}
              Install
            </button>
          </div>
        )}

        {/* Claude installed badge with version and check updates button */}
        {claudeInstalled && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#788c5d]/10 border border-[#788c5d]/20">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#788c5d]">
                Claude {probeResult?.claudeVersion || "installed"}
              </span>
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#2a2a28] hover:bg-[#3a3a37] text-[#b0aea5] hover:text-[#faf9f5] transition-colors disabled:opacity-50"
                title="Check for updates"
              >
                {updating ? (
                  <Loader2 size={12} className="animate-spin text-[#6a9bcc]" />
                ) : (
                  <ArrowUpCircle size={12} />
                )}
                {updating ? "Checking..." : "Check Updates"}
              </button>
            </div>

            {/* Inline update notification */}
            {updateNotification && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity ${
                  updateNotification.type === "success"
                    ? "bg-[#d97757]/10 border border-[#d97757]/20 text-[#d97757]"
                    : "bg-[#788c5d]/10 border border-[#788c5d]/20 text-[#788c5d]"
                }`}
              >
                {updateNotification.message}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[#2a2a28]">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => setAdminOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <Wrench size={14} />
            Manage
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <Settings size={14} />
            Settings
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#c45c4a]/20 hover:text-[#c45c4a] text-[#b0aea5] transition-colors ml-auto"
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

      <RemoteAdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        remoteId={remote.id}
        remoteName={remote.name}
      />
    </>
  );
}
