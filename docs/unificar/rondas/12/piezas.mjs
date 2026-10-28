// Ronda 12 de /unificar: guardar (lo que hace el botón mientras guarda), editar y las hojas (su cara, su ancho y su salida).
// Las demos usan las clases reales del ERP (las de `<Modal>`, `btn-cayla`, `pie-acciones`, `btn-enlace`, `campo-etiqueta`, `caja-campo`).
// Nada guarda: «Guardar» simula una espera de 2 s y vuelve.
const svg = (d, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  pencil: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>`,
  plus: `<path d="M5 12h14"/><path d="M12 5v14"/>`,
  "arrow-right": `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
};
const ic = (n, cls = "") => svg(I[n], `lucide lucide-${n} ${cls}`);
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;
const btn = (peso, texto, { clase = "", extra = "", icono = "" } = {}) =>
  `<button type="button" class="btn-cayla btn-${peso} ${clase}" ${extra}><span class="relative flex items-center gap-2">${icono}${texto}</span></button>`;

// ---------- una hoja como la dibuja <Modal> (Dialog.Content), con su entrada y su cascada ----------
const campo = (et, valor) => `<div class="r12-campo"><label class="campo-etiqueta">${et}</label><div class="caja-cayla caja-campo r12-caja">${valor}</div></div>`;
const CARA = {
  normal: { hoja: "bg-crema shadow-xl [--fondo-hoja:var(--color-crema)]", h2: "text-lg", p: "mb-4 mt-1 text-xs text-tinta/70" },
  hoja: { hoja: "bg-papel [--fondo-hoja:var(--color-papel)]", h2: "text-2xl leading-tight", p: "mb-[18px] mt-1 text-[13.5px] leading-normal text-taupe" },
  papel: { hoja: "bg-papel [--fondo-hoja:var(--color-papel)]", h2: "text-lg", p: "mb-4 mt-1 text-xs text-tinta/70" },
};
const equis = `<button type="button" aria-label="Cerrar" data-sin-cascada class="absolute right-4 top-4 z-10 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">${ic("x", "h-4 w-4")}</button>`;
export const hoja = ({ cara = "hoja", ancho = 448, titulo, bajada = "", cuerpo = "", pie = "", conX = false, et = "" }) => {
  const c = CARA[cara];
  return `<div class="r12-escena">${et ? `<span class="dz-et2">${et}</span>` : ""}<div role="dialog" data-variante="${cara}" class="relative w-full rounded-2xl border border-sand p-6 ${c.hoja} anim-modal-entra cascada-modal" style="max-width:${ancho}px">${conX || cara === "papel" ? equis : ""}<h2 class="font-display text-tinta ${c.h2} ${conX || cara === "papel" ? "pr-8" : ""}">${titulo}</h2>${bajada ? `<p class="${c.p}">${bajada}</p>` : `<div class="h-4"></div>`}${cuerpo}${pie}</div></div>`;
};
const pie = (...botones) => `<div class="pie-acciones mt-6">${botones.join("")}</div>`;
const cancelar = btn("secundario", "Cancelar");
const gasto = campo("Monto", "S/ 18.50") + `<div class="h-3"></div>` + campo("En qué se gastó", "Refrigerio del turno");
const categoria = campo("Nombre", "Camisas y Blusas") + `<div class="h-3"></div>` + campo("Prefijo", "CAM");
const venta = `<dl class="r12-datos"><div><dt>Hora</dt><dd>10:42 a. m.</dd></div><div><dt>Atendió</dt><dd>Micaela</dd></div><div><dt>Total</dt><dd>S/ 129.00</dd></div><div><dt>Pago</dt><dd>Yape</dd></div></dl>`;

// ================= 1 · GUARDAR: lo que hace el botón mientras guarda =================
// El hilo que barre abajo (`<Boton cargando>`, el mismo de `BotonCompacto`).
const hilo = (primario = true) =>
  `<span aria-hidden class="r12-hilo absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-full" hidden><span class="block h-full w-1/3 rounded-full [animation:cayla-hilo-barrido_1.1s_linear_infinite] ${primario ? "bg-crema" : "bg-rojo"}"></span></span>`;
