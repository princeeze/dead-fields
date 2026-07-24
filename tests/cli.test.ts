import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

const cliPath = join(import.meta.dirname, "..", "dist", "cli.js");
const fixturePath = join(
  import.meta.dirname,
  "cases",
  "supported",
  "detect-unused-properties",
  "src",
);

describe("dead-fields CLI", () => {
  it("prints help", async () => {
    const { stdout } = await execa("node", [cliPath, "--help"]);

    expect(stdout).toContain("dead-fields");
    expect(stdout).toContain("--ignore");
  });

  it("reports dead properties with exit code 1", async () => {
    const { stdout, exitCode } = await execa("node", [cliPath, fixturePath], {
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("src/index.ts:3:3");
    expect(stdout).toContain(
      "Property `port` on object `dbConfig` is declared but never read.",
    );
    expect(stdout).toContain("✖ 2 dead properties in 1 file");
  });

  it("returns exit code 0 for clean files", async () => {
    const cleanFixture = join(
      import.meta.dirname,
      "cases",
      "edge-cases",
      "no-object-literals",
      "src",
    );

    const { stdout, exitCode } = await execa("node", [cliPath, cleanFixture], {
      reject: false,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("✓ No dead properties found");
  });

  it("supports JSON output", async () => {
    const { stdout, exitCode } = await execa(
      "node",
      [cliPath, fixturePath, "--format", "json"],
      { reject: false },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).deadProperties).toHaveLength(2);
  });
});
