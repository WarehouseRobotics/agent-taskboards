import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copyTextToClipboard } from "../../lib/clipboard";
import { Mono } from "../ui";

type TopbarCrumb = {
  label: string;
  id?: string;
  icon?: ReactNode;
  glyph?: string;
  idCopyLabel?: string;
  idCopyText?: string;
};

export function Topbar({
  actions,
  crumbs,
}: {
  actions?: ReactNode;
  crumbs: TopbarCrumb[];
}) {
  const [copiedCrumbKey, setCopiedCrumbKey] = useState<string | null>(null);
  const copiedCrumbTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedCrumbTimeout.current) {
        window.clearTimeout(copiedCrumbTimeout.current);
      }
    };
  }, []);

  const flashCopiedCrumb = useCallback((crumbKey: string) => {
    if (copiedCrumbTimeout.current) {
      window.clearTimeout(copiedCrumbTimeout.current);
    }

    setCopiedCrumbKey(null);
    window.requestAnimationFrame(() => {
      setCopiedCrumbKey(crumbKey);
      copiedCrumbTimeout.current = window.setTimeout(() => setCopiedCrumbKey(null), 850);
    });
  }, []);

  const copyCrumbId = useCallback(
    async (crumbKey: string, copyText: string) => {
      if (await copyTextToClipboard(copyText)) {
        flashCopiedCrumb(crumbKey);
      }
    },
    [flashCopiedCrumb],
  );

  return (
    <header className="topbar">
      <div className="breadcrumbs">
        {crumbs.map((crumb, index) => {
          const crumbKey = `${crumb.label}-${index}`;
          const copyable = Boolean(crumb.id && crumb.idCopyText);

          return (
            <span className="breadcrumb" key={crumbKey}>
              {index > 0 && <span className="breadcrumb__sep">/</span>}
              {crumb.glyph && <span className="project-glyph">{crumb.glyph}</span>}
              {crumb.icon}
              <span className="breadcrumb__label">{crumb.label}</span>
              {crumb.id && copyable ? (
                <button
                  aria-label={crumb.idCopyLabel ?? `Copy reference for ${crumb.label}`}
                  className={copiedCrumbKey === crumbKey ? "breadcrumb__id-copy breadcrumb__id-copy--copied mono" : "breadcrumb__id-copy mono"}
                  onClick={() => void copyCrumbId(crumbKey, crumb.idCopyText ?? "")}
                  title={crumb.idCopyLabel ?? `Copy reference for ${crumb.label}`}
                  type="button"
                >
                  {crumb.id}
                </button>
              ) : crumb.id ? (
                <Mono faded>{crumb.id}</Mono>
              ) : null}
            </span>
          );
        })}
      </div>
      {actions && <div className="topbar__actions">{actions}</div>}
    </header>
  );
}
