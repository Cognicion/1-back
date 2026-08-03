export function textoBloque(bloque) {
  if (!bloque) return "";
  if (bloque.tipo === "paragraph") return bloque.texto || "";
  if (bloque.tipo === "table") return bloque.filas.map((fila) => fila.join(" | ")).join("\n");
  return "";
}

export function aplanarBloques(bloques = []) {
  return bloques.flatMap((bloque) => {
    if (bloque.tipo === "paragraph") return [{ tipo: "line", texto: bloque.texto || "", origen: bloque.origen || "body" }];
    if (bloque.tipo === "table") {
      return bloque.filas.map((fila) => ({
        tipo: "tableRow",
        texto: fila.join(" | "),
        celdas: fila,
        origen: bloque.origen || "body"
      }));
    }
    return [];
  }).filter((item) => item.texto.trim() || item.celdas?.length);
}

export function extraerParesTabla(bloques = []) {
  const pares = [];
  bloques
    .filter((bloque) => bloque.tipo === "table")
    .forEach((tabla) => {
      tabla.filas.forEach((fila) => {
        if (fila.length < 2) return;
        for (let index = 0; index < fila.length - 1; index += 2) {
          const etiqueta = String(fila[index] || "").trim();
          const valor = String(fila[index + 1] || "").trim();
          if (etiqueta && valor) pares.push({ etiqueta, valor, origen: "table" });
        }
      });
    });
  return pares;
}
