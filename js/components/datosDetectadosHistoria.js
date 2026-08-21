const ETIQUETAS_FUENTE = Object.freeze({
  paciente: "Datos del paciente",
  nota: "Nota clínica",
  nota_rapida: "Nota rápida",
  documento_oficial: "Documento clínico",
  estudio: "Estudio",
  historia_clinica: "Historia clínica"
});

function crearElemento(etiqueta, clase = "", texto = "") {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto) elemento.textContent = texto;
  return elemento;
}

export function formatearFechaDatoDetectado(valor = "") {
  if (!valor) return "";
  const fechaSinHora = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor).trim());
  const fecha = fechaSinHora
    ? new Date(
      Number(fechaSinHora[1]),
      Number(fechaSinHora[2]) - 1,
      Number(fechaSinHora[3]),
      12
    )
    : new Date(valor);
  if (Number.isNaN(fecha.getTime()) || fecha.getUTCFullYear() < 1970) return "";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(fecha);
}

function describirFuentes(fuentes = []) {
  if (!fuentes.length) return "Fuente clínica sin fecha disponible";
  const primera = fuentes[0];
  const tipo = ETIQUETAS_FUENTE[primera.tipo] || "Fuente clínica";
  const fecha = formatearFechaDatoDetectado(primera.fecha);
  const adicionales = fuentes.length > 1 ? ` · +${fuentes.length - 1} fuente${fuentes.length === 2 ? "" : "s"}` : "";
  return `${tipo}${fecha ? ` · ${fecha}` : ""}${adicionales}`;
}

function agruparPorSeccion(detecciones = []) {
  const grupos = new Map();
  detecciones.forEach((deteccion) => {
    const etiqueta = deteccion.destino?.seccionEtiqueta || "Sin apartado compatible";
    const grupo = grupos.get(etiqueta) || [];
    grupo.push(deteccion);
    grupos.set(etiqueta, grupo);
  });
  return grupos;
}

