// Ronda 15 de /unificar: los íconos (grosor y tamaño), el globito con número y los botones que quedan.
// Las demos usan las clases reales del ERP (`card-cayla`, `btn-cayla`, `nota-cayla`, `titulo-seccion`, el Chip) y los íconos de lucide
// dibujados con el grosor y el tamaño de cada opción. Nada guarda.
import { svg } from "./svg.mjs";
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// ---------------- 1 y 2 · LOS ÍCONOS ----------------
// Una tarjeta del ERP con los cinco lugares donde vive un ícono: el título de un bloque, los botones, una fila de una lista, una nota y
// una insignia. `t` dice el tamaño de cada lugar y `g` el grosor de cada uno (o uno para todos).
const T_P1 = { titulo: 20, control: 16, texto: 14, chico: 12 };
const T_EM = { titulo: "1.15em", control: "1.15em", texto: "1.15em", chico: "1.15em" };
function tarjetaIconos({ t = T_P1, g = 2, abs = false, hoy = false }) {
  const G = (lugar) => (typeof g === "number" ? g : g[lugar]);
  const T = (lugar) => t[lugar];
  const ic = (n, lugar, extra = "") => svg(n, T(lugar), G(lugar), `r15-ic ${abs ? "r15-abs" : ""} ${extra}`);
  // Hoy: cada pantalla con lo suyo (tamaños y grosores tomados de Proformas, Caja, los conteos y Existencias).
  const h = (n, tam, gr) => svg(n, tam, gr, "r15-ic");
  return `<div class="card-cayla r15-tarjeta">
    <div class="r15-titulo">${hoy ? h("Wallet", 18, 1.75) : ic("Wallet", "titulo")}<span class="font-display">Por pagar esta semana</span></div>
    <div class="r15-botones">
      <button type="button" class="btn-cayla btn-primario">${hoy ? h("Plus", 16, 2.5) : ic("Plus", "control")}Nueva compra</button>
      <button type="button" class="btn-cayla btn-secundario">${hoy ? h("Download", 15, 1.75) : ic("Download", "control")}Descargar Excel</button>
      <button type="button" class="btn-cayla btn-secundario">${hoy ? h("Printer", 18, 2) : ic("Printer", "control")}Imprimir</button>
      <span class="caja-cayla caja-campo r15-campo">${hoy ? h("Search", 18, 1.5) : ic("Search", "control", "r15-tenue")}<span class="r15-ph">Busca un proveedor</span></span>
    </div>
    <div class="r15-filas">
      <div class="r15-fila">${hoy ? h("Package", 14, 1.5) : ic("Package", "texto", "r15-tenue")}<span>Textiles Andinos · 3 facturas</span><span class="r15-dato">${hoy ? h("Truck", 15, 1.75) : ic("Truck", "texto")}En camino</span>${hoy ? h("ChevronRight", 16, 1.5) : ic("ChevronRight", "texto", "r15-tenue")}</div>
      <div class="r15-fila">${hoy ? h("Package", 16, 2) : ic("Package", "texto", "r15-tenue")}<span>Botones Lima · 1 factura</span><span class="r15-dato">${hoy ? h("CalendarX", 15, 1.75) : ic("CalendarX", "texto")}Vence el viernes</span>${hoy ? h("ChevronRight", 14, 2) : ic("ChevronRight", "texto", "r15-tenue")}</div>
    </div>
    <p class="nota-cayla sin-i r15-nota">${hoy ? h("Info", 16, 1.6) : ic("Info", "texto")}<span>Lo que pagas hoy sale de la caja de la tienda.</span></p>
    <div class="r15-chips">
      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap rounded-full bg-verde/15 text-verde">${hoy ? h("Check", 13, 2.4) : ic("Check", "chico")}Pagado</span>
      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap rounded-full bg-ambar/15 text-ambar">${hoy ? h("Hourglass", 15, 1.75) : ic("Hourglass", "chico")}Por vencer</span>
    </div>
  </div>`;
}
export const iconoDemos = {
  hoy: () => tarjetaIconos({ hoy: true }),
  trazo2: () => tarjetaIconos({ g: 2 }),
  trazo175: () => tarjetaIconos({ g: 1.75 }),
  trazoFijo: () => tarjetaIconos({ g: 1.5, abs: true }),
  tamP1: (g) => tarjetaIconos({ g }),
  tamEm: (g) => tarjetaIconos({ t: T_EM, g }),
};
// La regla, en una lámina: cada tamaño con su lugar.
export const escala = (g = 2) => `<div class="r15-escala">${[
  [12, "Dentro de una insignia o una etiqueta chica", "Check"],
  [14, "Junto a un texto: una fila, una nota, un menú", "Truck"],
  [16, "En un botón o un campo", "Search"],
  [20, "Junto al título de un bloque", "Wallet"],
].map(([n, d, i]) => `<span class="r15-esc">${svg(i, n, g, "r15-ic")}<b>${n} px</b><span>${d}</span></span>`).join("")}</div>`;

