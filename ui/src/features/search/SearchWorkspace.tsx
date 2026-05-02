import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "../../components/layout";
import {
  EmptyState,
  Icon,
  InlineError,
  Mono,
  SkeletonRows,
} from "../../components/ui";
import {
  fallbackTitle,
  iconForSourceType,
} from "../../components/layout/SidebarSearch";
import type {
  ProjectTreeItem,
  SearchResult,
  SearchSourceType,
} from "../../domain/types";
import { useSearch, type SearchFilters } from "./useSearch";

const ALL_SOURCE_TYPES: SearchSourceType[] = ["board", "task", "comment"];
const WORKSPACE_RESULT_LIMIT = 25;
const URL_DEBOUNCE_MS = 350;

export function SearchWorkspace({
  initialQuery,
  onOpenResult,
  onQueryChange,
  projectTree,
}: {
  initialQuery: string | null;
  onOpenResult: (result: SearchResult) => void;
  onQueryChange: (query: string | null) => void;
  projectTree: ProjectTreeItem[];
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [projectId, setProjectId] = useState<string>("");
  const [enabledSources, setEnabledSources] = useState<Set<SearchSourceType>>(
    () => new Set(ALL_SOURCE_TYPES),
  );
  const [includeArchived, setIncludeArchived] = useState(false);
  const lastInitialQueryRef = useRef(initialQuery ?? "");

  useEffect(() => {
    const next = initialQuery ?? "";
    if (next !== lastInitialQueryRef.current) {
      lastInitialQueryRef.current = next;
      setQuery(next);
    }
  }, [initialQuery]);

  const filters = useMemo<SearchFilters>(() => {
    const sourceTypes =
      enabledSources.size === ALL_SOURCE_TYPES.length
        ? undefined
        : ALL_SOURCE_TYPES.filter((type) => enabledSources.has(type));
    return {
      limit: WORKSPACE_RESULT_LIMIT,
      ...(projectId ? { projectId } : {}),
      ...(sourceTypes ? { sourceTypes } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
    };
  }, [enabledSources, includeArchived, projectId]);

  const { results, loading, error, lastQuery } = useSearch({ query, filters });

  useEffect(() => {
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      onQueryChange(trimmed ? trimmed : null);
    }, URL_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, onQueryChange]);

  const crumbLookup = useMemo(() => {
    const projectNames = new Map<string, string>();
    const boardNames = new Map<string, string>();
    for (const item of projectTree) {
      projectNames.set(item.project.id, item.project.name);
      for (const board of item.boards) {
        boardNames.set(board.id, board.name);
      }
    }
    return (result: Pick<SearchResult, "projectId" | "boardId">) => {
      const parts: string[] = [];
      if (result.projectId) parts.push(projectNames.get(result.projectId) ?? "Project");
      if (result.boardId) parts.push(boardNames.get(result.boardId) ?? "Board");
      return parts.join(" › ");
    };
  }, [projectTree]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const showSkeleton = loading && results.length === 0;

  return (
    <>
      <Topbar crumbs={[{ label: "Search", icon: <Icon name="search" /> }]} />
      <div className="workspace-pane">
        <div className="search-pane">
          <div className="search-pane__header">
            <div className="search-pane__input">
              <Icon name="search" size={16} />
              <input
                aria-label="Search"
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, boards, and comments..."
                spellCheck={false}
                type="search"
                value={query}
              />
            </div>
            <div className="search-pane__filters">
              <label className="search-filter">
                <span>Project</span>
                <select
                  onChange={(event) => setProjectId(event.target.value)}
                  value={projectId}
                >
                  <option value="">All projects</option>
                  {projectTree.map((item) => (
                    <option key={item.project.id} value={item.project.id}>
                      {item.project.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="search-filter search-filter--chips">
                <span>Type</span>
                <div className="search-chip-group">
                  {ALL_SOURCE_TYPES.map((type) => {
                    const active = enabledSources.has(type);
                    return (
                      <button
                        aria-pressed={active}
                        className={
                          active ? "search-chip search-chip--active" : "search-chip"
                        }
                        key={type}
                        onClick={() =>
                          setEnabledSources((current) => {
                            const next = new Set(current);
                            if (next.has(type)) {
                              if (next.size === 1) {
                                return current;
                              }
                              next.delete(type);
                            } else {
                              next.add(type);
                            }
                            return next;
                          })
                        }
                        type="button"
                      >
                        <Icon name={iconForSourceType(type)} />
                        <span>{labelForSourceType(type)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="search-filter search-filter--toggle">
                <input
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                  type="checkbox"
                />
                <span>Include archived</span>
              </label>
            </div>
          </div>

          <InlineError message={error} />

          {!hasQuery && (
            <EmptyState
              title="Search your work"
              body="Type a phrase, task ID, label, or natural-language question. Results combine text and embedding matches across boards, tasks, and comments."
            />
          )}

          {hasQuery && showSkeleton && <SkeletonRows />}

          {hasQuery && !loading && !error && results.length === 0 && lastQuery && (
            <EmptyState
              title={`No results for "${lastQuery}"`}
              body="Try different words, broaden the source-type filter, or include archived content."
            />
          )}

          {results.length > 0 && (
            <ul className="search-results">
              {results.map((result) => (
                <li key={result.searchDocumentId}>
                  <button
                    className="search-result"
                    onClick={() => onOpenResult(result)}
                    type="button"
                  >
                    <span className={`search-result__badge search-result__badge--${result.sourceType}`}>
                      <Icon name={iconForSourceType(result.sourceType)} />
                      <span>{labelForSourceType(result.sourceType)}</span>
                    </span>
                    <div className="search-result__body">
                      <div className="search-result__title">
                        {result.title ?? fallbackTitle(result.sourceType)}
                      </div>
                      <div className="search-result__crumb">
                        <Mono faded>{crumbLookup(result) || "—"}</Mono>
                      </div>
                      <div className="search-result__snippet">{result.snippet}</div>
                    </div>
                    <Mono faded>{formatDistance(result.distance)}</Mono>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function labelForSourceType(sourceType: SearchSourceType) {
  if (sourceType === "board") return "Board";
  if (sourceType === "comment") return "Comment";
  return "Task";
}

function formatDistance(distance: number) {
  if (!Number.isFinite(distance)) {
    return "—";
  }
  return distance.toFixed(3);
}
