/**
 * Estructura anonimizada derivada del DOCX real usado en la regresión.
 * Conserva orden, headings compuestos y continuidad entre páginas; no contiene
 * nombres, diagnósticos reales ni texto clínico del documento fuente.
 */
export const REAL_ANALYSIS_ORDER_FIXTURE = Object.freeze([
  { tipo: "paragraph", texto: "NOTA DE EVOLUCIÓN", origen: "body" },
  { tipo: "paragraph", texto: "Fecha: 01/01/2026 Hora: 08:00", origen: "body" },
  { tipo: "paragraph", texto: "DIAGNÓSTICOS", origen: "body" },
  { tipo: "paragraph", texto: "Diagnóstico anonimizado.", origen: "body" },
  { tipo: "paragraph", texto: "PLAN TERAPÉUTICO", origen: "body" },
  { tipo: "paragraph", texto: "Continuar manejo.", origen: "body" },
  { tipo: "paragraph", texto: "ANÁLISIS Y JUSTIFICACIÓN DIAGNÓSTICA Y TERAPÉUTICA", origen: "body" },
  { tipo: "paragraph", texto: "Análisis anonimizado de la evolución.", origen: "body" },
  { tipo: "paragraph", texto: "PRONÓSTICO", origen: "body" },
  { tipo: "paragraph", texto: "Reservado.", origen: "body" },

  { tipo: "paragraph", texto: "NOTA DE EVOLUCIÓN", origen: "body" },
  { tipo: "paragraph", texto: "Fecha: 02/01/2026 Hora: 08:00", origen: "body" },
  { tipo: "paragraph", texto: "PLAN TERAPÉUTICO", origen: "body", pageIndex: 0 },
  { tipo: "paragraph", texto: "Plan al final de página.", origen: "body", pageIndex: 0 },
  { tipo: "paragraph", texto: "ANÁLISIS Y JUSTIFICACIÓN DIAGNÓSTICA Y TERAPÉUTICA", origen: "body", pageIndex: 1 },
  { tipo: "paragraph", texto: "Análisis al inicio de página siguiente.", origen: "body", pageIndex: 1 },
  { tipo: "paragraph", texto: "PRONÓSTICO", origen: "body", pageIndex: 1 },
  { tipo: "paragraph", texto: "Reservado.", origen: "body", pageIndex: 1 },

  { tipo: "paragraph", texto: "NOTA DE EVOLUCIÓN", origen: "body" },
  { tipo: "paragraph", texto: "Fecha: 03/01/2026 Hora: 08:00", origen: "body" },
  { tipo: "paragraph", texto: "ANÁLISIS Y JUSTIFICACIÓN DIAGNÓSTICA Y TERAPÉUTICA", origen: "body" },
  { tipo: "paragraph", texto: "Análisis breve.", origen: "body" },
  { tipo: "paragraph", texto: "PRONÓSTICO", origen: "body" },
  { tipo: "paragraph", texto: "Reservado.", origen: "body" },

  { tipo: "paragraph", texto: "NOTA DE EVOLUCIÓN", origen: "body" },
  { tipo: "paragraph", texto: "Fecha: 04/01/2026 Hora: 08:00", origen: "body" },
  { tipo: "paragraph", texto: "ANÁLISIS Y JUSTIFICACIÓN DIAGNÓSTICA Y TERAPÉUTICA", origen: "body" },
  { tipo: "paragraph", texto: "Análisis largo anonimizado. Segunda oración interpretativa. Tercera observación clínica de prueba.", origen: "body" },
  { tipo: "paragraph", texto: "PRONÓSTICO", origen: "body" },
  { tipo: "paragraph", texto: "Reservado.", origen: "body" }
]);
