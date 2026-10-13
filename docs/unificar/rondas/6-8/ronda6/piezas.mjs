// Ronda 6 de /unificar: las piezas de las demos (HTML), compartidas por construir.mjs (página de elegir) y fotos-vivas.mjs (las
// propuestas puestas sobre pantallas reales). Solo arma HTML: el CSS es demo.css y el comportamiento, demo.js.

// ---------- iconos de lucide (cada trazo con pathLength=1, para dibujarse) ----------
export const P = {
  search: ['<circle cx="11" cy="11" r="8"/>', '<path d="m21 21-4.3-4.3"/>'],
  searchx: ['<circle cx="11" cy="11" r="8"/>', '<path d="m21 21-4.3-4.3"/>', '<path d="m13.5 8.5-5 5"/>', '<path d="m8.5 8.5 5 5"/>'],
  x: ['<path d="M18 6 6 18"/>', '<path d="m6 6 12 12"/>'],
  check: ['<path d="M20 6 9 17l-5-5"/>'],
  chev: ['<path d="m6 9 6 6 6-6"/>'],
  chevder: ['<path d="m9 18 6-6-6-6"/>'],
  flechader: ['<path d="M5 12h14"/>', '<path d="m12 5 7 7-7 7"/>'],
  abajo: ['<path d="M12 5v14"/>', '<path d="m19 12-7 7-7-7"/>'],
  mas: ['<path d="M5 12h14"/>', '<path d="M12 5v14"/>'],
  usuario: ['<circle cx="12" cy="8" r="5"/>', '<path d="M20 21a8 8 0 0 0-16 0"/>'],
  shirt: ['<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>'],
  regla: ['<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>', '<path d="m14.5 12.5 2-2"/>', '<path d="m11.5 9.5 2-2"/>', '<path d="m8.5 6.5 2-2"/>', '<path d="m17.5 15.5 2-2"/>'],
  paleta: ['<circle cx="13.5" cy="6.5" r=".5"/>', '<circle cx="17.5" cy="10.5" r=".5"/>', '<circle cx="8.5" cy="7.5" r=".5"/>', '<circle cx="6.5" cy="12.5" r=".5"/>', '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'],
  tienda: ['<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>', '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>', '<path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>', '<path d="M2 7h20"/>', '<path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>'],
  ordenar: ['<path d="m21 16-4 4-4-4"/>', '<path d="M17 20V4"/>', '<path d="m3 8 4-4 4 4"/>', '<path d="M7 4v16"/>'],
  estado: ['<circle cx="12" cy="12" r="10"/>', '<path d="m9 12 2 2 4-4"/>'],
  calendario: ['<rect width="18" height="18" x="3" y="4" rx="2"/>', '<path d="M16 2v4"/>', '<path d="M8 2v4"/>', '<path d="M3 10h18"/>'],
  alerta: ['<circle cx="12" cy="12" r="10"/>', '<path d="M12 8v4"/>', '<path d="M12 16h.01"/>'],
};
export const ic = (n, cls = "", extra = "") => `<svg viewBox="0 0 24 24" class="${cls}" ${extra} aria-hidden="true">${P[n].map((s) => s.replace("/>", ' pathLength="1"/>')).join("")}</svg>`;
export const btn = (peso, t, icono = "", extra = "") => `<button type="button" class="btn-cayla btn-${peso}" ${extra}>${icono}${t}</button>`;
const flechaHoy = `<svg viewBox="0 0 10 6" class="h-flecha" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>`;
const visto = ic("check", "visto");

// ---------- datos de ejemplo (inventados, del lenguaje de la tienda) ----------
export const CATEGORIAS = ["Movilidad", "Limpieza", "Útiles de oficina", "Mensajería", "Alimentación", "Mantenimiento del local"];
export const DESDE = [
  { g: "Cajón de la tienda", o: ["Cajón · Tienda Lima"] },
  { g: "Bancos y billeteras", o: ["BCP soles · 191-…-0042", "Interbank soles · 200-…-1188", "Yape · 987 654 321"] },
];
export const PROVEEDORES = ["Textiles Andinos S.A.C.", "Botonería El Hilo", "Avíos del Sur E.I.R.L.", "Transportes Rímac", "Lavandería Sol de Oro", "Mensajería Rayo", "Distribuidora Lucero", "Papelera Santa Rosa", "Ferretería La Unión", "Imprenta Gráfica Norte", "Cintas y Etiquetas Perú", "Limpieza Total S.A.C."];
export const PERSONAS = [["MR", "María Ríos", "Encargada"], ["LQ", "Lucía Quispe", "Integrante"], ["JT", "Jorge Torres", "Integrante"]];

