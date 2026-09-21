import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const outfile = process.argv[2];
if (!outfile) {
  throw new Error("Usage: node bundle.mjs <outfile>");
}

mkdirSync(dirname(outfile), { recursive: true });

await build({
  absWorkingDir: join(fileURLToPath(new URL(".", import.meta.url)), "../.."),
  entryPoints: ["services/assistant/src/server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile,
});
