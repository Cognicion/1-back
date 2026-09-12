# Directorio publico de profesionales

## Estado de entrega local

Implementacion local en main, version 2.210 -> 2.211. No se han publicado Functions,
Hosting, indices ni datos. No se crean perfiles de ejemplo en Firestore.
La aceptacion de extremo a extremo con infraestructura real sigue pendiente.
No se modifican los trabajos preexistentes de farmacologia, hosting u otros modulos.

## Flujo y fuente unica

usuarios/{uid} + publicDirectory (publicacion expresa)
-> getPublicProfessionals / proyeccion allowlist en servidor
-> professionalsService (lecturas compartidas durante 60 segundos)
-> busqueda y filtros locales
-> index (hasta 4 destacados) / directorio (paginas de 60) / profesional (slug)
-> agendaProfessionalId (alias publico igual al slug)
-> agenda.html?professional=slug
-> managePublicAppointment / resolucion del UID solo en servidor
-> createAppointmentService / getChannelSlots / createAppointment
-> usuarios/{uid}/agenda + appointmentControls/{uid}/requests.

La fuente existente de profesionales es usuarios. El directorio autenticado anterior
listProfessionalDirectory devuelve email, rol y UID, por lo que no se reutiliza su
respuesta como publica y conserva intacto su contrato.

No existe una coleccion professionals nueva. El servicio publico mapea nombre,
especialidad, fotoProfesional, cedulaProfesional y descripcionProfesional desde sus
campos existentes. No guarda sus copias dentro de publicDirectory.

Cuando existe configuracion de servicios en whatsappBotProfessionals/{uid}, los
nombres, modalidades y acceptsNewPatients se proyectan desde esa fuente. No se
exponen recordatorios, contactos ni configuracion del canal. Los campos
publicDirectory.services/modalities/acceptingPatients solo actuan como fuente
cuando no existe aquel catalogo de servicios.

No se guardan horarios, slots ni disponibilidad en el directorio. La duracion y zona
de consulta se obtienen de appointmentControls. Los eventos privados nunca se
envian al visitante. Google FreeBusy utiliza el proveedor existente.

## Publicacion de perfiles

La nueva metadata se configura en usuarios/{uid}.publicDirectory mediante las
herramientas administrativas existentes / Admin SDK autorizado. No se agrega un
editor de perfiles publicos en esta entrega. Se requiere revisar el consentimiento
y el contenido antes de activar publicProfile.

Campos de metadata soportados:

- publicProfile: boolean, opt-in estricto true.
- profileSlug: unico, entre 1 y 64 caracteres [a-z0-9] separados por guiones.
- featured: boolean; displayOrder: numero, orden dentro de la pagina cargada.
- professionalTitle: texto.
- clinicalExperience, populations, languages: listas de texto.
- services, modalities, acceptingPatients: solo cuando no hay catalogo del canal.
- education: lista de {title, institution, year, description}; year como texto.
- professionalExperience: lista de {position, institution, startYear, endYear, description}.
- publishPhoto, publishLicense: autorizaciones separadas, false por defecto.

Publicar implica autorizar nombre, especialidad y biografia profesional existentes.
Foto y cedula requieren sus autorizaciones adicionales. El perfil debe conservar
un rol clinico valido y no tener marca de eliminacion. No usar UID como slug.
Mantener slugs unicos y estables: las colisiones se rechazan al resolver el perfil o
agendar, nunca se elige un profesional arbitrario. Cambiar el slug invalida enlaces
anteriores; no se implementaron redirecciones historicas.

No se publica ningun campo mediante spread de documentos. Los registros anidados
de formacion/experiencia tambien se reconstruyen campo por campo. Las URL de foto
aceptan HTTPS sin credenciales; la carga es lazy con fallback local sin red.
El texto se representa mediante textContent y elementos DOM, sin HTML de datos.

## Consultas e indices

- Destacados: usuarios, publicDirectory.publicProfile == true y
  publicDirectory.featured == true, orderBy publicDirectory.profileSlug, limit(4).
- Catalogo: publicDirectory.publicProfile == true, mismo orderBy, limit(60),
  startAfter(cursor publico). No se usa UID en el cursor.
- Perfil: publicProfile == true, profileSlug == slug, limit(2), exige exactamente uno.
- Por perfil consultado: marca de eliminacion y catalogo existente de servicios.
- Agenda: resolucion de perfil publicado; luego lecturas/validaciones del dominio
  transaccional existente. No hay listeners nuevos ni consultas por pulsacion.

Se agregan dos indices compuestos de usuarios en firestore.indexes.json para las
consultas anteriores. displayOrder se aplica dentro de cada pagina; no representa
un ranking global paginado. Los filtros indican cuando quedan perfiles sin cargar.
Antes de publicar, asegurar slugs unicos en los perfiles habilitados.

## Seguridad y reservas

No se cambian firestore.rules ni se habilita lectura anonima de usuarios.
La nueva API callable solo devuelve la proyeccion publica aprobada. El rechazo
general de las reglas tambien protege publicDirectoryRate y sus escrituras.
Las escrituras de perfiles mantienen los permisos anteriores; no existe endpoint
anonimo de edicion de perfiles.

managePublicAppointment acepta solo slots/create. Es un adaptador interno del
canal publico al servicio de Agenda, no una segunda agenda. Revalida publicacion,
recepcion de nuevos pacientes, rol clinico, tombstone y configuracion de Agenda.
La entrada no permite patientId, doctorUid, cambios de estado, recurrencia ni
modificar citas ajenas. Requiere consentimiento, nombre, telefono y requestId en
create. Se crean pacientes externos de Agenda segun el flujo existente, sin
crear cuentas ni vinculos de expedientes.

