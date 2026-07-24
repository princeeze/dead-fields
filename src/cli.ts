#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand, runMain } from "citty";
import { analyzeDirectory } from "./analyze-directory.js";
import { analyzeFile } from "./analyze-file.js";
import { formatResults } from "./cli/format.js";
import { resolveCliOptions } from "./cli/resolve-options.js";

const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  version?: string;
};

const main = defineCommand({
  meta: {
    name: "dead-fields",
    version: packageJson.version,
    description:
      "Detect object literal properties that are never read via dot notation",
  },
  args: {
    path: {
      type: "positional",
      description: "Source file or directory to analyze",
      required: false,
    },
    config: {
      type: "string",
      description: "Path to a dead-fields config file",
      alias: "c",
    },
    ignore: {
      type: "string",
      description: "Glob pattern to ignore (repeatable)",
      alias: "i",
    },
    format: {
      type: "enum",
      description: "Output format",
      options: ["pretty", "json"],
      default: "pretty",
    },
    color: {
      type: "boolean",
      description: "Colorize output when writing to a TTY",
      default: process.stdout.isTTY,
    },
  },
  async run({ args }) {
    try {
      const options = await resolveCliOptions({
        path: args.path,
        config: args.config,
        ignore: args.ignore,
        format: args.format,
        color: args.color,
      });

      const cwd = process.cwd();
      const sourcePath = resolve(cwd, options.source);
      const sourceStat = await stat(sourcePath);
      const result = sourceStat.isDirectory()
        ? await analyzeDirectory(sourcePath, { ignore: options.ignore })
        : await analyzeFile(sourcePath);
      const output = await formatResults(
        result,
        {
          format: options.format,
          color: options.color,
        },
        {
          sourceRoot: sourcePath,
          isDirectory: sourceStat.isDirectory(),
          cwd,
        },
      );

      process.stdout.write(output);

      if (result.deadProperties.length > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      process.stderr.write(`dead-fields: ${message}\n`);
      process.exitCode = 1;
    }
  },
});

await runMain(main);
