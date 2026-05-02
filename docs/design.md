# Design Rules

Agent Taskboards is an operational tool for managing developer work and agentic
AI coding workflows. The design must feel like local development infrastructure:
practical, fast, calm, and trustworthy under repeated daily use. This document
is the source of truth for visual and interaction rules. It supersedes any
ad-hoc decisions in component code.

The companion design canvas lives at `Agent Taskboards.html` in the project
root. Use it to verify any change against the four reference screens before
shipping.

---

## 1. Product Feel

The app is a working surface, not a marketing page. The first screen is the
board, never a landing page.

- **Practical and fast** — every screen optimizes for scanning and updating work.
- **Quiet rather than decorative** — chrome recedes; data leads.
- **Trustworthy** — state changes, search relevance, and agent authorship are
  always legible at a glance.
- **Dense but calm** — high information per square inch without visual noise.

Avoid: hero sections, oversized explanatory copy, decorative cards inside cards,
gradient-heavy surfaces, illustrative imagery, emoji as UI, "celebration"
states.

---

## 2. Theme

Dark is the default. Light is a first-class peer; both must be tested for every
screen.

### 2.1 Color tokens

All colors are defined as CSS custom properties in `styles/tokens.css`, scoped
to `[data-theme="dark"]` and `[data-theme="light"]`. Components must reference
tokens, never hard-coded hex or rgb values.

| Group        | Tokens                                                                |
| ------------ | --------------------------------------------------------------------- |
| Surfaces     | `--bg-app`, `--bg-surface`, `--bg-surface-2`, `--bg-elevated`, `--bg-input` |
| Interaction  | `--bg-hover`, `--bg-active`                                           |
| Lines        | `--line-faint`, `--line`, `--line-strong`                             |
| Text         | `--fg`, `--fg-muted`, `--fg-subtle`, `--fg-faint`                     |
| Accent       | `--accent`, `--accent-fg`, `--accent-soft`, `--accent-faint`          |
| Status       | `--status-todo`, `--status-ready`, `--status-progress`, `--status-blocked`, `--status-review`, `--status-done` |
| Priority     | `--priority-p0`, `--priority-p1`, `--priority-p2`, `--priority-p3`    |
| Authorship   | `--human-tint`, `--agent-tint`, `--system-tint`                       |

### 2.2 Color rules

- **Use a near-monochrome base.** Surfaces and text are cool neutrals. Saturate
  only where meaning depends on color.
- **One accent.** Cool blue is reserved for: primary actions, focused inputs,
  current selection, and search-relevance scores. Do not use the accent as a
  decorative tint.
- **Status carries hue.** Backlog/ready/in progress/blocked/review/done each
  have a dedicated tone. Status is the *only* place where multiple colors
  appear in close proximity, and even then through small icons or borders, not
  large fills.
- **Priority colors are restrained.** Only P0 (red) and P1 (amber) read at a
  distance. P2 sits closer to neutral; P3 is fully neutral.
- **Authorship has its own palette.** Human, agent, and system entries each get
  a tint used in author chips and the left edge of comment cards. Do not reuse
  status or priority colors for authorship.
- **Light theme is not just an inversion.** It uses softer surface contrast and
  slightly higher saturation on accents to compensate for the brighter ground.

### 2.3 When color is *not* allowed

- Card backgrounds, panel chrome, dividers, and disabled controls remain
  neutral.
- Hover and active states change surface lightness, never hue.
- Decorative gradients, glassmorphism, and large color blocks behind content
  are forbidden.

---

## 3. Typography

Two families, no more.

| Role          | Family                  | Notes                                          |
| ------------- | ----------------------- | ---------------------------------------------- |
| UI / prose    | **Inter**               | `font-feature-settings: "cv11", "ss01", "ss03"` |
| Identifiers   | **JetBrains Mono**      | task IDs, paths, API references, file names    |

### 3.1 Type scale

Use the `--fs-*` tokens. Do not introduce new sizes without updating tokens.

