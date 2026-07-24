import {
  Node,
  Project,
  ScriptTarget,
  SyntaxKind,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
} from "ts-morph";
import { JsxEmit } from "typescript";
import type { AnalysisResult, AnalyzeOptions, DeadProperty } from "./types.js";

interface TrackedObject {
  objectName: string;
  properties: Map<string, { line: number; column: number }>;
}

export function analyzeSource(
  source: string,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const filePath = options.filePath ?? "source.ts";

  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
      jsx: filePath.endsWith(".tsx") ? JsxEmit.React : undefined,
    },
  });

  const sourceFile = project.createSourceFile(filePath, source, {
    overwrite: true,
  });

  const trackedObjects = collectObjectLiterals(sourceFile);
  const deadProperties: DeadProperty[] = [];

  for (const tracked of trackedObjects) {
    const readProperties = collectDirectPropertyReads(
      sourceFile,
      tracked.objectName,
    );

    for (const [propertyName, location] of tracked.properties) {
      if (!readProperties.has(propertyName)) {
        deadProperties.push({
          file: filePath,
          objectName: tracked.objectName,
          propertyName,
          line: location.line,
          column: location.column,
        });
      }
    }
  }

  return { deadProperties };
}

function collectObjectLiterals(sourceFile: import("ts-morph").SourceFile): TrackedObject[] {
  const results: TrackedObject[] = [];

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      continue;
    }

    const objectName = declaration.getName();
    const properties = extractPropertyNames(initializer);

    if (properties.size > 0) {
      results.push({ objectName, properties });
    }

    collectNestedObjectLiterals(initializer, objectName, results);
  }

  return results;
}

function collectNestedObjectLiterals(
  objectLiteral: ObjectLiteralExpression,
  parentPath: string,
  results: TrackedObject[],
): void {
  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }

    const initializer = property.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      continue;
    }

    const propertyName = getPropertyAssignmentName(property);
    if (!propertyName) {
      continue;
    }

    const nestedPath = `${parentPath}.${propertyName}`;
    const properties = extractPropertyNames(initializer);

    if (properties.size > 0) {
      results.push({ objectName: nestedPath, properties });
    }

    collectNestedObjectLiterals(initializer, nestedPath, results);
  }
}

function extractPropertyNames(
  objectLiteral: ObjectLiteralExpression,
): Map<string, { line: number; column: number }> {
  const properties = new Map<string, { line: number; column: number }>();

  for (const property of objectLiteral.getProperties()) {
    const name = getPropertyName(property);
    if (!name) {
      continue;
    }

    if (
      !Node.isPropertyAssignment(property) &&
      !Node.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const nameNode = property.getNameNode();
    const { line, column } = nameNode
      .getSourceFile()
      .getLineAndColumnAtPos(nameNode.getStart());

    properties.set(name, { line, column });
  }

  return properties;
}

function getPropertyName(
  property: import("ts-morph").ObjectLiteralElementLike,
): string | undefined {
  if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
    return getPropertyAssignmentName(property);
  }
  return undefined;
}

function getPropertyAssignmentName(
  property: PropertyAssignment | ShorthandPropertyAssignment,
): string | undefined {
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  return undefined;
}

function collectDirectPropertyReads(
  sourceFile: import("ts-morph").SourceFile,
  objectName: string,
): Set<string> {
  const readProperties = new Set<string>();

  for (const access of sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    if (access.hasQuestionDotToken() || isInsideJsx(access)) {
      continue;
    }

    if (access.getExpression().getText() !== objectName) {
      continue;
    }

    readProperties.add(access.getName());
  }

  return readProperties;
}

function isInsideJsx(node: Node): boolean {
  let current: Node | undefined = node;

  while (current) {
    if (
      Node.isJsxAttribute(current) ||
      Node.isJsxExpression(current) ||
      Node.isJsxElement(current) ||
      Node.isJsxSelfClosingElement(current) ||
      Node.isJsxFragment(current)
    ) {
      return true;
    }
    current = current.getParent();
  }

  return false;
}
