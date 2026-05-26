import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface CurlCapture {
  args: string[];
  dataMode: string | null;
  dataArg: string | null;
  bodyContent: string | null;
}

describe("taskboards wrapper", () => {
  let tmpDir: string;
  let binDir: string;
  let curlOutputPath: string;

  const scriptPath = resolve(process.cwd(), "skills/tasks-management/scripts/taskboards");

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "taskboards-wrapper-"));
    binDir = join(tmpDir, "bin");
    curlOutputPath = join(tmpDir, "curl.json");
    mkdirSync(binDir);
    writeFileSync(
      join(binDir, "curl"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
let dataMode = null;
let dataArg = null;
let bodyContent = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--data-raw" || args[index] === "--data-binary") {
    dataMode = args[index];
    dataArg = args[index + 1];
    if (dataArg && dataArg.startsWith("@")) {
      bodyContent = fs.readFileSync(dataArg.slice(1), "utf8");
    } else {
      bodyContent = dataArg ?? null;
    }
  }
}
fs.writeFileSync(process.env.TASKBOARDS_FAKE_CURL_OUT, JSON.stringify({
  args,
  dataMode,
  dataArg,
  bodyContent,
}, null, 2));
process.stdout.write("ok\\n");
`,
    );
    chmodSync(join(binDir, "curl"), 0o755);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function taskboardsEnv() {
    return {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      TASKBOARDS_AGENT_NAME: "Codex",
      TASKBOARDS_AGENT_REF: "session-123",
      TASKBOARDS_FAKE_CURL_OUT: curlOutputPath,
      TASKBOARDS_HOST_URL: "http://taskboards.test",
    };
  }

  function runTaskboards(args: string[]) {
    execFileSync(scriptPath, args, {
      env: taskboardsEnv(),
      encoding: "utf8",
    });
    return JSON.parse(readFileSync(curlOutputPath, "utf8")) as CurlCapture;
  }

  it("keeps short inline comments working", () => {
    const capture = runTaskboards([
      "comment",
      "task_123",
      "Implementation",
      "started;",
      "see",
      "commit",
      "abc123.",
    ]);

    expect(capture.dataMode).toBe("--data-raw");
    expect(capture.args).toContain("http://taskboards.test/api/agents/tasks/task_123/comments");
    expect(JSON.parse(capture.bodyContent ?? "")).toEqual({
      authorType: "agent",
      authorName: "Codex",
      authorRef: "session-123",
      body: "Implementation started; see commit abc123.",
    });
  });

  it("uses --body-file to preserve multiline markdown and special characters", () => {
    const notePath = join(tmpDir, "note.md");
    const note = [
      "## Handoff",
      "",
      '- Quote: "shells are sharp"',
      "- JSON-ish: {\"ok\": true}",
      "- Backticks: `TASKBOARDS_AGENT_REF=$value`",
      "",
    ].join("\n");
    writeFileSync(notePath, note);

    const capture = runTaskboards(["comment", "task_123", "--body-file", notePath]);

    expect(capture.dataMode).toBe("--data-binary");
    expect(capture.dataArg).toMatch(/^@/);
    expect(JSON.parse(capture.bodyContent ?? "")).toEqual({
      authorType: "agent",
      authorName: "Codex",
      authorRef: "session-123",
      body: note,
    });
  });

  it("uses --field-file to build a task description patch body", () => {
    const descriptionPath = join(tmpDir, "description.md");
    const description = "Line one\n\n- includes quotes \"here\"\n- includes `{ braces }`\n";
    writeFileSync(descriptionPath, description);

    const capture = runTaskboards([
      "patch",
      "tasks/task_123",
      "--field-file",
      `description=${descriptionPath}`,
    ]);

    expect(capture.dataMode).toBe("--data-binary");
    expect(JSON.parse(capture.bodyContent ?? "")).toEqual({ description });
  });

  it("passes --data files to curl without expanding them into argv", () => {
    const jsonPath = join(tmpDir, "task.json");
    const jsonBody = '{"title":"Safe file payload","description":"Long body stays in a file"}';
    writeFileSync(jsonPath, jsonBody);

    const capture = runTaskboards([
      "post",
      "projects/agent-taskboards/boards/api/tasks",
      "--data",
      jsonPath,
    ]);

    expect(capture.dataMode).toBe("--data-binary");
    expect(capture.dataArg).toBe(`@${jsonPath}`);
    expect(capture.args).not.toContain(jsonBody);
    expect(capture.bodyContent).toBe(jsonBody);
  });

  it("suggests file-backed comment bodies when the body is missing", () => {
    const result = spawnSync(scriptPath, ["comment", "task_123"], {
      env: taskboardsEnv(),
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("comment: missing body");
    expect(result.stderr).toContain("--body-file FILE");
    expect(result.stderr).toContain("--data FILE");
  });
});
