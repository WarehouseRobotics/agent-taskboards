import type {
  BoardStorageUsage,
  MaintenanceStorageReport,
  ProjectStorageUsage,
  StorageUsageSplit,
} from "../../domain/types";

export type MaintenanceStorageRow = {
  depth: 0 | 1;
  id: string;
  key: string;
  kind: "project" | "board";
  name: string;
  archivedAt: string | null;
  usage: StorageUsageSplit;
};

export function maintenanceStorageRows(
  report: Pick<MaintenanceStorageReport, "projects">,
) {
  return report.projects.flatMap((project) => [
    storageRow(project, "project", 0, project.id),
    ...project.boards.map((board) =>
      storageRow(board, "board", 1, `${project.id}:${board.id}`),
    ),
  ]);
}

function storageRow(
  scope: ProjectStorageUsage | BoardStorageUsage,
  kind: "project" | "board",
  depth: 0 | 1,
  key: string,
): MaintenanceStorageRow {
  return {
    depth,
    id: scope.id,
    key,
    kind,
    name: scope.name,
    archivedAt: scope.archivedAt,
    usage: {
      active: scope.active,
      archived: scope.archived,
      totalBytes: scope.totalBytes,
    },
  };
}
