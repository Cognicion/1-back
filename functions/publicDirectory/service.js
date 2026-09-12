"use strict";
const { publicProfile, validSlug } = require("./model");
const { isProfessional } = require("../clinicalAnalytics/access");
const deny = code => { const e = Error(code); e.code = code; throw e; };
function createPublicDirectoryService({ db }) {
  const base = () => db.collection("usuarios").where("publicDirectory.publicProfile", "==", true);
  async function project(snapshot) {
    const raw = snapshot.data();
    if (!isProfessional(raw)) return null;
    const [deleting, services] = await Promise.all([
      db.doc("accountDeletionTombstones/" + snapshot.id).get(),
      db.doc("whatsappBotProfessionals/" + snapshot.id).get()
    ]);
    return deleting.exists ? null : publicProfile(raw, services.exists ? services.data() : null);
  }
  async function resolve(slug) {
    if (!validSlug(slug)) return null;
    const result = await base().where("publicDirectory.profileSlug", "==", slug).limit(2).get();
    if (result.size !== 1) return null;
    const snapshot = result.docs[0], profile = await project(snapshot);
    return profile ? { doctorUid: snapshot.id, profile } : null;
  }
  async function list({ featured = false, cursor = "" } = {}) {
    if (cursor && !validSlug(cursor)) deny("invalid-argument");
    let query = base();
    if (featured) query = query.where("publicDirectory.featured", "==", true);
    query = query.orderBy("publicDirectory.profileSlug");
    if (cursor) query = query.startAfter(cursor);
    const size = featured ? 4 : 60, result = await query.limit(size).get();
    const professionals = (await Promise.all(result.docs.map(project))).filter(Boolean);
    professionals.sort((a, b) => a.displayOrder - b.displayOrder || a.displayName.localeCompare(b.displayName, "es"));
    return { professionals, nextCursor: !featured && result.size === size ? result.docs.at(-1).data().publicDirectory.profileSlug : null };
  }
  return {
    resolve,
    async execute(data = {}) {
      if (data.action === "profile") return { professional: (await resolve(data.slug))?.profile || null };
      if (data.action === "featured") return list({ featured: true });
      if (data.action === "list") return list({ cursor: data.cursor || "" });
      deny("invalid-argument");
    }
  };
}
module.exports = { createPublicDirectoryService };

