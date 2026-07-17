const CLAVE_PROYECTOS = "cognicion_neurofisiologia_proyectos";

export function listarProyectosLaboratorio() {
  return JSON.parse(localStorage.getItem(CLAVE_PROYECTOS) || "[]");
}

export function guardarProyectoLaboratorio(proyecto) {
  const proyectos = listarProyectosLaboratorio();
  const ahora = new Date().toISOString();
  const id = proyecto.id || `neuro_${Date.now()}`;
  const limpio = { ...proyecto, id, actualizadoEn: ahora, creadoEn: proyecto.creadoEn || ahora };
  const filtrados = proyectos.filter((p) => p.id !== id);
  filtrados.unshift(limpio);
  localStorage.setItem(CLAVE_PROYECTOS, JSON.stringify(filtrados.slice(0, 40)));
  return limpio;
}

export function eliminarProyectoLaboratorio(id) {
  const proyectos = listarProyectosLaboratorio().filter((p) => p.id !== id);
  localStorage.setItem(CLAVE_PROYECTOS, JSON.stringify(proyectos));
}

export function duplicarProyectoLaboratorio(id) {
  const proyecto = listarProyectosLaboratorio().find((p) => p.id === id);
  if (!proyecto) return null;
  return guardarProyectoLaboratorio({ ...proyecto, id: null, nombre: `${proyecto.nombre || "Proyecto"} copia` });
}

export function exportarCSVLaboratorio(filas = []) {
  const encabezados = Object.keys(filas[0] || { t: "", Vm: "" });
  const contenido = [encabezados.join(","), ...filas.map((fila) => encabezados.map((h) => JSON.stringify(fila[h] ? "")).join(","))].join("\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neurofisiologia_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}