import type { Express } from "express";
import { parseQuery } from "../http/validation.js";
import { activityQuerySchema } from "../models/request-schemas.js";
import { serializeActivityFeedItem } from "../models/serializers.js";
import type { ApiServices } from "../services/index.js";

export function registerActivityRoutes(app: Express, services: ApiServices) {
  app.get("/api/activity", (req, res) => {
    const query = parseQuery(req, activityQuerySchema);
    const feed = services.activity.listProjectActivity(query);

    res.json({
      items: feed.items.map(serializeActivityFeedItem),
      hasMore: feed.hasMore,
      limit: feed.limit,
      offset: feed.offset,
      sort: feed.sort,
    });
  });
}
