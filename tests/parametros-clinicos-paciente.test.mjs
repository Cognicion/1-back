import test from "node:test";
import assert from "node:assert/strict";

import {
  VERSION_PARAMETROS_CLINICOS,
  categoriaEgfr,
  categoriaUacr,
  construirRegistroParametrosClinicos,
  resolverParametrosClinicosPaciente,
} from "../js/services/parametrosClinicosPaciente.js";

test("normaliza creatinina en µmol/L y eGFR desde campos directos", () => {
  const resultado = resolverParametrosClinicosPaciente({
    creatinina: { valor: "88,4", unidad: "µmol/L" },
    egfr: "47",
  });

  assert.equal(resultado.porId.creatinina.valor, 88.4);
  assert.equal(resultado.porId.creatinina.unidad, "µmol/L");
  assert.equal(resultado.porId.eGFR.valor, 47);
  assert.equal(resultado.valoresCanonicos.creatininaMgDl, 1);
  assert.equal(resultado.valoresCanonicos.eGFR, 47);
  assert.equal(resultado.categorias.eGFR.id, "G3a");
});

test("aplica los límites KDIGO de eGFR", () => {
  const casos = [
    [90, "G1"],
    [89.9, "G2"],
    [60, "G2"],
    [59.9, "G3a"],
    [45, "G3a"],
    [44.9, "G3b"],
    [30, "G3b"],
    [29.9, "G4"],
    [15, "G4"],
    [14.9, "G5"],
  ];

  for (const [valor, categoria] of casos) {
    assert.equal(categoriaEgfr(valor)?.id, categoria, `eGFR ${valor}`);
  }

  assert.equal(categoriaEgfr(-1), null);
  assert.equal(categoriaEgfr(null), null);
});

test("aplica los límites KDIGO de UACR en mg/g y mg/mmol", () => {
  const casos = [
    [29.9, "mg/g", "A1"],
    [30, "mg/g", "A2"],
    [300, "mg/g", "A2"],
    [300.1, "mg/g", "A3"],
    [2.9, "mg/mmol", "A1"],
    [3, "mg/mmol", "A2"],
    [30, "mg/mmol", "A2"],
    [30.1, "mg/mmol", "A3"],
  ];

  for (const [valor, unidad, categoria] of casos) {
    assert.equal(categoriaUacr(valor, unidad)?.id, categoria, `UACR ${valor} ${unidad}`);
  }

  assert.equal(categoriaUacr(-1, "mg/g"), null);
  assert.equal(categoriaUacr(null, "mg/g"), null);
});

test("solo clasifica bajo/alto cuando el laboratorio aporta un rango", () => {
  const sinRango = resolverParametrosClinicosPaciente({
    albumina: { valor: 2.8, unidad: "g/dL" },
    eGFR: { valor: 42, unidad: "mL/min/1.73 m²" },
  });

  assert.equal(sinRango.porId.albumina.estado, "no_clasificado");
  assert.equal(sinRango.porId.eGFR.estado, "no_clasificado");
  assert.equal(sinRango.categorias.eGFR.id, "G3b");
  assert.deepEqual(sinRango.hallazgos, []);

  const conRango = resolverParametrosClinicosPaciente({
    albumina: {
      valor: 2.8,
      unidad: "g/dL",
      rangoReferencia: "3.5 - 5.0",
    },
  });

  assert.equal(conRango.porId.albumina.estado, "bajo");
  assert.equal(conRango.porId.albumina.rangoReferencia, "3.5 - 5.0");
  assert.equal(conRango.hallazgos.length, 1);
  assert.equal(conRango.hallazgos[0].parametroId, "albumina");
  assert.equal(conRango.hallazgos[0].estado, "bajo");
});

test("convierte g/L y g/dL al derivar globulinas y relación A:G", () => {
  const derivado = resolverParametrosClinicosPaciente({
    proteinasTotales: { valor: 70, unidad: "g/L" },
    albumina: { valor: 4, unidad: "g/dL" },
  });

  assert.equal(derivado.valoresCanonicos.proteinasTotalesGdl, 7);
  assert.equal(derivado.valoresCanonicos.albuminaGdl, 4);
  assert.equal(derivado.valoresCanonicos.globulinasGdl, 3);
  assert.equal(derivado.derivados.globulinasCalculadas.valor, 3);
  assert.equal(derivado.derivados.globulinasCalculadas.unidad, "g/dL");
  assert.equal(derivado.derivados.globulinasCalculadas.derivado, true);
  assert.equal(derivado.derivados.relacionAlbuminaGlobulina.valor, 1.33);

  const unidadesMixtas = resolverParametrosClinicosPaciente({
    proteinasTotales: { valor: 7, unidad: "g/dL" },
    albumina: { valor: 40, unidad: "g/L" },
    globulinas: { valor: 30, unidad: "g/L" },
  });

  assert.equal(unidadesMixtas.valoresCanonicos.albuminaGdl, 4);
  assert.equal(unidadesMixtas.valoresCanonicos.globulinasGdl, 3);
  assert.equal(unidadesMixtas.derivados.relacionAlbuminaGlobulina.valor, 1.33);
});

