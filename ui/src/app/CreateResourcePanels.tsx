import { FormEvent, useState } from "react";
import { apiMessage } from "../lib/errors";
import { Button, Field, InlineError } from "../components/ui";
import { Sheet } from "../components/layout";

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        repositoryPath: repositoryPath.trim() || null,
      });
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="sheet-form" onSubmit={submit}>
      <Field label="Name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Board name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet title="New board" onCancel={onCancel}>
      <form className="sheet-form" onSubmit={submit}>
        <Field label="Name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
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
