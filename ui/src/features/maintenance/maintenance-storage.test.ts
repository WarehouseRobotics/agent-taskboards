import { describe, expect, it } from "vitest";
import type { MaintenanceStorageReport } from "../../domain/types";
import { formatBytes } from "../../lib/format";
import { maintenanceStorageRows } from "./maintenance-storage";

describe("maintenance storage helpers", () => {
  it("flattens project aggregates followed by their board rows", () => {
    const report = {
      projects: [
        {
          id: "project-a",
          name: "Project A",
          archivedAt: null,
          active: bucket(10, 20),
          archived: bucket(30, 40),
          totalBytes: 100,
          boards: [
            {
              id: "board-a",
              name: "Board A",
              archivedAt: "2026-08-28T10:00:00.000Z",
              active: bucket(0, 0),
              archived: bucket(30, 40),
              totalBytes: 70,
            },
          ],
        },
      ],
    } satisfies Pick<MaintenanceStorageReport, "projects">;

    expect(maintenanceStorageRows(report)).toEqual([
      expect.objectContaining({
        key: "project-a",
        kind: "project",
        depth: 0,
        id: "project-a",
      }),
      expect.objectContaining({
        key: "project-a:board-a",
        kind: "board",
        depth: 1,
        id: "board-a",
        archivedAt: "2026-08-28T10:00:00.000Z",
      }),
    ]);
  });

  it("formats byte values using IEC units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(3.5 * 1024 ** 3)).toBe("3.5 GiB");
  });
});

function bucket(dataBytes: number, embeddingBytes: number) {
  return {
    dataBytes,
    embeddingBytes,
    totalBytes: dataBytes + embeddingBytes,
  };
}
