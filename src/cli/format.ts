import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import pc from "picocolors";
import type { AnalysisResult } from "../types.js";
import { renderSnippet } from "./snippet.js";

export type OutputFormat = "pretty" | "json";

export interface FormatOptions {
  format: OutputFormat;
  color: boolean;
}

export interface FormatContext {
  sourceRoot: string;
  isDirectory: boolean;
  cwd?: string;
  /** Optional preloaded sources for tests, keyed by resolved absolute path */
  sources?: Record<string, string>;
}

function resolveSourcePath(context: FormatContext, file: string): string {
  if (context.isDirectory) {
    return resolve(context.sourceRoot, file);
  }

  if (isAbsolute(file)) {
    return file;
  }

  return resolve(context.sourceRoot);
}

export async function formatResults(
  result: AnalysisResult,
  options: FormatOptions,
  context: FormatContext,
): Promise<string> {
  if (options.format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const sorted = [...result.deadProperties].sort((left, right) => {
    return (
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.objectName.localeCompare(right.objectName) ||
      left.propertyName.localeCompare(right.propertyName)
    );
  });
  const green = options.color ? pc.green : (value: string) => value;
  const red = options.color ? pc.red : (value: string) => value;

  if (sorted.length === 0) {
    return `${green("✓")} No dead properties found\n`;
  }

  const color = options.color;
  const dim = color ? pc.dim : (value: string) => value;
  const bold = color ? pc.bold : (value: string) => value;
  const boldCyan = color
    ? (value: string) => pc.bold(pc.cyan(value))
    : (value: string) => value;
  const sourceCache = new Map<string, string>();
  const diagnostics: string[] = [];

  for (const deadProperty of sorted) {
    const sourcePath = resolveSourcePath(context, deadProperty.file);
    let source = sourceCache.get(sourcePath);

    if (source === undefined) {
      if (context.sources?.[sourcePath] !== undefined) {
        source = context.sources[sourcePath];
      } else {
        source = await readFile(sourcePath, "utf8");
      }
      sourceCache.set(sourcePath, source);
    }

    const cwd = context.cwd ?? process.cwd();
    const absolutePath = resolveSourcePath(context, deadProperty.file);
    const relativePath = relative(cwd, absolutePath);
    const displayFile = relativePath.startsWith("..")
      ? absolutePath
      : relativePath;
    const location = bold(
      `${displayFile}:${deadProperty.line}:${deadProperty.column}`,
    );
    const snippet = renderSnippet(
      source,
      deadProperty.line,
      deadProperty.column,
      deadProperty.propertyName.length,
      {
        propertyName: deadProperty.propertyName,
        highlight: color ? pc.yellow : (value: string) => value,
        gutter: dim,
        marker: color ? pc.red : (value: string) => value,
      },
    ).join("\n");
    const explanation = boldCyan(
      `Property \`${deadProperty.propertyName}\` on object ` +
        `\`${deadProperty.objectName}\` is declared but never read.`,
    );

    diagnostics.push([location, "", snippet, "", explanation].join("\n"));
  }

  const fileCount = new Set(sorted.map((deadProperty) => deadProperty.file))
    .size;
  const propertyLabel = sorted.length === 1 ? "property" : "properties";
  const fileLabel = fileCount === 1 ? "file" : "files";
  const summary = red(
    `✖ ${sorted.length} dead ${propertyLabel} in ${fileCount} ${fileLabel}`,
  );

  return `${diagnostics.join("\n\n")}\n\n${summary}\n`;
}
