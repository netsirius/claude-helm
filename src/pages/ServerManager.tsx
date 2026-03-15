import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Server } from "lucide-react";
import { useServerStore } from "../stores/serverStore";
import type { Server as ServerType } from "../stores/serverStore";
import ServerCard from "../components/server/ServerCard";
import AddServerDialog from "../components/server/AddServerDialog";
import EditServerDialog from "../components/server/EditServerDialog";

export default function ServerManager() {
  const { servers, loading, fetch } = useServerStore();
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerType | null>(null);

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

    for (const server of filtered) {
      if (server.group) {
        if (!groups[server.group]) groups[server.group] = [];
        groups[server.group].push(server);
      } else {
        ungrouped.push(server);
      }
    }

    return { ungrouped, groups };
  }, [filtered]);

  const isEmpty = servers.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Server Manager</h1>
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
            Add Server
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <Server size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Add your first server
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            Connect a remote server to start managing Claude sessions.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={16} />
            Add Server
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.ungrouped.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {grouped.ungrouped.map((server) => (
                <ServerCard key={server.id} server={server} onEdit={setEditingServer} />
              ))}
            </div>
          )}

          {Object.entries(grouped.groups).map(([groupName, serverItems]) => (
            <div key={groupName}>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {groupName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {serverItems.map((server) => (
                  <ServerCard key={server.id} server={server} onEdit={setEditingServer} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddServerDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      {editingServer && (
        <EditServerDialog
          open={true}
          onClose={() => setEditingServer(null)}
          server={editingServer}
        />
      )}
    </div>
  );
}
