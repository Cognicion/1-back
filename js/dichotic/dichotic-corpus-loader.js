import { validateDichoticCorpus } from "./dichotic-core.js";

export async function loadDichoticCorpus(url = "data/rehabilitacion/escucha-dicotica-pares.json") {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar el corpus (${response.status}).`);
  const corpus = await response.json();
  return {
    corpus,
    validation: validateDichoticCorpus(corpus)
  };
}

export async function validateDichoticAudioFiles(corpus, audioContext) {
  const issues = [];
  const pairs = Array.isArray(corpus?.pairs) ? corpus.pairs : [];
  for (const pair of pairs) {
    const left = await canDecodeAudio(pair.leftAudio, audioContext);
    const right = await canDecodeAudio(pair.rightAudio, audioContext);
    if (!left.ok) issues.push(`${pair.trialId}: no se pudo decodificar audio izquierdo (${left.error}).`);
    if (!right.ok) issues.push(`${pair.trialId}: no se pudo decodificar audio derecho (${right.error}).`);
  }
  return { ok: issues.length === 0, issues };
}

async function canDecodeAudio(url, audioContext) {
  try {
    if (!url) return { ok: false, error: "ruta vacia" };
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return { ok: false, error: "archivo vacio" };
    await audioContext.decodeAudioData(buffer.slice(0));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "error de decodificacion" };
  }
}
