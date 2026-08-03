export function normalizeDocxBlocks(blocks = []) {
  let blockIndex = 0;
  let tableIndex = 0;
  return blocks.map((block) => {
    const source = { blockIndex, origin: block.origen || block.source || "body" };
    blockIndex += 1;
    if (block.tipo === "table" || block.type === "table") {
      const currentTableIndex = tableIndex;
      tableIndex += 1;
      return {
        type: "table",
        rows: (block.filas || block.rows || []).map((row) => row.map((cell) => String(cell || ""))),
        source: { ...source, tableIndex: currentTableIndex }
      };
    }
    return {
      type: "paragraph",
      text: String(block.texto || block.text || ""),
      source
    };
  }).filter((block) => block.type === "table" || block.text);
}

export function flattenNormalizedBlocks(blocks = []) {
  return blocks.flatMap((block) => {
    if (block.type === "paragraph") return [{ text: block.text, source: block.source }];
    return block.rows.map((row, rowIndex) => ({
      text: row.join(" | "),
      source: { ...block.source, rowIndex }
    }));
  }).filter((item) => item.text);
}

export function normalizedBlocksToText(blocks = []) {
  return flattenNormalizedBlocks(blocks).map((item) => item.text).join("\n");
}
