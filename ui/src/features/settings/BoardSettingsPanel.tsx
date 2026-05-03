import { useEffect, useState, type ReactNode } from "react";
import type { Board, Project } from "../../domain/types";
import { useFormSubmission } from "../../lib/useFormSubmission";
import { Button, Field, InlineError, Mono } from "../../components/ui";
import {
  NameField,
  isUrlSafeName,
  urlSafeNameError,
} from "../../components/ui/NameField";
import { ConfirmDialog, Sheet } from "../../components/layout";

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

export function BoardSettingsPanel({
  activeBoard,
  activeProject,
  onArchiveProject,
  onCancel,
  onDeleteBoard,
  onDeleteProject,
  onUpdateBoard,
  onUpdateProject,
}: {
  activeBoard: Board | null;
  activeProject: Project;
  onArchiveProject: () => Promise<void>;
  onCancel: () => void;
  onDeleteBoard: () => Promise<void>;
  onDeleteProject: () => Promise<void>;
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
