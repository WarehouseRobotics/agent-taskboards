import { FormEvent, useState } from "react";
import { apiMessage } from "./errors";

export function useFormSubmission(submitForm: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitForm();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return { error, setError, submit, submitting };
}
