import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { loadConfig, saveConfig, loadProbe, saveProbe } from "./config.js";
import { sshExec, sshTest } from "./ssh.js";
import type {
  Remote,
  RemotesConfig,
  Agent,
  AgentsConfig,
  ProbeResult,
  PipelinesConfig,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function findRemote(id: string): Remote | undefined {
  const cfg = loadConfig<RemotesConfig>("remotes.json");
  return cfg.remotes?.find((r) => r.id === id);
}

function findAgent(id: string): Agent | undefined {
  const cfg = loadConfig<AgentsConfig>("agents.json");
  return cfg.agents?.find((a) => a.id === id);
}

function now(): string {
  return new Date().toISOString();
}

async function probeRemote(remote: Remote): Promise<ProbeResult> {
  const existing = loadProbe(remote.id) as ProbeResult | null;
  if (existing) return existing;

  const cmds = [
    "which claude || echo NOT_FOUND",
    "claude --version 2>/dev/null || echo UNKNOWN",
    "which tmux >/dev/null 2>&1 && echo true || echo false",
    "which screen >/dev/null 2>&1 && echo true || echo false",
    "which flock >/dev/null 2>&1 && echo true || echo false",
    "echo $HOME/.claude",
    "echo json",
    "basename $SHELL",
  ];
  const script = cmds.join(" && echo '---DELIM---' && ");
  const result = await sshExec(
    remote.host,
    remote.port,
    remote.user,
    remote.sshKeyPath,
    script,
  );
  const parts = result.stdout.split("---DELIM---").map((s) => s.trim());

  const probe: ProbeResult = {
    claudePath: parts[0] === "NOT_FOUND" ? "" : parts[0],
    claudeVersion: parts[1] ?? "UNKNOWN",
    hasTmux: parts[2] === "true",
    hasScreen: parts[3] === "true",
    hasFlock: parts[4] === "true",
    configDir: parts[5] ?? "",
    settingsFormat: parts[6] ?? "json",
    shell: parts[7] ?? "bash",
  };

  saveProbe(remote.id, probe);
  return probe;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Server ───────────────────────────────────────────────────────────

const server = new McpServer({
  name: "claude-manager-mcp-server",
  version: "1.0.0",
});

// ─────────────────────────────────────────────────────────────────────
// 1. cm_list_remotes
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_list_remotes",
  "List all configured remote machines in Claude Manager. Returns each remote's id, name, host, port, user, status, tags, and group.",
  {},
  {
    readOnlyHint: true,
    destructiveHint: false,
  },
  async () => {
    const cfg = loadConfig<RemotesConfig>("remotes.json");
    const remotes = cfg.remotes ?? [];
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(remotes, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 2. cm_add_remote
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_add_remote",
  "Add a new remote machine to Claude Manager. Provide at minimum a name, host, user, and sshKeyPath. Optionally set port (default 22), tags, and group.",
  {
    name: z.string().describe("Human-friendly name for this remote"),
    host: z.string().describe("Hostname or IP address"),
    user: z.string().describe("SSH username (e.g. root)"),
    sshKeyPath: z
      .string()
      .describe("Path to SSH private key (e.g. ~/.ssh/id_ed25519)"),
    port: z
      .number()
      .optional()
      .default(22)
      .describe("SSH port (default 22)"),
    tags: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Tags for filtering/grouping"),
    group: z
      .string()
      .optional()
      .default("")
      .describe("Group name for organization"),
  },
  {
    readOnlyHint: false,
    destructiveHint: false,
  },
  async ({ name, host, user, sshKeyPath, port, tags, group }) => {
    const cfg = loadConfig<RemotesConfig>("remotes.json");
    if (!cfg.remotes) cfg.remotes = [];

    const remote: Remote = {
      id: randomUUID(),
      name,
      host,
      port: port ?? 22,
      user,
      sshKeyPath,
      tags: tags ?? [],
      group: group ?? "",
      status: "unknown",
      lastSeen: null,
    };

    cfg.remotes.push(remote);
    saveConfig("remotes.json", cfg);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(remote, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 3. cm_test_remote
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_test_remote",
  "Test SSH connectivity to a remote machine. Returns online/offline status and updates the remote's status in config.",
  {
    remoteId: z.string().describe("UUID of the remote to test"),
  },
  {
    readOnlyHint: false,
    destructiveHint: false,
  },
  async ({ remoteId }) => {
    const cfg = loadConfig<RemotesConfig>("remotes.json");
    const remote = cfg.remotes?.find((r) => r.id === remoteId);
    if (!remote) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: remote ${remoteId} not found`,
          },
        ],
        isError: true,
      };
    }

    const online = await sshTest(remote.host, remote.port, remote.user, remote.sshKeyPath);
    remote.status = online ? "online" : "offline";
    remote.lastSeen = online ? now() : remote.lastSeen;
    saveConfig("remotes.json", cfg);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ remoteId, name: remote.name, status: remote.status, lastSeen: remote.lastSeen }, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 4. cm_list_agents
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_list_agents",
  "List all configured agents in Claude Manager. Returns each agent's id, name, role, status (has active session or not), model, and assigned remote info.",
  {},
  {
    readOnlyHint: true,
    destructiveHint: false,
  },
  async () => {
    const cfg = loadConfig<AgentsConfig>("agents.json");
    const agents = cfg.agents ?? [];
    const remotesCfg = loadConfig<RemotesConfig>("remotes.json");

    const result = agents.map((a) => {
      const remote = remotesCfg.remotes?.find((r) => r.id === a.assignedRemoteId);
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        icon: a.icon,
        color: a.color,
        defaultModel: a.defaultModel,
        assignedRemoteId: a.assignedRemoteId,
        assignedRemoteName: remote?.name ?? null,
        currentSessionId: a.currentSessionId,
        currentRemoteId: a.currentRemoteId,
        hasActiveSession: !!a.currentSessionId,
        createdAt: a.createdAt,
      };
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 5. cm_create_agent
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_create_agent",
  "Create a new agent in Claude Manager. An agent represents a Claude Code instance that can be started on a remote machine.",
  {
    name: z.string().describe("Agent display name"),
    role: z.string().describe("Agent role description (e.g. 'Frontend Developer')"),
    icon: z.string().optional().default("🤖").describe("Emoji icon"),
    color: z.string().optional().default("#6366f1").describe("Hex color for UI"),
    defaultModel: z
      .string()
      .optional()
      .default("claude-sonnet-4-20250514")
      .describe("Default Claude model to use"),
    assignedRemoteId: z
      .string()
      .optional()
      .describe("UUID of the remote machine to run this agent on"),
  },
  {
    readOnlyHint: false,
    destructiveHint: false,
  },
  async ({ name, role, icon, color, defaultModel, assignedRemoteId }) => {
    const cfg = loadConfig<AgentsConfig>("agents.json");
    if (!cfg.agents) cfg.agents = [];

    // Validate assigned remote exists if provided
    if (assignedRemoteId) {
      const remote = findRemote(assignedRemoteId);
      if (!remote) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: remote ${assignedRemoteId} not found`,
            },
          ],
          isError: true,
        };
      }
    }

    const agent: Agent = {
      id: randomUUID(),
      name,
      role,
      icon: icon ?? "🤖",
      color: color ?? "#6366f1",
      defaultModel: defaultModel ?? "claude-sonnet-4-20250514",
      defaultDir: "",
      claudeMd: "",
      assignedRemoteId: assignedRemoteId ?? null,
      tags: [],
      currentSessionId: null,
      currentRemoteId: null,
      createdAt: now(),
    };

    cfg.agents.push(agent);
    saveConfig("agents.json", cfg);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(agent, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 6. cm_start_agent
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_start_agent",
  "Start an agent session on its assigned remote machine. Creates a tmux session running Claude Code. The agent must have an assignedRemoteId. Returns the tmux session name.",
  {
    agentId: z.string().describe("UUID of the agent to start"),
    workingDir: z
      .string()
      .optional()
      .default("/root")
      .describe("Working directory on the remote (default /root)"),
  },
  {
    readOnlyHint: false,
    destructiveHint: false,
  },
  async ({ agentId, workingDir }) => {
    // 1. Load agent
    const agentsCfg = loadConfig<AgentsConfig>("agents.json");
    const agent = agentsCfg.agents?.find((a) => a.id === agentId);
    if (!agent) {
      return {
        content: [{ type: "text" as const, text: `Error: agent ${agentId} not found` }],
        isError: true,
      };
    }

    if (agent.currentSessionId) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Agent already has an active session: ${agent.currentSessionId}. Stop it first with cm_stop_agent.`,
          },
        ],
        isError: true,
      };
    }

    // 2. Get assigned remote
    const remoteId = agent.assignedRemoteId;
    if (!remoteId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: agent has no assignedRemoteId. Assign a remote first.",
          },
        ],
        isError: true,
      };
    }
    const remote = findRemote(remoteId);
    if (!remote) {
      return {
        content: [{ type: "text" as const, text: `Error: remote ${remoteId} not found` }],
        isError: true,
      };
    }

    // 3. Probe remote for claude path
    let probe: ProbeResult;
    try {
      probe = await probeRemote(remote);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error probing remote: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }

    if (!probe.claudePath) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Claude Code not found on remote. Install it first.",
          },
        ],
        isError: true,
      };
    }

    if (!probe.hasTmux) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: tmux not found on remote. Install it first (apt install tmux).",
          },
        ],
        isError: true,
      };
    }

    // 4. Create tmux session
    const sessionName = `cm-${agentId.substring(0, 8)}`;
    const dir = workingDir ?? (agent.defaultDir || "/root");
    const claudeCmd = `${probe.claudePath} --model ${agent.defaultModel}`;

    try {
      // Kill any existing session with same name
      await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux kill-session -t '${sessionName}' 2>/dev/null; true`,
      );

      // Create new session
      await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux new-session -d -s '${sessionName}' -c '${dir}' '${claudeCmd}'`,
      );

      // 5. Wait and auto-accept trust prompt
      await sleep(3000);
      await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux send-keys -t '${sessionName}' Enter`,
      );

      await sleep(1000);
      await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux send-keys -t '${sessionName}' Enter`,
      );

      // 6. Update agent config
      agent.currentSessionId = sessionName;
      agent.currentRemoteId = remoteId;
      saveConfig("agents.json", agentsCfg);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "started",
                sessionName,
                remoteId,
                remoteName: remote.name,
                workingDir: dir,
                model: agent.defaultModel,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error starting agent: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 7. cm_stop_agent
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_stop_agent",
  "Stop a running agent session. Kills the tmux session on the remote and clears the agent's session mapping.",
  {
    agentId: z.string().describe("UUID of the agent to stop"),
  },
  {
    readOnlyHint: false,
    destructiveHint: true,
  },
  async ({ agentId }) => {
    const agentsCfg = loadConfig<AgentsConfig>("agents.json");
    const agent = agentsCfg.agents?.find((a) => a.id === agentId);
    if (!agent) {
      return {
        content: [{ type: "text" as const, text: `Error: agent ${agentId} not found` }],
        isError: true,
      };
    }

    if (!agent.currentSessionId || !agent.currentRemoteId) {
      return {
        content: [{ type: "text" as const, text: "Agent has no active session." }],
        isError: true,
      };
    }

    const remote = findRemote(agent.currentRemoteId);
    if (!remote) {
      // Remote gone — just clear the mapping
      agent.currentSessionId = null;
      agent.currentRemoteId = null;
      saveConfig("agents.json", agentsCfg);
      return {
        content: [
          {
            type: "text" as const,
            text: "Remote not found, cleared agent session mapping.",
          },
        ],
      };
    }

    try {
      await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux kill-session -t '${agent.currentSessionId}' 2>/dev/null; true`,
      );
    } catch {
      // If SSH fails, still clear mapping
    }

    const sessionName = agent.currentSessionId;
    agent.currentSessionId = null;
    agent.currentRemoteId = null;
    saveConfig("agents.json", agentsCfg);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "stopped", sessionName, agentId }, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 8. cm_get_agent_activity
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_get_agent_activity",
  "Get what an agent is currently doing by capturing its tmux pane output. Returns the agent's status (waiting/thinking/working/busy), a detail string, and the last visible output.",
  {
    agentId: z.string().describe("UUID of the agent to inspect"),
  },
  {
    readOnlyHint: true,
    destructiveHint: false,
  },
  async ({ agentId }) => {
    const agent = findAgent(agentId);
    if (!agent) {
      return {
        content: [{ type: "text" as const, text: `Error: agent ${agentId} not found` }],
        isError: true,
      };
    }

    if (!agent.currentSessionId || !agent.currentRemoteId) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "inactive", detail: "No active session", lastOutput: "" }, null, 2),
          },
        ],
      };
    }

    const remote = findRemote(agent.currentRemoteId);
    if (!remote) {
      return {
        content: [{ type: "text" as const, text: `Error: remote ${agent.currentRemoteId} not found` }],
        isError: true,
      };
    }

    try {
      const result = await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        `tmux capture-pane -t '${agent.currentSessionId}' -p -S -50`,
      );

      const output = result.stdout.trim();
      const lines = output.split("\n").filter((l) => l.trim() !== "");
      const lastLines = lines.slice(-10).join("\n");

      // Heuristic status detection
      let status: string = "unknown";
      let detail = "";
      const lowerOutput = output.toLowerCase();

      if (lowerOutput.includes("waiting for input") || lowerOutput.includes(">") && lines[lines.length - 1]?.trim().endsWith(">")) {
        status = "waiting";
        detail = "Waiting for user input";
      } else if (lowerOutput.includes("thinking") || lowerOutput.includes("...")) {
        status = "thinking";
        detail = "Processing a request";
      } else if (lowerOutput.includes("writing") || lowerOutput.includes("editing") || lowerOutput.includes("creating")) {
        status = "working";
        detail = "Actively working on files";
      } else if (output.length > 0) {
        status = "busy";
        detail = "Session is active";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status, detail, lastOutput: lastLines }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error capturing activity: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 9. cm_list_sessions
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_list_sessions",
  "List all tmux sessions on a remote machine. Returns session names, window counts, creation times, and whether they are attached.",
  {
    remoteId: z.string().describe("UUID of the remote to list sessions on"),
  },
  {
    readOnlyHint: true,
    destructiveHint: false,
  },
  async ({ remoteId }) => {
    const remote = findRemote(remoteId);
    if (!remote) {
      return {
        content: [{ type: "text" as const, text: `Error: remote ${remoteId} not found` }],
        isError: true,
      };
    }

    try {
      const result = await sshExec(
        remote.host,
        remote.port,
        remote.user,
        remote.sshKeyPath,
        "tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}' 2>/dev/null || echo 'NO_SESSIONS'",
      );

      if (result.stdout.trim() === "NO_SESSIONS" || result.code !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify([], null, 2),
            },
          ],
        };
      }

      const sessions = result.stdout
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
          const [name, windows, created, attached] = line.split("|");
          return {
            name,
            windows: parseInt(windows, 10) || 0,
            created: created
              ? new Date(parseInt(created, 10) * 1000).toISOString()
              : null,
            attached: attached === "1",
          };
        });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(sessions, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing sessions: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 10. cm_list_pipelines
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_list_pipelines",
  "List all configured pipelines in Claude Manager. A pipeline is a sequence of agent steps that can be executed in order.",
  {},
  {
    readOnlyHint: true,
    destructiveHint: false,
  },
  async () => {
    const cfg = loadConfig<PipelinesConfig>("pipelines.json");
    const pipelines = cfg.pipelines ?? [];
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(pipelines, null, 2),
        },
      ],
    };
  },
);

