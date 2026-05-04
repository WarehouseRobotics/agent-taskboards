import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Topbar } from "../../components/layout";
import { Avatar, Button, EmptyState, Icon, InlineError, Mono, SkeletonRows } from "../../components/ui";
import type { ActivitySort, ProjectActivityItem, ProjectTreeItem } from "../../domain/types";
import { api } from "../../lib/api";
import { apiMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { glyphForName } from "../../lib/task-display";
import { normalizeProjectSelection, toggleProjectSelection } from "./activity-filters";

const ACTIVITY_PAGE_SIZE = 50;

export function ActivityWorkspace({
  initialProjectIds,
  initialSort,
  onFiltersChange,
  onOpenTask,
  projectTree,
}: {
  initialProjectIds: string[];
  initialSort: ActivitySort;
  onFiltersChange: (projectIds: string[], sort: ActivitySort) => void;
  onOpenTask: (projectId: string, boardId: string, taskId: string) => void;
  projectTree: ProjectTreeItem[];
}) {
  const [projectIds, setProjectIds] = useState(() => normalizeProjectSelection(initialProjectIds));
  const [sort, setSort] = useState<ActivitySort>(initialSort);
  const [items, setItems] = useState<ProjectActivityItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjectIds(normalizeProjectSelection(initialProjectIds));
  }, [initialProjectIds]);

  useEffect(() => {
    setSort(initialSort);
  }, [initialSort]);

  const projectLookup = useMemo(() => new Set(projectTree.map((item) => item.project.id)), [projectTree]);
  const activeProjectIds = useMemo(
    () => projectIds.filter((projectId) => projectLookup.has(projectId)),
    [projectIds, projectLookup],
  );

  const loadActivity = useCallback(
    async (mode: "replace" | "append" = "replace", offset = 0) => {
      if (mode === "append") {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await api.listActivity({
          projectIds: activeProjectIds,
          limit: ACTIVITY_PAGE_SIZE,
          offset,
          sort,
        });
        setItems((current) => (mode === "append" ? [...current, ...response.items] : response.items));
        setHasMore(response.hasMore);
      } catch (err) {
        setError(apiMessage(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeProjectIds, sort],
  );

  useEffect(() => {
    void loadActivity("replace", 0);
  }, [loadActivity]);

  const updateProjectIds = (nextProjectIds: string[]) => {
    const normalized = normalizeProjectSelection(nextProjectIds);
    setProjectIds(normalized);
    onFiltersChange(normalized, sort);
  };

  const updateSort = (nextSort: ActivitySort) => {
    setSort(nextSort);
    onFiltersChange(projectIds, nextSort);
  };

  const allProjectsActive = activeProjectIds.length === 0;
  const selectedProjectNames = activeProjectIds
    .map((projectId) => projectTree.find((item) => item.project.id === projectId)?.project.name)
    .filter(Boolean);

  return (
    <>
      <Topbar
        actions={
          <>
            <Button icon={<Icon name="refresh" />} onClick={() => loadActivity("replace", 0)} variant="ghost">
              Sync
            </Button>
          </>
        }
        crumbs={[{ label: "Activity", icon: <Icon name="activity" /> }]}
      />
      <div className="workspace-pane workspace-pane--activity">
        <div className="activity-pane">
          <div className="activity-toolbar">
            <div className="activity-toolbar__title">
              <h1>Activity</h1>
              <Mono faded>
                {allProjectsActive
                  ? "All active projects"
                  : selectedProjectNames.join(", ")}
              </Mono>
            </div>
            <div className="segmented" aria-label="Activity sort">
              <button
                className={sort === "desc" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => updateSort("desc")}
                type="button"
              >
                Newest
              </button>
              <button
                className={sort === "asc" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => updateSort("asc")}
                type="button"
              >
                Oldest
              </button>
            </div>
          </div>

          <div className="activity-filters" aria-label="Project filters">
            <button
              aria-pressed={allProjectsActive}
              className={allProjectsActive ? "activity-chip activity-chip--active" : "activity-chip"}
              onClick={() => updateProjectIds([])}
              type="button"
            >
              <Icon name="list" />
              <span>All projects</span>
            </button>
            {projectTree.map((item) => {
              const active = activeProjectIds.includes(item.project.id);
              return (
                <button
                  aria-pressed={active}
                  className={active ? "activity-chip activity-chip--active" : "activity-chip"}
                  key={item.project.id}
                  onClick={() =>
                    updateProjectIds(toggleProjectSelection(activeProjectIds, item.project.id))
                  }
                  type="button"
                >
                  <span className="project-glyph">{glyphForName(item.project.name)}</span>
                  <span>{item.project.name}</span>
                </button>
              );
            })}
          </div>

          <InlineError message={error} />

          {loading && items.length === 0 && <SkeletonRows />}

          {!loading && !error && items.length === 0 && (
            <EmptyState
              title="No activity yet"
              body="Task changes and comments will appear here as work moves through boards."
            />
          )}

          {items.length > 0 && (
            <ol className="activity-feed">
              {items.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <ActivityFeedItem item={item} onOpenTask={onOpenTask} />
                </li>
              ))}
            </ol>
          )}

          {hasMore && (
            <div className="activity-load-more">
              <Button disabled={loadingMore} onClick={() => loadActivity("append", items.length)} variant="outline">
                {loadingMore ? "Loading" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ActivityFeedItem({
  item,
  onOpenTask,
}: {
  item: ProjectActivityItem;
  onOpenTask: (projectId: string, boardId: string, taskId: string) => void;
}) {
  const actorType = item.type === "comment" ? item.authorType : item.actorType;
  const actorName = item.type === "comment" ? item.authorName : item.actorName;
  const title = item.type === "comment" ? "Comment was added" : item.summary;

  return (
    <button
      className={`activity-entry activity-entry--${item.type}`}
      onClick={() => onOpenTask(item.project.id, item.board.id, item.task.id)}
      type="button"
    >
      <Avatar kind={actorType} name={actorName} size={22} />
      <div className="activity-entry__body">
        <div className="activity-entry__meta">
          <strong>{actorName || actorType}</strong>
          <span className={`kind-chip kind-chip--${actorType}`}>{actorType}</span>
          {item.type === "activity" && <Mono faded>{item.eventType}</Mono>}
          <span className="activity-entry__spacer" />
          <Mono faded>{formatDate(item.createdAt)}</Mono>
        </div>
        <div className="activity-entry__title">{title}</div>
        {item.type === "comment" && (
          <div className="activity-entry__comment">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewMarkdown(item.body)}
            </ReactMarkdown>
          </div>
        )}
        <div className="activity-entry__context">
          <span>{item.task.title}</span>
          <Mono faded>{item.task.id}</Mono>
          <span>{item.project.name} / {item.board.name}</span>
          {item.task.archivedAt && <span className="activity-entry__archived">Archived</span>}
        </div>
      </div>
    </button>
  );
}

function previewMarkdown(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 600) {
    return trimmed;
  }
  return `${trimmed.slice(0, 600).trimEnd()}...`;
}
