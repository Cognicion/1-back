# Agenda: auditoría inicial y límites del rediseño

Auditoría realizada sobre el repositorio canónico `D:\Escritorio\PROYECTO COGNICION\1-back`, rama `main`. La versión visible al comenzar la tarea es **2.193**, verificada en `js/config/appVersion.js`. Las descripciones de la interfaz anterior corresponden a ese estado inicial; el rediseño se desarrolla posteriormente sobre los mismos archivos, sin cambiar Functions, Rules, índices ni esquemas.

## Estructura existente y decisión de implementación

| Ruta relativa al repositorio | Responsabilidad inicial |
| --- | --- |
| `agenda.html` | Encabezado, navegación, formulario permanente, configuración, lista de próximos eventos y calendario mensual. |
| `css/agenda.css` | Contenedor central de hasta 1280 px; superficies `.card`, dos columnas de formulario/lista, días independientes y fondos decorativos. |
| `js/agenda.js` | Autenticación, permisos, lecturas, estado de mes, renderizadores, formulario, operaciones y retorno OAuth. |
| `js/services/agendaAvailabilitySettings.js` | Lectura/edición de jornada por medio de comandos; validación y persistencia pertenecen al dominio. |
| `js/services/appointmentCommandService.js` | Adaptador lazy de `manageAppointment`, `createRequestId`, códigos de error y trazas técnicas. |
| `js/services/googleCalendarService.js` | Conectar, consultar estado real y desconectar mediante las Functions OAuth existentes. |
| `js/services/appointmentService.js` | Reexporta funciones puras del dominio; no contiene un motor de calendario. |
| `js/services/agendaRecurrence.js` | Reexporta el algoritmo único de recurrencias. |
| `functions/appointments/domain.mjs` | Normalización, representación temporal, disponibilidad, validación y transiciones. Sólo auditado. |
| `functions/appointments/recurrence.mjs` | Expansión semanal/quincenal/mensual y ancla del día 31. Sólo auditado. |
| `functions/appointments/service.mjs` | Autorización, transacciones, concurrencia, idempotencia, auditoría y escritura canónica. Sólo auditado. |

El calendario existente es un renderizador propio en JavaScript/HTML; no utiliza FullCalendar ni otra biblioteca de calendario. Se conserva ese enfoque mediante módulos de presentación; no hace falta instalar otro motor ni un framework.

El estado inicial está concentrado en `medicoUid`, `pacientes`, `eventos`, `fechaCalendario` y `operacionCitaActiva`. `renderizarCalendario()` sólo genera Mes y `renderizarEventos()` crea otra representación permanente, limitada a doce documentos. Los listeners se vuelven a asociar tras cada renderizado. No existían arrastre ni cambio de duración con el puntero.

Los selectores funcionales principales son:

- Navegación: `nuevoEvento`, `nuevaCita`, `mesAnterior`, `mesActual`, `mesSiguiente`, `tituloMes`, `calendario`.
- Editor: `formCita`, `tituloFormulario`, `eventoId`, `eventoEstado`, `guardarEvento`, `cancelarEdicion`.
- Campos: `tipoEvento`, `tituloEvento`, `pacienteCita`, `pacienteNombreExterno`, `pacienteTelefonoExterno`, `pacienteCorreoExterno`, `fechaCita`, `horaCita`, `fechaFinEvento`, `horaFinEvento`, `duracionEvento`, `todoElDia`, `ubicacionEvento`, `recordatorioCita`, `seguimientoCita`, `notasCita`, `recurrenciaEvento`, `googleCalendarEventId`.
- Configuración: `abrirConfiguracionAgenda`, `cerrarConfiguracionAgenda`, `configuracionAgenda`, `[data-agenda-availability]`, `[data-weekly-schedule]`, `[data-timezone]`, `[data-booking-enabled]` y `[data-google-calendar-integration]`.

El formulario anterior no contiene un campo dedicado a modalidad. El servicio tampoco acepta un atributo `modalidad` en `APPOINTMENT_FIELDS`. No debe añadirse una propiedad persistente ficticia para cumplir visualmente esa expectativa. Se conserva ubicación y los campos realmente soportados.

## Flujos que deben conservarse

