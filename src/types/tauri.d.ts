// Type definitions for Tauri APIs used in the application
declare module '@tauri-apps/api' {
  export namespace path {
    function appDataDir(): Promise<string>;
    function resourceDir(): Promise<string>;
    function join(...paths: string[]): Promise<string>;
  }

  export namespace dialog {
    interface OpenDialogOptions {
      multiple?: boolean;
      filters?: Array<{
        name: string;
        extensions: string[];
      }>;
      title?: string;
      defaultPath?: string;
    }

    function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
  }
}
