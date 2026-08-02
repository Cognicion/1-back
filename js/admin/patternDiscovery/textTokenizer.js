const CAMPOS_META = /^(id|uid|uuid|path|ruta|url|email|correo|telefono|tel|curp|rfc|timestamp|createdat|updatedat|fecha|hora|version|estado|rol|sexo|edad|nombre|apellido|expediente|pacienteid|pacienteuid|medicouid|institucionid)$/i;
const TOKEN_INVALIDO = /^(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[a-z0-9]{20,}|\+?\d[\d\s().-]{7,})$/i;

export function extraerTextosClinicos(valor, ruta = "", salida = []) {
  if (valor === null || valor === undefined) return salida;
  if (typeof valor === "string") {
    const clave = ruta.split(".").pop() || "";
    if (!CAMPOS_META.test(clave) && valor.trim()) salida.push({ campo: ruta, texto: valor });
    return salida;
  }
  if (typeof valor !== "object") return salida;
  if (typeof valor.toDate === "function" || typeof valor.seconds === "number") return salida;
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => extraerTextosClinicos(item, `${ruta}[${indice}]`, salida));
    return salida;
  }
  Object.entries(valor).forEach(([clave, item]) => {
    if (!CAMPOS_META.test(clave)) extraerTextosClinicos(item, ruta ? `${ruta}.${clave}` : clave, salida);
  });
  return salida;
}

export function normalizarTexto(texto = "") {
  return String(texto)
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”"'`´]/g, " ")
    .replace(/[^a-z0-9áéíóúüñ\s-]/gi, " ")
    .replace(/\s+/g, " ").trim();
}

export function tokenizar(texto = "") {
  return normalizarTexto(texto).split(/\s+/).filter((token) => {
    if (token.length < 2 || TOKEN_INVALIDO.test(token)) return false;
    return !/^\d+$/.test(token);
  });
}

export function anonimizarTexto(texto = "") {
  return String(texto)
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[dato omitido]")
    .replace(/\+?\d[\d\s().-]{7,}/g, "[dato omitido]")
    .replace(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}\b/g, "[persona]");
}
