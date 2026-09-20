// The shared shape for pasteable references to a named object: a board, a
// project, or anything else the UI identifies by name plus id. Tasks have
// their own helper because they fall back between a draft and a saved title.
export function buildNamedReferenceText(name: string, id: string) {
  return `"${name.trim()}" ( id=${id} )`;
}
