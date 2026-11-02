import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const temp = await mkdtemp(join(tmpdir(), "xiangqi-friend-tests-"));
try {
  const outfile = join(temp, "fixtures.mjs");
  await build({ entryPoints: ["tests/friend-fixtures.ts"], outfile, bundle: true, platform: "node", format: "esm", define: { "import.meta.env.BASE_URL": '"/"' }, logLevel: "error" });
  await import(pathToFileURL(outfile).href);
} finally { await rm(temp, { recursive: true, force: true }); }