// ---------- la lista de la propuesta (una sola para todo combo) ----------
// opciones: [texto] o [{g, o:[…]}] (grupos) o [{t, det}]; buscador: con más de 8, o forzado.
export function listaP({ opciones, elegida = null, buscador, crear = false, resp = false, clase = "" }) {
  const planas = [];
  const filas = [];
  let i = 0;
  const op = (t, det = "", avatar = "") => {
    const sel = t === elegida;
    planas.push(t);
    return `<li class="opc" role="option" aria-selected="${sel}" data-texto="${t}" style="--i:${i++}">${avatar}<span class="t">${t}</span>${det ? `<span class="det">${det}</span>` : ""}${ic("check", "tilde")}</li>`;
  };
  for (const o of opciones) {
    if (typeof o === "string") filas.push(op(o));
    else if (o.g) { filas.push(`<li class="og" role="presentation">${o.g}</li>`); for (const x of o.o) filas.push(op(x)); }
    else if (o.p) filas.push(op(o.p[1], o.p[2], `<span class="ava">${o.p[0]}</span>`));
    else filas.push(op(o.t, o.det));
  }
  const conBuscar = buscador ?? planas.length > 8;
  return `<div class="pf-lista lista-flotante ${conBuscar ? "" : "cascada"} ${clase}" role="listbox">${conBuscar ? `<div class="busca">${ic("search")}<input placeholder="Buscar…" aria-label="Buscar"></div>` : ""}${resp ? `<div class="tit-resp">De turno ahora · Tienda Lima</div>` : ""}<ul>${filas.join("")}<li class="vacio" hidden>${ic("searchx")}<span>Nada coincide con <b></b>.</span></li></ul>${crear ? `<div class="crear" hidden>${ic("mas")}<span>Registrar <b></b> como proveedor nuevo</span></div>` : ""}</div>`;
}

// ---------- un campo de la propuesta: forma «caja» (P1) o «hilo» (P2) ----------
// tipo: texto | monto | combo | buscable | responsable | ruc | nota
export function campoP(forma, c) {
  const k = forma === "caja" ? "pf-caja" : "pf-hilo";
  const et = `<span class="pf-et ${c.minus ? "minus" : ""}">${c.et}${c.ob ? ' <span class="ob" aria-hidden="true">*</span>' : ""}${c.opc ? ' <span class="op-txt">· opcional</span>' : ""}${c.marca ?? ""}</span>`;
  let ctl;
  if (c.tipo === "texto" || c.tipo === "ruc") ctl = `<div class="${k}">${c.icono ? ic(c.icono, "ic") : ""}<input placeholder="${c.ph ?? ""}" value="${c.valor ?? ""}" ${c.tipo === "ruc" ? 'inputmode="numeric" maxlength="11"' : ""}>${visto}</div>`;
  else if (c.tipo === "monto") ctl = `<div class="${k} monto ${c.clase ?? ""}"><span class="mon">S/</span><input inputmode="decimal" placeholder="0.00" value="${c.valor ?? ""}"></div>`;
  else if (c.tipo === "nota") ctl = `<div class="${k} alta"><textarea rows="2" placeholder="${c.ph ?? ""}"></textarea></div>`;
  else if (c.tipo === "combo") ctl = `<div data-combo><button type="button" class="${k}" data-disparador aria-haspopup="listbox" aria-expanded="false">${c.icono ? ic(c.icono, "ic") : ""}<span class="pf-valor ${c.elegida ? "" : "marcador"}">${c.elegida ?? c.ph ?? "Elegir"}</span>${ic("chev", "pf-chev")}</button>${listaP({ opciones: c.opciones, elegida: c.elegida })}</div>`;
  else if (c.tipo === "buscable") ctl = `<div data-combo><div class="${k}" data-disparador>${ic("search", "ic")}<input placeholder="${c.ph ?? ""}" role="combobox" aria-expanded="false">${ic("chev", "pf-chev")}</div>${listaP({ opciones: c.opciones, buscador: false, crear: true })}</div>`;
  else if (c.tipo === "responsable") ctl = `<div data-combo><button type="button" class="${k} resp" data-disparador aria-haspopup="listbox" aria-expanded="false"><span class="ava">${c.elegida ? PERSONAS[0][0] : ic("usuario")}</span><span class="pf-valor ${c.elegida ? "" : "marcador"}">${c.elegida ?? "¿Quién lo hace?"}</span>${ic("chev", "pf-chev")}</button>${listaP({ opciones: PERSONAS.map((p) => ({ p })), elegida: c.elegida, resp: true })}</div>`;
  return `<div class="pf ${c.entera ? "entera" : ""}" ${c.ob ? `data-obligatorio="${c.err ?? "Falta este dato"}"` : ""} ${c.tipo === "ruc" ? "data-ruc" : ""}>${et}${ctl}<div class="pie">${c.pie ?? ""}</div></div>`;
}

