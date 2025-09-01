// Minimal ambient module declaration to satisfy TS when the plugin isn't installed in web/test envs
declare module '@tauri-apps/plugin-http' {
  // Mirror the built-in fetch type so consumers get proper typings
  export const fetch: typeof globalThis.fetch;
}
