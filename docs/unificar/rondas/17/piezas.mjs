// Ronda 17 de /unificar: elegir el mes, el cajón lateral, el paso de cantidad y el anterior/siguiente de un paso a paso.
// Las demos copian el HTML de las piezas reales (SelectorMes, Volver, Boton, BotonVer) con el CSS del ERP de hoy. Nada guarda.
import { svg } from "./svg.mjs";

export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// ---------------- 1 · ELEGIR EL MES ----------------
const BOTON_REDONDO =
  "grid h-8 w-8 place-items-center rounded-full text-tinta transition-colors hover:bg-sand/60 disabled:pointer-events-none disabled:text-tinta/25";
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** SelectorMes (components/ui/SelectorMes.tsx), tal cual: «‹ Octubre 2026 ›». */
export const mesP1 = (nombre, { siguiente = false, guia = "" } = {}) =>
  `<div data-r17="1" ${guia ? `data-guia="${guia}"` : ""} class="inline-flex items-center gap-0.5 rounded-full border border-sand bg-papel p-[3px]">
    <button type="button" class="${BOTON_REDONDO}" aria-label="Ir al mes anterior">${svg("ChevronLeft", 16, 2, "h-4 w-4")}</button>
    <button type="button" aria-haspopup="dialog" class="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-tinta transition-colors hover:bg-sand/60 aria-expanded:bg-sand/60">${nombre}${svg("ChevronDown", 14, 2, "h-3.5 w-3.5 text-tinta/60")}</button>
    <button type="button" class="${BOTON_REDONDO}" ${siguiente ? "" : "disabled"} aria-label="Ir al mes siguiente">${svg("ChevronRight", 16, 2, "h-4 w-4")}</button>
  </div>`;

/** El panel de los doce meses que abre SelectorMes al tocar el nombre. */
export const mesP1Panel = (elegido = 9, hasta = 9) =>
  `<div class="rounded-[14px] border border-sand bg-papel p-2" style="width:268px;box-shadow:0 18px 40px -16px color-mix(in srgb,var(--color-sombra) 40%,transparent)">
    <div class="flex items-center justify-between px-1 pb-2 pt-0.5">
      <button type="button" class="${BOTON_REDONDO}">${svg("ChevronLeft", 16, 2, "h-4 w-4")}</button>
      <span class="font-display text-[19px] leading-none text-tinta tabular-nums">2026</span>
      <button type="button" class="${BOTON_REDONDO}" disabled>${svg("ChevronRight", 16, 2, "h-4 w-4")}</button>
    </div>
    <div class="grid grid-cols-3 gap-1.5">${MESES.map((m, i) => {
      const clase = i === elegido ? "bg-tinta text-crema" : i > hasta ? "cursor-not-allowed text-tinta/30" : "text-tinta hover:bg-sand/60";
      const punto = i === hasta && i !== elegido ? '<span class="absolute bottom-1.5 h-1 w-1 rounded-full bg-rojo" aria-hidden="true"></span>' : "";
      return `<button type="button" ${i > hasta ? "disabled" : ""} class="relative flex h-10 items-center justify-center gap-1 rounded-[10px] text-[13px] font-semibold transition-colors ${clase}">${m}${i > hasta ? svg("Lock", 12, 2, "h-3 w-3") : ""}${punto}</button>`;
    }).join("")}</div>
  </div>`;

/** P2: los vecinos con su nombre, con las piezas del sistema (botón secundario chico con su chevron); sin lista de meses. */
export const mesP2 = (previo, actual, siguiente, { guia = "" } = {}) =>
  `<div data-r17="1" ${guia ? `data-guia="${guia}"` : ""} class="flex flex-wrap items-center gap-2">
    <button type="button" class="btn-cayla btn-secundario btn-chico"><span class="flex items-center gap-1.5">${svg("ChevronLeft", 16, 2, "-my-1 h-4 w-4 shrink-0")}${previo}</span></button>
    <p class="font-display px-1 text-lg text-tinta">${actual}</p>
    ${siguiente ? `<button type="button" class="btn-cayla btn-secundario btn-chico"><span class="flex items-center gap-1.5">${siguiente}${svg("ChevronRight", 16, 2, "-my-1 h-4 w-4 shrink-0")}</span></button>` : ""}
  </div>`;

