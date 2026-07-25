import { z } from "zod";

const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
] as const;

export { DEFAULT_IGNORE_PATTERNS };

export const DeadFieldsConfigSchema = z.object({
  /** Directory or file to analyze. Defaults to "." */
  source: z.string().default("."),
  /** Glob patterns for paths to skip (relative to source root) */
  ignore: z.array(z.string()).default([...DEFAULT_IGNORE_PATTERNS]),
});

export type DeadFieldsConfig = z.infer<typeof DeadFieldsConfigSchema>;
