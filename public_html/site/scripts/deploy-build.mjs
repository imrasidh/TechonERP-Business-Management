import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicHtml = join(root, "..");
const dist = join(root, "dist");
const assetsOut = join(publicHtml, "assets");
const sourceIndex = join(root, "index.source.html");
const viteIndex = join(root, "index.html");

copyFileSync(sourceIndex, viteIndex);

const build = spawnSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit", shell: true });
if (build.status !== 0) process.exit(build.status || 1);

copyFileSync(join(dist, "index.html"), viteIndex);
mkdirSync(assetsOut, { recursive: true });

const distAssets = join(dist, "assets");
const newNames = new Set(readdirSync(distAssets));
for (const name of readdirSync(assetsOut)) {
  if (name.startsWith("index-") && !newNames.has(name)) {
    unlinkSync(join(assetsOut, name));
  }
}
cpSync(distAssets, assetsOut, { recursive: true });

const html = readFileSync(viteIndex, "utf8");
if (!html.includes("TechonERP-releases") && !readFileSync(join(distAssets, [...newNames].find((n) => n.endsWith(".js"))), "utf8").includes("TechonERP-releases")) {
  console.warn("Warning: GitHub release URL not found in build output.");
}

console.log("Deployed:");
console.log(" -", viteIndex);
console.log(" -", assetsOut);
