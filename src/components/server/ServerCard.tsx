import { useState } from "react";
import { Server as ServerIcon, Trash2, Loader2, Wifi, Pencil } from "lucide-react";
import type { Server } from "../../stores/serverStore";
import { useServerStore } from "../../stores/serverStore";

interface ServerCardProps {
  server: Server;
  onEdit?: (server: Server) => void;
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

export default function ServerCard({ server, onEdit }: ServerCardProps) {
  const [testing, setTesting] = useState(false);
  const testConnection = useServerStore((s) => s.testConnection);
  const remove = useServerStore((s) => s.remove);

  const handleTest = async () => {
    setTesting(true);
    try {
      await testConnection(server.id);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete server "${server.name}"?`)) return;
    await remove(server.id);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <ServerIcon size={20} className="text-zinc-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{server.name}</h3>
            <p className="text-xs text-zinc-400">
              {server.user}@{server.host}:{server.port}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${statusColor[server.status]}`}
          />
          <span className="text-xs text-zinc-400">
            {statusLabel[server.status]}
          </span>
        </div>
      </div>

      {server.group && (
        <p className="text-xs text-zinc-500">
          Group: <span className="text-zinc-400">{server.group}</span>
        </p>
      )}

      {server.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {server.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
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
          onClick={() => onEdit?.(server)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        >
          <Pencil size={14} />
          Edit
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
  );
}