export function crearGestorDatosDetectadosHistoria({
  contenedor,
  estaIntegrado = () => false,
  onAgregar = async () => false,
  onAbrirApartado = () => {},
  onResumenCambio = () => {}
} = {}) {
  if (!contenedor) return null;

  let detecciones = [];
  let mensaje = "";
  let mensajeEsError = false;

  function renderizarTarjeta(deteccion) {
    const integrada = estaIntegrado(deteccion);
    const tieneApartado = Boolean(deteccion.destino?.seccionId);
    const sePuedeAgregar = ["campo", "sustancias", "hitos"].includes(deteccion.destino?.tipo);
    const tarjeta = crearElemento("article", "dato-detectado");
    tarjeta.dataset.deteccionId = deteccion.id;

    const cabecera = crearElemento("header", "dato-detectado__cabecera");
    cabecera.appendChild(crearElemento("h5", "", deteccion.etiqueta));
    cabecera.appendChild(crearElemento(
      "span",
      `dato-detectado__estado${integrada ? " esta-integrado" : sePuedeAgregar ? " esta-pendiente" : " requiere-revision"}`,
      integrada ? "Integrado" : sePuedeAgregar ? "Pendiente" : "Revisión manual"
    ));
    tarjeta.appendChild(cabecera);

    const valor = crearElemento("blockquote", "dato-detectado__valor");
    valor.textContent = deteccion.valor;
    tarjeta.appendChild(valor);

    const metadatos = crearElemento("div", "dato-detectado__metadatos");
    metadatos.appendChild(crearElemento("span", "", describirFuentes(deteccion.fuentes)));
    metadatos.appendChild(crearElemento("span", "", `Confianza de extracción: ${Math.round((deteccion.confianzaExtraccion || 0) * 100)} %`));
    tarjeta.appendChild(metadatos);

    const acciones = crearElemento("div", "dato-detectado__acciones");
    if (sePuedeAgregar) {
      const agregar = crearElemento("button", "boton-principal dato-detectado__agregar", integrada ? "Ya integrado" : "Añadir al apartado");
      agregar.type = "button";
      agregar.dataset.accionDetectado = "agregar";
      agregar.dataset.deteccionId = deteccion.id;
      agregar.disabled = integrada;
      acciones.appendChild(agregar);

    }
    if (tieneApartado) {
      const abrir = crearElemento("button", "boton-secundario dato-detectado__abrir", "Ver apartado");
      abrir.type = "button";
      abrir.dataset.accionDetectado = "abrir";
      abrir.dataset.deteccionId = deteccion.id;
      acciones.appendChild(abrir);
    }
    if (!sePuedeAgregar) {
      const explicacion = deteccion.destino?.tipo === "readonly"
        ? "Este valor se muestra para comparación; el campo correspondiente se calcula automáticamente."
        : "El formulario actual no tiene un campo equivalente. Conserva este dato para revisión manual.";
      acciones.appendChild(crearElemento("p", "dato-detectado__sin-destino", explicacion));
    }
    tarjeta.appendChild(acciones);
    return tarjeta;
  }

  function renderizar() {
    contenedor.replaceChildren();
    const integradas = detecciones.filter(estaIntegrado).length;
    const pendientes = detecciones.filter((deteccion) => !estaIntegrado(deteccion) && ["campo", "sustancias", "hitos"].includes(deteccion.destino?.tipo)).length;
    onResumenCambio({ total: detecciones.length, integradas, pendientes });

    const resumen = crearElemento("div", "datos-detectados__resumen");
    resumen.appendChild(crearElemento("strong", "", `${detecciones.length} dato${detecciones.length === 1 ? "" : "s"} detectado${detecciones.length === 1 ? "" : "s"}`));
    resumen.appendChild(crearElemento("span", "", `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de integrar · ${integradas} integrado${integradas === 1 ? "" : "s"}`));
    contenedor.appendChild(resumen);

    const estado = crearElemento("p", `datos-detectados__mensaje${mensajeEsError ? " es-error" : ""}`, mensaje);
    estado.setAttribute("role", "status");
    estado.setAttribute("aria-live", "polite");
    contenedor.appendChild(estado);

    if (!detecciones.length) {
      const vacio = crearElemento("div", "datos-detectados__vacio");
      vacio.appendChild(crearElemento("strong", "", "No hay datos clínicos mapeados"));
      vacio.appendChild(crearElemento("p", "", "Se revisaron las fuentes disponibles, pero no se encontraron campos estructurados ni encabezados compatibles con los apartados de esta historia."));
      contenedor.appendChild(vacio);
      return;
    }

    agruparPorSeccion(detecciones).forEach((grupo, seccion) => {
      const bloque = crearElemento("section", "datos-detectados__grupo");
      bloque.appendChild(crearElemento("h4", "", seccion));
      const rejilla = crearElemento("div", "datos-detectados__rejilla");
      grupo.forEach((deteccion) => rejilla.appendChild(renderizarTarjeta(deteccion)));
      bloque.appendChild(rejilla);
      contenedor.appendChild(bloque);
    });
  }

  async function manejarClick(evento) {
    const boton = evento.target.closest("[data-accion-detectado]");
    if (!boton || !contenedor.contains(boton)) return;
    const deteccion = detecciones.find((item) => item.id === boton.dataset.deteccionId);
    if (!deteccion) return;

    if (boton.dataset.accionDetectado === "abrir") {
      onAbrirApartado(deteccion);
      return;
    }

    boton.disabled = true;
    mensajeEsError = false;
    try {
      const agregado = await onAgregar(deteccion);
      mensaje = agregado?.status === "cancelled"
        ? "No se modificó el campo existente."
        : agregado === false
          ? "El dato ya estaba integrado en el borrador."
          : `Dato añadido a ${deteccion.destino.seccionEtiqueta}. Guarda la historia para confirmarlo.`;
    } catch (error) {
      mensajeEsError = true;
      mensaje = "No fue posible añadir este dato al borrador.";
      console.warn("[HistoriaClinica:DatosDetectados] No se pudo integrar el dato", { code: error?.code || null });
    }
    renderizar();
  }

  function cargar(nuevasDetecciones = []) {
    detecciones = Array.isArray(nuevasDetecciones) ? nuevasDetecciones.filter((item) => item?.id && item?.valor) : [];
    mensaje = "Selecciona únicamente los datos que deseas incorporar. Nada se guarda hasta pulsar “Guardar historia”.";
    mensajeEsError = false;
    renderizar();
  }

  function actualizar() {
    renderizar();
  }

  contenedor.addEventListener("click", manejarClick);
  return { cargar, actualizar, obtenerDetecciones: () => [...detecciones] };
}
