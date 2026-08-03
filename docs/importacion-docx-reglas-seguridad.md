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
