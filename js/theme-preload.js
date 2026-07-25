(function () {
  var modo = "dark";
  try {
    modo = localStorage.getItem("cognicion.apariencia.modoInterfaz") === "light" ? "light" : "dark";
  } catch (error) {
    modo = "dark";
  }
  document.documentElement.dataset.theme = modo;
  document.documentElement.style.colorScheme = modo;
}());
