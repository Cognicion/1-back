const REEMPLAZOS_SEGUROS = [
  [/\bnuevo párrafo\b/gi, "\n\n"],
  [/\bnueva línea\b/gi, "\n"],
  [/\bpunto y aparte\b/gi, ".\n\n"],
  [/\bdos puntos\b/gi, ":"],
  [/\bpunto y coma\b/gi, ";"],
  [/\bcoma\b/gi, ","],
  [/\bpunto\b/gi, "."],
  [/\babrir paréntesis\b/gi, "("],
  [/\bcerrar paréntesis\b/gi, ")"],
  [/\bmiligramos\b/gi, "mg"],
  [/\bmiligramo\b/gi, "mg"],
  [/\bmicrogramos\b/gi, "mcg"],
  [/\bmicrogramo\b/gi, "mcg"],
  [/\bgramos\b/gi, "g"],
  [/\bgrado[s]? centígrados\b/gi, "°C"],
  [/\bgrado[s]? celsius\b/gi, "°C"],
  [/\bmedia tableta\b/gi, "½ tableta"],
  [/\bun cuarto de tableta\b/gi, "¼ tableta"],
  [/\btres cuartos de tableta\b/gi, "¾ tableta"],
  [/\bcada ocho horas\b/gi, "cada 8 h"],
  [/\bcada doce horas\b/gi, "cada 12 h"],
  [/\bcada veinticuatro horas\b/gi, "cada 24 h"],
  [/\bvía oral\b/gi, "VO"],
  [/\bpor razón necesaria\b/gi, "PRN"],
  [/\bideacion suicida\b/gi, "ideación suicida"],
  [/\bdiagnostico\b/gi, "diagnóstico"],
  [/\bclinico\b/gi, "clínico"],
  [/\bexploracion\b/gi, "exploración"],
  [/\bevolucion\b/gi, "evolución"]
];

const NUMEROS = {
  cero: 0,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100
};

export function normalizarComparacion(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
}

function capitalizarPrimera(texto = "") {
  const limpio = String(texto || "").trim();
  if (!limpio) return "";
  return limpio.charAt(0).toLocaleUpperCase("es-MX") + limpio.slice(1);
}

function normalizarNumerosSimples(texto = "", cambios = []) {
  return texto.replace(
    new RegExp(`\\b(${Object.keys(NUMEROS).join("|")})\\s+(mg|mcg|g|miligramos|microgramos|gramos)\\b`, "gi"),
    (coincidencia, numero, unidad) => {
      const valor = NUMEROS[String(numero).toLowerCase()];
      const unidadNormalizada = unidad.toLowerCase().startsWith("micro") ? "mcg"
        : unidad.toLowerCase().startsWith("gram") ? "g"
        : "mg";
      cambios.push({
        original: coincidencia,
        normalizado: `${valor} ${unidadNormalizada}`,
        confianza: "media",
        razon: "Conversión de número simple a cifra."
      });
      return `${valor} ${unidadNormalizada}`;
    }
  );
}

export function normalizarTextoClinicoConservador(texto = "") {
  let salida = String(texto || "").trim();
  const cambios = [];

  salida = normalizarNumerosSimples(salida, cambios);
  REEMPLAZOS_SEGUROS.forEach(([patron, reemplazo]) => {
    salida = salida.replace(patron, (coincidencia) => {
      if (coincidencia === reemplazo) return coincidencia;
      cambios.push({
        original: coincidencia,
        normalizado: reemplazo,
        confianza: "alta",
        razon: "Normalización clínica conservadora."
      });
      return reemplazo;
    });
  });

  salida = salida
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    originalText: String(texto || ""),
    normalizedText: capitalizarPrimera(salida),
    transformations: cambios
  };
}

export function aplicarComandosDeVozSeguros(texto = "") {
  const comandos = [];
  let salida = String(texto || "");

  if (/\bpausar dictado\b/i.test(salida)) {
    comandos.push({ type: "pause", phrase: "pausar dictado" });
    salida = salida.replace(/\bpausar dictado\b/gi, "");
  }

  if (/\breanudar dictado\b/i.test(salida)) {
    comandos.push({ type: "resume", phrase: "reanudar dictado" });
    salida = salida.replace(/\breanudar dictado\b/gi, "");
  }

  if (/\bdeshacer última frase\b/i.test(salida) || /\bborrar última frase\b/i.test(salida)) {
    comandos.push({ type: "undo-last-sentence", phrase: "deshacer última frase" });
    salida = salida
      .replace(/\bdeshacer última frase\b/gi, "")
      .replace(/\bborrar última frase\b/gi, "");
  }

  const normalizado = normalizarTextoClinicoConservador(salida);
  return {
    ...normalizado,
    commands: comandos
  };
}
