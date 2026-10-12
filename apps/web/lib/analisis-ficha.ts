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
import { queTiene } from "./analisis-modelo";
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
export function subtituloFicha(p: Pick<PrendaAnalisis, "color" | "talla" | "precio"> & { variantes?: readonly Pick<PrendaAnalisis, "precio">[]; colores?: string[]; tallas?: string[] }): string {
  // De un modelo (ADR-0357, decisión 12): sus colores y tallas, y su precio; si sus tallas tienen precios distintos, «desde» el menor.
  if (p.variantes && p.colores && p.tallas) {
    const precios = p.variantes.map((v) => v.precio).filter((x): x is number => x !== null);
    const menor = precios.length > 0 ? Math.min(...precios) : null;
    const precio = menor === null ? null : precios.every((x) => x === menor) ? solesFicha(menor) : `desde ${solesFicha(menor)}`;
    return [queTiene({ colores: p.colores, tallas: p.tallas }), precio].filter(Boolean).join(" · ");
  }
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

// ───────── El modelo en tu tienda: una frase, una tabla y las otras tiendas (Felipe 2026-10-10, opción B) ─────────
//
// Antes eran tres secciones con los mismos números («Dónde hay», «Lo que más sale» y la grilla talla × color, con «0» rayados en rojo
// que había que adivinar) y dos ventanas de días distintas para la misma cifra. Felipe eligió mirando la lámina (artifact privado
// 4mRrK4dotpJUnDg5tis9u2) la B: una frase que responde, UNA tabla donde cada celda dice con palabras qué pasó, con totales, y los
// colores que más se venden arriba.

const unidades = (n: number, una: string, varias: string): string => `${n} ${plural(n, una, varias)}`;

/** La frase de arriba: «Vendiste 10 en 11 días y te queda 1.» (o «no te queda ninguna», o «no vendiste ninguna»). */
export function fraseDelModelo(m: { variantes: readonly PrendaAnalisis[] }, diasDeVentas: number): string {
  const vendio = m.variantes.reduce((s, v) => s + v.vendidas30, 0);
  const tiene = m.variantes.reduce((s, v) => s + totalEnTienda(v), 0);
  const enDias = unidades(diasDeVentas, "día", "días");
  const queda = tiene === 0 ? "no te queda ninguna" : tiene === 1 ? "te queda 1" : `te quedan ${tiene}`;
  if (vendio === 0) return `No vendiste ninguna en ${enDias}; ${queda}.`;
  return `Vendiste ${vendio} en ${enDias} y ${queda}.`;
}

/** Qué pasó con una talla de un color: se vendía y no queda (`pedir`), te queda (`queda`) o no hay (`nada`). */
export type EstadoCelda = "pedir" | "queda" | "nada";

export type CeldaTabla = {
  talla: string;
  estado: EstadoCelda;
  /** La línea fuerte («2 vendidas», «queda 1») y la de abajo («no queda», «sin ventas», «vendiste 2»); `nada` solo dice «no hay». */
  fuerte: string;
  suave: string | null;
  /** Para el lector y el tooltip: «Blanco · M: 2 vendidas, no queda». */
  tip: string;
};

export type FilaTabla = { color: string; punto: string | null; vendio: number; celdas: CeldaTabla[] };

export type TablaModelo = {
  /** Las tallas en el orden de tienda (`compararTallas`). */
  tallas: string[];
  /** Un color por fila, del que más vendiste al que menos; a igual venta, el que más tienes; después, por nombre. */
  filas: FilaTabla[];
  /** Lo vendido por talla (la fila de abajo) y en total. */
  vendioPorTalla: number[];
  vendio: number;
};

function celda(color: string, talla: string, vs: readonly PrendaAnalisis[]): CeldaTabla {
  const nombre = [color, talla].filter(Boolean).join(" · ");
  if (vs.length === 0) return { talla, estado: "nada", fuerte: "no hay", suave: null, tip: `${nombre}: no hay` };
  const vendio = vs.reduce((s, v) => s + v.vendidas30, 0);
  const tiene = vs.reduce((s, v) => s + totalEnTienda(v), 0);
  if (tiene > 0) {
    const fuerte = tiene === 1 ? "queda 1" : `quedan ${tiene}`;
    const suave = vendio > 0 ? `vendiste ${vendio}` : "sin ventas";
    return { talla, estado: "queda", fuerte, suave, tip: `${nombre}: ${fuerte}, ${suave}` };
  }
  if (vendio > 0) {
    const fuerte = unidades(vendio, "vendida", "vendidas");
    return { talla, estado: "pedir", fuerte, suave: "no queda", tip: `${nombre}: ${fuerte}, no queda` };
  }
  return { talla, estado: "nada", fuerte: "no hay", suave: null, tip: `${nombre}: no hay` };
}

/** La tabla del modelo; null si tiene una sola talla de un solo color (la frase ya lo dice todo). */
export function tablaDelModelo(m: { variantes: readonly PrendaAnalisis[] }): TablaModelo | null {
  const tallas = [...new Set(m.variantes.map((v) => v.talla))].sort(compararTallas);
  const colores = [...new Set(m.variantes.map((v) => v.color))];
  if (tallas.length < 2 && colores.length < 2) return null;
  const filas = colores
    .map((color, orden) => {
      const delColor = m.variantes.filter((v) => v.color === color);
      return {
        orden,
        tiene: delColor.reduce((s, v) => s + totalEnTienda(v), 0),
        fila: {
          color,
          punto: delColor.map((v) => estiloMosaicoColor(v.colorHex)?.fondo).find((f): f is string => Boolean(f)) ?? null,
          vendio: delColor.reduce((s, v) => s + v.vendidas30, 0),
          celdas: tallas.map((t) => celda(color, t, delColor.filter((v) => v.talla === t))),
        },
      };
    })
    .sort((a, b) => b.fila.vendio - a.fila.vendio || b.tiene - a.tiene || a.fila.color.localeCompare(b.fila.color, "es") || a.orden - b.orden)
    .map((x) => x.fila);
  const vendioPorTalla = tallas.map((t) => m.variantes.filter((v) => v.talla === t).reduce((s, v) => s + v.vendidas30, 0));
  return { tallas, filas, vendioPorTalla, vendio: vendioPorTalla.reduce((s, n) => s + n, 0) };
}

/**
 * Las otras tiendas, en una línea bajo la tabla: «Arequipa y Lima no tienen este modelo.» o «Arequipa tiene 3 (vendió 2 en sus
 * últimos 30 días). Lima no tiene.» Las otras tiendas cuentan sus propios 30 días: se dice, para no mezclarlo con los días de la tuya.
 */
export function lineaOtrasTiendas(p: Pick<PrendaAnalisis, "otras">, sedes: readonly SedeAnalisis[], miSedeId: string): string | null {
  const otras = sedes.filter((s) => s.id !== miSedeId).map((s) => ({ ciudad: s.ciudad, o: p.otras.find((x) => x.sedeId === s.id) }));
  if (otras.length === 0) return null;
  const con = otras.filter((x) => (x.o?.stock ?? 0) > 0);
  const sin = otras.filter((x) => (x.o?.stock ?? 0) <= 0).map((x) => x.ciudad);
  const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  if (con.length === 0) return `${lista(sin)} no ${sin.length === 1 ? "tiene" : "tienen"} este modelo.`;
  const tienen = con.map((x) => {
    const v = x.o?.vendidas30 ?? 0;
    return `${x.ciudad} tiene ${x.o?.stock ?? 0}${v > 0 ? ` (vendió ${v} en sus últimos 30 días)` : ""}`;
  });
  return [`${tienen.join(". ")}.`, sin.length > 0 ? `${lista(sin)} no ${sin.length === 1 ? "tiene" : "tienen"}.` : null].filter(Boolean).join(" ");
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
