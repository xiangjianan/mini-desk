// Boot the Mini Desk dev server as a child process and tear it down on exit.
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const PORT = process.env.DEV_PORT ?? "5173";
export const BASE_URL = `http://127.0.0.1:${PORT}/`;

let child;

export async function ensureDevServer() {
  if (await ping()) return null; // already running (e.g. manual dev session)
  child = spawn("./node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", PORT, "--strictPort"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  const stop = () => {
    if (child && !child.killed) child.kill("SIGTERM");
  };
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(130); });
  process.on("SIGTERM", () => { stop(); process.exit(143); });
  for (let i = 0; i < 120; i += 1) {
    if (await ping()) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("dev server did not come up in 60s");
}

export async function stopDevServer() {
  if (!child) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
  child = undefined;
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}
