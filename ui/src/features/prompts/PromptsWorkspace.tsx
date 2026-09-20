import {
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { ConfirmDialog, Topbar } from "../../components/layout";
import {
  Button,
  EmptyState,
  Icon,
  InlineError,
  Mono,
  SkeletonRows,
} from "../../components/ui";
import type { Prompt } from "../../domain/types";
import { apiMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { promptCountByCategory } from "./prompt-library-view";
import {
  dropEdge,
  planAdjacentReorder,
  planReorder,
  promptCategoryDragType,
  promptDragType,
} from "./prompt-reorder";
import { usePromptLibrary } from "./usePromptLibrary";

type PromptFilter =
  | { type: "all" }
  | { type: "root" }
  | { type: "category"; categoryId: string };

interface PromptDraft {
  promptId: string | null;
  name: string;
  body: string;
  // An empty string means "no note"; it is normalized to null on save.
  note: string;
  categoryIds: string[];
}

export function PromptsWorkspace() {
  const library = usePromptLibrary();
  const [filter, setFilter] = useState<PromptFilter>({ type: "all" });
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  // Display toggle only: the note saves through the form's Save button like
  // the name and body do, not on its own.
  const [noteEditing, setNoteEditing] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingDeletePrompt, setPendingDeletePrompt] = useState<Prompt | null>(null);
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<string | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const counts = useMemo(
    () => promptCountByCategory(library.prompts),
    [library.prompts],
  );

  const visiblePrompts = useMemo(() => {
    if (filter.type === "root") {
      return library.prompts.filter((prompt) => prompt.categoryIds.length === 0);
    }
    if (filter.type === "category") {
      return library.prompts.filter((prompt) =>
        prompt.categoryIds.includes(filter.categoryId),
      );
    }
    return library.prompts;
  }, [filter, library.prompts]);

  const selectedCategory =
    filter.type === "category"
      ? library.categories.find((category) => category.id === filter.categoryId) ?? null
      : null;

  const selectedPrompt =
    draft?.promptId != null
      ? library.prompts.find((prompt) => prompt.id === draft.promptId) ?? null
      : null;

  const draftDirty = draft
    ? draft.promptId === null ||
      !selectedPrompt ||
      draft.name !== selectedPrompt.name ||
      draft.body !== selectedPrompt.body ||
      draft.note !== (selectedPrompt.note ?? "") ||
      draft.categoryIds.join(",") !== selectedPrompt.categoryIds.join(",")
    : false;

  const showStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const resetDraftTo = (prompt: Prompt) => {
    setMutationError(null);
    setNoteEditing(false);
    setDraft({
      promptId: prompt.id,
      name: prompt.name,
      body: prompt.body,
      note: prompt.note ?? "",
      categoryIds: prompt.categoryIds,
    });
  };

  // Unsaved edits must never be discarded by a stray click on another prompt;
  // Cancel stays the explicit escape hatch. An untouched new draft is free to
  // discard.
  const draftBlocksSwitching = () => {
    if (!draft || !draftDirty) {
      return false;
    }
    if (
      draft.promptId === null &&
      !draft.name.trim() &&
      !draft.body.trim() &&
      !draft.note.trim()
    ) {
      return false;
    }
    showStatus("Unsaved changes — save or cancel the open prompt first");
    return true;
  };

  const openPrompt = (prompt: Prompt) => {
    if (draft?.promptId === prompt.id) {
      return;
    }
    if (draftBlocksSwitching()) {
      return;
    }
    resetDraftTo(prompt);
  };

  const openNewPrompt = () => {
    if (draftBlocksSwitching()) {
      return;
    }
    setMutationError(null);
    setNoteEditing(false);
    setDraft({
      promptId: null,
      name: "",
      body: "",
      note: "",
      categoryIds: filter.type === "category" ? [filter.categoryId] : [],
    });
  };

  const saveDraft = async () => {
    if (!draft || saving) {
      return;
    }
    const name = draft.name.trim();
    if (!name || !draft.body.trim()) {
      setMutationError("Prompt name and body are required");
      return;
    }

    const note = draft.note.trim() || null;

    setSaving(true);
    setMutationError(null);
    setNoteEditing(false);
    try {
      if (draft.promptId === null) {
        const created = await library.createPrompt({
          name,
          body: draft.body,
          note,
          categoryIds: draft.categoryIds,
        });
        setDraft({
          promptId: created.id,
          name: created.name,
          body: created.body,
          note: created.note ?? "",
          categoryIds: created.categoryIds,
        });
        showStatus("Prompt created");
      } else {
        const updated = await library.updatePrompt(draft.promptId, {
          name,
          body: draft.body,
          note,
          categoryIds: draft.categoryIds,
        });
        setDraft({
          promptId: updated.id,
          name: updated.name,
          body: updated.body,
          note: updated.note ?? "",
          categoryIds: updated.categoryIds,
        });
        showStatus("Prompt updated");
      }
    } catch (cause) {
      setMutationError(apiMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggleDraftCategory = (categoryId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const categoryIds = current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId];
      return { ...current, categoryIds };
    });
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      return;
    }
    setMutationError(null);
    try {
      const category = await library.createCategory({ name });
      setCreatingCategory(false);
      setNewCategoryName("");
      setFilter({ type: "category", categoryId: category.id });
    } catch (cause) {
      setMutationError(apiMessage(cause));
    }
  };

  const renameCategory = async () => {
    if (!selectedCategory || categoryNameDraft === null) {
      return;
    }
    const name = categoryNameDraft.trim();
    if (!name || name === selectedCategory.name) {
      setCategoryNameDraft(null);
      return;
    }
    setMutationError(null);
    try {
      await library.updateCategory(selectedCategory.id, { name });
      setCategoryNameDraft(null);
      showStatus("Category renamed");
    } catch (cause) {
      setMutationError(apiMessage(cause));
    }
  };

  const restoreDefaults = async () => {
    if (restoring) {
      return;
    }
    setRestoring(true);
    setMutationError(null);
    try {
      const restored = await library.restoreDefaults();
      showStatus(
        restored.length === 0
          ? "Defaults already present"
          : `Restored ${restored.length} default ${restored.length === 1 ? "entry" : "entries"}`,
      );
    } catch (cause) {
      setMutationError(apiMessage(cause));
    } finally {
      setRestoring(false);
    }
  };

  // Prompts carry one global order, so a drop inside a category view is
  // resolved against the full list, never against the filtered rows.
  const orderedIds = (kind: "prompt" | "category") =>
    kind === "prompt"
      ? library.prompts.map((prompt) => prompt.id)
      : library.categories.map((category) => category.id);

  const applyPlan = (
    kind: "prompt" | "category",
    plan: { id: string; position: number } | null,
  ) => {
    if (!plan) {
      return;
    }
    if (kind === "prompt") {
      void library.reorderPrompt(plan.id, plan.position);
    } else {
      void library.reorderCategory(plan.id, plan.position);
    }
  };

  const reorderTo = (
    kind: "prompt" | "category",
    draggedId: string,
    targetId: string,
  ) => {
    const plan = planReorder({ ids: orderedIds(kind), draggedId, targetId });
    applyPlan(kind, plan);
  };

  const dragProps = (kind: "prompt" | "category", id: string) => {
    const dragType = kind === "prompt" ? promptDragType : promptCategoryDragType;
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.dataTransfer.setData(dragType, id);
        event.dataTransfer.effectAllowed = "move";
        setDraggingId(id);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setDropTargetId(null);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!event.dataTransfer.types.includes(dragType)) {
          return;
        }
        event.preventDefault();
        setDropTargetId(id);
      },
      onDragLeave: () => {
        setDropTargetId((current) => (current === id ? null : current));
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        const draggedId = event.dataTransfer.getData(dragType);
        if (!draggedId) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setDraggingId(null);
        setDropTargetId(null);
        reorderTo(kind, draggedId, id);
      },
    };
  };

  const rowClassName = (
    base: string,
    kind: "prompt" | "category",
    id: string,
  ) => {
    const classes = [base];
    if (draggingId === id) {
      classes.push(`${base}--dragging`);
    }
    if (dropTargetId === id) {
      const edge = dropEdge(orderedIds(kind), draggingId, id);
      if (edge) {
        classes.push(`${base}--drop-${edge}`);
      }
    }
    return classes.join(" ");
  };

  // Alt+Arrow is the pointer-free path to the same reorder, stepping one
  // visible row at a time.
  const reorderByKeyboard = (
    kind: "prompt" | "category",
    id: string,
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
      return;
    }
    const ids = orderedIds(kind);
    const plan = planAdjacentReorder({
      ids,
      visibleIds:
        kind === "prompt" ? visiblePrompts.map((prompt) => prompt.id) : ids,
      id,
      delta: event.key === "ArrowUp" ? -1 : 1,
    });
    event.preventDefault();
    applyPlan(kind, plan);
  };

  const pendingDeleteCategory =
    pendingDeleteCategoryId !== null
      ? library.categories.find((category) => category.id === pendingDeleteCategoryId) ?? null
      : null;

  return (
    <>
      <Topbar
        actions={
          <>
            <Button
              disabled={restoring || library.loading}
              icon={<Icon name="refresh" />}
              onClick={() => void restoreDefaults()}
              variant="ghost"
            >
              Restore defaults
            </Button>
            <Button
              disabled={library.loading}
              icon={<Icon name="plus" />}
              onClick={openNewPrompt}
              variant="primary"
            >
              New prompt
            </Button>
          </>
        }
        crumbs={[{ label: "Prompts", icon: <Icon name="prompt" /> }]}
      />
      <InlineError message={library.error ?? mutationError} />
      <div className="prompts-layout">
        <aside className="prompts-rail">
          <div className="prompts-rail__heading">
            <span>Categories</span>
            <button
              className="icon-btn"
              onClick={() => {
                setCreatingCategory((current) => !current);
                setNewCategoryName("");
              }}
              title="New category"
              type="button"
            >
              <Icon name="plus" />
            </button>
          </div>
          {creatingCategory && (
            <form
              className="prompts-rail__new-category"
              onSubmit={(event) => {
                event.preventDefault();
                void createCategory();
              }}
            >
              <input
                aria-label="New category name"
                autoFocus
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Category name"
                value={newCategoryName}
              />
              <Button type="submit" variant="outline" disabled={!newCategoryName.trim()}>
                Add
              </Button>
            </form>
          )}
          <nav className="prompts-rail__items">
            <PromptFilterItem
              active={filter.type === "all"}
              count={library.prompts.length}
              label="All prompts"
              onClick={() => setFilter({ type: "all" })}
            />
            <PromptFilterItem
              active={filter.type === "root"}
              count={counts.get(null) ?? 0}
              label="Uncategorized"
              onClick={() => setFilter({ type: "root" })}
            />
            {library.categories.map((category) => (
              <div
                className={rowClassName("prompts-rail__drag", "category", category.id)}
                key={category.id}
                {...dragProps("category", category.id)}
              >
                <PromptFilterItem
                  active={filter.type === "category" && filter.categoryId === category.id}
                  count={counts.get(category.id) ?? 0}
                  label={category.name}
                  onClick={() => setFilter({ type: "category", categoryId: category.id })}
                  onKeyDown={(event) => reorderByKeyboard("category", category.id, event)}
                  title="Drag or press Alt+Up/Down to reorder"
                />
              </div>
            ))}
          </nav>
        </aside>
        <section className="prompts-list">
          <div className="prompts-list__heading">
            {selectedCategory && categoryNameDraft !== null ? (
              <form
                className="prompts-list__rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameCategory();
                }}
              >
                <input
                  aria-label="Category name"
                  autoFocus
                  onChange={(event) => setCategoryNameDraft(event.target.value)}
                  value={categoryNameDraft}
                />
                <Button type="submit" variant="outline">Save</Button>
                <Button onClick={() => setCategoryNameDraft(null)} type="button" variant="ghost">
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <h2>
                  {filter.type === "all" && "All prompts"}
                  {filter.type === "root" && "Uncategorized"}
                  {selectedCategory?.name}
                </h2>
                {statusMessage && <Mono faded>{statusMessage}</Mono>}
                <span className="prompts-list__spacer" />
                {selectedCategory && (
                  <>
                    <button
                      className="prompts-list__action"
                      onClick={() => setCategoryNameDraft(selectedCategory.name)}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      className="prompts-list__action prompts-list__action--danger"
                      onClick={() => setPendingDeleteCategoryId(selectedCategory.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {library.loading && <SkeletonRows />}
          {!library.loading && visiblePrompts.length === 0 && (
            <EmptyState
              action={
                <Button icon={<Icon name="plus" />} onClick={openNewPrompt} variant="outline">
                  New prompt
                </Button>
              }
              body="Prompts you save here can be copied from any task via the prompt picker."
              title="No prompts here yet"
            />
          )}
          <div className="prompts-list__items">
            {visiblePrompts.map((prompt) => (
              // The row is dragged by its wrapper: browsers handle a
              // draggable <button> inconsistently, and the button stays the
              // click and focus target.
              <div
                className={rowClassName("prompt-row-drag", "prompt", prompt.id)}
                key={prompt.id}
                {...dragProps("prompt", prompt.id)}
              >
                <button
                  className={
                    draft?.promptId === prompt.id
                      ? "prompt-row prompt-row--active"
                      : "prompt-row"
                  }
                  onClick={() => openPrompt(prompt)}
                  onKeyDown={(event) => reorderByKeyboard("prompt", prompt.id, event)}
                  title="Drag or press Alt+Up/Down to reorder"
                  type="button"
                >
                  <span className="prompt-row__name">{prompt.name}</span>
                  <span className="prompt-row__meta">
                    {prompt.usageCount > 0 && (
                      <Mono faded>
                        used {prompt.usageCount}× · {formatDate(prompt.lastUsedAt)}
                      </Mono>
                    )}
                    {prompt.usageCount === 0 && <Mono faded>never used</Mono>}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="prompt-editor">
          {!draft && (
            <EmptyState
              body="Select a prompt from the list or create a new one to edit it here."
              title="No prompt selected"
            />
          )}
          {draft && (
            <form
              className="prompt-editor__form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveDraft();
              }}
            >
              <label className="field">
                <span className="field__label">Name</span>
                <input
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="Prompt name (emoji welcome)"
                  value={draft.name}
                />
              </label>
              <div className="field">
                <span className="field__label">Note</span>
                {noteEditing ? (
                  <textarea
                    autoFocus
                    className="prompt-editor__note-input"
                    onBlur={() => setNoteEditing(false)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, note: event.target.value } : current,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        // Collapse back to static text without letting the key
                        // reach the workspace; Cancel stays the discard path.
                        event.stopPropagation();
                        setNoteEditing(false);
                      }
                    }}
                    placeholder="A short help text from the prompt's author..."
                    rows={3}
                    value={draft.note}
                  />
                ) : (
                  <button
                    className={
                      draft.note.trim()
                        ? "prompt-editor__note"
                        : "prompt-editor__note prompt-editor__note--empty"
                    }
                    onClick={() => setNoteEditing(true)}
                    title="Edit the note"
                    type="button"
                  >
                    {draft.note.trim() ? draft.note : "Add a note"}
                  </button>
                )}
              </div>
              <label className="field prompt-editor__body-field">
                <span className="field__label">
                  Body
                  <Mono faded> {"{{TASK}} and {{PARENT_TASK}} are replaced on copy"}</Mono>
                </span>
                <textarea
                  className="prompt-editor__body"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, body: event.target.value } : current,
                    )
                  }
                  placeholder="Prompt text..."
                  value={draft.body}
                />
              </label>
              <div className="prompt-editor__categories">
                <span className="field__label">Categories</span>
                {library.categories.length === 0 && (
                  <Mono faded>No categories yet</Mono>
                )}
                {library.categories.map((category) => (
                  <label className="prompt-editor__category" key={category.id}>
                    <input
                      checked={draft.categoryIds.includes(category.id)}
                      onChange={() => toggleDraftCategory(category.id)}
                      type="checkbox"
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
              <div className="form-actions">
                {selectedPrompt && (
                  <Button
                    icon={<Icon name="trash" />}
                    onClick={() => setPendingDeletePrompt(selectedPrompt)}
                    type="button"
                    variant="danger"
                  >
                    Delete
                  </Button>
                )}
                <span className="prompt-editor__actions-spacer" />
                <Button
                  disabled={saving || !draftDirty}
                  onClick={() => {
                    if (selectedPrompt) {
                      resetDraftTo(selectedPrompt);
                    } else {
                      setDraft(null);
                    }
                  }}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button disabled={saving || !draftDirty} type="submit" variant="primary">
                  {saving ? "Saving" : draft.promptId === null ? "Create" : "Save"}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
      {pendingDeletePrompt && (
        <ConfirmDialog
          confirmLabel="Delete"
          danger
          message={
            <p>
              This permanently deletes the prompt “{pendingDeletePrompt.name}”.
              {pendingDeletePrompt.defaultKey
                ? " It is a default prompt and can be brought back with Restore defaults."
                : " This cannot be undone."}
            </p>
          }
          onCancel={() => setPendingDeletePrompt(null)}
          onConfirm={async () => {
            await library.deletePrompt(pendingDeletePrompt.id);
            if (draft?.promptId === pendingDeletePrompt.id) {
              setDraft(null);
            }
            setPendingDeletePrompt(null);
          }}
          title="Delete prompt?"
        />
      )}
      {pendingDeleteCategory && (
        <ConfirmDialog
          confirmLabel="Delete category"
          danger
          message={
            <p>
              This deletes the category “{pendingDeleteCategory.name}”. Prompts in it
              are kept and fall back to the root level.
            </p>
          }
          onCancel={() => setPendingDeleteCategoryId(null)}
          onConfirm={async () => {
            await library.deleteCategory(pendingDeleteCategory.id);
            // The deleted id would make an open draft unsaveable ("category
            // not found"), so drop it from the draft as the server did.
            setDraft((current) =>
              current
                ? {
                    ...current,
                    categoryIds: current.categoryIds.filter(
                      (id) => id !== pendingDeleteCategory.id,
                    ),
                  }
                : current,
            );
            setPendingDeleteCategoryId(null);
            setFilter({ type: "all" });
          }}
          title="Delete category?"
        />
      )}
    </>
  );
}

function PromptFilterItem({
  active,
  count,
  label,
  onClick,
  onKeyDown,
  title,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  title?: string;
}) {
  return (
    <button
      className={active ? "prompts-rail__item prompts-rail__item--active" : "prompts-rail__item"}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={title}
      type="button"
    >
      <span className="prompts-rail__item-label">{label}</span>
      <Mono faded>{count}</Mono>
    </button>
  );
}
