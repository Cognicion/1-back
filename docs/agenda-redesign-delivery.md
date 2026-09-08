# Entrega local: Agenda como calendario de trabajo

Repositorio canónico: `D:\Escritorio\PROYECTO COGNICION\1-back`, rama `main`. Versión **2.193 → 2.194**. Se conserva el commit base `29c72fc`; no se crearon commits, ramas, worktrees, publicaciones ni despliegues.

## Diseño y funcionamiento

Agenda abre directamente en el calendario. La barra compacta ofrece Hoy, anterior/siguiente, rango, Día/Semana/Mes/Lista y ajustes. La barra lateral plegable contiene Crear, acceso a cita, mini calendario y cinco filtros. Los ocho tipos existentes se conservan; reuniones, actividad académica y otros se agrupan visualmente bajo Eventos.

- **Día y Semana:** cuadrícula continua de 24 horas, cabeceras fijas dentro del desplazamiento, franja de todo el día, hoy y hora actual, bloques proporcionales a su intervalo y columnas para solapamientos. Los eventos breves conservan su duración; se amplía únicamente el área de selección. Las guardias nocturnas se segmentan visualmente manteniendo un documento fuente.
- **Mes:** siete columnas y semanas conectadas, fechas adyacentes diferenciadas, bandas multidía, capacidad limitada por altura y `+ N más` con lista contextual. La capacidad se recalcula al redimensionar. El número del día abre Día; el espacio vacío abre el editor.
- **Lista:** treinta días desde la fecha seleccionada, agrupados por fecha en filas de hora, tipo, título/paciente autorizado, estado y acceso a acciones. Es otra presentación de la misma fuente.
- **Móvil:** Día por defecto, lateral desplegable, editor de pantalla completa y desplazamiento horizontal confinado al calendario en Semana/Mes. En escritorio, Semana es la vista inicial. Sólo la preferencia de vista se guarda en localStorage.

Se retiraron hero, tarjetas, formulario permanente y lista permanente de próximos eventos. Los controles y campos se reubicaron; no se sustituyeron servicios. El estilo está acotado a `body.agenda-page` y usa los tokens existentes. Se suprimen las decoraciones de fondo de Agenda. No se instaló un motor de calendario ni un framework.

## Crear, editar y resolver conflictos

Crear, Nueva cita o un horario vacío abren el mismo `formCita`, con fecha/hora preseleccionadas. Un evento abre el detalle reutilizable y Editar abre ese mismo formulario con el documento original. Se conservan paciente registrado/externo, contacto, tipo, fechas, horas, duración, ubicación, recurrencia, recordatorio como anotación, seguimiento y notas. Los detalles menos frecuentes están plegados. No se muestran notas ni diagnósticos en bloques/listas.

Las citas siguen `construirEvento → datosCitaParaServicio → executeAppointmentCommand → manageAppointment → recarga visual`. La comparación temporal decide `update` o `reschedule`. Confirmar, cancelar y completar utilizan sus comandos originales. Cancelar nunca borra físicamente una cita. Las operaciones directas existentes para otros tipos quedan protegidas por tipo tanto en el controlador como en el selector de edición.

Durante un comando se bloquea el doble envío. El requestId de un reintento idéntico permanece en memoria. La vista no mueve ni borra optimistamente el evento; un conflicto conserva el formulario y vuelve a consultar. Se conserva la alternativa de reprogramación por formulario. **No había arrastre ni resize de eventos y no se añadieron en esta iteración. Tampoco se añadió selección de intervalos por arrastre.**

El alcance recurrente sigue siendo el documento original. No se ofrece una operación ficticia sobre una sola ocurrencia. No se añadió un atributo `modalidad`; el contrato actual dispone de ubicación, que acepta esa indicación textual sin cambiar el esquema.

## Configuración, OAuth y estado visual

Los ajustes viven en un panel bajo demanda con Disponibilidad e Integraciones. Jornada muestra intervalos en filas, días cerrados, agregar/eliminar, guardar y recargar. Un fin `24:00`, válido en el dominio, se conserva. El guardado preserva excepciones, buffers, duración y límites no expuestos; la UI anterior los reemplazaba por valores predeterminados. La validación y persistencia siguen en el servicio.