/** Hoy en Comprobantes (SelectorMesFacturacion): versalitas a mano con «←» y «→» escritos. */
export const mesHoyComprobantes = (previo, actual, siguiente) => {
  const E = "label-cayla rounded-md border border-tinta/20 px-3 py-2 text-[11px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo";
  return `<div class="flex flex-wrap items-center gap-2"><a class="${E}">← ${previo}</a><p class="font-display px-1 text-lg text-tinta">${actual}</p>${siguiente ? `<a class="${E}">${siguiente} →</a>` : ""}</div>`;
};

export const demoMes = (op) => {
  if (op === "P1")
    return `<div class="r17-mes">${mesP1("Septiembre 2026", { siguiente: true })}<span class="dz-et2">Al tocar el nombre, los doce meses (los que no llegan, con candado):</span>${mesP1Panel(8, 9)}</div>`;
  if (op === "P2") return `<div class="r17-mes">${mesP2("Agosto", "Septiembre 2026", "Octubre")}<span class="dz-et2">En el mes de hoy no hay «siguiente»:</span>${mesP2("Septiembre", "Octubre 2026", null)}</div>`;
  return `<div class="r17-mes"><span class="dz-et2">Historial de cierres (Caja)</span>${mesP1("Septiembre 2026", { siguiente: true })}<span class="dz-et2">Comprobantes ▸ Emitidos y Proformas</span>${mesHoyComprobantes("AGOSTO", "Septiembre 2026", "OCTUBRE")}</div>`;
};

// ---------------- 4 · ANTERIOR Y SIGUIENTE DE UN PASO A PASO ----------------
const VOLVER =
  "group relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-sand bg-papel text-tinta transition-colors hover:border-tinta/40 disabled:cursor-not-allowed disabled:opacity-50";
const flechaVolver = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-4 w-4 transition-transform duration-200 ease-cayla group-hover:-translate-x-0.5"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>`;
const conIcono = (texto, icono, antes = false) =>
  `<span class="flex items-center gap-2">${antes ? svg(icono, 16, 2, "-my-1 h-4 w-4 shrink-0") : ""}${texto}${antes ? "" : svg(icono, 16, 2, "-my-1 h-4 w-4 shrink-0")}</span>`;

export const pieGuia = (op, n, total, { r17 = true } = {}) => {
  const cuenta = `<span class="text-xs tabular-nums text-taupe-profundo">Paso ${n} de ${total}</span>`;
  const marca = r17 ? 'data-r17="1"' : "";
  if (op === "P1")
    return `<div ${marca} class="mt-6 flex items-center justify-between gap-3 border-t border-sand pt-4"><button type="button" aria-label="Volver al paso anterior" title="Volver al paso anterior" class="${VOLVER}">${flechaVolver}</button>${cuenta}<button type="button" class="btn-cayla btn-primario">${conIcono("Siguiente", "ArrowRight")}</button></div>`;
  if (op === "P2")
    return `<div ${marca} class="mt-6 flex items-center justify-between gap-3 border-t border-sand pt-4"><button type="button" class="btn-cayla btn-secundario">${conIcono("Anterior", "ArrowLeft", true)}</button>${cuenta}<button type="button" class="btn-cayla btn-primario">${conIcono("Siguiente", "ArrowRight")}</button></div>`;
  return `<div ${marca} class="mt-6 flex items-center justify-between gap-3 border-t border-sand pt-4"><button type="button" class="btn-cayla btn-secundario">← Anterior</button>${cuenta}<button type="button" class="btn-cayla btn-primario">Siguiente →</button></div>`;
};

export const demoGuia = (op) =>
  `<div class="card-cayla r17-guia"><p class="r17-guia-tit">Paso 2 · Elige la impresora</p><p class="r17-guia-txt">En la ventana de imprimir, cambia el destino a la Brother.</p>${pieGuia(op, 2, 7, { r17: false })}</div>`;

// ---------------- 3 · EL PASO DE CANTIDAD ----------------
const ICONO_PASO = { celda: 12, fila: 14, mostrador: 16 };
/** P1 · la caja con el número adentro: la caja del campo (hueso que se enciende con su hilo) con − y + dentro. */
export const pasoP1 = (n, tam = "fila", { r17 = true, etiqueta = "Cantidad" } = {}) =>
  `<span ${r17 ? 'data-r17="1"' : ""} class="caja-cayla caja-campo r17-paso" data-tam="${tam}">
    <button type="button" class="r17-paso-b" aria-label="Una menos">${svg("Minus", ICONO_PASO[tam], 2, "r17-ic")}</button>
    <input class="r17-paso-n" inputmode="numeric" value="${n}" aria-label="${etiqueta}">
    <button type="button" class="r17-paso-b" aria-label="Una más">${svg("Plus", ICONO_PASO[tam], 2, "r17-ic")}</button>
  </span>`;
