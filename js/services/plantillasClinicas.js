function texto(valor = "") {
  return String(valor || "").trim();
}

function unir(partes = [], separador = " ") {
  return partes.map(texto).filter(Boolean).join(separador);
}

function frase(valor = "") {
  const limpio = texto(valor).replace(/[.]+$/, "");
  return limpio ? `${limpio}.` : "";
}

function sinPuntoFinal(valor = "") {
  return texto(valor).replace(/[.]+$/, "");
}

function describirPaciente(datos = {}) {
  const id = datos.identificacion || {};
  const elementos = [];
  if (id.sexo) elementos.push(id.sexo);
  if (id.edad) elementos.push(`${id.edad} años`);
  if (!elementos.length && id.texto) return frase(id.texto);
  if (!elementos.length) return "Paciente en valoracion psiquiatrica.";
  return `Paciente ${elementos.join(" de ")}.`;
}

function decadaVida(edad) {
  const numero = Number(edad);
  if (!Number.isFinite(numero) || numero <= 0) return "";
  const decada = Math.floor(numero / 10) + 1;
  const ordinales = {
    1: "primera",
    2: "segunda",
    3: "tercera",
    4: "cuarta",
    5: "quinta",
    6: "sexta",
    7: "septima",
    8: "octava",
    9: "novena"
  };
  return ordinales[decada] ? `${ordinales[decada]} decada de la vida` : "";
}

function sindromes(datos = {}) {
  const sintomas = datos.sintomas || {};
  const salida = [];
  if (sintomas.depresivos?.texto || sintomas.depresivos?.marcadores?.length) salida.push("sindrome depresivo con alteraciones afectivas y neurovegetativas");
  if (sintomas.ansiosos?.texto || sintomas.ansiosos?.marcadores?.length) salida.push("sintomatologia ansiosa clinicamente relevante");
  if (sintomas.psicoticos?.texto || sintomas.psicoticos?.marcadores?.length) salida.push("posibles alteraciones del contenido del pensamiento o de la sensopercepcion");
  if (sintomas.maniformes?.texto || sintomas.maniformes?.marcadores?.length) salida.push("datos de activacion afectiva o sintomas maniformes a descartar");
  if (datos.consumoSustancias?.texto || sintomas.sustancias?.marcadores?.length) salida.push("consumo de sustancias como factor diagnostico y pronostico");
  return salida;
}

export const PLANTILLAS_PADECIMIENTO = {
  observacionFray(datos = {}) {
    const p = datos.padecimientoActual || {};
    const partes = [describirPaciente(datos)];

    if (datos.antecedentesPsiquiatricos?.texto) {
      partes.push(`Cuenta con antecedente de ${sinPuntoFinal(datos.antecedentesPsiquiatricos.texto)}.`);
    }

    if (datos.hospitalizacionesPrevias?.texto) {
      partes.push(`Con hospitalizaciones previas referidas: ${sinPuntoFinal(datos.hospitalizacionesPrevias.texto)}.`);
    }

    if (datos.antecedentesMedicos?.texto) {
      partes.push(`Como antecedentes medicos relevantes se documenta ${sinPuntoFinal(datos.antecedentesMedicos.texto)}.`);
    }

    if (datos.tratamientoPrevio?.texto) {
      const adherencia = datos.tratamientoPrevio.adherencia ? `, con adherencia ${datos.tratamientoPrevio.adherencia}` : "";
      partes.push(`Ha recibido tratamiento previo o actual con ${sinPuntoFinal(datos.tratamientoPrevio.texto)}${adherencia}.`);
    }

    if (p.evolucionTemporal || p.motivoConsulta || p.texto) {
      const inicio = unir([
        p.evolucionTemporal ? `Inicia o se documenta evolucion ${p.evolucionTemporal}` : "",
        p.motivoConsulta ? `motivo por el cual ${p.motivoConsulta}` : "",
        p.texto && !p.evolucionTemporal ? p.texto : ""
      ], ", ");
      partes.push(frase(inicio.startsWith("Inicia") ? inicio : `Inicia su padecimiento actual con ${inicio}`));
    }

    if (datos.estresores?.texto) {
      partes.push(`El cuadro se presenta en contexto de ${sinPuntoFinal(datos.estresores.texto)}.`);
    }

    if (!p.texto && datos.sintomas?.actuales?.texto) {
      partes.push(`Durante la evolucion actual se identifican ${sinPuntoFinal(datos.sintomas.actuales.texto)}.`);
    }

    if (datos.conductaSuicida?.texto) {
      partes.push(`En el area de riesgo se refiere ${sinPuntoFinal(datos.conductaSuicida.texto)}.`);
    }

    if (datos.consumoSustancias?.texto) {
      partes.push(`Respecto al consumo de sustancias, se reporta ${sinPuntoFinal(datos.consumoSustancias.texto)}.`);
    } else if (datos.consumoSustancias?.noProblematico) {
      partes.push(`Respecto al consumo, se reporta ${sinPuntoFinal(datos.consumoSustancias.noProblematico)}.`);
    }

    if (datos.factoresProtectores?.texto) {
      partes.push(`Como factores protectores se identifican ${sinPuntoFinal(datos.factoresProtectores.texto)}.`);
    }

    return partes.filter(Boolean).join("\n");
  }
};

