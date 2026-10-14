// Ronda 10 de /unificar: los botones de una función — descargar un archivo, abrir los filtros y llevar a ver algo en otra pantalla.
// Las demos usan las clases reales del ERP (btn-cayla, mov-boton, pildora-filtro, titulo-cuenta, enlace-ver, data-voz="cabecera").
const svg = (d, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  descargar: `<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>`,
  filtros: `<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>`,
  flecha: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  lupa: `<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`,
  chev: `<path d="m6 9 6 6 6-6"/>`,
  tag: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>`,
  tienda: `<path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>`,
  x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
};
const ic = (n, cls = "") => svg(I[n], `lucide lucide-${n === "flecha" ? "arrow-right" : n === "descargar" ? "download" : n} ${cls}`);
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// La cabecera de una pantalla (data-voz="cabecera": los botones hablan en versalitas de 11 px y 40 px, ronda 4) y una hoja.
const cabecera = (titulo, botones) =>
  `<div class="r10-cab" data-voz="cabecera"><div><p class="r10-ante">COMPRAS · TIENDA LIMA</p><h4 class="r10-h">${titulo}</h4></div><div class="r10-acc">${botones}</div></div>`;
const hoja = (titulo, cuerpo, pie) => `<div class="r10-hoja"><h5>${titulo}</h5>${cuerpo}<div class="r10-pie">${pie}</div></div>`;

// ================= 1 · DESCARGAR =================
const boton = (peso, texto, { icono = "", final = "", extra = "", clase = "" } = {}) =>
  `<button type="button" class="btn-cayla btn-${peso} ${clase}" ${extra}>${icono}<span class="relative">${texto}</span>${final}</button>`;
const descargarP = (texto, chico = false) => boton("secundario", texto, { icono: ic("descargar", "r10-baja"), clase: `r10-descarga ${chico ? "btn-chico" : ""}`, extra: "data-r10-descarga" });
export const descargar = {
  P1: () =>
    `<div class="dz-lienzo">${cabecera("Facturas de proveedor", descargarP("Descargar Excel") + boton("primario", "+ Registrar factura"))}${hoja(
      "Existencias · filtros",
      `<p class="dz-nota">La lista que ves, en un archivo para abrir en Excel.</p>`,
      descargarP("Descargar CSV", true)
    )}${hoja("Ajuste de inventario", `<p class="dz-nota">El ajuste quedó registrado.</p>`, descargarP("Descargar reporte del ajuste", true))}</div>`,
  P2: () =>
    `<div class="dz-lienzo">${cabecera("Facturas de proveedor", descargarP("Exportar mes") + boton("primario", "+ Registrar factura"))}${hoja(
      "Existencias · filtros",
      `<p class="dz-nota">La lista que ves, en un archivo para abrir en Excel.</p>`,
      descargarP("Exportar CSV", true)
    )}${hoja("Ajuste de inventario", `<p class="dz-nota">El ajuste quedó registrado.</p>`, descargarP("Descargar reporte de este ajuste", true))}</div>`,
  A: () =>
    `<div class="dz-lienzo">${cabecera("Facturas de proveedor", boton("secundario", "Exportar mes", { icono: ic("descargar") }) + boton("primario", "+ Registrar factura"))}${cabecera("Estado de resultados", boton("secundario", "Descargar Excel"))}${hoja(
      "Existencias · filtros",
      ``,
      boton("secundario", "Exportar CSV", { clase: "btn-chico" })
    )}${hoja("Historial de ventas", ``, `<button type="button" class="r10-hoy-exportar">${ic("descargar")}EXPORTAR</button>`)}${hoja("Ajuste de inventario", ``, `<button type="button" class="label-cayla r10-hoy-enlace">Descargar reporte de este ajuste</button>`)}</div>`,
};

// ================= 2 · FILTROS =================
const pildora = (nombre, icono, valor = null) =>
  `<div class="pildora-filtro shrink-0" ${valor ? "data-puesta" : ""}><button type="button" class="pildora-filtro-boton">${ic(icono, "pildora-filtro-icono")}<span class="pildora-filtro-nombre">${valor ? `${nombre}:` : nombre}</span>${valor ? `<span class="pildora-filtro-valor"><span class="truncate">${valor}</span></span>` : ""}${valor ? "" : ic("chev", "pildora-filtro-flecha")}</button>${valor ? `<button type="button" class="pildora-filtro-quitar" aria-label="Quitar">${ic("x")}</button>` : ""}</div>`;
const buscador = `<div class="buscador" style="flex:1 1 220px;max-width:280px">${ic("lupa", "buscador-icono")}<input type="search" placeholder="Prenda, color o código"><span class="buscador-hilo" aria-hidden="true"></span></div>`;
const panel = `<div class="r10-panel" data-r10-panel hidden>${pildora("Categoría", "tag", "Camisas y Blusas")}${pildora("Tienda", "tienda")}</div>`;
const barra = (botonFiltros) => `<div class="dz-papel" style="padding:12px 16px;min-height:150px"><div class="dz-filtros" data-r10-barra>${buscador}${botonFiltros}</div>${panel}<p class="dz-nota" style="margin-top:10px">Toca «Filtros»: abre el panel. Un filtro ya puesto se cuenta.</p></div>`;
const filtrosPildora = (n) =>
  `<div class="pildora-filtro shrink-0" data-r10-filtros><button type="button" class="pildora-filtro-boton" aria-expanded="false">${ic("filtros", "pildora-filtro-icono")}<span class="pildora-filtro-nombre">Filtros</span>${n ? `<span class="titulo-cuenta r10-cuenta">${n}</span>` : ""}${ic("chev", "pildora-filtro-flecha")}</button></div>`;
const filtrosVersalitas = (n, globo) =>
  `<button type="button" class="r10-hoy-filtros ${n ? "activo" : ""}" data-r10-filtros aria-expanded="false">${ic("filtros")}FILTROS${n ? (globo ? `<span class="titulo-cuenta r10-cuenta">${n}</span>` : ` · ${n}`) : ""}</button>`;
const filtrosCuadro = (n) => `<button type="button" class="r10-hoy-cuadro ${n ? "activo" : ""}" data-r10-filtros aria-expanded="false" aria-label="Filtros">${ic("filtros")}${n ? `<b>${n}</b>` : ""}</button>`;
export const filtros = {
  P1: () => `<div class="dz-lienzo">${barra(filtrosPildora(1))}<div class="dz-et2">Existencias (la misma pieza)</div>${barra(filtrosPildora(0))}</div>`,
  P2: () => `<div class="dz-lienzo">${barra(filtrosVersalitas(1, true))}<div class="dz-et2">Existencias (se queda su cuadrado)</div>${barra(filtrosCuadro(0))}</div>`,
  A: () => `<div class="dz-lienzo">${barra(filtrosVersalitas(1, false))}<div class="dz-et2">Existencias</div>${barra(filtrosCuadro(1))}</div>`,
};

// ================= 3 · VER EN OTRA PANTALLA =================
const tarjeta = (titulo, dato, accion) => `<div class="r10-tarjeta"><div><b>${titulo}</b><p class="dz-nota" style="margin:2px 0 0">${dato}</p></div>${accion}</div>`;
const verP1 = (t) => `<a href="#" class="btn-cayla btn-secundario r10-ver" onclick="return false"><span class="relative">${t}</span>${ic("flecha")}</a>`;
const verP2 = (t) => `<a href="#" class="enlace-ver" onclick="return false"><span>${t}</span>${ic("flecha")}</a>`;
export const ver = {
  P1: () =>
    `<div class="dz-lienzo">${tarjeta("Blusa Lino Aurora · Beige", "12 en Tienda Lima · 3 en el almacén", verP1("Ver en Existencias"))}${tarjeta("IGV de septiembre", "S/ 1,284.00 por pagar", verP1("Ver en Facturación"))}${tarjeta("Textiles Andina SAC", "7 comprobantes · S/ 6,510.00 de saldo", verP1("Abrir su ficha"))}</div>`,
  P2: () =>
    `<div class="dz-lienzo">${tarjeta("Blusa Lino Aurora · Beige", "12 en Tienda Lima · 3 en el almacén", verP2("Ver en Existencias"))}${tarjeta("IGV de septiembre", "S/ 1,284.00 por pagar", verP2("Ver en Facturación"))}${tarjeta("Textiles Andina SAC", "7 comprobantes · S/ 6,510.00 de saldo", verP2("Abrir su ficha"))}</div>`,
  A: () =>
    `<div class="dz-lienzo">${tarjeta("Blusa Lino Aurora · Beige", "12 en Tienda Lima · 3 en el almacén", `<a href="#" onclick="return false" class="btn-cayla btn-primario">${ic("tag")}<span class="relative">Ver en Existencias</span></a>`)}${tarjeta("IGV de septiembre", "S/ 1,284.00 por pagar", `<a href="#" onclick="return false" class="btn-cayla btn-sutil btn-chico"><span class="relative">Ver en Facturación</span></a>`)}${tarjeta("Análisis · Blusa Emma", "Datos incompletos", `<a href="#" onclick="return false" class="btn-cayla btn-secundario"><span class="relative">Ver qué falta</span></a>`)}${tarjeta("Textiles Andina SAC", "7 comprobantes · S/ 6,510.00 de saldo", `<a href="#" onclick="return false" class="btn-cayla btn-primario"><span class="relative">Abrir ficha completa →</span></a>`)}</div>`,
};
