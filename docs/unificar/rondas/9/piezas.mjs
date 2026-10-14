// Ronda 9 de /unificar: el HTML de cada demo viva (hoy y propuestas) de las seis decisiones abiertas de las rondas 6–8.
// Lo que existe hoy se copia del DOM real (vivas.json, de piezas-vivas.mjs); las propuestas usan las clases reales del ERP y demo9.css.
import { readFileSync, existsSync } from "node:fs";

const V = existsSync("vivas.json") ? JSON.parse(readFileSync("vivas.json", "utf8")) : {};
const vivo = (k) => (V[k] ?? `<p class="dz-nota">(falta «${k}» en vivas.json: corre piezas-vivas.mjs)</p>`).replace(/<!-- -->/g, "");

// ---------- íconos (lucide) ----------
const svg = (d, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  blusa: `<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>`,
  pantalon: `<path d="M7 2h10l1 20h-4l-2-12-2 12H6z"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  chev: `<path d="m6 9 6 6 6-6"/>`,
  x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  tag: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>`,
  reloj: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  lupa: `<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`,
  barras: `<path d="M3 5v14M6.5 5v14M8.5 5v14M12 5v14M15 5v14M17 5v14M21 5v14"/>`,
  enter: `<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>`,
};
const icono = (n, cls = "") => svg(I[n], cls);

export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span><button type="button" class="dz-repetir">↻ Repetir la entrada</button></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// El buscador del sistema (<Buscador>), copiado del DOM real de Llegó mercadería y adaptado a cada demo.
const buscador = ({ icono: ic = "barras", placeholder, valor = "", guia = "" }) =>
  `<div class="buscador" ${valor ? "data-con-texto" : ""} data-sg-buscador="${guia}">${svg(I[ic], "buscador-icono")}<input type="search" autocomplete="off" spellcheck="false" placeholder="${placeholder}" value="${valor}"><span class="buscador-senal" aria-hidden="true">Buscando…</span><button type="button" class="buscador-borrar" aria-label="Borrar la búsqueda">${svg(I.x, "lucide lucide-x")}</button><span class="buscador-hilo" aria-hidden="true"></span></div>`;

// ============================== 1 · LA LISTA DE SUGERENCIAS ==============================
// Prendas de ejemplo: el color es dato (la baldosa de la prenda sin foto: ícono de su categoría sobre su color, ADR-0333).
const PRENDAS = [
  { n: "Blusa Lino Aurora", d: "S · Negro · BLU-0004-NEG-S", hex: "#1f1f1d", trazo: "#f5f0e8", ic: "blusa", doc: "F001-000198", marca: "CAYLA" },
  { n: "Blusa Lino Aurora", d: "L · Beige · BLU-0004-BEI-L", hex: "#d9c4a3", trazo: "#5b4636", ic: "blusa", doc: "F001-000198", marca: "CAYLA" },
  { n: "Blusa Emma", d: "M · Marfil · BLU-0001-MAR-M", hex: "#efe7d6", trazo: "#6b5a49", ic: "blusa", doc: "F001-000201", marca: "CAYLA" },
  { n: "Blusa Emma", d: "L · Terracota · BLU-0001-TER-L", hex: "#b4532f", trazo: "#f5f0e8", ic: "blusa", doc: "F001-000201", marca: "CAYLA" },
  { n: "Blusa Sol de Ica", d: "S · Azul noche · BLU-0009-AZN-S", hex: "#2c3b56", trazo: "#e9e3d8", ic: "blusa", doc: "F002-001045", marca: "Andina" },
  { n: "Pantalón Carla", d: "28 · Beige · PAN-0001-BEI-28", hex: "#d9c4a3", trazo: "#5b4636", ic: "pantalon", doc: "F001-000198", marca: "CAYLA" },
];
const mini = (p) => `<span class="sg-mini" data-color-dato style="background:${p.hex};color:${p.trazo}">${icono(p.ic)}</span>`;
const filaSg = (p, i, { derecha = "", tecla = true } = {}) =>
  `<div class="sg-fila ${i === 0 ? "activa" : ""}" role="option" aria-selected="${i === 0}" data-sg-fila data-n="${p.n}" data-d="${p.d}" style="--i:${i}"><span class="sg-canto" aria-hidden="true"></span>${mini(p)}<span class="sg-txt"><span class="sg-n">${p.n}</span><span class="sg-d">${p.d}${p.marca ? ` · ${p.marca}` : ""}</span></span>${derecha}${tecla ? `<span class="sg-tecla">${svg(I.enter, "")} Enter</span>` : ""}</div>`;

