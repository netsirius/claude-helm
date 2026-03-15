import { useEffect, useState } from "react";
import { RefreshCw, Puzzle, ChevronDown } from "lucide-react";
import { useVpsStore } from "../stores/vpsStore";
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
  const { servers, fetch: fetchVps } = useVpsStore();
  const [selectedVpsId, setSelectedVpsId] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Extension["extType"]>("mcp");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetchVps();
  }, [fetchVps]);

  const loadExtensions = async (vpsId: string) => {
    setLoading(true);
    try {
      const result = await tauriInvoke<Extension[]>("list_vps_extensions", {
        vpsId,
      });
      setExtensions(result);
    } catch {
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVps = (vpsId: string) => {
    setSelectedVpsId(vpsId);
    setDropdownOpen(false);
    loadExtensions(vpsId);
  };

  const selectedVps = servers.find((s) => s.id === selectedVpsId);
  const filtered = extensions.filter((e) => e.extType === activeTab);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Extensions</h1>

        <div className="flex items-center gap-3">
          {/* VPS Selector */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-w-[180px] justify-between"
            >
              <span className="truncate">
                {selectedVps ? selectedVps.name : "Select VPS..."}
              </span>
              <ChevronDown size={14} className="flex-shrink-0 text-zinc-500" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
                {servers.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-zinc-400">
                    No VPS servers configured
                  </div>
                ) : (
                  servers.map((vps) => (
                    <button
                      key={vps.id}
                      onClick={() => handleSelectVps(vps.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors ${
                        vps.id === selectedVpsId ? "bg-zinc-800/50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {vps.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {vps.host}
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
            onClick={() => selectedVpsId && loadExtensions(selectedVpsId)}
            disabled={!selectedVpsId || loading}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* No VPS selected */}
      {!selectedVpsId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <Puzzle size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Select a VPS
          </h2>
          <p className="text-sm text-zinc-400">
            Choose a VPS server to view its installed extensions.
          </p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.key
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Extension list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={20} className="animate-spin text-zinc-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-zinc-400">
                No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()}{" "}
                found on this VPS.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((ext) => (
                <div
                  key={ext.name}
                  className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-zinc-800 rounded-lg">
                      <Puzzle size={16} className="text-zinc-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">
                        {ext.name}
                      </h3>
                      <p className="text-xs text-zinc-500">{ext.version}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${
                      ext.enabled
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-zinc-500/10 text-zinc-400"
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        ext.enabled ? "bg-emerald-400" : "bg-zinc-500"
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
