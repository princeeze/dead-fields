import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { analyzeSource } from "./analyze.js";
import type { AnalysisResult } from "./types.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export async function analyzeDirectory(
  dirPath: string,
): Promise<AnalysisResult> {
  const files: string[] = [];
  const dirsToWalk = [dirPath];

  while (dirsToWalk.length > 0) {
    const currentDir = dirsToWalk.pop() as string;
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        dirsToWalk.push(absolutePath);
        continue;
      }

      if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

  files.sort();

  const results = await Promise.all(
    files.map(async (absolutePath) => {
      const source = await readFile(absolutePath, "utf8");
      const filePath = relative(dirPath, absolutePath);
      return analyzeSource(source, { filePath });
    }),
  );

  return {
    deadProperties: results.flatMap((result) => result.deadProperties),
  };
}
