<div align="center">

# ⛵ Claude Helm

### Take the helm of your Claude fleet.

A macOS desktop app for managing Claude Code sessions across all your remote machines — VPS, PCs, VMs, Docker containers — from a single, beautiful dashboard.

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-ffc131?logo=tauri&logoColor=white)](https://v2.tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<!-- Screenshots coming soon -->

</div>

---

## 🧭 What is Claude Helm?

Claude Helm is a native macOS application that turns the chaos of managing Claude Code across multiple remote servers into a streamlined visual experience. Instead of SSH-ing into each machine to check sessions, install plugins, or coordinate tasks, you do it all from one window.

It's built for developers and teams who run Claude Code on remote infrastructure — whether that's a fleet of VPS servers, cloud VMs, or Docker containers — and need a centralized command center to keep everything organized.

Each remote Claude session is presented as a **named agent** with its own role, icon, color, and live status. You can monitor them, orchestrate multi-agent workflows through pipelines, and even control Claude Helm from Claude Code itself via the built-in MCP server.

---

## ✨ Features

### 🖥️ Remote Management

- **Add any SSH-accessible machine** — VPS, PC, VM, Docker container
- **Test connections** with one click, auto-probe remote capabilities
- **Auto-install and update Claude** on remotes directly from the app
- **Remote file browser** for navigating project structures
- **Claude settings editor** — permissions, model selection, MCP configuration

### 🤖 Agent System

- **Named agents** with custom roles, emoji icons, and colors
- **Start/stop sessions** with a single click
- **Live activity monitoring** — see if each agent is waiting, thinking, or working
- **Open in Terminal** or launch a **Claude Web remote-control** session

### 📺 Live Monitor

- **Real-time terminal output** via xterm.js with full ANSI color support
- **Monitor up to 4 agents simultaneously** in a tiled layout
- **Auto-polling** with pause control and a 1,000-line output buffer

### 🔗 Pipeline Orchestration

- **DAG-based multi-agent workflows** — chain agents so the output of one feeds the next
- **Visual pipeline editor** built with React Flow
- **Step-level configuration** — labels, prompts, dependencies, timeouts
- **Output passing** between steps via `{{prev.output}}` and `{{step.<id>.output}}`
- **Execute, cancel, and monitor** pipeline progress in real time

### 🧩 Extensions Manager

- **Browse installed extensions** — plugins, skills, MCPs, hooks
- **Install from the skills.sh marketplace** with search
- **Enable/disable MCPs** and manage hooks per remote
- **Batch install** across multiple remotes at once

### 📊 Analytics

- **Token and cost tracking** per remote machine
- **Model distribution** breakdown (Opus / Sonnet / Haiku)
- **Daily cost chart** for spend visibility
- **Work rhythm heatmap** (7-day × 24-hour) to see when your fleet is active

### ⌨️ Productivity

- **Cmd+K command palette** for fast navigation and actions
- **Activity log** of all operations with filtering by remote, type, and status
- **Anthropic brand theme** — dark, clean, and purpose-built

### 🔌 MCP Server (14 Tools)

- **Control Claude Helm from Claude Code itself** — full bidirectional integration
- List, create, start, and stop agents programmatically
- Send prompts and watch terminal output
- Start remote-control browser sessions
- Execute and monitor pipelines

---

## 🚀 Quick Start

```bash
git clone https://github.com/netsirius/claude-helm
cd claude-helm
make setup
make dev
```

---

## 📦 Installation

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | 18+     |
| Rust        | stable  |
| pnpm        | 8+      |

### Build & Install

```bash
# Build production binary + app bundle
make build

# Install to /Applications
make install

# Or grab the DMG from:
# src-tauri/target/release/bundle/dmg/
```

---

## 🔌 MCP Server Setup

The MCP server lets you control Claude Helm from any Claude Code session — list remotes, start agents, send prompts, and more.

```bash
cd mcp-server && npm install && npm run build
claude mcp add claude-helm -s user node $(pwd)/mcp-server/dist/index.js
```

### Available Tools

| Tool | Description |
|------|-------------|
| `cm_list_remotes` | List all configured remote machines |
| `cm_add_remote` | Add a new remote machine |
| `cm_test_remote` | Test SSH connectivity to a remote |
| `cm_list_agents` | List all configured agents |
| `cm_create_agent` | Create a new agent with name, role, icon, and color |
| `cm_start_agent` | Start an agent session on its assigned remote |
| `cm_stop_agent` | Stop a running agent session |
| `cm_get_agent_activity` | Get what an agent is currently doing (waiting/thinking/working) |
| `cm_list_sessions` | List all tmux sessions on a remote |
| `cm_list_pipelines` | List all configured pipelines |
| `cm_run_pipeline` | Execute a pipeline by starting its agent steps |
| `cm_send_prompt` | Send a prompt to a running agent |
| `cm_watch_agent` | Capture terminal output of a running agent |
| `cm_start_remote_control` | Get a remote-control URL for a running agent |

---

## 🛠️ Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start dev mode (hot reload frontend + Rust backend) |
| `make dev-frontend` | Start only the Vite dev server (no Tauri) |
| `make build` | Build production binary + app bundle |
| `make build-debug` | Build debug binary (faster, larger) |
| `make build-frontend` | Build only frontend (TypeScript + Vite) |
| `make build-rust` | Build only Rust backend |
| `make check` | Check both Rust and TypeScript compile |
| `make check-rust` | Check only Rust compilation |
| `make check-ts` | Check only TypeScript compilation |
| `make test` | Run Rust tests |
| `make test-verbose` | Run Rust tests with output |
| `make fmt` | Format Rust code |
| `make fmt-check` | Check Rust formatting |
| `make lint` | Run Rust clippy linter |
| `make lint-fix` | Fix auto-fixable Rust lint issues |
| `make setup` | Install all dependencies (first time setup) |
| `make install` | Build and install to /Applications |
| `make uninstall` | Remove the app from /Applications |
| `make dmg` | Build and locate the DMG |
| `make open` | Open the built app (without rebuilding) |
| `make kill` | Force quit the running app |
| `make clean` | Remove build artifacts |
| `make clean-all` | Remove build artifacts + node_modules |
| `make config-dir` | Show config directory path and contents |
| `make reset-config` | Reset all app configuration |
| `make logs` | Show recent app logs |
| `make info` | Show project info and versions |
| `make help` | Show all available commands |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Claude Helm (macOS)           │
│                                         │
│  ┌──────────────┐  ┌────────────────┐  │
│  │  React UI    │  │  Rust Backend  │  │
│  │  (TypeScript)│◄─►  (Tauri Core)  │  │
│  │              │  │                │  │
│  │ 8 pages      │  │ SSH Pool       │  │
│  │ Zustand      │  │ (russh)        │  │
│  │ React Flow   │  │ Config Store   │  │
│  │ xterm.js     │  │ 40+ commands   │  │
│  └──────────────┘  └───────┬────────┘  │
│                             │ SSH       │
└─────────────────────────────┼───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌─────────┐    ┌─────────┐    ┌─────────┐
         │Remote 1 │    │Remote 2 │    │Remote N │
         │ claude  │    │ claude  │    │ claude  │
         └─────────┘    └─────────┘    └─────────┘
```

**How it works:** The Rust backend maintains an SSH connection pool (via `russh`) to all configured remotes. It discovers Claude sessions through multiple strategies — state files, process table, and tmux — without requiring any daemon on the remote. The React frontend communicates with the backend through Tauri's IPC, presenting everything as a unified dashboard.

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Tauri v2 |
| Backend | Rust (tokio async runtime) |
| SSH | `russh` crate (native Rust, no system `ssh` binary) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| State management | Zustand |
| Routing | React Router v7 |
| Terminal rendering | xterm.js |
| Pipeline editor | React Flow |
| Icons | Lucide React |
| Build tooling | Vite 7 |
| Package manager | pnpm |
| Local config | JSON files in `~/.claude-manager/` |

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change. For pull requests:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run checks (`make check && make lint`)
4. Commit your changes
5. Push to the branch and open a PR

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ and Claude — *Take the helm.*

</div>
