import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = import.meta.dirname;
const project = resolve(root, "..");
const outDir = join(project, "out/acorn");
const styles = join(project, "app/globals.css");

await build({
  configFile: false,
  root,
  publicDir: join(project, "public"),
  resolve: {
    alias: [
      { find: "../lib/ward-client", replacement: join(root, "ward-client.ts") },
      { find: "@", replacement: project },
    ],
  },
  plugins: [react(), {
    name: "acorn-offline-font",
    enforce: "pre",
    transform(code, id) {
      if (id === styles) return code.replace(/^@import url\("https:\/\/fonts\.googleapis\.com\/[^"\n]+"\);\n/m, "");
    },
  }],
  css: { postcss: project },
  build: { outDir, emptyOutDir: true },
});

const assets = (await readdir(outDir, { recursive: true, withFileTypes: true }))
  .filter((file) => file.isFile())
  .map((file) => join(file.parentPath, file.name).slice(outDir.length))
  .sort();
const worker = await readFile(join(root, "sw.js"), "utf8");
const version = createHash("sha256").update(worker);
for (const asset of assets) version.update(asset).update(await readFile(join(outDir, asset)));
await writeFile(join(outDir, "sw.js"), `const CACHE = "acorn-offline-${version.digest("hex").slice(0, 16)}";\nconst ASSETS = ${JSON.stringify(["/", ...assets])};\n${worker}`);
