CREATE VIRTUAL TABLE `search_document_vectors` USING vec0(
  project_id TEXT PARTITION KEY,
  board_id TEXT PARTITION KEY,
  task_id TEXT PARTITION KEY,
  source_type TEXT PARTITION KEY,
  +search_document_id TEXT,
  embedding FLOAT[384]
);