La zona se consulta una vez al iniciar. Carga fallida, configuración ausente y falta de autorización se distinguen. La recarga recupera la zona sin requerir una escritura. Configuración e integración OAuth se importan bajo demanda. Al cerrar se mantienen fecha, vista y desplazamiento del calendario.

`agenda.html#configuracionAgenda` continúa abriendo ajustes. El retorno OAuth abre Integraciones, limpia parámetros y consulta el estado al backend. Una URL que diga `connected` no demuestra conexión. Conectar/desconectar conserva las Functions existentes. **Conectado no significa sincronizado:** no se implementó sincronización, Free/Busy ni eventos externos simulados en la aplicación.

## Fechas, consultas y accesibilidad

`visualModel.js` reutiliza el algoritmo compartido de recurrencias y el dominio temporal. Las fechas legacy conservan su representación civil; los timestamps modernos se proyectan en una IANA explícita. No se modifican documentos por navegar, filtrar o proyectar. Se conservan `[start,end)`, el ancla 31 y el final inclusivo del todo-el-día legacy. El detalle muestra el intervalo completo de un evento nocturno, no sólo el segmento seleccionado.

Un horario no representable con seguridad queda visible con advertencia. En la repetición de hora de otoño, dos instantes distintos que se proyectan a la misma hora civil no se dibujan fingiendo una duración; el modelo los conserva como pendientes de revisión.

Se reutilizan las tres consultas originales. La caché en memoria conserva hasta tres ventanas y las cuatro vistas reutilizan rangos ya cargados. La expansión visual se reutiliza mientras fuente/rango/zona no cambien. No se añadió un listener por celda, consulta por evento ni consulta OAuth por render. Las respuestas tardías se descartan; errores parciales se anuncian, sin convertirlos en una agenda vacía. La sesión y el cierre de página limpian datos, listeners y temporizadores.

Se usan botones nativos, sin `role="grid"` decorativo. El mini calendario y las franjas horarias tienen navegación por flechas; los horarios también admiten Inicio/Fin. Los diálogos controlan foco/Escape y lo restauran; el lateral móvil confina Tab mientras está abierto. Se respeta reduced-motion y no se fuerza el zoom del usuario.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `agenda.html` | Nueva estructura, cuatro vistas, lateral y tres diálogos reutilizables. |
| `css/agenda.css` | Superficie continua, temas, responsive y foco, sólo para Agenda. |
| `js/agenda.js` | Controlador existente adaptado, consultas compartidas, comandos y retorno OAuth. |
| `js/agenda/workspace.js` | Estado y renderizadores visuales, navegación, filtros y overlays. |
| `js/agenda/visualModel.js` | Proyección temporal pura, rangos, segmentos y solapamientos. |
| `js/services/agendaAvailabilitySettings.js` | Filas, conservación de ajustes y recuperación de carga. |
| `js/config/appVersion.js` | Incremento visible a 2.194. |
| `tests/agenda-visual-model.test.mjs` | Fechas, recurrencias, zonas, medianoche, duración y solapamientos. |
| `tests/agenda-availability-ui.test.mjs` | Controlador con DOM real y transporte simulado. |
| `tests/agenda-transactional-ui-static.test.mjs` | Conserva garantías de transporte tras extraer el renderizador. |
| `scripts/qa-agenda-visual.cjs`, `scripts/qa-agenda-scenarios.cjs` | Navegador local, fixtures, escenarios y capturas. |
| `docs/agenda-redesign-audit.md`, este documento | Auditoría, evidencia, límites y entrega. |

No se modificaron `functions/**`, Firestore Rules, índices, configuración Firebase, adaptador de comandos, servicio Google Calendar ni algoritmo compartido de recurrencias.

## Validación y límites

| Validación ejecutada | Resultado |
| --- | --- |
| Agenda: modelo visual, DOM de disponibilidad, contratos, dominio, recurrencias y OAuth | **74/74 PASS**, 0 omitidas, 6.634 s en la ejecución final. |
| Appointment Service / Firestore Rules y Google Calendar Rules, Java 21 y emulador local | **24/24 PASS**, 0 omitidas. |
| WhatsApp webhook HTTP/unitarias | **36/36 PASS**. |
| WhatsApp persistencia y Rules, Java 21 y emulador local | **11/11 PASS**. |
| Escenarios de navegador con mocks | **44/44 PASS**: 21 escritorio, 21 móvil y 2 de reflow; 0 errores JavaScript. |
| Sintaxis de los cinco módulos modificados/nuevos | **PASS**, parseo ESM explícito por stdin con `node --input-type=module --check`. |
| Sintaxis de runners QA y `git diff --check` | **PASS**. |

