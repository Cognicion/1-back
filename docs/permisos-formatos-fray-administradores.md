# Permisos Fray: acceso administrativo global

## Fuente de verdad

La autorización central está en `js/services/formatosInstitucionales.js`:

- `esAdministradorFormato(usuario, claims)` normaliza el rol mediante `isAdministrator` de `js/utils/roles.js` y admite rol/perfil y Custom Claims.
- `resolverPermisosEfectivosFormatos(...)` devuelve `accesoGlobal`, `origen`, formatos y acciones efectivas.
- `puedeAccederFormato({ usuario, formatoId, accion })` es el punto único utilizado por las operaciones sensibles del cliente.

Un administrador activo recibe `accesoGlobal: true`, `formatosPermitidos: "*"` y `accionesPermitidas: "*"`. No se escriben copias de todos los formatos en su perfil. Una cuenta desactivada, suspendida o eliminada queda denegada aunque conserve el rol histórico.

Los usuarios no administradores conservan permisos granulares por formato y acción. Se aceptan los valores booleanos existentes y objetos de acciones (`ver`, `editar`, `guardar_borrador`, `generar`, `descargar`, `imprimir`, `cancelar`, `administrar_permisos`).

## Centro de Control

`admin.html` y `js/admin.js` ahora incluyen administradores en la lista, filtros por rol, indicador de cuenta y etiqueta “Acceso global a todos los formatos”. Las casillas individuales no se muestran para administradores; si se intenta revocar, se informa que el acceso global proviene del rol y se conserva.

## Seguridad

El backend existente de generación (`functions/noteGenerationHandler.js`) valida el perfil real leído de Firestore, Custom Claims y estado de cuenta antes de permitir un formato institucional. La solicitud de imagenología vuelve a validar en `solicitudesImagenologia.js` antes de escribir.

No existe un archivo de reglas Firestore versionado en este repositorio. Por ello no se modificaron reglas; debe comprobarse en el proyecto Firebase desplegado que las reglas permitan únicamente a los mismos usuarios autorizados escribir solicitudes y estudios.

## Pruebas

`js/tests/clinicalFormatEntitlements.test.mjs` y `functions/test/noteGenerationHandler.test.js` cubren administrador sin permisos individuales, administrador médico, acceso al formato de imagenología, administrador desactivado, permisos granulares, revocación y usuario paciente sin acceso.