/** P2 · los botones sueltos: dos botones secundarios cuadrados y la caja del número en medio (la de Bajar al piso). */
export const pasoP2 = (n, tam = "fila", { r17 = true, etiqueta = "Cantidad" } = {}) =>
  `<span ${r17 ? 'data-r17="1"' : ""} class="r17-paso2" data-tam="${tam}">
    <button type="button" class="btn-cayla btn-secundario r17-paso2-b" aria-label="Una menos">${svg("Minus", ICONO_PASO[tam], 2, "r17-ic")}</button>
    <input class="caja-campo-input r17-paso2-n" inputmode="numeric" value="${n}" aria-label="${etiqueta}">
    <button type="button" class="btn-cayla btn-secundario r17-paso2-b" aria-label="Una más">${svg("Plus", ICONO_PASO[tam], 2, "r17-ic")}</button>
  </span>`;

/** Las caras de hoy, copiadas de su archivo (el HTML de cada pantalla). */
export const pasosHoy = () => {
  const fila = (donde, html) => `<div class="r17-pfila"><span class="r17-pdonde">${donde}</span><span class="r17-pvan">${html}</span></div>`;
  const vender = `<span class="caja-cayla caja-campo inline-flex h-8 min-h-0 gap-0 px-0.5"><button type="button" class="h-7 w-6 rounded-md text-base text-tinta/70 hover:bg-sand/60">−</button><input class="w-6 bg-transparent text-center text-sm font-semibold outline-none" value="1"><button type="button" class="h-7 w-6 rounded-md text-base text-tinta/70 hover:bg-sand/60">+</button></span>`;
  const apartados = `<span class="inline-flex h-9 items-center rounded-lg border border-sand"><button type="button" class="grid h-9 w-8 place-items-center text-tinta/70 hover:text-tinta">${svg("Minus", 14, 2, "h-3.5 w-3.5")}</button><span class="w-6 text-center text-sm font-semibold tabular-nums">1</span><button type="button" class="grid h-9 w-8 place-items-center text-tinta/70 hover:text-tinta">${svg("Plus", 14, 2, "h-3.5 w-3.5")}</button></span>`;
  const bajar = `<span class="flex items-center gap-1.5"><button type="button" class="btn-cayla btn-secundario h-11 w-11 p-0">${svg("Minus", 16, 2, "h-4 w-4")}</button><input class="caja-campo-input h-11 w-14 px-1 text-center text-base tabular-nums" value="2"><button type="button" class="btn-cayla btn-secundario h-11 w-11 p-0">${svg("Plus", 16, 2, "h-4 w-4")}</button></span>`;
  const recibir = `<span class="flex items-center gap-1"><button type="button" class="btn-cayla btn-sutil h-8 w-8 p-0">${svg("Minus", 14, 2, "h-3.5 w-3.5")}</button><input class="caja-campo-input h-8 w-14 text-center tabular-nums" value="3"><button type="button" class="btn-cayla btn-sutil h-8 w-8 p-0">${svg("Plus", 14, 2, "h-3.5 w-3.5")}</button></span>`;
  const matriz = `<span class="inline-flex items-center rounded-[7px] bg-hueso px-0.5"><button type="button" class="grid h-6 w-5 place-items-center rounded-[5px] text-taupe/70">${svg("Minus", 12, 2, "h-3 w-3")}</button><input class="w-8 bg-transparent text-center text-sm tabular-nums outline-none" value="4"><button type="button" class="grid h-6 w-5 place-items-center rounded-[5px] text-taupe/70">${svg("Plus", 12, 2, "h-3 w-3")}</button></span>`;
  const proforma = `<span class="inline-flex items-center gap-1"><button type="button" class="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10">${svg("Minus", 14, 2, "h-3.5 w-3.5")}</button><span class="w-6 text-center text-sm tabular-nums">1</span><button type="button" class="grid h-7 w-7 place-items-center rounded-md hover:bg-tinta/10">${svg("Plus", 14, 2, "h-3.5 w-3.5")}</button></span>`;
  return `<div class="card-cayla r17-pasos">
    ${fila("Vender, el ticket (glifos escritos)", vender)}
    ${fila("Apartados (caja con borde)", apartados)}
    ${fila("Bajar al piso y Cuadrar (botones sueltos de 44)", bajar)}
    ${fila("Llegó mercadería (sutiles de 32)", recibir)}
    ${fila("Las matrices de tallas (celda hueso)", matriz)}
    ${fila("Proformas (sin borde)", proforma)}
  </div>`;
};

