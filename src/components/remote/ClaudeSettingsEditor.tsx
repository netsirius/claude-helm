import { useState, useEffect, useCallback } from "react";
import { X, Save, Loader2, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { tauriInvoke } from "../../lib/tauri";

interface ClaudeSettingsEditorProps {
  open: boolean;
  onClose: () => void;
  remoteId: string;
  remoteName: string;
}

interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  model?: string;
  [key: string]: unknown;
}

const TOOL_CATEGORIES = [
  "Bash",
  "Edit",
  "Read",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "mcp",
];

const MODEL_OPTIONS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-35-20241022",
];

export default function ClaudeSettingsEditor({
  open,
  onClose,
  remoteId,
  remoteName,
}: ClaudeSettingsEditorProps) {
  const [settings, setSettings] = useState<ClaudeSettings>({});
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await tauriInvoke<string>("read_remote_claude_config", {
        remoteId,
      });
      const parsed = JSON.parse(json) as ClaudeSettings;
      setSettings(parsed);
      setRawJson(JSON.stringify(parsed, null, 2));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [remoteId]);

  useEffect(() => {
    if (open) {
      loadSettings();
      setSuccessMsg(null);
    }
  }, [open, loadSettings]);

  if (!open) return null;

  const allowList = settings.permissions?.allow ?? [];
  const denyList = settings.permissions?.deny ?? [];

  const toggleAllow = (tool: string) => {
    const newAllow = allowList.includes(tool)
      ? allowList.filter((t) => t !== tool)
      : [...allowList, tool];
    // Remove from deny if adding to allow
    const newDeny = denyList.filter((t) => t !== tool);
    const updated = {
      ...settings,
      permissions: { allow: newAllow, deny: newDeny },
    };
    setSettings(updated);
    setRawJson(JSON.stringify(updated, null, 2));
  };

  const toggleDeny = (tool: string) => {
    const newDeny = denyList.includes(tool)
      ? denyList.filter((t) => t !== tool)
      : [...denyList, tool];
    // Remove from allow if adding to deny
    const newAllow = allowList.filter((t) => t !== tool);
    const updated = {
      ...settings,
      permissions: { allow: newAllow, deny: newDeny },
    };
    setSettings(updated);
    setRawJson(JSON.stringify(updated, null, 2));
  };

  const setModel = (model: string) => {
    const updated = { ...settings, model: model || undefined };
    if (!model) delete updated.model;
    setSettings(updated);
    setRawJson(JSON.stringify(updated, null, 2));
  };

  const handleRawChange = (json: string) => {
    setRawJson(json);
    try {
      const parsed = JSON.parse(json) as ClaudeSettings;
      setSettings(parsed);
      setError(null);
    } catch {
      // Don't update settings if JSON is invalid; user might still be typing
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Validate JSON
      const toSave = JSON.parse(rawJson);
      const json = JSON.stringify(toSave, null, 2);

      await tauriInvoke("write_remote_claude_config", {
        remoteId,
        config: json,
      });
      setSuccessMsg("Settings saved successfully.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">
              Claude Settings
            </h2>
            <span className="text-xs text-zinc-500">({remoteName})</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Model selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-medium">Model</label>
              <select
                value={settings.model ?? ""}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Default</option>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">
                Tool Permissions
              </label>
              <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
                <div className="grid grid-cols-3 gap-x-4 text-xs text-zinc-500 pb-1 border-b border-zinc-700 mb-2">
                  <span>Tool</span>
                  <span className="text-center">Allow</span>
                  <span className="text-center">Deny</span>
                </div>
                {TOOL_CATEGORIES.map((tool) => (
                  <div
                    key={tool}
                    className="grid grid-cols-3 gap-x-4 items-center py-1"
                  >
                    <span className="text-xs text-zinc-300">{tool}</span>
                    <label className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={allowList.includes(tool)}
                        onChange={() => toggleAllow(tool)}
                        className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                      />
                    </label>
                    <label className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={denyList.includes(tool)}
                        onChange={() => toggleDeny(tool)}
                        className="rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500 focus:ring-offset-0"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw JSON editor */}
            <div className="space-y-1.5">
              <button
                onClick={() => setRawExpanded(!rawExpanded)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium hover:text-white transition-colors"
              >
                {rawExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                Raw JSON
              </button>
              {rawExpanded && (
                <textarea
                  value={rawJson}
                  onChange={(e) => handleRawChange(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-xs font-mono placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <div className="text-xs">
            {error && <span className="text-red-400">{error}</span>}
            {successMsg && <span className="text-emerald-400">{successMsg}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
