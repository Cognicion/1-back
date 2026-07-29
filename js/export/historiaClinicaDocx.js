export async function descargarHistoriaClinicaDocx(modelo, nombre = "Historia_Clinica") {
  const { crearDocumentoWordFray } = await import("../services/frayDocx.js");
  const blob = crearDocumentoWordFray({
    titulo: "HISTORIA CLÍNICA", institucionSuperior: "COGNICIÓN LABS", institucionIntermedia: "HISTORIA CLÍNICA", institucion: "",
    paciente: { nombre: modelo.paciente.nombre, fechaNacimiento: modelo.paciente.fechaNacimiento, edad: modelo.paciente.edad, sexo: modelo.paciente.sexo, genero: modelo.paciente.genero, alergias: modelo.seguridad.alergias, cama: modelo.institucional.cama, expediente: modelo.institucional.expediente },
    servicio: modelo.institucional.servicio, fecha: new Date(modelo.generadoEn).toLocaleDateString("es-MX"), hora: new Date(modelo.generadoEn).toLocaleTimeString("es-MX", { hour:"2-digit", minute:"2-digit" }), vitales: { ...modelo.vitales, ...modelo.somatometria },
    secciones: modelo.secciones.filter((seccion) => seccion.kind === "text").map((seccion) => ({ titulo: seccion.titulo, contenido: seccion.data })), diagnosticos: modelo.diagnosticos, firmas: [modelo.medico]
  });
  const enlace = document.createElement("a"); enlace.href = URL.createObjectURL(blob); enlace.download = `${nombre}.docx`; enlace.click(); setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
