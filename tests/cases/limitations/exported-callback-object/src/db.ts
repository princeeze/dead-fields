import { kyselyLogger } from "./db-logger";

interface Logger {
  debug: (msg: unknown) => void;
  error: (msg: unknown) => void;
  info: () => void;
  warn: () => void;
  trace: () => void;
  fatal: () => void;
}

interface DialectOptions {
  logger: Logger;
}

function createDialect(options: DialectOptions) {
  return options;
}

// Consumer passes the whole object; Kysely calls logger.debug(), etc. at runtime.
createDialect({ logger: kyselyLogger });
