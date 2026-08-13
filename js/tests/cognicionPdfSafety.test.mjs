import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  esRegistroPdfCognicion,
  esperarConTimeoutPdfCognicion,
  fechaSeguraPdfCognicion,
  textoSeguroPdfCognicion
} from "../export/cognicionPdfSafety.js";

const notaJs = await readFile(new URL("../nota.js", import.meta.url), "utf8");

function extraerFuncion(codigo, nombre) {
  let inicio = codigo.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `No se encontró ${nombre}`);
  if (codigo.slice(Math.max(0, inicio - 6), inicio) === "async ") inicio -= 6;
  const finFirma = codigo.indexOf("\n", inicio);
  const apertura = codigo.lastIndexOf("{", finFirma);
  let profundidad = 0;
  for (let indice = apertura; indice < codigo.length; indice += 1) {
    if (codigo[indice] === "{") profundidad += 1;
    if (codigo[indice] === "}") profundidad -= 1;
    if (profundidad === 0) return codigo.slice(inicio, indice + 1);
  }
  throw new Error(`No se pudo extraer ${nombre}`);
}

test("el constructor real omite signos vitales null sin tocar el DOM", () => {
  const fuente = extraerFuncion(notaJs, "crearTablaSignosEvolucionPdfCognicion");
  const contexto = {
    esRegistroPdfCognicion,
    CAMPOS_SIGNOS_VITALES_PDF_COGNICION: [],
    valorConUnidadSignoVital() {
      throw new Error("No debe leer campos cuando los signos son null");
    },
    document: {
      createElement() {
        throw new Error("No debe construir una tabla para signos ausentes");
      }
    }
  };
  vm.runInNewContext(`${fuente}; resultadoNull = crearTablaSignosEvolucionPdfCognicion(null);`, contexto);
  assert.equal(contexto.resultadoNull, null);
  vm.runInNewContext("resultadoUndefined = crearTablaSignosEvolucionPdfCognicion(undefined);", contexto);
  assert.equal(contexto.resultadoUndefined, null);
  vm.runInNewContext("resultadoArray = crearTablaSignosEvolucionPdfCognicion([]);", contexto);
  assert.equal(contexto.resultadoArray, null);
});

test("la normalización conserva Unicode y evita [object Object]", () => {
  const unicode = "áéíóú ñ ü ¿¡ µ 🧠 \uD800";
  assert.equal(textoSeguroPdfCognicion(unicode), unicode);
  assert.equal(textoSeguroPdfCognicion(null), "");
  assert.equal(textoSeguroPdfCognicion(undefined), "");
  assert.equal(textoSeguroPdfCognicion(Number.NaN), "");
  assert.equal(textoSeguroPdfCognicion({ valor: 98 }), "98");
  assert.equal(textoSeguroPdfCognicion(["uno", null, "dos"]), "uno\ndos");
  assert.equal(textoSeguroPdfCognicion({ datoInesperado: "privado" }), "");
  assert.doesNotMatch(textoSeguroPdfCognicion({ datoInesperado: "privado" }), /\[object Object\]/);
  const ciclo = ["visible"];
  ciclo.push(ciclo);
  assert.equal(textoSeguroPdfCognicion(ciclo), "visible");
  const getterDefectuoso = {};
  Object.defineProperty(getterDefectuoso, "texto", { get: () => { throw new Error("getter inválido"); } });
  assert.equal(textoSeguroPdfCognicion(getterDefectuoso), "");
});

test("las fechas aceptan string, Date y formas de Timestamp de Firestore", () => {
  assert.equal(fechaSeguraPdfCognicion("2026-08-12"), "12/08/2026");
  assert.equal(fechaSeguraPdfCognicion(new Date(2026, 7, 12, 12)), "12/08/2026");
  assert.equal(
    fechaSeguraPdfCognicion({ toDate: () => new Date(2026, 7, 12, 12) }),
    "12/08/2026"
  );
  const segundos = Math.floor(new Date(2026, 7, 12, 12).getTime() / 1000);
  assert.equal(fechaSeguraPdfCognicion({ seconds: segundos, nanoseconds: 0 }), "12/08/2026");
  assert.equal(fechaSeguraPdfCognicion(null), "");
});

test("los registros y las esperas fallan de forma controlada", async () => {
  assert.equal(esRegistroPdfCognicion({}), true);
  assert.equal(esRegistroPdfCognicion(null), false);
  assert.equal(esRegistroPdfCognicion([]), false);
  assert.equal(esRegistroPdfCognicion(new Date()), false);

  assert.deepEqual(await esperarConTimeoutPdfCognicion(Promise.resolve("ok"), 20), {
    estado: "ok",
    valor: "ok"
  });
  assert.equal((await esperarConTimeoutPdfCognicion(Promise.reject(new Error("fallo")), 20)).estado, "error");
  assert.equal((await esperarConTimeoutPdfCognicion(new Promise(() => {}), 5)).estado, "timeout");
});