// La hoja de ejemplo: «Registrar gasto» (Caja), con un campo de cada tipo
export function hojaGasto(forma, { minus = false, marcas = false } = {}) {
  const m = (s) => (marcas ? s : "");
  const F = (c) => campoP(forma, { minus, ...c });
  return `<div class="dz-hoja">
  <h5>Registrar gasto</h5><p class="baj">Lo que salió de la tienda hoy. Queda en el cierre de caja de Tienda Lima.</p>
  <div class="dz-rej">
    ${F({ tipo: "texto", et: "Concepto", ob: true, ph: "Ej. Taxi al banco con el depósito", err: "Escribe en qué se gastó", marca: m(' <span class="pf-marca hecho">' + ic("check") + "listo</span>"), valor: marcas ? "Taxi al banco" : "" })}
    ${F({ tipo: "monto", et: "Monto", ob: true, err: "Falta el monto", marca: m(' <span class="pf-marca sigue">Sigue aquí</span>'), clase: marcas && forma === "caja" ? "sigue-aqui" : "" })}
    ${F({ tipo: "combo", et: "Categoría", ob: true, ph: "Elegir categoría", opciones: CATEGORIAS, err: "Elige una categoría", marca: m(' <span class="pf-marca falta"></span>') })}
    ${F({ tipo: "combo", et: "Pagado desde", ob: true, ph: "Elegir de dónde salió", opciones: DESDE, elegida: "Cajón · Tienda Lima" })}
    ${F({ tipo: "buscable", et: "Proveedor", opc: true, ph: "Busca por nombre o RUC", opciones: PROVEEDORES })}
    ${F({ tipo: "ruc", et: "RUC del proveedor", opc: true, ph: "11 dígitos", pie: "" })}
    ${F({ tipo: "responsable", et: "Responsable", ob: true, err: "Elige quién lo hace", entera: true })}
  </div>
  <div class="dz-pie-hoja">${btn("secundario", "Cancelar")}${btn("primario", "Registrar gasto", "", "data-probar-guardar")}</div>
</div>`;
}

