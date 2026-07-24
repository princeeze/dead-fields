import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/index.js";

describe("analyzeSource locations", () => {
  it("reports 1-based line and column for dead properties", () => {
    const source = `const obj = {
  a: 1,
  b: 2,
};
console.log(obj.a);`;

    const result = analyzeSource(source, { filePath: "index.ts" });
    const dead = result.deadProperties.find(
      (property) =>
        property.file === "index.ts" &&
        property.objectName === "obj" &&
        property.propertyName === "b",
    );

    expect(dead).toEqual({
      file: "index.ts",
      objectName: "obj",
      propertyName: "b",
      line: 3,
      column: 3,
    });
  });
});