const listaPistola = (conDoc) =>
  `<div class="lista-flotante sg-lista" role="listbox" data-sg-lista>${PRENDAS.map((p, i) => filaSg(p, i, { derecha: conDoc ? `<span class="sg-der">${p.doc}</span>` : "" })).join("")}<div class="sg-pie">↑ ↓ para moverte · Enter suma la marcada · Esc cierra</div></div>`;
const pistola = (titulo, conDoc, placeholder) =>
  `<div class="dz-et2">${titulo}</div><div data-sg><div class="dz-ancla dz-reserva">${buscador({ placeholder, valor: "Blusa" })}<div class="dz-flota">${listaPistola(conDoc)}</div></div><p class="dz-lectura" role="status" data-sg-lectura></p></div>`;

const FACTURAS = [
  { doc: "F077-08080707", prov: "Confecciones del Sur EIRL", chip: ["Pagada", "verde"], emi: "28/09", total: "S/ 1,524.00", saldo: "Sin saldo" },
  { doc: "F001-000210", prov: "Textiles Andina SAC", chip: ["Pagada", "verde"], emi: "28/09", total: "S/ 8,496.00", saldo: "Sin saldo" },
  { doc: "F002-001045", prov: "Confecciones del Sur EIRL", chip: ["Pendiente", "ambar"], emi: "28/09", total: "S/ 37,453.20", saldo: "Saldo S/ 37,453.20" },
  { doc: "F001-000198", prov: "Textiles Andina SAC", chip: ["Vencida", "rojo"], emi: "14/08", total: "S/ 5,333.60", saldo: "Saldo S/ 5,333.60" },
];
const TONO = { verde: "background:color-mix(in srgb,var(--color-verde) 15%,transparent);color:var(--color-verde)", ambar: "background:color-mix(in srgb,var(--color-ambar) 15%,transparent);color:var(--color-ambar)", rojo: "background:color-mix(in srgb,var(--color-rojo) 10%,transparent);color:var(--color-rojo-profundo)" };
const filaFactura = (f, i) =>
  `<div class="sg-fila ${i === 0 ? "activa" : ""}" role="option" aria-selected="${i === 0}" data-sg-fila data-n="${f.doc}" data-d="${f.prov}" style="--i:${i}"><span class="sg-canto" aria-hidden="true"></span><span class="sg-txt"><span class="sg-n"><b style="font-weight:600">${f.doc}</b> <span style="color:var(--color-taupe);font-size:13px">${f.prov}</span></span><span class="sg-d"><span class="chip-mini" style="${TONO[f.chip[1]]}">${f.chip[0]}</span>emitida ${f.emi}</span></span><span class="sg-der"><b>${f.total}</b>${f.saldo}</span><span class="sg-tecla">${svg(I.enter, "")} Enter</span></div>`;
const facturasSistema = () =>
  `<div class="dz-et2">Registrar nota de crédito · factura de origen</div><div data-sg>${buscador({ icono: "lupa", placeholder: "Serie-número, proveedor o monto" })}<p class="dz-nota" style="margin:6px 0 8px">4 facturas · ↑↓ para moverte</p><div class="dz-filtros" style="margin-bottom:10px"><button type="button" class="pildora-cayla" data-activa="true">Todas</button><button type="button" class="pildora-cayla">Con saldo</button><button type="button" class="pildora-cayla">Pagadas</button></div><div class="lista-flotante sg-lista en-linea" role="listbox" data-sg-lista>${FACTURAS.map(filaFactura).join("")}</div><p class="dz-lectura" role="status" data-sg-lectura></p></div>`;

const hoyLlegada = () =>
  `<div class="dz-et2">Llegó mercadería · ¿Qué llegó?</div><div class="dz-ancla dz-reserva">${vivo("llegadaBuscador")}<div class="dz-flota">${vivo("llegadaLista").replace(/style="[^"]*"/, 'style="max-height:280px"')}</div></div>`;