// `modo`: texto (cambia a «Guardando…»), hilo (corre el hilo), fijo (el ancho no salta: las dos palabras apiladas en una celda).
const guardar = (texto, { modo = ["texto", "hilo", "fijo"], peso = "primario" } = {}) => {
  const conTexto = modo.includes("texto"), conHilo = modo.includes("hilo"), fijo = modo.includes("fijo");
  const palabras = conTexto
    ? fijo
      ? `<span class="r12-pila"><span data-r12-reposo>${texto}</span><span data-r12-espera class="invisible">Guardando…</span></span>`
      : `<span data-r12-reposo>${texto}</span><span data-r12-espera hidden>Guardando…</span>`
    : `<span data-r12-reposo>${texto}</span>`;
  return `<button type="button" data-r12-guardar class="btn-cayla btn-${peso}"><span class="relative flex items-center gap-2">${palabras}</span>${conHilo ? hilo(peso === "primario") : ""}</button>`;
};
const hojaGuardar = (boton, et) =>
  hoja({ cara: "hoja", ancho: 440, titulo: "Registrar gasto", bajada: "Sale del cajón de Tienda Lima.", cuerpo: gasto, pie: pie(cancelar, boton), et });
export const guardarDemos = {
  P1: () =>
    `<div class="r12-fila">${hojaGuardar(guardar("Guardar gasto", { modo: ["texto", "hilo", "fijo"] }), "Toca «Guardar gasto»")}${hojaGuardar(guardar("Guardar cambios", { modo: ["texto", "hilo", "fijo"] }), "Otra palabra: el ancho tampoco salta")}</div>`,
  P2: () =>
    `<div class="r12-fila">${hojaGuardar(guardar("Guardar gasto", { modo: ["hilo"] }), "Toca «Guardar gasto»")}${hojaGuardar(guardar("Guardar cambios", { modo: ["hilo"] }), "Otra palabra")}</div>`,
  A: () =>
    `<div class="r12-hoy-guardar">` +
    [
      ["No cambia nada (21)", guardar("Guardar", { modo: [] })],
      ["«Guardando…» sin hilo (35)", guardar("Guardar cambios", { modo: ["texto"] })],
      ["El hilo, la palabra se queda (35)", guardar("Guardar", { modo: ["hilo"] })],
      ["«Guardando…» y el hilo (15)", guardar("Guardar categoría", { modo: ["texto", "hilo"] })],
    ]
      .map(([et, b]) => `<div class="r12-hoy-celda"><span class="dz-et2">${et}</span>${b}</div>`)
      .join("") +
    `</div>`,
};

// ================= 2 · EDITAR =================
const cabeceraFicha = (accion) =>
  `<header data-voz="cabecera" class="r12-cab"><div><p class="r12-cab-sede"><span class="r12-hilo-sede"></span>TODAS LAS TIENDAS · MIÉRCOLES, 14 DE OCTUBRE</p><h3 class="r12-cab-h">Confecciones del Sur</h3><p class="r12-cab-frase">RUC 20498765432 · Ana Quispe · Blusas, Vestidos</p></div><div class="r12-cab-acc">${accion}${btn("primario", "Registrar factura", { icono: ic("plus", "h-3.5 w-3.5") })}</div></header>`;
