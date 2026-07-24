export interface DeadProperty {
  /** Path to the source file, relative to the analyzed directory */
  file: string;
  /** Variable name the object literal is assigned to */
  objectName: string;
  /** Property name on the object literal */
  propertyName: string;
  /** 1-based line of the property in the source */
  line: number;
  /** 1-based column of the property in the source */
  column: number;
}

export interface AnalysisResult {
  deadProperties: DeadProperty[];
}

export interface AnalyzeOptions {
  /** Virtual file path used for parsing (defaults to "source.ts") */
  filePath?: string;
}
