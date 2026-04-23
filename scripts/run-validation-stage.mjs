#!/usr/bin/env node
import { spawn } from "node:child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name, fallback = undefined) => {
    const pref = `--${name}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : fallback;
  };
  return {
    profile: getArg("profile", "medium"),
    workerMetricsUrl: getArg("worker-metrics-url", process.env.WORKER_METRICS_URL ?? "")
  };
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...extraEnv }
    });
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs();
  const reportPath = `tmp/loadtest-${args.profile}.json`;
  const summaryPath = `tmp/validation-summary-${args.profile}.json`;

  await run("npm", ["run", "loadtest", "--", `--profile=${args.profile}`, `--output=${reportPath}`]);
  await run("node", [
    "--import",
    "tsx",
    "scripts/validation-summary.mjs",
    `--profile=${args.profile}`,
    `--loadtest-report=${reportPath}`,
    `--output=${summaryPath}`,
    `--worker-metrics-url=${args.workerMetricsUrl}`
  ]);

  console.log(`Validation stage '${args.profile}' completed.`);
  console.log(`Load report: ${reportPath}`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
