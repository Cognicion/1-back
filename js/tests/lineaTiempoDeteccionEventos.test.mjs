import assert from "node:assert/strict";
import {
  crearFuenteClinicaComun,
  detectarEventosEnFuentes,
  generarFragmentosTemporales
} from "../lineaTiempo/lineaTiempoDeteccionEventos.js";

function fuente(texto, fechaDocumento = "2026-07-20", extra = {}) {
  return crearFuenteClinicaComun({
    origenId: extra.origenId || "nota-1",
    origenTipo: extra.origenTipo || "nota",
    origenSubtipo: extra.origenSubtipo || "Nota de evolucion",
    fechaDocumento,
    tituloDocumento: extra.tituloDocumento || "Nota de evolucion",
    datos: { contenido: texto, ...extra.datos }
  });
}

function detectar(fuentes, opts = {}) {
  return detectarEventosEnFuentes({
    fuentes: Array.isArray(fuentes) ? fuentes : [fuentes],
    fechaNacimiento: opts.fechaNacimiento || null,
    pacienteId: "paciente-prueba",
    incluirEstructurados: opts.incluirEstructurados === true
  });
}

{
  const resultado = detectar(fuente("Ingresó al hospital el 10/10/2024."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, "2024-10-10");
}

{
  const resultado = detectar(fuente("Hace una semana presentó una crisis de ansiedad.", "2026-07-20"));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, "2026-07-13");
  assert.equal(resultado.eventos[0].origenDeteccion, "narrativo");
}

{
  const resultado = detectar(fuente("Presentó ideación suicida la semana pasada.", "2026-07-20"));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].tituloSugerido, "Ideacion suicida");
  assert.notEqual(resultado.eventos[0].tituloSugerido, "Intento suicida");
}

{
  const resultado = detectar(fuente("Presentó conductas sexuales de riesgo e ideación suicida."));
  assert.equal(resultado.eventosNormalizados, 2);
  assert.deepEqual(resultado.eventos.map((e) => e.tituloSugerido).sort(), ["Conductas sexuales de riesgo", "Ideacion suicida"]);
  assert.equal(resultado.eventos.every((e) => e.fechaInicioISO === null), true);
}

{
  const resultado = detectar(fuente("En 2022 inició tratamiento psiquiátrico."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, "2022-01-01");
  assert.equal(resultado.eventos[0].precisionTemporal, "anio");
}

{
  const resultado = detectar(
    fuente("Comenzó a consumir alcohol a los 14 años."),
    { fechaNacimiento: new Date(2000, 4, 10, 12) }
  );
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, "2014-01-01");
}

{
  const resultado = detectar(fuente("Se realizó resonancia magnética el 15 de marzo de 2025."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, "2025-03-15");
  assert.equal(resultado.eventos[0].categoriaSugerida, "estudio_gabinete");
}

{
  const resultado = detectar(fuente("Niega hospitalizaciones previas."));
  assert.equal(resultado.eventosNormalizados, 0);
  assert.equal(resultado.eventosDescartados, 0);
}

{
  const resultado = detectar(fuente("Se valorará hospitalización la próxima semana."));
  assert.equal(resultado.eventosNormalizados, 0);
  assert.equal(resultado.eventosDescartados, 1);
  assert.equal(resultado.motivosDescarte.futuro_hipotetico, 1);
}

{
  const resultado = detectar(fuente("Inició sertralina en enero de 2024 y fue suspendida en marzo de 2024."));
  assert.equal(resultado.eventosNormalizados, 2);
  assert.deepEqual(resultado.eventos.map((e) => e.fechaInicioISO).sort(), ["2024-01-01", "2024-03-01"]);
  assert.deepEqual(resultado.eventos.map((e) => e.tituloSugerido).sort(), ["Inicio de sertralina", "Suspension de sertralina"]);
}

{
  const resultado = detectar(fuente("Refiere inicio del padecimiento hace 13 años. Última cita el 21/07/2026.", "2026-07-22"));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].tituloSugerido, "Inicio del padecimiento actual");
  assert.equal(resultado.eventos[0].fechaInicioISO, "2013-07-22");
  assert.equal(resultado.eventos[0].precisionTemporal, "anio");
  assert.match(resultado.eventos[0].descripcionSugerida, /padecimiento actual/i);
  assert.doesNotMatch(resultado.eventos[0].descripcionSugerida, /última cita|ultima cita/i);
}

{
  const resultado = detectar(fuente("Inició sertralina en marzo de 2024."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].tituloSugerido, "Inicio de sertralina");
  assert.notEqual(resultado.eventos[0].tituloSugerido, "Cambio de tratamiento");
}