test("lee registros estructurados con la forma usada por ECG y conserva el más reciente", () => {
  const resultado = resolverParametrosClinicosPaciente({
    laboratorios: [
      {
        analito: "Creatinina",
        valor: 1.4,
        unidad: "mg/dL",
        rangoReferencia: "0.6 - 1.3",
        fecha: "2026-08-01",
      },
      {
        analito: "Creatinina sérica",
        valor: 1.1,
        unidad: "mg/dL",
        rangoReferencia: "0.6 - 1.3",
        fecha: "2026-08-20",
      },
      {
        analito: "Potasio",
        valor: 3.2,
        unidad: "mmol/L",
        rangoReferencia: "3.5 - 5.1",
        fecha: "2026-08-20",
      },
    ],
  });

  assert.equal(resultado.porId.creatinina.valor, 1.1);
  assert.equal(resultado.porId.creatinina.fecha, "2026-08-20T00:00:00.000Z");
  assert.equal(resultado.porId.creatinina.origen, "laboratorio_estructurado_1");
  assert.equal(resultado.porId.potasio.valor, 3.2);
  assert.equal(resultado.porId.potasio.estado, "bajo");
  assert.equal(resultado.porId.potasio.origen, "laboratorio_estructurado_1");
});

test("un registro estructurado prevalece sobre un alias raíz legacy", () => {
  const resultado = resolverParametrosClinicosPaciente({
    creatinina: { valor: 0.9, unidad: "mg/dL" },
    laboratorios: [
      {
        analito: "Creatinina",
        valor: 2.1,
        unidad: "mg/dL",
        fecha: "2026-09-03",
      },
    ],
  });

  assert.equal(resultado.porId.creatinina.valor, 2.1);
  assert.equal(resultado.porId.creatinina.origen, "laboratorio_estructurado_1");
  assert.equal(resultado.valoresCanonicos.creatininaMgDl, 2.1);
});

test("el bloque versionado de parámetros prevalece sobre registros y aliases legacy", () => {
  const resultado = resolverParametrosClinicosPaciente({
    creatinina: { valor: 0.9, unidad: "mg/dL" },
    laboratorios: [{ analito: "Creatinina", valor: 2.1, unidad: "mg/dL", fecha: "2026-09-03" }],
    parametrosClinicos: {
      valores: {
        creatinina: { valor: 1.2, unidad: "mg/dL", fecha: "2026-09-04" },
      },
    },
  });

  assert.equal(resultado.porId.creatinina.valor, 1.2);
  assert.equal(resultado.porId.creatinina.origen, "campo:parametrosClinicos.valores.creatinina");
});

test("detecta incoherencia entre proteínas totales y la suma albúmina + globulinas", () => {
  const resultado = resolverParametrosClinicosPaciente({
    proteinasTotales: { valor: 7, unidad: "g/dL" },
    albumina: { valor: 4.5, unidad: "g/dL" },
    globulinas: { valor: 1.8, unidad: "g/dL" },
  });

  const hallazgo = resultado.hallazgos.find(
    (item) => item.id === "parametros_proteinas_no_concilian",
  );

  assert.ok(hallazgo);
  assert.equal(hallazgo.estado, "dato_inconsistente");
  assert.equal(hallazgo.diferencia, 0.7);
  assert.equal(hallazgo.unidad, "g/dL");
});

test("construye un registro persistible, estable y sin parámetros desconocidos", () => {
  const registro = construirRegistroParametrosClinicos(
    {
      creatinina: {
        valor: "1,15",
        unidad: "mg/dL",
        rangoReferencia: "0.6 - 1.2",
      },
      eGFR: 72,
      albumina: {
        value: 4.2,
        unidad: "g/dL",
        fecha: "2026-08-31",
        origen: "importado",
      },
      parametroDesconocido: 123,
    },
    {
      fecha: "2026-09-01",
      origen: "captura_manual",
      actualizadoEn: "2026-09-01T12:00:00.000Z",
    },
  );

  assert.equal(registro.versionEsquema, VERSION_PARAMETROS_CLINICOS);
  assert.equal(registro.actualizadoEn, "2026-09-01T12:00:00.000Z");
  assert.equal(registro.fechaMuestra, "2026-09-01");
  assert.equal(registro.origen, "captura_manual");
  assert.deepEqual(
    {
      analyteId: registro.valores.creatinina.analyteId,
      valor: registro.valores.creatinina.valor,
      unidad: registro.valores.creatinina.unidad,
      rangoReferencia: registro.valores.creatinina.rangoReferencia,
      fecha: registro.valores.creatinina.fecha,
      origen: registro.valores.creatinina.origen,
      muestra: registro.valores.creatinina.muestra,
    },
    {
      analyteId: "creatinina",
      valor: 1.15,
      unidad: "mg/dL",
      rangoReferencia: "0.6 - 1.2",
      fecha: "2026-09-01",
      origen: "captura_manual",
      muestra: "suero/plasma",
    },
  );
  assert.equal(registro.valores.eGFR.valor, 72);
  assert.equal(registro.valores.eGFR.unidad, "mL/min/1.73 m²");
  assert.equal(registro.valores.albumina.valor, 4.2);
  assert.equal(registro.valores.albumina.fecha, "2026-08-31");
  assert.equal(registro.valores.albumina.origen, "importado");
  assert.equal("parametroDesconocido" in registro.valores, false);
  assert.deepEqual(JSON.parse(JSON.stringify(registro)), registro);
});
