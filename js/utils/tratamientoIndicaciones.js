const ENCABEZADOS_CLINICOS = /^(tratamiento farmacol[oó]gico actual|indicaciones vigentes|tratamiento e indicaciones)\s*:?\s*$/i;
const CONTEXTO_MEDICAMENTO_CONDICIONADO = /\b(en caso de|si presenta|cuando|seg[uú]n necesidad|prn|rescate|negativismo|condicionad[oa])\b/i;

export function limpiarNumeracionClinica(texto = "") {
  return String(texto)
    .replace(/^\s*(?:[-•]\s*)?\d+[.)-]*\s*/, "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();
}

export function normalizarClaveMedicamento(texto = "") {
  return limpiarNumeracionClinica(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\btomar\b/g, " ")
    .replace(/[()[\]{}.,;:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoDesdeObjeto(valor = {}) {
  return valor.indicacion
    || valor.texto
    || valor.descripcion
    || valor.nombre
    || valor.medicamento
    || "";
}

function lineasDesdeTexto(texto = "") {
  if (texto === null || texto === undefined || texto === false) return [];
  const valor = String(texto).trim();
  if (!valor || /^(?:null|undefined)$/i.test(valor)) return [];

  return valor
    .replace(/\r\n?/g, "\n")
    .split(/\n|(?=\s+\d+[.)]\s+)/)
    .map((linea) => {
      const original = String(linea);
      return {
        texto: limpiarNumeracionClinica(original),
        numerada: /^\s*\d+[.)-]*\s+/.test(original)
      };
    })
    .filter(({ texto }) => texto && !ENCABEZADOS_CLINICOS.test(texto));
}

function lineasNormalizadas(valor) {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => lineasNormalizadas(item));
  }

  if (valor && typeof valor === "object") {
    const texto = textoDesdeObjeto(valor);
    if (texto) return lineasDesdeTexto(texto);

    const lista = valor.indicaciones || valor.items || valor.tratamientos;
    return lista ? lineasNormalizadas(lista) : [];
  }

  return lineasDesdeTexto(valor);
}

function esEncabezadoMedicacionCondicionada(texto = "") {
  const normalizado = String(texto).trim();
  return /\bmedicamentos?\b/i.test(normalizado)
    && CONTEXTO_MEDICAMENTO_CONDICIONADO.test(normalizado);
}

function agruparMedicacionCondicionada(lineas = []) {
  const resultado = [];

  for (let indice = 0; indice < lineas.length; indice += 1) {
    const linea = lineas[indice];
    if (!esEncabezadoMedicacionCondicionada(linea.texto)) {
      resultado.push({ texto: linea.texto, condicionada: CONTEXTO_MEDICAMENTO_CONDICIONADO.test(linea.texto) });
      continue;
    }

    const componentes = [linea.texto.replace(/:\s*$/, "")];
    let cursor = indice + 1;
    while (cursor < lineas.length && !lineas[cursor].numerada) {
      componentes.push(lineas[cursor].texto);
      cursor += 1;
    }
    resultado.push({
      texto: componentes.join(": ").replace(/:\s*:/g, ":"),
      condicionada: true
    });
    indice = cursor - 1;
  }

  return resultado;
}

export function normalizarEntradasClinicas(valor) {
  return agruparMedicacionCondicionada(lineasNormalizadas(valor));
}

export function deduplicarEntradasClinicas(entradas = []) {
  const vistos = new Set();
  return entradas.filter((entrada) => {
    const clave = normalizarClaveMedicamento(entrada?.texto ?? entrada);
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function numeroDosis(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? "").trim().replace(/,/g, ".");
  if (!texto) return 0;
  const fraccionesUnicode = { "¼": 0.25, "½": 0.5, "¾": 0.75 };
  if (fraccionesUnicode[texto]) return fraccionesUnicode[texto];
  const mixto = texto.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixto) {
    const denominador = Number(mixto[3]);
    return denominador ? Number(mixto[1]) + (Number(mixto[2]) / denominador) : 0;
  }
  const fraccion = texto.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraccion) {
    const denominador = Number(fraccion[2]);
    return denominador ? Number(fraccion[1]) / denominador : 0;
  }
  const numero = texto.match(/\d+(?:\.\d+)?/);
  return numero ? Number(numero[0]) : 0;
}

function numeroLegible(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";
  if (Number.isInteger(numero)) return String(numero);
  return String(Number(numero.toFixed(3)));
}

