import {
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  ScriptTarget,
  type ShorthandPropertyAssignment,
  type SourceFile,
  SyntaxKind,
  ts,
} from "ts-morph";
import { type PathAliasResolver, resolveImportPath } from "./tsconfig-paths.js";

interface SourceEntry {
  filePath: string;
  source: string;
}

interface ExportedObject {
  filePath: string;
  objectName: string;
  properties: Set<string>;
}

/**
 * Properties on exported object literals that are referenced as a whole in
 * other files within the analyzed directory (e.g. `logger: kyselyLogger`).
 */
export function collectCrossFileObjectReads(
  sources: SourceEntry[],
  options: { pathAliasResolver?: PathAliasResolver } = {},
): Set<string> {
  if (sources.length < 2) {
    return new Set();
  }

  const knownFiles = new Set(sources.map((entry) => entry.filePath));
  const project = createProject(sources);
  const exportedObjects = new Map<string, ExportedObject>();

  for (const entry of sources) {
    const sourceFile = project.getSourceFile(entry.filePath);
    if (!sourceFile) {
      continue;
    }

    for (const exported of collectExportedObjectLiterals(
      sourceFile,
      entry.filePath,
    )) {
      exportedObjects.set(
        exportKey(exported.filePath, exported.objectName),
        exported,
      );
    }
  }

  const crossFileReads = new Set<string>();

  for (const entry of sources) {
    const sourceFile = project.getSourceFile(entry.filePath);
    if (!sourceFile) {
      continue;
    }

    for (const importDecl of sourceFile.getImportDeclarations()) {
      if (importDecl.isTypeOnly()) {
        continue;
      }

      const resolvedPath = resolveImportPath(
        entry.filePath,
        importDecl.getModuleSpecifierValue(),
        knownFiles,
        options.pathAliasResolver,
      );
      if (!resolvedPath) {
        continue;
      }

      for (const namedImport of importDecl.getNamedImports()) {
        const importedName = namedImport.getName();
        const localName = namedImport.getNameNode().getText();
        const exported = exportedObjects.get(
          exportKey(resolvedPath, importedName),
        );
        if (!exported) {
          continue;
        }

        collectImportedBindingReads(
          sourceFile,
          localName,
          exported,
          crossFileReads,
        );
      }
    }
  }

  return crossFileReads;
}

function createProject(sources: SourceEntry[]): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
      jsx: sources.some((entry) => entry.filePath.endsWith(".tsx"))
        ? ts.JsxEmit.React
        : undefined,
    },
  });

  for (const entry of sources) {
    project.createSourceFile(entry.filePath, entry.source, {
      overwrite: true,
    });
  }

  return project;
}

function collectExportedObjectLiterals(
  sourceFile: SourceFile,
  filePath: string,
): ExportedObject[] {
  const exported: ExportedObject[] = [];

  for (const statement of sourceFile.getVariableStatements()) {
    if (!statement.isExported()) {
      continue;
    }

    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
        continue;
      }

      const properties = extractPropertyNames(initializer);
      if (properties.size === 0) {
        continue;
      }

      exported.push({
        filePath,
        objectName: declaration.getName(),
        properties,
      });
    }
  }

  for (const exportDecl of sourceFile.getExportDeclarations()) {
    if (exportDecl.getModuleSpecifier()) {
      continue;
    }

    for (const namedExport of exportDecl.getNamedExports()) {
      const exportName = namedExport.getName();
      const declaration = sourceFile.getVariableDeclaration(exportName);
      if (!declaration) {
        continue;
      }

      const initializer = declaration.getInitializer();
      if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
        continue;
      }

      const properties = extractPropertyNames(initializer);
      if (properties.size === 0) {
        continue;
      }

      exported.push({
        filePath,
        objectName: exportName,
        properties,
      });
    }
  }

  return exported;
}

function extractPropertyNames(
  objectLiteral: ObjectLiteralExpression,
): Set<string> {
  const properties = new Set<string>();

  for (const property of objectLiteral.getProperties()) {
    if (
      !Node.isPropertyAssignment(property) &&
      !Node.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const name = getPropertyAssignmentName(property);
    if (name) {
      properties.add(name);
    }
  }

  return properties;
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

function collectImportedBindingReads(
  sourceFile: SourceFile,
  localName: string,
  exported: ExportedObject,
  crossFileReads: Set<string>,
): void {
  const accessedProperties = collectAccessedProperties(sourceFile, localName);

  if (hasWholeObjectReference(sourceFile, localName)) {
    for (const propertyName of exported.properties) {
      crossFileReads.add(
        deadPropertyKey(exported.filePath, exported.objectName, propertyName),
      );
    }
    return;
  }

  for (const propertyName of accessedProperties) {
    if (exported.properties.has(propertyName)) {
      crossFileReads.add(
        deadPropertyKey(exported.filePath, exported.objectName, propertyName),
      );
    }
  }
}

function hasWholeObjectReference(
  sourceFile: SourceFile,
  bindingName: string,
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((identifier) => {
      if (identifier.getText() !== bindingName) {
        return false;
      }

      if (isImportOrDeclarationBinding(identifier)) {
        return false;
      }

      const parent = identifier.getParent();
      if (
        Node.isPropertyAccessExpression(parent) &&
        parent.getExpression() === identifier
      ) {
        return false;
      }

      if (
        Node.isElementAccessExpression(parent) &&
        parent.getExpression() === identifier
      ) {
        return false;
      }

      return true;
    });
}

function collectAccessedProperties(
  sourceFile: SourceFile,
  bindingName: string,
): Set<string> {
  const properties = new Set<string>();

  for (const access of sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    if (access.getExpression().getText() !== bindingName) {
      continue;
    }

    properties.add(access.getName());
  }

  for (const access of sourceFile.getDescendantsOfKind(
    SyntaxKind.ElementAccessExpression,
  )) {
    if (access.getExpression().getText() !== bindingName) {
      continue;
    }

    const argumentExpression = access.getArgumentExpression();
    if (
      argumentExpression &&
      (Node.isStringLiteral(argumentExpression) ||
        Node.isNoSubstitutionTemplateLiteral(argumentExpression))
    ) {
      properties.add(argumentExpression.getLiteralValue());
    }
  }

  return properties;
}

function isImportOrDeclarationBinding(identifier: Node): boolean {
  const parent = identifier.getParent();
  if (Node.isImportSpecifier(parent) && parent.getNameNode() === identifier) {
    return true;
  }

  if (
    Node.isVariableDeclaration(parent) &&
    parent.getNameNode() === identifier
  ) {
    return true;
  }

  return false;
}

function exportKey(filePath: string, objectName: string): string {
  return `${filePath}:${objectName}`;
}

export function deadPropertyKey(
  filePath: string,
  objectName: string,
  propertyName: string,
): string {
  return `${filePath}:${objectName}:${propertyName}`;
}
