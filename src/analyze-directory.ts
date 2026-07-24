import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import picomatch from "picomatch";
import { analyzeSource } from "./analyze.js";
import {
  collectCrossFileObjectReads,
  deadPropertyKey,
} from "./cross-file-exports.js";
import type { AnalysisResult } from "./types.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export interface AnalyzeDirectoryOptions {
  ignore?: string[];
}

export async function analyzeDirectory(
  dirPath: string,
  options: AnalyzeDirectoryOptions = {},
): Promise<AnalysisResult> {
  const shouldIgnore =
    options.ignore && options.ignore.length > 0
      ? picomatch(options.ignore, { dot: true })
      : () => false;
  const files: string[] = [];
  const dirsToWalk = [dirPath];

  while (dirsToWalk.length > 0) {
    const currentDir = dirsToWalk.pop() as string;
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      const relativePath = relative(dirPath, absolutePath);

      if (entry.isDirectory()) {
        if (!shouldIgnore(relativePath)) {
          dirsToWalk.push(absolutePath);
        }
        continue;
      }

      if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(extname(entry.name)) &&
        !shouldIgnore(relativePath)
      ) {
        files.push(absolutePath);
      }
    }
  }

  files.sort();

  const sources = await Promise.all(
    files.map(async (absolutePath) => {
      const filePath = relative(dirPath, absolutePath);
      const source = await readFile(absolutePath, "utf8");
      return { filePath, source };
    }),
  );

  const crossFileReads = collectCrossFileObjectReads(sources);

  const results = sources.map(({ filePath, source }) =>
    analyzeSource(source, { filePath }),
  );

  return {
    deadProperties: results
      .flatMap((result) => result.deadProperties)
      .filter(
        (deadProperty) =>
          !crossFileReads.has(
            deadPropertyKey(
              deadProperty.file,
              deadProperty.objectName,
              deadProperty.propertyName,
            ),
          ),
      ),
  };
}
