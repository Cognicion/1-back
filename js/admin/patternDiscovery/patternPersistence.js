const CLAVE = "cognicion_pattern_discovery_text_v1";
export function cargarIndice() { try { return JSON.parse(localStorage.getItem(CLAVE) || '{"notas":{}}'); } catch { return { notas: {} }; } }
export function guardarIndice(indice) { localStorage.setItem(CLAVE, JSON.stringify(indice)); }
export function actualizarNotaIndice(indice, nota) { indice.notas[nota.notaId] = nota; return indice; }
