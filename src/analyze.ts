/**
 * Core analysis engine for dead-fields.
 *
 * This file answers one question: "Which properties on object literals are
 * declared but never read via dot notation (like `config.port`)?"
 *
 * How it works, in two passes:
 *   1. Find every object literal assigned to a variable (e.g. `const config = { … }`).
 *   2. For each one, compare its declared property names against every
 *      `variableName.propertyName` read in the same file.
 *
 * Anything declared but never read is reported as a "dead property".
 *
 * This module is called by analyze-file.ts (single file) and analyze-directory.ts
 * (whole folder). If you want to change what counts as a read or a declaration,
 * this is the file to edit.
 *
 * ── Running example used in the comments below ──────────────────────────
 *
 *   const config = {
 *     host: "localhost",
 *     port: 3000,
 *     deprecated: true,
 *   };
 *
 *   console.log(config.host);
 *
 * Expected result: `port` and `deprecated` are dead because only `config.host`
 * is read. `host` is used and is therefore not reported.
 *
 * ── Key terms ───────────────────────────────────────────────────────────
 *
 * AST (Abstract Syntax Tree)
 *   A tree representation of source code produced by the TypeScript parser.
 *   Instead of reading text character by character, we walk this tree to find
 *   patterns like "variable assigned to object literal" or "property access".
 *
 * ts-morph
 *   A library that wraps the TypeScript compiler API and makes the AST easy
 *   to navigate. We use it to parse a source string in memory (no files on disk).
 *
 * Object literal
 *   A `{ key: value, … }` expression in JavaScript/TypeScript.
 *
 * Property access
 *   Reading a property with a dot, like `config.host`. This is the only kind
 *   of read we detect in phase 1. Destructuring, spreads, and aliases are
 *   not supported yet (see README "Phase 1 scope").
 */

import {
  type BindingElement,
  Node,
  type ObjectLiteralExpression,
  Project,
  type PropertyAssignment,
  ScriptTarget,
  type ShorthandPropertyAssignment,
  SyntaxKind,
  ts,
  type VariableDeclaration,
} from "ts-morph";
import type { AnalysisResult, AnalyzeOptions, DeadProperty } from "./types.js";

/**
 * Internal bookkeeping for one object literal we want to analyze.
 *
 * When we find `const config = { host: "x", port: 1 }`, we create:
 *
 *   objectName:  "config"
 *   properties:  a map from each property name to where it appears in source
 *                e.g. "host" → line 1, column 16
 *                     "port" → line 1, column 29
 *
 * Nested objects get their own TrackedObject with a dotted name like
 * "config.database" (see collectNestedObjectLiterals).
 */
interface TrackedObject {
  objectName: string;
  properties: Map<string, { line: number; column: number }>;
}

/**
 * Analyze a source string and return every dead property found in it.
 *
 * @param source  - The full text of a TypeScript/TSX file.
 * @param options - Must include `filePath`, used only for reporting (the file
 *                  is not read from disk; parsing happens in memory).
 *
 * @returns An object with a `deadProperties` array. Each entry tells you which
 *          file, which variable, which property, and where in the file it sits.
 */
