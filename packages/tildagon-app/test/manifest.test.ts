import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { TildagonAppManifestSchema } from "../src/TildagonAppManifest.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "toml";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getManifestFixtures() {
  const fixturesDir = join(__dirname, "fixtures");
  const files = readdirSync(fixturesDir);
  return files.filter((f) => f.endsWith(".toml")).map((f) => ({ filename: f }));
}

test.each(getManifestFixtures())(
  "manifest file $filename",
  async ({ filename }) => {
    const filepath = join(__dirname, "fixtures", filename);
    const file = await readFile(filepath, "utf-8");
    const manifest = parse(file);

    const isInvalidFixture =
      filename.startsWith("invalid-") || filename.startsWith("missing-");

    if (isInvalidFixture) {
      expect(() => TildagonAppManifestSchema.parse(manifest)).toThrow();
    } else {
      TildagonAppManifestSchema.parse(manifest);
    }
  },
);
