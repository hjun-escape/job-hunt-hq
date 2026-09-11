import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

mkdirSync("dist", { recursive: true });
cpSync("public/index.html", "dist/index.html");
cpSync("public/dev.html", "dist/dev.html");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: { app: "src/main.tsx" },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: "dist", port: 5173 });
    console.log(`dev server: http://${host}:${port}/dev.html`);
  }
} else {
  await esbuild.build(options);
}
