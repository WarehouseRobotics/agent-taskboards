import express from "express";
import { join, resolve } from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  const uiDistPath = resolve(process.cwd(), "dist/ui");

  app.use(express.static(uiDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(join(uiDistPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
