// Análisis (ADR-0357, act. 2026-11-24, punto 8): la ficha de un modelo que está en «Qué pedir» (lo que ya se agotó o se acaba antes de
// Navidad). Felipe la eligió mirando la maqueta `docs/maquetas/analisis-pedir-sin-comprar-2026-11/ficha.html` con datos de TRU.
//
// EL PROBLEMA. La ficha decía otra cosa que su tarjeta: «Vendiste 13 en 30 días» donde la tarjeta decía «23 en 37 días» (la tarjeta mira
// 8 semanas; la ficha cortaba en 30 días justo lo que más se vendió), «Ya no hay.» sin decir desde cuándo, «EN LIM» donde la tarjeta dice
// «Lima tiene 2», una tabla que repetía tres veces «sin stock» y el botón «Comprar», que ya se fue de las tarjetas.
// LA REGLA. Si el modelo está en «Qué pedir», su ficha cuenta lo mismo que su tarjeta y agrega el detalle que la tarjeta no tiene:
//   · lo agotado: «Se agotó el 20 nov.»; VENDISTE 23 en 37 días, TIENES 0, LIMA TIENE 2 (con qué colores); y, por talla y color, una casilla
//     de dos pisos: arriba cuántas te quedan, abajo cuántas vendiste en esas 8 semanas (Felipe 2026-11-25, la «B2» de
//     `docs/maquetas/analisis-pedir-sin-comprar-2026-11/mejor-b.html`); lo que tiene la otra tienda va aparte, color por talla;
//   · lo que se acaba: «Se acaba el 6 dic.»; TIENES 68, VENDES 41 por semana, LIMA TIENE 17 (y cuántos de los que te faltan); y la misma
//     tabla de dos pisos (Felipe 2026-11-25, al no verla en una ficha de lo que se acaba: «igual que lo agotado»).
// En las dos, el 0 de arriba va en rojo solo donde se vendió y ya no hay (donde no se vendió ni queda, es un 0 tenue: no falta nada).
// Sin «Comprar» (solo llevaba a Mis compras, sin la prenda): el botón de la ficha es «Pedir a Lima». Lógica pura; la dibuja `FichaPrenda`.

import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import type { ModeloAnalisis } from "./analisis-modelo";
import { otraSedeQueLaTiene, porLlegar, totalEnTienda } from "./analisis-reglas";
import { agotadoDelModelo, alcanceDelModelo, diasANavidad, diasEnteros, fechaEnQueSeAcaba, SEMANAS_AGOTADOS, vendesPorSemana, vendiste } from "./analisis-pedir";
import { type CifraFicha, detalleLlegada, type EstadoFicha, solesFicha } from "./analisis-ficha";
import { estiloMosaicoColor } from "./color-prenda-reglas";
import { fechaCorta } from "./motor-demanda-reglas";
import { compararTallas } from "./tallas";

/**
 * Una casilla de dos pisos (Felipe 2026-11-25: «no indica cuánto me queda de cada color», y lo quiso por talla y color): arriba, cuántas te
 * quedan aquí; abajo, cuántas vendiste en las 8 semanas.
 */
export type CasillaDosPisos = { quedan: number; vendidas: number };
/** Un color: una casilla por talla y la de su total. */
export type FilaDosPisos = { color: string; punto: string | null; casillas: CasillaDosPisos[]; total: CasillaDosPisos };
/** Lo que tiene la otra tienda, color por talla (`talla` null si el modelo tiene una sola). Va en su bloque: no se mezcla con lo tuyo. */
export type PiezaOtraTienda = { color: string; punto: string | null; talla: string | null; cantidad: number };

export type TablaFichaPedir = {
  titulo: string;
  nota: string;
  /** Las tallas que se vendieron o que todavía tienen algo (con una sola talla, ninguna: la casilla del total lo dice todo). */
  tallas: string[];
  filas: FilaDosPisos[];
  /** Lo que tiene la otra tienda que más tiene; null si nadie más lo tiene. */
  otra: { ciudad: string; total: number; piezas: PiezaOtraTienda[] } | null;
};

export type FichaPedir = {
  tipo: "agotado" | "seAcaba";
  /** La bajada de la hoja: solo el precio (los colores y las tallas están en la tabla). */
  precio: string | null;
  veredicto: { est: EstadoFicha; texto: string };
  cifras: [CifraFicha, CifraFicha, CifraFicha];
  tabla: TablaFichaPedir;
  /** «Pedir a Lima»: la otra tienda que más tiene, si la cuenta puede pedir; null si no. */
  pedirA: SedeAnalisis | null;
};

type Contexto = { hoy: string; diasDeVentas: number; sedes: readonly SedeAnalisis[]; miSede: SedeAnalisis; acceso: Pick<AccesoAnalisis, "pedir"> };

const SIN_FILTROS = { talla: [] as string[], color: [] as string[] };
const tallasDe = (m: ModeloAnalisis): PrendaAnalisis[] => (m.variantes.length > 0 ? m.variantes : [m]);
const puntoDe = (vs: readonly PrendaAnalisis[]): string | null => vs.map((v) => estiloMosaicoColor(v.colorHex)?.fondo).find((f): f is string => Boolean(f)) ?? null;