export const demoPaso = (op) => {
  const pieza = op === "P2" ? pasoP2 : pasoP1;
  const fila = (donde, html) => `<div class="r17-pfila"><span class="r17-pdonde">${donde}</span><span class="r17-pvan">${html}</span></div>`;
  return `<div class="card-cayla r17-pasos">
    ${fila("En una celda de una matriz (26 px)", pieza(4, "celda", { r17: false }))}
    ${fila("En una fila, con mouse (36 px)", pieza(2, "fila", { r17: false }))}
    ${fila("La misma fila en una pantalla táctil: crece sola a 44 px", pieza(1, "mostrador", { r17: false }))}
  </div>`;
};

// ---------------- 2 · EL CAJÓN LATERAL ----------------
const X = svg("X", 16, 2, "h-4 w-4");
const xModal = `<button type="button" aria-label="Cerrar" class="rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">${X}</button>`;
const flecha = (icono, et, apagada = false) =>
  `<button type="button" ${apagada ? "disabled" : ""} aria-label="${et}" class="grid h-9 w-9 place-items-center rounded-xl border border-sand text-tinta transition-colors hover:border-tinta/40 disabled:opacity-40">${svg(icono, 16, 2, "h-4 w-4")}</button>`;
const flechas = `<span class="ml-auto flex items-center gap-2 text-[13px] tabular-nums text-taupe">3 de 12 ${flecha("ChevronUp", "Anterior")}${flecha("ChevronDown", "Siguiente")}</span>`;
const cuerpo = `<div class="r17-cajon-cuerpo">
    <div class="flex items-end justify-between gap-3"><div><p class="label-cayla text-[10.5px] text-tinta/65">Saldo por pagar</p><p class="font-display text-[34px] leading-[1.1] tabular-nums text-tinta">S/ 1,240.00</p></div>
    <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ambar/15 px-2.5 py-0.5 text-xs leading-5 text-ambar before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']">Vence en 5 días</span></div>
    <dl class="mt-4 grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
      <div class="px-3.5 py-3"><dt class="label-cayla text-[10px] text-tinta/65">Total</dt><dd class="font-display mt-0.5 text-[19px] tabular-nums">S/ 2,480</dd></div>
      <div class="px-3.5 py-3"><dt class="label-cayla text-[10px] text-tinta/65">Pagado</dt><dd class="font-display mt-0.5 text-[19px] tabular-nums text-verde-profundo">S/ 1,240</dd></div>
      <div class="px-3.5 py-3"><dt class="label-cayla text-[10px] text-tinta/65">Vence</dt><dd class="font-display mt-0.5 text-[19px]">22 oct</dd></div>
    </dl>
  </div>`;
const acciones = `<button type="button" class="btn-cayla btn-primario">Registrar pago</button><button type="button" class="btn-cayla btn-secundario"><span class="flex items-center gap-2">Ver la factura${svg("ArrowRight", 16, 2, "-my-1 h-4 w-4 shrink-0")}</span></button>`;

export const cajon = (op) => {
  if (op === "P2")
    return `<div class="r17-cajon" data-op="P2">
      <div class="r17-cajon-cab2"><span class="absolute right-4 top-4">${xModal}</span>
        <h2 class="font-display pr-8 text-2xl leading-tight text-tinta">F001-00234</h2>
        <p class="mt-1 text-[13.5px] leading-normal text-taupe">Textiles del Sur · por pagar</p></div>
      ${cuerpo}
      <div class="r17-cajon-pie">${acciones}${flechas}</div></div>`;
  return `<div class="r17-cajon" data-op="P1">
    <div class="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
      <span class="avatar avatar-40"><span class="avatar-recorte">TS</span></span>
      <div class="min-w-0 flex-1"><p class="label-cayla truncate text-[10.5px] text-tinta/65">Textiles del Sur</p><h2 class="font-display text-2xl leading-tight text-tinta">F001-00234</h2></div>
      <span class="-mr-1">${xModal}</span></div>
    ${cuerpo}
    <div class="r17-cajon-pie">${acciones}${flechas}</div></div>`;
};