export const PLANTILLAS_COMENTARIO = {
  observacionFray(datos = {}) {
    const decada = decadaVida(datos.identificacion?.edad);
    const basePaciente = decada ? `paciente de la ${decada}` : "paciente en valoracion psiquiatrica";
    const fenomenos = sindromes(datos);
    const estresores = datos.estresores?.texto ? `, en contexto de ${sinPuntoFinal(datos.estresores.texto)}` : "";
    const riesgo = datos.riesgoSuicida?.nivel && datos.riesgoSuicida.nivel !== "Sin riesgo"
      ? ` Se identifican datos compatibles con riesgo suicida ${datos.riesgoSuicida.nivel.toLowerCase()}, por lo que requiere estratificacion clinica, medidas de seguridad y definicion del nivel de atencion.`
      : "";

    const primera = fenomenos.length
      ? `Se trata de ${basePaciente}, quien cursa con ${fenomenos.join("; ")}${estresores}.`
      : `Se trata de ${basePaciente}, con informacion dictada insuficiente para integrar un sindrome psiquiatrico especifico.`;

    const negativos = [
      datos.sintomas?.maniformes?.marcadores?.length ? "" : "sindrome maniforme",
      datos.sintomas?.psicoticos?.marcadores?.length ? "" : "sintomas psicoticos francos",
      "sindrome catatonico",
      "compromiso neurologico agudo"
    ].filter(Boolean);

    const segunda = negativos.length
      ? `Durante la valoracion no se identifican datos suficientes para integrar ${negativos.join(", ")} con la informacion disponible.`
      : "";

    const diagnostico = "Por lo anterior, la impresion diagnostica permanece como sugerida y sujeta a integracion definitiva mediante evolucion clinica, entrevista psiquiatrica completa y juicio clinico del medico tratante.";

    return unir([primera, riesgo, segunda, diagnostico], " ");
  }
};

export const PLANTILLAS_EXPLORACION_MENTAL = {
  observacionFray(datos = {}) {
    const partes = ["Exploracion mental sugerida a corroborar:"];
    if (datos.exploracionMental?.texto) partes.push(`Observacion registrada en dictado: ${datos.exploracionMental.texto}`);
    if (datos.sintomas?.depresivos?.marcadores?.length) partes.push(`Afecto/estado de animo: datos referidos compatibles con hipotimia, anhedonia, alteraciones neurovegetativas y sintomatologia depresiva (${datos.sintomas.depresivos.marcadores.join(", ")}).`);
    if (datos.sintomas?.ansiosos?.marcadores?.length) partes.push(`Ansiedad: manifestaciones ansiosas referidas (${datos.sintomas.ansiosos.marcadores.join(", ")}).`);
    if (datos.riesgoSuicida?.nivel && datos.riesgoSuicida.nivel !== "Sin riesgo") partes.push(`Pensamiento/riesgo: refiere conducta suicida con nivel ${datos.riesgoSuicida.nivel.toLowerCase()} segun reglas locales.`);
    if (datos.sintomas?.psicoticos?.marcadores?.length) {
      partes.push(`Sensopercepcion/pensamiento: posibles sintomas psicoticos a corroborar (${datos.sintomas.psicoticos.marcadores.join(", ")}).`);
    } else if (datos.sintomasNegados?.psicosis?.length) {
      partes.push(`Sensopercepcion: niega ${datos.sintomasNegados.psicosis.join(", ")}.`);
    }
    if (datos.sintomas?.maniformes?.marcadores?.length) {
      partes.push(`Activacion afectiva: datos maniformes a corroborar (${datos.sintomas.maniformes.marcadores.join(", ")}).`);
    } else if (datos.sintomasNegados?.mania?.length) {
      partes.push(`Activacion afectiva: niega ${datos.sintomasNegados.mania.join(", ")}.`);
    }
    if (datos.sintomas?.sustancias?.marcadores?.length) {
      partes.push(`Consumo: datos referidos de consumo (${datos.sintomas.sustancias.marcadores.join(", ")}).`);
    } else if (datos.consumoSustancias?.noProblematico) {
      partes.push(`Consumo: ${datos.consumoSustancias.noProblematico}.`);
    } else if (datos.sintomasNegados?.sustancias?.length) {
      partes.push(`Consumo: niega ${datos.sintomasNegados.sustancias.join(", ")}.`);
    }
    return partes.join("\n");
  }
};
