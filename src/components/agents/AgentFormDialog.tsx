import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useAgentStore, type Agent } from "../../stores/agentStore";
import type { Remote } from "../../stores/remoteStore";

interface AgentFormDialogProps {
  open: boolean;
  onClose: () => void;
  remoteList: Remote[];
  /** When set, the dialog operates in edit mode pre-populated with this agent. */
  editAgent?: Agent | null;
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

const PROMPT_TEMPLATES = [
  {
    label: "None",
    prompt: "",
  },
  {
    label: "Auto-decide",
    prompt: "You are fully autonomous. Never wait for human input. When presented with choices, select the most reasonable option and proceed. When asked for confirmation, confirm and continue. When a plan is ready, execute it immediately. Complete all tasks end-to-end without stopping.",
  },
  {
    label: "Worker",
    prompt: "You are an autonomous agent. Never ask for confirmation \u2014 execute tasks immediately. When given a plan, choose option 1 and proceed. Auto-accept all prompts. Be decisive and complete tasks end-to-end without human interaction.",
  },
  {
    label: "Developer",
    prompt: "You are a senior software developer. Write clean, tested code. Follow existing patterns in the codebase. Run tests after changes. Commit with clear messages. Never ask for confirmation \u2014 just implement.",
  },
  {
    label: "DevOps",
    prompt: "You are a DevOps engineer. Handle deployments, infrastructure, CI/CD pipelines. Be cautious with destructive operations but proceed autonomously. Log all actions clearly.",
  },
  {
    label: "Reviewer",
    prompt: "You are a code reviewer. Analyze code for bugs, security issues, performance problems, and style. Provide actionable feedback. Fix issues directly when possible.",
  },
  {
    label: "Research",
    prompt: "You are a research analyst. Explore codebases, documentation, and APIs. Summarize findings clearly. Produce detailed reports. Never ask for direction \u2014 investigate thoroughly on your own.",
  },
  {
    label: "Custom",
    prompt: "",
  },
];

export default function AgentFormDialog({
  open,
  onClose,
  remoteList,
  editAgent,
}: AgentFormDialogProps) {
  const add = useAgentStore((s) => s.add);
  const update = useAgentStore((s) => s.update);
  const [submitting, setSubmitting] = useState(false);

  const isEditMode = !!editAgent;

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [model, setModel] = useState(MODELS[0].value);
  const [remoteId, setRemoteId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  // Populate fields when editAgent changes
  useEffect(() => {
    if (editAgent) {
      setName(editAgent.name);
      setRole(editAgent.role);
      setIcon(editAgent.icon || ICONS[0]);
      setColor(editAgent.color || COLORS[0]);
      setModel(editAgent.defaultModel || MODELS[0].value);
      setRemoteId(editAgent.assignedRemoteId || "");
      setSystemPrompt(editAgent.claudeMd || "");
      const templateIdx = PROMPT_TEMPLATES.findIndex(
        (t) => t.prompt !== "" && t.prompt === editAgent.claudeMd,
      );
      setSelectedTemplate(templateIdx >= 0 ? templateIdx : PROMPT_TEMPLATES.length - 1);
    } else {
      setName("");
      setRole("");
      setIcon(ICONS[0]);
      setColor(COLORS[0]);
      setModel(MODELS[0].value);
      setRemoteId("");
      setSystemPrompt("");
      setSelectedTemplate(0);
    }
  }, [editAgent, open]);

  if (!open) return null;

  const handleClose = () => {
    setName("");
    setRole("");
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setModel(MODELS[0].value);
    setRemoteId("");
    setSystemPrompt("");
    setSelectedTemplate(0);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEditMode && editAgent) {
        await update(editAgent.id, {
          name: name.trim(),
          role: role.trim(),
          icon,
          color,
          defaultModel: model,
          assignedRemoteId: remoteId || undefined,
          claudeMd: systemPrompt.trim() || undefined,
        });
      } else {
        await add(name.trim(), role.trim(), {
          icon,
          color,
          defaultModel: model,
          assignedRemoteId: remoteId || undefined,
          claudeMd: systemPrompt.trim() || undefined,
        });
      }
      handleClose();
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
        onClick={handleClose}
      />
      <div className="relative bg-[#1e1e1c] border border-[#2a2a28] rounded-xl w-full max-w-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#faf9f5]">
            {isEditMode ? "Edit Agent" : "New Agent"}
          </h2>
          <button
            onClick={handleClose}
            className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[#b0aea5] mb-1.5">
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

          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-[#b0aea5] mb-1.5">
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

          {/* Icon */}
          <div>
            <label className="block text-xs font-medium text-[#b0aea5] mb-2">
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
                      ? "bg-[#d97757]/30 ring-2 ring-[#d97757]"
                      : "bg-[#2a2a28] hover:bg-[#3a3a37]"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-[#b0aea5] mb-2">
              Color
            </label>
            <div className="flex gap-2.5 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-offset-[#1e1e1c] ring-[#faf9f5] scale-110"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Model + Remote side by side */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1.5">
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
            <div>
              <label className="block text-xs font-medium text-[#b0aea5] mb-1.5">
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
          </div>

          {/* Behavior section with visual separator */}
          <div className="pt-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-medium text-[#b0aea5] uppercase tracking-wider">
                Behavior
              </span>
              <div className="flex-1 border-t border-[#2a2a28]" />
            </div>

            {/* Template buttons */}
            <div className="flex gap-2 flex-wrap mb-4">
              {PROMPT_TEMPLATES.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => {
                    setSelectedTemplate(i);
                    setSystemPrompt(t.prompt);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    selectedTemplate === i
                      ? "bg-[#d97757]/20 text-[#d97757] ring-1 ring-[#d97757]"
                      : "bg-[#2a2a28] text-[#b0aea5] hover:bg-[#3a3a37]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* System prompt textarea */}
            <textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                setSelectedTemplate(PROMPT_TEMPLATES.length - 1);
              }}
              rows={8}
              placeholder="System prompt for this agent \u2014 defines how it behaves when running autonomously..."
              className={`${inputClass} resize-y min-h-[160px]`}
            />
            <p className="text-[11px] text-[#b0aea5]/60 mt-2">
              Agents run with --permission-mode auto. The system prompt guides
              autonomous behavior.
            </p>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#2a2a28]">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-[#b0aea5] hover:text-[#faf9f5] bg-[#2a2a28] hover:bg-[#3a3a37] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !role.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
            >
              {submitting
                ? isEditMode
                  ? "Saving..."
                  : "Creating..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