| Acción | Controlador UI inicial | Servicio / respuesta | Actualización visual |
| --- | --- | --- | --- |
| Abrir Agenda | `onAuthStateChanged` + `canUseMedicalAgenda` | Perfil autorizado, pacientes y documentos de Agenda | Desbloqueo del contenido y renderizado. |
| Crear cita | `formCita.submit` → `construirEvento` → `datosCitaParaServicio` | `executeAppointmentCommand({ action: "create", requestId })` → `manageAppointment` → transacción | Sólo tras éxito, cerrar/reiniciar editor y recargar. |
| Editar datos administrativos | `editarEvento` + comparación de campos horarios | Comando `update`, sin campos temporales | Conservar documento/intervalo; actualizar tras respuesta. |
| Reprogramar cita | `cambioHorarioCita` → `ejecutarOperacionCita` | Comando `reschedule`; validación, conflicto, recibo idempotente y auditoría server-side | Pendiente durante envío; ante conflicto conservar el evento y el formulario, recargar y explicar el rechazo. |
| Cancelar / confirmar / marcar atendida | `cancelarCita`, `confirmarCita`, `marcarAtendida` | Comandos `cancel`, `confirm`, `complete` | Reflejar estado devuelto mediante recarga; cancelar no equivale a borrar. |
| Crear/editar/eliminar otro tipo | Rama no-appointment del controlador existente | Operaciones SDK existentes y `registrarEventoAgenda` | Recargar después de la operación; no ampliar esta vía a citas. |
| Cambiar mes / Hoy | Listeners `mesAnterior`, `mesSiguiente`, `mesActual` | Lectura de Agenda según rango | Renderizado con la misma fuente de eventos. |
| Consultar/guardar jornada | `initializeAgendaAvailabilitySettings` | Comandos `availabilitySettings` y `updateAvailabilitySettings`; jornadas y validación real | Filas de intervalos y estado de guardado. |
| Conectar Google Calendar | Control de integración → `iniciarConexionGoogleCalendar` | `googleCalendarConnect` devuelve URL autorizada de Google | Navegación OAuth. |
| Retornar desde OAuth | Query `googleCalendar`/`reason`, hash `#configuracionAgenda` | `obtenerEstadoGoogleCalendar` consulta `getGoogleCalendarConnectionStatus` | Abrir Integraciones, limpiar parámetros y mostrar estado real. La URL no demuestra conexión. |
| Desconectar Google Calendar | `desconectarGoogleCalendar` | `disconnectGoogleCalendar` | Refrescar el estado de conexión. |

`executeAppointmentCommand` encapsula Functions, timeout y códigos de error. Las acciones `create/update/reschedule` tienen listas de campos diferentes; el rediseño debe seguir usándolas. La disponibilidad del cliente nunca autoriza una escritura de cita.

## Zoom, ancho y temas

La captura aportada por el usuario no permite determinar el porcentaje exacto de zoom de Chrome. Por sí sola no demuestra un bug de CSS ni autoriza compensarlo con `scale` o `zoom`.

La captura inicial aislada a 100 %, con datos ficticios y límites Firebase simulados, registró `devicePixelRatio=1`, `visualViewport.scale=1`, `bodyZoom=1`, fuente raíz de `16px` y `transform: none` en el contenedor. Se encontraron estas medidas reales antes del rediseño:

| Viewport | Ancho del contenedor | Máximo CSS | Ancho del documento | Calendario: inicio vertical, tema oscuro |
| --- | --- | --- | --- | --- |
| 1440 × 900 | 1280 px | 1280 px | 1440 px | Aproximadamente 3837 px. |
| 1366 × 768 | 1280 px | 1280 px | 1366 px | Aproximadamente 3833 px. |
| 390 × 844 | 366 px | 1280 px | 402 px | Aproximadamente 6248 px. |

Evidencia local: `.tmp/whatsapp-tests/agenda-visual/before/metrics.json` y sus seis PNG. Estas mediciones corresponden al navegador aislado y a fixtures, no a una sesión clínica autenticada ni al zoom original del usuario. Muestran que, incluso a escala normal, la distribución anterior sitúa el calendario después de una página extensa y puede desbordar en móvil.

Los estilos globales relevantes son `css/theme/cognicion-theme.css`, su import `css/theme/themes.css`, el bootstrap `js/theme-preload.js`, `js/services/themeBootstrap.js`, `js/services/themeService.js` y el controlador biocelular. El preload también monta `js/components/globalAppHeader.js`; por eso el rediseño debe integrarse con ese encabezado en lugar de superponer dos barras grandes.

Limitación del sistema de temas: `theme-preload.js` y `themeService.js` migran actualmente `light` a `dark`, porque el modo claro está deshabilitado globalmente. Validar los tokens de modo claro en QA aislado no implica que Claro sea seleccionable en producción. Cambiar esa política para todos los módulos está fuera del alcance del rediseño. Los ajustes de superficie, tipografía y decoración de Agenda deben permanecer acotados a Agenda.

## Contrato temporal

