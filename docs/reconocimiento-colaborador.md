# Reconocimiento y colaboración

## Flujo de datos

Centro de Control → selección del usuario existente → selección del tipo de colaborador → llamada callable `actualizarReconocimientoColaborador` → validación de autenticación, permiso administrativo y objetivo distinto del administrador → escritura localizada en `usuarios/{uid}.colaborador` y registro atómico en `auditoria` → lectura del documento del usuario durante el inicio habitual del Dashboard → validación de `colaborador.activo` y `colaborador.tipo` → renderizado del componente reutilizable.

Firestore continúa siendo la fuente de verdad. El componente `js/components/reconocimientoColaborador.js` no consulta Firestore y recibe el perfil ya cargado por el Dashboard.

## Datos

La función conserva el rol clínico existente y actualiza únicamente `colaborador`:

```js
{
  activo: true,
  tipo: "estrella",
  fechaAsignacion: serverTimestamp(),
  asignadoPor: "UID_DEL_ADMIN"
}
```

Al retirar el reconocimiento, guarda `activo: false`, `tipo: null`, `fechaAsignacion: null` y `asignadoPor: null`. Los perfiles sin el campo son compatibles y se tratan como no colaboradores.

La fuente única de etiquetas, valores, iconos, títulos, mensajes, visibilidad de contactos y clases visuales es `js/config/tiposColaborador.js`.
