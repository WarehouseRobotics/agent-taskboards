# Task Management Skill


This skill teaches coding agents how to use Agent Taskboards as local
task memory and workflow state. It is a design target for the future skill and
bash control script; it is not yet a final executable skill.

## Purpose

Agents should use the taskboard API to:

- identify the active project and board
- find relevant existing tasks before creating new ones
- create tasks for discovered work
- move tasks through explicit workflow states
- append comments for progress, blockers, decisions, and handoffs
- search prior tasks and comments as long-term project memory

The skill should make taskboard usage reliable for agents such as Codex and
Claude Code without requiring them to manually construct every API call.

There should be a concise idiomatic surface for most common tasks, to ensure efficient tool-call token usage.

## Control Script Contract

The skill ships with a thin bash wrapper at
`skills/tasks-management/scripts/taskboards`. It is the single entry point
agents should use; raw `curl` against `/api/agents` is reserved for cases the
wrapper does not cover.

Invocation grammar:

```text
taskboards <verb> <path-or-shortcut> [key=value ...] [--json BODY | --data FILE]
```

`<verb>` is one of `get`, `post`, `patch`, `delete`, or one of the shortcuts
below. `<path>` is API-relative (the wrapper prepends
`$TASKBOARDS_HOST_URL/api/agents/`). Bare `key=value` arguments become
URL-encoded query string entries. `--json` sets a JSON body inline; `--data`
reads a JSON body from a local file.

Built-in shortcuts:

- `taskboards health` and `taskboards help` for orientation
- `taskboards context <taskId>` for a full task view with comments and activity
- `taskboards move <taskId> <columnKey>` for column transitions
- `taskboards complete <taskId>` and `taskboards archive <taskId>` for task
  state changes
- `taskboards comment <taskId> <body...>` to append an agent comment with
  identity auto-filled from env
- `taskboards attach <taskId> <filePath>` to upload an attachment such as a
  screenshot, log, or trace file

Responses are passed through verbatim. The agentic API already returns markdown
with TOON, YAML, JSON, or no structured block depending on `format=`, so agents
can request the form they want without wrapper-side reshaping. Atomic mutations
(move, complete, archive, patch, comment-create, attachment-create) still emit
a TOON block with the new IDs that agents can scan or pipe into other tooling.

Wrapper environment:

- `TASKBOARDS_HOST_URL` — base URL (default `http://localhost:8142`).
- `TASKBOARDS_API_KEY` — bearer token; sent only when non-empty.
- `TASKBOARDS_AGENT_NAME` — comment author name (default `Claude Code`).
- `TASKBOARDS_AGENT_REF` — comment author reference (default
  `$CLAUDE_SESSION_ID` if set, else `local`).



## Agent Workflow

Before starting substantial work, an agent should:

1. confirm the taskboard API is reachable
2. identify the relevant project and board
3. search for existing tasks or historical context
4. create or select the task it is working on
5. append comments when it discovers important context
6. move the task when its state changes

The skill should prefer updating existing tasks over creating duplicates when
search finds an obvious match.

## Expected Semantics

The skill should preserve the API's core semantics:

- projects contain boards
- boards contain tasks
- task movement is an explicit operation
- comments are append-oriented durable context
- activity is system-generated history
- search covers boards, tasks, and comments
- archived content is excluded by default unless requested

The script should not hide IDs from the agent. Stable IDs are important for
handoffs, comments, and follow-up API calls.

## Safety

Potentially destructive maintenance commands, especially purge operations,
should require explicit confirmation arguments. The skill should guide agents to
archive before purging and to leave comments before handing off incomplete work.
