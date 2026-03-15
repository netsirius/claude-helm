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

const PROMPT_TEMPLATES = [
  {
    label: "Auto-decide",
    prompt: "You are fully autonomous. Never wait for human input. When presented with choices, select the most reasonable option and proceed. When asked for confirmation, confirm and continue. When a plan is ready, execute it immediately. Complete all tasks end-to-end without stopping.",
  },
  {
    label: "Autonomous Worker",
    prompt: "You are an autonomous agent. Never ask for confirmation — execute tasks immediately. When given a plan, choose option 1 and proceed. Auto-accept all prompts. Be decisive and complete tasks end-to-end without human interaction.",
  },
  {
    label: "Code Developer",
    prompt: "You are a senior software developer. Write clean, tested code. Follow existing patterns in the codebase. Run tests after changes. Commit with clear messages. Never ask for confirmation — just implement.",
  },
  {
    label: "DevOps / Deploy",
    prompt: "You are a DevOps engineer. Handle deployments, infrastructure, CI/CD pipelines. Be cautious with destructive operations but proceed autonomously. Log all actions clearly.",
  },
  {
    label: "Code Reviewer",
    prompt: "You are a code reviewer. Analyze code for bugs, security issues, performance problems, and style. Provide actionable feedback. Fix issues directly when possible.",
  },
  {
    label: "Research & Analysis",
    prompt: "You are a research analyst. Explore codebases, documentation, and APIs. Summarize findings clearly. Produce detailed reports. Never ask for direction — investigate thoroughly on your own.",
  },
  {
    label: "Custom",
    prompt: "",
  },
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
  const [systemPrompt, setSystemPrompt] = useState(PROMPT_TEMPLATES[0].prompt);
  const [selectedTemplate, setSelectedTemplate] = useState(0);

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
        claudeMd: systemPrompt.trim() || undefined,
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
    setSystemPrompt(PROMPT_TEMPLATES[0].prompt);
    setSelectedTemplate(0);
    onClose();
  };

  const inputClass =
    "w-full px-3 py-2 text-sm bg-[#1e1e1c] border border-[#2a2a28] rounded-lg text-[#faf9f5] placeholder:text-[#b0aea5]/60 focus:outline-none focus:ring-2 focus:ring-[#d97757] focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[#141413]/80"
        onClick={resetAndClose}
      />
      <div className="relative bg-[#1e1e1c] border border-[#2a2a28] rounded-xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#faf9f5]">New Agent</h2>
          <button
            onClick={resetAndClose}
            className="text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-6">
            {/* Left column — Identity & Config */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#b0aea5] mb-1">Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="coder-1" className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#b0aea5] mb-1">Role</label>
                <input required value={role} onChange={(e) => setRole(e.target.value)} placeholder="backend-dev" className={inputClass} />
              </div>

              {/* Icon & Color on same row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#b0aea5] mb-2">Icon</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {ICONS.map((ic) => (
                      <button key={ic} type="button" onClick={() => setIcon(ic)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors ${icon === ic ? "bg-[#d97757]/30 ring-2 ring-[#d97757]" : "bg-[#2a2a28] hover:bg-[#3a3a37]"}`}
                      >{ic}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#b0aea5] mb-2">Color</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-[#1e1e1c] ring-[#faf9f5] scale-110" : "hover:scale-110"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Model & Remote on same row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#b0aea5] mb-1">Model</label>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
                    {MODELS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#b0aea5] mb-1">Remote</label>
                  <select value={remoteId} onChange={(e) => setRemoteId(e.target.value)} className={inputClass}
                  >
                    <option value="">None (assign later)</option>
                    {remoteList.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} ({v.host})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right column — Behavior */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[#b0aea5]">Behavior</label>
              <div className="flex gap-1.5 flex-wrap">
                {PROMPT_TEMPLATES.map((t, i) => (
                  <button key={t.label} type="button"
                    onClick={() => { setSelectedTemplate(i); setSystemPrompt(t.prompt); }}
                    className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
                      selectedTemplate === i
                        ? "bg-[#d97757]/20 text-[#d97757] ring-1 ring-[#d97757]"
                        : "bg-[#2a2a28] text-[#b0aea5] hover:bg-[#3a3a37]"
                    }`}
                  >{t.label}</button>
                ))}
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  setSelectedTemplate(PROMPT_TEMPLATES.length - 1);
                }}
                rows={8}
                placeholder="System prompt for this agent — defines how it behaves when running autonomously..."
                className={`${inputClass} resize-y min-h-[120px]`}
              />
              <p className="text-[10px] text-[#b0aea5]/60 mt-1">
                Agents run with --permission-mode auto. The system prompt guides autonomous behavior.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-[#2a2a28]">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 text-sm font-medium rounded-lg text-[#b0aea5] hover:text-[#faf9f5] bg-[#2a2a28] hover:bg-[#3a3a37] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !role.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#d97757] hover:bg-[#c46847] text-[#faf9f5] transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
