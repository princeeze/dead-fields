import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeDirectory } from "../src/analyze-directory.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dead-fields-ignore-"));
  tempDirs.push(root);

  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(join(root, "ignored"), { recursive: true });

  await writeFile(
    join(root, "src", "index.ts"),
    `const config = { used: 1, unused: 2 };\nconsole.log(config.used);\n`,
  );
  await writeFile(
    join(root, "node_modules", "pkg", "index.ts"),
    `const config = { used: 1, unused: 2 };\n`,
  );
  await writeFile(
    join(root, "ignored", "index.ts"),
    `const config = { used: 1, unused: 2 };\n`,
  );

  return root;
}

describe("analyzeDirectory ignore", () => {
  it("skips ignored directories and files", async () => {
    const root = await createFixture();

    const result = await analyzeDirectory(root, {
      ignore: ["**/node_modules/**", "ignored/**"],
    });

    expect(result.deadProperties).toEqual([
      expect.objectContaining({
        file: "src/index.ts",
        objectName: "config",
        propertyName: "unused",
      }),
    ]);
  });

  it("analyzes all files when no ignore patterns are provided", async () => {
    const root = await createFixture();

    const result = await analyzeDirectory(root);
    const files = new Set(
      result.deadProperties.map((deadProperty) => deadProperty.file),
    );

    expect(files).toEqual(
      new Set([
        "src/index.ts",
        "node_modules/pkg/index.ts",
        "ignored/index.ts",
      ]),
    );
  });
});
