import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
assert.match(repository, /doc\(db, "usuarios", userUid, TRANSFER_COLLECTION, operationId\)/, "el registro de traspaso se crea bajo el usuario por operationId");
assert.doesNotMatch(repository, /addDoc\(collection\(db, TRANSFER_COLLECTION\)/, "no escribe en la coleccion raiz traspasosPacientes");
assert.doesNotMatch(repository, /collection\(db, DOCX_IMPORT_CONFIG\.duplicateCollection\)/, "no escribe ni consulta duplicados en coleccion raiz");
assert.match(repository, /doc\(db, "usuarios", user\.uid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection, document\.hash\)/, "el duplicado se registra bajo el usuario por hash");
assert.match(repository, /transferOperationIdForGroup/, "usa un transferOperationId estable por grupo/documento");
assert.doesNotMatch(repository, /\{\s*\.\.\.group\.confirmedFields,\s*transferOperationId\s*\}/, "no usa transferOperationId fuera de alcance al crear paciente");
assert.match(repository, /transferOperationId: operationId/, "pasa operationId explicitamente como transferOperationId");
assert.match(repository, /acquireTransferOperation/, "adquiere operacion persistente antes de crear paciente");
assert.match(repository, /patientTransferLocks/, "usa bloqueo persistente por operacion");
assert.match(repository, /operation\.data\?\.patientId/, "reutiliza patientId si la operacion ya lo tenia");
assert.match(repository, /noteImportKey/, "las notas usan una llave idempotente");
assert.match(repository, /duplicate-operation-query/, "detecta operaciones previas por hash antes de crear");
assert.match(repository, /stage = "creating_patient"/, "traza etapa de creacion de paciente");
assert.match(repository, /stage = "creating_note"/, "traza etapa de creacion de nota");
assert.match(repository, /createImportedDiagnoses/, "registra diagnosticos confirmados desde el traspaso");
assert.match(repository, /createImportedTreatments/, "registra tratamientos confirmados desde el traspaso");
assert.match(repository, /stage = "uploading_source"/, "traza etapa de subida del DOCX");
assert.ok(repository.indexOf('stage = "creating_note"') < repository.indexOf('stage = "uploading_source"'), "crea la nota antes de guardar el DOCX original");
assert.ok(repository.indexOf('stage = "creating_audit"') < repository.indexOf('"update-transfer-record"'), "auditoria termina antes de actualizar la operacion como completada");
assert.doesNotMatch(repository, /deleteDoc\(doc\(db, "usuarios", patientId\)\)/, "no borra pacientes automaticamente ante fallos parciales");
assert.match(repository, /status: patientId \? "partially_completed" : "failed"/, "conserva estado parcial cuando ya existe patientId");
assert.match(repository, /lastCompletedStage: patientId \? "patient_created" : "reviewed"/, "conserva el patientId como ultima etapa completada");
assert.match(repository, /lockRef\(user\.uid, operationId\)/, "actualiza el lock persistente al fallar o completar");
assert.match(repository, /mark-transfer-failed/, "la rama de error tambien tiene timeout y no bloquea saving");
assert.match(repository, /patientName: group\.confirmedFields\?\.nombre/, "el resultado conserva nombre visible del paciente");
assert.match(repository, /withPatientTransferTimeout/, "cada etapa critica usa timeout tecnico");
assert.match(repository, /TIMEOUTS/, "los timeouts estan centralizados");
assert.match(repository, /onProgress/, "el guardado reporta progreso por etapa real");

const view = read("js/modules/patient-transfer/ui/patientTransferView.js");
assert.match(view, /result\.patientName/, "la UI muestra nombre del paciente antes que IDs tecnicos");
assert.doesNotMatch(view, /Paciente: \$\{escapeHtml\(result\.patientId/, "la UI no muestra el UID/ID como nombre de paciente");
assert.match(view, /syncPatientNameInputs/, "la UI recalcula nombre completo al editar partes");
assert.match(view, /setTransferSavingState/, "la UI bloquea acciones durante saving");
assert.match(view, /data-transfer-dx-include/, "la UI exige confirmacion explicita para diagnosticos");
assert.match(view, /data-transfer-tx-include/, "la UI exige confirmacion explicita para tratamientos");
assert.match(view, /No se detectaron diagnosticos explicitos/, "la seccion de diagnosticos se muestra aunque no haya candidatos");
assert.match(view, /No se detectaron tratamientos explicitos/, "la seccion de tratamientos se muestra aunque no haya candidatos");
assert.match(view, /data-transfer-close-result/, "la UI ofrece cierre claro despues del resultado");
assert.match(view, /data-transfer-back-review/, "la UI permite volver a la revision tras un fallo");
assert.match(view, /setPatientTransferVisualStatus/, "la UI diferencia saving, fallo y resultado final");

const adapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
assert.match(adapter, /nombres/, "payload de paciente incluye nombres");
assert.match(adapter, /apellidoPaterno/, "payload de paciente incluye apellido paterno");
assert.match(adapter, /apellidoMaterno/, "payload de paciente incluye apellido materno");
assert.match(adapter, /nombreCompleto/, "payload de paciente mantiene nombre completo compatible");

const controller = read("js/modules/patient-transfer/patientTransferController.js");
const transferState = read("js/modules/patient-transfer/patientTransferState.js");
assert.match(controller, /transferOperationId: `docx_\$\{hash\}`/, "el operationId se crea desde el analisis del hash");
assert.match(controller, /try \{[\s\S]*saveTransferredGroups[\s\S]*catch/, "el guardado principal usa try/catch");
assert.match(controller, /finally \{[\s\S]*setTransferSavingState\(false\)/, "el guardado principal siempre libera saving en finally");
assert.match(controller, /isTransferSaving\(\)/, "evita doble confirmacion");
assert.match(controller, /render-result:start/, "traza inicio de render final");
assert.match(controller, /render-result:success/, "traza exito de render final");
assert.match(controller, /setPatientTransferExecutionState\(\{[\s\S]*isSaving: true/, "guarda saving en el estado central antes de persistir");
assert.match(controller, /data-transfer-retry/, "el controlador permite reintentar usando la misma revision");
assert.match(transferState, /transferOperationId/, "el operationId se conserva en el estado central");
assert.match(transferState, /lastCompletedStage/, "el estado conserva la ultima etapa alcanzada");
assert.match(transferState, /isSaving/, "el estado central expone el bloqueo de guardado");

const timeout = read("js/modules/patient-transfer/patientTransferTimeout.js");
assert.match(timeout, /PatientTransferTimeoutError/, "existe error especifico de timeout");
assert.match(timeout, /Promise\.race/, "el timeout no deja promesas pendientes sin estado UI");

const medico = read("js/medico.js");
assert.match(medico, /status === "merged"/, "medico.html oculta fusionados de la lista activa");
assert.match(medico, /btnRevisarDuplicadosPacientes/, "medico.html expone herramienta de revision de duplicados");

const duplicates = read("js/modules/patient-duplicates/index.js");
assert.match(duplicates, /status: "merged"/, "la fusion archiva duplicados como merged");
assert.match(duplicates, /mergedIntoPatientId/, "la fusion conserva referencia al principal");
assert.match(duplicates, /notasMedicas/, "la fusion conserva notas conocidas");
assert.match(duplicates, /documentosImportados/, "la fusion conserva documentos conocidos");

console.log("patient-transfer-save-flow.test.mjs OK");
