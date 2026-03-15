import { Settings, Terminal, RefreshCw } from "lucide-react";

interface SettingRow {
  label: string;
  value: string;
}

function SettingSection({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  rows: SettingRow[];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-zinc-400" />
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
          >
            <span className="text-sm text-zinc-400">{row.label}</span>
            <span className="text-sm text-white font-mono">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const sshSettings: SettingRow[] = [
    { label: "Connection timeout", value: "10s" },
    { label: "Idle disconnect", value: "60s" },
    { label: "Retry attempts", value: "3" },
  ];

  const generalSettings: SettingRow[] = [
    { label: "Auto-refresh interval", value: "30s" },
    { label: "Theme", value: "Dark" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-zinc-400" />
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <SettingSection title="SSH" icon={Terminal} rows={sshSettings} />
      <SettingSection title="General" icon={RefreshCw} rows={generalSettings} />
    </div>
  );
}
