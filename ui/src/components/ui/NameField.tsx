import { Field } from "./index";

export const urlSafeNamePattern = /^[a-z0-9_-]+$/;
export const urlSafeNameError =
  "Use only lowercase letters, numbers, underscores, and hyphens.";
export const urlSafeNameAllowed = "Lowercase letters, numbers, - and _ only";

export function isUrlSafeName(name: string) {
  return urlSafeNamePattern.test(name);
}

export function NameField({
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
