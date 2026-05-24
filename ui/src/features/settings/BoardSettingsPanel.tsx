import { useEffect, useState, type ReactNode } from "react";
import type {
  Board,
  BoardCheckpoint,
  BoardCheckpointRestoreResponse,
  Project,
} from "../../domain/types";
import { api } from "../../lib/api";
import { apiMessage } from "../../lib/errors";
import { formatDate } from "../../lib/format";
import { useFormSubmission } from "../../lib/useFormSubmission";
import { Button, Field, InlineError, Mono } from "../../components/ui";
import {
  NameField,
  isUrlSafeName,
  urlSafeNameError,
} from "../../components/ui/NameField";
import { ConfirmDialog, Sheet } from "../../components/layout";
import { formatCheckpointDefaultName } from "./checkpoint-default-name";

type ProjectInput = {
  name?: string;
  description?: string | null;
  repositoryPath?: string | null;
};

type BoardInput = {
  name?: string;
  description?: string | null;
};

type PendingConfirm =
  | { kind: "archive-project" }
  | { kind: "delete-project" }
  | { kind: "delete-board" };

type CheckpointInput = {
  name?: string;
  description?: string | null;
};

export function BoardSettingsPanel({
  activeBoard,
  activeProject,
  onArchiveProject,
  onCancel,
  onDeleteBoard,
  onDeleteProject,
  onRestoreCheckpoint,
  onUpdateBoard,
  onUpdateProject,
}: {
  activeBoard: Board | null;
  activeProject: Project;
  onArchiveProject: () => Promise<void>;
  onCancel: () => void;
  onDeleteBoard: () => Promise<void>;
  onDeleteProject: () => Promise<void>;
  onRestoreCheckpoint: (
    checkpointId: string,
  ) => Promise<BoardCheckpointRestoreResponse>;
  onUpdateBoard: (input: BoardInput) => Promise<void>;
  onUpdateProject: (input: ProjectInput) => Promise<void>;
}) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  return (
    <Sheet title="Settings" onCancel={onCancel}>
      <div className="settings-sheet">
        <ProjectSection
          activeProject={activeProject}
          onArchive={() => setPending({ kind: "archive-project" })}
          onDelete={() => setPending({ kind: "delete-project" })}
          onUpdate={onUpdateProject}
        />
        {activeBoard && (
          <BoardSection
            activeBoard={activeBoard}
            onDelete={() => setPending({ kind: "delete-board" })}
            onUpdate={onUpdateBoard}
          />
        )}
        {activeBoard && (
          <CheckpointsSection
            activeBoard={activeBoard}
            activeProject={activeProject}
            onRestoreCheckpoint={onRestoreCheckpoint}
          />
        )}
      </div>
      {pending?.kind === "archive-project" && (
        <ConfirmDialog
          title="Archive project?"
          confirmLabel="Archive"
          message={
            <>
              <p>
                Archive <Mono>{activeProject.name}</Mono>? Archived projects are
                hidden from active views but their boards, tasks, comments, and
                activity remain available with{" "}
                <Mono>includeArchived=true</Mono>.
              </p>
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await onArchiveProject();
            setPending(null);
          }}
        />
      )}
      {pending?.kind === "delete-project" && (
        <ConfirmDialog
          title="Delete project?"
          confirmLabel="Delete project"
          danger
          message={
            <>
              <p>
                Permanently delete <Mono>{activeProject.name}</Mono>?
              </p>
              <p>
                This deletes the project and all of its boards, columns, tasks,
                comments, activity, attachment records, uploaded attachment
                files, and search records. This cannot be undone.
              </p>
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await onDeleteProject();
            setPending(null);
          }}
        />
      )}
      {pending?.kind === "delete-board" && activeBoard && (
        <ConfirmDialog
          title="Delete board?"
          confirmLabel="Delete board"
          danger
          message={
            <>
              <p>
                Permanently delete board <Mono>{activeBoard.name}</Mono>?
              </p>
              <p>
                This deletes the board and all of its columns, tasks, comments,
                activity, attachment records, uploaded attachment files, and
                search records. The parent project is not affected. This cannot
                be undone.
              </p>
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await onDeleteBoard();
            setPending(null);
          }}
        />
      )}
    </Sheet>
  );
}

