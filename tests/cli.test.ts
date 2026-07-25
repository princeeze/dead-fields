import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_FILENAME,
  getDefaultConfigContent,
} from "../src/cli/init.js";
import { PACKAGE_SCHEMA_PATH } from "../src/constants.js";

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
    expect(stdout).toContain("init");
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

  it("creates a default config file with init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dead-fields-init-"));

    const { stdout, exitCode } = await execa("node", [cliPath, "init"], {
      cwd: dir,
      reject: false,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Created ${DEFAULT_CONFIG_FILENAME}`);

    const content = await readFile(join(dir, DEFAULT_CONFIG_FILENAME), "utf8");
    expect(content).toBe(getDefaultConfigContent());
    expect(JSON.parse(content)).toEqual({
      $schema: PACKAGE_SCHEMA_PATH,
      source: "./src",
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    });
  });

  it("refuses to overwrite an existing config without --force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dead-fields-init-"));
    await writeFile(join(dir, DEFAULT_CONFIG_FILENAME), "{}");

    const { stderr, exitCode } = await execa("node", [cliPath, "init"], {
      cwd: dir,
      reject: false,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("already exists");
  });

  it("overwrites an existing config with init --force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dead-fields-init-"));
    await writeFile(join(dir, DEFAULT_CONFIG_FILENAME), "{}");

    const { exitCode } = await execa("node", [cliPath, "init", "--force"], {
      cwd: dir,
      reject: false,
    });

    expect(exitCode).toBe(0);

    const content = await readFile(join(dir, DEFAULT_CONFIG_FILENAME), "utf8");
    expect(content).toBe(getDefaultConfigContent());
  });
});
