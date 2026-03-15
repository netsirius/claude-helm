import { useState } from "react";
import { X, Loader2, Download } from "lucide-react";
import { useRemoteStore } from "../../stores/remoteStore";
import { tauriInvoke } from "../../lib/tauri";

interface AddRemoteDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddRemoteDialog({ open, onClose }: AddRemoteDialogProps) {
  const add = useRemoteStore((s) => s.add);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("root");
  const [sshKeyPath, setSshKeyPath] = useState("~/.ssh/id_ed25519");
  const [port, setPort] = useState("22");
  const [tags, setTags] = useState("");
  const [group, setGroup] = useState("");
  const [installClaude, setInstallClaude] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await add({
        name: name.trim(),
        host: host.trim(),
        user: user.trim(),
        sshKeyPath: sshKeyPath.trim(),
        port: parseInt(port, 10) || 22,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        group: group.trim() || undefined,
      });

      if (installClaude) {
        setInstalling(true);
        setInstallStatus("Testing connection...");
        try {
          await tauriInvoke("test_remote_connection", { id: created.id });
          setInstallStatus("Installing Claude...");
          await tauriInvoke("install_claude_remote", { remoteId: created.id });
          setInstallStatus("Claude installed successfully!");
          // Brief pause to show success before closing
          await new Promise((r) => setTimeout(r, 1200));
        } catch (e) {
          alert(`Remote added but Claude install failed: ${e}`);
        } finally {
          setInstalling(false);
          setInstallStatus("");
        }
      }

      resetAndClose();
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setName("");
    setHost("");
    setUser("root");
    setSshKeyPath("~/.ssh/id_ed25519");
    setPort("22");
    setTags("");
    setGroup("");
    setInstallClaude(false);
    setInstalling(false);
    setInstallStatus("");
    onClose();
  };

  const inputClass =
    "w-full px-3 py-2 text-sm bg-[#1e1e1c] border border-[#2a2a28] rounded-lg text-[#faf9f5] placeholder:text-[#b0aea5]/60 focus:outline-none focus:ring-2 focus:ring-[#d97757] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[#141413]/80"
        onClick={!installing ? resetAndClose : undefined}
      />
      <div className="relative bg-[#1e1e1c] border border-[#2a2a28] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#faf9f5]">Add Remote</h2>
          <button
            onClick={resetAndClose}
            disabled={installing}
            className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {installing ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={32} className="animate-spin text-[#6a9bcc]" />
            <p className="text-sm text-[#b0aea5]">{installStatus}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-remote"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                Host
              </label>
              <input
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100 or example.com"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                  User
                </label>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                  Port
                </label>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  type="number"
                  min={1}
                  max={65535}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                SSH Key Path
              </label>
              <input
                value={sshKeyPath}
                onChange={(e) => setSshKeyPath(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                Tags (comma-separated)
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="prod, gpu, us-east"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1">
                Group
              </label>
              <input
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="production"
                className={inputClass}
              />
            </div>

            {/* Install Claude checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={installClaude}
                onChange={(e) => setInstallClaude(e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2a28] bg-[#1e1e1c] text-[#d97757] focus:ring-[#d97757] focus:ring-offset-0 cursor-pointer"
              />
              <div className="flex items-center gap-1.5">
                <Download size={14} className="text-[#b0aea5] group-hover:text-[#d97757] transition-colors" />
                <span className="text-xs text-[#b0aea5] group-hover:text-[#faf9f5] transition-colors">
                  Install Claude on this remote
                </span>
              </div>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-4 py-2 text-sm font-medium rounded-lg text-[#b0aea5] hover:text-[#faf9f5] bg-[#2a2a28] hover:bg-[#3a3a37] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim() || !host.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add Remote"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
