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
```

Rutas que no deben utilizarse:

```text
traspasosPacientes/{transferId}
importacionesDocx/{importacionId}
```
