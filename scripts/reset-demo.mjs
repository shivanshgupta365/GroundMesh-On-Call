import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

try {
  await execFileAsync("git", ["restore", "--source=HEAD", "--", "demo/config.preview.json"], { cwd: process.cwd() });
  process.stdout.write("Preview configuration restored from HEAD. Restart the incident room to clear in-memory state.\n");
} catch (error) {
  process.stderr.write(`Could not reset preview configuration: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
