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
      return <Folder size={16} className="text-[#d97757]" />;
    case "symlink":
      return <Link2 size={16} className="text-[#6a9bcc]" />;
    default:
      return <File size={16} className="text-[#b0aea5]" />;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/80">
      <div className="bg-[#1e1e1c] border border-[#3a3a37] rounded-xl w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a28]">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-[#d97757]" />
            <h2 className="text-sm font-semibold text-[#faf9f5]">
              Browse Remote Directory
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Path bar */}
        <div className="px-4 py-2 border-b border-[#2a2a28] flex items-center gap-2">
          <button
            onClick={goUp}
            disabled={currentPath === "/" || currentPath === "~"}
            className="p-1.5 rounded-lg bg-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] hover:bg-[#3a3a37] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go up"
          >
            <ArrowUp size={14} />
          </button>

          <form onSubmit={handlePathSubmit} className="flex-1">
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#1e1e1c] border border-[#2a2a28] text-[#faf9f5] text-xs font-mono focus:outline-none focus:border-[#d97757]"
              placeholder="/path/to/directory"
            />
          </form>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-1.5 flex items-center gap-1 text-xs text-[#b0aea5] overflow-x-auto">
          <button
            onClick={() => loadDir(currentPath.startsWith("~") ? "~" : "/")}
            className="hover:text-[#faf9f5] transition-colors"
          >
            {currentPath.startsWith("~") ? "~" : "/"}
          </button>
          {breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-[#b0aea5]/60" />
              <button
                onClick={() => {
                  const prefix = currentPath.startsWith("~") ? "~/" : "/";
                  const target = prefix + breadcrumbs.slice(0, i + 1).join("/");
                  loadDir(target.replace("~/", "~/")); // preserve tilde
                }}
                className="hover:text-[#faf9f5] transition-colors"
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
              <Loader2 size={20} className="animate-spin text-[#b0aea5]" />
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-[#c45c4a]">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#b0aea5]/60">
              Empty directory
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#b0aea5]/60 border-b border-[#2a2a28]">
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
                    className="border-b border-[#2a2a28]/50 hover:bg-[#2a2a28]/50 transition-colors"
                  >
                    <td className="px-4 py-1.5">
                      {entry.entryType === "directory" ? (
                        <button
                          onClick={() => navigateTo(entry.name)}
                          className="flex items-center gap-2 text-[#faf9f5] hover:text-[#d97757] transition-colors"
                        >
                          {entryIcon(entry.entryType)}
                          {entry.name}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 text-[#e8e6dc]">
                          {entryIcon(entry.entryType)}
                          {entry.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right text-[#b0aea5]/60 font-mono">
                      {entry.entryType === "directory"
                        ? "-"
                        : formatSize(entry.size)}
                    </td>
                    <td className="px-4 py-1.5 text-[#b0aea5]/60 font-mono">
                      {entry.permissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#2a2a28] flex items-center justify-between">
          <span className="text-xs text-[#b0aea5]/60 font-mono truncate max-w-[300px]">
            {currentPath}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2a2a28] hover:bg-[#3a3a37] text-[#e8e6dc] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(currentPath)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors"
            >
              Select This Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
