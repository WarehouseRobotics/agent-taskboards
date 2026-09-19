import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon, InlineError, Mono, SkeletonRows } from "../../components/ui";
import type { Prompt, Task } from "../../domain/types";
import { api } from "../../lib/api";
import { copyTextToClipboard } from "../../lib/clipboard";
import { buildTaskReferenceText } from "../../lib/task-reference";
import { resolveParentTaskId } from "./parent-task";
import {
  filterPrompts,
  groupPromptsByCategory,
  recentPrompts,
} from "./prompt-library-view";
import { renderPromptBody, type PromptTokenValues } from "./prompt-tokens";
import { usePromptLibrary } from "./usePromptLibrary";

const recentPromptLimit = 3;

export function PromptPicker({
  boardTasks,
  onClose,
  panelRef,
  task,
}: {
  boardTasks: Task[];
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  task: Task;
}) {
  const library = usePromptLibrary();
  const [query, setQuery] = useState("");
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [parentTaskValue, setParentTaskValue] = useState<string | null>(null);
  const copiedBlinkTimeout = useRef<number | null>(null);

  const parentTaskId = useMemo(
    () => resolveParentTaskId(task)?.taskId ?? null,
    [task],
  );
  const boardTasksRef = useRef(boardTasks);
  boardTasksRef.current = boardTasks;

  useEffect(() => {
    if (!parentTaskId) {
      setParentTaskValue(null);
      return;
    }

    const onBoard = boardTasksRef.current.find(
      (boardTask) => boardTask.id === parentTaskId,
    );
    if (onBoard) {
      setParentTaskValue(
        buildTaskReferenceText(onBoard.title, onBoard.title, onBoard.id),
      );
      return;
    }

    let cancelled = false;
    api
      .getTask(parentTaskId)
      .then((parentTask) => {
        if (!cancelled) {
          setParentTaskValue(
            buildTaskReferenceText(parentTask.title, parentTask.title, parentTask.id),
          );
        }
      })
      .catch(() => {
        // The parent id resolved but the task is gone or unreachable; keep the
        // id visible so the pasted prompt is still actionable.
        if (!cancelled) {
          setParentTaskValue(`( id=${parentTaskId} )`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parentTaskId]);

  useEffect(() => {
    return () => {
      if (copiedBlinkTimeout.current) {
        window.clearTimeout(copiedBlinkTimeout.current);
      }
    };
  }, []);

  const tokenValues = useMemo<PromptTokenValues>(() => {
    const values: PromptTokenValues = {
      TASK: buildTaskReferenceText(task.title, task.title, task.id),
    };
    if (parentTaskValue) {
      values.PARENT_TASK = parentTaskValue;
    }
    return values;
  }, [parentTaskValue, task.id, task.title]);

  const copyPrompt = async (prompt: Prompt) => {
    setCopyError(null);
    const rendered = renderPromptBody(prompt.body, tokenValues);
    if (!(await copyTextToClipboard(rendered))) {
      setCopyError("Unable to copy the prompt to the clipboard");
      return;
    }

    if (copiedBlinkTimeout.current) {
      window.clearTimeout(copiedBlinkTimeout.current);
    }
    setCopiedPromptId(prompt.id);
    copiedBlinkTimeout.current = window.setTimeout(
      () => setCopiedPromptId(null),
      850,
    );
    void library.recordPromptUse(prompt.id).catch(() => {
      // Usage tracking is best-effort; the copy already succeeded.
    });
  };

  const filteredPrompts = useMemo(
    () => filterPrompts(library.prompts, query),
    [library.prompts, query],
  );
  const recent = useMemo(
    () => (query.trim() ? [] : recentPrompts(library.prompts, recentPromptLimit)),
    [library.prompts, query],
  );
  const groups = useMemo(
    () =>
      groupPromptsByCategory(filteredPrompts, library.categories).filter(
        (group) => group.prompts.length > 0,
      ),
    [filteredPrompts, library.categories],
  );

  const renderRow = (prompt: Prompt) => (
    <div
      className={
        copiedPromptId === prompt.id
          ? "prompt-picker__row prompt-picker__row--copied"
          : "prompt-picker__row"
      }
      key={prompt.id}
    >
      <button
        className="prompt-picker__copy"
        onClick={() => void copyPrompt(prompt)}
        title="Copy prompt to clipboard"
        type="button"
      >
        <Icon name="copy" size={12} />
        <span className="prompt-picker__name">{prompt.name}</span>
        {copiedPromptId === prompt.id && <Mono faded>copied</Mono>}
      </button>
      <button
        aria-expanded={expandedPromptId === prompt.id}
        aria-label={`Preview prompt ${prompt.name}`}
        className="icon-btn prompt-picker__expand"
        onClick={() =>
          setExpandedPromptId((current) => (current === prompt.id ? null : prompt.id))
        }
        title="Preview prompt"
        type="button"
      >
        <Icon
          className={
            expandedPromptId === prompt.id
              ? "prompt-picker__chevron prompt-picker__chevron--open"
              : "prompt-picker__chevron"
          }
          name="chevron"
          size={12}
        />
      </button>
      {expandedPromptId === prompt.id && (
        <pre className="prompt-picker__preview">
          {renderPromptBody(prompt.body, tokenValues)}
        </pre>
      )}
    </div>
  );

  return (
    <aside
      aria-label="Prompt picker"
      className="prompt-picker"
      ref={(element) => {
        panelRef.current = element;
      }}
    >
      <div className="prompt-picker__top">
        <span className="prompt-picker__title">
          <Icon name="prompt" />
          Prompts
        </span>
        <button className="icon-btn" onClick={onClose} title="Close prompt picker" type="button">
          <Icon name="close" />
        </button>
      </div>
      <input
        aria-label="Filter prompts"
        className="prompt-picker__filter"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter prompts..."
        value={query}
      />
      <InlineError message={library.error ?? copyError} />
      {library.loading && <SkeletonRows />}
      {!library.loading && library.prompts.length === 0 && (
        <div className="prompt-picker__empty">
          No prompts yet. Add some in the Prompts section.
        </div>
      )}
      {!library.loading && filteredPrompts.length === 0 && library.prompts.length > 0 && (
        <div className="prompt-picker__empty">No prompts match the filter.</div>
      )}
      <div className="prompt-picker__groups">
        {recent.length > 0 && (
          <section className="prompt-picker__group">
            <h3>Recent</h3>
            {recent.map(renderRow)}
          </section>
        )}
        {groups.map((group) => (
          <section className="prompt-picker__group" key={group.category?.id ?? "root"}>
            <h3>{group.category?.name ?? "Uncategorized"}</h3>
            {group.prompts.map(renderRow)}
          </section>
        ))}
      </div>
    </aside>
  );
}
