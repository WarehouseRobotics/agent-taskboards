# Design Rules

Agent Taskboards is an operational tool for managing developer work and agentic
AI coding workflows. The design should be dense, clear, and calm.

## Product Feel

The app should feel like local development infrastructure:

- practical and fast
- readable under repeated daily use
- optimized for scanning and updating work
- quiet rather than decorative
- trustworthy when showing state changes and search results

Do not design it like a marketing page. The user should land directly in the app
experience.

## Layout

Use a work-focused application layout:

- persistent project and board navigation
- board columns as the primary workspace
- task detail as a side panel or focused route
- search and maintenance as accessible tools, not hidden settings
- responsive behavior that preserves task scanning on smaller screens

Avoid large hero sections, oversized explanatory copy, decorative cards inside
cards, and page sections that compete with the board.

## Task Boards

Task cards should be compact and stable in size. They should show the most
important data first:

- title
- status or column
- priority or blocker signal when present
- labels or project-specific references when useful
- small indicators for comments, activity, or agent notes

Movement affordances should be obvious. Drag-and-drop can exist, but keyboard or
button/menu alternatives should also support precise task movement.

## Visual Style

Use restrained contrast, clear typography, and predictable spacing. The palette
should avoid becoming a one-note theme. Reserve strong color for status,
priority, blockers, destructive actions, and search relevance.

Interactive elements should look actionable. Disabled, loading, empty, and error
states should be designed rather than left as browser defaults.

## Agent-Oriented Details

The UI should make agent interoperability visible without overwhelming humans:

- stable IDs should be easy to copy from relevant detail views
- comments and activity should distinguish human, agent, and system authorship
- API-related concepts should use the same terminology as the docs
- search results should expose parent context so agents and humans can refer to
  the same object unambiguously
