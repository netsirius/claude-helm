import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Server } from "lucide-react";
import { useVpsStore } from "../stores/vpsStore";
import VpsCard from "../components/vps/VpsCard";
import AddVpsDialog from "../components/vps/AddVpsDialog";

export default function VpsManager() {
  const { servers, loading, fetch } = useVpsStore();
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return servers;
    const q = filter.toLowerCase();
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [servers, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    const ungrouped: typeof filtered = [];

    for (const vps of filtered) {
      if (vps.group) {
        if (!groups[vps.group]) groups[vps.group] = [];
        groups[vps.group].push(vps);
      } else {
        ungrouped.push(vps);
      }
    }

    return { ungrouped, groups };
  }, [filtered]);

  const isEmpty = servers.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">VPS Manager</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter servers..."
              className="pl-9 pr-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent w-56"
            />
          </div>
          <button
            onClick={fetch}
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
            Add VPS
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <Server size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Add your first VPS
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Connect a remote server to start managing Claude sessions.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={16} />
            Add VPS
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.ungrouped.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {grouped.ungrouped.map((vps) => (
                <VpsCard key={vps.id} vps={vps} />
              ))}
            </div>
          )}

          {Object.entries(grouped.groups).map(([groupName, vpsItems]) => (
            <div key={groupName}>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {groupName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {vpsItems.map((vps) => (
                  <VpsCard key={vps.id} vps={vps} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddVpsDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
