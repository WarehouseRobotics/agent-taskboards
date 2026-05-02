import type { ButtonHTMLAttributes, CSSProperties, ReactNode, SVGProps } from "react";
import type { ActorType, TaskPriority } from "../../domain/types";
import type { ColumnStatus } from "../../lib/task-display";
import { labelColor, priorityToLevel } from "../../lib/task-display";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const pathSets = {
  board: ["M2 3h12v10H2z", "M6 3v10", "M10 3v10"],
  list: ["M3 4h10", "M3 8h10", "M3 12h10"],
  search: ["M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M11 11l3 3"],
  settings: [
    "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "M8 1v2",
    "M8 13v2",
    "M1 8h2",
    "M13 8h2",
    "M3 3l1.4 1.4",
    "M11.6 11.6L13 13",
    "M3 13l1.4-1.4",
    "M11.6 4.4L13 3",
  ],
  archive: ["M2 4h12v3H2z", "M3 7v6h10V7", "M6 9.5h4"],
  plus: ["M8 3v10", "M3 8h10"],
  chevron: ["M6 4l4 4-4 4"],
  down: ["M4 6l4 4 4-4"],
  more: ["M4 8h.01", "M8 8h.01", "M12 8h.01"],
  copy: ["M5 5h7v7H5z", "M3 11V3h7"],
  comment: ["M2.5 3h11v8H7l-3 2.5V11H2.5z"],
  link: ["M9 7l-2 2", "M6 4.5L7 3.5a2.5 2.5 0 0 1 3.5 3.5l-1 1", "M10 11.5L9 12.5a2.5 2.5 0 0 1-3.5-3.5l1-1"],
  flag: ["M4 14V3", "M4 3h8l-2 3 2 3H4"],
  check: ["M3 8.5l3.5 3.5L13 4.5"],
  agent: ["M5 4h6v6H5z", "M3 6v2", "M13 6v2", "M6.5 6.5h.01", "M9.5 6.5h.01", "M6 13h4"],
  human: ["M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"],
  filter: ["M2 3h12l-4.5 5v5L6.5 12V8z"],
  refresh: ["M14 3v3h-3", "M2 13v-3h3", "M3.5 6a5 5 0 0 1 8.5-1.5L14 6", "M12.5 10a5 5 0 0 1-8.5 1.5L2 10"],
  database: ["M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2z", "M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4", "M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"],
  close: ["M3.5 3.5l9 9", "M12.5 3.5l-9 9"],
  external: ["M6 3H3v10h10v-3", "M9 3h4v4", "M13 3l-5 5"],
  command: ["M5 5h6v6H5z", "M5 5a2 2 0 1 1-2-2", "M11 5a2 2 0 1 0 2-2", "M5 11a2 2 0 1 0-2 2", "M11 11a2 2 0 1 1 2 2"],
  zap: ["M9 1.5L3.5 9H8l-1 5.5L13 7H8.5z"],
  theme: ["M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M8 1.5v13", "M8 4a4 4 0 0 1 0 8"],
};

export type IconName = keyof typeof pathSets;

export function Icon({
  name,
  size = 14,
  strokeWidth = 1.5,
  ...props
}: IconProps & { name: IconName }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      {...props}
    >
      {pathSets[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Mono({ children, faded = false }: { children: ReactNode; faded?: boolean }) {
  return <span className={faded ? "mono mono--faded" : "mono"}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Button({
  children,
  icon,
  variant = "default",
  kbd,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "default" | "ghost" | "primary" | "outline" | "danger";
  kbd?: string;
}) {
  return (
    <button className={`btn btn--${variant}`} {...props}>
      {icon}
      {children && <span>{children}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return <div className="inline-error">{message}</div>;
}

export function StatusIcon({ status, size = 14 }: { status: ColumnStatus; size?: number }) {
  const color = `var(--status-${status === "backlog" ? "todo" : status})`;
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="status-icon">
        <circle cx="8" cy="8" r="7" fill={color} />
        <path d="M4.5 8.2 7 10.5 11.5 5.8" fill="none" stroke="var(--bg-app)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (status === "in-progress") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="status-icon">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={color} strokeWidth="1.5" />
        <path d="M8 8 8 2 A6 6 0 0 1 13.2 11z" fill={color} />
      </svg>
    );
  }
  if (status === "blocked") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className="status-icon">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke={color} strokeWidth="1.5" />
        <path d="M4 4 12 12" stroke={color} strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="status-icon">
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        stroke={color}
        strokeDasharray={status === "backlog" || status === "review" ? "2 2" : undefined}
        strokeWidth="1.5"
      />
      {status === "ready" && <circle cx="8" cy="8" r="2" fill={color} />}
    </svg>
  );
}

export function PriorityFlag({ priority, size = 12 }: { priority: TaskPriority; size?: number }) {
  const level = priorityToLevel(priority);
  const color = `var(--priority-${level})`;
  const isOutline = level === "p3";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className="priority-flag"
      style={{ "--priority-color": color } as CSSProperties}
      aria-label={`${priority} priority`}
    >
      <path d="M3 3v10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path
        d="M3 3h8l-1.5 2.5L11 8H3z"
        fill={isOutline ? "none" : "currentColor"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function Avatar({
  kind = "human",
  name = "",
  size = 18,
}: {
  kind?: ActorType;
  name?: string | null;
  size?: number;
}) {
  const initial = (name || (kind === "agent" ? "AI" : kind === "system" ? "SY" : "?"))
    .slice(0, kind === "agent" || kind === "system" ? 2 : 1)
    .toUpperCase();
  return (
    <span
      className={`avatar avatar--${kind}`}
      style={{ width: size, height: size, fontSize: size <= 18 ? 9 : 11 } as CSSProperties}
      title={`${kind}${name ? `: ${name}` : ""}`}
    >
      {initial}
    </span>
  );
}

export function LabelChip({ label }: { label: string }) {
  return (
    <span className="label-chip">
      <span className="label-chip__dot" style={{ background: labelColor(label) }} />
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__title">{title}</div>
      <div className="empty-state__body">{body}</div>
      {action}
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
