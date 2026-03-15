import { Client } from "ssh2";
import { readFileSync } from "fs";
import { homedir } from "os";

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Execute a command on a remote machine via SSH.
 * Uses key-based authentication.
 */
export async function sshExec(
  host: string,
  port: number,
  user: string,
  keyPath: string,
  command: string,
  timeoutMs: number = 30_000,
): Promise<SshExecResult> {
  const resolvedKey = keyPath.startsWith("~/")
    ? keyPath.replace("~", homedir())
    : keyPath;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    conn.on("ready", () => {
      // Wrap in bash -c for consistent shell behavior
      const escaped = command.replace(/'/g, "'\\''");
      conn.exec(`bash -c '${escaped}'`, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        stream.stderr.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        stream.on("close", (exitCode: number) => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout, stderr, code: exitCode ?? 0 });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host,
      port,
      username: user,
      privateKey: readFileSync(resolvedKey),
    });
  });
}

/**
 * Test if an SSH connection can be established.
 * Returns true if connection succeeds, false otherwise.
 */
export async function sshTest(
  host: string,
  port: number,
  user: string,
  keyPath: string,
  timeoutMs: number = 10_000,
): Promise<boolean> {
  const resolvedKey = keyPath.startsWith("~/")
    ? keyPath.replace("~", homedir())
    : keyPath;

  return new Promise((resolve) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      resolve(false);
    }, timeoutMs);

    conn.on("ready", () => {
      clearTimeout(timer);
      conn.end();
      resolve(true);
    });

    conn.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    try {
      conn.connect({
        host,
        port,
        username: user,
        privateKey: readFileSync(resolvedKey),
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}
