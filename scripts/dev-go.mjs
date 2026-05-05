#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import path from "path";

const ROOT = process.cwd();
const GO_DIR = path.join(ROOT, "go-api");

function isPortInUseExit(output) {
  const text = String(output || "").toLowerCase();
  return (
    text.includes("address already in use") ||
    (text.includes("bind:") && text.includes("in use")) ||
    (text.includes("bind:") && text.includes("soquete")) ||
    text.includes("normally only one usage of each socket address") ||
    text.includes("uso de cada endereco de soquete")
  );
}

function main() {
  const probe = spawnSync("go", ["version"], {
    cwd: GO_DIR,
    env: process.env,
    stdio: "ignore",
    shell: false,
  });

  if (probe.error || probe.status !== 0) {
    console.warn("[dev:go] comando 'go' nao encontrado; pulando API Go opcional.");
    process.exit(0);
    return;
  }

  let shuttingDown = false;
  const child = spawn("go", ["run", "."], {
    cwd: GO_DIR,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let stderr = "";

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf-8");
    process.stderr.write(chunk);
  });

  const shutdown = (signal) => {
    shuttingDown = true;
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("error", (err) => {
    console.error(`[dev:go] falha ao iniciar go: ${err.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    if (shuttingDown) {
      process.exit(0);
      return;
    }

    if (code === 0) {
      process.exit(0);
      return;
    }

    if (isPortInUseExit(stderr)) {
      console.warn("[dev:go] porta 8002 ja esta em uso; mantendo os outros servicos do dev.");
      process.exit(0);
      return;
    }

    process.exit(code ?? 1);
  });
}

main();
