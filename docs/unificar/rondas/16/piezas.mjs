// Ronda 16 de /unificar (cierre): el trazo del marco, las píldoras de color a mano y «Cómo cerró cada día».
// Las demos copian el HTML de las piezas reales (`Chip`, `BarrasTiempo`) con el CSS del ERP de hoy. Nada guarda.
import { svg } from "./svg.mjs";
export const una = (titulo, html, nota) =>
  `<div class="dz"><div class="dz-barra"><span class="dz-et">${titulo}</span></div><div class="dz-repite">${html}</div>${nota ? `<p class="dz-nota">${nota}</p>` : ""}</div>`;

// ---------------- 1 · EL MARCO ----------------
const MARCO = ["Store", "Compass", "ShoppingBag", "Boxes", "BookOpen"];
export const lupaMarco = (g) => `<div class="r16-lupa">
  <span class="dz-et2">De cerca (aumentado 3 veces)</span>
  <div class="r16-lupa-fila"><span>Lateral, 20 px, trazo ${String(g).replace(".", ",")}</span>${MARCO.map((n) => svg(n, 20, g, "r15-ic")).join("")}</div>
  <div class="r16-lupa-fila"><span>Un botón, 16 px, trazo 2</span>${["Search", "Download", "Printer", "Plus", "Truck"].map((n) => svg(n, 16, 2, "r15-ic")).join("")}</div>
</div>`;

// ---------------- 2 · LAS PÍLDORAS ----------------
const PUNTO = "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']";
const TONO = { neutro: "bg-sand text-taupe", ambar: "bg-ambar/15 text-ambar", verde: "bg-verde/15 text-verde", rojo: "bg-rojo/10 text-rojo-profundo", pizarra: "bg-pizarra/15 text-pizarra" };
const chip = (tono, texto, { punto = true, icono = null, clase = "" } = {}) =>
  `<span class="${punto ? `inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs leading-5 ${PUNTO}` : "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium leading-5"} whitespace-nowrap rounded-full ${TONO[tono]} ${clase}">${icono ? svg(icono, 12, 2, "r15-ic") : ""}${texto}</span>`;