La evidencia visual e interacciones se detalla en `.tmp/whatsapp-tests/agenda-visual/after/metrics.json`. Ese directorio está ignorado por Git. El servidor QA sólo escucha en loopback; los transportes están simulados en memoria y la red externa queda bloqueada. No se crearon citas ni se modificaron pacientes reales.

Capturas ANTES/DESPUÉS: `1440×900`, `1366×768`, `390×844`, temas claro/oscuro, con DPR 1, `visualViewport.scale=1`, fuente raíz 16px y sin `transform`/zoom CSS. También se capturó Biocelular en escritorio y móvil usando su controlador/CSS reales. Hay capturas adicionales de Mes, editor, ajustes y conflicto: **20 PNG después y 6 antes**. El ANTES utilizó el encabezado de respaldo; el DESPUÉS incorpora el encabezado global real con datos de perfil simulados.

| Viewport | Superficie final de calendario | Inicio vertical | Desbordamiento horizontal de la página |
| --- | --- | --- | --- |
| 1440 × 900 | 1200 × 785 px | 115 px | Ninguno. |
| 1366 × 768 | 1126 × 653 px | 115 px | Ninguno. |
| 390 × 844 | 390 × 712 px | 132 px | Ninguno. |

Las pruebas incluyen cuatro vistas sin repetir consultas del rango cargado, mini calendario/foco, filtros sin escrituras, creación de cita sin doble envío, reutilización de editor, reprogramación rechazada y reintento con el mismo requestId, cancelación conservando documento, jornada/recarga, retorno OAuth con URL `connected` pero backend desconectado, lecturas tardías, errores, eventos simultáneos, noche/multidía, cinco minutos seleccionables con altura aproximada de 5.33 px y `+ N más`.

Se verificó además reflow en `720×450`, DPR 2, equivalente al espacio CSS de `1440×900` al 200 %, con editor y acciones esenciales accesibles. **Esto no es una prueba del control de zoom real de Chrome.** No se modificó ese control desde la aplicación.

Rendimiento de la ejecución final: **62 muestras de render a 100 %**, mínimo 6 ms, mediana 12 ms, p95 38 ms y máximo 41 ms. Son mediciones locales de Chrome headless con trece eventos ficticios iniciales; no miden latencia de Firebase ni rendimiento de agendas clínicas grandes.

**Claro está deshabilitado en el sistema global.** Las capturas claras verifican sus tokens mediante el entorno QA, sin reactivar ese tema en producción ni crear otro sistema de temas.

Pendiente: QA con una sesión autorizada de pruebas, permisos reales, conexión OAuth real, comportamiento del encabezado con todos sus accesos, teclado/lector de pantalla y zoom real del navegador/dispositivo. Las capturas y mocks no equivalen a esas verificaciones.

**Riesgo backend previo, fuera de esta tarea:** las recurrencias modernas pueden heredar timestamps del ancla; se reprodujeron validaciones rechazadas y un caso de disponibilidad incorrectamente libre frente a una ocurrencia posterior. La reproducción y los controles sanos están documentados en `agenda-redesign-audit.md`. No se modificó ni se eludió ese dominio. Ese hallazgo requiere revisión antes de confiar en reservas recurrentes modernas reales.

También se evita reprogramar desde esta UI una cita cuya zona original difiera de la política actual, porque el servicio vuelve a canonizar en esta última. La edición descriptiva sigue disponible. Las citas legacy de todo el día conservan su edición descriptiva; su reprogramación requiere soporte del dominio.

La lectura original no dispone de una API optimizada de rangos y recupera todas las series recurrentes. Los filtros no liberan disponibilidad. Una zona/configuración ausente o una agenda aparentemente vacía nunca autorizan una reserva. Google Calendar y WhatsApp conservan el alcance anterior; esta entrega es exclusivamente el rediseño funcional de Agenda.
