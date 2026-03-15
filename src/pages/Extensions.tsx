import { useEffect, useState } from "react";
import { RefreshCw, Puzzle, ChevronDown, AlertTriangle } from "lucide-react";
import { useRemoteStore } from "../stores/remoteStore";
import { tauriInvoke } from "../lib/tauri";

interface Extension {
  extType: "mcp" | "skill" | "plugin" | "agent";
  name: string;
  version: string;
  enabled: boolean;
  config: unknown;
}

const TABS = [
  { key: "mcp" as const, label: "MCPs" },
  { key: "skill" as const, label: "Skills" },
  { key: "plugin" as const, label: "Plugins" },
  { key: "agent" as const, label: "Agents" },
];

export default function Extensions() {
  const { remotes, fetch: fetchRemotes } = useRemoteStore();
  const [selectedRemoteId, setSelectedRemoteId] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Extension["extType"]>("mcp");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetchRemotes();
  }, [fetchRemotes]);

  const loadExtensions = async (remoteId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await tauriInvoke<Extension[]>("list_remote_extensions", {
        remoteId,
      });
      setExtensions(result);
    } catch (err) {
      setExtensions([]);
      setError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Failed to load extensions",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRemote = (remoteId: string) => {
    setSelectedRemoteId(remoteId);
    setDropdownOpen(false);
    loadExtensions(remoteId);
  };

  const selectedRemote = remotes.find((s) => s.id === selectedRemoteId);
  const filtered = extensions.filter((e) => e.extType === activeTab);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#faf9f5]">Extensions</h1>

        <div className="flex items-center gap-3">
          {/* Remote Selector */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#e8e6dc] hover:bg-[#2a2a28] transition-colors min-w-[180px] justify-between"
            >
              <span className="truncate">
                {selectedRemote ? selectedRemote.name : "Select remote..."}
              </span>
              <ChevronDown size={14} className="flex-shrink-0 text-[#b0aea5]/60" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[#1e1e1c] border border-[#2a2a28] rounded-xl shadow-xl z-50 overflow-hidden">
                {remotes.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[#b0aea5]">
                    No remotes configured
                  </div>
                ) : (
                  remotes.map((remote) => (
                    <button
                      key={remote.id}
                      onClick={() => handleSelectRemote(remote.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#2a2a28] transition-colors ${
                        remote.id === selectedRemoteId ? "bg-[#2a2a28]/50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#faf9f5] truncate">
                          {remote.name}
                        </div>
                        <div className="text-xs text-[#b0aea5]/60 truncate">
                          {remote.host}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => selectedRemoteId && loadExtensions(selectedRemoteId)}
            disabled={!selectedRemoteId || loading}
            className="p-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#2a2a28] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#c45c4a]/10 border border-[#c45c4a]/20 text-[#c45c4a]">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs text-[#c45c4a]/70 hover:text-[#c45c4a] transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* No remote selected */}
      {!selectedRemoteId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-[#1e1e1c] rounded-2xl mb-4">
            <Puzzle size={32} className="text-[#b0aea5]" />
          </div>
          <h2 className="text-lg font-semibold text-[#faf9f5] mb-1">
            Select a remote
          </h2>
          <p className="text-sm text-[#b0aea5]">
            Choose a remote to view its installed extensions.
          </p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 bg-[#1e1e1c] p-1 rounded-lg border border-[#2a2a28] w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? "bg-[#2a2a28] text-[#faf9f5]"
                    : "text-[#b0aea5] hover:text-[#e8e6dc]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Extension list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-[#b0aea5]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-[#b0aea5]">
                No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()}{" "}
                found on this remote.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((ext) => (
                <div
                  key={ext.name}
                  className="flex items-center justify-between px-4 py-3 bg-[#1e1e1c] border border-[#2a2a28] rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-[#2a2a28] rounded-lg">
                      <Puzzle size={16} className="text-[#b0aea5]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-[#faf9f5] truncate">
                        {ext.name}
                      </h3>
                      <p className="text-xs text-[#b0aea5]/60">{ext.version}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${
                      ext.enabled
                        ? "bg-[#788c5d]/10 text-[#788c5d]"
                        : "bg-[#b0aea5]/10 text-[#b0aea5]"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        ext.enabled ? "bg-[#788c5d]" : "bg-[#b0aea5]"
                      }`}
                    />
                    {ext.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