// ---------- la misma hoja, como se ve HOY (la mezcla real de piezas) ----------
const listaHoy = (opciones, { elegida = null, buscable = false } = {}) => {
  let i = 0;
  const op = (t) => `<div class="opc" role="option" aria-selected="${t === elegida}" data-texto="${t}" style="--i:${i++}">${t}</div>`;
  const filas = opciones.map((o) => (typeof o === "string" ? op(o) : `<div class="h-grupo" style="font-size:10px;letter-spacing:.13em;text-transform:uppercase;font-weight:600;color:color-mix(in srgb,var(--color-tinta) 55%,transparent);padding:10px 16px 4px">${o.g}</div>${o.o.map(op).join("")}`)).join("");
  return `<div class="h-lista lista-flotante ${buscable ? "buscable" : "cascada"}" role="listbox">${filas}${buscable ? `<div class="crear" hidden>+ Registrar <b></b></div>` : ""}</div>`;
};
export const hoy = {
  texto: (et, ph, { ob, minus } = {}) => `<div class="pf" ${ob ? 'data-obligatorio="Falta este dato"' : ""}><span class="${minus ? "h-et2" : "h-et"}">${et}</span><div class="h-hilo"><input placeholder="${ph}"></div><div class="pie"></div></div>`,
  textoCaja: (et, ph) => `<div class="pf"><span class="h-et">${et}</span><div class="h-caja caja-cayla"><input placeholder="${ph}"></div><div class="pie"></div></div>`,
  monto: (et) => `<div class="pf" data-obligatorio="Falta el monto"><span class="h-et">${et}</span><div class="h-monto"><span class="mon">S/</span><input inputmode="decimal" placeholder="0.00"></div><div class="pie"></div></div>`,
  comboHilo: (et, ph, opciones, elegida) => `<div class="pf"><span class="h-et">${et}</span><div data-combo><button type="button" class="h-hilo" data-disparador aria-expanded="false"><span class="val-combo ${elegida ? "" : "marcador"}">${elegida ?? ph}</span>${flechaHoy}</button>${listaHoy(opciones, { elegida })}</div><div class="pie"></div></div>`,
  comboCaja: (et, ph, opciones, elegida) => `<div class="pf"><span class="h-et">${et}</span><div data-combo><button type="button" class="h-caja caja-cayla" data-disparador aria-expanded="false"><span class="val-combo ${elegida ? "" : "marcador"}" style="flex:1">${elegida ?? ph}</span>${flechaHoy}</button>${listaHoy(opciones, { elegida })}</div><div class="pie"></div></div>`,
  buscable: (et, ph, opciones) => `<div class="pf"><span class="h-et">${et}</span><div data-combo><div class="h-busc" data-disparador><input placeholder="${ph}"></div>${listaHoy(opciones, { buscable: true })}</div><div class="pie"></div></div>`,
  ruc: (et, ph) => `<div class="pf" data-ruc><span class="h-et">${et}</span><div class="h-hilo"><input placeholder="${ph}" inputmode="numeric" maxlength="11"></div><div class="pie"></div></div>`,
  responsable: () => `<div class="pf entera"><span class="h-et">Responsable <span class="ob">*</span></span><div data-combo><button type="button" class="h-resp" data-disparador aria-expanded="false"><span class="ava">${ic("usuario")}</span><span class="val-combo marcador">¿Quién lo hace?</span>${ic("chev", "chev")}</button><div class="h-lista lista-flotante resp"><div class="tit">De turno ahora · Tienda Lima</div>${PERSONAS.map((p) => `<div class="opc" data-texto="${p[1]}"><span class="ava">${p[0]}</span>${p[1]}</div>`).join("")}</div></div><div class="pie"></div></div>`,
  fin: (et, ph, opciones, elegida) => `<div class="pf"><span class="h-tf" style="margin:0 0 6px">${et}</span><div data-combo><button type="button" class="fin-control fin-desplegable" data-disparador aria-expanded="false" style="text-align:left"><span class="val-combo ${elegida ? "" : "marcador"}">${elegida ?? ph}</span></button>${listaHoy(opciones, { elegida })}</div><div class="pie"></div></div>`,
  finTexto: (et, ph) => `<div class="pf"><span class="h-tf" style="margin:0 0 6px">${et}</span><input class="fin-control" placeholder="${ph}"><div class="pie"></div></div>`,
};
export function hojaGastoHoy() {
  return `<div class="dz-hoja">
  <h5>Registrar gasto</h5><p class="baj">Lo que salió de la tienda hoy. Queda en el cierre de caja de Tienda Lima.</p>
  <div class="dz-rej">
    ${hoy.texto("Concepto *", "Ej. Taxi al banco con el depósito", { ob: true })}
    ${hoy.monto("Monto *")}
    ${hoy.comboHilo("Categoría *", "Elegir categoría", CATEGORIAS)}
    ${hoy.comboCaja("Pagado desde *", "Elegir de dónde salió", DESDE, "Cajón · Tienda Lima")}
    ${hoy.buscable("Proveedor", "Busca por nombre o RUC", PROVEEDORES)}
    ${hoy.ruc("RUC del proveedor", "11 dígitos")}
    ${hoy.responsable()}
  </div>
  <div class="dz-pie-hoja">${btn("secundario", "Cancelar")}${btn("primario", "Registrar gasto", "", "data-probar-guardar")}</div>
</div>`;
}
export function hojaGastoFin() {
  return `<div class="dz-hoja">
  <h5>Registrar gasto</h5><p class="baj">Así se ve en Finanzas (el kit del spike, ADR-0195).</p>
  <div class="dz-rej">
    ${hoy.finTexto("Concepto", "Ej. Taxi al banco con el depósito")}
    ${hoy.finTexto("Monto", "0.00")}
    ${hoy.fin("Categoría", "Elegir categoría", CATEGORIAS)}
    ${hoy.fin("Pagado desde", "Elegir de dónde salió", DESDE, "Cajón · Tienda Lima")}
  </div>
  <div class="dz-pie-hoja">${btn("secundario", "Cancelar")}${btn("primario", "Registrar gasto")}</div>
</div>`;
}

