import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromeHarness } from "../js/tests/helpers/chrome-cdp.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const p = { id: "qa-professional", profileSlug: "qa-professional", agendaProfessionalId: "qa-professional", displayName: "Profesional de prueba",
  specialties: ["Psiquiatría"], clinicalExperience: ["Ansiedad", "TDAH"], populations: ["Adultos"], modalities: ["En línea"], services: ["Consulta"],
  languages: ["Español"], biography: "Biografía de prueba", photoUrl: "", professionalTitle: "Medicina", professionalLicense: "",
  education: [{ title: "Formación de prueba", institution: "Institución de prueba", year: "2024", description: "" }], professionalExperience: [],
  publicProfile: true, acceptingPatients: true, featured: true };
test("browser: index → directory → profile → existing Agenda, themes and responsive", { timeout: 60000 }, async () => {
  const h = await launchChromeHarness({ rootDirectory: root, initScripts: ['localStorage.setItem("cognicion:theme:last","dark");'] });
  const publicService = "const p=" + JSON.stringify(p) + ';export const getFeaturedProfessionals=async()=>({professionals:[p]});export const getProfessionalsPage=async()=>({professionals:[p],nextCursor:null});export const getProfessional=async slug=>slug===p.id?p:null;export const traceDirectoryError=()=>{};';
  const sdk = 'export const httpsCallable=()=>async data=>{(globalThis.qaCommands||=[]).push(data);return {data:data.action==="slots"?{timeZone:"America/Mexico_City",slots:[{startTime:"09:00"}]}:{result:"applied"}}};';
  await h.cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  h.cdp.on("Fetch.requestPaused", async ({ requestId, request }) => {
    try {
    const url = new URL(request.url);
    let body;
    if (url.pathname === "/js/services/professionalsService.js") body = publicService;
    else if (url.pathname === "/js/firebase.js") body = "export const obtenerFunctions=async()=>({});";
    else if (url.pathname === "/js/services/themeBootstrap.js") body = "";
    else if (url.pathname.endsWith("/firebase-functions.js")) body = sdk;
    else if (url.pathname === "/js/reportes.js" || url.pathname === "/js/services/visitasBootstrap.js" || url.pathname.startsWith("/js/public/interacciones")) body = "";
    if (body !== undefined) await h.cdp.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(body).toString("base64") });
    else if (url.origin === h.origin) await h.cdp.send("Fetch.continueRequest", { requestId });
    else await h.cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    } catch (error) {
      if (!/Invalid InterceptionId|cerrada|closed/i.test(error.message)) throw error;
    }
  });
  const click = async selector => {
    await h.evaluate('document.querySelector(' + JSON.stringify(selector) + ').focus()');
    await h.press("Enter");
  };
  try {
    await h.navigate("/index.html");
    await h.evaluate('document.getElementById("profesionales").scrollIntoView()');
    await h.waitForFunction('document.querySelectorAll("#profesionales .professional-card").length===1');
    await click('a[href="directorio.html"]');
    await h.waitForFunction('document.querySelectorAll("#directoryGrid .professional-card").length===1');
    await h.evaluate('document.querySelector("[name=search]").value="sin coincidencias";document.querySelector("[name=search]").dispatchEvent(new Event("input",{bubbles:true}));');
    assert.equal(await h.evaluate('document.querySelectorAll("#directoryGrid .professional-card").length'), 0);
    await h.evaluate('const f=document.getElementById("directoryFilters");f.elements.search.value="  PSIQUIATRIA ansiedad ";f.elements.search.dispatchEvent(new Event("input",{bubbles:true}));');
    assert.equal(await h.evaluate('document.querySelectorAll("#directoryGrid .professional-card").length'), 1);
    await h.evaluate('document.querySelector("[name=populations]").value="Adultos";document.querySelector("[name=populations]").dispatchEvent(new Event("input",{bubbles:true}));');
    assert.equal(await h.evaluate('document.querySelectorAll("#directoryGrid .professional-card").length'), 1);
    for (const theme of ["dark", "light"]) {
      for (const width of [390, 800, 1440]) {
        await h.setViewport(width, 900);
        await h.evaluate('document.documentElement.dataset.theme=' + JSON.stringify(theme));
        assert.ok(await h.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), theme + " overflow at " + width);
      }
    }
    await h.setViewport(390, 850);
    await h.evaluate('document.documentElement.dataset.theme="light"');
    const shot = await h.cdp.send("Page.captureScreenshot", { format: "png" });
    await mkdir(resolve(root, "reports"), { recursive: true });
    await writeFile(resolve(root, "reports/professionals-directory-mobile-light.png"), Buffer.from(shot.data, "base64"));
    await h.evaluate('document.documentElement.dataset.theme="dark";document.getElementById("directoryGrid").scrollIntoView({behavior:"instant",block:"center"})');
    const dark = await h.cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(root, "reports/professionals-directory-mobile-dark.png"), Buffer.from(dark.data, "base64"));
    const fallback = await h.evaluate('import("/js/components/professionalCards.js").then(({portrait})=>{const frame=portrait({photoUrl:"https://example.invalid/broken.png",displayName:"Synthetic"});const img=frame.querySelector("img");const lazy=img.loading;img.dispatchEvent(new Event("error"));return {lazy,removed:!frame.querySelector("img"),visible:!frame.querySelector(".professional-avatar").hidden};})');
    assert.deepEqual(fallback, {lazy:"lazy",removed:true,visible:true});
    await click('a[href="profesional.html?slug=qa-professional"]');
    await h.waitForFunction('document.querySelector("#professionalProfile h1")');
    assert.equal(await h.evaluate('document.querySelector(".professional-avatar").textContent'), "Sin fotografía");
    await click('a[href="agenda.html?professional=qa-professional"]');
    await h.waitForFunction('document.querySelector("#publicAgenda form")');
    assert.equal(await h.evaluate('document.querySelector("#publicAgenda h2").textContent'), p.displayName);
    await h.evaluate('const date=document.querySelector("[name=date]");date.value="2026-09-14";date.dispatchEvent(new Event("input",{bubbles:true}));');
    await h.evaluate('document.querySelector("#publicAgenda button[type=button]").click()');
    await h.waitForFunction('document.querySelector("[name=time]").options.length===1 || document.querySelector("#publicAgenda [role=status]").textContent.includes("No fue posible")');
    assert.equal(await h.evaluate('document.querySelector("[name=time]").options.length'), 1, await h.evaluate('document.querySelector("#publicAgenda [role=status]").textContent'));
    await h.evaluate('document.querySelector("[name=patientName]").value="Synthetic";document.querySelector("[name=patientPhone]").value="520000000000";document.querySelector("#publicAgenda input[type=checkbox]").checked=true;');
    assert.equal(await h.evaluate('document.querySelector("#publicAgenda form").checkValidity()'), true);
    await h.evaluate('document.querySelector("#publicAgenda button[type=submit]").click()');
    await h.waitForFunction('document.querySelector("#publicAgenda [role=status]").textContent.includes("registrada")');
    assert.equal(await h.evaluate('qaCommands.at(-1).agendaProfessionalId'), p.agendaProfessionalId);
    assert.equal(await h.evaluate('qaCommands.filter(x=>x.action==="create").length'), 1);
    await h.navigate("/profesional.html?slug=missing");
    await h.waitForFunction('document.getElementById("profileStatus").textContent.includes("no existe")');
  } catch (error) {
    console.error("DIRECTORY_QA", await h.evaluate('({url:location.pathname+location.search,status:document.querySelector("#publicAgenda [role=status]")?.textContent,commands:globalThis.qaCommands,dates:[...document.querySelectorAll("[name=date]")].map(x=>({value:x.value,public:!!x.closest("#publicAgenda")})),errors:globalThis.__connectomeQaErrors})').catch(() => null));
    throw error;
  } finally { await h.close(); }
});