| Token     | Size | Typical use                                                |
| --------- | ---- | ---------------------------------------------------------- |
| `--fs-10` | 10   | uppercase metadata labels, kbd hints                       |
| `--fs-11` | 11   | mono IDs, small badges, table column captions              |
| `--fs-12` | 12   | dense rows, sidebar items, secondary buttons               |
| `--fs-13` | 13   | **default body text** — task titles, descriptions, fields  |
| `--fs-14` | 14   | reserved; rarely used                                      |
| `--fs-16` | 16   | section subtitles in long-form pages                       |
| `--fs-18` | 18   | inline page-section headers                                |
| `--fs-22` | 22   | screen-level page titles (settings, task detail)           |
| `--fs-28` | 28   | reserved for empty-state hero text only                    |

### 3.2 Type rules

- Default body weight is 450; medium (500) is for selection, current item, and
  task titles. 600 is reserved for page titles and section labels.
- Use `letter-spacing: -0.01em` (`--tracking-tight`) on titles ≥18px.
- Use `letter-spacing: 0.04em` (`--tracking-wide`) and uppercase only for
  micro-labels (10–11px).
- Use `text-wrap: pretty` on any multi-line copy (descriptions, comments,
  related-task titles).
- Mono is for **identifiers**, not for visual flavor. Never set body copy or
  buttons in mono.

---

## 4. Spacing & radius

A 4pt scale, exposed as `--s-1` (4px) through `--s-12` (48px). Sub-4 spacing
is forbidden; use 0 or 4.

Radius scale: `--r-sm` 4px (badges, kbd) · `--r-md` 6px (cards, inputs,
buttons) · `--r-lg` 8px (large panels) · `--r-xl` 12px (modals).

Density rules:

- **Task cards**: 8px / 10px padding, 6px gap between rows.
- **Sidebar nav items**: 5–6px vertical padding.
- **Table rows**: 10px vertical padding, 14px horizontal.
- **Topbar**: fixed 44px height; sub-toolbar 36px.
- **Buttons**: 26–28px tall. No oversized CTAs.

---

## 5. Layout

Every primary screen uses the same chrome:

```
┌─────────┬──────────────────────────────────────────────┐
│ sidebar │ topbar (breadcrumbs · actions)               │
│ 240px   ├──────────────────────────────────────────────┤
│         │ sub-toolbar (view · group · sort · filter)   │
│         ├──────────────────────────────────────────────┤
│         │ content                                      │
└─────────┴──────────────────────────────────────────────┘
```

- **Persistent left sidebar.** App identity, search trigger, primary nav,
  expandable project tree, footer health indicator. 240px fixed.
- **Topbar carries breadcrumbs.** Project glyph → board → task title (when
  applicable). Stable IDs sit inline next to the title in mono.
- **Task detail rail.** When a task is open, the right rail becomes the primary
  task work surface. It stays attached to the board, never floats, and uses a
  responsive width that is wide enough for editing while preserving column
  scanning on the left.
- **No modals for primary work.** Task detail is a route, not a dialog.
  Confirmation dialogs are reserved for destructive actions.

Responsive behavior must preserve column scanning. On narrow widths, collapse
the sidebar to icons before reducing the board.

---

## 6. Task Boards

Cards are compact, stable in size, and prioritize signal:

1. **Header row** — priority flag · stable ID · optional blocked-by reference · assignee avatar (right).
2. **Title** — 13px, weight 450, two lines max.
3. **Footer row** — labels (left) · agent activity (right) · comment count (right).

Rules:

- Cards never resize on hover. Only shadow + 1px lift.
- Drag, keyboard (j/k, ←/→ to move column), and a context menu must all reach
  the same explicit task-move operation as the API.
- Blocked tasks display the blocking ID inline in `--status-blocked` mono.
- Agent activity uses the agent tint, mono note, and the agent glyph; never
  intrudes on the title.
- WIP limits render as `current/limit` in mono; over-limit columns turn the
  count red.

Empty columns get a dashed-border placeholder and a `+ New task` affordance.
Opening task creation in a column expands an inline form in that column for
title, optional description, labels, and priority. The form remains dense, and
its focused inputs must have enough inset space for the full 2px accent outline
plus gap to render without clipping inside the column frame.

---

## 7. Status & Priority

Status is communicated by a six-icon set, drawn at 12–14px:

| Status      | Icon                                  |
| ----------- | ------------------------------------- |
| Backlog     | dashed circle, neutral                |
| Ready       | solid stroke ring with center dot     |
| In Progress | half-filled wedge                     |
| Blocked     | ring with diagonal slash, red         |
| Review      | dashed ring, amber                    |
| Done        | filled circle with check, green       |