const hoyRecepcion = () => `<div class="dz-et2">Recibir contra factura · escanear</div><div class="dz-reserva">${vivo("recepcionCaja").replace(/top-\[calc\(100%\+6px\)\]/, "top-[calc(100%+6px)]")}</div>`;
const hoyNota = () => `<div class="dz-et2">Registrar nota de crédito · factura de origen</div>${vivo("ncSeccion")}`;

export const sugerencias = {
  P1: () => `<div class="dz-lienzo"><div class="dz-columnas"><div>${pistola("Llegó mercadería · ¿Qué llegó?", false, "Escanea o busca la prenda")}</div><div>${pistola("Recibir contra factura · escanear", true, "Escanea la etiqueta o busca por código…")}</div></div><div class="dz-papel">${facturasSistema()}</div></div>`,
  P2: () => `<div class="dz-lienzo"><div class="dz-columnas"><div>${pistola("Llegó mercadería · ¿Qué llegó?", false, "Escanea o busca la prenda")}</div><div>${pistola("Recibir contra factura · escanear", true, "Escanea la etiqueta o busca por código…")}</div></div><div class="dz-papel">${hoyNota()}</div></div>`,
  A: () => `<div class="dz-lienzo"><div class="dz-columnas"><div>${hoyLlegada()}</div><div>${hoyRecepcion()}</div></div><div class="dz-papel">${hoyNota()}</div></div>`,
};

// ============================== 2 · LA PLANILLA DE CONTEO ==============================
const TALLAS = [["S", 4, null], ["M", 6, null], ["L", 3, 3], ["XL", 2, null], ["Estándar", 1, null]];
const chip = (t, tono) => {
  const c = { neutro: "background:var(--color-sand);color:var(--color-taupe)", verde: TONO.verde, rojo: TONO.rojo };
  return `<span class="chip-cf" style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:12px;line-height:20px;${c[tono]}"><span style="width:6px;height:6px;border-radius:99px;background:currentColor"></span>${t}</span>`;
};
const estadoDe = (debe, n) => (n === null ? chip("Pendiente", "neutro") : n === debe ? chip("Correcto", "verde") : n < debe ? chip(`Faltan ${debe - n}`, "rojo") : chip(`Hay ${n - debe} de más`, "rojo"));
const filaConteo = ([t, debe, n], k) =>
  `<tr data-cf-fila data-debe="${debe}" class="${n === debe ? "correcta" : ""}" style="--k:${k}"><th scope="row" style="${t.length > 5 ? "font-size:12px" : ""}">${t}</th><td class="debe">${debe}</td><td><span class="cf-campo"><button type="button" class="cf-mas" data-cf-paso="-1" tabindex="-1" aria-label="Restar uno">−</button><input class="caja-campo-input" inputmode="numeric" value="${n ?? ""}" placeholder="—" aria-label="Contaste talla ${t}"><button type="button" class="cf-mas" data-cf-paso="1" tabindex="-1" aria-label="Sumar uno">+</button></span></td><td data-cf-estado>${estadoDe(debe, n)}</td></tr>`;
const tarjetaConteo = (clase) =>
  `<article class="cf-tarjeta" data-cf><header class="cf-cab"><span class="cf-mini" data-color-dato style="background:#d9c4a3;color:#5b4636">${icono("blusa")}</span><div style="flex:1;min-width:8rem"><h3>Blusa Lino Aurora</h3><p><span class="cf-punto" data-color-dato style="background:#d9c4a3"></span>Beige <span>· 5 tallas</span></p></div><button type="button" class="btn-cayla btn-secundario" style="height:36px;min-height:0;padding:0 12px;font-size:13px;color:var(--color-rojo-profundo)" data-cf-completar>Completar todo</button></header><table class="cf-tabla ${clase}"><colgroup><col style="width:4.5rem"><col style="width:7rem"><col style="width:12rem"><col></colgroup><thead><tr><th scope="col">Talla</th><th scope="col">Debe haber</th><th scope="col">Contaste</th><th scope="col">Estado</th></tr></thead><tbody>${TALLAS.map(filaConteo).join("")}</tbody></table></article>`;
export const conteo = {
  P1: () => `<div class="dz-lienzo">${tarjetaConteo("cf-tabla-sis")}</div>`,
  A: () => `<div class="dz-lienzo">${tarjetaConteo("cf-hoy")}</div>`,
};

