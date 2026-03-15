import { ScrollText, Trash2 } from "lucide-react";
import { useActivityStore } from "../stores/activityStore";

export default function ActivityLog() {
  const { entries, clear } = useActivityStore();

  const isEmpty = entries.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#faf9f5]">Activity Log</h1>
        {!isEmpty && (
          <button
            onClick={clear}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#b0aea5] hover:text-[#c45c4a] hover:bg-[#2a2a28] transition-colors"
          >
            <Trash2 size={16} />
            Clear
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-[#1e1e1c] rounded-2xl mb-4">
            <ScrollText size={32} className="text-[#b0aea5]" />
          </div>
          <h2 className="text-lg font-semibold text-[#faf9f5] mb-1">
            No activity yet
          </h2>
          <p className="text-sm text-[#b0aea5]">
            Commands executed on your remotes will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[#2a2a28] bg-[#1e1e1c]"
            >
              <span className="text-xs text-[#b0aea5]/60 whitespace-nowrap min-w-[140px]">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
              <span className="text-sm text-[#e8e6dc] min-w-[100px]">
                {entry.remoteName}
              </span>
              <span className="text-sm text-[#faf9f5] font-mono flex-1 truncate">
                {entry.command}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                  entry.status === "success"
                    ? "bg-[#788c5d]/10 text-[#788c5d]"
                    : "bg-[#c45c4a]/10 text-[#c45c4a]"
                }`}
              >
                {entry.status}
              </span>
              {entry.error && (
                <span className="text-xs text-[#c45c4a] truncate max-w-[200px]" title={entry.error}>
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
