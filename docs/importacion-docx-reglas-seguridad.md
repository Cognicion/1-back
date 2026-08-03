# Reglas minimas para Importar paciente / nota desde DOCX

Este repositorio no contiene `firestore.rules` ni `storage.rules` activos en `firebase.json`.
Estas reglas son un fragmento para integrar en las reglas reales del proyecto sin abrir permisos globales.

## Firestore

```rules
match /usuarios/{uid}/importacionesDocx/{importacionId} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.ownerUid == request.auth.uid;

  allow delete: if request.auth != null
    && request.auth.uid == uid
    && resource.data.ownerUid == request.auth.uid;
}
```

La verificacion de duplicados debe usar:

```text
usuarios/{uid}/importacionesDocx/{sourceFileHash}
```

No debe usar:

```text
getDocs(collection(db, "importacionesDocx"))
```

## Storage

```rules
match /importacionesDocx/{uid}/{hash}/{fileName} {
  allow read, write: if request.auth != null
    && request.auth.uid == uid
    && request.resource.size < 12 * 1024 * 1024
    && request.resource.contentType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}
```

Si se conservan rutas antiguas o rutas de traspaso, deben acotarse por `uid` del mismo modo.

## Traspasar pacientes

El modulo `Traspasar pacientes` ya no debe usar colecciones raiz para metadatos de traspaso o duplicados.

Rutas Firestore esperadas:

```text
usuarios/{uid}/traspasosPacientes/{transferId}
usuarios/{uid}/patientTransferLocks/{transferId}
usuarios/{uid}/importacionesDocx/{sourceFileHash}
usuarios/{patientId}/documentosImportados/{documentId}
usuarios/{patientId}/notasMedicas/{noteId}
```

Fragmento conceptual:

```rules
match /usuarios/{uid}/traspasosPacientes/{transferId} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.ownerUid == request.auth.uid;
}

match /usuarios/{uid}/importacionesDocx/{sourceFileHash} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.ownerUid == request.auth.uid;
}

match /usuarios/{uid}/patientTransferLocks/{transferId} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.ownerUid == request.auth.uid;
}
```

Rutas que no deben utilizarse:

```text
traspasosPacientes/{transferId}
importacionesDocx/{importacionId}
patientTransferLocks/{transferId}
```

## Flujo idempotente esperado

```text
DOCX
-> calcular hash
-> transferOperationId = docx_{sourceFileHash}
-> consultar usuarios/{uid}/traspasosPacientes/{transferOperationId}
-> adquirir usuarios/{uid}/patientTransferLocks/{transferOperationId}
-> reutilizar patientId si ya existe en la operacion
-> buscar paciente existente por CURP, expediente normalizado, nombre + nacimiento o nombre + edad
-> crear paciente solo si no existe coincidencia fuerte ni patientId previo
-> guardar patientId inmediatamente en la operacion
-> crear/reutilizar notas por noteImportKey estable
-> registrar diagnosticos y tratamientos confirmados manualmente
-> guardar documento original
-> registrar auditoria
-> marcar completed o partially_completed/failed con lastCompletedStage
```

Los diagnosticos y tratamientos detectados en el DOCX son candidatos revisables. No deben guardarse si el medico no marca explicitamente `Incluir` en la pantalla de revision.