`normalizarEvento` preserva los documentos y sus aliases históricos (`fecha/hora`, paciente y estado), sin asignar silenciosamente una zona IANA a datos antiguos.

- **Legacy civil:** `startDate/startTime/endDate/endTime` representan etiquetas civiles. Para aritmética visual se utiliza `intervaloEvento(evento, { civil: true })`; no la zona accidental del navegador.
- **Moderno:** `temporalRepresentation` reconoce un par válido `startAt/endAt`; la proyección usa esos instantes y `Intl.DateTimeFormat` con una zona explícita. Cambiar la zona de visualización no persiste cambios.
- **Duración:** `endTime` tiene precedencia sobre `durationMinutes`. El renderer no debe modificar esa precedencia ni redondear una duración corta para hacerla seleccionable.
- **Límites:** los intervalos temporizados son `[start,end)`. Un evento que termina exactamente a medianoche no ocupa el día siguiente. Los eventos todo-el-día conservan la semántica legacy de fecha final inclusiva que expresa el dominio hasta `23:59:59`.
- **Noches y multidía:** los segmentos son objetos de presentación con el mismo ID de origen; no son documentos duplicados.
- **Recurrencias:** usar `getOccurrences`/`expandirEventosAgenda` del algoritmo actual. Mantiene el ancla 31 al pasar por febrero y abril, y expande una ventana acotada en vez de recorrer toda la historia.
- **Edición recurrente:** el motor produce `id="origen::fecha"`, `parentEventId` e `occurrenceDate`. El flujo anterior edita el documento original mediante `parentEventId`. No existe una operación de excepción para “sólo esta ocurrencia”. El editor debe explicar el alcance soportado y conservar el ancla original.

El módulo de presentación `js/agenda/visualModel.js` deriva los segmentos de instantes modernos y fechas civiles sin mutar la colección original. Para una ocurrencia moderna, elimina de una copia los timestamps heredados del ancla, actualiza los aliases civiles y reutiliza `canonicalAppointmentInterval` con la zona original. Es una proyección de lectura; nunca se envían esos campos derivados como una escritura alternativa.

## Hallazgo backend fuera del alcance: recurrencias con instantes modernos

**Estado: reproducido; backend sin modificar.** No se afirma que todas las recurrencias fallen. El caso depende de conservar timestamps canónicos al expandir una serie con política IANA configurada. Las series legacy-civil y un candidato civil sin timestamps pasan los controles de la reproducción.

El algoritmo `functions/appointments/recurrence.mjs:getOccurrences` copia el evento completo y reemplaza las fechas de cada ocurrencia. Como consecuencia, `startAt/endAt` continúan siendo los del ancla si estaban presentes.

Dos consumidores del dominio sufren esa combinación:

1. **Validación de una nueva serie moderna.** `service.mjs:mutate` asigna timestamps canónicos antes de llamar a `getAvailability`. La rama recurrente de `domain.mjs:getAvailability` expande la serie y valida cada ocurrencia conservando esos timestamps. Una ocurrencia posterior se compara contra la fecha del ancla y `canonicalAppointmentInterval` lanza `inconsistent-canonical-instant`. Con el caso semanal sintético inferior ocurre desde la segunda fecha. Si antes hay otro error de política, puede fallar por ese motivo; no todas las configuraciones siguen idéntico recorrido.
2. **Ocupación por una serie moderna existente.** La comparación de eventos existentes en `domain.mjs:getAvailability` prefiere `startAt/endAt` cuando están disponibles. En una ocurrencia posterior, puede comparar contra los instantes del ancla y devolver `available: true` aunque la hora civil de esa ocurrencia esté ocupada. El mismo caso sin timestamps devuelve `conflict`.

Esto es un límite real para afirmar que las reservas/reprogramaciones recurrentes modernas son seguras. El rediseño visual no lo corrige y no debe anunciar cobertura completa del backend por el simple hecho de dibujar bien la serie. Requiere una tarea separada de dominio, pruebas de servicio y revisión de concurrencia antes de autorizar ese escenario operativo. No se debe resolver con escrituras SDK, ignorando el error o usando filtros visuales como autorización.

Reproducción ejecutada desde la raíz canónica; utiliza únicamente funciones puras y datos ficticios, sin SDK Firestore, credenciales, red ni escrituras:

