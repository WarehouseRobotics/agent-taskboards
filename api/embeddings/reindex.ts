import { pathToFileURL } from "node:url";
import { closeDatabaseClient, getDatabaseClient } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { SearchService } from "../services/search-service.js";

export async function reindexEmbeddings() {
  runMigrations();
  const databaseClient = getDatabaseClient();
  const search = new SearchService(databaseClient);

  try {
    return await search.reindexAll({ force: true });
  } finally {
    closeDatabaseClient();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  reindexEmbeddings()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.errored > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
