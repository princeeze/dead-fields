import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toJSONSchema } from "zod";
import { DeadFieldsConfigSchema } from "../src/config/schema.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(rootDir, "schema");
const schemaPath = join(schemaDir, "dead-fields.schema.json");

const jsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  ...toJSONSchema(DeadFieldsConfigSchema, {
    target: "draft-07",
    io: "input",
  }),
};

mkdirSync(schemaDir, { recursive: true });
writeFileSync(schemaPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);
