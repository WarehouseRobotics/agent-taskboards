import { ChangeEvent, ClipboardEvent as ReactClipboardEvent, DragEvent, FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ActorType, BoardColumn, TaskActivity, TaskAttachment, TaskComment, TaskContext } from "../../domain/types";
import { apiMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { columnStatus } from "../../lib/task-display";
import { Avatar, Button, EmptyState, Icon, InlineError, LabelChip, Mono, PriorityFlag, StatusIcon } from "../../components/ui";
import {
  clampDescriptionHeight,
  descriptionDefaultHeight,
  descriptionHeightMax,
  descriptionHeightMin,
  descriptionSizeTier,
  persistDescriptionHeight,
  persistDescriptionView,
  storedDescriptionHeight,
  storedDescriptionView,
  type TaskDescriptionView,
} from "./task-description-view";

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

export function appendImageAttachmentMarkdown(description: string, attachment: TaskAttachment) {
  const prefix = description.trimEnd();
  const altText = attachment.originalName.replace(/[\[\]\n\r]/g, " ").trim() || "attachment";
  const markdown = `![${altText}](${attachment.url})`;
  return prefix ? `${prefix}\n\n${markdown}` : markdown;
}

export function isImageAttachment(attachment: Pick<TaskAttachment, "contentType">) {
  return attachment.contentType.startsWith("image/");
}

export function filesFromClipboardData(
  clipboardData: Pick<DataTransfer, "files" | "items"> | null,
) {
  if (!clipboardData) {
    return [];
  }

  const files = new Map<string, File>();
  const addFile = (file: File | null) => {
    if (!file) {
      return;
    }

    files.set(
      `${file.name}:${file.size}:${file.type}:${file.lastModified}`,
      file,
    );
  };

  for (const file of Array.from(clipboardData.files ?? [])) {
    addFile(file);
  }

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind === "file") {
      addFile(item.getAsFile());
    }
  }

  return [...files.values()];
}

function isInteractivePreviewTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest("a, button, input, textarea, select, summary, [role='button'], [contenteditable='true']"),
  );
}

