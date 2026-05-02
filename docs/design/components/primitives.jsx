/* global React */
const { useState, useMemo, useEffect, useRef } = React;

/* ----- Iconography (minimal stroke icons, 14px default) ----- */
const Icon = ({ d, size = 14, stroke = 1.5, fill = "none", style }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const I = {
  board:    <Icon d={["M2 3h12v10H2z", "M6 3v10", "M10 3v10"]} />,
  list:     <Icon d={["M3 4h10", "M3 8h10", "M3 12h10"]} />,
  search:   <Icon d={["M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M11 11l3 3"]} />,
  settings: <Icon d={["M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M8 1v2", "M8 13v2", "M1 8h2", "M13 8h2", "M3 3l1.4 1.4", "M11.6 11.6L13 13", "M3 13l1.4-1.4", "M11.6 4.4L13 3"]} />,
  inbox:    <Icon d={["M2 9l1.5-5h9L14 9", "M2 9v3h12V9", "M2 9h3l1 1.5h4L11 9h3"]} />,
  archive:  <Icon d={["M2 4h12v3H2z", "M3 7v6h10V7", "M6 9.5h4"]} />,
  plus:     <Icon d={["M8 3v10", "M3 8h10"]} />,
  chevron:  <Icon d="M6 4l4 4-4 4" />,
  chevDown: <Icon d="M4 6l4 4 4-4" />,
  more:     <Icon d={["M4 8h.01", "M8 8h.01", "M12 8h.01"]} stroke={2.5} />,
  copy:     <Icon d={["M5 5h7v7H5z", "M3 11V3h7"]} />,
  comment:  <Icon d="M2.5 3h11v8H7l-3 2.5V11H2.5z" />,
  link:     <Icon d={["M9 7l-2 2", "M6 4.5L7 3.5a2.5 2.5 0 0 1 3.5 3.5l-1 1", "M10 11.5L9 12.5a2.5 2.5 0 0 1-3.5-3.5l1-1"]} />,
  flag:     <Icon d={["M4 14V3", "M4 3h8l-2 3 2 3H4"]} />,
  block:    <Icon d={["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M3.5 3.5l9 9"]} />,
  check:    <Icon d="M3 8.5l3.5 3.5L13 4.5" />,
  clock:    <Icon d={["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M8 4v4l2.5 2"]} />,
  agent:    <Icon d={["M5 4h6v6H5z", "M3 6v2", "M13 6v2", "M6.5 6.5h.01", "M9.5 6.5h.01", "M6 13h4"]} />,
  human:    <Icon d={["M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"]} />,
  tag:      <Icon d={["M2.5 2.5h5l6 6-5 5-6-6z", "M5 5h.01"]} />,
  filter:   <Icon d="M2 3h12l-4.5 5v5L6.5 12V8z" />,
  zap:      <Icon d="M9 1.5L3.5 9H8l-1 5.5L13 7H8.5z" />,
  refresh:  <Icon d={["M14 3v3h-3", "M2 13v-3h3", "M3.5 6a5 5 0 0 1 8.5-1.5L14 6", "M12.5 10a5 5 0 0 1-8.5 1.5L2 10"]} />,
  database: <Icon d={["M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2z", "M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4", "M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"]} />,
  close:    <Icon d={["M3.5 3.5l9 9", "M12.5 3.5l-9 9"]} />,
  external: <Icon d={["M6 3H3v10h10v-3", "M9 3h4v4", "M13 3l-5 5"]} />,
  dotGrid:  <Icon d={["M4 4h.01", "M8 4h.01", "M12 4h.01", "M4 8h.01", "M8 8h.01", "M12 8h.01", "M4 12h.01", "M8 12h.01", "M12 12h.01"]} stroke={2.2} />,
  command:  <Icon d={["M5 5h6v6H5z", "M5 5a2 2 0 1 1-2-2", "M11 5a2 2 0 1 0 2-2", "M5 11a2 2 0 1 0-2 2", "M11 11a2 2 0 1 1 2 2"]} />,
  file:     <Icon d={["M9 2H4v12h8V5z", "M9 2v3h3"]} />,
};

/* ----- Atoms ----- */

const StatusDot = ({ status, size = 8 }) => {
  const map = {
    backlog: "var(--status-todo)",
    ready: "var(--status-ready)",
    progress: "var(--status-progress)",
    blocked: "var(--status-blocked)",
    review: "var(--status-review)",
    done: "var(--status-done)",
  };
  const isOpen = status !== "done";
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      borderRadius: "50%",
      background: status === "blocked" ? map[status] : "transparent",
      border: `${size > 10 ? 2 : 1.5}px solid ${map[status] || "var(--fg-faint)"}`,
      boxShadow: status === "progress" ? `inset 0 0 0 2px var(--bg-app)` : "none",
      flexShrink: 0,
    }} />
  );
};

