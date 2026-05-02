/* global React, Sidebar, Topbar, Btn, I, KBD, StatusIcon, PriorityFlag, Badge, Label, Mono, Avatar, PROJECTS */

const TaskScreen = () => {
  const task = {
    id: "TSK-194",
    title: "Local-first auth: device key for API requests",
    status: "progress",
    priority: "p0",
    project: "agent-taskboards",
    projectGlyph: { color: "oklch(0.78 0.14 250)", text: "AT" },
    board: "Active Sprint",
    labels: [["api", "api"], ["infra", "infra"], ["security", "bug"]],
    created: "2026-04-22 09:14",
    updated: "2026-04-30 18:02",
    description: `The CLI and the agent shell currently authenticate to the API
through an environment variable that is shared across the dev machine. We need
a per-installation device key generated at first run, stored in the user's
local config dir, and required by every API request.

Acceptance:
- key generated on first server start, persisted to ~/.config/agent-taskboards/device.key
- accepted via Authorization: Bearer <key> OR x-device-key header
- 401 with stable error code DEVICE_KEY_MISSING / DEVICE_KEY_INVALID
- agent skill picks key up from env or config without manual setup`,
  };

  const activity = [
    { kind: "agent", who: "Claude", when: "12m ago", body: <>Opened comment with retrieval results from <Mono style={{color:"var(--accent)"}}>TSK-167</Mono> for schema context.</>, isComment: true,
      comment: "Cross-referencing the schema task — the existing `auth_keys` table can be repurposed if we add a `device_id` column. Sketch attached." },
    { kind: "system", when: "1h ago", body: <>Status changed <Mono>ready</Mono> → <Mono style={{color:"var(--status-progress)"}}>in progress</Mono></> },
    { kind: "human", who: "you", when: "3h ago", body: "Pulled into the active sprint and assigned to self.", isComment: true, comment: "Going to take this. Will pair with the schema work since it touches the same migration." },
    { kind: "agent", who: "Codex", when: "yesterday", body: <>Linked related task <Mono style={{color:"var(--accent)"}}>TSK-184</Mono> (model integrity check) — both run on first boot.</> },
    { kind: "system", when: "2d ago", body: <>Created via API · <Mono>POST /v1/tasks</Mono></> },
  ];

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-app)" }}>
      <Sidebar active="board" projects={PROJECTS} currentProject="atb" currentBoard="atb-active" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          crumbs={[
            { glyph: task.projectGlyph, label: task.project },
            { icon: I.board, label: task.board },
            { icon: null, label: task.title.length > 38 ? task.title.slice(0, 38) + "…" : task.title, id: task.id },
          ]}
          actions={
            <>
              <Btn variant="ghost" icon={I.copy}>Copy ID</Btn>
              <Btn variant="ghost" icon={I.link}>Copy link</Btn>
              <div style={{ width: 1, height: 18, background: "var(--line)" }} />
              <Btn variant="outline">Move to…</Btn>
              <Btn variant="outline" icon={I.archive}>Archive</Btn>
              <Btn variant="ghost" icon={I.close} />
            </>
          }
        />
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Main column — description + activity */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 32px", maxWidth: 760, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-faint)", fontSize: "var(--fs-11)" }}>
              <PriorityFlag p={task.priority} size={11} />
              <Mono>{task.id}</Mono>
              <span>·</span>
              <span>created {task.created}</span>
              <span>·</span>
              <span>updated {task.updated}</span>
            </div>
            <h1 style={{
              margin: "8px 0 4px",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "var(--tracking-tight)",
              lineHeight: 1.2,
              color: "var(--fg)",
            }}>{task.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-muted)", fontSize: "var(--fs-12)", marginBottom: 18 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <StatusIcon status={task.status} size={12} /> In Progress
              </span>
              <span style={{ color: "var(--fg-faint)" }}>·</span>
              <span>P0 · Critical</span>
              <span style={{ color: "var(--fg-faint)" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Avatar kind="human" name="M" size={16} /> assigned to you
              </span>
            </div>

            {/* Description */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              padding: "12px 14px",
              fontSize: "var(--fs-13)",
              lineHeight: 1.55,
              color: "var(--fg-muted)",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-sans)",
            }}>{task.description}</div>

            {/* Activity / comments */}
            <div style={{ marginTop: 22 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 10,
                paddingBottom: 6,
                borderBottom: "1px solid var(--line-faint)",
              }}>
                <span style={{ fontSize: "var(--fs-12)", fontWeight: 600, letterSpacing: "var(--tracking-tight)" }}>Activity & Comments</span>
                <Mono faded style={{ fontSize: 10 }}>{activity.length} entries</Mono>
                <span style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
                  {["All", "Comments", "Activity"].map((v, i) => (
                    <button key={v} style={{
                      padding: "1px 7px", fontSize: 10, borderRadius: 3,
                      color: i === 0 ? "var(--fg)" : "var(--fg-muted)",
                      background: i === 0 ? "var(--bg-active)" : "transparent",
                      fontWeight: i === 0 ? 500 : 400,
                    }}>{v}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {activity.map((a, i) => (
                  <ActivityEntry key={i} a={a} />
                ))}
              </div>

              {/* Composer */}
              <div style={{
                marginTop: 14,
                background: "var(--bg-surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Avatar kind="human" name="M" size={18} />
                  <Mono faded style={{ fontSize: 10 }}>commenting as human · authorKind=human</Mono>
                </div>
                <div style={{
                  minHeight: 56,
                  fontSize: "var(--fs-13)",
                  color: "var(--fg-faint)",
                  padding: "4px 2px",
                }}>Add a comment, decision, or handoff note…</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <span className="mono" style={{ color: "var(--fg-faint)", fontSize: 10 }}>markdown · ⌘↵ to send</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn variant="ghost">Cancel</Btn>
                    <Btn variant="primary">Comment</Btn>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right rail — properties */}
          <aside style={{
            width: 300, flexShrink: 0,
            borderLeft: "1px solid var(--line)",
            background: "var(--bg-surface)",
            overflowY: "auto",
            padding: "20px 18px",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <PropRow label="Status" value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <StatusIcon status="progress" size={12} /> In Progress
              </span>
            } />
            <PropRow label="Priority" value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <PriorityFlag p="p0" /> P0 · Critical
              </span>
            } />
            <PropRow label="Assignee" value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Avatar kind="human" name="M" size={16} /> me
              </span>
            } />
            <PropRow label="Labels" value={
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {task.labels.map(([n, c]) => <Label key={n} name={n} color={c} />)}
              </span>
            } />
            <PropRow label="Project" value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: task.projectGlyph.color,
                  display: "grid", placeItems: "center",
                  color: "rgba(0,0,0,0.7)", fontSize: 9, fontWeight: 700,
                }}>{task.projectGlyph.text}</span>
                {task.project}
              </span>
            } />
            <PropRow label="Board" value="Active Sprint" />
            <div style={{ height: 1, background: "var(--line-faint)" }} />

            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)", fontWeight: 600, marginBottom: 6 }}>API reference</div>
              <div style={{
                background: "var(--bg-input)",
                border: "1px solid var(--line-faint)",
                borderRadius: "var(--r-sm)",
                padding: "8px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: 1.6,
                color: "var(--fg-muted)",
              }}>
                <div><span style={{ color: "var(--fg-faint)" }}>id     </span>{task.id}</div>
                <div><span style={{ color: "var(--fg-faint)" }}>uuid   </span>0193b8a2…ce7f</div>
                <div><span style={{ color: "var(--fg-faint)" }}>board  </span>BRD-001</div>
                <div><span style={{ color: "var(--fg-faint)" }}>status </span><span style={{ color: "var(--status-progress)" }}>progress</span></div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Btn variant="outline" icon={I.copy} style={{ flex: 1 }}>Copy ID</Btn>
                <Btn variant="outline" icon={I.external} style={{ flex: 1 }}>cURL</Btn>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)", fontWeight: 600, marginBottom: 6 }}>Related (semantic)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { id: "TSK-167", title: "SQLite schema for projects, boards, tasks", score: 0.84 },
                  { id: "TSK-184", title: "GGUF model integrity check on container start", score: 0.71 },
                  { id: "TSK-225", title: "Allow agents to query tasks by created-after timestamp", score: 0.66 },
                ].map(r => (
                  <button key={r.id} style={{
                    padding: "6px 8px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg-app)",
                    border: "1px solid var(--line-faint)",
                    textAlign: "left",
                    display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Mono faded style={{ fontSize: 10 }}>{r.id}</Mono>
                      <span style={{
                        marginLeft: "auto",
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--accent)",
                      }}>{r.score.toFixed(2)}</span>
                    </span>
                    <span style={{ fontSize: "var(--fs-12)", color: "var(--fg-muted)", textWrap: "pretty" }}>{r.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const PropRow = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "82px 1fr", alignItems: "center", gap: 10 }}>
    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)", fontWeight: 600 }}>{label}</span>
    <span style={{ fontSize: "var(--fs-12)", color: "var(--fg)" }}>{value}</span>
  </div>
);

