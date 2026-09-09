import assert from "node:assert/strict";
import {
  MEMBERSHIP_TYPES,
  obtenerTipoMembresia,
  resolverEntitlementsMembresia,
  usuarioTieneMembresiaPro
} from "../services/subscriptionEntitlementService.js";

assert.deepEqual(MEMBERSHIP_TYPES, { FREE: "gratuita", PRO: "pro" });
assert.equal(obtenerTipoMembresia({}), "gratuita");
assert.equal(obtenerTipoMembresia({ tipoMembresia: "gratuita", membershipTier: "pro" }), "gratuita");
assert.equal(obtenerTipoMembresia({ tipoMembresia: "pro", modalidadRegistroProfesional: "gratuita" }), "pro");
assert.equal(obtenerTipoMembresia({ membershipTier: "plus" }), "pro", "Plus legacy conserva sus beneficios al migrar a Pro");
assert.equal(usuarioTieneMembresiaPro({ tipoMembresia: "pro" }), true);

const gratuita = resolverEntitlementsMembresia({ rol: "medico", tipoMembresia: "gratuita" });
assert.equal(gratuita.canUseGeneralNotes, true);
assert.equal(gratuita.canUseCustomNoteBuilder, false);
assert.equal(gratuita.canManagePlatform, false);

const pro = resolverEntitlementsMembresia({ rol: "medico", tipoMembresia: "pro" });
assert.equal(pro.canAccessAllNonAdminFeatures, true);
assert.equal(pro.canUseCustomNoteBuilder, true);
assert.equal(pro.canUseAdvancedConfigurations, true);
assert.equal(pro.canManagePlatform, false, "Pro nunca concede administración");

const admin = resolverEntitlementsMembresia({ rol: "admin", tipoMembresia: "gratuita" });
assert.equal(admin.canManagePlatform, true);
assert.equal(admin.canAccessAllNonAdminFeatures, true);

console.log("Membresías: gratuita/Pro y frontera administrativa verificadas.");
