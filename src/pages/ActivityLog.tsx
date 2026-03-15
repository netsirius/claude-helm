import { ScrollText, Trash2 } from "lucide-react";
import { useActivityStore } from "../stores/activityStore";

export default function ActivityLog() {
  const { entries, clear } = useActivityStore();

  const isEmpty = entries.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Activity Log</h1>
        {!isEmpty && (
          <button
            onClick={clear}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <Trash2 size={16} />
            Clear
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-zinc-900 rounded-2xl mb-4">
            <ScrollText size={32} className="text-zinc-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">
            No activity yet
          </h2>
          <p className="text-sm text-zinc-400">
            Commands executed on your servers will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900"
            >
              <span className="text-xs text-zinc-500 whitespace-nowrap min-w-[140px]">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
              <span className="text-sm text-zinc-300 min-w-[100px]">
                {entry.serverName}
              </span>
              <span className="text-sm text-zinc-200 font-mono flex-1 truncate">
                {entry.command}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                  entry.status === "success"
                    ? "bg-emerald-400/10 text-emerald-400"
                    : "bg-red-400/10 text-red-400"
                }`}
              >
                {entry.status}
              </span>
              {entry.error && (
                <span className="text-xs text-red-400 truncate max-w-[200px]" title={entry.error}>
                  {entry.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
