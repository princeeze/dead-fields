import { describe, expect, it } from "vitest";
import { mergeConfigWithFlags } from "../src/cli/resolve-options.js";
import { DeadFieldsConfigSchema } from "../src/config/schema.js";

describe("DeadFieldsConfigSchema", () => {
  it("applies defaults for an empty config", () => {
    const config = DeadFieldsConfigSchema.parse({});

    expect(config.source).toBe(".");
    expect(config.ignore).toEqual([
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
    ]);
  });

  it("rejects invalid config shapes", () => {
    expect(() =>
      DeadFieldsConfigSchema.parse({ ignore: "node_modules" }),
    ).toThrow();
  });
});

describe("mergeConfigWithFlags", () => {
  it("uses config values when no CLI flags are provided", () => {
    const merged = mergeConfigWithFlags(
      {
        source: "./src",
        ignore: ["**/fixtures/**"],
      },
      {},
    );

    expect(merged).toEqual({
      source: "./src",
      ignore: ["**/fixtures/**"],
    });
  });

  it("overrides source from the positional path flag", () => {
    const merged = mergeConfigWithFlags(
      {
        source: "./src",
        ignore: [],
      },
      { path: "./lib" },
    );

    expect(merged.source).toBe("./lib");
  });

  it("appends CLI ignore patterns to config ignores", () => {
    const merged = mergeConfigWithFlags(
      {
        source: ".",
        ignore: ["**/dist/**"],
      },
      { ignore: ["**/*.test.ts", "**/fixtures/**"] },
    );

    expect(merged.ignore).toEqual([
      "**/dist/**",
      "**/*.test.ts",
      "**/fixtures/**",
    ]);
  });
});
