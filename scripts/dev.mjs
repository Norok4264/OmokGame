import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = require.resolve("tsx/cli");
const vitePackage = require.resolve("vite/package.json");
const viteCli = path.join(path.dirname(vitePackage), "bin", "vite.js");

const children = [
  spawn(process.execPath, [tsxCli, "watch", "apps/server/src/index.ts"], { cwd: projectRoot, stdio: "inherit" }),
  spawn(process.execPath, [viteCli, "apps/web", "--config", "apps/web/vite.config.ts"], { cwd: projectRoot, stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once("error", (error) => {
    process.stderr.write(`Development process failed to start: ${error.message}\n`);
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
