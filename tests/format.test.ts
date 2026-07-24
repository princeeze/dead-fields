import { describe, expect, it } from "vitest";
import { formatResults } from "../src/cli/format.js";

const sampleSource = `const config = {
  host: "localhost",
  port: 5432,
  ssl: true,
};

console.log(config.host);
`;

describe("formatResults", () => {
  const result = {
    deadProperties: [
      {
        file: "src/config.ts",
        objectName: "config",
        propertyName: "port",
        line: 3,
        column: 3,
      },
      {
        file: "src/config.ts",
        objectName: "config",
        propertyName: "ssl",
        line: 4,
        column: 3,
      },
    ],
  };

  const formatContext = {
    sourceRoot: "/project",
    isDirectory: true,
    cwd: "/project",
    sources: {
      "/project/src/config.ts": sampleSource,
    },
  };

  it("shows the path, a code snippet, and a human-readable explanation", async () => {
    const output = await formatResults(
      result,
      { format: "pretty", color: false },
      formatContext,
    );

    expect(output).toContain("src/config.ts:3:3");
    expect(output).toContain("> 3 │   port: 5432,");
    expect(output).toContain("        ^^^^");
    expect(output).toContain(
      "Property `port` on object `config` is declared but never read.",
    );
    expect(output).toContain("src/config.ts:4:3");
    expect(output).toContain("✖ 2 dead properties in 1 file");
  });

  it("formats a clean summary when no issues are found", async () => {
    const output = await formatResults(
      { deadProperties: [] },
      { format: "pretty", color: false },
      formatContext,
    );

    expect(output).toBe("✓ No dead properties found\n");
  });

  it("formats JSON output", async () => {
    const output = await formatResults(
      result,
      { format: "json", color: false },
      formatContext,
    );

    expect(JSON.parse(output)).toEqual(result);
  });
});
