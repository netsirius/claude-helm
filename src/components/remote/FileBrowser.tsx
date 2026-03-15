import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  File,
  Link2,
  ChevronRight,
  ArrowUp,
  Loader2,
  X,
  FolderOpen,
} from "lucide-react";
import { tauriInvoke } from "../../lib/tauri";

interface DirEntry {
  name: string;
  entryType: "directory" | "file" | "symlink";
  size: number;
  permissions: string;
}

interface FileBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  remoteId: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} K`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`;
}

function entryIcon(type: string) {
  switch (type) {
    case "directory":
      return <Folder size={16} className="text-amber-400" />;
    case "symlink":
      return <Link2 size={16} className="text-blue-400" />;
    default:
      return <File size={16} className="text-zinc-400" />;
  }
}

export default function FileBrowser({
  open,
  onClose,
  onSelect,
  remoteId,
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("~");
  const [pathInput, setPathInput] = useState("~");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await tauriInvoke<DirEntry[]>("browse_remote_dir", {
          remoteId,
          path,
        });
        // Sort: directories first, then alphabetically
        result.sort((a, b) => {
          if (a.entryType === "directory" && b.entryType !== "directory")
            return -1;
          if (a.entryType !== "directory" && b.entryType === "directory")
            return 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(result);
        setCurrentPath(path);
        setPathInput(path);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [remoteId],
  );

  useEffect(() => {
    if (open) {
      loadDir("~");
    }
  }, [open, loadDir]);

  if (!open) return null;

  const navigateTo = (dirName: string) => {
    const newPath =
      currentPath === "/" ? `/${dirName}` : `${currentPath}/${dirName}`;
    loadDir(newPath);
  };

  const goUp = () => {
    if (currentPath === "/" || currentPath === "~") return;
    const parts = currentPath.split("/");
    parts.pop();
    const parent = parts.join("/") || "/";
    loadDir(parent);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDir(pathInput.trim());
    }
  };

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">
              Browse Remote Directory
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Path bar */}
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
          <button
            onClick={goUp}
            disabled={currentPath === "/" || currentPath === "~"}
            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go up"
          >
            <ArrowUp size={14} />
          </button>

          <form onSubmit={handlePathSubmit} className="flex-1">
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              placeholder="/path/to/directory"
            />
          </form>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-1.5 flex items-center gap-1 text-xs text-zinc-400 overflow-x-auto">
          <button
            onClick={() => loadDir(currentPath.startsWith("~") ? "~" : "/")}
            className="hover:text-white transition-colors"
          >
            {currentPath.startsWith("~") ? "~" : "/"}
          </button>
          {breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-zinc-600" />
              <button
                onClick={() => {
                  const prefix = currentPath.startsWith("~") ? "~/" : "/";
                  const target = prefix + breadcrumbs.slice(0, i + 1).join("/");
                  loadDir(target.replace("~/", "~/")); // preserve tilde
                }}
                className="hover:text-white transition-colors"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-red-400">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              Empty directory
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-right px-4 py-2 font-medium w-20">
                    Size
                  </th>
                  <th className="text-left px-4 py-2 font-medium w-28">
                    Permissions
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.name}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-4 py-1.5">
                      {entry.entryType === "directory" ? (
                        <button
                          onClick={() => navigateTo(entry.name)}
                          className="flex items-center gap-2 text-white hover:text-indigo-400 transition-colors"
                        >
                          {entryIcon(entry.entryType)}
                          {entry.name}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 text-zinc-300">
                          {entryIcon(entry.entryType)}
                          {entry.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right text-zinc-500 font-mono">
                      {entry.entryType === "directory"
                        ? "-"
                        : formatSize(entry.size)}
                    </td>
                    <td className="px-4 py-1.5 text-zinc-500 font-mono">
                      {entry.permissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500 font-mono truncate max-w-[300px]">
            {currentPath}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(currentPath)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Select This Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
