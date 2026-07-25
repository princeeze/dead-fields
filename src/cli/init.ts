import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_IGNORE_PATTERNS } from "../config/schema.js";
import { CONFIG_BASENAME, PACKAGE_SCHEMA_PATH } from "../constants.js";

export const DEFAULT_CONFIG_FILENAME = `${CONFIG_BASENAME}.config.json`;

export function getDefaultConfigContent(): string {
  return `${JSON.stringify(
    {
      $schema: PACKAGE_SCHEMA_PATH,
      source: "./src",
      ignore: [...DEFAULT_IGNORE_PATTERNS],
    },
    null,
    2,
  )}\n`;
}

async function createDefaultConfigFile(
  cwd: string,
  options: { force?: boolean } = {},
): Promise<string> {
  const configPath = join(cwd, DEFAULT_CONFIG_FILENAME);

  if (!options.force) {
    try {
      await access(configPath);
      throw new Error(
        `${DEFAULT_CONFIG_FILENAME} already exists (use --force to overwrite)`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw error;
      }
    }
  }

  await writeFile(configPath, getDefaultConfigContent(), "utf8");
  return configPath;
}

export async function runInit(rawArgs: string[]): Promise<void> {
  const force = rawArgs.includes("--force");
  await createDefaultConfigFile(process.cwd(), { force });
  process.stdout.write(`Created ${DEFAULT_CONFIG_FILENAME}\n`);
}
