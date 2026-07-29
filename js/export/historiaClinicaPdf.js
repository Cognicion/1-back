let dependencias;
async function cargarDependencias() {
  if (dependencias) return dependencias;
  const cargar = (src) => new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`No se pudo cargar ${src}`)); document.head.appendChild(script); });
  await cargar("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  await cargar("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  dependencias = { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
  return dependencias;
}
export async function descargarHistoriaClinicaPdf(elemento, nombre = "Historia_Clinica") {
  const { html2canvas, jsPDF } = await cargarDependencias();
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await pdf.html(elemento, { margin: [16, 14, 18, 14], autoPaging: "text", html2canvas: { html2canvas, scale: 1.25, backgroundColor: "#ffffff", useCORS: true, logging: false }, callback: (documento) => {
    const total = documento.internal.getNumberOfPages();
    for (let pagina = 1; pagina <= total; pagina += 1) {
      documento.setPage(pagina);
      documento.setFont("helvetica", "normal"); documento.setFontSize(8); documento.setTextColor(102, 117, 110);
      if (pagina > 1) documento.text("Historia clínica | COGNICIÓN LABS", 14, 10);
      documento.text(`Generado mediante COGNICIÓN LABS · Página ${pagina} de ${total} · Versión 1.00`, 14, 289);
    }
    documento.save(`${nombre}.pdf`);
  } });
}
