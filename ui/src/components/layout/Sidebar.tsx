import { useEffect, useState } from "react";
import type { Health, ProjectTreeItem, View } from "../../domain/types";
import { glyphForName } from "../../lib/task-display";
import { Icon, Kbd, Mono, SkeletonRows, type IconName } from "../ui";

export function Sidebar({
  activeBoardId,
  activeProjectId,
  health,
  loading,
  onCreateBoard,
  onCreateProject,
  onSelectBoard,
  onSelectProject,
  onSelectView,
  projectTree,
  view,
}: {
  activeBoardId: string | null;
  activeProjectId: string | null;
  health: Health | null;
  loading: boolean;
  onCreateBoard: () => void;
  onCreateProject: () => void;
  onSelectBoard: (projectId: string, boardId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectView: (view: View) => void;
  projectTree: ProjectTreeItem[];
  view: View;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="app-mark">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="3" height="9" rx="1" fill="currentColor" opacity="0.55" />
            <rect x="5.5" y="1.5" width="3" height="6" rx="1" fill="currentColor" />
            <rect x="9.5" y="1.5" width="1" height="4" rx="0.5" fill="currentColor" opacity="0.85" />
          </svg>
        </div>
        <div className="sidebar__title">
          <strong>Agent Taskboards</strong>
          <Mono faded>localhost:8142</Mono>
        </div>
        <button className="icon-btn" title="Command menu">
          <Icon name="command" />
        </button>
      </div>
      <div className="sidebar__search">
        <Icon name="search" />
        <span>Search...</span>
        <Kbd>/</Kbd>
      </div>
      <nav className="sidebar__nav">
        <NavItem active={view === "board"} count={projectTree.length} icon="board" label="Boards" onClick={() => onSelectView("board")} />
        <NavItem active={view === "projects"} count={projectTree.length} icon="list" label="Projects" onClick={() => onSelectView("projects")} />
        <NavItem active={view === "search"} icon="search" label="Search" onClick={() => onSelectView("search")} />
        <NavItem active={view === "maintenance"} icon="database" label="Maintenance" onClick={() => onSelectView("maintenance")} />
        <NavItem active={view === "settings"} icon="settings" label="Settings" onClick={() => onSelectView("settings")} />
      </nav>
      <div className="sidebar__section-heading">
        <span>Projects</span>
        <span>
          <button className="icon-btn" title="New board" onClick={onCreateBoard} disabled={!activeProjectId}>
            <Icon name="board" />
          </button>
          <button className="icon-btn" title="New project" onClick={onCreateProject}>
            <Icon name="plus" />
          </button>
        </span>
      </div>
      <div className="project-tree">
        {loading && <SkeletonRows />}
        {!loading && projectTree.length === 0 && (
          <div className="sidebar-empty">No projects yet. Create one to start tracking work.</div>
        )}
        {projectTree.map((item) => (
          <ProjectNode
            activeBoardId={activeBoardId}
            activeProjectId={activeProjectId}
            item={item}
            key={item.project.id}
            onSelectBoard={onSelectBoard}
            onSelectProject={onSelectProject}
          />
        ))}
      </div>
      <div className="sidebar__footer">
        <span className={health?.ok ? "health-dot health-dot--ok" : "health-dot health-dot--bad"} />
        <Mono>{health?.ok ? "api healthy" : "api offline"}</Mono>
        <span className="sidebar__version">
          <Mono faded>v{__APP_VERSION__}</Mono>
        </span>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: Extract<IconName, "board" | "database" | "list" | "search" | "settings">;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-item nav-item--active" : "nav-item"} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
      {count !== undefined && <Mono faded>{count}</Mono>}
    </button>
  );
}

function ProjectNode({
  activeBoardId,
  activeProjectId,
  item,
  onSelectBoard,
  onSelectProject,
}: {
  activeBoardId: string | null;
  activeProjectId: string | null;
  item: ProjectTreeItem;
  onSelectBoard: (projectId: string, boardId: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(item.project.id === activeProjectId);
  const glyph = glyphForName(item.project.name);

  useEffect(() => {
    if (item.project.id === activeProjectId) {
      setOpen(true);
    }
  }, [activeProjectId, item.project.id]);

  return (
    <div className="project-node">
      <button
        className={item.project.id === activeProjectId && !activeBoardId ? "project-node__project project-node__project--active" : "project-node__project"}
        onClick={() => {
          setOpen((current) => !current);
          onSelectProject(item.project.id);
        }}
      >
        <Icon name="chevron" className={open ? "project-node__chevron project-node__chevron--open" : "project-node__chevron"} />
        <span className="project-glyph">{glyph}</span>
        <span className="project-node__name">{item.project.name}</span>
        {item.taskCount !== null && <Mono faded>{item.taskCount}</Mono>}
      </button>
      {open && (
        <div className="project-node__boards">
          {item.boards.length === 0 && <span className="project-node__empty">No boards</span>}
          {item.boards.map((board) => (
            <button
              className={board.id === activeBoardId ? "project-node__board project-node__board--active" : "project-node__board"}
              key={board.id}
              onClick={() => onSelectBoard(item.project.id, board.id)}
            >
              <Icon name="board" />
              <span>{board.name}</span>
              {board.id === activeBoardId && <span className="selected-dot" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