const StatusIcon = ({ status, size = 14 }) => {
  const colors = {
    backlog: "var(--status-todo)",
    ready: "var(--status-ready)",
    progress: "var(--status-progress)",
    blocked: "var(--status-blocked)",
    review: "var(--status-review)",
    done: "var(--status-done)",
  };
  const c = colors[status] || "var(--fg-faint)";
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" fill={c} />
        <path d="M4.5 8.2 L7 10.5 L11.5 5.8" fill="none" stroke="var(--bg-app)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "progress") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" />
        <path d="M8 8 L8 2 A6 6 0 0 1 13.2 11 z" fill={c} />
      </svg>
    );
  }
  if (status === "blocked") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" />
        <path d="M4 4 L12 12" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "review") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    );
  }
  if (status === "ready") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill={c} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
};

const PriorityFlag = ({ p, size = 12 }) => {
  if (p == null || p === "p3") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ color: "var(--fg-faint)", flexShrink: 0 }}>
        <path d="M3 3v10M3 3h7l-1.5 2.5L10 8H3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const map = { p0: "var(--priority-p0)", p1: "var(--priority-p1)", p2: "var(--priority-p2)" };
  const c = map[p];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ color: c, flexShrink: 0 }}>
      <path d="M3 3v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 3h8l-1.5 2.5L11 8H3z" fill={c} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};