const ActivityEntry = ({ a }) => {
  const tint =
    a.kind === "agent" ? "var(--agent-tint)" :
    a.kind === "human" ? "var(--human-tint)" :
    "var(--system-tint)";
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ width: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <Avatar kind={a.kind} name={a.who} size={22} />
        <div style={{ flex: 1, width: 1, background: "var(--line-faint)" }} />
      </div>
      <div style={{ flex: 1, paddingTop: 2, paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-12)" }}>
          <span style={{ fontWeight: 500, color: "var(--fg)" }}>{a.who || (a.kind === "system" ? "system" : "")}</span>
          <span style={{
            fontSize: 9, padding: "0 4px",
            borderRadius: 3,
            background: `color-mix(in oklch, ${tint} 16%, transparent)`,
            color: tint,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}>{a.kind}</span>
          <span style={{ color: "var(--fg-muted)", flex: 1, textWrap: "pretty" }}>{a.body}</span>
          <Mono faded style={{ fontSize: 10 }}>{a.when}</Mono>
        </div>
        {a.isComment && a.comment && (
          <div style={{
            marginTop: 6,
            padding: "8px 10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--line-faint)",
            borderLeft: `2px solid ${tint}`,
            borderRadius: "var(--r-sm)",
            fontSize: "var(--fs-12)",
            color: "var(--fg-muted)",
            lineHeight: 1.55,
            textWrap: "pretty",
          }}>{a.comment}</div>
        )}
      </div>
    </div>
  );
};

window.TaskScreen = TaskScreen;
