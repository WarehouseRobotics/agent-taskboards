import { useState } from "react";
import { useFormSubmission } from "../lib/useFormSubmission";
import { Button, Field, InlineError } from "../components/ui";
import { Sheet } from "../components/layout";

const urlSafeNamePattern = /^[a-z0-9_-]+$/;
const urlSafeNameError =
  "Use only lowercase letters, numbers, underscores, and hyphens.";
const urlSafeNameAllowed = "Lowercase letters, numbers, - and _ only";

export function CreateProjectPanel({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; description?: string | null; repositoryPath?: string | null }) => Promise<void>;
}) {
  return (
    <Sheet title="New project" onCancel={onCancel}>
      <ProjectForm onCancel={onCancel} onSubmit={onSubmit} />
    </Sheet>
  );
}

function ProjectForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; description?: string | null; repositoryPath?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!urlSafeNamePattern.test(name.trim())) {
      setError(urlSafeNameError);
      return;
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      repositoryPath: repositoryPath.trim() || null,
    });
  });

  return (
    <form className="sheet-form" onSubmit={submit}>
      <NameField
        autoFocus
        label="Name"
        name={name}
        onChange={(value) => {
          setName(value);
          setError(null);
        }}
      />
      <Field label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Field label="Repository path"><input value={repositoryPath} onChange={(event) => setRepositoryPath(event.target.value)} /></Field>
      <InlineError message={error} />
      <div className="form-actions">
        <Button type="button" onClick={onCancel} variant="ghost">Cancel</Button>
        <Button type="submit" disabled={submitting} variant="primary">Create project</Button>
      </div>
    </form>
  );
}

export function CreateBoardPanel({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: { name: string; description?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!name.trim()) {
      setError("Board name is required");
      return;
    }
    if (!urlSafeNamePattern.test(name.trim())) {
      setError(urlSafeNameError);
      return;
    }
    await onSubmit({ name: name.trim(), description: description.trim() || null });
  });

  return (
    <Sheet title="New board" onCancel={onCancel}>
      <form className="sheet-form" onSubmit={submit}>
        <NameField
          autoFocus
          label="Name"
          name={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
        />
        <Field label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <InlineError message={error} />
        <div className="form-actions">
          <Button type="button" onClick={onCancel} variant="ghost">Cancel</Button>
          <Button type="submit" disabled={submitting} variant="primary">Create board</Button>
        </div>
      </form>
    </Sheet>
  );
}

export function RenameProjectPanel({
  initialName,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  onCancel: () => void;
  onSubmit: (input: { name: string }) => Promise<void>;
}) {
  return (
    <RenameResourcePanel
      initialName={initialName}
      kind="project"
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

export function RenameBoardPanel({
  initialName,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  onCancel: () => void;
  onSubmit: (input: { name: string }) => Promise<void>;
}) {
  return (
    <RenameResourcePanel
      initialName={initialName}
      kind="board"
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

function RenameResourcePanel({
  initialName,
  kind,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  kind: "project" | "board";
  onCancel: () => void;
  onSubmit: (input: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const trimmedName = name.trim();
  const changed = trimmedName !== initialName;
  const valid = isUrlSafeName(trimmedName);
  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!trimmedName) {
      setError(`${capitalize(kind)} name is required`);
      return;
    }
    if (!valid) {
      setError(urlSafeNameError);
      return;
    }
    if (!changed) {
      onCancel();
      return;
    }
    await onSubmit({ name: trimmedName });
  });

  return (
    <Sheet title={`Rename ${kind}`} onCancel={onCancel}>
      <form className="sheet-form" onSubmit={submit}>
        <NameField
          autoFocus
          label="Name"
          name={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
        />
        <InlineError message={error} />
        <div className="form-actions">
          <Button type="button" onClick={onCancel} variant="ghost">Cancel</Button>
          <Button type="submit" disabled={submitting || !valid || !changed} variant="primary">
            Rename {kind}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function NameField({
  autoFocus,
  label,
  name,
  onChange,
}: {
  autoFocus?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
}) {
  const trimmedName = name.trim();
  const hasValue = trimmedName.length > 0;
  const valid = isUrlSafeName(trimmedName);
  const feedbackState = !hasValue ? "neutral" : valid ? "valid" : "invalid";

  return (
    <Field label={label}>
      <input
        aria-describedby="resource-name-rules"
        aria-invalid={hasValue && !valid}
        autoFocus={autoFocus}
        className={
          feedbackState === "invalid"
            ? "name-input name-input--invalid"
            : feedbackState === "valid"
              ? "name-input name-input--valid"
              : "name-input"
        }
        value={name}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className={`name-rules name-rules--${feedbackState}`} id="resource-name-rules">
        <span className="name-rules__status" aria-hidden="true">
          {feedbackState === "valid" ? "OK" : feedbackState === "invalid" ? "!" : "-"}
        </span>
        <span>{urlSafeNameAllowed}</span>
      </div>
    </Field>
  );
}

function isUrlSafeName(name: string) {
  return urlSafeNamePattern.test(name);
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
