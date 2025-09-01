// === BEGIN: runtime-wiring ===
import { isTauri } from './runtime';
export async function invokeOrThrow<T = unknown>(cmd: string, args?: import('@tauri-apps/api/core').InvokeArgs): Promise<T> {
  if (!isTauri) throw new Error('This feature only runs inside the Tauri app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
// === END: runtime-wiring ===
