import { useState } from "react";
import { X } from "lucide-react";
import { useVpsStore } from "../../stores/vpsStore";

interface AddVpsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddVpsDialog({ open, onClose }: AddVpsDialogProps) {
  const add = useVpsStore((s) => s.add);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("root");
  const [sshKeyPath, setSshKeyPath] = useState("~/.ssh/id_ed25519");
  const [port, setPort] = useState("22");
  const [tags, setTags] = useState("");
  const [group, setGroup] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await add({
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
    onClose();
  };

  const inputClass =
    "w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={resetAndClose}
      />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add VPS</h2>
          <button
            onClick={resetAndClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-server"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
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
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                User
              </label>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
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
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              SSH Key Path
            </label>
            <input
              value={sshKeyPath}
              onChange={(e) => setSshKeyPath(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
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
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Group
            </label>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="production"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !host.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add VPS"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
