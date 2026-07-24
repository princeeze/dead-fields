export interface SnippetOptions {
  contextLines?: number;
  highlight?: (text: string) => string;
  gutter?: (text: string) => string;
  marker?: (text: string) => string;
  /** When provided, the caret is aligned to this identifier on the error line */
  propertyName?: string;
}

export function renderSnippet(
  source: string,
  line: number,
  column: number,
  highlightLength: number,
  options: SnippetOptions = {},
): string[] {
  const contextLines = options.contextLines ?? 2;
  const lines = source.split(/\r?\n/);
  const errorLineIndex = line - 1;

  if (errorLineIndex < 0 || errorLineIndex >= lines.length) {
    return [];
  }

  const errorLine = lines[errorLineIndex] ?? "";
  let propertyColumn = column;
  let propertyLength = highlightLength;

  if (options.propertyName) {
    let searchFrom = Math.max(0, column - 1);

    while (searchFrom <= errorLine.length) {
      const index = errorLine.indexOf(options.propertyName, searchFrom);
      if (index === -1) {
        break;
      }

      const before = errorLine[index - 1];
      const after = errorLine[index + options.propertyName.length];
      const isIdentifier =
        (!before || !/[\w$]/.test(before)) &&
        (!after || !/[\w$]/.test(after));

      if (isIdentifier) {
        propertyColumn = index + 1;
        propertyLength = options.propertyName.length;
        break;
      }

      searchFrom = index + 1;
    }
  }

  const start = Math.max(0, errorLineIndex - contextLines);
  const end = Math.min(lines.length - 1, errorLineIndex + contextLines);
  const gutterWidth = String(end + 1).length;
  const highlight = options.highlight ?? ((text: string) => text);
  const gutter = options.gutter ?? ((text: string) => text);
  const marker = options.marker ?? ((text: string) => text);

  const snippetLines: string[] = [];

  for (let index = start; index <= end; index++) {
    const lineNumber = String(index + 1).padStart(gutterWidth, " ");
    const prefix = index === errorLineIndex ? marker(">") : " ";
    const code =
      index === errorLineIndex
        ? highlight(lines[index] ?? "")
        : (lines[index] ?? "");
    const plainPrefix = `${index === errorLineIndex ? ">" : " "} ${lineNumber} │ `;
    const styledPrefix = `${prefix} ${gutter(lineNumber)} ${gutter("│")} `;

    snippetLines.push(`${styledPrefix}${code}`);

    if (index === errorLineIndex) {
      const caretPrefix = " ".repeat(plainPrefix.length + propertyColumn - 1);
      const carets = "^".repeat(Math.max(propertyLength, 1));
      snippetLines.push(`${caretPrefix}${marker(carets)}`);
    }
  }

  return snippetLines;
}
