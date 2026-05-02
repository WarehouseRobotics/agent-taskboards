/* global React, Sidebar, Topbar, Btn, I, KBD, StatusIcon, Mono, PROJECTS */

const SettingsScreen = () => {
  const sections = [
    { id: "general", label: "General", icon: I.settings, active: true },
    { id: "appearance", label: "Appearance", icon: I.dotGrid },
    { id: "data", label: "Data & storage", icon: I.database },
    { id: "embeddings", label: "Embeddings", icon: I.zap },
    { id: "api", label: "API & device key", icon: I.command },
    { id: "agents", label: "Agent integrations", icon: I.agent },
    { id: "shortcuts", label: "Keyboard shortcuts", icon: I.file },
    { id: "about", label: "About", icon: I.inbox },
  ];

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-app)" }}>
      <Sidebar active="settings" projects={PROJECTS} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar crumbs={[{ icon: I.settings, label: "Settings" }]} />
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Settings nav */}
          <nav style={{
            width: 220, flexShrink: 0,
            borderRight: "1px solid var(--line-faint)",
            padding: "20px 12px",
            display: "flex", flexDirection: "column", gap: 1,
          }}>
            <div style={{
              padding: "0 8px 8px",
              fontSize: 10, textTransform: "uppercase",
              letterSpacing: "var(--tracking-wide)", color: "var(--fg-faint)", fontWeight: 600,
            }}>Local instance</div>
            {sections.map(s => (
              <button key={s.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 8px",
                borderRadius: "var(--r-sm)",
                background: s.active ? "var(--bg-active)" : "transparent",
                color: s.active ? "var(--fg)" : "var(--fg-muted)",
                fontSize: "var(--fs-12)",
                fontWeight: s.active ? 500 : 400,
                width: "100%",
                textAlign: "left",
              }}>
                <span style={{ color: s.active ? "var(--accent)" : "var(--fg-faint)" }}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          {/* Pane */}
          <div style={{ flex: 1, overflow: "auto", padding: "28px 36px", maxWidth: 720 }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{
                margin: 0,
                fontSize: 22, fontWeight: 600,
                letterSpacing: "var(--tracking-tight)",
                color: "var(--fg)",
              }}>General</h1>
              <p style={{ margin: "4px 0 0", color: "var(--fg-muted)", fontSize: "var(--fs-13)", maxWidth: 540, textWrap: "pretty" }}>
                This Agent Taskboards instance is single-user and local. All settings apply to your machine only.
              </p>
            </div>

            <Section title="Workspace">
              <Field label="Display name" hint="Shown in activity entries and comments authored by you.">
                <FauxInput value="Morgan" />
              </Field>
              <Field label="Default project" hint="Opens this project on startup.">
                <FauxSelect value="agent-taskboards" />
              </Field>
              <Field label="Default board view" hint="Board, list, or timeline when entering a board.">
                <Segmented options={["Board", "List", "Timeline"]} value="Board" />
              </Field>
            </Section>

            <Section title="Appearance">
              <Field label="Theme" hint="Switch via ⌘⇧L.">
                <Segmented options={["System", "Dark", "Light"]} value="Dark" />
              </Field>
              <Field label="Density" hint="How tightly task cards stack on a board.">
                <Segmented options={["Compact", "Cozy", "Comfortable"]} value="Cozy" />
              </Field>
              <Field label="Show stable IDs on cards" hint="When off, IDs are still visible in detail views and on hover.">
                <FauxToggle on />
              </Field>
            </Section>

            <Section title="Local data">
              <DataRow label="SQLite store" value="~/.local/share/agent-taskboards/db.sqlite" hint="234.5 MB · WAL on" />
              <DataRow label="Embedding model" value="bge-small-en-v1.5-f32.gguf" hint="91.4 MB · 384 dims · loaded" tone="ok" />
              <DataRow label="Vector index" value="sqlite-vec · 12,408 chunks" hint="last reindex 4h ago · 100% covered" tone="ok" />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn variant="outline" icon={I.refresh}>Reindex embeddings</Btn>
                <Btn variant="outline" icon={I.archive}>Open archive</Btn>
                <span style={{ flex: 1 }} />
                <Btn variant="outline" style={{ color: "var(--status-blocked)", borderColor: "color-mix(in oklch, var(--status-blocked) 40%, var(--line))" }}>Purge archive…</Btn>
              </div>
            </Section>

            <Section title="API & device key">
              <Field label="Local API" hint="Express server proxied by Vite in debug.">
                <FauxInput value="http://localhost:5174/api" mono />
              </Field>
              <Field label="Device key" hint="Required by every API request from agents and scripts.">
                <div style={{ display: "flex", gap: 6 }}>
                  <FauxInput value="atbk_••••••••••••••••5e7f" mono />
                  <Btn variant="outline" icon={I.copy}>Copy</Btn>
                  <Btn variant="outline" icon={I.refresh}>Rotate</Btn>
                </div>
              </Field>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <section style={{
    marginBottom: 28,
    paddingBottom: 4,
  }}>
    <h2 style={{
      margin: "0 0 12px",
      fontSize: "var(--fs-12)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-wide)",
      color: "var(--fg-faint)",
      fontWeight: 600,
      paddingBottom: 8,
      borderBottom: "1px solid var(--line-faint)",
    }}>{title}</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
  </section>
);

const Field = ({ label, hint, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "start" }}>
    <div>
      <div style={{ fontSize: "var(--fs-13)", color: "var(--fg)", fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ fontSize: "var(--fs-11)", color: "var(--fg-faint)", marginTop: 2, textWrap: "pretty" }}>{hint}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const FauxInput = ({ value, mono }) => (
  <div style={{
    height: 28,
    padding: "0 10px",
    background: "var(--bg-input)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-md)",
    display: "flex", alignItems: "center",
    fontSize: mono ? 12 : "var(--fs-13)",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    color: "var(--fg)",
    flex: 1,
  }}>{value}</div>
);

const FauxSelect = ({ value }) => (
  <div style={{
    height: 28,
    padding: "0 10px",
    background: "var(--bg-surface-2)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-md)",
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    fontSize: "var(--fs-13)",
    color: "var(--fg)",
    width: 240,
  }}>
    <span>{value}</span>
    <span style={{ color: "var(--fg-faint)" }}>{I.chevDown}</span>
  </div>
);

const Segmented = ({ options, value }) => (
  <div style={{
    display: "inline-flex", padding: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-md)",
    gap: 2,
  }}>
    {options.map(o => (
      <span key={o} style={{
        padding: "3px 12px",
        fontSize: "var(--fs-12)",
        borderRadius: 4,
        color: o === value ? "var(--fg)" : "var(--fg-muted)",
        background: o === value ? "var(--bg-active)" : "transparent",
        fontWeight: o === value ? 500 : 400,
      }}>{o}</span>
    ))}
  </div>
);

const FauxToggle = ({ on }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    width: 30, height: 18,
    background: on ? "var(--accent)" : "var(--bg-surface-2)",
    border: `1px solid ${on ? "transparent" : "var(--line)"}`,
    borderRadius: 999,
    padding: 2,
    transition: "background var(--t-base)",
  }}>
    <span style={{
      width: 12, height: 12, borderRadius: "50%",
      background: on ? "var(--accent-fg)" : "var(--fg-subtle)",
      transform: on ? "translateX(12px)" : "translateX(0)",
      transition: "transform var(--t-base)",
    }} />
  </span>
);

const DataRow = ({ label, value, hint, tone }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "180px 1fr auto",
    alignItems: "center", gap: 18,
    padding: "8px 12px",
    background: "var(--bg-surface)",
    border: "1px solid var(--line-faint)",
    borderRadius: "var(--r-md)",
  }}>
    <span style={{ fontSize: "var(--fs-13)", color: "var(--fg)", fontWeight: 500 }}>{label}</span>
    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
      <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{hint}</span>
    </span>
    {tone === "ok" && (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        color: "var(--status-done)", fontSize: 11,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-done)" }} />
        healthy
      </span>
    )}
  </div>
);

window.SettingsScreen = SettingsScreen;
