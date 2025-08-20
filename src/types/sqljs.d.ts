// Minimal ambient declarations for sql.js to satisfy TypeScript in tests
declare module 'sql.js' {
  interface SqlJsStatement { run(params?: unknown[]): void; free(): void }
  interface SqlJsDatabase {
    run(sql: string): void;
    prepare(sql: string): SqlJsStatement;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    export(): Uint8Array;
  }
  interface SqlJsNamespace { Database: new (data?: Uint8Array) => SqlJsDatabase }
  function init(config?: { locateFile?: (file: string) => string }): Promise<SqlJsNamespace>;
  export default init;
}
