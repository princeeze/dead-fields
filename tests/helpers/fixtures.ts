import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalysisResult } from "../../src/types.js";

export interface FixtureCase {
  name: string;
  dir: string;
  srcDir: string;
}

export interface ExpectedDeadProperty {
  file: string;
  objectName: string;
  propertyName: string;
}

export interface FixtureExpected {
  deadProperties: ExpectedDeadProperty[];
}

const CASES_ROOT = join(import.meta.dirname, "..", "cases");

export function discoverFixtureCases(root = CASES_ROOT): FixtureCase[] {
  const cases: FixtureCase[] = [];

  for (const category of readdirSync(root, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }

    const categoryPath = join(root, category.name);

    for (const entry of readdirSync(categoryPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const caseDir = join(categoryPath, entry.name);
      const srcDir = join(caseDir, "src");

      if (!existsSync(srcDir)) {
        continue;
      }

      cases.push({
        name: `${category.name}/${entry.name}`,
        dir: caseDir,
        srcDir,
      });
    }
  }

  return cases.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadExpected(caseDir: string): FixtureExpected {
  const expectedPath = join(caseDir, "expected.json");
  return JSON.parse(readFileSync(expectedPath, "utf8")) as FixtureExpected;
}

export function writeExpected(
  caseDir: string,
  expected: FixtureExpected,
): void {
  const expectedPath = join(caseDir, "expected.json");
  writeFileSync(expectedPath, `${JSON.stringify(expected, null, 2)}\n`);
}

export function toFixtureExpected(result: AnalysisResult): FixtureExpected {
  return {
    deadProperties: sortExpectedDeadProperties(
      result.deadProperties.map(({ file, objectName, propertyName }) => ({
        file,
        objectName,
        propertyName,
      })),
    ),
  };
}

 function sortExpectedDeadProperties(
  deadProperties: ExpectedDeadProperty[],
): ExpectedDeadProperty[] {
  return [...deadProperties].sort((left, right) => {
    return (
      left.file.localeCompare(right.file) ||
      left.objectName.localeCompare(right.objectName) ||
      left.propertyName.localeCompare(right.propertyName)
    );
  });
}