export function analyzeSource(
  source: string,
  options: AnalyzeOptions,
): AnalysisResult {
  // The file path is included in every dead-property report so callers know
  // where the issue lives. For the running example this would be something
  // like "src/config.ts".
  const { filePath } = options;

  // Create a throwaway TypeScript project that lives entirely in memory.
  // We never write to disk — we just need a parser.
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
      // TSX files contain JSX (`<Component />`). Tell the parser to expect it
      // when the virtual file path ends in `.tsx`. Plain `.ts` files leave
      // this undefined.
      jsx: filePath.endsWith(".tsx") ? ts.JsxEmit.React : undefined,
    },
  });

  // Turn the source string into a parsed AST (a SourceFile node).
  // From this point on we navigate the tree with ts-morph helpers instead of
  // searching raw text.
  const sourceFile = project.createSourceFile(filePath, source, {
    overwrite: true,
  });

  // ── Pass 1: collect declarations ──────────────────────────────────────
  //
  // Walk every variable declaration in the file (`const`, `let`, or `var`) and
  // keep the ones whose right-hand side is an object literal `{ … }`.
  //
  // Example file:
  //
  //   const config = {
  //     host: "localhost",
  //     database: { host: "db", port: 5432 },
  //   };
  //   const count = 42;
  //
  // What happens:
  //   - `const config = { … }` → tracked (object literal on the right)
  //   - `const count = 42`     → skipped (a number, not an object literal)
  //
  // For the running example this produces one TrackedObject named "config"
  // whose properties map contains "host", "port", and "deprecated".
  const trackedObjects: TrackedObject[] = [];

  // getVariableDeclarations() returns every `const x = …` / `let x = …` node
  // in the file, regardless of whether it is at the top level or inside a block.
  // For-loop initializers are handled separately below.
  for (const declaration of sourceFile.getVariableDeclarations()) {
    trackObjectLiteralDeclaration(declaration, trackedObjects);
  }

  for (const forStatement of sourceFile.getDescendantsOfKind(
    SyntaxKind.ForStatement,
  )) {
    const initializer = forStatement.getInitializer();
    if (!initializer || !Node.isVariableDeclarationList(initializer)) {
      continue;
    }

    for (const declaration of initializer.getDeclarations()) {
      trackObjectLiteralDeclaration(declaration, trackedObjects);
    }
  }

  // This array will hold the final list of dead properties. It starts empty
  // and grows as we compare declarations against reads in pass 2.
  const deadProperties: DeadProperty[] = [];

  const aliases = buildAliasMap(sourceFile);
  const stringLiterals = buildStringLiteralMap(sourceFile);

  // ── Pass 2: compare declarations to reads ─────────────────────────────
  //
  // For each object we tracked in pass 1, figure out which of its properties
  // are actually accessed somewhere in the file.
  for (const tracked of trackedObjects) {
    // Find every `config.something` read in the file.
    //
    // We search the entire file for expressions shaped like
    // `objectName.propertyName` and collect the property names from the right
    // side of the dot.
    //
    // Example — searching for reads of "config":
    //
    //   console.log(config.host);          // counts: "host"
    //   const y = config.database.host;    // does NOT count toward "config"
    //
    // Reads we intentionally ignore (see README "Phase 1 scope"):
    //
    // For the running example, the only match is `config.host`, so
    // readProperties ends up containing just "host".
    const readProperties = new Set<string>();

    // A PropertyAccessExpression is any `something.property` in the AST.
    // getDescendantsOfKind walks the entire tree and returns every match.
    for (const access of sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      // The "expression" is everything to the left of the dot.
      // In `config.host`, the expression is `config`.
      // We only count reads where the expression matches the objectName we are
      // currently analyzing, including reads through a simple alias binding.
      const expressionName = access.getExpression().getText();
      if (resolveAlias(expressionName, aliases) !== tracked.objectName) {
        continue;
      }

      // The "name" is the identifier to the right of the dot.
      readProperties.add(access.getName());
    }

    for (const access of sourceFile.getDescendantsOfKind(
      SyntaxKind.ElementAccessExpression,
    )) {
      const expressionName = access.getExpression().getText();
      if (resolveAlias(expressionName, aliases) !== tracked.objectName) {
        continue;
      }

      const argumentExpression = access.getArgumentExpression();
      if (!argumentExpression) {
        continue;
      }

      const propertyName = resolveComputedPropertyName(
        argumentExpression,
        stringLiterals,
      );
      if (propertyName) {
        readProperties.add(propertyName);
      }
    }

    for (const declaration of sourceFile.getVariableDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !Node.isIdentifier(initializer)) {
        continue;
      }

      if (resolveAlias(initializer.getText(), aliases) !== tracked.objectName) {
        continue;
      }

      const nameNode = declaration.getNameNode();
      if (!Node.isObjectBindingPattern(nameNode)) {
        continue;
      }

      for (const element of nameNode.getElements()) {
        const propertyName = getBindingElementPropertyName(element);
        if (propertyName) {
          readProperties.add(propertyName);
        }
      }
    }

    // Go through every property declared on this object literal.
    for (const [propertyName, location] of tracked.properties) {
      // If the property name never appeared in a dot-access, it is dead.
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

    // After processing "config" in the running example, deadProperties contains:
    //   { objectName: "config", propertyName: "port",       … }
    //   { objectName: "config", propertyName: "deprecated", … }
    // "host" was found in readProperties, so it is not included.
  }

  return { deadProperties };
}

function trackObjectLiteralDeclaration(
  declaration: VariableDeclaration,
  trackedObjects: TrackedObject[],
): void {
  const initializer = declaration.getInitializer();
  if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
    return;
  }

  const objectName = declaration.getName();
  const properties = extractPropertyNames(initializer);

  if (properties.size > 0) {
    trackedObjects.push({ objectName, properties });
  }

  collectNestedObjectLiterals(initializer, objectName, trackedObjects);
}

/**
 * Find object literals nested inside another object literal's property values.
 *
 * This function is called recursively. Each time it finds a property whose
 * value is another `{ … }`, it creates a new TrackedObject with a dotted path.
 *
 * Example — given this declaration:
 *
 *   const config = {
 *     host: "localhost",                        // value is a string → skip
 *     database: { host: "db", port: 5432 },    // value is an object → track
 *   };
 *
 * On the first call, parentPath is "config" and we walk the outer `{ … }`.
 * When we reach the `database` property:
 *   - Its value is an object literal, so we track it as "config.database".
 *   - We then recurse into that inner literal in case it has further nesting.
 *
 * The new entry appended to results:
 *
 *   { objectName: "config.database", properties: { host, port } }
 *
 * Why dotted paths matter:
 *   A read like `config.database.host` is matched against the object named
 *   "config.database", not "config". Each nesting level is analyzed on its own.
 */
