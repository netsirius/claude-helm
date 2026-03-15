import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";

interface TerminalPaneProps {
  agentName: string;
  agentColor: string;
  output: string;
  onClose: () => void;
}

export default function TerminalPane({
  agentName,
  agentColor,
  output,
  onClose,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  // Create terminal on mount, dispose on unmount
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      disableStdin: true,
      scrollback: 1000,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: "#141413",
        foreground: "#b0aea5",
        cursor: "#b0aea5",
        selectionBackground: "#2a2a28",
      },
      convertEol: true,
    });

    term.open(containerRef.current);
    termRef.current = term;

    return () => {
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // When output changes, clear and re-write
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.clear();
    term.reset();
    if (output) {
      term.write(output);
    }
  }, [output]);

  return (
    <div className="flex flex-col bg-[#1e1e1c] border border-[#2a2a28] rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a28] bg-[#141413]">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: agentColor }}
          />
          <span className="text-sm font-medium text-[#faf9f5]">{agentName}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#2a2a28] text-[#b0aea5] hover:text-[#faf9f5] transition-colors"
          title="Remove from monitor"
        >
          <X size={14} />
        </button>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="h-64 p-1" />
    </div>
  );
}
