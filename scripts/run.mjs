#!/usr/bin/env node
/**
 * One-command entry: install deps if needed, build if needed, start CLI.
 * Usage: npm start   (or: node scripts/run.mjs)
 */
import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const pm = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : "npm";

function runSync(args, label) {
  if (label) console.log(`\n→ ${label}\n`);
  const result = spawnSync(pm, args, { stdio: "inherit", cwd: root, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(join(root, "node_modules"))) {
  runSync(["install"], "First run — installing dependencies");
}

if (!existsSync(join(root, "dist", "index.js"))) {
  runSync(["run", "build"], "Building project");
}

const child = spawn(process.execPath, [join(root, "dist", "index.js"), ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
