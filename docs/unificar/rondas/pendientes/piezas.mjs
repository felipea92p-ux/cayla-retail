// Pendientes de /unificar (2026-10-14): el ícono de «Etiquetas» y el «Ver» de una fila. Clases reales del ERP.
const svg = (d, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  tag: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>`,
  printer: `<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>`,
  pencil: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>`,
  signpost: `<path d="M10 9H4L2 7l2-2h6"/><path d="M14 5h6l2 2-2 2h-6"/><path d="M10 22V4a2 2 0 1 1 4 0v18"/><path d="M8 22h8"/>`,
  flecha: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  alerta: `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
};
const ic = (n, cls = "") => svg(I[n], `lucide lucide-${n === "flecha" ? "arrow-right" : n} ${cls}`);
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
const btn = (texto, icono, clase = "btn-secundario") => `<button type="button" class="btn-cayla ${clase}"><span class="relative inline-flex items-center gap-2">${icono ? ic(icono, "h-4 w-4") : ""}${texto}</span></button>`;

// ===== 1 · «Etiquetas»: la barra de la vista rápida (Productos) y el cajón de una prenda (Existencias) =====
const barraVista = (icono) => `<div class="pe-barra">${btn("Editar", "pencil")}${btn("Etiquetas", icono)}${btn("Rótulo", "signpost")}${btn("Ver en Existencias" + ic("flecha", "h-4 w-4"), "")}</div>`;
const cajon = (icono) => `<div class="pe-cajon"><b>Blusa Emma · Beige</b><div class="pe-barra">${btn("Etiquetas", icono)}${btn("Rótulo", "signpost")}</div></div>`;
const etiquetas = (vista, existencias) => `<div class="dz-lienzo"><span class="dz-et2">Catálogo ▸ Productos · la vista rápida</span>${barraVista(vista)}<span class="dz-et2">Inventario ▸ Existencias · el cajón de una prenda</span>${cajon(existencias)}<p class="dz-nota">Los dos llevan a la pantalla de etiquetas de precio, donde se elige cuántas y se imprime.</p></div>`;
export const etiquetasDemos = { P1: () => etiquetas("tag", "tag"), P2: () => etiquetas("printer", "printer"), A: () => etiquetas("printer", "tag") };

// ===== 2 · «Ver» de una fila (los pendientes del turno en Caja) =====
const filas = [
  ["2 ventas sin comprobante aceptado", "/vender/comprobantes"],
  ["1 apartado vencido", "/vender/apartados"],
  ["3 prendas por regularizar", "/inventario/por-regularizar"],
];
const panel = (accion) => `<div class="pe-panel"><div class="pe-cab"><b>Pendientes del turno</b><span class="dz-nota">Resuélvelos antes de cerrar</span></div>${filas
  .map(([t]) => `<div class="pe-fila"><span class="pe-txt">${ic("alerta", "pe-alerta")}${t}</span>${accion}</div>`)
  .join("")}</div>`;
export const verDemos = {
  P1: () => `<div class="dz-lienzo">${panel(`<a href="#" onclick="return false" class="btn-cayla btn-enlace" style="font-size:13px">Ver</a>`)}</div>`,
  P2: () => `<div class="dz-lienzo">${panel(`<a href="#" onclick="return false" class="btn-cayla btn-secundario btn-chico"><span class="relative inline-flex items-center gap-2">Ver${ic("flecha", "h-4 w-4")}</span></a>`)}</div>`,
  A: () => `<div class="dz-lienzo">${panel(`<a href="#" onclick="return false" class="pe-hoy-ver">Ver</a>`)}</div>`,
};
