/* global React, Sidebar, Topbar, Btn, I, KBD, StatusIcon, PriorityFlag, Badge, Label, Mono, Avatar, COLUMNS, TASKS, PROJECTS */
const { useState: useStateBV } = React;

const TaskCard = ({ task, status, onOpen }) => {
  const [hover, setHover] = useStateBV(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: 6,
        cursor: "pointer",
        boxShadow: hover ? "var(--shadow-pop)" : "var(--shadow-card)",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "transform var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-faint)" }}>
        <PriorityFlag p={task.priority} />
        <Mono faded style={{ fontSize: 10 }}>{task.id}</Mono>
        {task.blockedBy && (
          <Mono style={{ color: "var(--status-blocked)", fontSize: 10 }}>
            ↳ blocked by {task.blockedBy}
          </Mono>
        )}
        <span style={{ flex: 1 }} />
        {task.assignee && <Avatar kind={task.assignee.kind} name={task.assignee.name} size={16} />}
      </div>
      <div style={{
        fontSize: "var(--fs-13)",
        lineHeight: 1.35,
        color: "var(--fg)",
        fontWeight: 450,
        textWrap: "pretty",
      }}>{task.title}</div>
      {(task.labels?.length || task.comments != null || task.agent) && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 1 }}>
          {task.labels?.map(([n, c]) => <Label key={n} name={n} color={c} />)}
          <span style={{ flex: 1 }} />
          {task.agent && (
            <span title={task.agentNote || "agent activity"} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              color: "var(--agent-tint)", fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}>
              {I.agent}
              <span>{task.agentNote || "agent"}</span>
            </span>
          )}
          {task.comments > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              color: "var(--fg-faint)", fontSize: 10,
            }}>
              {I.comment} {task.comments}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const Column = ({ col, tasks, onOpenTask }) => {
  const overLimit = col.limit && tasks.length > col.limit;
  return (
    <div style={{
      width: 268, flexShrink: 0,
      display: "flex", flexDirection: "column",
      background: "transparent",
      borderRadius: "var(--r-lg)",
      height: "100%",
    }}>
      <div style={{
        padding: "8px 4px 8px 6px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid var(--line-faint)",
        marginBottom: 8,
      }}>
        <StatusIcon status={col.status} size={12} />
        <span style={{
          fontSize: "var(--fs-12)", fontWeight: 600,
          color: "var(--fg)",
          letterSpacing: "var(--tracking-tight)",
        }}>{col.name}</span>
        <span className="mono" style={{
          color: overLimit ? "var(--status-blocked)" : "var(--fg-faint)",
          fontSize: 10,
        }}>{tasks.length}{col.limit ? `/${col.limit}` : ""}</span>
        <span style={{ flex: 1 }} />
        <button title="Add task" style={{ color: "var(--fg-faint)", padding: 2 }}>{I.plus}</button>
        <button title="Column menu" style={{ color: "var(--fg-faint)", padding: 2 }}>{I.more}</button>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        overflowY: "auto",
        flex: 1,
        padding: "0 1px 8px",
      }}>
        {tasks.map(t => <TaskCard key={t.id} task={t} status={col.status} onOpen={onOpenTask} />)}
        {tasks.length === 0 && (
          <div style={{
            padding: "10px 12px",
            color: "var(--fg-faint)",
            fontSize: "var(--fs-12)",
            border: "1px dashed var(--line-faint)",
            borderRadius: "var(--r-md)",
            textAlign: "center",
          }}>No tasks</div>
        )}
        <button style={{
          padding: "6px 8px",
          color: "var(--fg-faint)",
          fontSize: "var(--fs-12)",
          textAlign: "left",
          borderRadius: "var(--r-sm)",
          display: "flex", alignItems: "center", gap: 6,
          marginTop: 2,
        }}>{I.plus} New task</button>
      </div>
    </div>
  );
};

const BoardView = ({ onOpenTask }) => {
  return (
    <div style={{
      height: "100%",
      display: "flex", flexDirection: "column",
      background: "var(--bg-app)",
    }}>
      <Sidebar active="board" projects={PROJECTS} currentProject="atb" currentBoard="atb-active" />
      {/* container around content */}
    </div>
  );
};

const BoardScreen = ({ onOpenTask }) => (
  <div style={{ display: "flex", height: "100%", background: "var(--bg-app)" }}>
    <Sidebar active="board" projects={PROJECTS} currentProject="atb" currentBoard="atb-active" />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Topbar
        crumbs={[
          { glyph: { color: "oklch(0.78 0.14 250)", text: "AT" }, label: "agent-taskboards" },
          { icon: I.board, label: "Active Sprint", id: "BRD-001" },
        ]}
        actions={
          <>
            <Btn variant="ghost" icon={I.filter}>Filter</Btn>
            <Btn variant="ghost" icon={I.refresh}>Sync</Btn>
            <div style={{ width: 1, height: 18, background: "var(--line)" }} />
            <Btn variant="outline" icon={I.copy} kbd="⌘C">Copy IDs</Btn>
            <Btn variant="primary" icon={I.plus} kbd="N">New task</Btn>
          </>
        }
      />
      {/* Sub-toolbar — board meta + view switcher */}
      <div style={{
        height: 36, flexShrink: 0,
        borderBottom: "1px solid var(--line)",
        background: "var(--bg-app)",
        padding: "0 16px",
        display: "flex", alignItems: "center", gap: 12,
        fontSize: "var(--fs-12)",
        color: "var(--fg-muted)",
      }}>
        <div style={{ display: "flex", gap: 2, padding: 2, background: "var(--bg-surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
          {["Board", "List", "Timeline"].map((v, i) => (
            <button key={v} style={{
              padding: "2px 8px",
              fontSize: 11,
              borderRadius: 4,
              fontWeight: i === 0 ? 500 : 400,
              color: i === 0 ? "var(--fg)" : "var(--fg-muted)",
              background: i === 0 ? "var(--bg-active)" : "transparent",
            }}>{v}</button>
          ))}
        </div>
        <span className="mono" style={{ color: "var(--fg-faint)", fontSize: 10 }}>17 tasks · 3 in progress · 1 blocked</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--fg-faint)" }}>Group by</span>
          <button style={{
            padding: "2px 6px", borderRadius: 4,
            border: "1px solid var(--line)",
            background: "var(--bg-surface)",
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 11,
          }}>Status {I.chevDown}</button>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--fg-faint)" }}>Sort</span>
          <button style={{
            padding: "2px 6px", borderRadius: 4,
            border: "1px solid var(--line)",
            background: "var(--bg-surface)",
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 11,
          }}>Priority {I.chevDown}</button>
        </span>
      </div>
      {/* Columns */}
      <div style={{
        flex: 1,
        overflowX: "auto",
        overflowY: "hidden",
        padding: "12px 16px 0",
        display: "flex", gap: 12,
      }}>
        {COLUMNS.map(col => (
          <Column key={col.id} col={col} tasks={TASKS[col.id] || []} onOpenTask={onOpenTask} />
        ))}
      </div>
    </div>
  </div>
);

window.BoardScreen = BoardScreen;
