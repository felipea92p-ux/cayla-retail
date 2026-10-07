// Análisis v4 (ADR-0357): la ficha de una prenda, en tarjetitas y gráficos (Felipe: nada de párrafos). Lógica pura, probada en
// `analisis-ficha.test.ts`: qué tarjetitas lleva según su grupo, las 8 semanas con su fecha, dónde hay en la red, el modelo
// entero en mi tienda (talla × color), el dinero y los botones del pie. La ficha (`components/analisis/FichaPrenda.tsx`) solo
// dibuja lo que esto decide, con las clases de la maqueta aprobada (`hechos()`, `fichaHTML()` y `grillaHTML()`).
//
// No agrega reglas de negocio: el grupo sale de `grupoDe` (el mismo de las pestañas) y cada botón de `analisis-acciones.ts`.

import type { AccesoAnalisis, LlegadaPrenda, OrigenLlegada, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import {
  DIAS_TRES_MESES,
  diasQueQuedan,
  type GrupoAnalisis,
  otraSedeQueLaTiene,
  plural,
  porLlegar,
  sedeQueMasVende,
  totalEnTienda,
} from "./analisis-reglas";
import { hrefComprar, hrefEnviar, hrefLiquidar, hrefReponerPiso } from "./analisis-acciones";
import { estiloMosaicoColor } from "./color-prenda-reglas";
import { diaAntes, fechaCorta } from "./motor-demanda-reglas";
import { compararTallas } from "./tallas";

/** El color de una tarjetita o de un chip, con el nombre de su token (la ficha lo traduce a `var(--color-…)`). */
export type TonoFicha = "rojo" | "ambar" | "verde" | "pizarra" | "taupe";

/** Los íconos que usan las tarjetitas (todos existen en `components/analisis/iconos.tsx`). */
export type IconoHecho = "agotado" | "reloj" | "check" | "tijera" | "caja" | "llega" | "flechas" | "urg" | "camion" | "etiqueta";

/** Una tarjetita: el dato grande y, debajo, de qué es («Quedan 9 días · tienes 2»). */
export type Hecho = { icono: IconoHecho; tono: TonoFicha; valor: string; etiqueta: string | null };

/** El estado del chip de arriba: los de Análisis (urgente, atención, va bien, todavía no). */
export type EstadoFicha = "urg" | "ate" | "bien" | "nd";

const CHIP_GRUPO: Record<GrupoAnalisis, { est: EstadoFicha; texto: string }> = {
  comprar: { est: "urg", texto: "Cómpralas" },
  enviar: { est: "ate", texto: "Mándalas a donde sí se venden" },
  liquidar: { est: "ate", texto: "Liquidar" },
  vigila: { est: "nd", texto: "Vigílalas" },
};

/**
 * El chip de la prenda: el título de su grupo, con el estado del grupo; sin grupo, «Va bien», salvo lo guardado que nunca salió al
 * piso (`sinSalir`, 20261007120000): eso no «va bien», nadie lo vio.
 */
export function chipDeGrupo(grupo: GrupoAnalisis | null, sinSalir = false): { est: EstadoFicha; texto: string } {
  if (grupo) return CHIP_GRUPO[grupo];
  return sinSalir ? { est: "ate", texto: "Nunca salió al piso" } : { est: "bien", texto: "Va bien" };
}

/** Soles como se leen en una ficha: «S/ 60» si es entero, «S/ 59.90» si no; «—» si no se sabe. */
export function solesFicha(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const centimos = Math.round(Math.abs(n) * 100);
  const decimales = centimos % 100 === 0 ? 0 : 2;
  const texto = (centimos / 100).toLocaleString("es-PE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${n < 0 && centimos > 0 ? "−" : ""}S/ ${texto}`;
}

/** La línea bajo el nombre: «Celeste · talla S · S/ 60» (sin precio, sin esa parte). */
export function subtituloFicha(p: Pick<PrendaAnalisis, "color" | "talla" | "precio">): string {
  return [p.color, p.talla ? `talla ${p.talla}` : null, p.precio === null ? null : solesFicha(p.precio)].filter(Boolean).join(" · ");
}

/** «Costó cada una» y «Ganas por cada una» (precio − costo); «—» si falta uno de los dos. */
export function dineroDe(p: Pick<PrendaAnalisis, "precio" | "costo">): { costo: string; ganas: string } {
  return { costo: solesFicha(p.costo), ganas: p.precio === null || p.costo === null ? "—" : solesFicha(p.precio - p.costo) };
}

/** De dónde viene lo que llega, en minúscula para ir detrás de la cifra («compra 10 · almacén 2»). */
export const TEXTO_LLEGADA: Record<OrigenLlegada, string> = { compra: "compra", almacen: "almacén", taller: "taller", tienda: "otra tienda" };

/** «compra 10 · almacén 2 · taller 1»: lo que viene en camino, sumado por origen, en el orden en que aparece. */
export function detalleLlegada(llega: readonly LlegadaPrenda[]): string {
  const porOrigen = new Map<OrigenLlegada, number>();
  for (const x of llega) if (x.cantidad > 0) porOrigen.set(x.de, (porOrigen.get(x.de) ?? 0) + x.cantidad);
  return [...porOrigen].map(([de, n]) => `${TEXTO_LLEGADA[de]} ${n}`).join(" · ");
}

/** «en 30 días» o, si la tienda tiene menos días de ventas en el ERP, «en 8 días»: de qué días habla «Vendiste». */
const enDias = (p: Pick<PrendaAnalisis, "diasDeVentas">): string => {
  const n = p.diasDeVentas ?? 30;
  return `en ${n} ${plural(n, "día", "días")}`;
};

/** El código de una tienda para las tarjetitas («AQP tiene 3»); si no está en la red, «Otra tienda». */
const codigoDe = (sedes: readonly SedeAnalisis[], id: string): string => sedes.find((s) => s.id === id)?.codigo ?? "Otra tienda";

/**
 * Las tarjetitas de la ficha, como `hechos()` de la maqueta. Lo que se acaba dice cuánto le queda, cuánto vendió, de dónde se
 * repone, lo que ya viene y qué otra tienda la tiene; lo quieto dice cuánto lleva en el piso sin venderse, cuánto hay y qué toca
 * (mandarla o liquidarla); lo que nunca salió al piso (`sinSalir`: sus días en el almacén, o null si no se sabe cuándo llegó), cuánto
 * lleva guardado y cuánto hay; lo que va bien, cuánto vendió y cuánto hay.
 */
export function hechosDe(
  p: PrendaAnalisis,
  grupo: GrupoAnalisis | null,
  sedes: readonly SedeAnalisis[],
  sinSalir: { dias: number | null } | null = null,
): Hecho[] {
  const hechos: Hecho[] = [];
  const agregar = (icono: IconoHecho, tono: TonoFicha, valor: string, etiqueta: string | null = null) => hechos.push({ icono, tono, valor, etiqueta });
  const tienes = totalEnTienda(p);

  if (grupo === "comprar") {
    const d = diasQueQuedan(p) ?? 0;
    if (d === 0) agregar("agotado", "rojo", "Ya no hay", "en tu tienda");
    else agregar("reloj", d <= 7 ? "ambar" : "pizarra", d === 1 ? "Queda 1 día" : `Quedan ${d} días`, `tienes ${tienes}`);
    agregar("check", "verde", `Vendiste ${p.vendidas30}`, enDias(p));
    if (p.origen) agregar(p.origen === "taller" ? "tijera" : "caja", "taupe", p.origen === "taller" ? "Proveedor taller" : "Proveedor terceros");
    const llegan = porLlegar(p);
    if (llegan > 0) agregar("llega", "verde", `Por llegar ${llegan}`, detalleLlegada(p.llega));
    const alla = otraSedeQueLaTiene(p.otras);
    if (alla) agregar("flechas", "pizarra", `${codigoDe(sedes, alla.sedeId)} tiene ${alla.stock}`, "se podría pedir");
    return hechos;
  }

  if (grupo === "enviar" || grupo === "liquidar" || grupo === "vigila") {
    const dias = p.diasSinVender ?? 0;
    const grave = dias >= DIAS_TRES_MESES;
    agregar(grave ? "urg" : "reloj", grave ? "rojo" : "ambar", `${dias} ${plural(dias, "día", "días")}`, "en el piso sin venderse");
    agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
    const vende = grupo === "enviar" ? sedeQueMasVende(p.otras) : null;
    if (vende) agregar("camion", "ambar", `${codigoDe(sedes, vende.sedeId)} vendió ${vende.vendidas30}`, "este mes");
    if (grupo === "liquidar") agregar("etiqueta", grave ? "rojo" : "ambar", "Liquidar", "tú eliges cuánto");
    return hechos;
  }

  if (sinSalir) {
    const d = sinSalir.dias;
    agregar("reloj", "ambar", d === null ? "Nunca salió al piso" : `${d} ${plural(d, "día", "días")}`, d === null ? null : "en el almacén, sin salir al piso");
    agregar("caja", "taupe", `Tienes ${tienes}`, "0 en el piso");
    return hechos;
  }

  agregar("check", "verde", `Vendiste ${p.vendidas30}`, enDias(p));
  agregar("caja", "taupe", `Tienes ${tienes}`, `${p.piso} en el piso`);
  return hechos;
}

// ───────── Ventas por semana ─────────

/** Cuántas semanas dibuja la ficha (las que trae `PrendaAnalisis.semanas`). */
export const SEMANAS_FICHA = 8;
/** El alto, en px, de la barra de la semana que más vendió (la maqueta). */
const ALTO_BARRA = 62;

/**
 * El primer día de cada semana que dibuja la ficha (YYYY-MM-DD), de la más vieja a la de hoy. Es la misma semana que cuenta la
 * lectura (`fn_analisis_sede`, 20261006214000): la semana k (0 a 7) son los 7 días que terminan hoy − 7·(7−k), así que la última
 * va de hace 6 días a hoy (y hoy puede estar a medias). Si la lectura cambia de semana, esto cambia con ella.
 */
export function iniciosDeSemana(hoy: string, n: number = SEMANAS_FICHA): string[] {
  return Array.from({ length: n }, (_, k) => diaAntes(hoy, 7 * (n - 1 - k) + 6));
}

/** Una barra de «Ventas por semana»: su fecha de inicio («29 set.»), lo vendido, su alto y su tooltip. */
export type BarraSemana = { inicio: string; etiqueta: string; vendidas: number; alto: number; ultima: boolean; tip: string };

/**
 * Las 8 barras, cada una con el primer día de su semana: la última (la que termina hoy) va en tinta. Si la lectura trae más
 * semanas se toman las últimas 8; si trae menos, las que faltan al principio valen 0 (no se inventa venta).
 */
export function barrasSemanas(semanas: readonly number[], hoy: string): BarraSemana[] {
  const ultimas = semanas.slice(-SEMANAS_FICHA).map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const valores = [...Array<number>(SEMANAS_FICHA - ultimas.length).fill(0), ...ultimas];
  const max = Math.max(1, ...valores);
  return iniciosDeSemana(hoy).map((inicio, j) => {
    const vendidas = valores[j];
    const etiqueta = fechaCorta(inicio);
    return {
      inicio,
      etiqueta,
      vendidas,
      alto: Math.round((vendidas / max) * ALTO_BARRA),
      ultima: j === SEMANAS_FICHA - 1,
      tip: `Semana del ${etiqueta}: ${vendidas} ${plural(vendidas, "vendida", "vendidas")}`,
    };
  });
}

// ───────── Dónde hay ─────────

/** Cuántos puntos de «Vendió en 30 días» se dibujan como máximo (la cifra dice el resto). */
export const PUNTOS_MAX = 10;

/** Una tienda en «Dónde hay»: lo que tiene (barra) y lo que vendió en 30 días (puntos). */
export type FilaDonde = {
  sedeId: string;
  ciudad: string;
  /** Mi tienda: va primero y dice «tú». */
  tuya: boolean;
  tiene: number;
  vendio: number;
  /** El largo de la barra (`--n`, de 0 a 0,8): la tienda que más tiene llega a 0,8. */
  ancho: number;
  puntos: number;
  /** Solo en la mía: «2 en el piso · 1 en el almacén». */
  detalle: string | null;
};

/** Las tiendas de la red, la mía primero; una tienda sin la prenda dice 0. */
export function dondeHay(p: PrendaAnalisis, sedes: readonly SedeAnalisis[], miSedeId: string): FilaDonde[] {
  const mia = sedes.find((s) => s.id === miSedeId);
  const filas = [
    { sedeId: miSedeId, ciudad: mia?.ciudad ?? "Tu tienda", tuya: true, tiene: totalEnTienda(p), vendio: p.vendidas30, detalle: `${p.piso} en el piso · ${p.almacen} en el almacén` },
    ...sedes
      .filter((s) => s.id !== miSedeId)
      .map((s) => {
        const alla = p.otras.find((o) => o.sedeId === s.id);
        return { sedeId: s.id, ciudad: s.ciudad, tuya: false, tiene: alla?.stock ?? 0, vendio: alla?.vendidas30 ?? 0, detalle: null };
      }),
  ];
  const max = Math.max(1, ...filas.map((f) => f.tiene));
  return filas.map((f) => ({ ...f, ancho: (f.tiene / max) * 0.8, puntos: Math.min(f.vendio, PUNTOS_MAX) }));
}

// ───────── Todo el modelo en tu tienda ─────────

/** Cómo se pinta una celda (las clases de la maqueta): `falta` no queda y se vendía; `poco` queda 1 y se vende rápido; `cero` no hay ni se vendía. */
export type ClaseCelda = "falta" | "poco" | "cero" | "";

export function claseCelda(tiene: number, vendio: number): ClaseCelda {
  if (tiene === 0) return vendio > 0 ? "falta" : "cero";
  return tiene === 1 && vendio >= 3 ? "poco" : "";
}

export type CeldaModelo = { talla: string; tiene: number; vendio: number; clase: ClaseCelda; tip: string };
/** Una fila de la grilla: un color, con su punto (`colores.hex` válido, o null si no tiene uno) y una celda por talla. */
export type FilaModelo = { color: string; punto: string | null; celdas: CeldaModelo[] };
export type GrillaModelo = { tallas: string[]; filas: FilaModelo[] };

/** «Celeste · S: queda 1 · se vendieron 5». */
function tipCelda(color: string, talla: string, tiene: number, vendio: number): string {
  const queda = tiene === 0 ? "no queda" : tiene === 1 ? "queda 1" : `quedan ${tiene}`;
  return `${color} · ${talla}: ${queda} · se ${plural(vendio, "vendió", "vendieron")} ${vendio}`;
}

/**
 * El modelo entero en mi tienda (mismo `productoId`), talla × color: lo que tengo de cada una y si se vendía. null si el modelo
 * tiene una sola talla y un solo color (no hay nada más que ver). El color de la prenda va primero; las tallas, en el orden de
 * tienda (`compararTallas`). Una combinación que no está en los datos no tiene nada ni se vendió: «no hay».
 */
export function grillaDelModelo(p: PrendaAnalisis, prendas: readonly PrendaAnalisis[]): GrillaModelo | null {
  const delModelo = prendas.filter((x) => x.productoId === p.productoId);
  if (!delModelo.some((x) => x.varianteId === p.varianteId)) delModelo.push(p);
  const tallas = [...new Set(delModelo.map((x) => x.talla))].sort(compararTallas);
  const colores = [...new Set(delModelo.map((x) => x.color))].sort((a, b) => (a === p.color ? -1 : b === p.color ? 1 : a.localeCompare(b, "es")));
  if (tallas.length < 2 && colores.length < 2) return null;
  const filas = colores.map((color) => {
    const deColor = delModelo.filter((x) => x.color === color);
    const punto = deColor.map((x) => estiloMosaicoColor(x.colorHex)?.fondo).find((f): f is string => Boolean(f)) ?? null;
    const celdas = tallas.map((talla): CeldaModelo => {
      const estas = deColor.filter((x) => x.talla === talla);
      if (estas.length === 0) return { talla, tiene: 0, vendio: 0, clase: "cero", tip: `${color} · ${talla}: no hay` };
      const tiene = estas.reduce((s, x) => s + totalEnTienda(x), 0);
      const vendio = estas.reduce((s, x) => s + x.vendidas30, 0);
      return { talla, tiene, vendio, clase: claseCelda(tiene, vendio), tip: tipCelda(color, talla, tiene, vendio) };
    });
    return { color, punto, celdas };
  });
  return { tallas, filas };
}

// ───────── Los botones del pie ─────────

/** Un botón que lleva a otra pantalla. */
export type AccionFicha = { texto: string; href: string };

/**
 * El botón principal según el grupo, como la fila de su carril: «Comprar», «Enviar a Arequipa» (la tienda que más la vende),
 * «Liquidar» o, lo que nunca salió al piso, «Bajar al piso». null si va bien o solo se vigila, o si la cuenta no ve el destino (un
 * botón que lleva a «Sin acceso» no se dibuja).
 */
export function accionPrincipal(
  p: PrendaAnalisis,
  grupo: GrupoAnalisis | null,
  sedes: readonly SedeAnalisis[],
  acceso: AccesoAnalisis,
  sinSalir = false,
): AccionFicha | null {
  if (sinSalir && !grupo) {
    const href = hrefReponerPiso([p], acceso);
    return href ? { texto: "Bajar al piso", href } : null;
  }
  if (grupo === "comprar") {
    const href = hrefComprar(p, acceso);
    return href ? { texto: "Comprar", href } : null;
  }
  if (grupo === "enviar") {
    const vende = sedeQueMasVende(p.otras);
    const destino = vende ? sedes.find((s) => s.id === vende.sedeId) : undefined;
    const href = destino ? hrefEnviar([p], destino, acceso) : null;
    return destino && href ? { texto: `Enviar a ${destino.ciudad}`, href } : null;
  }
  if (grupo === "liquidar") {
    const href = hrefLiquidar([p], acceso);
    return href ? { texto: "Liquidar", href } : null;
  }
  return null;
}

/**
 * «Pedir a Arequipa»: solo si se acaba, otra tienda la tiene y la cuenta puede pedir. Es la tienda que más tiene; la persona
 * decide si pedirla o comprarla (decisión 7). null si no corresponde.
 */
export function sedeParaPedir(p: PrendaAnalisis, grupo: GrupoAnalisis | null, sedes: readonly SedeAnalisis[], acceso: Pick<AccesoAnalisis, "pedir">): SedeAnalisis | null {
  if (grupo !== "comprar" || !acceso.pedir) return null;
  const alla = otraSedeQueLaTiene(p.otras);
  return alla ? (sedes.find((s) => s.id === alla.sedeId) ?? null) : null;
}
