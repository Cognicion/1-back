import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolverDireccionConsultorioReceta } from "../js/utils/recetaMedica.js";

test("la dirección solo se entrega a la receta con consentimiento explícito", () => {
  const perfil = {
    direccionConsultorio: "  Av. Reforma 100, consultorio 4  ",
    mostrarDireccionConsultorioReceta: true
  };

  assert.deepEqual(resolverDireccionConsultorioReceta(perfil), {
    direccionConsultorio: "Av. Reforma 100, consultorio 4",
    mostrarDireccionConsultorioReceta: true
  });
  assert.equal(perfil.direccionConsultorio, "  Av. Reforma 100, consultorio 4  ");
});

test("perfiles previos u ocultos dejan vacío el espacio de dirección", () => {
  assert.deepEqual(resolverDireccionConsultorioReceta({
    direccionConsultorio: "Dirección privada"
  }), {
    direccionConsultorio: "",
    mostrarDireccionConsultorioReceta: false
  });

  assert.deepEqual(resolverDireccionConsultorioReceta({
    direccionConsultorio: "Dirección privada",
    mostrarDireccionConsultorioReceta: false
  }), {
    direccionConsultorio: "",
    mostrarDireccionConsultorioReceta: false
  });
});

test("el perfil profesional captura y persiste dirección y visibilidad", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("../perfil-profesional.html", import.meta.url), "utf8"),
    readFile(new URL("../js/perfil-profesional.js", import.meta.url), "utf8"),
    readFile(new URL("../css/perfil-profesional.css", import.meta.url), "utf8")
  ]);

  assert.match(html, /id="direccionConsultorioPerfil"/);
  assert.match(html, /id="mostrarDireccionConsultorioRecetaPerfil" type="checkbox"/);
  assert.match(html, /Si no se activa, la receta conservará el apartado en blanco/);
  assert.match(js, /direccionConsultorio: campos\.direccionConsultorio\.value\.trim\(\)/);
  assert.match(js, /mostrarDireccionConsultorioReceta: campos\.mostrarDireccionConsultorioReceta\.checked/);
  assert.match(js, /usuario\.mostrarDireccionConsultorioReceta === true/);
  assert.match(css, /\.opcion-visibilidad-receta/);
});

test("la receta usa papel rectangular clásico y siempre reserva el apartado", async () => {
  const [pacienteHtml, pacienteJs, pacienteCss, version] = await Promise.all([
    readFile(new URL("../paciente.html", import.meta.url), "utf8"),
    readFile(new URL("../js/paciente.js", import.meta.url), "utf8"),
    readFile(new URL("../css/paciente.css", import.meta.url), "utf8"),
    readFile(new URL("../js/config/appVersion.js", import.meta.url), "utf8")
  ]);

  assert.match(pacienteHtml, /class="receta-preview receta-preview--clasica"/);
  assert.match(pacienteHtml, /classic-prescription-office-address-v1/);
  assert.match(pacienteJs, /resolverDireccionConsultorioReceta\(medicoActualDatos\)/);
  assert.match(pacienteJs, /<strong>Dirección del consultorio<\/strong>/);
  assert.match(pacienteJs, /direccionConsultorio \? escaparHTML\(direccionConsultorio\) : "&nbsp;"/);
  assert.match(pacienteJs, /width:8\.5in;min-height:5\.5in/);
  assert.match(pacienteJs, /@page\{size:8\.5in 5\.5in;margin:0;\}/);
  assert.match(pacienteCss, /\.receta-preview--clasica/);
  assert.match(pacienteCss, /aspect-ratio: 17 \/ 11/);
  assert.match(pacienteCss, /\.receta-pie-medico/);
  assert.match(version, /classic-prescription-office-address-v1/);
});