function CheckpointsSection({
  activeBoard,
  activeProject,
  onRestoreCheckpoint,
}: {
  activeBoard: Board;
  activeProject: Project;
  onRestoreCheckpoint: (
    checkpointId: string,
  ) => Promise<BoardCheckpointRestoreResponse>;
}) {
  const [checkpoints, setCheckpoints] = useState<BoardCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<BoardCheckpointRestoreResponse | null>(
    null,
  );
  const [pending, setPending] = useState<
    | { kind: "restore"; checkpoint: BoardCheckpoint }
    | { kind: "delete"; checkpoint: BoardCheckpoint }
    | null
  >(null);
  const initialDescription = "";
  const [name, setName] = useState(() => formatCheckpointDefaultName());
  const [description, setDescription] = useState(initialDescription);
  const projectId = activeProject.id;
  const boardId = activeBoard.id;

  const loadCheckpoints = async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
    }
    try {
      const next = await api.listBoardCheckpoints(projectId, boardId);
      setCheckpoints(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiMessage(err));
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setName(formatCheckpointDefaultName());
    setDescription(initialDescription);
    void api
      .listBoardCheckpoints(projectId, boardId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setCheckpoints(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, projectId]);

  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const input: CheckpointInput = {};
    if (trimmedName) {
      input.name = trimmedName;
    }
    if (trimmedDescription) {
      input.description = trimmedDescription;
    }

    await api.createBoardCheckpoint(projectId, boardId, input);
    setName(formatCheckpointDefaultName());
    setDescription(initialDescription);
    setResult(null);
    await loadCheckpoints(true);
  });

  const hasCheckpoints = checkpoints.length > 0;

  return (
    <Section title="Checkpoints">
      <form className="sheet-form" onSubmit={submit}>
        <Field label="Name">
          <input
            placeholder="YYYYMMDD-HHMMSS"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <InlineError message={error} />
        <div className="form-actions">
          <Button disabled={submitting} type="submit" variant="primary">
            Save checkpoint
          </Button>
        </div>
      </form>
      {result && <RestoreResult result={result} />}
      <InlineError message={loadError} />
      <div className="checkpoint-list" aria-busy={loading}>
        {loading && <div className="checkpoint-list__empty">Loading checkpoints...</div>}
        {!loading && !hasCheckpoints && (
          <div className="checkpoint-list__empty">No checkpoints saved.</div>
        )}
        {!loading &&
          checkpoints.map((checkpoint) => (
            <CheckpointRow
              checkpoint={checkpoint}
              key={checkpoint.id}
              onDelete={() => setPending({ kind: "delete", checkpoint })}
              onRestore={() => setPending({ kind: "restore", checkpoint })}
            />
          ))}
      </div>
      {pending?.kind === "restore" && (
        <ConfirmDialog
          title="Restore checkpoint?"
          confirmLabel="Restore checkpoint"
          danger
          message={
            <>
              <p>
                Restore <Mono>{pending.checkpoint.name}</Mono> on board{" "}
                <Mono>{activeBoard.name}</Mono>?
              </p>
              <p>
                This replaces the board&apos;s columns, tasks, comments,
                activity, and attachment records with the checkpointed state.
                Uploaded files on disk are not deleted.
              </p>
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const restored = await onRestoreCheckpoint(pending.checkpoint.id);
            setResult(restored);
            setPending(null);
            await loadCheckpoints(true);
          }}
        />
      )}
      {pending?.kind === "delete" && (
        <ConfirmDialog
          title="Delete checkpoint?"
          confirmLabel="Delete checkpoint"
          danger
          message={
            <>
              <p>
                Delete checkpoint <Mono>{pending.checkpoint.name}</Mono>?
              </p>
              <p>
                This deletes only the checkpoint row. The board, tasks,
                comments, activity, attachment records, and uploaded files are
                not changed.
              </p>
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await api.deleteBoardCheckpoint(projectId, boardId, pending.checkpoint.id);
            setResult(null);
            setPending(null);
            await loadCheckpoints(true);
          }}
        />
      )}
    </Section>
  );
}

