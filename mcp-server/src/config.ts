import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".claude-manager");

/**
 * Load a JSON config file from ~/.claude-manager/.
 * Tries `filename` first, then each fallback in order.
 * Returns `defaultValue` (or a bare schema object) if none exist.
 */
export function loadConfig<T>(
  filename: string,
  fallbacks: string[] = [],
  defaultValue?: T,
): T {
  const files = [filename, ...fallbacks];
  for (const f of files) {
    const p = join(CONFIG_DIR, f);
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf-8")) as T;
    }
  }
  return defaultValue ?? ({ schemaVersion: 1 } as T);
}

/**
 * Atomically write a JSON config file to ~/.claude-manager/.
 */
export function saveConfig<T>(filename: string, data: T): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const p = join(CONFIG_DIR, filename);
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, p);
}

/**
 * Load a probe result for a given remote id.
 */
export function loadProbe(remoteId: string): unknown | null {
  const p = join(CONFIG_DIR, "probes", `${remoteId}.json`);
  if (existsSync(p)) {
    return JSON.parse(readFileSync(p, "utf-8"));
  }
  return null;
}

/**
 * Save a probe result for a given remote id.
 */
export function saveProbe(remoteId: string, data: unknown): void {
  const dir = join(CONFIG_DIR, "probes");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${remoteId}.json`);
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, p);
}