export function TaskDetail({
  columns,
  context,
  loading,
  onArchiveTask,
  onClose,
  onCompleteTask,
  onDeleteTaskAttachment,
  onMoveTask,
  onPostComment,
  onTaskDraftChange,
  onUpdateTask,
  onUploadTaskAttachment,
}: {
  columns: BoardColumn[];
  context?: TaskContext;
  loading: boolean;
  onArchiveTask: (taskId: string) => Promise<void>;
  onClose: () => void;
  onCompleteTask: (taskId: string) => Promise<void>;
  onDeleteTaskAttachment: (taskId: string, attachmentId: string) => Promise<void>;
  onMoveTask: (taskId: string, input: { columnId?: string; position?: number }) => Promise<void>;
  onPostComment: (taskId: string, body: string) => Promise<void>;
  onTaskDraftChange: (taskId: string, fields: { title?: string; description?: string | null } | null) => void;
  onUpdateTask: (taskId: string, input: { title?: string; description?: string | null }) => Promise<void>;
  onUploadTaskAttachment: (taskId: string, file: File) => Promise<TaskAttachment>;
}) {
  const [comment, setComment] = useState("");
  const [draft, setDraft] = useState<TaskEditDraft>(emptyTaskDraft);
  const [editError, setEditError] = useState<string | null>(null);
  const [detailToast, setDetailToast] = useState<{ message: string; tone: "success" | "warning" } | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [descriptionView, setDescriptionView] = useState<TaskDescriptionView>(() => storedDescriptionView());
  const [descriptionHeight, setDescriptionHeight] = useState<number | null>(() => storedDescriptionHeight());
  const [resizingDescription, setResizingDescription] = useState(false);
  const detailRef = useRef<HTMLElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionResizeStart = useRef<{ pointerId: number; startHeight: number; startY: number } | null>(null);
  const detailToastTimeout = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPreviewTap = useRef(0);

  const changeDescriptionView = useCallback((mode: TaskDescriptionView) => {
    setDescriptionView(mode);
    persistDescriptionView(mode);
  }, []);
  const focusDescriptionInput = useCallback(() => {
    window.requestAnimationFrame(() => descriptionInputRef.current?.focus());
  }, []);
  const switchDescriptionPreviewToEdit = useCallback(() => {
    changeDescriptionView("edit");
    focusDescriptionInput();
  }, [changeDescriptionView, focusDescriptionInput]);
  const task = context?.task;
  const taskId = task?.id ?? "";
  const serverTitle = task?.title ?? "";
  const serverDescription = task?.description ?? "";
  const boardColumns = columns.length ? columns : (context?.board.columns ?? []);
  const column = boardColumns.find((item) => item.id === task?.columnId);
  const doneColumn = boardColumns.find((item) => item.isDone);
  const entries = useMemo(
    () => mergeTimeline(context?.comments ?? [], showActivity ? context?.activity ?? [] : []),
    [context?.activity, context?.comments, showActivity],
  );
  const activeDraft = task && draft.taskId === task.id
    ? draft
    : makeTaskDraft(task?.id ?? "", serverTitle, serverDescription);
  const editDirty = task ? isTaskDraftDirty(activeDraft) : false;
  const hasPendingChanges = editDirty || Boolean(comment.trim());
  const attachments = context?.attachments ?? [];

  const showDetailToast = useCallback((message: string, tone: "success" | "warning" = "success") => {
    setDetailToast({ message, tone });
    if (detailToastTimeout.current) {
      window.clearTimeout(detailToastTimeout.current);
    }
    detailToastTimeout.current = window.setTimeout(() => setDetailToast(null), 2400);
  }, []);

  const requestClose = useCallback(() => {
    if (hasPendingChanges) {
      showDetailToast("Changes pending", "warning");
      return;
    }

    onClose();
  }, [hasPendingChanges, onClose, showDetailToast]);

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
    setComment("");
    setDetailToast(null);
    setShowActivity(false);
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
      if (detailToastTimeout.current) {
        window.clearTimeout(detailToastTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const panel = detailRef.current;
      const target = event.target;
      if (!panel || !(target instanceof Node) || panel.contains(target)) {
        return;
      }

      if (hasPendingChanges) {
        event.preventDefault();
        event.stopPropagation();
        showDetailToast("Changes pending", "warning");
        return;
      }

      onClose();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [hasPendingChanges, onClose, showDetailToast, taskId]);

  if (loading && !context) {
    return (
      <aside className="task-detail" ref={detailRef}>
        <div className="detail-skeleton" />
      </aside>
    );
  }

  if (!context || !task) {
    return (
      <aside className="task-detail" ref={detailRef}>
        <button className="icon-btn task-detail__close" onClick={onClose} title="Close task">
          <Icon name="close" />
        </button>
        <EmptyState title="Task context unavailable" body="Select another task or sync the board." />
      </aside>
    );
  }

  const status = columnStatus(column);
  const trimmedTitle = activeDraft.current.title.trim();
  const trimmedDescription = activeDraft.current.description.trim();
  const titleError = editDirty && !trimmedTitle ? "Title is required" : null;
  const canSave = editDirty && Boolean(trimmedTitle) && !saving;
  const activeDescriptionHeight = descriptionHeight ?? descriptionDefaultHeight(activeDraft.current.description);
  const descriptionStyle = { "--task-desc-height": `${activeDescriptionHeight}px` } as CSSProperties;

  const resetDraft = () => {
    setDraft(makeTaskDraft(task.id, serverTitle, serverDescription));
    setEditError(null);
  };

  const updateDescriptionHeight = (height: number) => {
    const nextHeight = clampDescriptionHeight(height);
    setDescriptionHeight(nextHeight);
    persistDescriptionHeight(nextHeight);
  };

  const startDescriptionResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    descriptionResizeStart.current = {
      pointerId: event.pointerId,
      startHeight: activeDescriptionHeight,
      startY: event.clientY,
    };
    setResizingDescription(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDescriptionResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = descriptionResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    updateDescriptionHeight(start.startHeight + event.clientY - start.startY);
  };

  const stopDescriptionResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = descriptionResizeStart.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }

    descriptionResizeStart.current = null;
    setResizingDescription(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resizeDescriptionWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateDescriptionHeight(activeDescriptionHeight - step);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateDescriptionHeight(activeDescriptionHeight + step);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      updateDescriptionHeight(descriptionHeightMin);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      updateDescriptionHeight(descriptionHeightMax);
    }
  };

  const switchPreviewOnDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isInteractivePreviewTarget(event.target)) {
      return;
    }

    switchDescriptionPreviewToEdit();
  };

  const switchPreviewOnDoubleTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || isInteractivePreviewTarget(event.target)) {
      return;
    }

    const now = Date.now();
    if (now - lastPreviewTap.current <= 320) {
      event.preventDefault();
      lastPreviewTap.current = 0;
      switchDescriptionPreviewToEdit();
      return;
    }

    lastPreviewTap.current = now;
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
      showDetailToast("Task updated");
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

  const markTaskDone = async () => {
    if (doneColumn && task.columnId !== doneColumn.id) {
      await onMoveTask(task.id, { columnId: doneColumn.id });
      return;
    }

    await onCompleteTask(task.id);
  };

  const uploadAttachmentFiles = async (files: File[]) => {
    if (files.length === 0 || uploadingAttachment) {
      return;
    }

    setUploadingAttachment(true);
    setEditError(null);
    let uploaded = 0;
    let images = 0;
    try {
      for (const file of files) {
        const attachment = await onUploadTaskAttachment(task.id, file);
        uploaded += 1;
        if (isImageAttachment(attachment)) {
          images += 1;
          setDraft((current) => {
            const source =
              current.taskId === task.id
                ? current
                : makeTaskDraft(task.id, serverTitle, serverDescription);
            return {
              ...source,
              current: {
                ...source.current,
                description: appendImageAttachmentMarkdown(
                  source.current.description,
                  attachment,
                ),
              },
              taskId: task.id,
            };
          });
        }
      }

      if (images > 0) {
        changeDescriptionView("edit");
        showDetailToast(
          images === 1 ? "Image link added to draft" : "Image links added to draft",
        );
      } else {
        showDetailToast(uploaded === 1 ? "Attachment uploaded" : "Attachments uploaded");
      }
    } catch (err) {
      setEditError(apiMessage(err));
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const selectAttachmentFile = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadAttachmentFiles(Array.from(event.target.files ?? []));
  };

  const dropAttachmentFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    void uploadAttachmentFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const pasteAttachmentFile = (event: ReactClipboardEvent<HTMLElement>) => {
    const files = filesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    void uploadAttachmentFiles(files);
  };

  const deleteAttachment = async (attachmentId: string) => {
    setDeletingAttachmentId(attachmentId);
    setEditError(null);
    try {
      await onDeleteTaskAttachment(task.id, attachmentId);
      showDetailToast("Attachment deleted");
    } catch (err) {
      setEditError(apiMessage(err));
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  return (
    <aside className="task-detail" onPaste={pasteAttachmentFile} ref={detailRef}>
      <div className="task-detail__top">
        <div className="detail-meta">
          <PriorityFlag priority={task.priority} />
          <Mono>{task.id}</Mono>
          <span>created {formatDate(task.createdAt)}</span>
          <span>updated {formatDate(task.updatedAt)}</span>
        </div>
        <button className="icon-btn" onClick={requestClose} title="Close task">
          <Icon name="close" />
        </button>
      </div>
      {detailToast && (
        <div className={`detail-toast detail-toast--${detailToast.tone}`} role="status" aria-live="polite">
          {detailToast.message}
        </div>
      )}
      <form className="task-edit-form" onSubmit={submitTaskEdit}>
        <textarea
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
          rows={2}
          value={activeDraft.current.title}
        />
        <div
          className={`detail-section task-description task-description--${descriptionSizeTier(activeDraft.current.description)}`}
          style={descriptionStyle}
        >
          <div className="detail-section__heading">
            <h2>Description</h2>
            <div className="segmented" role="tablist" aria-label="Description view">
              <button
                type="button"
                role="tab"
                aria-selected={descriptionView === "edit"}
                className={descriptionView === "edit" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => changeDescriptionView("edit")}
              >
                Edit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={descriptionView === "preview"}
                className={descriptionView === "preview" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => changeDescriptionView("preview")}
              >
                Preview
              </button>
            </div>
          </div>
          {descriptionView === "edit" ? (
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
              ref={descriptionInputRef}
              value={activeDraft.current.description}
            />
          ) : (
            <div
              className="task-description-preview"
              aria-label="Task description preview"
              onDoubleClick={switchPreviewOnDoubleClick}
              onPointerUp={switchPreviewOnDoubleTap}
            >
              {activeDraft.current.description.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeDraft.current.description}
                </ReactMarkdown>
              ) : (
                <p className="task-description-preview__placeholder">No description yet.</p>
              )}
            </div>
          )}
          <div
            aria-label="Resize description"
            aria-orientation="horizontal"
            aria-valuemax={descriptionHeightMax}
            aria-valuemin={descriptionHeightMin}
            aria-valuenow={activeDescriptionHeight}
            className={resizingDescription ? "task-description-resize task-description-resize--active" : "task-description-resize"}
            onKeyDown={resizeDescriptionWithKeyboard}
            onPointerCancel={stopDescriptionResize}
            onPointerDown={startDescriptionResize}
            onPointerMove={moveDescriptionResize}
            onPointerUp={stopDescriptionResize}
            role="separator"
            tabIndex={0}
            title="Resize description"
          >
            <span />
          </div>
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
          {boardColumns.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <Button icon={<Icon name="check" />} onClick={markTaskDone} variant="outline">Done</Button>
        <Button icon={<Icon name="archive" />} onClick={() => onArchiveTask(task.id)} variant="danger">Archive</Button>
      </div>
      <section className="detail-section">
        <div className="detail-section__heading">
          <h2>Attachments</h2>
          <Mono faded>{attachments.length} {attachments.length === 1 ? "file" : "files"}</Mono>
        </div>
        <div
          className={dropActive ? "attachment-dropzone attachment-dropzone--active" : "attachment-dropzone"}
          onDragEnter={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDropActive(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropAttachmentFile}
        >
          <Icon name="upload" size={16} />
          <span>{uploadingAttachment ? "Uploading" : "Drop or paste a file here"}</span>
          <Button
            disabled={uploadingAttachment}
            icon={<Icon name="plus" />}
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="outline"
          >
            Select file
          </Button>
          <input
            className="attachment-input"
            multiple
            onChange={selectAttachmentFile}
            ref={fileInputRef}
            type="file"
          />
        </div>
        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <div className="attachment-row" key={attachment.id}>
                {isImageAttachment(attachment) ? (
                  <img
                    alt={attachment.originalName}
                    className="attachment-thumb"
                    decoding="async"
                    loading="lazy"
                    src={attachment.url}
                  />
                ) : (
                  <Icon name="link" />
                )}
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  {attachment.originalName}
                </a>
                <Mono faded>{formatBytes(attachment.sizeBytes)}</Mono>
                <button
                  className="icon-btn"
                  disabled={deletingAttachmentId === attachment.id}
                  onClick={() => void deleteAttachment(attachment.id)}
                  title="Delete attachment"
                  type="button"
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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
          <label className="detail-section__toggle">
            <input
              checked={showActivity}
              onChange={(event) => setShowActivity(event.target.checked)}
              type="checkbox"
            />
            <span>Show Activity</span>
          </label>
          <Mono faded>{entries.length} {entries.length === 1 ? "entry" : "entries"}</Mono>
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
          {entry.kind === "comment" ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entry.body}
            </ReactMarkdown>
          ) : entry.summary}
        </div>
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