const fila = (nombre, codigo, accion) => `<div class="r12-tfila"><span class="r12-tnom">${nombre}</span><span class="r12-tcod">${codigo}</span><span class="r12-tacc">${accion}</span></div>`;
const tabla = (accion) => `<div class="r12-tabla">${fila("Blusa Emma", "BLU-0012", accion("Blusa Emma"))}${fila("Vestido Lía", "VES-0031", accion("Vestido Lía"))}${fila("Casaca Río", "CAS-0007", accion("Casaca Río"))}</div>`;
const lapiz = (que, clase = "r12-lapiz") => `<button type="button" class="${clase}" aria-label="Editar ${que}" title="Editar ${que}">${ic("pencil", "h-4 w-4")}</button>`;
const editarSec = btn("secundario", "Editar", { icono: ic("pencil", "h-3.5 w-3.5") });
const frase = `<p class="r12-frase">Decisión: <b>espero la reposición</b> <button type="button" class="btn-cayla btn-enlace text-[13px]">Editar</button></p>`;
export const editarDemos = {
  P1: () =>
    `<div class="r12-col">${cabeceraFicha(editarSec)}<div class="r12-fila"><div class="r12-bloque"><span class="dz-et2">En una tabla: el lápiz solo, con su nombre al pasar el mouse</span>${tabla((q) => lapiz(q))}</div><div class="r12-bloque"><span class="dz-et2">Dentro de una frase o de una hoja (ronda 9): el enlace</span>${frase}</div></div></div>`,
  P2: () =>
    `<div class="r12-col">${cabeceraFicha(lapiz("Confecciones del Sur", "r12-lapiz r12-lapiz-borde"))}<div class="r12-fila"><div class="r12-bloque"><span class="dz-et2">En una tabla: el mismo lápiz</span>${tabla((q) => lapiz(q, "r12-lapiz r12-lapiz-borde"))}</div><div class="r12-bloque"><span class="dz-et2">Dentro de una frase: el lápiz también</span><p class="r12-frase">Decisión: <b>espero la reposición</b> ${lapiz("la decisión", "r12-lapiz r12-lapiz-borde")}</p></div></div></div>`,
  A: () =>
    `<div class="r12-hoy-editar">` +
    [
      ["Ficha de un proveedor, órdenes, vista rápida: secundario con lápiz", editarSec],
      ["Cada marca de la lista: secundario sin lápiz", btn("secundario", "Editar")],
      ["Ficha de un cliente, detalle de una categoría: negro", btn("primario", "Editar")],
      ["Colores y etiquetas: versalitas de 10 px", `<button type="button" class="label-cayla whitespace-nowrap text-[10px] text-tinta/75 underline-offset-4 transition-colors hover:text-tinta hover:underline">Editar</button>`],
      ["Familias y gastos fijos: sutil chico", `<button type="button" class="btn-cayla btn-sutil btn-chico">Editar</button>`],
      ["Corregir un conteo: secundario de 44 px", btn("secundario", "Corregir conteo", { clase: "h-11", icono: ic("pencil", "h-4 w-4") })],
      ["Tabla de Productos: el lápiz de 32 px sin borde", lapiz("Blusa Emma")],
      ["La ficha de stock: el lápiz de 28 px con borde", lapiz("la talla", "r12-lapiz-28")],
      ["Metas de Rendimiento: el botón de fila", `<button type="button" class="mov-boton r12-fila-btn">${ic("pencil", "h-[15px] w-[15px]")}</button>`],
      ["Cuentas de un proveedor, un faltante: el enlace", `<button type="button" class="btn-cayla btn-enlace text-xs">Editar</button>`],
    ]
      .map(([et, b]) => `<div class="r12-hoy-celda"><span class="dz-et2">${et}</span>${b}</div>`)
      .join("") +
    `</div>`,
};

// ================= 3 · LA CARA DE UNA HOJA =================
const tresHojas = (cara) =>
  `<div class="r12-fila">${hoja({ cara, ancho: 440, titulo: "Registrar gasto", bajada: "Sale del cajón de Tienda Lima.", cuerpo: gasto, pie: pie(cancelar, btn("primario", "Guardar gasto")) })}${hoja({ cara, ancho: 440, titulo: "Agregar categoría", bajada: "Dentro de una familia. El prefijo arma el código de cada prenda.", cuerpo: categoria, pie: pie(cancelar, btn("primario", "Guardar categoría")) })}</div>`;
