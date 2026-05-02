import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ProjectTreeItem, SearchResult, SearchSourceType } from "../../domain/types";
import { Icon, Kbd, Mono, type IconName } from "../ui";
import { useSearch, type SearchFilters } from "../../features/search/useSearch";

const SIDEBAR_RESULT_LIMIT = 5;
const SIDEBAR_SEARCH_FILTERS: SearchFilters = { limit: SIDEBAR_RESULT_LIMIT };

export function SidebarSearch({
  onOpenResult,
  onSubmitQuery,
  projectTree,
}: {
  onOpenResult: (result: SearchResult) => void;
  onSubmitQuery: (query: string) => void;
  projectTree: ProjectTreeItem[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { results, loading, error, lastQuery } = useSearch({
    query,
    filters: SIDEBAR_SEARCH_FILTERS,
    enabled: open,
  });

  const trimmed = query.trim();
  const showPopover = open && trimmed.length > 0;
  const visibleResults = useMemo(() => results.slice(0, SIDEBAR_RESULT_LIMIT), [results]);

  useEffect(() => {
    setHighlight(0);
  }, [lastQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const crumbLookup = useMemo(() => buildCrumbLookup(projectTree), [projectTree]);

  function selectResult(result: SearchResult) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    onOpenResult(result);
  }

  function submitQuery() {
    if (!trimmed) {
      return;
    }
    setOpen(false);
    inputRef.current?.blur();
    onSubmitQuery(trimmed);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        setQuery("");
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!showPopover || visibleResults.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitQuery();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (current + 1) % visibleResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        (current) => (current - 1 + visibleResults.length) % visibleResults.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = visibleResults[highlight] ?? visibleResults[0];
      if (target) {
        selectResult(target);
      } else {
        submitQuery();
      }
    }
  }

  return (
    <div className="sidebar__search-root" ref={rootRef}>
      <div className={open ? "sidebar__search sidebar__search--active" : "sidebar__search"}>
        <Icon name="search" />
        <input
          aria-label="Search tasks, boards, comments"
          className="sidebar__search-input"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          ref={inputRef}
          spellCheck={false}
          type="search"
          value={query}
        />
        {!query && !open && <Kbd>/</Kbd>}
      </div>
      {showPopover && (
        <div className="search-popover" role="listbox">
          {loading && visibleResults.length === 0 && (
            <div className="search-popover__status">Searching...</div>
          )}
          {!loading && error && (
            <div className="search-popover__status search-popover__status--error">{error}</div>
          )}
          {!loading && !error && visibleResults.length === 0 && lastQuery && (
            <div className="search-popover__status">No matches for "{lastQuery}".</div>
          )}
          {visibleResults.map((result, index) => (
            <button
              className={
                index === highlight
                  ? "search-popover__row search-popover__row--active"
                  : "search-popover__row"
              }
              key={result.searchDocumentId}
              onClick={() => selectResult(result)}
              onMouseEnter={() => setHighlight(index)}
              role="option"
              aria-selected={index === highlight}
              type="button"
            >
              <Icon name={iconForSourceType(result.sourceType)} />
              <div className="search-popover__row-body">
                <div className="search-popover__row-title">
                  {result.title ?? fallbackTitle(result.sourceType)}
                </div>
                <div className="search-popover__row-snippet">{result.snippet}</div>
                <Mono faded>{crumbLookup.crumb(result)}</Mono>
              </div>
            </button>
          ))}
          {trimmed && (
            <button
              className="search-popover__footer"
              onClick={submitQuery}
              type="button"
            >
              <Icon name="search" />
              <span>View all results for "{trimmed}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type CrumbLookup = {
  crumb: (result: Pick<SearchResult, "projectId" | "boardId">) => string;
};

function buildCrumbLookup(projectTree: ProjectTreeItem[]): CrumbLookup {
  const projectNames = new Map<string, string>();
  const boardNames = new Map<string, string>();
  for (const item of projectTree) {
    projectNames.set(item.project.id, item.project.name);
    for (const board of item.boards) {
      boardNames.set(board.id, board.name);
    }
  }

  return {
    crumb({ projectId, boardId }) {
      const parts: string[] = [];
      if (projectId) {
        parts.push(projectNames.get(projectId) ?? "Project");
      }
      if (boardId) {
        parts.push(boardNames.get(boardId) ?? "Board");
      }
      return parts.join(" › ");
    },
  };
}

export function iconForSourceType(sourceType: SearchSourceType): IconName {
  if (sourceType === "board") return "board";
  if (sourceType === "comment") return "comment";
  return "list";
}

export function fallbackTitle(sourceType: SearchSourceType) {
  if (sourceType === "board") return "Board";
  if (sourceType === "comment") return "Comment";
  return "Task";
}
