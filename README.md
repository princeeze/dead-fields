# dead-fields

Static analysis for TypeScript that detects **object literal properties that are never read**.

Unlike tools that find unused symbols, dead-fields analyzes **property usage** on object literals.

## Install

```bash
pnpm add @princeeze/dead-fields
# or
npm install @princeeze/dead-fields
```

## CLI

```bash
pnpm dead-fields
pnpm dead-fields ./src
pnpm dead-fields --ignore '**/tests/**' --ignore '**/*.test.ts'
pnpm dead-fields --format json
```

The CLI prints findings with the file location, a code snippet, and a short explanation:

```text
src/config.ts:3:3

  2 │   host: "localhost",
> 3 │   port: 5432,
      ^^^^
  4 │   ssl: true,

Property `port` on object `config` is declared but never read.

✖ 2 dead properties in 1 file
```

Exit codes:

- `0` — no dead properties found
- `1` — dead properties found, or the command failed

### Flags

| Flag | Description |
|------|-------------|
| `[path]` | Source file or directory to analyze (default: `.`) |
| `--config`, `-c` | Path to a config file |
| `--ignore`, `-i` | Glob pattern to ignore (repeatable) |
| `--format` | `pretty` (default) or `json` |
| `--color` / `--no-color` | Enable or disable colorized output |

CLI flags override config file values. `--ignore` patterns are appended to any `ignore` entries from the config.

## Configuration

Create `dead-fields.config.json` (or `dead-fields.config.ts`) in your project root:

```json
{
  "$schema": "./node_modules/@princeeze/dead-fields/schema/dead-fields.schema.json",
  "source": "./src",
  "ignore": ["**/fixtures/**", "**/*.test.ts"]
}
```

TypeScript config files are supported too:

```ts
import type { DeadFieldsConfig } from "@princeeze/dead-fields";

export default {
  source: "./src",
  ignore: ["**/fixtures/**"],
} satisfies DeadFieldsConfig;
```

Config fields:

| Field | Description | Default |
|-------|-------------|---------|
| `source` | File or directory to analyze | `"."` |
| `ignore` | Glob patterns to skip | `**/node_modules/**`, `**/dist/**`, `**/.git/**` |

## Programmatic API

```ts
import { analyzeSource, analyzeFile, analyzeDirectory } from "@princeeze/dead-fields";

const result = analyzeSource(`
  const config = {
    host: "localhost",
    port: 5432,
    ssl: true,
  };

  console.log(config.host);
`);

// result.deadProperties
// → port, ssl (never read via config.port / config.ssl)
```

```ts
const fileResult = await analyzeFile("./src/config.ts");
const dirResult = await analyzeDirectory("./src", {
  ignore: ["**/node_modules/**"],
});
```

Each dead property includes `file`, `objectName`, `propertyName`, `line`, and `column`.

## Phase 1 scope

Single-file analysis for object literal and class instance properties, including aliases, destructuring, spreads, computed keys, optional chaining, JSX, and parameter flow.

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm dead-fields ./src
```

## License

MIT