// ---------------- 3 · EL GLOBITO CON NÚMERO ----------------
// Cuatro lugares: junto a un nombre (pestañas, títulos), «te pide algo» (el menú, una pestaña con pendientes), en la esquina de un ícono
// (la bolsa de Vender, un acceso de Caja) y dentro de un botón negro (Apartar). `op` = "P1" | "P2" | "hoy".
function globo(op, lugar, n, pide = false) {
  if (op === "hoy") return ""; // hoy se dibuja a mano abajo
  const cls = ["r15-g", `r15-g-${lugar}`];
  if (pide) cls.push(op === "P2" ? "r15-g-pide-lleno" : lugar === "esquina" ? "r15-g-pide-lleno" : "r15-g-pide");
  return `<span class="${cls.join(" ")}">${n}</span>`;
}
export function globitos(op) {
  const hoy = op === "hoy";
  const bolsa = svg("ShoppingBag", 20, 2, "r15-ic");
  const nombre = (txt, n, pide) => `<span class="r15-gn">${txt}${hoy ? (pide ? `<span class="r15-hoy-pestana-pide">${n}</span>` : `<span class="r15-hoy-pestana">${n}</span>`) : globo(op, "linea", n, pide)}</span>`;
  return `<div class="card-cayla r15-tarjeta r15-globos">
    <div class="r15-glugar"><span class="dz-et2">Junto a un nombre</span>
      <div class="r15-gfila">${nombre("Por recibir", 3)}${nombre("Recibidas", 12)}<span class="r15-gn font-display r15-gtit">Pendientes${hoy ? `<span class="r15-hoy-titulo">8</span>` : globo(op, "linea", 8)}</span></div></div>
    <div class="r15-glugar"><span class="dz-et2">Te pide algo</span>
      <div class="r15-gfila"><span class="r15-gmenu">${svg("ArrowLeftRight", 16, 2, "r15-ic")}Traslados${hoy ? `<span class="r15-hoy-menu">2</span>` : globo(op, "linea", 2, true)}</span>${nombre("Por revisar", 4, true)}<span class="r15-gn">Pendientes${hoy ? `<b class="r15-hoy-inv">5</b>` : globo(op, "linea", 5, true)}</span></div></div>
    <div class="r15-glugar"><span class="dz-et2">En la esquina de un ícono</span>
      <div class="r15-gfila">
        <span class="r15-gbolsa">${bolsa}${hoy ? `<span class="r15-hoy-esq-rojo">3</span>` : globo(op, "esquina", 3)}</span>
        <span class="r15-gacceso">${svg("Receipt", 20, 2, "r15-ic")}Gastos${hoy ? `<span class="r15-hoy-esq-ambar">2</span>` : globo(op, "esquina", 2, true)}</span>
        <span class="r15-gavisos"><button type="button" class="btn-cayla btn-secundario">${svg("Bell", 16, 2, "r15-ic")}Avisos</button>${hoy ? `<span class="r15-hoy-esq-rojo r15-anillo">4</span>` : globo(op, "esquina", 4, true)}</span>
      </div></div>
    <div class="r15-glugar"><span class="dz-et2">Dentro de un botón negro</span>
      <div class="r15-gfila"><button type="button" class="btn-cayla btn-primario">${svg("Bookmark", 16, 2, "r15-ic")}Apartar${hoy ? `<span class="r15-hoy-crema">3</span>` : `<span class="r15-g r15-g-linea r15-g-oscuro">3</span>`}</button></div></div>
  </div>`;
}

