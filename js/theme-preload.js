(function () {
  var modo = "dark";
  try {
    var guardado = localStorage.getItem("cognicion.apariencia.modoInterfaz") || "";
    modo = guardado.indexOf("light") === 0 ? "light" : "dark";
  } catch (error) {
    modo = "dark";
  }
  document.documentElement.dataset.theme = modo;
  document.documentElement.style.colorScheme = modo;
}());