/** «Arena y Chocolate», «Arena, Chocolate y Perla», «Arena, Chocolate y 3 más». */
function listaCorta(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length <= 3) return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
  return `${xs.slice(0, 2).join(", ")} y ${xs.length - 2} más`;
}

/** El precio del modelo: el de todas sus tallas, o «desde» el menor si varían; null si ninguna lo tiene. */
export function precioDeLaFicha(m: ModeloAnalisis): string | null {
  const precios = tallasDe(m)
    .map((v) => v.precio)
    .filter((x): x is number => x !== null);
  if (precios.length === 0) return null;
  const menor = Math.min(...precios);
  return precios.every((x) => x === menor) ? solesFicha(menor) : `desde ${solesFicha(menor)}`;
}

/** Los colores del modelo que tiene esa otra tienda, del que más se vendió aquí al que menos (vendidas en 8 semanas). */
function coloresQueTiene(m: ModeloAnalisis, sedeId: string): string[] {
  const porColor = new Map<string, { vendidas: number; alla: number }>();
  for (const v of tallasDe(m)) {
    const a = porColor.get(v.color) ?? { vendidas: 0, alla: 0 };
    porColor.set(v.color, { vendidas: a.vendidas + v.semanas.reduce((s, n) => s + Math.max(0, n), 0), alla: a.alla + (v.otras.find((o) => o.sedeId === sedeId)?.stock ?? 0) });
  }
  return [...porColor.entries()]
    .filter(([c, x]) => x.alla > 0 && c.trim() !== "")
    .sort(([ca, a], [cb, b]) => b.vendidas - a.vendidas || ca.localeCompare(cb, "es"))
    .map(([c]) => c);
}

/**
 * La tercera cifra: lo que viene en camino, si viene algo; si no, la otra tienda que más tiene («LIMA TIENE 2» y qué tiene: los colores en lo
 * agotado, cuántos de los que te faltan en lo que se acaba); si nadie más lo tiene, «OTRAS TIENDAS 0».
 */
function terceraCifra(m: ModeloAnalisis, tipo: FichaPedir["tipo"], ctx: Contexto): CifraFicha {
  const llegan = porLlegar(m);
  if (llegan > 0) return { etiqueta: "Llegan", valor: String(llegan), detalle: detalleLlegada(m.llega) };
  const alla = otraSedeQueLaTiene(m.otras);
  const sede = alla ? ctx.sedes.find((s) => s.id === alla.sedeId) : undefined;
  if (!alla || !sede) return { etiqueta: "Otras tiendas", valor: "0", detalle: "nadie más la tiene" };
  const etiqueta = `${sede.ciudad} tiene`;
  if (tipo === "agotado") return { etiqueta, valor: String(alla.stock), detalle: listaCorta(coloresQueTiene(m, sede.id)) };
  // Lo que se acaba: de las tallas y colores que ya no tienes aquí (y se vendían), cuántas tiene esa tienda.
  const faltan = tallasDe(m).filter((v) => totalEnTienda(v) === 0 && v.vendidas30 > 0);
  const tieneDeEsas = faltan.filter((v) => (v.otras.find((o) => o.sedeId === sede.id)?.stock ?? 0) > 0).length;
  const detalle =
    faltan.length === 0
      ? listaCorta(coloresQueTiene(m, sede.id))
      : tieneDeEsas === 0
        ? "ninguno de los que te faltan"
        : tieneDeEsas === faltan.length
          ? `y ${faltan.length === 1 ? "el que te falta" : `los ${faltan.length} que te faltan`}`
          : `${tieneDeEsas} de los ${faltan.length} que te faltan`;
  return { etiqueta, valor: String(alla.stock), detalle };
}

const vendidasEn8 = (v: PrendaAnalisis): number => v.semanas.reduce((s, n) => s + Math.max(0, n), 0);
const casillaDe = (vs: readonly PrendaAnalisis[]): CasillaDosPisos => ({
  quedan: vs.reduce((s, v) => s + totalEnTienda(v), 0),
  vendidas: vs.reduce((s, v) => s + vendidasEn8(v), 0),
});

/**
 * Por talla y color (la «B2» que eligió Felipe el 2026-11-25, para lo agotado y para lo que se acaba): una fila por cada color que se vendió en
 * las 8 semanas o que todavía tiene algo, del que más se vendió al que menos; una columna por cada talla que se vendió o que tiene algo (la que
 * no no suma una columna vacía); en cada casilla, arriba lo que te queda y abajo lo que vendiste. Lo de la otra tienda que más tiene va aparte,
 * color por talla: primero los colores que más vendiste y, entre los demás, lo que más tiene.
 */
