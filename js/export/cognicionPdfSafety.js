const CLAVES_TEXTO_CONOCIDAS = Object.freeze([
  "texto",
  "nombre",
  "descripcion",
  "diagnostico",
  "valor",
  "label"
]);

export function esRegistroPdfCognicion(valor) {
  return Boolean(
    valor &&
    typeof valor === "object" &&
    !Array.isArray(valor) &&
    !(valor instanceof Date)
  );
}

export function textoSeguroPdfCognicion(valor, visitados = new WeakSet()) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor === "boolean" || typeof valor === "bigint") return String(valor);
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? "" : valor.toISOString();
  if (typeof valor !== "object") return "";
  if (visitados.has(valor)) return "";
  visitados.add(valor);
  if (Array.isArray(valor)) {
    return valor.map((item) => textoSeguroPdfCognicion(item, visitados)).filter(Boolean).join("\n");
  }

  for (const clave of CLAVES_TEXTO_CONOCIDAS) {
    try {
      if (!(clave in valor) || valor[clave] === valor) continue;
      const texto = textoSeguroPdfCognicion(valor[clave], visitados);
      if (texto) return texto;
    } catch {
      // Un getter defectuoso no debe impedir exportar el resto de la nota.
    }
  }
  return "";
}

function fechaDesdeValorPdfCognicion(valor) {
  if (valor instanceof Date) return valor;
  if (valor && typeof valor.toDate === "function") {
    try {
      return fechaDesdeValorPdfCognicion(valor.toDate());
    } catch {
      return null;
    }
  }
  if (esRegistroPdfCognicion(valor) && Number.isFinite(Number(valor.seconds))) {
    return new Date(Number(valor.seconds) * 1000);
  }
  return null;
}

function fechaLocalDdMmAaaa(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return "";
  const pad = (numero) => String(numero).padStart(2, "0");
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

export function fechaSeguraPdfCognicion(valor) {
  const fechaObjeto = fechaDesdeValorPdfCognicion(valor);
  if (fechaObjeto) return fechaLocalDdMmAaaa(fechaObjeto);

  const texto = textoSeguroPdfCognicion(valor).trim();
  const coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  return coincidencia ? `${coincidencia[3]}/${coincidencia[2]}/${coincidencia[1]}` : texto;
}

export async function esperarConTimeoutPdfCognicion(promesa, timeoutMs = 4000) {
  let temporizador = null;
  const espera = Math.max(0, Number(timeoutMs) || 0);
  const limite = new Promise((resolve) => {
    temporizador = setTimeout(() => resolve({ estado: "timeout" }), espera);
  });
  const resultado = await Promise.race([
    Promise.resolve(promesa).then(
      (valor) => ({ estado: "ok", valor }),
      (error) => ({ estado: "error", error })
    ),
    limite
  ]);
  if (temporizador !== null) clearTimeout(temporizador);
  return resultado;
}
