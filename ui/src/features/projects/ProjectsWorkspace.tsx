import type { ReactNode } from "react";
import type { ProjectTreeItem } from "../../domain/types";
import { formatDate } from "../../lib/format";
import { glyphForName } from "../../lib/task-display";
import { Button, EmptyState, Icon, Mono, SkeletonRows } from "../../components/ui";
import { Topbar } from "../../components/layout";

export function ProjectsWorkspace({
  activeProjectId,
  loading,
  onCreateProject,
  onSelectProject,
  projectTree,
}: {
  activeProjectId: string | null;
  loading: boolean;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  projectTree: ProjectTreeItem[];
}) {
  const totalBoards = projectTree.reduce((sum, item) => sum + item.boards.length, 0);
  return (
    <>
      <Topbar
        actions={<Button icon={<Icon name="plus" />} onClick={onCreateProject} variant="primary">New project</Button>}
        crumbs={[{ label: "Projects", icon: <Icon name="list" /> }]}
      />
      <div className="workspace-pane">
        <div className="stat-strip">
          <Stat label="Projects" value={projectTree.length} hint="active scopes" />
          <Stat label="Boards" value={totalBoards} hint="across projects" />
          <Stat label="Agents" value="API" hint="shared control surface" tone="agent" />
        </div>
        {loading ? (
          <SkeletonRows />
        ) : projectTree.length === 0 ? (
          <EmptyState title="No projects yet" body="Create a project to start a local-first work scope." action={<Button icon={<Icon name="plus" />} onClick={onCreateProject} variant="primary">Create First Project</Button>} />
        ) : (
          <div className="project-table">
            <div className="project-table__header">
              <span>Project</span>
              <span>Path</span>
              <span>Boards</span>
              <span>Updated</span>
            </div>
            {projectTree.map((item) => (
              <button
                className={item.project.id === activeProjectId ? "project-row project-row--active" : "project-row"}
                key={item.project.id}
                onClick={() => onSelectProject(item.project.id)}
              >
                <span className="project-row__name">
                  <span className="project-glyph">{glyphForName(item.project.name)}</span>
                  <span>
                    <strong>{item.project.name}</strong>
                    <Mono faded>{item.project.id}</Mono>
                  </span>
                </span>
                <Mono faded>{item.project.repositoryPath ?? "none"}</Mono>
                <Mono>{item.boards.length}</Mono>
                <span>{formatDate(item.project.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "agent" }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone === "agent" ? "stat__agent" : undefined}>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