{
  const resultado = detectar(fuente("Comenzó con aislamiento, insomnio y anhedonia en 2022."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].tituloSugerido, "Inicio de aislamiento, insomnio, anhedonia");
  assert.doesNotMatch(resultado.eventos[0].tituloSugerido, /depresi/i);
}

{
  const resultado = detectar(fuente("Intentó suicidarse mediante ingesta medicamentosa el 10/05/2020."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].tituloSugerido, "Intento suicida mediante ingesta medicamentosa");
  assert.equal(resultado.eventos[0].fechaInicioISO, "2020-05-10");
}

{
  const resultado = detectar(fuente("En el internamiento previo presentó agitación grave."));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].fechaInicioISO, null);
  assert.equal(resultado.eventos[0].precisionTemporal, "contextual");
  assert.equal(resultado.eventos[0].requiereRevisionFecha, true);
}

{
  const resultado = detectar(fuente("Inició consumo a los 15 años, fue hospitalizado en 2020 y suspendió tratamiento hace tres meses.", "2026-07-20"), {
    fechaNacimiento: new Date(2000, 0, 1, 12)
  });
  assert.equal(resultado.eventosNormalizados, 3);
  assert.deepEqual(resultado.eventos.map((e) => e.fechaInicioISO).sort(), ["2015-01-01", "2020-01-01", "2026-04-20"]);
}

{
  const resultado = detectar(fuente("Nota firmada el 20/07/2026."));
  assert.equal(resultado.eventosNormalizados, 0);
  assert.equal(resultado.administrativosDescartados, 1);
}

{
  const resultado = detectar(fuente("Hace diez años inició consumo.", "2026-07-20"));
  assert.equal(resultado.eventosNormalizados, 1);
  assert.equal(resultado.eventos[0].precisionTemporal, "anio");
  assert.equal(resultado.eventos[0].fechaEsAproximada, true);
}

{
  const estudio = crearFuenteClinicaComun({
    origenId: "estudio-1",
    origenTipo: "estudio",
    origenSubtipo: "resonancia",
    fechaDocumento: "2025-03-15",
    tituloDocumento: "Resonancia magnetica",
    datos: { nombre: "Resonancia magnetica", fecha: "2025-03-15", resultado: "Sin datos de lesion aguda." }
  });
  const resultado = detectar(estudio);
  assert.equal(resultado.eventosNormalizados, 0);
}

{
  const diagnosticoSinFechaClinica = crearFuenteClinicaComun({
    origenId: "dx-sin-fecha",
    origenTipo: "diagnostico",
    fechaDocumento: "2026-07-20",
    tituloDocumento: "Diagnosticos",
    datos: { diagnostico: "Depresión", createdAt: "2026-07-20" }
  });
  assert.equal(detectar(diagnosticoSinFechaClinica).eventosNormalizados, 0);
  assert.equal(detectar(diagnosticoSinFechaClinica, { incluirEstructurados: true }).eventosNormalizados, 0);
}

{
  const tratamientoSinFechaClinica = crearFuenteClinicaComun({
    origenId: "tx-sin-fecha",
    origenTipo: "tratamiento",
    fechaDocumento: "2026-07-20",
    tituloDocumento: "Tratamiento e indicaciones",
    datos: { medicamento: "Sertralina", createdAt: "2026-07-20" }
  });
  assert.equal(detectar(tratamientoSinFechaClinica).eventosNormalizados, 0);
  assert.equal(detectar(tratamientoSinFechaClinica, { incluirEstructurados: true }).eventosNormalizados, 0);
}

{
  const diagnostico = crearFuenteClinicaComun({
    origenId: "dx-1",
    origenTipo: "diagnostico",
    fechaDocumento: "2024-02-01",
    tituloDocumento: "Diagnosticos",
    datos: { codigo: "F32", nombre: "Episodio depresivo", fechaDiagnostico: "2024-02-01" }
  });
  const tratamiento = crearFuenteClinicaComun({
    origenId: "tx-1",
    origenTipo: "tratamiento",
    fechaDocumento: "2024-01-10",
    tituloDocumento: "Tratamiento e indicaciones",
    datos: { medicamento: "Sertralina", fechaInicioTratamiento: "2024-01-10", fechaSuspensionTratamiento: "2024-03-20" }
  });
  const resultado = detectar([diagnostico, tratamiento], { incluirEstructurados: true });
  assert.equal(resultado.eventosNormalizados, 3);
  assert.equal(resultado.eventos.filter((e) => e.relevanciaClinica === "estructurada").length, 3);
  assert.equal(resultado.eventos.filter((e) => e.origenDeteccion === "estructurado-clinico").length, 3);
}

{
  const f = fuente("Ingresó el 10/10/2024. Fue dado de alta el 15/10/2024.", "2024-10-16");
  assert.equal(generarFragmentosTemporales(f).length, 2);
}

console.log("lineaTiempoDeteccionEventos.test.mjs OK");