test("la espera de render termina de forma controlada si requestAnimationFrame se suspende", async () => {
  const fuenteRender = extraerFuncion(notaJs, "esperarRenderPdfCognicion");
  const advertencias = [];
  const contexto = {
    TIMEOUT_RECURSO_PDF_COGNICION_MS: 4000,
    requestAnimationFrame() {},
    esperarConTimeoutPdfCognicion: async (_promesa, milisegundos) => {
      assert.equal(milisegundos, 4000);
      return { estado: "timeout" };
    },
    console: {
      warn(_mensaje, detalles) {
        advertencias.push(detalles);
      }
    }
  };

  const ejecucion = vm.runInNewContext(
    `${fuenteRender}; esperarRenderPdfCognicion().then((valor) => { resultadoRender = valor; });`,
    contexto
  );
  await ejecucion;
  assert.equal(contexto.resultadoRender.estado, "timeout");
  assert.equal(advertencias.length, 1);
  assert.deepEqual({ ...advertencias[0] }, { estado: "timeout" });
});

test("la limpieza espera afterprint y no depende de focus en navegadores móviles", () => {
  const fuenteLimpieza = extraerFuncion(notaJs, "limpiarContenedorPdfCognicion");
  const fuenteProgramacion = extraerFuncion(notaJs, "programarLimpiezaPdfCognicion");
  const listeners = new Map();
  let temporizador = null;
  let removidos = 0;
  let claseRetirada = false;
  const contexto = {
    contenedorPdfCognicionActivo: { remove: () => { removidos += 1; } },
    manejadorAfterPrintCognicion: null,
    temporizadorLimpiezaPdfCognicion: null,
    TIMEOUT_LIMPIEZA_PDF_COGNICION_MS: 300000,
    window: {
      addEventListener(tipo, manejador) {
        listeners.set(tipo, manejador);
      },
      removeEventListener(tipo) {
        listeners.delete(tipo);
      },
      setTimeout(manejador, milisegundos) {
        temporizador = { manejador, milisegundos };
        return 73;
      },
      clearTimeout(identificador) {
        assert.equal(identificador, 73);
      }
    },
    document: {
      body: {
        classList: {
          remove(clase) {
            assert.equal(clase, "modo-impresion-cognicion");
            claseRetirada = true;
          }
        }
      }
    }
  };

  vm.runInNewContext(`${fuenteLimpieza}; ${fuenteProgramacion}; programarLimpiezaPdfCognicion();`, contexto);
  assert.equal(listeners.has("afterprint"), true);
  assert.equal(listeners.has("focus"), false);
  assert.equal(temporizador.milisegundos, 300000);
  assert.equal(removidos, 0);

  listeners.get("afterprint")();
  assert.equal(removidos, 1);
  assert.equal(claseRetirada, true);
  assert.equal(contexto.contenedorPdfCognicionActivo, null);
});

test("las trazas no incluyen valores clínicos ni identificadores", () => {
  const bloqueTraza = notaJs.slice(
    notaJs.indexOf("function trazarPdfCognicion"),
    notaJs.indexOf("function clonarNodoPdfCognicion")
  );
  assert.doesNotMatch(bloqueTraza, /pacienteActualDatos|uidPaciente|expediente|subjetivo|diagnostico/i);
  assert.doesNotMatch(bloqueTraza, /error\?\.message|(?:^|[,{]\s*)message\s*:|(?:^|[,{]\s*)stack\s*:/m);
  assert.match(bloqueTraza, /typeof error\?\.stack === "string"/);
  assert.match(bloqueTraza, /CODIGOS_ERROR_PDF_COGNICION\.has\(error\?\.code\)/);
  assert.match(bloqueTraza, /coincidenciaUbicacion\[1\]/);
  assert.match(notaJs, /trazarPdfCognicion\("datos-listos", \{[\s\S]*?tieneSignosVitales:[\s\S]*?diagnosticos:[\s\S]*?firmas:/);
  assert.doesNotMatch(notaJs, /trazarPdfCognicion\([^)]*(?:nombrePaciente|textoNota|expedienteId)/);

  const fuenteRegistro = extraerFuncion(notaJs, "registrarErrorPdfCognicion");
  const capturas = [];
  const contexto = {
    NOMBRES_ERROR_PDF_COGNICION: new Set(["Error", "TypeError"]),
    CODIGOS_ERROR_PDF_COGNICION: new Set(["PDF_EMPTY_DOCUMENT"]),
    errorMalicioso: {
      name: "TypeError",
      code: "UID-SECRETO",
      message: "Paciente Identificable",
      stack: "TypeError: Paciente Identificable\\n    at generarPDFNota (https://cognicionlabs.com/js/nota.js?v=UID-SECRETO:123:45)"
    },
    console: {
      error(...argumentos) {
        capturas.push(argumentos);
      }
    }
  };
  vm.runInNewContext(`${fuenteRegistro}; registrarErrorPdfCognicion("construccion", errorMalicioso);`, contexto);

  const salida = JSON.stringify(capturas);
  assert.doesNotMatch(salida, /Paciente Identificable|UID-SECRETO/);
  assert.match(salida, /nota\.js:123:45/);
});
