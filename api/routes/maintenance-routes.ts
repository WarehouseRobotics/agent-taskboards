import type { Express } from "express";
import type { ApiServices } from "../services/index.js";

export function registerMaintenanceRoutes(app: Express, services: ApiServices) {
  app.get("/api/maintenance/storage", (_req, res) => {
    res.json(services.maintenance.getStorageReport());
  });
}