function normalizarUnidadDosis(unidad = "") {
  const texto = String(unidad || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/µ/g, "u")
    .toLowerCase()
    .trim();
  if (/^(?:mcg|ug|microgramos?)$/.test(texto)) return "mcg";
  if (/^(?:mg|miligramos?)$/.test(texto)) return "mg";
  if (/^(?:g|gramos?)$/.test(texto)) return "g";
  if (/^(?:ml|mililitros?)$/.test(texto)) return "mL";
  if (/^(?:ui|u|unidad(?:es)? internacional(?:es)?)$/.test(texto)) return "UI";
  return "";
}

function extraerMedidaDosis(valor = "") {
  const coincidencia = String(valor || "").match(
    /(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[¼½¾])\s*(microgramos?|mcg|µg|ug|miligramos?|mg|gramos?|g|mililitros?|ml|unidad(?:es)?\s+internacional(?:es)?|ui|u)\b/i
  );
  if (!coincidencia) return null;
  const cantidad = numeroDosis(coincidencia[1]);
  const unidad = normalizarUnidadDosis(coincidencia[2]);
  return cantidad > 0 && unidad ? { cantidad, unidad } : null;
}

function normalizarUnidadAdministracion(unidad = "") {
  const unidadDosis = normalizarUnidadDosis(unidad);
  if (unidadDosis) return unidadDosis;
  return String(unidad || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/s$/, "");
}

function extraerConcentracionTratamiento(tratamiento = {}) {
  const valorEstructurado = numeroDosis(
    tratamiento.concentracionValor
    ?? tratamiento.strengthValue
    ?? tratamiento.dosisValor
  );
  const unidadEstructurada = normalizarUnidadDosis(
    tratamiento.concentracionUnidad
    || tratamiento.strengthUnit
    || tratamiento.dosisUnidad
  );
  const porValorEstructurado = numeroDosis(
    tratamiento.concentracionPorValor
    ?? tratamiento.strengthPerValue
  );
  const porUnidadEstructurada = normalizarUnidadDosis(
    tratamiento.concentracionPorUnidad
    || tratamiento.strengthPerUnit
  );
  if (valorEstructurado > 0 && unidadEstructurada) {
    return {
      valor: valorEstructurado,
      unidad: unidadEstructurada,
      porValor: porValorEstructurado || 1,
      porUnidad: porUnidadEstructurada
    };
  }

  const presentacionCatalogo = tratamiento.catalogPresentationMatch;
  const fuentes = [
    tratamiento.presentacion,
    tratamiento.selectedPresentationText,
    presentacionCatalogo?.texto,
    presentacionCatalogo?.text,
    tratamiento.medicamento,
    tratamiento.dosis
  ].filter(Boolean);

  for (const fuente of fuentes) {
    const texto = String(fuente);
    const proporcion = texto.match(
      /(\d+(?:[.,]\d+)?)\s*(microgramos?|mcg|µg|ug|miligramos?|mg|gramos?|g|unidad(?:es)?\s+internacional(?:es)?|ui|u)\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(mililitros?|ml)\b/i
    );
    if (proporcion) {
      return {
        valor: numeroDosis(proporcion[1]),
        unidad: normalizarUnidadDosis(proporcion[2]),
        porValor: numeroDosis(proporcion[3] || "1") || 1,
        porUnidad: normalizarUnidadDosis(proporcion[4])
      };
    }
    const medida = extraerMedidaDosis(texto);
    if (medida) return { valor: medida.cantidad, unidad: medida.unidad, porValor: 1, porUnidad: "" };
  }
  return null;
}