const Badge = ({ children, tone = "neutral", style }) => {
  const tones = {
    neutral: { bg: "var(--bg-surface-2)", fg: "var(--fg-muted)", bd: "var(--line)" },
    accent:  { bg: "var(--accent-soft)", fg: "var(--accent)", bd: "transparent" },
    blocked: { bg: "color-mix(in oklch, var(--status-blocked) 14%, transparent)", fg: "var(--status-blocked)", bd: "transparent" },
    review:  { bg: "color-mix(in oklch, var(--status-review) 14%, transparent)", fg: "var(--status-review)", bd: "transparent" },
    progress:{ bg: "color-mix(in oklch, var(--status-progress) 14%, transparent)", fg: "var(--status-progress)", bd: "transparent" },
    done:    { bg: "color-mix(in oklch, var(--status-done) 14%, transparent)", fg: "var(--status-done)", bd: "transparent" },
    agent:   { bg: "color-mix(in oklch, var(--agent-tint) 14%, transparent)", fg: "var(--agent-tint)", bd: "transparent" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "1px 6px",
      borderRadius: "var(--r-sm)",
      background: t.bg, color: t.fg,
      border: `1px solid ${t.bd}`,
      fontSize: "var(--fs-11)",
      fontWeight: 500,
      lineHeight: 1.4,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
};

const Label = ({ name, color = "neutral" }) => {
  const colors = {
    bug: "oklch(0.7 0.16 25)",
    api: "oklch(0.72 0.13 250)",
    ui: "oklch(0.74 0.13 295)",
    perf: "oklch(0.74 0.14 65)",
    docs: "oklch(0.74 0.08 145)",
    infra: "oklch(0.7 0.04 250)",
    agent: "oklch(0.74 0.13 295)",
    embed: "oklch(0.74 0.12 200)",
    neutral: "oklch(0.65 0.02 250)",
  };
  const c = colors[color] || colors.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "1px 6px 1px 5px",
      fontSize: "var(--fs-11)",
      color: "var(--fg-muted)",
      borderRadius: "var(--r-sm)",
      background: "var(--bg-surface-2)",
      border: "1px solid var(--line-faint)",
      lineHeight: 1.4,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
      {name}
    </span>
  );
};

const Mono = ({ children, faded = false, style }) => (
  <span className="mono" style={{ color: faded ? "var(--fg-faint)" : "var(--fg-subtle)", ...style }}>
    {children}
  </span>
);

const KBD = ({ children }) => (
  <span style={{
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    padding: "1px 5px",
    border: "1px solid var(--line)",
    borderRadius: 3,
    background: "var(--bg-surface-2)",
    color: "var(--fg-subtle)",
  }}>{children}</span>
);

const Avatar = ({ kind = "human", name = "", size = 18 }) => {
  const tint = kind === "agent" ? "var(--agent-tint)" : kind === "system" ? "var(--system-tint)" : "var(--human-tint)";
  const initial = (name || (kind === "agent" ? "AI" : "?")).slice(0, kind === "agent" ? 2 : 1).toUpperCase();
  return (
    <span style={{
      width: size, height: size,
      borderRadius: kind === "agent" ? 3 : "50%",
      background: `color-mix(in oklch, ${tint} 22%, var(--bg-surface))`,
      border: `1px solid color-mix(in oklch, ${tint} 40%, transparent)`,
      color: tint,
      fontFamily: kind === "agent" ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: size <= 18 ? 9 : 11,
      fontWeight: 600,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>{initial}</span>
  );
};

/* ----- Layout chrome ----- */

const Sidebar = ({ active = "board", projects = [], currentProject, currentBoard }) => {
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--line)",
      display: "flex", flexDirection: "column",
      height: "100%",
    }}>
      {/* App header */}
      <div style={{
        padding: "12px 12px 10px",
        borderBottom: "1px solid var(--line-faint)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: "var(--accent)",
          display: "grid", placeItems: "center",
          color: "var(--accent-fg)",
          flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1.5" y="1.5" width="3" height="9" rx="1" fill="currentColor" opacity="0.55" />
            <rect x="5.5" y="1.5" width="3" height="6" rx="1" fill="currentColor" />
            <rect x="9.5" y="1.5" width="1" height="4" rx="0.5" fill="currentColor" opacity="0.85" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--fs-12)", fontWeight: 600, letterSpacing: "var(--tracking-tight)" }}>Agent Taskboards</div>
          <div className="mono" style={{ color: "var(--fg-faint)", fontSize: 10 }}>localhost:5174</div>
        </div>
        <button title="Command menu" style={{
          color: "var(--fg-subtle)", padding: 4, borderRadius: 4,
        }}>{I.command}</button>
      </div>

      {/* Search */}
      <div style={{ padding: "10px 10px 8px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px",
          background: "var(--bg-input)",
          border: "1px solid var(--line-faint)",
          borderRadius: "var(--r-md)",
          color: "var(--fg-faint)",
          fontSize: "var(--fs-12)",
        }}>
          <span style={{ color: "var(--fg-faint)" }}>{I.search}</span>
          <span style={{ flex: 1 }}>Search…</span>
          <KBD>⌘K</KBD>
        </div>
      </div>

      {/* Top nav */}
      <nav style={{ padding: "0 6px", display: "flex", flexDirection: "column", gap: 1 }}>
        <NavItem icon={I.board} label="Boards" active={active === "board"} count="3" />
        <NavItem icon={I.list} label="Projects" active={active === "projects"} count="6" />
        <NavItem icon={I.search} label="Search" active={active === "search"} />
        <NavItem icon={I.archive} label="Archive" active={active === "archive"} />
        <NavItem icon={I.database} label="Maintenance" active={active === "maintenance"} />
        <NavItem icon={I.settings} label="Settings" active={active === "settings"} />
      </nav>

      <div style={{ height: 1, background: "var(--line-faint)", margin: "10px 12px" }} />

      {/* Projects list */}
      <div style={{ padding: "0 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: "var(--fs-10)", textTransform: "uppercase",
          letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)",
          fontWeight: 600,
        }}>Projects</span>
        <button style={{ color: "var(--fg-faint)" }} title="New project">{I.plus}</button>
      </div>
      <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto", flex: 1 }}>
        {projects.map(p => (
          <ProjectTreeItem key={p.id} project={p}
            isCurrent={currentProject === p.id}
            currentBoard={currentBoard} />
        ))}
      </div>

      {/* Footer status */}
      <div style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--line-faint)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10, color: "var(--fg-faint)",
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--status-done)",
          boxShadow: "0 0 6px color-mix(in oklch, var(--status-done) 60%, transparent)",
        }} />
        <span className="mono">api healthy</span>
        <span style={{ marginLeft: "auto" }} className="mono">v0.4.2</span>
      </div>
    </aside>
  );
};

const NavItem = ({ icon, label, active, count }) => (
  <button style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "5px 8px",
    borderRadius: "var(--r-sm)",
    color: active ? "var(--fg)" : "var(--fg-muted)",
    background: active ? "var(--bg-active)" : "transparent",
    fontSize: "var(--fs-13)",
    fontWeight: active ? 500 : 400,
    width: "100%",
    textAlign: "left",
  }}>
    <span style={{ color: active ? "var(--accent)" : "var(--fg-subtle)" }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {count && <span className="mono" style={{ color: "var(--fg-faint)", fontSize: 10 }}>{count}</span>}
  </button>
);