function tablaDosPisos(m: ModeloAnalisis, ctx: Contexto): TablaFichaPedir {
  const vs = tallasDe(m);
  const unaSola = new Set(vs.map((v) => v.talla)).size <= 1;
  const vendidasDelColor = new Map<string, number>();
  for (const v of vs) vendidasDelColor.set(v.color, (vendidasDelColor.get(v.color) ?? 0) + vendidasEn8(v));
  const colores = [...vendidasDelColor.keys()].filter((c) => vs.some((v) => v.color === c && (vendidasEn8(v) > 0 || totalEnTienda(v) > 0)));
  const enLaTabla = vs.filter((v) => colores.includes(v.color));
  const tallas = unaSola ? [] : [...new Set(enLaTabla.filter((v) => vendidasEn8(v) > 0 || totalEnTienda(v) > 0).map((v) => v.talla))].sort(compararTallas);
  const filas = colores
    .map((color): FilaDosPisos => {
      const delColor = enLaTabla.filter((v) => v.color === color);
      return { color, punto: puntoDe(delColor), casillas: tallas.map((t) => casillaDe(delColor.filter((v) => v.talla === t))), total: casillaDe(delColor) };
    })
    .sort((a, b) => b.total.vendidas - a.total.vendidas || b.total.quedan - a.total.quedan || a.color.localeCompare(b.color, "es"));

  const alla = otraSedeQueLaTiene(m.otras);
  const sede = alla ? ctx.sedes.find((s) => s.id === alla.sedeId) : undefined;
  const vendidasDe = (color: string) => vendidasDelColor.get(color) ?? 0;
  const piezas = sede
    ? vs
        .map((v) => ({ v, cantidad: v.otras.find((o) => o.sedeId === sede.id)?.stock ?? 0 }))
        .filter((x) => x.cantidad > 0)
        .sort((a, b) => vendidasDe(b.v.color) - vendidasDe(a.v.color) || b.cantidad - a.cantidad || a.v.color.localeCompare(b.v.color, "es") || compararTallas(a.v.talla, b.v.talla))
        .map(({ v, cantidad }): PiezaOtraTienda => ({ color: v.color, punto: puntoDe([v]), talla: unaSola ? null : v.talla, cantidad }))
    : [];
  return {
    titulo: unaSola ? "Por color" : "Por talla y color",
    nota: `en ${ctx.miSede.ciudad}`,
    tallas,
    filas,
    otra: sede && piezas.length > 0 ? { ciudad: sede.ciudad, total: piezas.reduce((s, p) => s + p.cantidad, 0), piezas } : null,
  };
}

/**
 * La ficha de «Qué pedir» del modelo, o null si no está en «Qué pedir» (entonces la ficha sigue como siempre). Lo agotado se mira como su
 * tarjeta: sin nada aquí y con ventas en 8 semanas; lo que se acaba, si todavía tiene algo y no le alcanza hasta Navidad. Mira el modelo
 * entero (sin los filtros de la barra).
 */
export function fichaDePedir(m: ModeloAnalisis, ctx: Contexto): FichaPedir | null {
  const alla = otraSedeQueLaTiene(m.otras);
  const sedeAlla = alla ? (ctx.sedes.find((s) => s.id === alla.sedeId) ?? null) : null;
  const pedirA = ctx.acceso.pedir ? sedeAlla : null;
  const precio = precioDeLaFicha(m);

  const agotado = agotadoDelModelo(m, SIN_FILTROS, ctx.hoy);
  if (agotado) {
    const v = vendiste(agotado);
    return {
      tipo: "agotado",
      precio,
      veredicto: { est: "urg", texto: agotado.agoto ? `Se agotó el ${fechaCorta(agotado.agoto)}` : "Ya no hay." },
      cifras: [
        { etiqueta: "Vendiste", valor: v.valor, detalle: v.agregado },
        { etiqueta: "Tienes", valor: "0", detalle: `en ${ctx.miSede.ciudad}` },
        terceraCifra(m, "agotado", ctx),
      ],
      tabla: tablaDosPisos(m, ctx),
      pedirA,
    };
  }

  const a = alcanceDelModelo(m, SIN_FILTROS, ctx.diasDeVentas);
  if (a.tiene > 0 && a.dias !== null && a.dias < diasANavidad(ctx.hoy)) {
    const d = diasEnteros(a.dias) ?? 1;
    const ritmo = vendesPorSemana(a.porDia);
    return {
      tipo: "seAcaba",
      precio,
      veredicto: { est: d <= 7 ? "urg" : "ate", texto: `Se acaba el ${fechaEnQueSeAcaba(ctx.hoy, d)}` },
      cifras: [
        { etiqueta: "Tienes", valor: String(a.tiene), detalle: `${m.piso} en el piso` },
        { etiqueta: "Vendes", valor: ritmo.valor, detalle: "por semana" },
        terceraCifra(m, "seAcaba", ctx),
      ],
      tabla: tablaDosPisos(m, ctx),
      pedirA,
    };
  }
  return null;
}

/** Para el lector de pantalla y el globito de una casilla: «Blanco S: te quedan 0, vendiste 2», «Vino: te queda 1, vendiste 2». */
export function textoCasillaDosPisos(color: string, talla: string | null, c: CasillaDosPisos): string {
  const nombre = [color || "Sin color", talla].filter(Boolean).join(" ");
  return `${nombre}: te ${c.quedan === 1 ? "queda 1" : `quedan ${c.quedan}`}, vendiste ${c.vendidas}`;
}