function frecuenciaVecesDia(tratamiento = {}) {
  const directa = numeroDosis(tratamiento.vecesDia ?? tratamiento.timesPerDay);
  if (directa > 0) return directa;
  const texto = String(tratamiento.frecuencia || tratamiento.frequency || "").toLowerCase();
  const palabras = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
  const porPalabra = texto.match(/\b(una|uno|dos|tres|cuatro|cinco|seis)\s+veces?\b/);
  if (porPalabra) return palabras[porPalabra[1]] || 0;
  const porNumero = texto.match(/\b(\d+(?:[.,]\d+)?)\s+veces?\b/);
  if (porNumero) return numeroDosis(porNumero[1]);
  const intervalo = texto.match(/cada\s+(\d+(?:[.,]\d+)?)\s*horas?/);
  if (intervalo) {
    const horas = numeroDosis(intervalo[1]);
    return horas > 0 ? 24 / horas : 0;
  }
  if (/cada\s*24\s*h|una\s+vez\s+al\s+dia/.test(texto.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return 1;
  return 0;
}

function frecuenciaVariable(tratamiento = {}) {
  return /\b(?:prn|sos|segun necesidad|a demanda|rescate)\b/i.test(
    String(tratamiento.frecuencia || tratamiento.frequency || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}

function entradasAdministracion(tratamiento = {}) {
  return [tratamiento.tomas, tratamiento.horarios, tratamiento.schedule]
    .find((valor) => Array.isArray(valor) && valor.length) || [];
}

function cantidadAdministracion(entrada) {
  const valor = entrada && typeof entrada === "object"
    ? entrada.cantidad ?? entrada.quantity ?? entrada.administrationQuantity
    : entrada;
  const unidad = entrada && typeof entrada === "object"
    ? entrada.unidad || entrada.unit || entrada.administrationUnit || ""
    : "";
  const medida = extraerMedidaDosis(valor);
  const cantidad = medida?.cantidad || numeroDosis(valor);
  if (!(cantidad > 0)) return null;
  return {
    cantidad,
    unidad: medida?.unidad || normalizarUnidadAdministracion(unidad),
    esMedidaFarmacologica: Boolean(medida && medida.unidad !== "mL")
  };
}

function textoDosisDiaria(cantidad, unidad) {
  const numero = numeroLegible(cantidad);
  return numero && unidad ? `${numero} ${unidad}/día` : "";
}

function textoUnidadesDiarias(cantidad, unidad = "unidad") {
  const numero = numeroLegible(cantidad);
  if (!numero) return "";
  const base = normalizarUnidadAdministracion(unidad) || "unidad";
  const etiqueta = base === "mL" || base === "UI"
    ? base
    : `${base}${Number(cantidad) === 1 ? "" : "s"}`;
  return `${numero} ${etiqueta}/día`;
}

function normalizarDosisDiariaExplicita(valor = "", tratamiento = {}) {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor).trim();
  if (!texto || /^(?:null|undefined|nan)$/i.test(texto)) return "";
  texto = texto
    .replace(/(\d)\s*(mcg|µg|mg|g|ml|ui)\b/gi, "$1 $2")
    .replace(/µg/gi, "mcg")
    .replace(/\bml\b/g, "mL")
    .replace(/\bui\b/gi, "UI")
    .replace(/\s*(?:\/\s*d[ií]a|por\s+d[ií]a|al\s+d[ií]a|diarios?)\b/i, "/día")
    .replace(/\s*\/\s*día/i, "/día")
    .replace(/\s+/g, " ")
    .trim();

  const concentracion = extraerConcentracionTratamiento(tratamiento);
  const soloNumero = texto.match(/^\d+(?:[.,]\d+)?$/);
  if (soloNumero) {
    const cantidad = numeroDosis(soloNumero[0]);
    const unidadExplicita = normalizarUnidadDosis(
      tratamiento.dosisTotalDiaUnidad
      || tratamiento.totalDailyDoseUnit
      || tratamiento.dosisUnidad
    );
    if (unidadExplicita) return textoDosisDiaria(cantidad, unidadExplicita);
    if (concentracion && !concentracion.porUnidad) {
      return textoDosisDiaria(cantidad * concentracion.valor, concentracion.unidad);
    }
    return textoUnidadesDiarias(cantidad, tratamiento.unidadAdministracion);
  }
  const unidades = texto.match(/^(\d+(?:[.,]\d+)?)\s+unidad(?:es)?\/día$/i);
  if (unidades && concentracion && !concentracion.porUnidad) {
    return textoDosisDiaria(numeroDosis(unidades[1]) * concentracion.valor, concentracion.unidad);
  }
  if (!/\/día$/i.test(texto) && /\b(?:mcg|mg|g|mL|UI|tabletas?|c[aá]psulas?|gotas?|unidad(?:es)?)\b/i.test(texto)) {
    texto = `${texto}/día`;
  }
  return texto;
}

export function obtenerDosisDiariaTratamiento(tratamiento = {}) {
  if (!tratamiento || typeof tratamiento !== "object") return "";
  const explicita = tratamiento.dosisTotalDia ?? tratamiento.dosisDia ?? tratamiento.totalDailyDose;
  const textoExplicito = normalizarDosisDiariaExplicita(explicita, tratamiento);
  if (textoExplicito) return textoExplicito;
  if (numeroDosis(tratamiento.totalDailyDoseMg) > 0) {
    return textoDosisDiaria(numeroDosis(tratamiento.totalDailyDoseMg), "mg");
  }
  if (frecuenciaVariable(tratamiento)) return "dosis diaria variable (PRN)";

  const concentracion = extraerConcentracionTratamiento(tratamiento);
  const cantidades = entradasAdministracion(tratamiento)
    .map(cantidadAdministracion)
    .filter(Boolean);
  if (cantidades.length) {
    const mismaUnidad = cantidades.every((item) => item.unidad === cantidades[0].unidad);
    const total = cantidades.reduce((suma, item) => suma + item.cantidad, 0);
    if (mismaUnidad && cantidades.every((item) => item.esMedidaFarmacologica)) {
      return textoDosisDiaria(total, cantidades[0].unidad);
    }
    if (mismaUnidad && cantidades[0].unidad === "mL") {
      if (concentracion?.porUnidad === "mL") {
        return textoDosisDiaria(total * (concentracion.valor / concentracion.porValor), concentracion.unidad);
      }
      return textoDosisDiaria(total, "mL");
    }
    if (concentracion && !concentracion.porUnidad) {
      return textoDosisDiaria(total * concentracion.valor, concentracion.unidad);
    }
    return textoUnidadesDiarias(total, cantidades[0].unidad);
  }

  const cantidadTotal = numeroDosis(tratamiento.cantidadTotalDia);
  if (cantidadTotal > 0) {
    if (concentracion && !concentracion.porUnidad) {
      return textoDosisDiaria(cantidadTotal * concentracion.valor, concentracion.unidad);
    }
    return textoUnidadesDiarias(cantidadTotal, tratamiento.unidadAdministracion);
  }

  const veces = frecuenciaVecesDia(tratamiento);
  const cantidadPorToma = numeroDosis(tratamiento.cantidadPorToma ?? tratamiento.administrationQuantity);
  if (cantidadPorToma > 0 && veces > 0) {
    const cantidadDia = cantidadPorToma * veces;
    if (concentracion && !concentracion.porUnidad) {
      return textoDosisDiaria(cantidadDia * concentracion.valor, concentracion.unidad);
    }
    return textoUnidadesDiarias(cantidadDia, tratamiento.unidadAdministracion);
  }

  const dosisPorToma = extraerMedidaDosis(tratamiento.dosis || tratamiento.dose || "");
  if (dosisPorToma && veces > 0) {
    return textoDosisDiaria(dosisPorToma.cantidad * veces, dosisPorToma.unidad);
  }
  return "";
}

export function formatearResumenDiarioTratamiento(tratamiento = {}, nombrePreferido = "") {
  if (!tratamiento || typeof tratamiento !== "object") return "";
  const nombre = String(
    nombrePreferido
    || tratamiento.medicamento
    || tratamiento.nombreMedicamento
    || tratamiento.genericName
    || tratamiento.nombre
    || ""
  ).trim().replace(/[.\s]+$/, "");
  if (!nombre || /^(?:null|undefined)$/i.test(nombre)) return "";
  const dosis = obtenerDosisDiariaTratamiento(tratamiento);
  return dosis ? `${nombre} ${dosis}` : `${nombre} — dosis diaria no registrada`;
}

function normalizarMedicamentos(medicamentosActivos) {
  return deduplicarEntradasClinicas(normalizarEntradasClinicas(medicamentosActivos))
    .map(({ texto }) => texto);
}

function normalizarIndicaciones(indicacionesEstructuradas, medicamentos = []) {
  const clavesMedicamentos = new Set(medicamentos.map(normalizarClaveMedicamento));
  return deduplicarEntradasClinicas(normalizarEntradasClinicas(indicacionesEstructuradas))
    .filter(({ texto, condicionada }) => {
      if (condicionada) return true;
      return !clavesMedicamentos.has(normalizarClaveMedicamento(texto));
    })
    .map(({ texto }) => texto);
}

export function construirTratamientoEIndicaciones({
  medicamentosActivos,
  indicacionesEstructuradas,
  tratamientoTextoLegado
} = {}) {
  const medicamentos = normalizarMedicamentos(medicamentosActivos);
  const indicacionesNormalizadas = normalizarIndicaciones(indicacionesEstructuradas, medicamentos);
  const tieneIndicacionesEstructuradas = indicacionesNormalizadas.length > 0;

  if (tieneIndicacionesEstructuradas) {
    return {
      medicamentos,
      indicaciones: indicacionesNormalizadas,
      contenidoResumen: deduplicarEntradasClinicas(
        normalizarEntradasClinicas([...medicamentos, ...indicacionesNormalizadas])
      ).map(({ texto }) => texto),
      origen: "estructurado",
      tieneIndicacionesEstructuradas: true
    };
  }

  if (medicamentos.length) {
    return {
      medicamentos,
      indicaciones: [...medicamentos],
      contenidoResumen: [...medicamentos],
      origen: "medicamentos",
      tieneIndicacionesEstructuradas: false
    };
  }

  const legado = deduplicarEntradasClinicas(normalizarEntradasClinicas(tratamientoTextoLegado))
    .map(({ texto }) => texto);
  return {
    medicamentos: [],
    indicaciones: legado,
    contenidoResumen: legado,
    origen: legado.length ? "legado" : "vacio",
    tieneIndicacionesEstructuradas: false
  };
}