const ProjectTreeItem = ({ project, isCurrent, currentBoard }) => {
  const [open, setOpen] = useState(isCurrent);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 6px",
        borderRadius: "var(--r-sm)",
        color: isCurrent ? "var(--fg)" : "var(--fg-muted)",
        background: isCurrent && !currentBoard ? "var(--bg-active)" : "transparent",
        fontSize: "var(--fs-12)",
        fontWeight: isCurrent ? 500 : 400,
        width: "100%",
        textAlign: "left",
      }}>
        <span style={{
          display: "inline-block",
          color: "var(--fg-faint)",
          transform: open ? "rotate(90deg)" : "rotate(0)",
          transition: "transform var(--t-fast)",
        }}>{I.chevron}</span>
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          background: project.color, opacity: 0.85,
          display: "grid", placeItems: "center",
          color: "rgba(0,0,0,0.7)",
          fontSize: 9, fontWeight: 700,
          flexShrink: 0,
        }}>{project.glyph}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
        <span className="mono" style={{ color: "var(--fg-faint)", fontSize: 10 }}>{project.taskCount}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: 22, display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
          {project.boards.map(b => (
            <button key={b.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 6px",
              borderRadius: "var(--r-sm)",
              color: currentBoard === b.id ? "var(--fg)" : "var(--fg-muted)",
              background: currentBoard === b.id ? "var(--bg-active)" : "transparent",
              fontSize: "var(--fs-12)",
              fontWeight: currentBoard === b.id ? 500 : 400,
              width: "100%",
              textAlign: "left",
            }}>
              <span style={{ color: "var(--fg-faint)", flexShrink: 0 }}>{I.board}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
              {b.active && <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--accent)",
              }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Topbar = ({ crumbs = [], children, actions }) => (
  <header style={{
    height: 44, flexShrink: 0,
    borderBottom: "1px solid var(--line)",
    background: "var(--bg-surface)",
    display: "flex", alignItems: "center",
    padding: "0 16px",
    gap: 12,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "var(--fg-faint)", margin: "0 2px" }}>/</span>}
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 6px", borderRadius: 4,
            color: i === crumbs.length - 1 ? "var(--fg)" : "var(--fg-muted)",
            fontWeight: i === crumbs.length - 1 ? 500 : 400,
            fontSize: "var(--fs-13)",
          }}>
            {c.glyph && <span style={{
              width: 14, height: 14, borderRadius: 3,
              background: c.glyph.color,
              display: "grid", placeItems: "center",
              color: "rgba(0,0,0,0.7)", fontSize: 9, fontWeight: 700,
              flexShrink: 0,
            }}>{c.glyph.text}</span>}
            {c.icon && <span style={{ color: "var(--fg-subtle)" }}>{c.icon}</span>}
            <span>{c.label}</span>
            {c.id && <Mono faded style={{ marginLeft: 4 }}>{c.id}</Mono>}
          </button>
        </React.Fragment>
      ))}
      {children}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {actions}
    </div>
  </header>
);

const Btn = ({ children, variant = "default", icon, kbd, onClick, style }) => {
  const variants = {
    default: { bg: "var(--bg-surface-2)", fg: "var(--fg)", bd: "var(--line)" },
    ghost:   { bg: "transparent", fg: "var(--fg-muted)", bd: "transparent" },
    primary: { bg: "var(--accent)", fg: "var(--accent-fg)", bd: "transparent" },
    outline: { bg: "transparent", fg: "var(--fg)", bd: "var(--line)" },
  };
  const v = variants[variant];
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px",
      height: 26,
      borderRadius: "var(--r-md)",
      background: v.bg, color: v.fg,
      border: `1px solid ${v.bd}`,
      fontSize: "var(--fs-12)",
      fontWeight: variant === "primary" ? 500 : 450,
      ...style,
    }}>
      {icon}
      {children}
      {kbd && <KBD>{kbd}</KBD>}
    </button>
  );
};

/* Export to window for cross-script access */
Object.assign(window, {
  Icon, I, StatusDot, StatusIcon, PriorityFlag, Badge, Label, Mono, KBD, Avatar,
  Sidebar, Topbar, Btn, NavItem, ProjectTreeItem,
});
