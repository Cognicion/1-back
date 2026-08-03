function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function valueOf(doc, key) {
  return doc.fields?.[key]?.value || "";
}

function groupKeyForDocument(doc) {
  const expediente = normalize(valueOf(doc, "expediente"));
  if (expediente) return `exp:${expediente}`;
  const curp = normalize(valueOf(doc, "curp"));
  if (curp) return `curp:${curp}`;
  const nombre = normalize(valueOf(doc, "nombre"));
  const nacimiento = normalize(valueOf(doc, "fechaNacimiento"));
  if (nombre && nacimiento) return `name-dob:${nombre}:${nacimiento}`;
  const edad = normalize(valueOf(doc, "edad"));
  if (nombre && edad) return `name-age:${nombre}:${edad}`;
  if (nombre) return `name:${nombre}`;
  return `single:${doc.id}`;
}

function mergeFields(groupFields = {}, docFields = {}, conflicts = []) {
  const next = { ...groupFields };
  Object.entries(docFields).forEach(([key, field]) => {
    if (!next[key]) {
      next[key] = field;
      return;
    }
    if (normalize(next[key].value) !== normalize(field.value)) {
      conflicts.push({ key, current: next[key], incoming: field });
    }
  });
  return next;
}

export function groupDocumentsByPatient(documents = []) {
  const groupsByKey = new Map();
  documents.forEach((doc) => {
    const key = groupKeyForDocument(doc);
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        id: `group-${groupsByKey.size + 1}`,
        groupingKey: key,
        fields: {},
        documents: [],
        conflicts: [],
        action: "create",
        selectedPatientId: "",
        omitted: false
      });
    }
    const group = groupsByKey.get(key);
    group.documents.push(doc);
    group.fields = mergeFields(group.fields, doc.fields, group.conflicts);
    group.conflicts.push(...(doc.conflicts || []));
  });

  return [...groupsByKey.values()].map((group) => ({
    ...group,
    ambiguous: group.conflicts.length > 0 || !group.fields.nombre?.value
  }));
}