// =============================== FILTROS (el combo que filtra una lista) ===============================
export const CAT_FILTRO = [{ t: "Todas", det: "128" }, { t: "Blusas", det: "34" }, { t: "Camisas", det: "18" }, { t: "Casacas", det: "9" }, { t: "Faldas", det: "12" }, { t: "Pantalones", det: "21" }, { t: "Polos", det: "15" }, { t: "Vestidos", det: "11" }, { t: "Accesorios", det: "8" }];
const TALLAS = ["Todas", "XS", "S", "M", "L", "XL"];
const ESTADOS = ["Activos", "Archivados", "Todos"];
const ORDEN = ["Más recientes", "Más vendidos", "Precio: menor a mayor", "Nombre (A–Z)"];
const buscadorLista = `<div class="caja-cayla busq dz-busq">${ic("search")}<input placeholder="Buscar por nombre o código" style="all:unset;flex:1"></div>`;
const listaFiltro = (opciones, elegida, todas = "Todas") => {
  const html = listaP({ opciones, elegida, clase: "pp-lista" });
  // «Todas» (o lo que vale sin filtro) quita el filtro
  return html.replace(`data-texto="${todas}"`, `data-texto="${todas}" data-todas="1"`);
};
// P1 · la píldora
const pildoraP = (icono, nombre, opciones, { elegida = null, todas = "Todas" } = {}) => {
  const puesta = elegida && elegida !== todas;
  return `<div data-combo><button type="button" class="pp ${puesta ? "puesta" : ""}" data-disparador aria-haspopup="listbox" aria-expanded="false">${ic(icono, "ic")}<span>${nombre}<span class="dos" ${puesta ? "" : "hidden"}>:</span></span> <span class="val" data-base="">${puesta ? elegida : ""}</span>${ic("chev", "pf-chev")}<span class="quitar" role="button" aria-label="Quitar filtro ${nombre}">${ic("x")}</span></button>${listaFiltro(opciones, elegida ?? todas, todas)}</div>`;
};
// P2 · la caja con el nombre adentro
const cajaP = (icono, nombre, opciones, { elegida = null, todas = "Todas" } = {}) => {
  const puesta = elegida && elegida !== todas;
  return `<div data-combo><button type="button" class="pf-caja pp2 ${puesta ? "puesta" : ""}" data-disparador aria-haspopup="listbox" aria-expanded="false">${ic(icono, "ic")}<span class="nom">${nombre} ·</span><span class="val pf-valor" data-base="${todas}">${elegida ?? todas}</span>${ic("chev", "pf-chev")}</button>${listaFiltro(opciones, elegida ?? todas, todas)}</div>`;
};
const marcoLista = (barra, filas = 4) => `<div class="dz-marco"><div class="dz-filtros">${barra}</div>${["Blusa Aurora · lino", "Camisa Olmo · popelina", "Falda Nazca · plisada", "Vestido Brisa · viscosa", "Polo Ica · algodón"].slice(0, filas).map((n, i) => `<div style="display:flex;justify-content:space-between;padding:11px 16px;border-top:${i ? "1px solid var(--color-sand)" : "0"};font-size:13.5px"><span>${n}</span><span style="color:var(--color-taupe)">${[12, 7, 4, 9, 15][i]} en Lima</span></div>`).join("")}</div>`;
export const filtros = {
  P1: () => marcoLista(`${buscadorLista}${pildoraP("shirt", "Categoría", CAT_FILTRO, { elegida: "Blusas" })}${pildoraP("regla", "Talla", TALLAS)}${pildoraP("estado", "Estado", ESTADOS, { elegida: "Activos", todas: "Todos" })}${pildoraP("ordenar", "Ordenar", ORDEN, { elegida: "Más recientes", todas: "Más recientes" })}`),
  P2: () => marcoLista(`${buscadorLista}${cajaP("shirt", "Categoría", CAT_FILTRO, { elegida: "Blusas" })}${cajaP("regla", "Talla", TALLAS)}${cajaP("ordenar", "Orden", ORDEN, { elegida: "Más recientes", todas: "Más recientes" })}`),
  // Hoy A · DesplegablePildora: el panel de píldoras en versalitas, sin borde, separadas por rayas
  A: () => {
    const pp = (icono, nombre, opciones, val = null) => `<div data-combo><button type="button" class="h-pp ${val ? "activa" : ""}" data-disparador aria-expanded="false">${ic(icono)}<span>${nombre}${val ? ":" : ""}</span>${val ? `<span class="val">${val}</span>${ic("x", "x")}` : `<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="m6 9 6 6 6-6"/></svg>`}</button>${listaHoy(opciones, { elegida: val })}</div>`;
    return marcoLista(`${buscadorLista}<div class="h-panel">${pp("shirt", "Categoría", CAT_FILTRO.map((o) => o.t), "Blusas")}${pp("regla", "Talla", TALLAS)}${pp("estado", "Estado", ESTADOS, "Activos")}${pp("ordenar", "Ordenar por", ORDEN, "Más recientes")}</div>`);
  },
  // Hoy B · la caja (Actividad: «Todos los módulos»; Existencias en 36 px)
  B: () => {
    const cj = (ph, opciones, alto = 40) => `<div data-combo style="min-width:190px"><button type="button" class="h-caja caja-cayla" data-disparador aria-expanded="false" style="height:${alto}px"><span class="val-combo" style="flex:1">${ph}</span>${flechaHoy}</button>${listaHoy(opciones, { elegida: ph })}</div>`;
    return marcoLista(`${buscadorLista}${cj("Todas las categorías", ["Todas las categorías", ...CAT_FILTRO.slice(1).map((o) => o.t)])}${cj("Todas las tallas", ["Todas las tallas", ...TALLAS.slice(1)])}${cj("Más recientes", ORDEN, 36)}`);
  },
  // Hoy F · Finanzas (SelectFin, ADR-0195)
  F: () => {
    const sf = (ph, opciones) => `<div data-combo style="min-width:180px"><button type="button" class="fin-control fin-desplegable" data-disparador aria-expanded="false" style="text-align:left"><span class="val-combo">${ph}</span></button>${listaHoy(opciones, { elegida: ph })}</div>`;
    return marcoLista(`${sf("Octubre 2026", ["Octubre 2026", "Setiembre 2026", "Agosto 2026"])}${sf("Tienda Lima", ["Todas las tiendas", "Tienda Lima", "Tienda Trujillo", "Tienda Arequipa"])}${sf("Todas las categorías", ["Todas las categorías", ...CATEGORIAS])}`);
  },
};

