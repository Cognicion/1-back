const MS_DIA = 24 * 60 * 60 * 1000;

export function parseFechaLocal(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate(), 12, 0, 0);
  }

  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const local = texto.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);

  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
  if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), 12, 0, 0);

  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0);
}

export function formatearFechaDDMMAAAA(valor) {
  const fecha = parseFechaLocal(valor);
  if (!fecha) return "";
  return [
    String(fecha.getDate()).padStart(2, "0"),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    fecha.getFullYear()
  ].join("-");
}

export function calcularEdadPediatrica(fechaNacimiento, fechaReferencia = new Date(), edadGestacionalSemanas = null) {
  const nacimiento = parseFechaLocal(fechaNacimiento);
  const referencia = parseFechaLocal(fechaReferencia);
  if (!nacimiento || !referencia || referencia < nacimiento) return null;

  let años = referencia.getFullYear() - nacimiento.getFullYear();
  let meses = referencia.getMonth() - nacimiento.getMonth();
  let dias = referencia.getDate() - nacimiento.getDate();

  if (dias < 0) {
    meses -= 1;
    const ultimoMes = new Date(referencia.getFullYear(), referencia.getMonth(), 0);
    dias += ultimoMes.getDate();
  }

  if (meses < 0) {
    años -= 1;
    meses += 12;
  }

  const diasTotales = Math.floor((referencia.getTime() - nacimiento.getTime()) / MS_DIA);
  const semanasTotales = diasTotales / 7;
  const añosDecimales = diasTotales / 365.2425;
  const edadGestacional = Number(edadGestacionalSemanas);
  const prematuridadDias = Number.isFinite(edadGestacional) && edadGestacional > 0 && edadGestacional < 40
    ? Math.round((40 - edadGestacional) * 7)
    : 0;
  const diasCorregidos = Math.max(0, diasTotales - prematuridadDias);

  return {
    años,
    meses,
    dias,
    diasTotales,
    semanasTotales,
    añosDecimales,
    edadCronologicaTexto: `${años} a ${meses} m ${dias} d`,
    edadCorregidaDias: prematuridadDias ? diasCorregidos : null,
    edadCorregidaSemanas: prematuridadDias ? diasCorregidos / 7 : null,
    edadPostmenstrualSemanas: Number.isFinite(edadGestacional) && edadGestacional > 0
      ? edadGestacional + semanasTotales
      : null,
    diaDeVida: diasTotales + 1
  };
}