const fila = (donde, html) => `<div class="r16-pfila"><span class="r16-pdonde">${donde}</span><span class="r16-pvan">${html}</span></div>`;
export function pildoras(op) {
  const hoy = op === "hoy";
  return `<div class="card-cayla r16-pild">
    ${fila("Existencias, una tarjeta", hoy
      ? `<span class="shrink-0 rounded-full bg-rojo/[0.11] px-1.5 text-[11px] font-semibold text-rojo-profundo">1 dañada</span> <span class="shrink-0 rounded-full bg-pizarra/[0.12] px-1.5 text-[11px] font-semibold text-pizarra">2 apartadas</span>`
      : `${chip("rojo", "1 dañada")} ${chip("pizarra", "2 apartadas")}`)}
    ${fila("Existencias, el aviso", hoy
      ? `<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ambar/15 px-2.5 py-1 text-xs leading-none text-ambar-profundo">${svg("AlertTriangle", 15, 1.75, "r15-ic")}Por colgar</span>`
      : chip("ambar", "Por colgar", { punto: false, icono: "AlertTriangle" }))}
    ${fila("Roles y accesos", hoy
      ? `<span class="shrink-0 rounded-full bg-ambar/15 px-2 py-px text-[10.5px] font-semibold text-ambar-profundo">Sin módulos</span> <span class="shrink-0 rounded-full bg-tinta/[0.06] px-2 py-px text-[10.5px] font-semibold text-tinta/60">Sin uso</span>`
      : `${chip("ambar", "Sin módulos")} ${chip("neutro", "Sin uso")}`)}
    ${fila("Atributos", hoy
      ? `<span class="label-cayla shrink-0 rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Pendiente</span>`
      : chip("rojo", "Pendiente"))}
    ${fila("El responsable (Admin)", hoy
      ? `<span class="inline-flex h-6 items-center gap-1.5 rounded-full bg-pizarra/[0.1] px-2.5 text-[11px] font-medium text-pizarra">${svg("ShieldCheck", 14, 2, "r15-ic")}Admin · queda a tu nombre</span>`
      : chip("pizarra", "Admin · queda a tu nombre", { punto: false, icono: "ShieldCheck" }))}
    ${fila("Apartados, la plantilla", hoy
      ? `<b class="text-sm">Completo</b> <span class="ml-2 rounded-full bg-pizarra/10 px-2 py-0.5 text-[10.5px] text-pizarra">de fábrica</span>`
      : `<b class="text-sm">Completo</b> ${chip("pizarra", "de fábrica", { punto: false })}`)}
    ${fila("Un colaborador, al cambiar su rol", hoy
      ? `<span class="rounded-full bg-verde/15 px-2 py-px text-[11.5px] font-semibold text-verde-profundo">+ Caja</span> <span class="rounded-full bg-verde/15 px-2 py-px text-[11.5px] font-semibold text-verde-profundo">+2</span> <span class="rounded-full bg-rojo/10 px-2 py-px text-[11.5px] font-semibold text-rojo-profundo line-through">Compras</span>`
      : `${chip("verde", "+ Caja", { punto: false })} ${chip("verde", "+2", { punto: false })} ${chip("rojo", "Compras", { punto: false, clase: "line-through" })}`)}
  </div>`;
}

// ---------------- 3 · «CÓMO CERRÓ CADA DÍA» CON LAS BARRAS DE LA RONDA 14 ----------------
// Un día de un mes de ejemplo: lo que se contó, lo que debía haber y cómo terminó. `null` = la caja quedó abierta.
const DIAS = [null, null, 520, 610, 480, null, 380, 640, 700, 590, 455, 820, 760, 690, 0];
const DEBIA = [null, null, 520, 610, 470, null, 450, 640, 700, 590, 455, 820, 740, 690, 0];
export function cierresBarras() {
  const n = DIAS.length, alto = 140, tope = 900, util = alto - 22;
  const px = (v) => (v ? Math.max(3, Math.round((v * util) / tope)) : 0);
  const col = `grid-template-columns:repeat(${n}, minmax(0, 1fr));column-gap:4px`;
  const barras = DIAS.map((v, i) => {
    const d = DEBIA[i];
    const hoy = i === n - 1;
    if (v === null) return `<span class="barra-t"><span class="barra-t-globo" style="bottom:8px">Día ${i + 1} · la caja quedó abierta</span></span>`;
    if (hoy) return `<span class="barra-t"><span class="barra-t-relleno" data-rayada style="height:3px;bottom:0;--i:${i}"></span><span class="barra-t-globo" style="bottom:12px">Hoy · todavía no se cierra</span></span>`;
    const dif = v - d;
    const tono = dif === 0 ? "verde" : dif < 0 ? "rojo" : "ambar";
    const que = dif === 0 ? "cuadró" : dif < 0 ? `faltó S/ ${-dif}` : `sobró S/ ${dif}`;
    return `<span class="barra-t" data-tono="${tono}"><span class="barra-t-relleno" style="height:${px(v)}px;bottom:0;--i:${i}"></span>${dif !== 0 ? `<span class="barra-t-meta" style="bottom:${px(d) - 1}px"></span>` : ""}<span class="barra-t-globo" style="bottom:${px(v) + 8}px">Día ${i + 1} · se contó S/ ${v} · ${que}</span></span>`;
  }).join("");
  const eje = DIAS.map((_, i) => `<span class="${i === n - 1 ? "barras-tiempo-eje-fuerte" : ""}">${i === 0 || (i + 1) % 5 === 0 || i === n - 1 ? (i === n - 1 ? "Hoy" : i + 1) : ""}</span>`).join("");
  return `<div class="card-cayla r16-cierres"><div class="r16-ctit">Cómo cerró cada día <span class="r16-ley"><i data-t="verde"></i>Cuadró <i data-t="rojo"></i>Faltó <i data-t="ambar"></i>Sobró <i data-t="meta"></i>Lo que debía haber</span></div>
    <div role="img" class="barras-tiempo"><div class="barras-tiempo-zona" style="height:${alto}px"><div class="barras-tiempo-columnas" style="${col}">${barras}</div></div><div aria-hidden class="barras-tiempo-eje" style="${col}">${eje}</div></div></div>`;
}