function collectNestedObjectLiterals(
  objectLiteral: ObjectLiteralExpression,
  parentPath: string,
  results: TrackedObject[],
): void {
  // getProperties() returns every member inside the `{ … }` — assignments,
  // shorthand properties, methods, spreads, etc.
  for (const property of objectLiteral.getProperties()) {
    // Only `key: value` assignments can have a nested object as their value.
    // We skip spreads (`...rest`), methods (`fn() {}`), and getters/setters
    // because they are different AST node types.
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }

    // The initializer is the expression after the colon in `key: value`.
    const initializer = property.getInitializer();

    // If the value is not another object literal (e.g. it is a string or
    // number), there is nothing nested to track here.
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      continue;
    }

    // Read the property key (e.g. "database" from `database: { … }`).
    const propertyName = getPropertyAssignmentName(property);
    if (!propertyName) {
      continue;
    }

    // Combine the parent path with this key to form the dotted access path.
    // parentPath "config" + propertyName "database" → "config.database"
    const nestedPath = `${parentPath}.${propertyName}`;

    // Collect the property names declared inside the nested object literal.
    const properties = extractPropertyNames(initializer);

    if (properties.size > 0) {
      results.push({ objectName: nestedPath, properties });
    }

    // The nested literal might itself contain further nested objects.
    // Call this function again on the inner literal to handle arbitrary depth.
    collectNestedObjectLiterals(initializer, nestedPath, results);
  }
}

/**
 * Build a map of property names → source locations for one object literal.
 *
 * Given `{ host: "x", port, fn() {} }`:
 *
 *   "host" → included (normal `key: value` assignment)
 *   "port" → included (shorthand for `port: port`)
 *   "fn"   → skipped (this is a method, not a data property)
 *
 * The line and column values are 1-based (first line is line 1, not 0) so
 * they match what editors and humans expect.
 *
 * To support a new property form (e.g. getters), add a branch in the loop below.
 */
function extractPropertyNames(
  objectLiteral: ObjectLiteralExpression,
): Map<string, { line: number; column: number }> {
  const properties = new Map<string, { line: number; column: number }>();

  for (const property of objectLiteral.getProperties()) {
    // Resolve the property to a plain string name when it is a normal
    // assignment or shorthand. Methods, spreads, and accessors are skipped.
    if (
      !Node.isPropertyAssignment(property) &&
      !Node.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }

    const name = getPropertyAssignmentName(property);
    if (!name) {
      continue;
    }

    // Find the exact position of the property name in the source text.
    const nameNode = property.getNameNode();
    const { line, column } = nameNode
      .getSourceFile()
      .getLineAndColumnAtPos(nameNode.getStart());

    properties.set(name, { line, column });
  }

  return properties;
}

/**
 * Read the identifier text from a property assignment's key.
 *
 * We only support simple identifier keys right now. That means `host` in
 * `{ host: "x" }` works, but `{ ["host"]: "x" }` does not — the key is a
 * string literal expression, not an identifier, so we return undefined.
 *
 * To add computed-key support, you would handle non-identifier name nodes here.
 */
function getPropertyAssignmentName(
  property: PropertyAssignment | ShorthandPropertyAssignment,
): string | undefined {
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  return undefined;
}

/**
 * Map variable names to the identifier they were assigned from.
 *
 * Example — `const aliasRef = aliasSource` records `aliasRef → aliasSource`.
 * Only direct identifier assignments are tracked; object literals and other
 * expressions are ignored.
 */
function buildAliasMap(
  sourceFile: ReturnType<Project["createSourceFile"]>,
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isIdentifier(initializer)) {
      continue;
    }

    aliases.set(declaration.getName(), initializer.getText());
  }

  return aliases;
}

/** Follow alias chains until a non-aliased name is reached. */
function resolveAlias(name: string, aliases: Map<string, string>): string {
  const visited = new Set<string>();
  let current = name;

  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    const aliasCurrent = aliases.get(current);
    if (!aliasCurrent) {
      break;
    }
    current = aliasCurrent;
  }

  return current;
}

function buildStringLiteralMap(
  sourceFile: ReturnType<Project["createSourceFile"]>,
): Map<string, string> {
  const stringLiterals = new Map<string, string>();

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (
      !initializer ||
      (!Node.isStringLiteral(initializer) &&
        !Node.isNoSubstitutionTemplateLiteral(initializer))
    ) {
      continue;
    }

    stringLiterals.set(declaration.getName(), initializer.getLiteralValue());
  }

  return stringLiterals;
}

function resolveComputedPropertyName(
  argumentExpression: Node,
  stringLiterals: Map<string, string>,
): string | undefined {
  if (
    Node.isStringLiteral(argumentExpression) ||
    Node.isNoSubstitutionTemplateLiteral(argumentExpression)
  ) {
    return argumentExpression.getLiteralValue();
  }

  if (Node.isIdentifier(argumentExpression)) {
    return stringLiterals.get(argumentExpression.getText());
  }

  return undefined;
}

function getBindingElementPropertyName(
  element: BindingElement,
): string | undefined {
  const propertyNameNode = element.getPropertyNameNode();
  if (propertyNameNode) {
    if (Node.isIdentifier(propertyNameNode)) {
      return propertyNameNode.getText();
    }
    return undefined;
  }

  const bindingName = element.getNameNode();
  if (Node.isIdentifier(bindingName)) {
    return bindingName.getText();
  }

  return undefined;
}
