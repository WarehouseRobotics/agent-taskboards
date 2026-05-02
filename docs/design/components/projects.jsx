/* global React, Sidebar, Topbar, Btn, I, KBD, StatusIcon, PriorityFlag, Badge, Label, Mono, Avatar, PROJECTS */

const ProjectsScreen = () => {
  const rows = [
    { id: "PRJ-001", glyph: { color: "oklch(0.78 0.14 250)", text: "AT" }, name: "agent-taskboards", path: "~/code/agent-taskboards", boards: 3, open: 32, blocked: 1, agents: 2, updated: "12m ago", health: "ok" },
    { id: "PRJ-002", glyph: { color: "oklch(0.78 0.13 295)", text: "IE" }, name: "ide-extension", path: "~/code/ide-extension", boards: 2, open: 18, blocked: 0, agents: 1, updated: "2h ago", health: "ok" },
    { id: "PRJ-003", glyph: { color: "oklch(0.78 0.13 145)", text: "ES" }, name: "embed-server", path: "~/code/embed-server", boards: 1, open: 9, blocked: 2, agents: 0, updated: "yesterday", health: "warn" },
    { id: "PRJ-004", glyph: { color: "oklch(0.78 0.14 65)", text: "AS" }, name: "agent-shell", path: "~/code/agent-shell", boards: 1, open: 6, blocked: 0, agents: 1, updated: "3d ago", health: "ok" },
    { id: "PRJ-005", glyph: { color: "oklch(0.78 0.08 200)", text: "DD" }, name: "developer-docs", path: "~/code/developer-docs", boards: 1, open: 11, blocked: 0, agents: 0, updated: "1w ago", health: "stale" },
    { id: "PRJ-006", glyph: { color: "oklch(0.7 0.04 250)", text: "IS" }, name: "infra-scripts", path: "~/code/infra-scripts", boards: 1, open: 4, blocked: 0, agents: 0, updated: "2w ago", health: "stale" },
  ];

  const totalOpen = rows.reduce((s, r) => s + r.open, 0);
  const totalBlocked = rows.reduce((s, r) => s + r.blocked, 0);

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-app)" }}>
      <Sidebar active="projects" projects={PROJECTS} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          crumbs={[{ icon: I.list, label: "Projects" }]}
          actions={
            <>
              <Btn variant="ghost" icon={I.filter}>Filter</Btn>
              <div style={{ width: 1, height: 18, background: "var(--line)" }} />
              <Btn variant="primary" icon={I.plus}>New project</Btn>
            </>
          }
        />
        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          {/* Stat strip */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--bg-surface)" }}>
            {[
              { label: "Projects", value: rows.length, hint: `${rows.filter(r=>r.health!=="stale").length} active` },
              { label: "Open tasks", value: totalOpen, hint: "across all boards" },
              { label: "Blocked", value: totalBlocked, hint: "needs attention", tone: "blocked" },
              { label: "Agents working", value: rows.reduce((s,r)=>s+r.agents,0), hint: "in last 24h", tone: "agent" },
              { label: "Index health", value: "98.2%", hint: "embeddings fresh", tone: "ok" },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1,
                padding: "12px 16px",
                borderLeft: i === 0 ? "none" : "1px solid var(--line-faint)",
              }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)", fontWeight: 600 }}>{s.label}</div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  color:
                    s.tone === "blocked" ? "var(--status-blocked)" :
                    s.tone === "agent" ? "var(--agent-tint)" :
                    s.tone === "ok" ? "var(--status-done)" :
                    "var(--fg)",
                  marginTop: 2,
                }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>{s.hint}</div>
              </div>
            ))}
          </div>

          {/* Search row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{
              flex: 1, maxWidth: 320,
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px",
              background: "var(--bg-input)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              color: "var(--fg-faint)",
              fontSize: "var(--fs-12)",
            }}>
              {I.search}
              <span>Filter projects…</span>
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--fg-faint)" }}>Sort</span>
              <button style={{
                padding: "3px 8px", borderRadius: 4,
                border: "1px solid var(--line)",
                background: "var(--bg-surface)",
                display: "flex", alignItems: "center", gap: 4,
              }}>Recently updated {I.chevDown}</button>
            </span>
          </div>

          {/* Table */}
          <div style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            background: "var(--bg-surface)",
            overflow: "hidden",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2fr) 1.4fr 70px 90px 90px 80px 110px 28px",
              padding: "8px 14px",
              fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)",
              color: "var(--fg-faint)", fontWeight: 600,
              borderBottom: "1px solid var(--line)",
              background: "var(--bg-surface-2)",
            }}>
              <span>Project</span>
              <span>Path</span>
              <span style={{ textAlign: "right" }}>Boards</span>
              <span style={{ textAlign: "right" }}>Open</span>
              <span style={{ textAlign: "right" }}>Blocked</span>
              <span style={{ textAlign: "right" }}>Agents</span>
              <span style={{ textAlign: "right" }}>Updated</span>
              <span></span>
            </div>
            {rows.map((r, i) => (
              <div key={r.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 2fr) 1.4fr 70px 90px 90px 80px 110px 28px",
                padding: "10px 14px",
                fontSize: "var(--fs-13)",
                color: "var(--fg)",
                alignItems: "center",
                borderBottom: i < rows.length - 1 ? "1px solid var(--line-faint)" : "none",
                cursor: "pointer",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 5,
                    background: r.glyph.color,
                    display: "grid", placeItems: "center",
                    color: "rgba(0,0,0,0.75)", fontSize: 10, fontWeight: 700,
                    flexShrink: 0,
                  }}>{r.glyph.text}</span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <Mono faded style={{ fontSize: 10 }}>{r.id}</Mono>
                  </span>
                </span>
                <span className="mono" style={{ color: "var(--fg-muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</span>
                <span className="mono" style={{ textAlign: "right", color: "var(--fg-muted)", fontSize: 12 }}>{r.boards}</span>
                <span className="mono" style={{ textAlign: "right", fontSize: 12 }}>{r.open}</span>
                <span className="mono" style={{
                  textAlign: "right", fontSize: 12,
                  color: r.blocked > 0 ? "var(--status-blocked)" : "var(--fg-faint)",
                  fontWeight: r.blocked > 0 ? 500 : 400,
                }}>{r.blocked}</span>
                <span style={{ textAlign: "right" }}>
                  {r.agents > 0 ? (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      color: "var(--agent-tint)",
                      fontFamily: "var(--font-mono)", fontSize: 11,
                    }}>{I.agent} {r.agents}</span>
                  ) : (
                    <span className="mono" style={{ color: "var(--fg-faint)", fontSize: 12 }}>—</span>
                  )}
                </span>
                <span style={{ textAlign: "right", color: r.health === "stale" ? "var(--fg-faint)" : "var(--fg-muted)", fontSize: 11 }}>{r.updated}</span>
                <span style={{ textAlign: "right", color: "var(--fg-faint)" }}>{I.more}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <Mono>{rows.length} projects · {totalOpen} open tasks · {totalBlocked} blocked</Mono>
            <span style={{ flex: 1 }} />
            <KBD>N</KBD> <span>new project</span>
            <span style={{ width: 8 }} />
            <KBD>/</KBD> <span>filter</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.ProjectsScreen = ProjectsScreen;
