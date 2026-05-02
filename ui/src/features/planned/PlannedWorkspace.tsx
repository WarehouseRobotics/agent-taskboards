import type { Health } from "../../domain/types";
import { Icon, Mono } from "../../components/ui";
import { Topbar } from "../../components/layout";

export function PlannedWorkspace({
  health,
  icon,
  title,
}: {
  health: Health | null;
  icon: "database" | "search";
  title: string;
}) {
  return (
    <>
      <Topbar crumbs={[{ label: title, icon: <Icon name={icon} /> }]} />
      <div className="workspace-pane">
        <div className="planned-panel">
          <Icon name={icon} size={18} />
          <h1>{title}</h1>
          <p>This screen is styled from the design system and waiting on the planned API surface.</p>
          <div className="data-card">
            <span>Current API</span>
            <strong>{health?.ok ? "healthy" : "offline"}</strong>
            <Mono faded>{health?.database?.path ?? "/data/taskboards.sqlite"}</Mono>
          </div>
        </div>
      </div>
    </>
  );
}
