CREATE TRIGGER IF NOT EXISTS `search_documents_after_delete_cleanup_vectors`
AFTER DELETE ON `search_documents`
BEGIN
  DELETE FROM `search_document_vectors`
  WHERE `search_document_id` = OLD.`id`;
END;
