import type { ReactNode } from "react";
import { Mono } from "../ui";

export function Topbar({
  actions,
  crumbs,
}: {
  actions?: ReactNode;
  crumbs: Array<{ label: string; id?: string; icon?: ReactNode; glyph?: string }>;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        {crumbs.map((crumb, index) => (
          <span className="breadcrumb" key={`${crumb.label}-${index}`}>
            {index > 0 && <span className="breadcrumb__sep">/</span>}
            {crumb.glyph && <span className="project-glyph">{crumb.glyph}</span>}
            {crumb.icon}
            <span className="breadcrumb__label">{crumb.label}</span>
            {crumb.id && <Mono faded>{crumb.id}</Mono>}
          </span>
        ))}
      </div>
      {actions && <div className="topbar__actions">{actions}</div>}
    </header>
  );
}
