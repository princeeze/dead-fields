import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { analyzeSource } from "./analyze.js";
import type { AnalysisResult } from "./types.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export async function analyzeDirectory(dirPath: string): Promise<AnalysisResult> {
  const files = await collectSourceFiles(dirPath);
  const deadProperties: AnalysisResult["deadProperties"] = [];

  for (const absolutePath of files) {
    const source = await readFile(absolutePath, "utf8");
    const filePath = relative(dirPath, absolutePath);
    const result = analyzeSource(source, { filePath });

    deadProperties.push(...result.deadProperties);
  }

  return { deadProperties };
}

async function collectSourceFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}