function CheckpointRow({
  checkpoint,
  onDelete,
  onRestore,
}: {
  checkpoint: BoardCheckpoint;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const summary = checkpoint.summary;
  const creator =
    checkpoint.creatorName ??
    checkpoint.creatorRef ??
    checkpoint.creatorType;

  return (
    <article className="checkpoint-row">
      <div className="checkpoint-row__main">
        <div className="checkpoint-row__title">
          <strong>{checkpoint.name}</strong>
          <Mono>{checkpoint.id}</Mono>
        </div>
        {checkpoint.description && (
          <p className="checkpoint-row__description">
            {checkpoint.description}
          </p>
        )}
        <div className="checkpoint-row__meta">
          <span>{formatDate(checkpoint.createdAt)}</span>
          <span>{creator}</span>
        </div>
        <div className="checkpoint-row__summary">
          <span>{summary.tasks ?? 0} tasks</span>
          <span>{summary.archivedTasks ?? 0} archived</span>
          <span>{summary.comments ?? 0} comments</span>
          <span>{summary.activity ?? 0} activity</span>
          <span>{summary.attachments ?? 0} attachments</span>
          <span>{summary.columns ?? 0} columns</span>
        </div>
      </div>
      <div className="checkpoint-row__actions">
        <Button onClick={onRestore} type="button" variant="outline">
          Restore
        </Button>
        <Button onClick={onDelete} type="button" variant="danger">
          Delete
        </Button>
      </div>
    </article>
  );
}

function RestoreResult({ result }: { result: BoardCheckpointRestoreResponse }) {
  const mappingCount = Object.values(result.idMappings).reduce(
    (count, mappings) => count + Object.keys(mappings).length,
    0,
  );

  if (result.warnings.length === 0 && mappingCount === 0) {
    return (
      <div className="checkpoint-result">
        Restored <Mono>{result.checkpoint.name}</Mono>.
      </div>
    );
  }

  return (
    <div className="checkpoint-result">
      <div>
        Restored <Mono>{result.checkpoint.name}</Mono>
        {result.warnings.length > 0 || mappingCount > 0 ? " with notices." : "."}
      </div>
      {result.warnings.length > 0 && (
        <ul>
          {result.warnings.map((warning, index) => (
            <li key={`${warning.type}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      )}
      {mappingCount > 0 && (
        <div>{mappingCount} checkpoint IDs were remapped during restore.</div>
      )}
    </div>
  );
}

function ProjectSection({
  activeProject,
  onArchive,
  onDelete,
  onUpdate,
}: {
  activeProject: Project;
  onArchive: () => void;
  onDelete: () => void;
  onUpdate: (input: ProjectInput) => Promise<void>;
}) {
  const initialName = activeProject.name;
  const initialDescription = activeProject.description ?? "";
  const initialRepositoryPath = activeProject.repositoryPath ?? "";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [repositoryPath, setRepositoryPath] = useState(initialRepositoryPath);

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
    setRepositoryPath(initialRepositoryPath);
  }, [initialName, initialDescription, initialRepositoryPath]);

  const trimmedName = name.trim();
  const nameValid = isUrlSafeName(trimmedName);
  const nameChanged = trimmedName !== initialName;
  const descriptionChanged = description !== initialDescription;
  const repositoryPathChanged = repositoryPath !== initialRepositoryPath;
  const changed = nameChanged || descriptionChanged || repositoryPathChanged;

  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!trimmedName) {
      setError("Project name is required");
      return;
    }
    if (!nameValid) {
      setError(urlSafeNameError);
      return;
    }
    if (!changed) {
      return;
    }
    const input: ProjectInput = {};
    if (nameChanged) input.name = trimmedName;
    if (descriptionChanged) input.description = description.trim() || null;
    if (repositoryPathChanged) {
      input.repositoryPath = repositoryPath.trim() || null;
    }
    await onUpdate(input);
  });

  return (
    <Section title="Project">
      <form className="sheet-form" onSubmit={submit}>
        <NameField
          label="Name"
          name={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
        />
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Repository path">
          <input
            value={repositoryPath}
            onChange={(event) => {
              setRepositoryPath(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <InlineError message={error} />
        <div className="form-actions">
          <Button
            disabled={submitting || !changed || !nameValid}
            type="submit"
            variant="primary"
          >
            Save project
          </Button>
        </div>
      </form>
      <DangerZone>
        <Button onClick={onArchive} type="button" variant="ghost">
          Archive project
        </Button>
        <Button onClick={onDelete} type="button" variant="danger">
          Delete project
        </Button>
      </DangerZone>
    </Section>
  );
}

function BoardSection({
  activeBoard,
  onDelete,
  onUpdate,
}: {
  activeBoard: Board;
  onDelete: () => void;
  onUpdate: (input: BoardInput) => Promise<void>;
}) {
  const initialName = activeBoard.name;
  const initialDescription = activeBoard.description ?? "";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
  }, [initialName, initialDescription]);

  const trimmedName = name.trim();
  const nameValid = isUrlSafeName(trimmedName);
  const nameChanged = trimmedName !== initialName;
  const descriptionChanged = description !== initialDescription;
  const changed = nameChanged || descriptionChanged;

  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!trimmedName) {
      setError("Board name is required");
      return;
    }
    if (!nameValid) {
      setError(urlSafeNameError);
      return;
    }
    if (!changed) {
      return;
    }
    const input: BoardInput = {};
    if (nameChanged) input.name = trimmedName;
    if (descriptionChanged) input.description = description.trim() || null;
    await onUpdate(input);
  });

  return (
    <Section title="Board">
      <form className="sheet-form" onSubmit={submit}>
        <NameField
          label="Name"
          name={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
        />
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <InlineError message={error} />
        <div className="form-actions">
          <Button
            disabled={submitting || !changed || !nameValid}
            type="submit"
            variant="primary"
          >
            Save board
          </Button>
        </div>
      </form>
      <DangerZone>
        <Button onClick={onDelete} type="button" variant="danger">
          Delete board
        </Button>
      </DangerZone>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-sheet__section">
      <h2 className="settings-sheet__heading">{title}</h2>
      {children}
    </section>
  );
}

function DangerZone({ children }: { children: ReactNode }) {
  return (
    <div className="settings-sheet__danger-zone">
      <span className="settings-sheet__danger-label">Danger zone</span>
      <div className="settings-sheet__danger-actions">{children}</div>
    </div>
  );
}
