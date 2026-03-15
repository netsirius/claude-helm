# Claude Helm

Tauri v2 desktop application for managing remote Claude Code sessions over SSH. Rust backend (russh) + React/TypeScript frontend. All user configuration is stored as JSON files in `~/.claude-manager/`.

## Architecture

```
src-tauri/src/
  lib.rs              — Tauri app setup, command registration, background tasks (SSH cleanup, cron scheduler)
  state.rs            — AppState with Arc<Mutex> wrappers for config and SSH pool
  main.rs             — Entry point
  config/
    mod.rs            — ConfigStore: JSON file persistence with atomic writes (.tmp + rename)
    remote.rs         — Remote (SSH host) data model
    agents.rs         — Agent data model
    pipelines.rs      — Pipeline + step data models, cron expression parser
  ssh/
    connection.rs     — SshPool: connection pool keyed by host, 60s idle timeout, cleanup loop
    commands.rs       — SSH command execution (wrapped in bash -c)
    sessions.rs       — tmux session management for agent sessions
    extensions.rs     — Remote Claude Code extension discovery
    probe.rs          — Remote system probing (OS, Claude version, etc.)
  commands/
    remote_commands.rs     — CRUD for remotes, connection test, probe, file browsing, Claude install/update
    agent_commands.rs      — CRUD for agents
    session_commands.rs    — Create/stop tmux sessions, capture output, terminal, remote control
    pipeline_commands.rs   — Pipeline CRUD, step management, execution, scheduling
    extension_commands.rs  — List remote extensions
    remote_admin_commands.rs — Skills/plugins/hooks/MCPs management on remotes
    analytics_commands.rs  — Usage stats, session heatmap
    mcp_commands.rs        — Start/stop/status for the MCP server subprocess
    helpers.rs             — Shared command utilities

src/
  App.tsx             — React Router routes
  main.tsx            — React entry point
  app.css             — Global styles (Tailwind v4)
  lib/
    tauri.ts          — tauriInvoke wrapper with activity logging
  stores/
    remoteStore.ts    — Zustand store for remotes
    agentStore.ts     — Zustand store for agents
    pipelineStore.ts  — Zustand store for pipelines
    monitorStore.ts   — Zustand store for live monitor
    activityStore.ts  — Zustand store for activity log
  pages/
    Dashboard.tsx     — Overview with stats and recent activity
    RemoteManager.tsx — Add/edit/remove SSH remotes
    Agents.tsx        — Agent configuration
    LiveMonitor.tsx   — Real-time session monitoring
    Extensions.tsx    — Remote Claude Code extensions
    Pipelines.tsx     — Pipeline builder with visual flow (React Flow)
    ActivityLog.tsx   — Command history
    SettingsPage.tsx  — App settings, MCP server controls
  components/
    layout/           — Sidebar navigation, Layout wrapper
    remote/           — Remote-specific UI components
    agents/           — Agent-specific UI components
    monitor/          — Monitor-specific UI components
    pipeline/         — Pipeline-specific UI components

mcp-server/
  package.json        — Standalone MCP server (TypeScript, ssh2, @modelcontextprotocol/sdk)
  src/                — MCP server source (tools for managing remotes, agents, sessions)
```

## Routes

| Path          | Page            | Description                       |
|---------------|-----------------|-----------------------------------|
| `/`           | Dashboard       | Overview stats and activity       |
| `/remotes`    | RemoteManager   | SSH remote CRUD                   |
| `/agents`     | Agents          | Agent configuration               |
| `/monitor`    | LiveMonitor     | Real-time session output          |
| `/extensions` | Extensions      | Remote Claude extensions          |
| `/pipelines`  | Pipelines       | Pipeline builder and execution    |
| `/activity`   | ActivityLog     | Command history                   |
| `/settings`   | SettingsPage    | App settings, MCP server          |

## Build Commands

```bash
make dev              # Development mode with hot reload (Vite + Tauri)
make build            # Production build (app bundle + DMG)
make check            # Verify both Rust and TypeScript compile
make test             # Run Rust tests
make lint             # Run clippy
make fmt              # Format Rust code
make setup            # First-time dependency install (pnpm + cargo fetch)
make info             # Show project versions and file counts
```

Additional targets: `build-debug`, `build-frontend`, `build-rust`, `check-rust`, `check-ts`, `test-verbose`, `fmt-check`, `lint-fix`, `dmg`, `install`, `uninstall`, `open`, `kill`, `clean`, `clean-all`, `config-dir`, `reset-config`, `logs`.

## Testing

- Rust: `cd src-tauri && cargo test` (or `make test`)
- TypeScript type check: `pnpm exec tsc --noEmit` (or `make check-ts`)
- No frontend unit tests currently
- MCP server: `cd mcp-server && npm run build` (compilation check)

## Key Conventions

### Naming
- **Remote** (not VPS, not Server) for SSH-accessible machines. Config migrates from `vps.json` -> `servers.json` -> `remotes.json` automatically.
- Rust: `snake_case` everywhere. Tauri commands registered in `lib.rs` via `tauri::generate_handler!`.
- TypeScript: `camelCase`. Zustand stores. All Tauri calls go through `tauriInvoke()` in `src/lib/tauri.ts` which logs activity.

### Config Files (`~/.claude-manager/`)
- `remotes.json` — SSH remotes (host, port, user, auth method)
- `agents.json` — Agent definitions (name, system prompt, allowed tools)
- `pipelines.json` — Pipeline definitions with steps and schedules
- `known_hosts.json` — SSH host keys (TOFU model)
- All writes are atomic: write to `.tmp` then rename
- Backward compatible loading: tries `remotes.json`, falls back to `servers.json`, then `vps.json`

### SSH
- Connection pool with 60s idle timeout, cleanup every 30s
- Commands wrapped in `bash -c '...'` for consistent shell behavior
- Host key verification uses Trust On First Use (TOFU), stored in `~/.claude-manager/known_hosts.json`
- Library: `russh` 0.48

### Agent Sessions
- Run via tmux on the remote machine
- Use `claude --permission-mode auto --system-prompt "..."` for autonomous operation
- Output captured via tmux `capture-pane`
- Session monitoring polls output at intervals

### Pipelines
- Steps execute sequentially, each in a tmux session on a remote
- Output captured via `capture-pane` after step completion
- Cron scheduler checks every 60s for scheduled pipelines
- Cron expressions: standard 5-field format (minute hour day month weekday)
- Pipeline statuses: Idle, Running, Completed, Failed, Cancelled

### UI / Design
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- Brand colors: dark `#141413`, light `#faf9f5`, accent `#d97757` (Anthropic orange)
- Sidebar background: `#1a1a19`, border: `#2a2a28`
- Icons: lucide-react
- Pipeline visualization: React Flow (`@xyflow/react`)
- Terminal rendering: xterm.js (`@xterm/xterm`)

### MCP Server
- Standalone Node.js process in `mcp-server/`
- Uses `@modelcontextprotocol/sdk` and `ssh2` for remote operations
- Started/stopped from the Settings page (or via `mcp_commands` Tauri commands)
- Built with: `cd mcp-server && npm run build`

## Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Desktop  | Tauri v2                                      |
| Backend  | Rust (russh, tokio, serde, chrono, uuid)      |
| Frontend | React 19, TypeScript 5.8, Vite 7              |
| Styling  | Tailwind CSS v4                               |
| State    | Zustand 5                                     |
| SSH      | russh 0.48 (backend), ssh2 (MCP server)       |
| MCP      | @modelcontextprotocol/sdk                     |

## Commit Style

Conventional commits: `type: description` (lowercase). Common prefixes: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`.
