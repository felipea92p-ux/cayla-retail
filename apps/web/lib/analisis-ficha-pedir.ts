// Análisis (ADR-0357, act. 2026-11-24, punto 8): la ficha de un modelo que está en «Qué pedir» (lo que ya se agotó o se acaba antes de
// Navidad). Felipe la eligió mirando la maqueta `docs/maquetas/analisis-pedir-sin-comprar-2026-11/ficha.html` con datos de TRU.
//
// EL PROBLEMA. La ficha decía otra cosa que su tarjeta: «Vendiste 13 en 30 días» donde la tarjeta decía «23 en 37 días» (la tarjeta mira
// 8 semanas; la ficha cortaba en 30 días justo lo que más se vendió), «Ya no hay.» sin decir desde cuándo, «EN LIM» donde la tarjeta dice
// «Lima tiene 2», una tabla que repetía tres veces «sin stock» y el botón «Comprar», que ya se fue de las tarjetas.
// LA REGLA. Si el modelo está en «Qué pedir», su ficha cuenta lo mismo que su tarjeta y agrega el detalle que la tarjeta no tiene:
//   · lo agotado: «Se agotó el 20 nov.»; VENDISTE 23 en 37 días, TIENES 0, LIMA TIENE 2 (con qué colores); y lo vendido por color en las
//     mismas 8 semanas, con lo que tiene la otra tienda de cada color;
//   · lo que se acaba: «Se acaba el 6 dic.»; TIENES 68, VENDES 41 por semana, LIMA TIENE 17 (y cuántos de los que te faltan); y cuántas te
//     quedan por talla y color, con 0 en rojo donde se vendió y ya no hay.
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
 * Una fila de la tabla de lo agotado: un color, cuántas te quedan aquí (Felipe 2026-11-25: «no indica cuánto me queda de cada color»; en
 * lo agotado es 0, y se dice), lo que vendió en 8 semanas y lo que tiene la otra tienda (null si no se muestra).
 */
export type FilaColorAgotado = { color: string; punto: string | null; quedan: number; vendidas: number; alla: number | null };

/** Una celda de «Te quedan»: cuántas quedan (`queda`), 0 donde se vendió y ya no hay (`agotada`) o «—» donde nunca hubo (`nunca`). */
export type CeldaQueda = { talla: string; quedan: number; estado: "queda" | "agotada" | "nunca" };
export type FilaQueda = { color: string; punto: string | null; vendio: number; celdas: CeldaQueda[] };

export type TablaFichaPedir =
  | { tipo: "colores"; titulo: string; nota: string; ciudadAlla: string | null; filas: FilaColorAgotado[]; total: number; totalAlla: number }
  | {
      tipo: "quedan";
      titulo: string;
      nota: string;
      tallas: string[];
      /** El título de cada columna de talla: la talla, o «Te quedan» si el modelo tiene una sola (la talla única no dice nada). */
      encabezados: string[];
      filas: FilaQueda[];
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

/** Lo agotado, por color: lo vendido en las 8 semanas y, si otra tienda tiene el modelo, cuántas de cada color tiene. */
function tablaColores(m: ModeloAnalisis, ctx: Contexto): TablaFichaPedir {
  const alla = otraSedeQueLaTiene(m.otras);
  const sede = alla ? ctx.sedes.find((s) => s.id === alla.sedeId) : undefined;
  const colores = [...new Set(tallasDe(m).map((v) => v.color))];
  const filas = colores
    .map((color) => {
      const vs = tallasDe(m).filter((v) => v.color === color);
      return {
        color,
        punto: puntoDe(vs),
        quedan: vs.reduce((s, v) => s + totalEnTienda(v), 0),
        vendidas: vs.reduce((s, v) => s + v.semanas.reduce((t, n) => t + Math.max(0, n), 0), 0),
        alla: sede ? vs.reduce((s, v) => s + (v.otras.find((o) => o.sedeId === sede.id)?.stock ?? 0), 0) : null,
      };
    })
    .filter((f) => f.vendidas > 0 || (f.alla ?? 0) > 0)
    .sort((a, b) => b.vendidas - a.vendidas || (b.alla ?? 0) - (a.alla ?? 0) || a.color.localeCompare(b.color, "es"));
  return {
    tipo: "colores",
    titulo: "Por color",
    nota: `en ${SEMANAS_AGOTADOS} semanas; ya no te queda ninguno`,
    ciudadAlla: sede?.ciudad ?? null,
    filas,
    total: filas.reduce((s, f) => s + f.vendidas, 0),
    totalAlla: filas.reduce((s, f) => s + (f.alla ?? 0), 0),
  };
}

/** Lo que se acaba: cuántas te quedan de cada talla y color; 0 donde se vendió y ya no hay; «—» donde nunca hubo. Lo vendido, en 30 días. */
function tablaQuedan(m: ModeloAnalisis, ctx: Contexto): TablaFichaPedir {
  const vs = tallasDe(m);
  const tallas = [...new Set(vs.map((v) => v.talla))].sort(compararTallas);
  const colores = [...new Set(vs.map((v) => v.color))];
  const filas = colores
    .map((color) => {
      const delColor = vs.filter((v) => v.color === color);
      return {
        color,
        punto: puntoDe(delColor),
        vendio: delColor.reduce((s, v) => s + Math.max(0, v.vendidas30), 0),
        celdas: tallas.map((talla): CeldaQueda => {
          const enTalla = delColor.filter((v) => v.talla === talla);
          const quedan = enTalla.reduce((s, v) => s + totalEnTienda(v), 0);
          const vendio = enTalla.reduce((s, v) => s + Math.max(0, v.vendidas30), 0);
          if (quedan > 0) return { talla, quedan, estado: "queda" };
          return { talla, quedan: 0, estado: vendio > 0 ? "agotada" : "nunca" };
        }),
      };
    })
    .sort((a, b) => b.vendio - a.vendio || a.color.localeCompare(b.color, "es"));
  // Con una sola talla («Estándar», «Única»), la columna se llama por lo que dice: cuántas te quedan de cada color.
  const unaSola = tallas.length === 1;
  return {
    tipo: "quedan",
    titulo: unaSola ? "Te quedan por color" : "Te quedan por talla y color",
    nota: `en ${ctx.miSede.ciudad}`,
    tallas,
    encabezados: unaSola ? ["Te quedan"] : tallas,
    filas,
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
      tabla: tablaColores(m, ctx),
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
      tabla: tablaQuedan(m, ctx),
      pedirA,
    };
  }
  return null;
}

/** Para el lector de pantalla y el globito de una celda de «Te quedan»: «Negro S: se vendió y ya no hay», «Moka L: quedan 2». */
export function textoCeldaQueda(color: string, c: CeldaQueda): string {
  const nombre = [color, c.talla].filter(Boolean).join(" ");
  if (c.estado === "agotada") return `${nombre}: se vendió y ya no hay`;
  if (c.estado === "nunca") return `${nombre}: nunca hubo`;
  return `${nombre}: ${c.quedan === 1 ? "queda 1" : `quedan ${c.quedan}`}`;
}

