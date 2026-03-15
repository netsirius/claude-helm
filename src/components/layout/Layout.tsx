import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#141413] text-[#faf9f5] overflow-hidden">
      <Sidebar />
      <CommandPalette />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