// ============================== 3 · LOS FILTROS DE FRESCURA ==============================
const ESTADOS = [
  { t: "Todos los estados", v: "todos" },
  { g: "Cuánto lleva", o: [["Fresca", "nueva"], ["Vigente", "vigente"], ["Envejeciendo", "envejeciendo"]] },
  { g: "Otros", o: [["Aún no se sabe", "sin_comparar"], ["Clásicos", "clasico"], ["Su stock no cuadra", "dudosa"], ["Apartadas", "apartada"]] },
  { g: "Temporada", o: [["Temporada pasada", "temporada_pasada"], ["Sin temporada", "sin_temporada"]] },
];
const CATS = ["Todas las categorías", "Camisas y Blusas", "Casacas", "Faldas", "Pantalones", "Vestidos"];
const opFz = (t, v, i, sel) => `<div class="fz-op" role="option" aria-selected="${sel}" data-fz-op data-valor="${v}" data-texto="${t}" style="--i:${i}"><span class="sg-canto" aria-hidden="true"></span><span class="t">${t}</span>${svg(I.check, "combo-tilde")}</div>`;
const listaEstados = (titulos) => {
  let i = 0;
  return ESTADOS.map((e) => (e.t ? opFz(e.t, e.v, i++, true) : `${titulos ? `<p class="fz-grupo-titulo" aria-hidden="true">${e.g}</p>` : `<div class="fz-grupo-raya" aria-hidden="true"></div>`}<div role="group" aria-label="${e.g}">${e.o.map(([t, v]) => opFz(t, v, i++, false)).join("")}</div>`)).join("");
};
const listaCats = () => CATS.map((t, i) => opFz(t, i ? t : "todas", i, i === 0)).join("");
// La píldora del sistema (DesplegablePildora), con la misma estructura que su DOM real.
const pildora = (nombre, ic, valorTodos, lista) =>
  `<div class="dz-ancla" data-fz data-todos="${valorTodos}" data-nombre="${nombre}"><div class="pildora-filtro shrink-0" data-fz-pildora><button type="button" aria-haspopup="listbox" aria-expanded="false" class="pildora-filtro-boton" data-fz-abre>${svg(I[ic], "pildora-filtro-icono")}<span class="pildora-filtro-nombre">${nombre}</span><span class="pildora-filtro-valor" hidden><span class="truncate"></span></span>${svg(I.chev, "pildora-filtro-flecha")}</button><button type="button" class="pildora-filtro-quitar" data-fz-quitar hidden aria-label="Quitar filtro ${nombre}">${svg(I.x, "")}</button></div><div class="dz-flota angosta" hidden data-fz-lista><div class="lista-flotante fz-lista anim-revelar" role="listbox">${lista}</div></div></div>`;
const barraFrescura = (titulos) =>
  `<div class="dz-papel" style="padding:12px 18px;min-height:430px"><div class="dz-filtros">${buscador({ icono: "lupa", placeholder: "Prenda, color o código" }).replace('class="buscador"', 'class="buscador" style="flex:1 1 220px;max-width:300px"')}${pildora("Categoría", "tag", "todas", listaCats())}${pildora("Estado", "reloj", "todos", `<div class="combo-buscar">${svg(I.lupa, "")}<input placeholder="Buscar…" aria-label="Buscar estado"></div>${listaEstados(titulos)}`)}<button type="button" class="pildora-cayla" aria-pressed="false">Por decidir <span class="font-medium tabular-nums">0</span></button></div><p class="dz-nota" style="margin-top:14px">Abre «Estado»: las opciones van en tres grupos. Elige una y la píldora queda puesta con su ✕.</p></div>`;
