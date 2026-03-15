// ── Remote ───────────────────────────────────────────────────────────
export interface Remote {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  sshKeyPath: string;
  tags: string[];
  group: string;
  status: "online" | "offline" | "unknown";
  lastSeen: string | null;
}

export interface RemotesConfig {
  schemaVersion: number;
  remotes: Remote[];
}

// ── Probe ────────────────────────────────────────────────────────────
export interface ProbeResult {
  claudePath: string;
  claudeVersion: string;
  hasTmux: boolean;
  hasScreen: boolean;
  hasFlock: boolean;
  configDir: string;
  settingsFormat: string;
  shell: string;
}

// ── Agent ────────────────────────────────────────────────────────────
export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  defaultModel: string;
  defaultDir: string;
  claudeMd: string;
  assignedRemoteId: string | null;
  tags: string[];
  currentSessionId: string | null;
  currentRemoteId: string | null;
  createdAt: string;
}

export interface AgentsConfig {
  schemaVersion: number;
  agents: Agent[];
}

// ── Pipeline ─────────────────────────────────────────────────────────
export interface PipelineStep {
  id: string;
  agentId: string;
  prompt: string;
  dependsOn: string[];
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  timeout: number;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  status: "idle" | "running" | "completed" | "failed";
  createdAt: string;
  lastRunAt: string | null;
}

export interface PipelinesConfig {
  schemaVersion: number;
  pipelines: Pipeline[];
}

// ── Session ──────────────────────────────────────────────────────────
export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}
