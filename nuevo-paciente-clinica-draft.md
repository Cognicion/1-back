# Flujo de datos: Nuevo Paciente con diagnosticos y tratamiento

Formulario Nuevo Paciente
  ↓
Estado temporal `window.COGNICION_NUEVO_PACIENTE_DRAFT`
  ↓
Validaciones y renderizado del motor reutilizado de `paciente.js`
  ↓
Creacion del paciente con `crearPacienteProvisional`
  ↓
Firestore: documento `usuarios/{pacienteId}`
  ↓
Firestore: subcolecciones `tratamientos` e `indicaciones`
  ↓
Expediente del paciente
  ↓
Renderizado mediante los mismos componentes reutilizados del expediente

Mientras el paciente no existe, diagnosticos, medicamentos e indicaciones permanecen solo en memoria. Al guardar, el documento inicial recibe `diagnostico`, `historialDiagnosticos`, `tratamiento`, `tratamientoActual`, `indicacionesEstructuradas` y `datosClinicosResumen`; despues se crean las subcolecciones definitivas con la misma estructura que usa el expediente.
