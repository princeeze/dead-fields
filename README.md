# dead-fields

Static analysis for TypeScript that detects **object literal properties that are never read**.

Unlike tools that find unused symbols, dead-fields analyzes **property usage** on object literals.

## Install

```bash
pnpm add dead-fields
# or
npm install dead-fields
```

## Usage

```ts
import { analyzeSource, analyzeFile, analyzeDirectory } from "dead-fields";

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
const dirResult = await analyzeDirectory("./src");
```

Each dead property includes `file`, `objectName`, `propertyName`, `line`, and `column`.

## Phase 1 scope

Currently supports direct property access within a single file:

```ts
obj.foo // ✅ tracked
```

Not yet supported: destructuring, aliases, spreads, computed keys, optional chaining, JSX, cross-file analysis, and more.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
