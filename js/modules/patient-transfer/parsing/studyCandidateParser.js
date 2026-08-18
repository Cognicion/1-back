const SECTION_HEADING = /^(?:resultados?\s+(?:relevantes?\s+)?de\s+(?:los\s+)?estudios?(?:\s+de\s+diagn[oó]stico)?|estudios?\s+de\s+laboratorio\s+y\s+gabinete)\s*[:.\-]*$/i;

const STUDY_ALIASES = Object.freeze([
  { pattern: /^(?:ECG|EKG|electrocardiograma)\b/i, name: "Electrocardiograma", type: "Gabinete" },
  { pattern: /^(?:EEG|electroencefalograma)\b/i, name: "Electroencefalograma", type: "Gabinete" },
  { pattern: /^(?:Holter)\b/i, name: "Holter", type: "Gabinete" },
  { pattern: /^(?:TAC|TC|tomograf[ií]a(?:\s+axial\s+computarizada)?)\b/i, name: "Tomografía", type: "Gabinete" },
  { pattern: /^(?:RMN?|resonancia\s+magn[eé]tica)\b/i, name: "Resonancia magnética", type: "Gabinete" },
  { pattern: /^(?:RX|rayos?\s+x|radiograf[ií]a)\b/i, name: "Radiografía", type: "Gabinete" },
  { pattern: /^(?:USG|ultrasonido|ecograf[ií]a)\b/i, name: "Ultrasonido", type: "Gabinete" },
  { pattern: /^(?:biometr[ií]a\s+hem[aá]tica|hemograma)\b/i, name: "Biometría hemática", type: "Laboratorio" },
  { pattern: /^(?:qu[ií]mica\s+sangu[ií]nea)\b/i, name: "Química sanguínea", type: "Laboratorio" },
  { pattern: /^(?:EGO|examen\s+general\s+de\s+orina)\b/i, name: "Examen general de orina", type: "Laboratorio" },
  { pattern: /^(?:perfil\s+(?:tiroideo|hep[aá]tico|lip[ií]dico|renal))\b/i, name: "Perfil de laboratorio", type: "Laboratorio" },
  { pattern: /^(?:laboratorios?|resultados?\s+de\s+laboratorio)\b/i, name: "Estudios de laboratorio", type: "Laboratorio" }
]);

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeImportedStudyDate(value = "") {
  const source = String(value || "").trim();
  const iso = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = source.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (!local) return "";
  return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
}

function cleanStudyLine(value = "") {
  const source = String(value || "").trim();
  const numbered = /^\s*(?:(?:\d+|[a-z])[.)-]|[-•▪◦])\s*/i.test(source);
  return {
    text: source.replace(/^\s*(?:(?:\d+|[a-z])[.)-]|[-•▪◦])\s*/i, "").replace(/\s+/g, " ").trim(),
    numbered
  };
}

function identifyStudy(value = "") {
  for (const alias of STUDY_ALIASES) {
    const match = String(value || "").match(alias.pattern);
    if (match) return { ...alias, matchText: match[0] };
  }
  return null;
}

function studyBlocks(text = "") {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(cleanStudyLine)
    .filter((line) => line.text && !SECTION_HEADING.test(line.text));
  return lines.reduce((blocks, line) => {
    const explicitStudy = identifyStudy(line.text);
    if (!blocks.length || explicitStudy || line.numbered) {
      blocks.push({ text: line.text, descriptor: explicitStudy });
    } else {
      blocks[blocks.length - 1].text = `${blocks.at(-1).text} ${line.text}`.trim();
    }
    return blocks;
  }, []);
}

export function parseStudyCandidates({ text = "", documentId = "", noteId = "", clinicalDate = "" } = {}) {
  const fallbackDate = normalizeImportedStudyDate(clinicalDate);
  return studyBlocks(text).map((block, index) => {
    const descriptor = block.descriptor || identifyStudy(block.text);
    const inlineDate = normalizeImportedStudyDate(block.text);
    let result = block.text;
    if (descriptor?.matchText) result = result.slice(descriptor.matchText.length);
    result = result
      .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/, " ")
      .replace(/\b\d{4}-\d{2}-\d{2}\b/, " ")
      .replace(/^\s*[:.\-–—]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    const name = descriptor?.name || "Estudio diagnóstico";
    const type = descriptor?.type || "Otro";
    const identity = [documentId, noteId, index, normalizeText(name), inlineDate || fallbackDate].join("|");
    return {
      id: `${documentId || "doc"}-study-${stableHash(identity)}`,
      sourceIndex: index,
      name,
      type,
      date: inlineDate || fallbackDate,
      result: result || block.text,
      observations: "",
      sourceText: block.text,
      sourceSection: "resultadosEstudios",
      confidence: descriptor ? "high" : "medium",
      requiresReview: !descriptor,
      include: false,
      selectedForImport: false,
      confirmedByDoctor: false
    };
  });
}
