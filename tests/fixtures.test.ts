import { describe, expect, it } from "vitest";
import { analyzeDirectory } from "../src/analyze-directory.js";
import {
  discoverFixtureCases,
  loadExpected,
  toFixtureExpected,
  writeExpected,
} from "./helpers/fixtures.js";

const shouldUpdate = process.env.UPDATE_FIXTURES === "1";

describe("fixture cases", () => {
  const cases = discoverFixtureCases();

  it("discovers fixture cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const fixtureCase of cases) {
    it(fixtureCase.name, async () => {
      const result = await analyzeDirectory(fixtureCase.srcDir);
      const actual = toFixtureExpected(result);

      if (shouldUpdate) {
        writeExpected(fixtureCase.dir, actual);
        return;
      }

      const expected = loadExpected(fixtureCase.dir);
      expect(actual).toEqual(expected);
    });
  }
});
