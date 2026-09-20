import { buildNamedReferenceText } from "../../lib/entity-reference";

export function buildBoardReferenceText(boardName: string, boardId: string) {
  return buildNamedReferenceText(boardName, boardId);
}
