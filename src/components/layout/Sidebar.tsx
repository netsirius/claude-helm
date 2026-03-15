import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Bot,
  Activity,
  Puzzle,
  GitBranch,
  ScrollText,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/remotes", label: "Remotes", icon: Server },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/monitor", label: "Monitor", icon: Activity },
  { to: "/extensions", label: "Extensions", icon: Puzzle },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/activity", label: "Activity", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="px-4 py-5">
        <h1 className="text-lg font-bold text-white tracking-tight">
          Claude Manager
        </h1>
      </div>

      <nav className="flex-1 px-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
