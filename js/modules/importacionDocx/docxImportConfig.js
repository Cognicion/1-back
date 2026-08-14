export const DOCX_IMPORT_CONFIG = Object.freeze({
  maxFileSizeBytes: 12 * 1024 * 1024,
  allowedExtensions: [".docx"],
  allowedMimeTypes: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    ""
  ],
  storageRoot: "importacionesDocx",
  duplicateCollection: "importacionesDocx",
  duplicateUserSubcollection: "importacionesDocx"
});

export const FIELD_RULES = Object.freeze([
  { key: "nombre", label: "Nombre completo", aliases: ["nombre completo del paciente", "nombre del paciente", "nombre completo", "paciente", "nombre del usuario", "nombre del derechohabiente"] },
  { key: "nombres", label: "Nombre(s)", aliases: ["nombre o nombres", "nombre(s)", "nombres", "nombre"] },
  { key: "apellidoPaterno", label: "Apellido paterno", aliases: ["apellido paterno", "primer apellido"] },
  { key: "apellidoMaterno", label: "Apellido materno", aliases: ["apellido materno", "segundo apellido"] },
  { key: "alias", label: "Alias (opcional)", aliases: ["nombre preferido", "nombre social", "nombre elegido", "alias"] },
  { key: "edad", label: "Edad", aliases: ["edad"] },
  { key: "sexo", label: "Sexo", aliases: ["sexo"] },
  { key: "genero", label: "Genero", aliases: ["genero", "genero/sexo"] },
  { key: "fechaNacimiento", label: "Fecha de nacimiento", aliases: ["fecha de nacimiento", "fecha nacimiento", "nacimiento", "f. nacimiento"] },
  { key: "curp", label: "CURP", aliases: ["curp"] },
  { key: "expediente", label: "Numero de expediente", aliases: ["no. de expediente", "numero de expediente", "numero expediente", "no de expediente", "no. expediente", "num. expediente", "expediente"] },
  { key: "cama", label: "Numero de cama", aliases: ["no. de cama", "numero de cama", "numero cama", "no de cama", "cama"] },
  { key: "institucion", label: "Institucion", aliases: ["institucion", "unidad", "hospital"] },
  { key: "servicio", label: "Servicio", aliases: ["servicio", "area"] },
  { key: "fecha", label: "Fecha", aliases: ["fecha", "fecha de nota", "fecha de elaboracion"] },
  { key: "hora", label: "Hora", aliases: ["hora", "hora de nota"] },
  { key: "alergias", label: "Alergias", aliases: ["alergias", "alergia"] },
  { key: "diasEstancia", label: "Dias de estancia", aliases: ["dias de estancia en el servicio de observacion", "dias de estancia", "estancia"] },
  { key: "medicoTratante", label: "Medico tratante", aliases: ["medico tratante", "psiquiatra tratante", "medico responsable"] },
  { key: "medicoAdscrito", label: "Medico adscrito", aliases: ["medico adscrito", "adscrito", "medico adscrito encargado"] }
]);

export const SECTION_RULES = Object.freeze({
  motivoConsulta: ["motivo de consulta", "motivo de atencion", "motivo de ingreso"],
  padecimientoActual: ["padecimiento actual", "enfermedad actual", "subjetivo", "evolucion"],
  antecedentesHeredofamiliares: ["antecedentes heredofamiliares", "ahf"],
  antecedentesPersonales: ["antecedentes personales", "antecedentes personales patologicos", "antecedentes personales no patologicos", "antecedentes psiquiatricos", "consumo de sustancias", "app", "apnp"],
  objetivo: ["objetivo", "exploracion fisica", "exploracion fisica y neurologica"],
  examenMental: ["examen mental", "estado mental", "exploracion psicopatologica"],
  analisis: ["analisis", "comentario y analisis clinico", "impresion diagnostica"],
  diagnosticos: ["diagnosticos", "diagnostico", "dx"],
  tratamiento: ["tratamiento", "tratamiento actual", "medicamentos"],
  plan: ["plan", "plan terapeutico", "plan de manejo", "indicaciones"],
  pronostico: ["pronostico"],
  destino: ["destino"]
});

export const NOTE_TYPE_RULES = Object.freeze([
  { key: "historia_clinica", label: "Historia clinica", terms: ["historia clinica", "antecedentes heredofamiliares", "antecedentes personales"] },
  { key: "nota_inicial", label: "Nota inicial", terms: ["nota inicial", "primera vez", "valoracion inicial"] },
  { key: "nota_evolucion", label: "Nota de evolucion", terms: ["nota de evolucion", "evolucion", "subjetivo", "objetivo", "analisis", "plan"] },
  { key: "nota_ingreso", label: "Nota de ingreso", terms: ["nota de ingreso al servicio de observacion", "nota de ingreso", "ingreso a observacion", "nota inicial de ingreso", "ingreso hospitalario", "motivo de ingreso"] },
  { key: "nota_urgencias", label: "Nota de urgencias", terms: ["nota de urgencias", "urgencias", "triage"] },
  { key: "nota_egreso", label: "Nota de egreso", terms: ["nota de egreso", "alta", "egreso"] },
  { key: "interconsulta", label: "Interconsulta", terms: ["interconsulta", "servicio interconsultante", "pregunta clinica"] },
  { key: "psicologia", label: "Psicologia", terms: ["psicologia", "intervencion psicologica", "valoracion psicologica"] },
  { key: "trabajo_social", label: "Trabajo social", terms: ["trabajo social", "estudio socioeconomico", "red de apoyo"] },
  { key: "enfermeria", label: "Enfermeria", terms: ["enfermeria", "nota de enfermeria", "cuidados de enfermeria"] },
  { key: "estudios", label: "Estudios", terms: ["estudios", "gabinete", "laboratorio e imagen"] },
  { key: "documento_administrativo", label: "Documento administrativo", terms: ["documento administrativo", "consentimiento informado", "referencia", "contrarreferencia"] },
  { key: "solicitud_estudios", label: "Solicitud de estudios", terms: ["solicitud de estudios", "estudios solicitados"] },
  { key: "laboratorio", label: "Laboratorio", terms: ["laboratorio", "biometria hematica", "quimica sanguinea"] },
  { key: "imagenologia", label: "Imagenologia", terms: ["imagenologia", "tomografia", "resonancia", "rayos x"] }
]);
