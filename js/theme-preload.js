// Antes de resolver Firebase Auth no conocemos el UID: el primer render siempre es claro.
// El servicio central aplica después la caché por UID y la preferencia remota válida.
(function () {
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
}());
