import { describe, expect, it } from "vitest";
import { renderSnippet } from "../src/cli/snippet.js";

describe("renderSnippet", () => {
  const source = `const config = {
  host: "localhost",
  port: 5432,
  ssl: true,
};`;

  it("renders surrounding lines with a caret under the property name", () => {
    const snippet = renderSnippet(source, 3, 3, 4, {
      contextLines: 1,
      propertyName: "port",
    });

    expect(snippet).toEqual([
      '  2 │   host: "localhost",',
      "> 3 │   port: 5432,",
      "        ^^^^",
      "  4 │   ssl: true,",
    ]);
  });

  it("aligns the caret to the property on a single-line object literal", () => {
    const inlineSource = "const multiFirst = { a: 1, b: 2 };";
    const snippet = renderSnippet(inlineSource, 1, 28, 1, {
      propertyName: "b",
    });

    expect(snippet).toEqual([
      "> 1 │ const multiFirst = { a: 1, b: 2 };",
      "                                 ^",
    ]);
  });

  it("aligns the caret when gutter styling adds ANSI codes", () => {
    const inlineSource = "const multiFirst = { a: 1, b: 2 };";
    const snippet = renderSnippet(inlineSource, 1, 28, 1, {
      propertyName: "b",
      gutter: (text) => `\u001b[2m${text}\u001b[22m`,
      marker: (text) => `\u001b[31m${text}\u001b[39m`,
    });

    const caretLine = snippet[1] ?? "";
    expect(caretLine.startsWith(" ".repeat(33))).toBe(true);
    expect(caretLine).toContain("^");
  });
});
