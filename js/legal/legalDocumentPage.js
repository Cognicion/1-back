import { betaConsent, privacyNotice } from "./legalDocuments.js";

const documento = document.body.dataset.legalDocument === "beta_consent" ? betaConsent : privacyNotice;
document.title = `${documento.title} | COGNICIÓN Labs`;
document.getElementById("legalTitle").textContent = documento.title;
document.getElementById("legalMeta").textContent = `Versión ${documento.version} · Última actualización: ${documento.updatedAt}`;
const container = document.getElementById("legalContent");
container.replaceChildren(...documento.sections.flatMap(([heading, text]) => { const section = document.createElement("section"); const h2 = document.createElement("h2"); h2.textContent = heading; const p = document.createElement("p"); p.textContent = text; section.append(h2, p); return [section]; }));
