import { useState } from "react";
import { X } from "lucide-react";
import { useAgentStore } from "../../stores/agentStore";
import type { Remote } from "../../stores/remoteStore";

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  remoteList: Remote[];
}

const ICONS = [
  "\u{1F916}", // robot
  "\u{1F680}", // rocket
  "\u{1F527}", // wrench
  "\u{1F4E6}", // package
  "\u{1F50D}", // magnifying glass
  "\u{1F6E1}\uFE0F", // shield
  "\u{1F4CA}", // bar chart
  "\u{1F9EA}", // test tube
];

const COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
];

const MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Sonnet" },
  { value: "claude-opus-4-20250514", label: "Opus" },
  { value: "claude-haiku-4-20250514", label: "Haiku" },
];

export default function CreateAgentDialog({
  open,
  onClose,
  remoteList,
}: CreateAgentDialogProps) {
  const add = useAgentStore((s) => s.add);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [model, setModel] = useState(MODELS[0].value);
  const [remoteId, setRemoteId] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await add(name.trim(), role.trim(), {
        icon,
        color,
        defaultModel: model,
        assignedRemoteId: remoteId || undefined,
      });
      resetAndClose();
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setName("");
    setRole("");
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setModel(MODELS[0].value);
    setRemoteId("");
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
          <h2 className="text-lg font-semibold text-white">New Agent</h2>
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
              placeholder="coder-1"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Role
            </label>
            <input
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="backend-dev"
              className={inputClass}
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              Icon
            </label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-colors ${
                    icon === ic
                      ? "bg-indigo-600/30 ring-2 ring-indigo-500"
                      : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={inputClass}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Remote selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Remote
            </label>
            <select
              value={remoteId}
              onChange={(e) => setRemoteId(e.target.value)}
              className={inputClass}
            >
              <option value="">None (assign later)</option>
              {remoteList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.host})
                </option>
              ))}
            </select>
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
              disabled={submitting || !name.trim() || !role.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
