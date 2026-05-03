import { useState } from "react";
import { useFormSubmission } from "../lib/useFormSubmission";
import { Button, Field, InlineError } from "../components/ui";
import {
  NameField,
  isUrlSafeName,
  urlSafeNameError,
} from "../components/ui/NameField";
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
  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!isUrlSafeName(name.trim())) {
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
    if (!isUrlSafeName(name.trim())) {
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
