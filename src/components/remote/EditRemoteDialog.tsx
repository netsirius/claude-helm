import { useState } from "react";
import { X } from "lucide-react";
import { useRemoteStore } from "../../stores/remoteStore";
import type { Remote } from "../../stores/remoteStore";

interface EditRemoteDialogProps {
  open: boolean;
  onClose: () => void;
  remote: Remote;
}

export default function EditRemoteDialog({ open, onClose, remote }: EditRemoteDialogProps) {
  const update = useRemoteStore((s) => s.update);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(remote.name);
  const [host, setHost] = useState(remote.host);
  const [user, setUser] = useState(remote.user);
  const [sshKeyPath, setSshKeyPath] = useState(remote.sshKeyPath);
  const [port, setPort] = useState(String(remote.port));
  const [tags, setTags] = useState(remote.tags.join(", "));
  const [group, setGroup] = useState(remote.group);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await update(remote.id, {
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
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 text-sm bg-[#1e1e1c] border border-[#2a2a28] rounded-lg text-[#faf9f5] placeholder:text-[#b0aea5]/60 focus:outline-none focus:ring-2 focus:ring-[#d97757] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[#141413]/80"
        onClick={onClose}
      />
      <div className="relative bg-[#1e1e1c] border border-[#2a2a28] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#faf9f5]">Edit Remote</h2>
          <button
            onClick={onClose}
            className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

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

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-[#b0aea5] hover:text-[#faf9f5] bg-[#2a2a28] hover:bg-[#3a3a37] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !host.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
