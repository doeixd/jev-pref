// Programmatic integration: treat the CLI's JSON and exit status as the API.
import { spawn } from "node:child_process";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(executable, ["jev-pref", "review", "--json"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["inherit", "pipe", "inherit"],
});

let stdout = "";
let startFailed = false;
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });

child.on("error", (error) => {
  startFailed = true;
  console.error(`Could not start jev-pref: ${error.message}`);
  process.exitCode = 2;
});

child.on("close", (code) => {
  if (startFailed) return;
  if (code === 2) {
    console.error("jev-pref could not complete the review.");
    process.exitCode = 2;
    return;
  }

  let verdict;
  try {
    verdict = JSON.parse(stdout);
  } catch (error) {
    console.error(`jev-pref returned invalid JSON: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (verdict.outcome === "fix_now") {
    console.error("Blocking preference findings need attention.");
  } else if (verdict.outcome === "advisory") {
    console.warn("Review completed with advisory findings.");
  } else {
    console.log("Review approved.");
  }
  process.exitCode = code ?? 2;
});
