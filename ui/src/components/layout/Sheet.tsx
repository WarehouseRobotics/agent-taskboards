import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Icon } from "../ui";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Sheet({
  children,
  onCancel,
  title,
}: {
  children: ReactNode;
  onCancel: () => void;
  title: string;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const pointerStartedOnBackdropRef = useRef(false);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(sheetRef.current);
      (focusable[0] ?? sheetRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartedOnBackdropRef.current && event.target === event.currentTarget) {
      onCancel();
    }
    pointerStartedOnBackdropRef.current = false;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(sheetRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      sheetRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="sheet-backdrop" onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <aside aria-labelledby={titleId} aria-modal="true" className="sheet" ref={sheetRef} role="dialog" tabIndex={-1}>
        <header className="sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button aria-label="Close" className="icon-btn" onClick={onCancel} title="Close" type="button">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}
