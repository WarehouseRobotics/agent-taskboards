import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ActorType, BoardColumn, TaskActivity, TaskComment, TaskContext } from "../../domain/types";
import { apiMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { columnStatus } from "../../lib/task-display";
import { Avatar, Button, EmptyState, Icon, InlineError, LabelChip, Mono, PriorityFlag, StatusIcon } from "../../components/ui";

interface TaskEditFields {
  description: string;
  title: string;
}

interface TaskEditDraft {
  base: TaskEditFields;
  current: TaskEditFields;
  taskId: string;
}

const emptyTaskDraft: TaskEditDraft = {
  base: { description: "", title: "" },
  current: { description: "", title: "" },
  taskId: "",
};

function makeTaskDraft(taskId: string, title: string, description: string): TaskEditDraft {
  return {
    base: { description, title },
    current: { description, title },
    taskId,
  };
}

function isTaskDraftDirty(draft: TaskEditDraft) {
  return draft.current.title !== draft.base.title || draft.current.description !== draft.base.description;
}

export function TaskDetail({
  columns,
  context,
  loading,
  onArchiveTask,
  onClose,
  onCompleteTask,
  onMoveTask,
  onPostComment,
  onTaskDraftChange,
  onUpdateTask,
}: {
  columns: BoardColumn[];
  context?: TaskContext;
  loading: boolean;
  onArchiveTask: (taskId: string) => Promise<void>;
  onClose: () => void;
  onCompleteTask: (taskId: string) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onPostComment: (taskId: string, body: string) => Promise<void>;
  onTaskDraftChange: (taskId: string, fields: { title?: string; description?: string | null } | null) => void;
  onUpdateTask: (taskId: string, input: { title?: string; description?: string | null }) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<TaskEditDraft>(emptyTaskDraft);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveMessageTimeout = useRef<number | null>(null);
  const task = context?.task;
  const taskId = task?.id ?? "";
  const serverTitle = task?.title ?? "";
  const serverDescription = task?.description ?? "";
  const column = columns.find((item) => item.id === task?.columnId) ?? context?.board.columns?.find((item) => item.id === task?.columnId);
  const entries = useMemo(() => mergeTimeline(context?.comments ?? [], context?.activity ?? []), [context?.activity, context?.comments]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    setDraft((current) => {
      const nextDraft = makeTaskDraft(taskId, serverTitle, serverDescription);
      if (current.taskId !== taskId) {
        return nextDraft;
      }

      return isTaskDraftDirty(current) ? current : nextDraft;
    });
    setEditError(null);
  }, [serverDescription, serverTitle, taskId]);

  useEffect(() => {
    setSaveMessage(null);
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    return () => onTaskDraftChange(taskId, null);
  }, [onTaskDraftChange, taskId]);

  useEffect(() => {
    if (!taskId || draft.taskId !== taskId) {
      return;
    }

    const draftDirty = isTaskDraftDirty(draft);
    onTaskDraftChange(
      taskId,
      draftDirty
        ? {
            description: draft.current.description,
            title: draft.current.title,
          }
        : null,
    );
  }, [
    draft.base.description,
    draft.base.title,
    draft.current.description,
    draft.current.title,
    draft.taskId,
    onTaskDraftChange,
    taskId,
  ]);

  useEffect(() => {
    return () => {
      if (saveMessageTimeout.current) {
        window.clearTimeout(saveMessageTimeout.current);
      }
    };
  }, []);

  if (loading && !context) {
    return (
      <aside className="task-detail">
        <div className="detail-skeleton" />
      </aside>
    );
  }

  if (!context || !task) {
    return (
      <aside className="task-detail">
        <button className="icon-btn task-detail__close" onClick={onClose} title="Close task">
          <Icon name="close" />
        </button>
        <EmptyState title="Task context unavailable" body="Select another task or sync the board." />
      </aside>
    );
  }

  const status = columnStatus(column);
  const activeDraft = draft.taskId === task.id
    ? draft
    : makeTaskDraft(task.id, serverTitle, serverDescription);
  const trimmedTitle = activeDraft.current.title.trim();
  const trimmedDescription = activeDraft.current.description.trim();
  const editDirty = isTaskDraftDirty(activeDraft);
  const titleError = editDirty && !trimmedTitle ? "Title is required" : null;
  const canSave = editDirty && Boolean(trimmedTitle) && !saving;

  const showSavedMessage = () => {
    setSaveMessage("Task updated");
    if (saveMessageTimeout.current) {
      window.clearTimeout(saveMessageTimeout.current);
    }
    saveMessageTimeout.current = window.setTimeout(() => setSaveMessage(null), 2400);
  };

  const resetDraft = () => {
    setDraft(makeTaskDraft(task.id, serverTitle, serverDescription));
    setEditError(null);
  };

  const submitTaskEdit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmedTitle) {
      setEditError("Title is required");
      return;
    }
    if (!editDirty) {
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      await onUpdateTask(task.id, {
        title: trimmedTitle,
        description: trimmedDescription || null,
      });
      setDraft(makeTaskDraft(task.id, trimmedTitle, trimmedDescription));
      showSavedMessage();
    } catch (err) {
      setEditError(apiMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveOnShortcut = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitTaskEdit();
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) {
      return;
    }
    await onPostComment(task.id, comment.trim());
    setComment("");
  };

  return (
    <aside className="task-detail">
      <div className="task-detail__top">
        <div className="detail-meta">
          <PriorityFlag priority={task.priority} />
          <Mono>{task.id}</Mono>
          <span>created {formatDate(task.createdAt)}</span>
          <span>updated {formatDate(task.updatedAt)}</span>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close task">
          <Icon name="close" />
        </button>
      </div>
      {saveMessage && (
        <div className="detail-toast" role="status" aria-live="polite">
          {saveMessage}
        </div>
      )}
      <form className="task-edit-form" onSubmit={submitTaskEdit}>
        <input
          aria-label="Task title"
          className="task-title-input"
          onChange={(event) => {
            setDraft({
              ...activeDraft,
              current: { ...activeDraft.current, title: event.target.value },
              taskId: task.id,
            });
            setEditError(null);
          }}
          onKeyDown={saveOnShortcut}
          value={activeDraft.current.title}
        />
        <div className="detail-section">
          <h2>Description</h2>
          <textarea
            aria-label="Task description"
            className="task-description-input"
            onChange={(event) => {
              setDraft({
                ...activeDraft,
                current: { ...activeDraft.current, description: event.target.value },
                taskId: task.id,
              });
              setEditError(null);
            }}
            onKeyDown={saveOnShortcut}
            placeholder="No description yet."
            value={activeDraft.current.description}
          />
        </div>
        <InlineError message={editError ?? titleError} />
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={resetDraft} disabled={!editDirty || saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!canSave} title="Save task">
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
      <div className="detail-status-row">
        <span><StatusIcon status={status} size={12} /> {column?.name ?? "Unknown"}</span>
        <span>{task.priority}</span>
        {task.completedAt && <span>completed {formatDate(task.completedAt)}</span>}
      </div>
      <div className="detail-actions">
        <select
          value={task.columnId}
          onChange={(event) => onMoveTask(task.id, { columnId: event.target.value })}
        >
          {columns.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <Button icon={<Icon name="check" />} onClick={() => onCompleteTask(task.id)} variant="outline">Complete</Button>
        <Button icon={<Icon name="archive" />} onClick={() => onArchiveTask(task.id)} variant="danger">Archive</Button>
      </div>
      <section className="detail-section">
        <h2>Properties</h2>
        <div className="prop-grid">
          <span>Project</span><strong>{context.project.name}</strong>
          <span>Board</span><strong>{context.board.name}</strong>
          <span>Labels</span>
          <strong className="detail-labels">
            {task.labels.length ? task.labels.map((label) => <LabelChip key={label} label={label} />) : "none"}
          </strong>
          <span>API</span>
          <code>GET /api/tasks/{task.id}/context</code>
        </div>
      </section>
      <section className="detail-section">
        <div className="detail-section__heading">
          <h2>Activity & Comments</h2>
          <Mono faded>{entries.length} entries</Mono>
        </div>
        <div className="timeline">
          {entries.map((entry) => (
            <TimelineEntry entry={entry} key={`${entry.kind}-${entry.id}`} />
          ))}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <div className="comment-form__author">
            <Avatar kind="human" name="you" />
            <Mono faded>commenting as human · authorType=human</Mono>
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment, decision, or handoff note..."
          />
          <div className="form-actions">
            <Button type="submit" variant="primary">Comment</Button>
          </div>
        </form>
      </section>
    </aside>
  );
}

type TimelineItem =
  | { kind: "comment"; id: string; at: string | null; authorType: ActorType; authorName: string | null; body: string }
  | { kind: "activity"; id: string; at: string | null; actorType: ActorType; actorName: string | null; summary: string; eventType: string };

function mergeTimeline(comments: TaskComment[], activity: TaskActivity[]): TimelineItem[] {
  return [
    ...comments.map((comment) => ({
      kind: "comment" as const,
      id: comment.id,
      at: comment.createdAt,
      authorType: comment.authorType,
      authorName: comment.authorName,
      body: comment.body,
    })),
    ...activity.map((item) => ({
      kind: "activity" as const,
      id: item.id,
      at: item.createdAt,
      actorType: item.actorType,
      actorName: item.actorName,
      summary: item.summary,
      eventType: item.eventType,
    })),
  ].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
}

function TimelineEntry({ entry }: { entry: TimelineItem }) {
  const kind = entry.kind === "comment" ? entry.authorType : entry.actorType;
  const name = entry.kind === "comment" ? entry.authorName : entry.actorName;
  return (
    <div className="timeline-entry">
      <Avatar kind={kind} name={name} size={22} />
      <div className={`timeline-entry__body timeline-entry__body--${kind}`}>
        <div className="timeline-entry__meta">
          <strong>{name || kind}</strong>
          <span className={`kind-chip kind-chip--${kind}`}>{kind}</span>
          {entry.kind === "activity" && <Mono faded>{entry.eventType}</Mono>}
          <span className="timeline-entry__spacer" />
          <Mono faded>{formatDate(entry.at)}</Mono>
        </div>
        <div className={entry.kind === "comment" ? "timeline-entry__comment" : "timeline-entry__summary"}>
          {entry.kind === "comment" ? entry.body : entry.summary}
        </div>
      </div>
    </div>
  );
}