export const caraDemos = {
  P1: () => tresHojas("hoja"),
  P2: () => tresHojas("normal"),
  A: () =>
    `<div class="r12-fila">${hoja({ cara: "normal", ancho: 380, titulo: "Agregar categoría", bajada: "Dentro de una familia.", cuerpo: categoria, pie: pie(cancelar, btn("primario", "Guardar")), et: "Crema con sombra, título de 18 px (167 hojas)" })}${hoja({ cara: "hoja", ancho: 380, titulo: "Registrar gasto", bajada: "Sale del cajón de Tienda Lima.", cuerpo: gasto, pie: pie(cancelar, btn("primario", "Guardar gasto")), et: "Papel sin sombra, título de 24 px (86)" })}${hoja({ cara: "papel", ancho: 380, titulo: "Pagar comprobante", bajada: "F001-2231 · Confecciones del Sur", cuerpo: campo("Monto", "S/ 1,524.00"), pie: pie(btn("primario", "Guardar el pago")), et: "Papel con la ×, título de 18 px (9)" })}</div>`,
};

// ================= 4 · CUÁNTO MIDE UNA HOJA =================
const regla = (anchos) =>
  `<div class="r12-regla">${anchos.map(([px, nombre, ejemplos]) => `<div class="r12-ancho"><div><div class="r12-barra" style="width:min(100%,${px}px)"><span>${px} px</span></div></div><p><b>${nombre}</b> ${ejemplos}</p></div>`).join("")}</div>`;
export const anchoDemos = {
  P1: () =>
    regla([
      [448, "Angosta", "· un formulario corto: registrar un gasto, una categoría, una clienta, un pago"],
      [576, "Mediana", "· un formulario con una lista o una tabla chica: recibir contra factura, una nota de crédito, el detalle de una venta"],
      [768, "Ancha", "· una ficha que se lee: la ficha de un cliente, un cierre de caja, una orden"],
    ]),
  P2: () =>
    regla([
      [448, "Angosta", "· todo formulario: un gasto, una categoría, una clienta, un pago, una nota de crédito"],
      [720, "Ancha", "· todo lo que se lee o lleva una tabla: el detalle de una venta, la ficha de un cliente, un cierre, una orden"],
    ]),
  A: () =>
    regla([
      [384, "110 + 19 hojas", "· el ancho de fábrica (Agregar categoría, Depósito o retiro, Anular venta…)"],
      [448, "44", ""],
      [480, "2", ""],
      [512, "22", ""],
      [520, "11", ""],
      [576, "14 + 2", ""],
      [600, "2", ""],
      [620, "1", ""],
      [672, "15", ""],
      [680, "8", ""],
      [768, "6", ""],
      [896, "3", "· y 62rem, 1024 y 1080 (la vista rápida)"],
    ]),
};

// ================= 5 · LA SALIDA DE UNA HOJA =================
const detalle = (conX, et) => hoja({ cara: "hoja", ancho: 420, titulo: "Venta 10:42 a. m.", bajada: "Tienda Lima · Micaela", cuerpo: venta, conX, et });
const formulario = (conX, et) => hoja({ cara: "hoja", ancho: 420, titulo: "Registrar gasto", bajada: "Sale del cajón de Tienda Lima.", cuerpo: gasto, pie: pie(cancelar, btn("primario", "Guardar gasto")), conX, et });
export const salidaDemos = {
  P1: () => `<div class="r12-fila">${detalle(true, "Lo que solo se lee: la ×")}${formulario(false, "Lo que guarda: «Cancelar», sin la ×")}</div>`,
  P2: () => `<div class="r12-fila">${detalle(true, "Lo que solo se lee: la ×")}${formulario(true, "Lo que guarda: la × y también «Cancelar»")}</div>`,
  A: () => `<div class="r12-fila">${detalle(true, "El detalle de una venta: la ×")}${detalle(false, "Movimientos de la caja, Ventas de hoy, Actividad del equipo: sin × ni botón (se sale solo con Escape o tocando afuera)")}${formulario(false, "Registrar gasto: «Cancelar»")}</div>`,
};
