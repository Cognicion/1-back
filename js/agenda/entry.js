if (new URLSearchParams(location.search).has("professional")) {
  await import("./publicBooking.js");
} else {
  await import("../agenda.js?v=2.208");
  void import("../components/accesosRapidos.js");
  void import("../reportes.js");
}

