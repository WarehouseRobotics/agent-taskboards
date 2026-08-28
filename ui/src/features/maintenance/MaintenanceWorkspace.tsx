import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "../../components/layout";
import {
  Button,
  EmptyState,
  Icon,
  InlineError,
  Mono,
  SkeletonRows,
} from "../../components/ui";
import type { MaintenanceStorageReport } from "../../domain/types";
import { api } from "../../lib/api";
import { apiMessage } from "../../lib/errors";
import { formatBytes, formatDate } from "../../lib/format";
import { maintenanceStorageRows } from "./maintenance-storage";

export function MaintenanceWorkspace() {
  const [report, setReport] = useState<MaintenanceStorageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStorage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.maintenanceStorage());
    } catch (cause) {
      setError(apiMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStorage();
  }, [loadStorage]);

  const rows = useMemo(
    () => (report ? maintenanceStorageRows(report) : []),
    [report],
  );

  return (
    <>
      <Topbar
        actions={
          <Button
            disabled={loading}
            icon={<Icon name="refresh" />}
            onClick={loadStorage}
            variant="ghost"
          >
            Refresh
          </Button>
        }
        crumbs={[{ label: "Maintenance", icon: <Icon name="database" /> }]}
      />
      <div className="workspace-pane workspace-pane--maintenance">
        <div className="maintenance-pane">
          <header className="maintenance-header">
            <div>
              <h1>Database usage</h1>
              <p>
                Attributable SQLite record payload and allocated embedding
                capacity, grouped by project and board.
              </p>
            </div>
            {report && (
              <Mono faded>Calculated {formatDate(report.calculatedAt)}</Mono>
            )}
          </header>

          <InlineError message={error} />

          {loading && !report && <SkeletonRows />}

          {!loading && !report && (
            <EmptyState
              action={
                <Button onClick={loadStorage} variant="outline">
                  Try again
                </Button>
              }
              body="The database usage report could not be loaded."
              title="Storage report unavailable"
            />
          )}

          {report && (
            <>
              <section aria-label="Database summary" className="maintenance-stats">
                <StorageStat
                  detail={`${report.database.pageCount.toLocaleString()} pages`}
                  label="Database"
                  value={report.database.databaseBytes}
                />
                <StorageStat
                  detail="canonical + embeddings"
                  label="Active"
                  value={report.active.totalBytes}
                />
                <StorageStat
                  detail="inherited archive state"
                  label="Archived"
                  value={report.archived.totalBytes}
                />
                <StorageStat
                  detail={`${formatBytes(report.database.freeBytes)} free`}
                  label="Other / overhead"
                  value={report.database.unattributedBytes}
                />
              </section>

              <section className="maintenance-section">
                <div className="maintenance-section__heading">
                  <div>
                    <h2>Projects and boards</h2>
                    <Mono faded>{report.database.path}</Mono>
                  </div>
                  <Mono faded>{rows.length} scopes</Mono>
                </div>

                {rows.length === 0 ? (
                  <EmptyState
                    body="Create a project and board to begin attributing database usage."
                    title="No project data"
                  />
                ) : (
                  <div className="storage-table-wrap">
                    <div className="storage-table" role="table">
                      <div className="storage-table__header" role="row">
                        <span role="columnheader">Scope</span>
                        <span role="columnheader">Active data</span>
                        <span role="columnheader">Active embeddings</span>
                        <span role="columnheader">Archived data</span>
                        <span role="columnheader">Archived embeddings</span>
                        <span role="columnheader">Total</span>
                      </div>
                      {rows.map((row) => (
                        <div
                          className={`storage-table__row storage-table__row--${row.kind}`}
                          key={row.key}
                          role="row"
                        >
                          <div
                            className="storage-table__scope"
                            data-depth={row.depth}
                            role="cell"
                          >
                            <span className="storage-table__name">
                              {row.name}
                              {row.archivedAt && (
                                <span className="storage-table__archived">Archived</span>
                              )}
                            </span>
                            <Mono faded>{row.id}</Mono>
                          </div>
                          <ByteValue value={row.usage.active.dataBytes} />
                          <ByteValue value={row.usage.active.embeddingBytes} />
                          <ByteValue value={row.usage.archived.dataBytes} />
                          <ByteValue value={row.usage.archived.embeddingBytes} />
                          <ByteValue strong value={row.usage.totalBytes} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <p className="maintenance-note">
                Estimates exclude SQLite indexes, record headers, page padding,
                and uploaded file contents. Allocated sqlite-vec chunks are
                included even when their reserved capacity is unused. Other /
                overhead includes those exclusions, schema and vector metadata,
                and free pages.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StorageStat({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: number;
}) {
  return (
    <div className="maintenance-stat">
      <span>{label}</span>
      <ByteText value={value} />
      <small>{detail}</small>
    </div>
  );
}

function ByteValue({ strong = false, value }: { strong?: boolean; value: number }) {
  return (
    <div className="storage-table__bytes" role="cell">
      {strong ? (
        <strong>
          <ByteText value={value} />
        </strong>
      ) : (
        <ByteText value={value} />
      )}
    </div>
  );
}

function ByteText({ value }: { value: number }) {
  const exact = `${value.toLocaleString()} bytes`;
  return (
    <span aria-label={exact} className="mono" title={exact}>
      {formatBytes(value)}
    </span>
  );
}
