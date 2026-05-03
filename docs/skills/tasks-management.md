# Task Management Skill


This planned skill teaches coding agents how to use Agent Taskboards as local
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

The planned skill should ship with a bash control script that wraps the local
API. The script should be easy for agents to call from a shell and easy for
humans to inspect.

The script should provide commands for:

- health checks
- listing and selecting projects
- listing and selecting boards
- creating, reading, updating, moving, archiving, and completing tasks
- appending task comments
- reading task context, including comments and activity
- text and semantic search
- maintenance actions such as embedding reindexing

Task and context fetching commands will usually return formatted Markdown content, ready for use in context.
Other simpler atomic update commands should return deterministic JSON by default so agents can parse them
with `jq` or equivalent tooling. 

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
