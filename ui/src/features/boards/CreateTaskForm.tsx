import { useState } from "react";
import type { TaskPriority } from "../../domain/types";
import { parseTaskLabels } from "../../lib/task-labels";
import { useFormSubmission } from "../../lib/useFormSubmission";
import { Button, InlineError } from "../../components/ui";

const defaultPriority: TaskPriority = "normal";

export function CreateTaskForm({
  columnId,
  onCancel,
  onSubmit,
}: {
  columnId: string;
  onCancel: () => void;
  onSubmit: (input: { title: string; description?: string | null; columnId?: string; priority?: TaskPriority; labels?: string[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority);
  const { error, setError, submit, submitting } = useFormSubmission(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      columnId,
      priority,
      labels: parseTaskLabels(labels),
    });
  });

  return (
    <form className="create-task-form" onSubmit={submit}>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
      <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="labels, comma separated" />
      <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <InlineError message={error} />
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={submitting}>Create</Button>
      </div>
    </form>
  );
}
