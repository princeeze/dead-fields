import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { ts } from "ts-morph";

export async function findTsConfigPath(
  startDir: string,
): Promise<string | undefined> {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, "tsconfig.json");

    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep walking up to find the nearest tsconfig.
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

export interface PathAliasResolver {
  resolve(specifier: string): string | undefined;
}

export function createPathAliasResolver(
  tsconfigPath: string,
  analyzeDir: string,
  knownFiles: Set<string>,
): PathAliasResolver | undefined {
  const configFile = ts.readConfigFile(tsconfigPath, (path) =>
    readFileSync(path, "utf8"),
  );

  if (configFile.error) {
    return undefined;
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath),
  );

  const paths = parsed.options.paths;
  if (!paths) {
    return undefined;
  }

  const baseUrl = parsed.options.baseUrl ?? dirname(tsconfigPath);
  const analyzeDirAbs = resolve(analyzeDir);

  return {
    resolve(specifier: string): string | undefined {
      for (const [pattern, targets] of Object.entries(paths)) {
        const matched = matchPathPattern(pattern, specifier);
        if (matched === undefined) {
          continue;
        }

        for (const target of targets) {
          const resolvedTarget = target.includes("*")
            ? target.replace("*", matched)
            : target;
          const absolutePath = resolve(baseUrl, resolvedTarget);
          const candidate = resolveKnownFile(
            relative(analyzeDirAbs, absolutePath),
            knownFiles,
          );
          if (candidate) {
            return candidate;
          }
        }
      }

      return undefined;
    },
  };
}

function matchPathPattern(
  pattern: string,
  specifier: string,
): string | undefined {
  const starIndex = pattern.indexOf("*");
  if (starIndex === -1) {
    return pattern === specifier ? "" : undefined;
  }

  const prefix = pattern.slice(0, starIndex);
  const suffix = pattern.slice(starIndex + 1);

  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return undefined;
  }

  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

export function resolveKnownFile(
  filePath: string,
  knownFiles: Set<string>,
): string | undefined {
  const resolvedBase = normalize(filePath);
  const candidates = [
    resolvedBase,
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    join(resolvedBase, "index.ts"),
    join(resolvedBase, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) {
      return candidate;
    }
  }

  const matching = [...knownFiles].filter((knownFile) => {
    const withoutExtension = knownFile.replace(/\.(tsx?)$/, "");
    return withoutExtension === resolvedBase;
  });

  return matching[0];
}

export function resolveRelativeImport(
  importerPath: string,
  specifier: string,
  knownFiles: Set<string>,
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const resolvedBase = normalize(join(dirname(importerPath), specifier));
  return resolveKnownFile(resolvedBase, knownFiles);
}

export function resolveImportPath(
  importerPath: string,
  specifier: string,
  knownFiles: Set<string>,
  pathAliasResolver?: PathAliasResolver,
): string | undefined {
  return (
    resolveRelativeImport(importerPath, specifier, knownFiles) ??
    pathAliasResolver?.resolve(specifier)
  );
}