// ─────────────────────────────────────────────────────────────────────
// 11. cm_run_pipeline
// ─────────────────────────────────────────────────────────────────────
server.tool(
  "cm_run_pipeline",
  "Execute a pipeline by starting its agent steps in dependency order. Each step starts its assigned agent with the step's prompt. Returns started status.",
  {
    pipelineId: z.string().describe("UUID of the pipeline to run"),
  },
  {
    readOnlyHint: false,
    destructiveHint: false,
  },
  async ({ pipelineId }) => {
    const pipelinesCfg = loadConfig<PipelinesConfig>("pipelines.json");
    const pipeline = pipelinesCfg.pipelines?.find((p) => p.id === pipelineId);
    if (!pipeline) {
      return {
        content: [{ type: "text" as const, text: `Error: pipeline ${pipelineId} not found` }],
        isError: true,
      };
    }

    if (pipeline.status === "running") {
      return {
        content: [{ type: "text" as const, text: "Pipeline is already running." }],
        isError: true,
      };
    }

    // Find steps with no dependencies (roots)
    const rootSteps = pipeline.steps.filter(
      (s) => !s.dependsOn || s.dependsOn.length === 0,
    );

    if (rootSteps.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Error: no root steps found (all steps have dependencies)." }],
        isError: true,
      };
    }

    // Mark pipeline as running
    pipeline.status = "running";
    pipeline.lastRunAt = now();
    for (const step of pipeline.steps) {
      step.status = "pending";
      step.output = null;
    }

    const started: string[] = [];
    const errors: string[] = [];

    // Start root steps
    for (const step of rootSteps) {
      const agent = findAgent(step.agentId);
      if (!agent) {
        errors.push(`Step ${step.id}: agent ${step.agentId} not found`);
        step.status = "failed";
        continue;
      }

      if (!agent.assignedRemoteId) {
        errors.push(`Step ${step.id}: agent ${agent.name} has no assigned remote`);
        step.status = "failed";
        continue;
      }

      const remote = findRemote(agent.assignedRemoteId);
      if (!remote) {
        errors.push(`Step ${step.id}: remote ${agent.assignedRemoteId} not found`);
        step.status = "failed";
        continue;
      }

      // If agent already has a session, use it to send the prompt
      // Otherwise, start a new session
      try {
        if (!agent.currentSessionId) {
          // Start the agent first (simplified — not calling cm_start_agent to avoid recursion)
          const probe = await probeRemote(remote);
          if (!probe.claudePath || !probe.hasTmux) {
            errors.push(`Step ${step.id}: remote missing claude or tmux`);
            step.status = "failed";
            continue;
          }

          const sessionName = `cm-${agent.id.substring(0, 8)}`;
          const dir = agent.defaultDir || "/root";
          const claudeCmd = `${probe.claudePath} --model ${agent.defaultModel}`;

          await sshExec(remote.host, remote.port, remote.user, remote.sshKeyPath,
            `tmux kill-session -t '${sessionName}' 2>/dev/null; true`);
          await sshExec(remote.host, remote.port, remote.user, remote.sshKeyPath,
            `tmux new-session -d -s '${sessionName}' -c '${dir}' '${claudeCmd}'`);

          await sleep(3000);
          await sshExec(remote.host, remote.port, remote.user, remote.sshKeyPath,
            `tmux send-keys -t '${sessionName}' Enter`);
          await sleep(1000);
          await sshExec(remote.host, remote.port, remote.user, remote.sshKeyPath,
            `tmux send-keys -t '${sessionName}' Enter`);

          // Update agent config
          const agentsCfg = loadConfig<AgentsConfig>("agents.json");
          const agentRef = agentsCfg.agents?.find((a) => a.id === agent.id);
          if (agentRef) {
            agentRef.currentSessionId = sessionName;
            agentRef.currentRemoteId = remote.id;
            saveConfig("agents.json", agentsCfg);
          }

          agent.currentSessionId = sessionName;
        }

        // Send prompt to the agent's tmux session
        if (step.prompt) {
          await sleep(2000);
          // Use tmux send-keys to type the prompt
          const escaped = step.prompt.replace(/'/g, "'\\''");
          await sshExec(remote.host, remote.port, remote.user, remote.sshKeyPath,
            `tmux send-keys -t '${agent.currentSessionId}' '${escaped}' Enter`);
        }

        step.status = "running";
        started.push(`${agent.name} (${step.id})`);
      } catch (err) {
        errors.push(`Step ${step.id}: ${err instanceof Error ? err.message : String(err)}`);
        step.status = "failed";
      }
    }

    saveConfig("pipelines.json", pipelinesCfg);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "started",
              pipelineId,
              pipelineName: pipeline.name,
              stepsStarted: started,
              errors: errors.length > 0 ? errors : undefined,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── Start server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