// ---------------- 4 · «VER MÁS / VER MENOS» ----------------
const FILAS = ["Blusa Emma · talla M · por colgar", "Pantalón Carla · talla 28 · por colgar", "Casaca Lía · talla S · dañada", "Falda Inés · talla M · por colgar", "Blazer Ada · talla L · se acaba"];
const filas = (desde, hasta) => FILAS.slice(desde, hasta).map((t) => `<div class="r15-fila">${svg("Shirt", 14, 2, "r15-ic r15-tenue")}<span>${t}</span>${svg("ChevronRight", 14, 2, "r15-ic r15-tenue")}</div>`).join("");
export function verMas(op) {
  const id = `vm-${op}-${Math.random().toString(36).slice(2, 7)}`;
  const flecha = svg("ChevronDown", 16, 2, "r15-ic r15-vm-flecha");
  const boton = {
    P1: `<button type="button" class="r15-vm-pie" aria-expanded="false" data-vm="${id}"><span data-t="Ver menos">Ver 3 más</span>${flecha}</button>`,
    P2: `<div class="r15-vm-suelto"><button type="button" class="btn-cayla btn-enlace r15-vm-enlace" aria-expanded="false" data-vm="${id}"><span data-t="Ver menos">Ver 3 más</span>${flecha}</button></div>`,
  }[op];
  if (op === "hoy")
    return `<div class="r15-vm-hoy">
      <div class="card-cayla r15-vm-tarjeta"><span class="dz-et2">Inicio de Almacén</span><div class="r15-filas">${filas(0, 2)}</div><button type="button" class="r15-vm-pie" aria-expanded="false">Ver 3 más${flecha}</button></div>
      <div class="card-cayla r15-vm-tarjeta"><span class="dz-et2">Existencias ▸ Para hoy</span><div class="r15-filas">${filas(0, 2)}</div><div class="r15-vm-borde"><button type="button" class="r15-vm-texto">Ver 3 pendientes más</button></div></div>
      <div class="card-cayla r15-vm-tarjeta"><span class="dz-et2">La ficha de un cliente</span><div class="r15-filas">${filas(0, 2)}</div><button type="button" class="btn-cayla btn-sutil" style="justify-self:start">Ver las 5</button></div>
      <div class="card-cayla r15-vm-tarjeta"><span class="dz-et2">Finanzas ▸ Resumen</span><div class="r15-filas">${filas(0, 2)}</div><button type="button" class="btn-cayla btn-enlace" style="justify-self:start">Ver 3 más</button></div>
    </div>`;
  return `<div class="card-cayla r15-vm-tarjeta"><span class="dz-et2">Para hoy</span><div class="r15-filas">${filas(0, 2)}<div class="r15-vm-mas" id="${id}"><div>${filas(2, 5)}</div></div></div>${boton}</div>`;
}

// ---------------- 5 · «DESHACER» Y «BUSCAR» ----------------
export function deshacerBuscar(op) {
  const deshacer = op === "hoy"
    ? `<span class="r15-cambio">antes: S/ 79.90 <button type="button" class="label-cayla inline-flex items-center gap-1 text-[10.5px] text-taupe hover:text-rojo">${svg("Undo2", 12, 2, "r15-ic")}Deshacer</button></span>
       <span class="r15-cambio">Se quita: <s>Talla XS</s> <button type="button" class="label-cayla shrink-0 text-[10.5px] text-tinta/60 underline underline-offset-4 hover:text-rojo">Deshacer</button></span>
       <span class="r15-cambio">Leíste 1 de más <button type="button" class="btn-cayla btn-enlace text-xs">Deshacer</button></span>`
    : `<span class="r15-cambio">antes: S/ 79.90 <button type="button" class="btn-cayla btn-enlace r15-deshacer">${svg("Undo2", 14, 2, "r15-ic")}Deshacer</button></span>
       <span class="r15-cambio">Se quita: <s>Talla XS</s> <button type="button" class="btn-cayla btn-enlace r15-deshacer">${svg("Undo2", 14, 2, "r15-ic")}Deshacer</button></span>
       <span class="r15-cambio">Leíste 1 de más <button type="button" class="btn-cayla btn-enlace r15-deshacer">${svg("Undo2", 14, 2, "r15-ic")}Deshacer</button></span>`;
  const buscar = op === "hoy"
    ? `<span class="caja-cayla caja-campo r15-campo"><span class="r15-ph">DNI o RUC</span></span><button type="button" class="btn-cayla btn-secundario">Buscar</button>`
    : `<span class="caja-cayla caja-campo r15-campo"><span class="r15-ph">DNI o RUC</span></span><button type="button" class="btn-cayla btn-secundario">${svg("Search", 16, 2, "r15-ic")}Buscar</button>`;
  return `<div class="card-cayla r15-tarjeta"><span class="dz-et2">Deshacer un cambio que todavía no se guarda</span><div class="r15-cambios">${deshacer}</div>
    <span class="dz-et2">Buscar al apretar (el padrón de SUNAT, unir clientes)</span><div class="r15-botones">${buscar}</div></div>`;
}

// De cerca: los mismos íconos a 14 y 16 px, aumentados tres veces, para ver el grosor que en pantalla se nota poco.
export const lupa = (g, abs = false, hoy = false) => {
  const fila = (tam) =>
    ["Search", "Truck", "Printer", "Wallet", "Check", "Info"].map((n, i) => svg(n, tam, hoy ? [1.5, 1.75, 2, 1.7, 2.4, 1.6][i] : g, `r15-ic ${abs ? "r15-abs" : ""}`)).join("");
  return `<div class="r15-lupa"><span class="dz-et2">De cerca (aumentado 3 veces)</span><div class="r15-lupa-fila"><span>16 px</span>${fila(16)}</div><div class="r15-lupa-fila"><span>14 px</span>${fila(14)}</div></div>`;
};
