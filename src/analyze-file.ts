import { readFile } from "node:fs/promises";
import { analyzeSource } from "./analyze.js";
import type { AnalysisResult } from "./types.js";

export async function analyzeFile(filePath: string): Promise<AnalysisResult> {
  const source = await readFile(filePath, "utf8");
  return analyzeSource(source, { filePath });
}
