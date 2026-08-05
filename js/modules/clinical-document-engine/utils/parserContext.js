export function createParserContext({ documentId = "", noteId = "", sourceBlocks = [], pageIndex = null, parserVersion = "1.0" } = {}) {
  return { documentId, noteId, sourceBlocks: [...sourceBlocks], pageIndex, parserVersion };
}
