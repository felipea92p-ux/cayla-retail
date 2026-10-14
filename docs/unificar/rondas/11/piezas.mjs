// Ronda 11 de /unificar: los botones de una sola función que quedan — cancelar, limpiar los filtros e imprimir.
// Las demos usan las clases reales del ERP (btn-cayla, mov-boton, vacio-filtro, btn-enlace, pildora-cayla, data-voz="cabecera").
const svg = (d, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  printer: `<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>`,
  "funnel-x": `<path d="M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473"/><path d="m16.5 3.5 5 5"/><path d="m21.5 3.5-5 5"/>`,
  x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  lupa: `<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`,
  plus: `<path d="M5 12h14"/><path d="M12 5v14"/>`,
  "arrow-right": `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
};
const ic = (n, cls = "") => svg(I[n], `lucide lucide-${n} ${cls}`);
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

const btn = (peso, texto, { icono = "", clase = "", extra = "" } = {}) =>
  `<button type="button" class="btn-cayla btn-${peso} ${clase}" ${extra}><span class="relative inline-flex items-center gap-2">${icono}${texto}</span></button>`;
const mas = (t) => `<span class="relative inline-flex items-center gap-1.5">${ic("plus", "h-3.5 w-3.5")}${t}</span>`;

// Una hoja de verdad: su título, unos campos de muestra y el pie. `ancho` en px: 440 (la hoja angosta de Caja), 600 (la de catálogo).
const campo = (et, valor) => `<div class="r11-campo"><span class="campo-etiqueta">${et}</span><div class="caja-cayla caja-campo r11-caja">${valor}</div></div>`;
const hoja = (titulo, cuerpo, pie, ancho = 440, extra = "") => `<div class="r11-hoja" style="width:min(100%,${ancho}px)" ${extra}><h5>${titulo}</h5>${cuerpo}${pie}</div>`;
const gasto = campo("Monto", "S/ 18.50") + campo("En qué se gastó", "Refrigerio del turno");
const categoria = campo("Nombre", "Camisas y Blusas") + campo("Prefijo", "CAM");

// ================= 1 · CANCELAR =================
// Pie a la derecha, cada botón a su medida (la de Categorías, Colores, Configuración y la ficha del producto).
const pieDerecha = (cancelar, principal, izquierda = "") =>
  `<div class="r11-pie r11-pie-derecha">${izquierda ? `<div class="r11-pie-izq">${izquierda}</div>` : ""}<div class="r11-pie-der">${cancelar}${principal}</div></div>`;
// Pie en dos mitades iguales (la de Caja, Vender, Colaboradores y casi todas las hojas angostas).
const pieMitades = (cancelar, principal) => `<div class="r11-pie r11-pie-mitades">${cancelar}${principal}</div>`;
const cancelar = (clase = "") => btn("secundario", "Cancelar", { clase });
const guardar = (t = "Guardar", clase = "") => btn("primario", t, { clase });
const desactivar = btn("peligro", "Desactivar categoría");
const flujoCancelar = `<button type="button" class="mov-boton label-cayla r11-flujo-sec">Cancelar</button>`;
const flujoConfirmar = `<button type="button" class="mov-boton r11-flujo-rojo">Confirmar cambio</button>`;
const celular = (html) => `<div class="r11-celular"><span class="dz-et2">A 375 px</span>${html}</div>`;

export const cancelarDemos = {
  P1: () =>
    `<div class="dz-lienzo"><div class="r11-fila">${hoja("Registrar gasto", gasto, pieDerecha(cancelar(), guardar("Registrar gasto")))}${hoja(
      "Editar categoría",
      categoria,
      pieDerecha(cancelar(), guardar(), desactivar),
      600,
    )}${celular(hoja("Registrar gasto", gasto, pieMitades(cancelar("flex-1"), guardar("Registrar gasto", "flex-1")), 343))}</div></div>`,
  P2: () =>
    `<div class="dz-lienzo"><div class="r11-fila">${hoja("Registrar gasto", gasto, pieMitades(cancelar("flex-1"), guardar("Registrar gasto", "flex-1")))}${hoja(
      "Editar categoría",
      categoria,
      `<div class="r11-pie r11-pie-con-izq"><div class="r11-pie-izq">${desactivar}</div><div class="r11-pie-mitades r11-crece">${cancelar("flex-1")}${guardar("Guardar", "flex-1")}</div></div>`,
      600,
    )}${celular(hoja("Registrar gasto", gasto, pieMitades(cancelar("flex-1"), guardar("Registrar gasto", "flex-1")), 343))}</div></div>`,
  A: () =>
    `<div class="dz-lienzo"><div class="r11-fila">${hoja("Registrar gasto (Caja)", gasto, pieMitades(cancelar("flex-1"), guardar("Registrar gasto", "flex-1")))}${hoja(
      "Editar categoría",
      categoria,
      pieDerecha(cancelar(), guardar(), desactivar),
      600,
    )}${hoja("Nueva compra", campo("Proveedor", "Textiles Andina SAC"), pieDerecha(btn("sutil", "Cancelar"), guardar("Registrar factura")))}${hoja(
      "Editar marca",
      campo("Nombre", "Zara"),
      `<div class="r11-pie" style="justify-content:flex-start;gap:12px">${guardar()}<button type="button" class="label-cayla r11-hoy-vers">Cancelar</button></div>`,
    )}${hoja("Cambio (flujo del mostrador)", campo("Prenda nueva", "Blusa Emma · M · Negro"), `<div class="r11-pie" style="justify-content:flex-end">${flujoCancelar}${flujoConfirmar}</div>`)}</div></div>`,
};

// ================= 2 · LIMPIAR =================
const buscador = `<div class="buscador" style="flex:1 1 220px;max-width:300px">${ic("lupa", "buscador-icono")}<input type="search" placeholder="Proveedor, RUC o número"><span class="buscador-hilo" aria-hidden="true"></span></div>`;
const puestos = ["Textiles Andina SAC", "Vencidas", "Septiembre"];
// La píldora de un filtro puesto ya decidida (la de los vacíos, ronda 5): tinta, con su ✕, se encoge al quitarse.
const pildoraPuesta = (t) => `<button type="button" class="vacio-filtro" data-r11-quitar>${t}${ic("x")}</button>`;
const chipHoy = (t) => `<button type="button" class="label-cayla r11-hoy-chip" data-r11-quitar>${t}<span aria-hidden="true">×</span></button>`;
const fila = (chips, limpiar) => `<div class="dz-papel r11-filtros"><div class="r11-fila-busca">${buscador}</div><div class="r11-puestos" data-r11-fila>${chips}${limpiar}</div><p class="dz-nota">Toca un filtro para quitarlo, o limpia todos de una vez (la demo los vuelve a poner).</p></div>`;
const limpiarEnlace = (t = "Limpiar todo") => `<button type="button" class="btn-cayla btn-enlace r11-limpiar" data-r11-limpiar>${t}</button>`;
const limpiarPildora = (t = "Limpiar todo") => `<button type="button" class="pildora-cayla r11-limpiar-pildora" data-r11-limpiar>${ic("funnel-x", "h-3.5 w-3.5")}${t}</button>`;
const hojaFiltros = (limpiar) =>
  hoja("Filtros", `<p class="dz-nota" style="margin:0">Categoría, talla, color…</p>`, pieMitades(limpiar, guardar("Ver 24 prendas", "flex-1")), 343);
// El pie del calendario de una fecha («Hoy» y «Limpiar») y la barra de «Pagar juntos» en Por pagar («Limpiar» quita la selección).
const calendario = (hoy, limpiar) => `<div class="r11-hoja r11-calendario" style="width:min(100%,280px)"><span class="dz-et2">El pie del calendario de una fecha</span><div class="r11-cal-dias">${Array.from({ length: 14 }, (_, i) => `<span class="${i === 9 ? "r11-cal-elegido" : ""}">${i + 8}</span>`).join("")}</div><div class="r11-cal-pie">${hoy}${limpiar}</div></div>`;
const seleccion = (limpiar) => `<div class="r11-hoja r11-seleccion" style="width:min(100%,520px)"><span class="dz-et2">Por pagar · 3 comprobantes marcados</span><div class="r11-sel-barra"><span><b>3</b> marcados · S/ 2,140.00</span><div class="r11-sel-acc">${limpiar}${btn("primario", "Pagar juntos")}</div></div></div>`;
const enlaceChico = (t) => `<button type="button" class="btn-cayla btn-enlace" style="font-size:13px">${t}</button>`;
const versHoy = (t) => `<button type="button" class="label-cayla r11-hoy-vers">${t}</button>`;
const extrasP = () => `<div class="r11-fila" style="margin-top:16px">${calendario(enlaceChico("Hoy"), enlaceChico("Limpiar"))}${seleccion(enlaceChico("Limpiar"))}</div>`;
export const limpiarDemos = {
  P1: () =>
    `<div class="dz-lienzo">${fila(puestos.map(pildoraPuesta).join(""), limpiarEnlace())}<div class="r11-fila">${celular(hojaFiltros(btn("secundario", "Limpiar", { clase: "flex-1" })))}</div>${extrasP()}</div>`,
  P2: () =>
    `<div class="dz-lienzo">${fila(puestos.map(pildoraPuesta).join(""), limpiarPildora())}<div class="r11-fila">${celular(hojaFiltros(btn("secundario", "Limpiar", { clase: "flex-1" })))}</div>${extrasP()}</div>`,
  A: () =>
    `<div class="dz-lienzo">${fila(puestos.map(chipHoy).join(""), `<button type="button" class="label-cayla r11-hoy-limpiar" data-r11-limpiar>Limpiar todo</button>`)}<div class="r11-fila">${celular(
      hojaFiltros(btn("sutil", "Limpiar")),
    )}<div class="r11-hoja" style="width:min(100%,343px)"><h5>Frescura</h5><p class="dz-nota" style="margin:0">Ninguna prenda con estos filtros.</p><div>${`<button type="button" class="btn-cayla btn-enlace" style="font-size:14px">Quitar filtros</button>`}</div></div></div><div class="r11-fila" style="margin-top:16px">${calendario(versHoy("Hoy"), versHoy("Limpiar"))}${seleccion(versHoy("Limpiar"))}</div></div>`,
};

// ================= 3 · IMPRIMIR =================
const imprimir = (peso, texto, clase = "") => btn(peso, texto, { icono: ic("printer", "r11-imprime h-4 w-4"), clase: `r11-boton-imprimir ${clase}`, extra: "data-r11-imprimir" });
const cabecera = (titulo, botones) =>
  `<div class="r11-cab" data-voz="cabecera"><div><p class="r11-ante">COMPRAS · ÓRDENES</p><h4 class="r11-h">${titulo}</h4></div><div class="r11-acc">${botones}</div></div>`;
const vendida = (boton) =>
  hoja(
    "Venta registrada",
    `<p class="dz-nota" style="margin:0">Boleta B001-00042 · S/ 79.90 · Efectivo</p>`,
    `<div class="r11-pie" style="flex-direction:column;align-items:stretch">${boton}<button type="button" class="btn-cayla btn-secundario"><span class="relative">Nueva venta</span></button></div>`,
    380,
  );
export const imprimirDemos = {
  P1: () =>
    `<div class="dz-lienzo">${cabecera("Orden OC-0012", imprimir("secundario", "Imprimir la orden") + btn("primario", mas("Registrar comprobante")))}<div class="r11-fila">${vendida(
      imprimir("primario", "Imprimir ticket"),
    )}${hoja("Producto creado", `<p class="dz-nota" style="margin:0">Blusa Lino Aurora · 3 colores · 12 prendas</p>`, `<div class="r11-pie">${imprimir("primario", "Imprimir etiquetas")}${btn("secundario", `Ir a productos${ic("arrow-right", "h-4 w-4")}`)}</div>`, 420)}</div></div>`,
  P2: () =>
    `<div class="dz-lienzo">${cabecera("Orden OC-0012", imprimir("secundario", "Imprimir la orden") + btn("primario", mas("Registrar comprobante")))}<div class="r11-fila">${vendida(
      imprimir("secundario", "Imprimir ticket"),
    )}${hoja("Producto creado", `<p class="dz-nota" style="margin:0">Blusa Lino Aurora · 3 colores · 12 prendas</p>`, `<div class="r11-pie">${imprimir("secundario", "Imprimir etiquetas")}${btn("secundario", `Ir a productos${ic("arrow-right", "h-4 w-4")}`)}</div>`, 420)}</div></div>`,
  A: () =>
    `<div class="dz-lienzo">${cabecera(
      "Orden OC-0012",
      btn("secundario", `${ic("printer", "h-3.5 w-3.5")} Imprimir o guardar PDF`) + btn("primario", mas("Registrar comprobante")),
    )}<div class="r11-fila">${vendida(btn("primario", `${ic("printer", "h-4 w-4")}Imprimir y nueva venta`))}${hoja(
      "Producto creado",
      `<p class="dz-nota" style="margin:0">Blusa Lino Aurora · 3 colores · 12 prendas</p>`,
      `<div class="r11-pie">${btn("secundario", "Imprimir etiquetas")}${btn("secundario", `Ir a productos${ic("arrow-right", "h-4 w-4")}`)}</div>`,
      420,
    )}${hoja("Cambio registrado (ticket)", `<p class="dz-nota" style="margin:0">Ticket de cambio listo.</p>`, `<div class="r11-pie"><button type="button" class="r11-hoy-ticket">${ic("printer", "h-4 w-4")}Imprimir ticket</button></div>`, 380)}${hoja(
      "Pase de traslado",
      `<p class="dz-nota" style="margin:0">TR-0031 · Lima → Trujillo</p>`,
      `<div class="r11-pie">${btn("secundario", `${ic("printer", "h-4 w-4")} Guía`)}</div>`,
      380,
    )}</div></div>`,
};
