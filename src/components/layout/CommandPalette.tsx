import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Bot,
  Activity,
  Puzzle,
  GitBranch,
  ScrollText,
  Settings,
  Search,
  Plus,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useRemoteStore } from "../../stores/remoteStore";
import { useAgentStore } from "../../stores/agentStore";
import { usePipelineStore } from "../../stores/pipelineStore";

interface CommandItem {
  id: string;
  name: string;
  category: "Page" | "Remote" | "Agent" | "Pipeline" | "Action";
  icon: LucideIcon;
  action: () => void;
}

function highlightMatch(text: string, query: string) {
  if (!query) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span className="text-[#d97757] font-semibold">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </span>
  );
}

const categoryColors: Record<string, string> = {
  Page: "bg-[#2a2a28] text-[#b0aea5]",
  Remote: "bg-[#2a2a28] text-[#b0aea5]",
  Agent: "bg-[#2a2a28] text-[#b0aea5]",
  Pipeline: "bg-[#2a2a28] text-[#b0aea5]",
  Action: "bg-[#2a2a28] text-[#b0aea5]",
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const remotes = useRemoteStore((s) => s.remotes);
  const agents = useAgentStore((s) => s.agents);
  const pipelines = usePipelineStore((s) => s.pipelines);

  const fetchRemotes = useRemoteStore((s) => s.fetch);
  const fetchAgents = useAgentStore((s) => s.fetch);
  const fetchPipelines = usePipelineStore((s) => s.fetch);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = [
      { id: "page-dashboard", name: "Dashboard", category: "Page", icon: LayoutDashboard, action: () => { navigate("/"); close(); } },
      { id: "page-remotes", name: "Remotes", category: "Page", icon: Server, action: () => { navigate("/remotes"); close(); } },
      { id: "page-agents", name: "Agents", category: "Page", icon: Bot, action: () => { navigate("/agents"); close(); } },
      { id: "page-monitor", name: "Monitor", category: "Page", icon: Activity, action: () => { navigate("/monitor"); close(); } },
      { id: "page-extensions", name: "Extensions", category: "Page", icon: Puzzle, action: () => { navigate("/extensions"); close(); } },
      { id: "page-pipelines", name: "Pipelines", category: "Page", icon: GitBranch, action: () => { navigate("/pipelines"); close(); } },
      { id: "page-activity", name: "Activity", category: "Page", icon: ScrollText, action: () => { navigate("/activity"); close(); } },
      { id: "page-settings", name: "Settings", category: "Page", icon: Settings, action: () => { navigate("/settings"); close(); } },
    ];

    const remoteItems: CommandItem[] = remotes.map((r) => ({
      id: `remote-${r.id}`,
      name: r.name,
      category: "Remote",
      icon: Server,
      action: () => { navigate("/remotes"); close(); },
    }));

    const agentItems: CommandItem[] = agents.map((a) => ({
      id: `agent-${a.id}`,
      name: a.name,
      category: "Agent",
      icon: Bot,
      action: () => { navigate("/agents"); close(); },
    }));

    const pipelineItems: CommandItem[] = pipelines.map((p) => ({
      id: `pipeline-${p.id}`,
      name: p.name,
      category: "Pipeline",
      icon: GitBranch,
      action: () => { navigate("/pipelines"); close(); },
    }));

    const actions: CommandItem[] = [
      { id: "action-new-remote", name: "New Remote", category: "Action", icon: Plus, action: () => { navigate("/remotes"); close(); } },
      { id: "action-new-agent", name: "New Agent", category: "Action", icon: Plus, action: () => { navigate("/agents"); close(); } },
      { id: "action-new-pipeline", name: "New Pipeline", category: "Action", icon: Plus, action: () => { navigate("/pipelines"); close(); } },
      {
        id: "action-refresh-all",
        name: "Refresh All",
        category: "Action",
        icon: RefreshCw,
        action: () => {
          fetchRemotes();
          fetchAgents();
          fetchPipelines();
          close();
        },
      },
    ];

    return [...pages, ...remoteItems, ...agentItems, ...pipelineItems, ...actions];
  }, [navigate, close, remotes, agents, pipelines, fetchRemotes, fetchAgents, fetchPipelines]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (prev) {
            // closing
            setQuery("");
            setSelectedIndex(0);
            return false;
          }
          return true;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      filtered[selectedIndex]?.action();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-[#141413]/80 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-lg bg-[#1e1e1c] border border-[#2a2a28] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a28]">
          <Search size={18} className="text-[#b0aea5] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, remotes, agents, pipelines..."
            className="flex-1 bg-transparent text-lg text-[#faf9f5] placeholder-[#6b6a65] outline-none"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[#6b6a65] text-sm">
              No results found
            </div>
          )}
          {filtered.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected
                    ? "bg-[#d97757]/10 border-l-2 border-[#d97757]"
                    : "border-l-2 border-transparent hover:bg-[#2a2a28]"
                }`}
                onClick={() => item.action()}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Icon
                  size={16}
                  className={isSelected ? "text-[#d97757]" : "text-[#b0aea5]"}
                />
                <span
                  className={`flex-1 text-sm ${
                    isSelected ? "text-[#faf9f5]" : "text-[#b0aea5]"
                  }`}
                >
                  {highlightMatch(item.name, query)}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${categoryColors[item.category]}`}
                >
                  {item.category}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 px-4 py-2.5 border-t border-[#2a2a28] text-[#b0aea5] text-xs">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a28] text-[10px] font-mono">
              &uarr;&darr;
            </kbd>{" "}
            Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a28] text-[10px] font-mono">
              Enter
            </kbd>{" "}
            Select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#2a2a28] text-[10px] font-mono">
              Esc
            </kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
