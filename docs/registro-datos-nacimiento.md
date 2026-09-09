# Registro: datos completos y nacimiento obligatorio

Estado: cambios locales en `main`, sin commit, push ni despliegue de esta entrega.

## Alcance y flujo

Formulario → validación del nacimiento antes de crear/reanudar Authentication →
verificación del correo profesional → callable → transacción de Firestore → dashboard.

- Paciente: registro por correo del profesional o código de vinculación.
- Médico, psicólogo y enfermería/salud mental: gratuita o Pro con código administrativo.
- Nombre, correo autenticado, rol, membresía, fecha de nacimiento y consentimientos
  se guardan en el perfil existente de `usuarios/{uid}`. No se crea otra fuente de verdad.
- `fechaNacimiento` es una fecha civil `YYYY-MM-DD`, sin hora. Se rechazan fechas
  ausentes, imposibles y futuras en página y servidor. No se añadió una edad mínima.
- Los consentimientos conservan el esquema legal actual y timestamps del servidor;
  ahora forman parte de la transacción del perfil, no de una segunda escritura cliente.
- El código Pro se valida y consume en la misma transacción del alta. Pro no concede Admin.
- El formulario bloquea cambios de rol/modalidad y dobles clics durante el alta.
  Se solicita confirmación del navegador si se intenta salir con el alta en curso.
- Los reintentos conservan datos ya guardados, cuotas y membresía; completan únicamente
  nacimiento/consentimientos faltantes de un alta anterior compatible con el mismo rol y modalidad.
- La vinculación de un expediente previo conserva el nacimiento y los consentimientos
  capturados por la cuenta: un valor vacío del expediente ya no los sobreescribe.

## Causas comprobadas

El perfil profesional se crea después de verificar el correo, nunca antes. El flujo
anterior requería además otra escritura desde el navegador para guardar consentimientos;
una interrupción entre ambas operaciones podía dejar el perfil sin ellos.

La prueba de vinculación reprodujo además la pérdida de nacimiento: el campo vacío
del expediente provisional sobreescribía el de la cuenta. La prueba falló antes del
ajuste y pasó después.

## Límites explícitos

- Authentication y Firestore no son una única transacción. Mientras no se verifique
  el correo y finalice la callable, una cuenta profesional puede aparecer como pendiente.
- Se mantiene la espera automática de verificación hasta diez minutos. El usuario debe
  mantener la pestaña abierta; si la cierra o vence la espera, puede reanudar con su correo
  y contraseña y volver a ingresar los datos. No se guardan contraseñas, códigos ni fechas
  de nacimiento en almacenamiento local del navegador para crear borradores.
- No se modificaron cuentas reales ni se hizo una migración de usuarios existentes.
- El emulador de Firestore terminó con código 1 durante el arranque; no se ejecutó la
  prueba integrada Auth/Firestore/Functions en esta entrega. No se afirma validación en producción.

## Publicación pendiente

Publicar coordinadamente las funciones y la página. Solo actualizar el HTML/JS no actualiza
el backend que valida y guarda el nacimiento. Las pestañas antiguas deben recargarse.

Funciones afectadas, proyecto `cognicion-57052`, región `us-central1`:

- `registerProfessional`
- `registerProfessionalWithCode`
- `registerPatientProfile`
- `manageAccountLinking`

No se requieren reglas, índices ni nuevas funciones para esta entrega. Los cambios
concurrentes de agenda, calendario y navegación presentes en el repositorio son ajenos.

## Archivos de esta entrega

Implementación:

- `registro.html` (se preservó el cambio concurrente de theme-preload).
- `css/registro.css`.
- `js/registro.js`.
- `js/utils/fechaNacimientoRegistro.js` (nuevo).
- `js/services/professionalRegistrationService.js`.
- `js/services/professionalPatientAccessService.js`.
- `functions/accountSecurity/registrationProfile.js` (nuevo).
- `functions/accountSecurity/professionalRegistration.js`.
- `functions/accountSecurity/professionalPatientAccess.js`.
- `functions/accountLinking/service.js`.
- `js/config/appVersion.js`: esta entrega incrementó **2.204 → 2.205**. Durante la
  tarea, un cambio paralelo de navegación incrementó la versión vigente a **2.206**;
  se preservaron ambos incrementos y sus marcadores.

Pruebas y documentación:

- `functions/test/profileSecurity.test.js`.
- `functions/test/professionalPatientAccess.test.js`.
- `functions/test/accountLinkingService.test.js`.
- `functions/test/emulator/professionalRegistrationFlow.test.mjs`.
- `functions/test/emulator/freeProfessionalPatientLimitFlow.test.mjs`.
- `functions/test/emulator/accountDeletionFlow.test.mjs`.
- `tests/free-professional-registration-static.test.mjs`.
- `tests/registration-birth-date.test.mjs` (nuevo).
- `tests/registration-flow-runtime.test.mjs` (nuevo).
- Este documento.

## Validación local

116 pruebas aprobadas (dominio, seguridad, transacciones simuladas y ejecución de los
manejadores/adaptadores del formulario con infraestructura simulada):

```powershell
node --test functions/test/accountLinkingService.test.js functions/test/accountLinkingContract.test.js functions/test/accountLinkingValidation.test.js functions/test/profileSecurity.test.js functions/test/professionalPatientAccess.test.js functions/test/membershipAdministration.test.js tests/registration-birth-date.test.mjs tests/registration-flow-runtime.test.mjs tests/free-professional-registration-static.test.mjs tests/admin-membership-static.test.mjs tests/provisional-patient-folio-static.test.mjs tests/professional-backend-release-verification.test.mjs
```

Comprobación visual local con Chrome headless a 1440 y 390 px: nacimiento visible,
obligatorio y dentro de pantalla. Sin llamadas a Firebase; scripts de infraestructura
deshabilitados únicamente en esa comprobación visual.

`git diff --check` sobre los archivos de esta entrega no detectó errores; Git reporta
los avisos habituales de normalización LF/CRLF. `HEAD...origin/main`: 0 por delante,
0 por detrás según la referencia local al cierre de la revisión.
