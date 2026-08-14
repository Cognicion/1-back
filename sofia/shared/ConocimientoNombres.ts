export interface PartesNombre {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  confianza: "alta" | "media" | "baja";
  requiereRevision: boolean;
  regla: string;
}

export const NOMBRES_COMUNES = Object.freeze([
  "Aldo", "Ana", "Antonio", "Brian", "Carlos", "Carmen", "Cecilio",
  "Diana", "Efrain", "Enedina", "Fernanda", "Fernando", "Filemon",
  "Guadalupe", "Jorge", "Jose", "Juan", "Luis", "Maria", "Ulises", "Victor", "Yolanda"
]);

export const APELLIDOS_COMUNES = Object.freeze([
  "Aguilar", "Castillo", "Cruz", "Diaz", "Flores", "Garcia", "Gomez",
  "Gonzalez", "Hernandez", "Lopez", "Martinez", "Morales", "Navarro",
  "Ortiz", "Perez", "Ramirez", "Reyes", "Rodriguez", "Sanchez", "Torres", "Vargas"
]);

const PARTICULAS_APELLIDO = new Set(["de", "del", "la", "las", "los", "san", "santa"]);
const normalizar = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function separarNombre(fullName = ""): PartesNombre {
  const original = fullName.trim().replace(/\s+/g, " ");
  const tokens = original.split(" ").filter(Boolean);
  const nombres = new Set(NOMBRES_COMUNES.map(normalizar));
  const apellidos = new Set(APELLIDOS_COMUNES.map(normalizar));

  if (!tokens.length) return { nombres: "", apellidoPaterno: "", apellidoMaterno: "", confianza: "baja", requiereRevision: true, regla: "nombre-vacio" };
  if (tokens.length < 3) return { nombres: tokens[0], apellidoPaterno: tokens[1] || "", apellidoMaterno: "", confianza: "baja", requiereRevision: true, regla: "nombre-incompleto" };

  const comma = original.split(",").map((part) => part.trim()).filter(Boolean);
  if (comma.length === 2) {
    const surnames = comma[0].split(" ");
    return { nombres: comma[1], apellidoPaterno: surnames[0] || "", apellidoMaterno: surnames.slice(1).join(" "), confianza: "alta", requiereRevision: false, regla: "apellidos-antes-de-coma" };
  }

  const firstIsGiven = nombres.has(normalizar(tokens[0]));
  const lastTwoAreSurnames = tokens.slice(-2).filter((token) => apellidos.has(normalizar(token))).length >= 1;
  if (firstIsGiven || lastTwoAreSurnames) {
    let paternalStart = tokens.length - 2;
    if (paternalStart > 0 && PARTICULAS_APELLIDO.has(normalizar(tokens[paternalStart - 1]))) paternalStart -= 1;
    return { nombres: tokens.slice(0, paternalStart).join(" "), apellidoPaterno: tokens.slice(paternalStart, tokens.length - 1).join(" "), apellidoMaterno: tokens[tokens.length - 1], confianza: firstIsGiven && lastTwoAreSurnames ? "alta" : "media", requiereRevision: true, regla: "nombres-primero-por-diccionario" };
  }

  return { nombres: original, apellidoPaterno: "", apellidoMaterno: "", confianza: "baja", requiereRevision: true, regla: "orden-ambiguo" };
}
