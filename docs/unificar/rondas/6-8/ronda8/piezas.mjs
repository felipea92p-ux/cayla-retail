// Ronda 8 de /unificar: enlaces de texto, paginación y avatares. Piezas HTML; CSS y comportamiento en ../elegir-ronda6/.
import { ic, P } from "../elegir-ronda6/piezas.mjs";
P.chevizq = ['<path d="m15 18-6-6 6-6"/>'];

// ---------- ENLACES ----------
const frase = (cls) => `<p class="dz-parrafo">Este proveedor todavía no tiene cuenta para pagarle. <a class="${cls}" href="#">Regístrala en Proveedores</a> y vuelve a esta factura: el pago queda listo para el viernes.</p>
<p class="dz-parrafo">Las metas de cada tienda se ponen en <a class="${cls}" href="#">Configuración ▸ Presupuesto</a>; el reporte las toma de ahí.</p>`;
export const enlaceFrase = { P1: () => frase("pe"), P2: () => frase("pe2"), A: () => frase("h-en-a"), B: () => frase("h-en-b"), C: () => frase("h-en-c") };
const tarjetaVer = (accion) => `<div class="dz-lienzo" style="gap:10px">
  <div class="dz-tarjeta-ver"><span><b>3 facturas</b> vencen esta semana · S/ 6,510.00</span>${accion("Pagar vencido")}</div>
  <div class="dz-tarjeta-ver"><span><b>9 prendas</b> están por acabarse en Tienda Lima</span>${accion("Ver las 9")}</div>
  <div class="dz-tarjeta-ver"><span><b>2 comprobantes</b> esperan respuesta de SUNAT</span>${accion("En cola: se reintenta solo")}</div>
</div>`;
export const enlaceVer = {
  P1: () => tarjetaVer((t) => `<a class="pv" href="#">${t}${ic("flechader")}</a>`),
  P2: () => tarjetaVer((t) => `<a class="pv2" href="#">${t}${ic("flechader")}</a>`),
  A: () => tarjetaVer((t) => `<a class="h-vm-a" href="#">${t} →</a>`),
  B: () => tarjetaVer((t) => `<a class="h-vm-b" href="#">${t} →</a>`),
};

// ---------- PAGINACIÓN ----------
const NOMBRES = ["Blusa Aurora", "Camisa Olmo", "Falda Nazca", "Vestido Brisa", "Polo Ica", "Pantalón Inca", "Casaca Andes", "Top Paracas", "Short Mancora", "Chaleco Colca"];
const filas = (n) => Array.from({ length: n }, (_, i) => `<div class="item"><span>${NOMBRES[i % NOMBRES.length]} · ${["S", "M", "L"][i % 3]}</span><span>#${String(1040 - i).padStart(4, "0")}</span></div>`).join("");
const TOTAL = 64, POR = 8;
export const paginacion = {
  P1: () => `<div class="dz-lista-pag"><div class="filas">${filas(POR)}</div><div class="pie-pag"><span class="rango"><b>1–${POR}</b> de <b>${TOTAL}</b></span>
    <nav class="pg2" data-paginas data-total="${TOTAL}" data-por="${POR}" data-pagina="1" aria-label="Paginación"><span class="pista"></span>
    <button type="button" class="flecha ant" aria-label="Página anterior" disabled>${ic("chevizq", "izq")}</button>
    ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" data-p="${n}" ${n === 1 ? 'aria-current="page"' : ""}>${n}</button>`).join("")}
    <button type="button" class="flecha sig" aria-label="Página siguiente">${ic("chevder", "der")}</button></nav></div></div>`,
  P2: () => `<div class="dz-lista-pag"><div class="filas">${filas(POR)}</div><div class="vermas"><div class="barra-v"><span style="width:${(100 * POR) / TOTAL}%"></span></div><span class="cuenta">Ves <b>${POR}</b> de <b>${TOTAL}</b></span><button type="button" class="btn-cayla btn-secundario" data-vermas data-total="${TOTAL}" data-por="${POR}">Ver ${POR} más</button></div></div>`,
  A: () => `<div class="dz-lista-pag"><div class="filas">${filas(POR)}</div><div class="pie-pag"><span>Mostrando 1–${POR} de ${TOTAL}</span><nav class="h-pag"><button type="button" disabled>‹</button>${[1, 2, 3].map((n) => `<button type="button" ${n === 1 ? 'aria-current="page"' : ""}>${n}</button>`).join("")}<span style="color:color-mix(in srgb,var(--color-tinta) 40%,transparent)">…</span><button type="button">8</button><button type="button">›</button></nav></div></div>`,
  C: () => `<div class="dz-lista-pag"><div class="filas">${filas(POR)}</div><div class="pie-pag"><span>Últimos 30 días</span><button type="button" class="h-pag-sig">Siguiente página →</button></div></div>`,
};

// ---------- AVATARES ----------
const GENTE = [["MR", "María Ríos", "Encargada · Tienda Lima", "var(--color-taupe)"], ["LQ", "Lucía Quispe", "Integrante · Tienda Lima", "var(--color-pizarra)"], ["JT", "Jorge Torres", "Integrante · Tienda Trujillo", "var(--color-verde)"], ["SA", "Sandra Álvarez", "Líder de equipo", "var(--color-ambar)"], ["MV", "Micaela Vega", "Integrante · Tienda Arequipa", "var(--color-pizarra)"]];
const av = (g, tam, { tono = false, punto = false, foto = false } = {}) => `<span class="av s${tam} ${tono ? "tono" : ""} ${foto ? "foto" : ""}" ${tono ? `style="--tono:${g[3]}"` : ""} aria-hidden="true">${g[0]}${punto ? '<span class="punto"></span>' : ""}</span>`;
const avatares = (tono) => `<div class="dz-gente dz-repite">
  <span class="et">Cuatro tamaños: 24 · 32 · 40 · 80</span>
  <div class="fila-g">${[24, 32, 40, 80].map((t) => av(GENTE[0], t, { tono })).join("")}</div>
  <span class="et">En una lista (Actividad, Equipo) · de turno lleva su punto</span>
  <div class="fila-g">${GENTE.slice(0, 3).map((g, i) => `<span class="persona">${av(g, 40, { tono, punto: i < 2 })}<span>${g[1]}<small>${g[2]}</small></span></span>`).join("")}</div>
  <span class="et">Varias personas juntas · pasa el mouse</span>
  <div class="fila-g"><span class="pila">${GENTE.slice(0, 4).map((g) => av(g, 32, { tono })).join("")}<span class="mas">+2</span></span></div>
</div>`;
export const avatar = {
  P1: () => avatares(false),
  P2: () => avatares(true),
  A: () => `<div class="dz-gente"><span class="et">AvatarPersona: el tamaño lo elige cada pantalla</span><div class="fila-g">${[[28, 14], [32, 12], [36, 14], [80, 24]].map(([t, f]) => `<span class="h-av" style="width:${t}px;height:${t}px;font-size:${f}px">MR</span>`).join("")}</div>
    <span class="et">A mano: Apartados (48 y 36), el ticket (32), Roles (28, en pila)</span><div class="fila-g"><span class="h-av2" style="width:48px;height:48px;font-size:18px">LQ</span><span class="h-av2" style="width:36px;height:36px;font-size:14px">LQ</span><span class="h-av" style="width:32px;height:32px;font-size:14px">JT</span><span style="display:inline-flex">${GENTE.slice(0, 4).map((g) => `<span class="h-av3" style="width:28px;height:28px">${g[0]}</span>`).join("")}</span></div></div>`,
};