El limite por origen de red es 30 consultas de slots por minuto y 6 solicitudes de
reserva por hora, en publicDirectoryRate. Estos documentos solo contienen ventana,
contador y expiresAt, y su ID es un digest del origen. Se agrega TTL de expiresAt.
No contienen citas, disponibilidad ni datos del formulario.
Validar el comportamiento de rawRequest.ip tras el proxy real antes del despliegue.
La identidad/telefono del visitante no se verifica por SMS en esta entrega.

La clave de actor de reserva se deriva de requestId, estable aunque cambie la red.
Los reintentos de la misma solicitud usan los recibos de Agenda. Tras respuesta
incierta, la UI impide cambiar la solicitud hasta confirmar el resultado del
reintento. El requestId solo vive en memoria: cerrar/recargar la pagina durante una
respuesta incierta requiere comprobar la reserva antes de enviar otra solicitud.
No se persisten datos clinicos en localStorage/sessionStorage.
El guardado vuelve a validar horario, ocupacion, horizonte, pagos y Google.
Las configuraciones con pago obligatorio fallan cerradas; no se simula un pago.

Los cambios del dominio se limitan a identificar el nuevo canal como
public-directory en los recibos, autor y auditoria. WhatsApp conserva su etiqueta
anterior y usa el mismo motor.

## Temas, navegacion y SEO

Se reutilizan theme-preload, public-laboratory-home, publicAppVersion y variables
CSS del tema. El tema claro esta deshabilitado por el proyecto y se migra a oscuro
tanto en theme-preload como en themeService. No se altera esa politica global.
El CSS nuevo contiene soporte claro; su validacion aislada fuerza data-theme=light.
Se mantiene el panel medico medico.html y el editor perfil-profesional.html.
El perfil publico reutilizable se llama profesional.html para evitar colisiones.
Agenda sin parametro conserva su entrada privada y sus componentes habituales.

Titulo, description, canonical y Open Graph se actualizan en navegador.
Los bots de previsualizacion que no ejecutan JS pueden mostrar metadatos genericos;
no hay prerenderizado ni promesa de indexacion individual.

## Pruebas

- node --test tests/professionals-directory.test.mjs tests/appointment-availability-settings.test.mjs
  Paso: 18 pruebas. Incluyen normalizacion, filtros combinados, privacidad,
  publicacion, slug inexistente/duplicado, opcionales, fotos y agendamiento con el
  dominio real usando un doble de persistencia transaccional en memoria.
- node --test tests/professionals-directory.e2e.mjs
  Chrome y CDP existentes; transporte de datos simulado y red externa bloqueada.
  Paso: una prueba de navegador con el flujo completo. Recorre index -> directorio
  -> perfil -> Agenda, navegacion de enlaces por teclado y confirmacion del formulario.
  Comprueba responsive 390/800/1440 y CSS light/dark; incluye fallback e inexistente.
  No equivale a comprobar Functions desplegadas ni permisos reales.
- firebase emulators:exec --only firestore --project demo-cognicion-directory
  "node --test tests/professionals-directory-emulator.test.mjs"
  Intentado: bloqueado porque Firebase CLI requiere Java >=21 y hay Java 17 activo.
  Las pruebas de reglas reales y reservas concurrentes estan escritas, no ejecutadas.

## Trazas temporales

[COGNICION][DIRECTORY]: mensajes discretos de fallo de lectura, solicitudes
rechazadas y confirmacion pendiente. Sin nombres, telefonos, IDs ni rutas.
Se conservan las trazas existentes [AGENDA_TRACE] de operaciones del dominio.
Eliminar o reducir trazas de depuracion tras validar manualmente.

## Validacion pendiente antes de dar por terminado el flujo real

- Activar perfiles consentidos y slugs unicos, incluyendo uno destacado.
- Publicar Functions e indices por el procedimiento del usuario; no se desplego aqui.
- Ejecutar emulador con Java >=21 y confirmar reglas, mutex y reservas simultaneas.
- Probar Google conectado/desconectado, pago obligatorio, slot ocupado durante la
  confirmacion, respuesta incierta y limites de solicitudes.
- Revisar con profesionales reales fotografia optimizada, datos opcionales y
  modalidades/servicios configurados, sin introducir demos en produccion.
- Validar la seleccion del profesional y la cita unica visible en su Agenda privada.
- Validar apariencia clara cuando se reactive globalmente y navegacion movil real.

## Archivos creados

- functions/publicDirectory/model.js
- functions/publicDirectory/service.js
- functions/publicDirectory/appointments.mjs
- functions/publicDirectory/index.js
- js/services/professionalsDirectoryLogic.js
- js/services/professionalsService.js
- js/components/professionalCards.js
- js/medical-directory-preview.js
- js/medical-directory.js
- js/professional-profile.js
- js/agenda/entry.js
- js/agenda/publicBooking.js
- css/professionals.css
- directorio.html
- profesional.html
- tests/professionals-directory.test.mjs
- tests/professionals-directory.e2e.mjs
- tests/professionals-directory-emulator.test.mjs
- docs/directorio-profesionales.md

## Archivos modificados

- index.html
- agenda.html
- functions/index.js
- functions/appointments/service.mjs
- firestore.indexes.json
- js/config/appVersion.js

Las capturas de prueba se generan bajo reports/professionals-directory-*.png.
No se ejecutaron commits ni push; los cambios quedan en main.