// =============================== CASILLAS E INTERRUPTORES ===============================
export const casillas = {
  P1: () => `<div class="dz-hoja" style="gap:14px"><h5 style="font-size:20px">Qué tiendas venden esta etiqueta</h5>
    <div class="dz-casillas">${["Tienda Lima", "Tienda Trujillo", "Tienda Arequipa"].map((t, i) => `<div class="fila-cas"><span class="pc"><input type="checkbox" ${i < 2 ? "checked" : ""}><span class="fondo"></span>${ic("check")}</span>${t}</div>`).join("")}</div>
    <div class="dz-casillas" style="border-top:1px solid var(--color-sand);padding-top:14px">
      <div class="fila-cas"><button type="button" class="pi" role="switch" aria-checked="true"></button>El precio incluye IGV</div>
      <div class="fila-cas"><button type="button" class="pi" role="switch" aria-checked="false"></button>Avisar cuando queden 2 o menos</div></div></div>`,
  A: () => `<div class="dz-hoja" style="gap:14px"><h5 style="font-size:20px">Qué tiendas venden esta etiqueta</h5>
    <div class="dz-casillas">${["Tienda Lima", "Tienda Trujillo", "Tienda Arequipa"].map((t, i) => `<div class="fila-cas"><input type="checkbox" class="h-cas" ${i < 2 ? "checked" : ""}>${t}</div>`).join("")}</div>
    <div class="dz-casillas" style="border-top:1px solid var(--color-sand);padding-top:14px">
      <div class="fila-cas"><button type="button" class="h-int" role="switch" aria-checked="true"></button>El precio incluye IGV</div>
      <div class="fila-cas"><button type="button" class="h-int" role="switch" aria-checked="false"></button>Avisar cuando queden 2 o menos</div></div></div>`,
  B: () => `<div class="dz-hoja" style="gap:14px"><h5 style="font-size:20px">Qué tiendas venden esta etiqueta</h5>
    <div class="dz-casillas">${["Tienda Lima", "Tienda Trujillo", "Tienda Arequipa"].map((t, i) => `<div class="fila-cas"><input type="checkbox" class="h-nativa" ${i < 2 ? "checked" : ""}>${t}</div>`).join("")}</div></div>`,
};

