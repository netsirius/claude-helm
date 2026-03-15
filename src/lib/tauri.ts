import { invoke } from "@tauri-apps/api/core";
import { useActivityStore } from "../stores/activityStore";

const LOGGED_COMMANDS = [
  "add_remote",
  "remove_remote",
  "update_remote",
  "test_remote_connection",
  "probe_remote",
  "add_agent",
  "remove_agent",
  "create_session",
  "stop_session",
  "create_pipeline",
  "delete_pipeline",
  "add_pipeline_step",
  "list_remote_extensions",
  "execute_pipeline",
  "cancel_pipeline",
];

export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    const result = await invoke<T>(cmd, args);
    if (LOGGED_COMMANDS.includes(cmd)) {
      useActivityStore.getState().add({
        remoteName: (args?.name as string) || (args?.remoteId as string) || (args?.id as string) || "-",
        command: cmd,
        status: "success",
      });
    }
    return result;
  } catch (e) {
    if (LOGGED_COMMANDS.includes(cmd)) {
      useActivityStore.getState().add({
        remoteName: (args?.name as string) || (args?.remoteId as string) || (args?.id as string) || "-",
        command: cmd,
        status: "failure",
        error: String(e),
      });
    }
    throw e;
  }
}
