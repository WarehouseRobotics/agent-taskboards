import type { ReactNode } from "react";
import { Icon } from "../ui";

export function Sheet({
  children,
  onCancel,
  title,
}: {
  children: ReactNode;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={onCancel}>
      <aside className="sheet" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sheet__header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} title="Close">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
