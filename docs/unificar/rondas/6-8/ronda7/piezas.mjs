// Ronda 7 de /unificar: tablas y títulos de sección. Piezas HTML de las demos; CSS y comportamiento en ../elegir-ronda6/.
import { ic, btn } from "../elegir-ronda6/piezas.mjs";
export { ic, btn };

// ---------- la tabla de ejemplo: comprobantes de compra de Tienda Lima (datos inventados) ----------
const FILAS = [
  { prov: "Textiles Andinos S.A.C.", doc: "F001-00482", emi: "02 oct", vence: ["Vence en 3 días", "ambar"], total: 4280.0, saldo: 2140.0, dias: 3 },
  { prov: "Botonería El Hilo", doc: "F002-01177", emi: "28 set", vence: ["Pagada", "verde"], total: 612.5, saldo: 0, dias: 99 },
  { prov: "Avíos del Sur E.I.R.L.", doc: "E001-00091", emi: "25 set", vence: ["Vencida hace 2 días", "rojo"], total: 1850.0, saldo: 1850.0, dias: -2 },
  { prov: "Cintas y Etiquetas Perú", doc: "F001-00310", emi: "24 set", vence: ["Vence en 12 días", "pizarra"], total: 960.0, saldo: 960.0, dias: 12 },
  { prov: "Lavandería Sol de Oro", doc: "B001-02231", emi: "20 set", vence: ["Pagada", "verde"], total: 245.0, saldo: 0, dias: 98 },
  { prov: "Distribuidora Lucero", doc: "F003-00057", emi: "18 set", vence: ["Vence en 20 días", "pizarra"], total: 3120.0, saldo: 1560.0, dias: 20 },
  { prov: "Imprenta Gráfica Norte", doc: "F001-00904", emi: "15 set", vence: ["Pagada", "verde"], total: 380.0, saldo: 0, dias: 97 },
];
const soles = (n) => (n === 0 ? "—" : "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const PLANT = "grid-template-columns: minmax(0,2.2fr) minmax(0,.8fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)";
const PLANT_IR = "grid-template-columns: minmax(0,2.2fr) minmax(0,.8fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) 16px";
const celdaProv = (f) => `<span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.prov}</span><span class="sub">${f.doc}</span></span>`;

// Hoy A · <Tabla> (components/ui/Tabla.tsx): banda arena, títulos taupe normales, zebra en hueso, hover crema
export const tablaHoyA = () => `<div class="dz-tabla h-tabla clic"><div class="cab" style="${PLANT}"><span>Proveedor · comprobante</span><span>Emisión</span><span>Vence</span><span class="der">Total</span><span class="der">Saldo</span></div>${FILAS.map((f) => `<div class="fila" style="${PLANT}">${celdaProv(f)}<span class="tenue">${f.emi}</span><span><span class="dz-chip ${f.vence[1]}">${f.vence[0]}</span></span><span class="der">${soles(f.total)}</span><span class="der ${f.saldo ? "" : "tenue"}">${soles(f.saldo)}</span></div>`).join("")}<div class="pie-t"><span>7 comprobantes · saldo S/ 6,510.00</span><span>Exportar</span></div></div>`;
// Hoy B · Compras y Proveedores: títulos en VERSALITAS sin banda, sin zebra
export const tablaHoyB = () => `<div class="dz-tabla h-tabla-v"><div class="cab" style="${PLANT}"><span>Proveedor · comprobante</span><span>Emisión</span><span>Vence</span><span class="der">Total</span><span class="der">Saldo</span></div>${FILAS.map((f) => `<div class="fila" style="${PLANT}">${celdaProv(f)}<span class="tenue">${f.emi}</span><span><span class="dz-chip ${f.vence[1]}">${f.vence[0]}</span></span><span class="der">${soles(f.total)}</span><span class="der ${f.saldo ? "" : "tenue"}">${soles(f.saldo)}</span></div>`).join("")}</div>`;
// Hoy C · la <table> hecha a mano (Comercial): cabecera en negrita con raya negra
export const tablaHoyC = () => `<div class="dz-tabla h-tabla-c" style="border:0;background:transparent"><div class="cab" style="${PLANT}"><span>Proveedor · comprobante</span><span>Emisión</span><span>Vence</span><span class="der">Total</span><span class="der">Saldo</span></div>${FILAS.map((f) => `<div class="fila" style="${PLANT}">${celdaProv(f)}<span class="tenue">${f.emi}</span><span>${f.vence[0]}</span><span class="der">${soles(f.total)}</span><span class="der">${soles(f.saldo)}</span></div>`).join("")}</div>`;
// Hoy F · Finanzas (fin-tabla, ADR-0195): la tabla del spike
export const tablaHoyF = () => `<div class="fin-tarjeta" style="border:1px solid var(--color-sand);border-radius:16px;background:var(--color-papel);overflow:hidden"><table class="fin-tabla" style="min-width:0"><thead><tr><th>Proveedor · comprobante</th><th>Emisión</th><th>Vence</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead><tbody>${FILAS.map((f) => `<tr><td>${f.prov}<br><span style="font-size:12px;color:var(--color-taupe)">${f.doc}</span></td><td>${f.emi}</td><td>${f.vence[0]}</td><td class="num">${soles(f.total)}</td><td class="num">${soles(f.saldo)}</td></tr>`).join("")}</tbody></table></div>`;

// Propuesta · <Tabla> con movimiento (P1 con banda y zebra; P2 «libro»: sin banda ni zebra)
const cabOrden = (t, campo, der = false, sort = "none") => `<span class="${der ? "der" : ""}"><button type="button" data-campo="${campo}" aria-sort="${sort}"><span>${t}</span>${ic("abajo")}</button></span>`;
export const tablaP = (variante = "zebra", { cajon = true } = {}) => `<div class="dz-tabla pt ${variante} clic dz-repite"><div class="cab" style="${PLANT_IR}">${cabOrden("Proveedor · comprobante", "prov")}${cabOrden("Emisión", "orden", false, "descending")}${cabOrden("Vence", "dias")}${cabOrden("Total", "total", true)}${cabOrden("Saldo", "saldo", true)}<span></span></div>${FILAS.map((f, i) => `<div class="fila entra" tabindex="0" role="link" style="${PLANT_IR};--i:${i}" data-prov="${f.prov}" data-orden="${100 - i}" data-dias="${f.dias}" data-total="${f.total}" data-saldo="${f.saldo}" data-nombre="${f.prov} · ${f.doc}">${celdaProv(f)}<span class="tenue">${f.emi}</span><span><span class="dz-chip ${f.vence[1]}">${f.vence[0]}</span></span><span class="der">${soles(f.total)}</span><span class="der ${f.saldo ? "" : "tenue"}">${soles(f.saldo)}</span>${ic("chevder", "ir")}</div>`).join("")}<div class="pie-t"><span>7 comprobantes · saldo <b style="color:var(--color-tinta)">S/ 6,510.00</b></span><span>Exportar</span></div></div>${cajon ? `<div class="dz-cajon" hidden style="margin-top:12px;border:1px solid var(--color-sand);border-radius:14px;background:var(--color-papel);padding:14px 18px;font-size:13.5px;animation:cayla-revelar 240ms var(--ease-cayla) both"><b class="nom"></b><span style="color:var(--color-taupe)"> — aquí se abriría su cajón. La fila se queda marcada mientras está abierto; tócala otra vez para cerrarlo.</span></div>` : ""}`;

// =============================== TÍTULOS DE SECCIÓN ===============================
const lineas = (pares) => pares.map(([a, b]) => `<div class="linea"><span>${a}</span><span>${b}</span></div>`).join("");
const VENTAS = [["Lunes 6", "S/ 612.00"], ["Martes 7", "S/ 845.50"], ["Miércoles 8", "S/ 530.00"]];
const REPONER = [["Blusa Aurora · M", "quedan 1"], ["Falda Nazca · S", "quedan 0"], ["Camisa Olmo · L", "quedan 2"]];
// P1 · serif 21 px + su dato o su acción a la derecha; entra con la cascada de la pantalla
export const titulosP1 = () => `<div class="dz-pantalla dz-repite ps-entra">
  <div class="dz-tarjeta" style="--i:0"><div class="ps"><h4>Ventas de esta semana</h4><span class="ps-dato"><b>S/ 1,987.50</b> · 14 ventas</span></div>${lineas(VENTAS)}</div>
  <div class="dz-tarjeta" style="--i:1"><div class="ps"><h4>Lo que falta reponer</h4><a class="ps-acc" href="#">Ver las 9 ${ic("flechader")}</a></div>${lineas(REPONER)}</div>
</div>`;
export const titulosP2 = () => `<div class="dz-pantalla dz-repite ps-entra">
  <div class="dz-tarjeta" style="--i:0"><div class="ps v"><h4>Ventas de esta semana</h4><span class="ps-dato"><b>S/ 1,987.50</b> · 14 ventas</span></div>${lineas(VENTAS)}</div>
  <div class="dz-tarjeta" style="--i:1"><div class="ps v"><h4>Lo que falta reponer</h4><a class="ps-acc" href="#">Ver las 9 ${ic("flechader")}</a></div>${lineas(REPONER)}</div>
</div>`;
const titHoy = (cls, t1, t2, fuera = false) => `<div class="dz-pantalla">${fuera ? `<div><h4 class="${cls}">${t1}</h4><div class="dz-tarjeta">${lineas(VENTAS)}</div></div><div><h4 class="${cls}">${t2}</h4><div class="dz-tarjeta">${lineas(REPONER)}</div></div>` : `<div class="dz-tarjeta"><h4 class="${cls}">${t1}</h4>${lineas(VENTAS)}</div><div class="dz-tarjeta"><h4 class="${cls}">${t2}</h4>${lineas(REPONER)}</div>`}</div>`;
export const titulosHoy = {
  A: () => titHoy("h-ts", "Ventas de esta semana", "Lo que falta reponer"),
  B: () => titHoy("h-tv", "Ventas de esta semana", "Lo que falta reponer", true),
  C: () => titHoy("h-tn", "Ventas de esta semana", "Lo que falta reponer"),
  F: () => titHoy("h-tf", "Ventas de esta semana", "Lo que falta reponer", true),
};

// Título de grupo dentro de una hoja
const filaDato = (a, b) => `<div style="display:flex;justify-content:space-between;font-size:14px;padding:6px 0"><span style="color:var(--color-taupe)">${a}</span><span>${b}</span></div>`;
const grupos = (tit) => `<div class="dz-hoja dz-repite" style="gap:0"><h5>Venta B001-00412</h5><p class="baj" style="margin-bottom:4px">Tienda Lima · hoy 11:42 · atendió Lucía Quispe</p>
  ${tit("Prendas", 1, "2 prendas")}${filaDato("Blusa Aurora · M · Crema", "S/ 129.00")}${filaDato("Falda Nazca · S · Negro", "S/ 149.00")}
  ${tit("Pago", 2, "")}${filaDato("Yape", "S/ 200.00")}${filaDato("Efectivo", "S/ 78.00")}
  ${tit("Comprobante", 3, "")}${filaDato("Boleta electrónica", "Aceptada por SUNAT")}</div>`;
export const gruposP1 = () => grupos((t, i, n) => `<div class="pg" style="--retraso:${120 + i * 90}ms">${t}${n ? ` <span class="n">· ${n}</span>` : ""}</div>`);
export const gruposHoy = {
  A: () => grupos((t) => `<p style="margin:16px 0 6px;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:600;color:color-mix(in srgb,var(--color-tinta) 65%,transparent)">${t}</p>`),
  B: () => grupos((t) => `<h3 style="margin:16px 0 6px;font-size:13.5px;font-weight:600;color:var(--color-tinta)">${t}</h3>`),
  C: () => grupos((t) => `<h3 style="margin:18px 0 6px;font:400 18px/1.2 var(--font-serif);color:var(--color-tinta)">${t}</h3>`),
};

// Separador de día en una lista larga (ventas del mostrador, Actividad, conteos, movimientos)
const DIAS = [
  ["Hoy · lunes 12 de octubre", "S/ 514.50 · 7 ventas", [["B001-00412 · Lucía Q.", "S/ 278.00"], ["B001-00411 · Jorge T.", "S/ 89.00"], ["B001-00410 · Lucía Q.", "S/ 147.50"]]],
  ["Ayer · domingo 11", "S/ 1,120.00 · 12 ventas", [["B001-00409 · María R.", "S/ 312.00"], ["B001-00408 · Jorge T.", "S/ 199.00"], ["B001-00407 · Lucía Q.", "S/ 609.00"]]],
  ["Sábado 10 de octubre", "S/ 2,045.00 · 19 ventas", [["B001-00406 · María R.", "S/ 455.00"], ["B001-00405 · Lucía Q.", "S/ 1,590.00"]]],
];
const items = (xs) => xs.map(([a, b]) => `<div class="item"><span>${a}</span><span>${b}</span></div>`).join("");
export const diasP1 = () => `<div class="dz-scroll">${DIAS.map(([d, tot, xs], i) => `<div class="pd ${i === 0 ? "hoy" : ""}"><span>${d}</span><span class="tot"><b>${tot.split(" · ")[0]}</b> · ${tot.split(" · ")[1]}</span></div>${items(xs)}`).join("")}</div><p class="dz-nota">Baja la lista: el día se queda pegado arriba mientras pasan sus ventas.</p>`;
export const diasHoy = {
  A: () => `<div class="dz-scroll">${DIAS.map(([d, tot, xs]) => `<div class="h-dia">${d.split(" · ")[0]}${d.includes("·") ? "" : ""}</div>${items(xs)}`).join("")}</div>`,
  B: () => `<div class="dz-scroll">${DIAS.map(([d, tot, xs]) => `<div class="h-dia2">${d.replace(" · ", " ")}</div>${items(xs)}`).join("")}</div>`,
  C: () => `<div class="dz-scroll">${DIAS.map(([d, tot, xs]) => `<div class="h-dia3">${d.split(" · ")[0]} <span style="font-weight:400;color:var(--color-taupe)">${tot}</span></div>${items(xs)}`).join("")}</div>`,
};
