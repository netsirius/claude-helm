import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Server } from "lucide-react";
import { useRemoteStore } from "../stores/remoteStore";
import type { Remote } from "../stores/remoteStore";
import RemoteCard from "../components/remote/RemoteCard";
import AddRemoteDialog from "../components/remote/AddRemoteDialog";
import EditRemoteDialog from "../components/remote/EditRemoteDialog";

export default function RemoteManager() {
  const { remotes, loading, fetch } = useRemoteStore();
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRemote, setEditingRemote] = useState<Remote | null>(null);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return remotes;
    const q = filter.toLowerCase();
    return remotes.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [remotes, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    const ungrouped: typeof filtered = [];

    for (const remote of filtered) {
      if (remote.group) {
        if (!groups[remote.group]) groups[remote.group] = [];
        groups[remote.group].push(remote);
      } else {
        ungrouped.push(remote);
      }
    }

    return { ungrouped, groups };
  }, [filtered]);

  const isEmpty = remotes.length === 0 && !loading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#faf9f5]">Remote Manager</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b0aea5]/60"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter remotes..."
              className="pl-9 pr-3 py-2 text-sm bg-[#1e1e1c] border border-[#2a2a28] rounded-lg text-[#faf9f5] placeholder:text-[#b0aea5]/60 focus:outline-none focus:ring-2 focus:ring-[#d97757] focus:border-transparent w-56"
            />
          </div>
          <button
            onClick={fetch}
            disabled={loading}
            className="p-2 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#2a2a28] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
          >
            <Plus size={16} />
            Add Remote
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-[#1e1e1c] rounded-2xl mb-4">
            <Server size={32} className="text-[#b0aea5]" />
          </div>
          <h2 className="text-lg font-semibold text-[#faf9f5] mb-1">
            Add your first remote
          </h2>
          <p className="text-sm text-[#b0aea5] mb-4">
            Connect a remote machine to start managing Claude sessions.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
          >
            <Plus size={16} />
            Add Remote
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.ungrouped.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {grouped.ungrouped.map((remote) => (
                <RemoteCard key={remote.id} remote={remote} onEdit={setEditingRemote} />
              ))}
            </div>
          )}

          {Object.entries(grouped.groups).map(([groupName, remoteItems]) => (
            <div key={groupName}>
              <h2 className="text-sm font-semibold text-[#b0aea5] uppercase tracking-wider mb-3">
                {groupName}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {remoteItems.map((remote) => (
                  <RemoteCard key={remote.id} remote={remote} onEdit={setEditingRemote} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRemoteDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      {editingRemote && (
        <EditRemoteDialog
          open={true}
          onClose={() => setEditingRemote(null)}
          remote={editingRemote}
        />
      )}
    </div>
  );
}