const hoyFrescura = () => {
  // La barra real (dos cajas) y, al tocar «Estado», la lista real que abre hoy.
  const barra = vivo("frescuraBarra").replace(/aria-label="Estado" aria-controls="[^"]*" class="([^"]*)"/, 'aria-label="Estado" class="$1" data-fz-hoy');
  return `<div class="dz-papel" style="padding:0;min-height:430px"><div class="dz-ancla">${barra}<div class="dz-flota angosta" style="left:min(560px,60%);top:56px" hidden data-fz-hoy-lista>${vivo("frescuraListaEstado")}</div></div><p class="dz-nota" style="padding:0 18px 14px">Toca «Todos los estados»: así abre hoy (la caja de un formulario haciendo de filtro).</p></div>`;
};
export const frescura = { P1: () => barraFrescura(true), P2: () => barraFrescura(false), A: hoyFrescura };

// ============================== 4 · DESACTIVAR COLOR ==============================
const hojaColor = (pie) =>
  `<div class="dc-hoja" data-dc><h5>Editar color</h5><div class="dc-muestra"><i data-color-dato style="background:#b4532f"></i><span><b style="font-weight:600">Terracota</b><br><span style="color:var(--color-taupe);font-size:12.5px">TER · Pantone 18-1438 TCX · ninguna prenda activa lo usa</span></span></div>${pie}</div>`;
export const desactivar = {
  A: () => `<div class="dz-lienzo">${hojaColor(vivo("coloresPie").replace(/class="btn-cayla btn-enlace text-xs ?"/, 'class="btn-cayla btn-enlace text-xs" data-dc-desactivar'))}</div>`,
  P1: () =>
    `<div class="dz-lienzo">${hojaColor(`<div class="dc-pie-sis"><button type="button" class="btn-cayla btn-peligro" data-dc-desactivar><span class="relative">Desactivar color</span></button><div class="der"><button type="button" class="btn-cayla btn-secundario"><span class="relative">Cancelar</span></button><button type="button" class="btn-cayla btn-primario"><span class="relative">Guardar</span></button></div></div><p class="text-xs" style="margin:0;font-size:12px;color:color-mix(in srgb,var(--color-tinta) 55%,transparent)">Desactivar se bloquea si todavía hay una prenda activa con este color.</p>`)}</div>`,
  P2: () =>
    `<div class="dz-lienzo">${hojaColor(`<div class="flex gap-2 pt-3" style="display:flex;gap:8px"><button type="button" class="btn-cayla btn-secundario flex-1" style="flex:1"><span class="relative">Cancelar</span></button><button type="button" class="btn-cayla btn-primario flex-1" style="flex:1"><span class="relative">Guardar</span></button></div><div class="dc-linea"><span>¿Ya no se usa este color? Se bloquea si todavía hay una prenda activa con él.</span><button type="button" class="btn-cayla btn-peligro btn-chico" data-dc-desactivar><span class="relative">Desactivar color</span></button></div>`)}</div>`,
};

// ============================== 5 · EL CONTEO DE UN TÍTULO ==============================
const filas = (n) => `<div class="ts-filas">${["Blusa Lino Aurora · Beige", "Blusa Emma · Marfil", "Camisa Olmo · Blanco"].slice(0, n).map((t, i) => `<span>${t}<i>${[12, 7, 4][i]} días</i></span>`).join("")}</div>`;
const oc = (n, p) => `<div class="ts-oc"><b>${n}</b>${p}</div>`;
const COLS = [["Generadas", 3, [oc("OC-0012", "Textiles Andina · 120 u."), oc("OC-0013", "Avíos del Sur · 40 u.")]], ["Enviadas", 1, [oc("OC-0010", "Confecciones del Sur · 80 u.")]], ["Recibidas", 0, []]];
const tituloCon = (texto, cuenta, modo) =>
  modo === "derecha"
    ? `<div class="titulo-seccion"><h2 class="titulo-seccion-texto">${texto}</h2><span class="titulo-seccion-lado"><span class="titulo-seccion-dato">${cuenta}</span></span></div>`
    : `<div class="titulo-seccion"><h2 class="titulo-seccion-texto">${texto}${modo === "globo" ? `<span class="ts-globo">${cuenta.replace(/\D.*$/, "")}</span>` : `<span class="ts-cuenta">${cuenta}</span>`}</h2></div>`;
const grupoCon = (texto, n, modo) =>
  modo === "globo"
    ? `<h3 class="titulo-grupo"><span class="titulo-grupo-texto">${texto}<span class="ts-globo">${n}</span></span></h3>`
    : `<h3 class="titulo-grupo"><span class="titulo-grupo-texto">${texto}<span class="titulo-grupo-cuenta"> · ${n}</span></span></h3>`;
const resumenDerecha = `<div class="titulo-seccion"><h2 class="titulo-seccion-texto">Toda la tienda</h2><span class="titulo-seccion-lado"><span class="titulo-seccion-dato"><b>46</b> unidades colgadas · <b>S/ 3,881</b> a precio de venta</span></span></div>`;
const escenaTitulos = (modo) => {
  const cuenta = modo === "derecha" ? "<b>7</b> prendas" : modo === "globo" ? "7" : "7 prendas";
  const pend = modo === "derecha" ? "<b>3</b>" : "3";
  return `<div class="dz-lienzo"><div class="ts-tarjeta">${resumenDerecha}<p class="dz-nota" style="margin:-4px 0 0">Un resumen (dinero, unidades) se queda a la derecha en las tres formas.</p></div><div class="ts-tarjeta">${tituloCon("Camisas y Blusas", cuenta, modo)}${filas(3)}</div><div class="ts-tarjeta">${tituloCon("Pendientes", pend, modo)}${filas(2)}</div><div class="ts-tablero">${COLS.map(([t, n, ocs]) => `<div class="ts-col">${grupoCon(t, n, modo === "derecha" ? "punto" : modo)}${ocs.join("")}</div>`).join("")}</div></div>`;
};
const escenaAntes = () =>
  `<div class="dz-lienzo"><div class="ts-tarjeta"><p class="ts-antes-s">Camisas y Blusas <small>7</small></p>${filas(3)}</div><div class="ts-tarjeta"><p class="ts-antes-v">Pendientes (3)</p>${filas(2)}</div><div class="ts-tablero">${COLS.map(([t, n, ocs]) => `<div class="ts-col"><div style="display:flex;justify-content:space-between"><span class="ts-antes-v">${t}</span><span style="font-size:12px;color:color-mix(in srgb,var(--color-tinta) 65%,transparent)">${n}</span></div>${ocs.join("")}</div>`).join("")}</div></div>`;
export const titulos = { A: () => escenaTitulos("derecha"), P1: () => escenaTitulos("junto"), P2: () => escenaTitulos("globo"), B: escenaAntes };

// ============================== 6 · LAS ACCIONES CHICAS ==============================
// Cinco acciones reales: tres que cambian varias cosas a la vez y dos que corrigen una sola.
const ACCIONES = [
  { q: "Reparto entre tiendas", d: `<span class="nums" data-ac-nums><span>—</span><span>—</span><span>—</span></span>`, t: "Repartir todas en partes iguales", masiva: true, hace: "repartir" },
  { q: "Pendientes de llegar", d: "Por urgencia: lo atrasado primero", t: "Marcar las 3 atrasadas", masiva: true, hace: "hecho" },
  { q: "Pago con saldo a favor", d: "Textiles Andina te debe <b>S/ 120.00</b>", t: "Usar S/ 120.00", masiva: true, hace: "hecho" },
  { q: "Factura de origen", d: "<b>F001-000198</b> · Textiles Andina SAC", t: "Cambiar", masiva: false, hace: "hecho" },
  { q: "Última lectura", d: `<span style="color:var(--color-verde)">✓ Sumó 1 · Pantalón Carla 28 / Beige</span>`, t: "Deshacer", masiva: false, hace: "hecho" },
];
const accion = (a, forma) => {
  const cara = forma === "enlace" || (forma === "mezcla" && !a.masiva)
    ? `<button type="button" class="btn-cayla btn-enlace text-xs" data-ac="${a.hace}">${a.t}</button>`
    : forma === "antes"
      ? `<button type="button" class="ac-antes" data-ac="${a.hace}">${a.t}</button>`
      : `<button type="button" class="btn-cayla btn-sutil btn-chico" data-ac="${a.hace}"><span class="relative">${a.t}</span></button>`;
  return `<div class="ac-fila"><span><span class="q">${a.q}</span>${a.d}</span><span style="display:inline-flex;align-items:center">${cara}</span></div>`;
};
const hojaAcciones = (forma) => `<div class="dz-lienzo"><div class="ac-hoja">${ACCIONES.map((a) => accion(a, forma)).join("")}</div></div>`;
export const acciones = { A: () => hojaAcciones("enlace"), P1: () => hojaAcciones("boton"), P2: () => hojaAcciones("mezcla"), B: () => hojaAcciones("antes") };
