# Ampliación localizada de Historia Clínica

## Investigación de la implementación existente

- HTML principal: `historia.html`.
- CSS del módulo: `css/historia.css`.
- Controlador: `js/historia.js`.
- Acceso a datos: `js/services/historias.js`.
- Documento Firestore: `usuarios/{uidPaciente}/historiaClinica/historiaInicial`.
- Lectura: `obtenerHistoriaClinica(uidPaciente)`.
- Escritura: `guardarHistoriaClinica(uidPaciente, datosHistoria)`, mediante `setDoc(..., { merge: true })`.
- Auditoría existente: `registrarEventoAuditoria`, con `accion: "guardar_historia_clinica"`.
- Exportación existente: impresión del DOM mediante `window.print()`; no se encontró un exportador PDF/Word independiente.

La historia existente utiliza un objeto plano para los campos generales y conserva los apartados antiguos `tabaco`, `alcohol` y `otrasSustancias`. No existe un formulario separado de visualización: el mismo documento se carga en los campos editables y se imprime.

## Flujo anterior

Paciente seleccionado → `cargarPaciente()` → `obtenerHistoriaClinica()` → combinación con valores predeterminados → asignación a los campos del DOM → edición → `guardarHistoria()` → normalización de medidas → `guardarHistoriaClinica()` → actualización compatible del documento de usuario → auditoría existente → `window.print()`.

## Flujo corregido

Paciente seleccionado → carga habitual de Historia Clínica → lectura de Firestore → normalización compatible de campos nuevos y sustancias antiguas → carga diferida del componente `sustanciasHistoria` → selección y edición en estado local normalizado → validación no destructiva → escritura localizada con `merge: true` → auditoría existente → lectura posterior durante el inicio habitual → renderizado e impresión de cada sustancia por separado.

## Modelo añadido

```js
{
  historiaFamiliar: "",
  historiaAcademica: "",
  historiaLaboral: "",
  sustancias: {
    seleccionadas: [{
      sustanciaId: "cannabis",
      nombrePersonalizado: "",
      inicioConsumo: { fecha: "", edad: null, textoAproximado: "" },
      ultimoConsumo: { fecha: "", consumoActual: false, textoAproximado: "" },
      descripcion: ""
    }],
    observacionesGenerales: ""
  }
}
```

El catálogo no se guarda en el expediente. El nombre visible se resuelve desde `js/data/catalogoSustancias.js`. El componente `js/components/sustanciasHistoria.js` conserva los textos antiguos como `observacionesGenerales` cuando encuentra `sustancias` o `consumoSustancias` con formato textual, sin migración destructiva.

## Fuente de verdad y compatibilidad

El catálogo y sus categorías están centralizados en `js/data/catalogoSustancias.js`; los registros del paciente solo guardan IDs y datos clínicos. La selección se mantiene en un único `Map` local del componente, se deduplica por `sustanciaId` y no genera consultas ni guardados por cada cambio.

Los campos antiguos `tabaco`, `alcohol` y `otrasSustancias` permanecen en el formulario y en el documento. Los usuarios sin los tres campos narrativos o sin `sustancias` reciben valores predeterminados seguros.

## Validación y trazas temporales

Se validan edad, fechas, orden cronológico y nombre de “Otra sustancia” sin borrar lo escrito. Las trazas técnicas bajo `[HistoriaClinica]` y `[HistoriaClinica:Sustancias]` solo contienen IDs, acciones y conteos; deben retirarse después de la validación manual.
