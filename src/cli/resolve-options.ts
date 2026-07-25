import { loadConfig } from "c12";
import {
  type DeadFieldsConfig,
  DeadFieldsConfigSchema,
} from "../config/schema.js";
import { CONFIG_BASENAME } from "../constants.js";
import type { OutputFormat } from "./format.js";

export interface CliFlags {
  path?: string;
  config?: string;
  ignore?: string | string[];
  format?: OutputFormat;
  color?: boolean;
}

export interface ResolvedCliOptions {
  source: string;
  ignore: string[];
  format: OutputFormat;
  color: boolean;
}

export async function resolveCliOptions(
  flags: CliFlags,
  cwd = process.cwd(),
): Promise<ResolvedCliOptions> {
  const { config } = await loadConfig<DeadFieldsConfig>({
    name: CONFIG_BASENAME,
    cwd,
    configFile: flags.config,
    packageJson: false,
    rcFile: false,
    globalRc: false,
    dotenv: false,
  });

  const parsedConfig = DeadFieldsConfigSchema.parse(config ?? {});
  const merged = mergeConfigWithFlags(parsedConfig, flags);

  return {
    source: merged.source,
    ignore: merged.ignore,
    format: flags.format ?? "pretty",
    color: flags.color ?? process.stdout.isTTY,
  };
}

export function mergeConfigWithFlags(
  config: DeadFieldsConfig,
  flags: CliFlags,
): Pick<DeadFieldsConfig, "source" | "ignore"> {
  const cliIgnores = flags.ignore
    ? Array.isArray(flags.ignore)
      ? flags.ignore
      : [flags.ignore]
    : [];

  return {
    source: flags.path ?? config.source,
    ignore: [...config.ignore, ...cliIgnores],
  };
}