// =============================== LA LISTA QUE SE ABRE (sola, para compararlas) ===============================
const unCombo = (lista, ph = "Elegir categoría", clase = "pf-caja") => `<div class="pf" style="max-width:320px"><span class="pf-et">Categoría</span><div data-combo><button type="button" class="${clase}" data-disparador aria-haspopup="listbox" aria-expanded="false"><span class="pf-valor val-combo marcador">${ph}</span>${ic("chev", "pf-chev")}</button>${lista}</div></div>`;
const LARGA = [{ g: "Ropa", o: ["Blusas", "Camisas", "Casacas", "Faldas", "Pantalones", "Polos", "Vestidos"] }, { g: "Accesorios y empaque", o: ["Bolsas", "Cinturones", "Pañuelos"] }];
export const listas = {
  P1: () => `<div class="dz-lienzo" style="min-height:420px;flex-direction:row;flex-wrap:wrap;gap:24px">${unCombo(listaP({ opciones: CATEGORIAS }), "Categoría del gasto")}${unCombo(listaP({ opciones: LARGA, elegida: "Faldas" }), "Categoría de la prenda")}</div><p class="dz-nota">A la izquierda, 6 opciones (en cascada); a la derecha, 10 con grupos: aparece el buscador y la elegida lleva su ✓.</p>`,
  A: () => `<div class="dz-lienzo" style="min-height:420px;flex-direction:row;flex-wrap:wrap;gap:24px">${unCombo(listaHoy(CATEGORIAS), "Categoría del gasto", "h-caja caja-cayla")}${unCombo(listaHoy(LARGA, { elegida: "Faldas" }), "Categoría de la prenda", "h-caja caja-cayla")}</div>`,
  B: () => `<div class="dz-lienzo" style="min-height:420px">${hoy.buscable("Proveedor", "Busca por nombre o RUC", PROVEEDORES)}</div><p class="dz-nota">Escribe: la lista filtra y, si no está, ofrece registrarlo al pie.</p>`,
  C: () => `<div class="dz-lienzo" style="min-height:330px">${hoy.responsable()}</div>`,
};