```powershell
$agendaAuditProbe = @'
import assert from 'node:assert/strict';
import { canonicalAppointmentInterval, getAvailability } from './functions/appointments/domain.mjs';
const policy = { timeZone: 'America/Mexico_City', weeklySchedule: { monday: [{ start: '00:00', end: '24:00' }] } };
const base = { id: 'synthetic-series', type: 'appointment', startDate: '2026-09-07', endDate: '2026-09-07', startTime: '10:00', durationMinutes: 60, recurrence: 'weekly' };
const modern = { ...base, ...canonicalAppointmentInterval(base, policy) };
const evaluate = (candidate, events = [], selectedPolicy = policy) => getAvailability({ candidate, events, policy: selectedPolicy, complete: true });
assert.equal(evaluate(base, [], { availabilityMode: 'legacy-civil' }).available, true);
assert.equal(evaluate(base).available, true);
assert.throws(() => evaluate(modern), { code: 'inconsistent-canonical-instant' });
const later = { ...base, startDate: '2026-09-14', endDate: '2026-09-14', recurrence: null };
assert.equal(evaluate(later, [base]).reason, 'conflict');
assert.equal(evaluate(later, [modern]).available, true);
console.log('5 assertions PASS: 3 controls; 2 existing modern recurrence defects reproduced. No Firestore access.');
'@
$agendaAuditProbe | node --input-type=module
```

Salida observada, código de salida 0:

```text
5 assertions PASS: 3 controls; 2 existing modern recurrence defects reproduced. No Firestore access.
```

En este comando, PASS significa que la reproducción confirmó el comportamiento descrito, incluidos los dos defectos; no significa que ese comportamiento incorrecto sea aceptable.

## Lecturas, carga y fronteras de la tarea

La lectura inicial de UI realiza tres consultas sobre `usuarios/{uid}/agenda`: fecha legacy dentro de una ventana, intersección por `startDate/endDate` y todas las fuentes recurrentes admitidas. Une los snapshots por ID y normaliza una sola colección. El rediseño debe reutilizar esa fuente, reutilizar rangos cargados y controlar respuestas tardías; no añadir listeners por celda, consultas por evento o consultas OAuth por renderizado.

Limitaciones existentes de esta API:

- No existe un endpoint de lectura visual optimizado/paginado por rango. Todas las fuentes recurrentes se consultan, incluso si el documento ancla es antiguo.
- La consulta legacy por fecha de inicio puede omitir un evento antiguo muy largo que carezca de campos modernos y empiece fuera de la ventana. La proyección sólo puede dibujar documentos recibidos; no debe fingir que una agenda incompleta acredita disponibilidad.
- El servicio transaccional tiene límites propios: lectura legacy de 2001 documentos para detectar el máximo de 2000, consultas modernas de intersección, retroceso civil de hasta 366 días y fuentes recurrentes. Esos controles permanecen en el backend.
- Antes del rediseño, una consulta parcialmente fallida conservaba los resultados disponibles; el estado visual debe distinguir carga, fallo parcial/total, vacío real y falta de autorización.
- El controlador inicial de jornada enviaba defaults para excepciones/buffers aunque no los editara. El controlador visual debe conservar los ajustes existentes no expuestos al guardar filas, sin añadir opciones sin soporte.

Las ocho clases de evento existentes se presentan en cinco filtros: Citas; Eventos (incluye reunión, actividad académica y otros); Guardias; Bloqueos; Vacaciones. Filtrar sólo afecta al renderizado. Los documentos completos permanecen disponibles para la lógica; el dominio continúa decidiendo qué tipos y banderas bloquean horarios.

Quedan fuera de esta entrega: esquemas Firestore, Functions, Rules, índices, reparación de los defectos de recurrencia descritos, sincronización Google Calendar, Free/Busy, WhatsApp conversacional, pagos y recordatorios. Conectar OAuth sólo confirma conexión; no equivale a sincronizar calendarios.

## Evidencia y regresiones

La proyección visual se verificó con `node --test tests/agenda-visual-model.test.mjs`: **26 pruebas PASS**, incluyendo IANA independiente de la zona del host, cuatro vistas, filtros que conservan bloqueos del dominio, día 31, DST, noche, multidía, eventos simultáneos, duración exacta de cinco minutos e intervalo completo para detalle. La sintaxis se verificó en modo ESM explícito: `Get-Content js/agenda/visualModel.js -Raw | node --input-type=module --check`. Estos resultados no sustituyen QA visual ni una prueba autenticada del servicio.

Regresiones pertinentes: `tests/appointment-domain.test.mjs`, `tests/appointment-availability-settings.test.mjs`, `tests/appointment-emulator.test.mjs`, `js/tests/agendaRecurrence.test.mjs`, `tests/agenda-transactional-ui-static.test.mjs`, pruebas de jornada, OAuth y WhatsApp. Los resultados completos y las capturas después del rediseño deben informarse con la entrega final, distinguiendo mocks de QA autenticado pendiente.