Priority is communicated by a flag glyph (`PriorityFlag`) with weight from solid
fill (P0) to outline (P3). Never use both color *and* a `P0` text label without
the flag — the icon is canonical.

---

## 8. Authorship & Agent Surface

Agent interoperability must be visible without overwhelming humans.

- **Avatars carry kind.** Humans get a circle; agents get a square (mono initials);
  system gets a neutral disc.
- **Tints by kind.** `--human-tint`, `--agent-tint`, `--system-tint`. Comment
  cards use a 2px left border in the matching tint.
- **Stable IDs are first-class.** Always rendered in mono. On task detail they
  sit beside the title and in a dedicated API reference block. A `Copy ID`
  button is always one click away.
- **Task title and description are editable in place.** The task detail rail
  uses explicit Save/Cancel controls for title and description edits, supports
  Cmd/Ctrl+Enter to save, rejects blank titles inline, and gives restrained
  success feedback.
- **Activity vs comments are typed.** Activity entries (status changes, links,
  creates) are single-line. Comments include a quoted body block.
- **API terminology matches docs.** `authorKind`, `taskMove`, `boardId`, etc.
  appear in tooltips and field hints unchanged.

---

## 9. Interactive states

Every interactive element must have explicit designs for: rest, hover, focus,
pressed, selected, disabled, loading, empty, error.

- **Hover** — surface lightens by one step (`--bg-hover`); never changes hue.
- **Focus** — 2px outline in `--accent` with 1px gap from the element edge.
- **Selected** — `--bg-active` background; left-edge accent on list items.
- **Disabled** — 50% opacity; no hover; cursor `not-allowed`.
- **Loading** — skeleton blocks at exact card dimensions; never spinners over
  full screens.
- **Empty** — single-line description, optional action button, no illustration.
- **Error** — inline near the offending field; `--status-blocked` text on
  neutral surface.

Motion is fast and minimal. Use `--t-fast` (80ms) for hovers and toggles,
`--t-base` (140ms) for layout changes. No bouncing easings; use the standard
`var(--ease)` curve.

---

## 10. Iconography

- 14px stroke icons at 1.5px stroke weight; 12px in dense rows.
- Single-color, stroke only, `currentColor`. No filled or duotone icons.
- Status, priority, and authorship glyphs are *not* generic icons — they are
  the canonical way those concepts render.
- Never invent new icons for one-off use; reuse from `components/primitives.jsx`
  or extend that module.

---

## 11. Search & Maintenance

- Search results expose **parent context** (project glyph + board) so a result
  is unambiguous to humans and agents.
- Semantic relevance scores are shown in mono accent (`0.84`) — restrained, not
  visualized as bars.
- Maintenance actions are visible but quiet. Storage paths render in mono.
  Index health is a single colored dot + status word.
- Destructive actions (purge archive, rotate device key) use a red-bordered
  outline button and require an explicit confirmation step.

---

## 12. Don't list

- Don't add filler sections to "balance" a layout.
- Don't introduce new fonts, sizes, radii, or colors outside the token set.
- Don't use color to decorate; use it to mean.
- Don't celebrate state changes; just reflect them.
- Don't hide stable IDs to look cleaner — they are the contract with agents.
- Don't model task detail as a modal.
- Don't use emoji.
- Don't draw illustrative SVGs; if real imagery is needed, use a placeholder.
- Don't recreate marketing-site patterns: hero, testimonials, large CTAs,
  decorative gradient blobs.

---

## 13. Reference implementation

| Concern              | File                              |
| -------------------- | --------------------------------- |
| Tokens (color/type/space/radius/motion) | `styles/tokens.css` |
| Atoms (icons, badges, avatars, buttons) | `components/primitives.jsx` |
| Mock data            | `components/data.jsx`             |
| Board view           | `components/board.jsx`            |
| Task detail          | `components/task.jsx`             |
| Projects list        | `components/projects.jsx`         |
| Settings stub        | `components/settings.jsx`         |
| Canvas + theme tweak | `Agent Taskboards.html`           |

When in doubt, open the canvas, switch themes, and verify the change reads the
same in both.
