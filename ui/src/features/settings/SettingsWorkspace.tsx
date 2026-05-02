import type { Theme, Health } from "../../domain/types";
import { Icon, Mono } from "../../components/ui";
import type { IconName } from "../../components/ui";
import { Topbar } from "../../components/layout";

export function SettingsWorkspace({
  health,
  onSectionChange,
  onThemeChange,
  section,
  theme,
}: {
  health: Health | null;
  onSectionChange: (section: string) => void;
  onThemeChange: (theme: Theme) => void;
  section: string;
  theme: Theme;
}) {
  const sections: Array<{ id: string; label: string; icon: IconName }> = [
    { id: "general", label: "General", icon: "settings" },
    { id: "appearance", label: "Appearance", icon: "theme" },
    { id: "data-storage", label: "Data & storage", icon: "database" },
    { id: "api", label: "API", icon: "command" },
  ];
  const current = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Settings", icon: <Icon name="settings" /> },
          { label: current.label },
        ]}
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              className={item.id === current.id ? "settings-nav__item settings-nav__item--active" : "settings-nav__item"}
              key={item.id}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          <h1>{current.label}</h1>
          {current.id === "general" && (
            <section className="settings-section">
              <h2>Local instance</h2>
              <div className="data-row">
                <span>Mode</span>
                <Mono>single-user local</Mono>
                <strong>active</strong>
              </div>
              <div className="data-row">
                <span>API health</span>
                <Mono>{health?.ok ? "ok" : "offline"}</Mono>
                <strong>{health?.database?.ok ? "healthy" : "unavailable"}</strong>
              </div>
            </section>
          )}
          {current.id === "appearance" && (
            <section className="settings-section">
              <h2>Theme</h2>
              <div className="setting-row">
                <span>
                  <strong>Theme</strong>
                  <small>Dark is default; light is first-class.</small>
                </span>
                <div className="segmented">
                  <button className={theme === "dark" ? "segmented__item segmented__item--active" : "segmented__item"} onClick={() => onThemeChange("dark")}>Dark</button>
                  <button className={theme === "light" ? "segmented__item segmented__item--active" : "segmented__item"} onClick={() => onThemeChange("light")}>Light</button>
                </div>
              </div>
            </section>
          )}
          {current.id === "data-storage" && (
            <section className="settings-section">
              <h2>Local data</h2>
              <div className="data-row">
                <span>SQLite store</span>
                <Mono>{health?.database?.path ?? "/data/taskboards.sqlite"}</Mono>
                <strong>{health?.database?.ok ? "healthy" : "unavailable"}</strong>
              </div>
              <div className="data-row">
                <span>Search APIs</span>
                <Mono faded>planned</Mono>
                <strong>not exposed</strong>
              </div>
            </section>
          )}
          {current.id === "api" && (
            <section className="settings-section">
              <h2>API</h2>
              <div className="data-row">
                <span>Base URL</span>
                <Mono>/api</Mono>
                <strong>{health?.ok ? "available" : "offline"}</strong>
              </div>
              <div className="data-row">
                <span>Health</span>
                <Mono>GET /api/health</Mono>
                <strong>{health?.database?.ok ? "healthy" : "unavailable"}</strong>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
