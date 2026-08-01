# Flujo de registro y consentimientos legales

## Flujo anterior

`registro.html` mostraba una sola casilla de Aviso de Privacidad. `registro.js` validaba nombre, correo, contraseña, vinculación o código profesional y esa casilla; después creaba la cuenta con Firebase Authentication, escribía el perfil en `usuarios/{uid}`, vinculaba permisos o expediente, registraba auditoría y redirigía al dashboard. La aceptación se guardaba únicamente con campos planos (`aceptoAvisoPrivacidad`, `fechaAceptacionAviso` y `versionAvisoPrivacidad`) y una fecha local ISO.

## Flujo nuevo

`registro.html` muestra dos aceptaciones obligatorias independientes y una preferencia opcional desmarcada. Los documentos se abren en un modal accesible reutilizable sin marcar casillas automáticamente. `registro.js` valida explícitamente ambas casillas antes de cualquier operación de registro; conserva la creación actual de Firebase Auth, perfil, vinculación, código profesional, auditoría y redirección. Una vez creado el perfil, `legalConsentService.js` guarda el registro legal con `merge`, `serverTimestamp` y un reintento seguro. Si la persistencia legal falla, se registra el error y no se redirige silenciosamente.

## Estructura de Firestore

En el mismo documento `usuarios/{uid}` se agrega:

```js
legalConsents: {
  privacyNotice: {
    accepted: true,
    version: "2026-08-01",
    acceptedAt: serverTimestamp(),
    source: "signup",
    documentType: "privacy_notice"
  },
  betaConsent: {
    accepted: true,
    version: "2026-08-01",
    acceptedAt: serverTimestamp(),
    source: "signup",
    documentType: "beta_consent"
  },
  communications: {
    accepted: true, // o false
    version: "2026-08-01",
    acceptedAt: serverTimestamp(),
    source: "signup", // settings al modificarlo posteriormente
    documentType: "communications"
  }
},
legalConsentVersion: "2026-08-01",
legalConsentUpdatedAt: serverTimestamp()
```

Los campos planos existentes se conservan por compatibilidad. No se guardan contraseñas, tokens ni datos clínicos en esta estructura.

## Usuarios existentes y reglas

`obtenerEstadoConsentimientoLegal(usuario)` detecta ausencia, versión anterior o aceptación vigente sin activar todavía un bloqueo general.

No existe un archivo `firestore.rules` ni reglas versionadas en este repositorio. Antes de publicar, debe verificarse en Firebase Console/CLI que el usuario autenticado solo pueda actualizar su propio documento y que los campos de evidencia original no puedan sobrescribirse por clientes o roles administrativos. La actualización de comunicaciones desde la interfaz usa únicamente el documento del usuario autenticado y no modifica las aceptaciones obligatorias.
