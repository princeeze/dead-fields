type LogMsg = unknown;

export const kyselyLogger = {
  debug: (msg: LogMsg) => {
    if (msg && typeof msg === "object" && "sql" in msg) {
      console.log(`[SQL] ${(msg as { sql: string }).sql}`);
    }
  },
  error: (msg: LogMsg) => {
    if (msg && typeof msg === "object" && "err" in msg) {
      console.error(`[QUERY ERROR]`, msg);
    }
  },
  info: () => {},
  warn: () => {},
  trace: () => {},
  fatal: () => {},
};
