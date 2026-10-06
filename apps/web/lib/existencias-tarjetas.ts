/* ====================================================================
   Las tarjetas de Existencias: qué es una tarjeta, en qué orden van y qué dice su conteo (ADR-0331, actualización (c) del
   2026-10-04). Lógica pura: la leen la lista de tarjetas, la barra de filtros (el número de cada opción) y la línea de resultado.

   El problema que resuelve: el Inicio y «Para hoy» decían «15 tallas por colgar» y la lista filtrada mostraba 5 tarjetas cuyas
   pastillas sumaban 12. La lista agrupaba UNA tarjeta por MODELO y la tarjeta enseña un color a la vez: las 3 tallas de Blusa
   Valentina Rosado quedaban detrás de un punto de color, y la pastilla «3 tallas por colgar» hablaba solo del Blanco. Quien llega
   desde el aviso cuenta 12, no encuentra las otras 3 y deja de creerle al número.

   La regla:
   - Sin «Hoy», la lista es para MIRAR: una tarjeta por modelo, sus colores en puntos (lo aprobado en ADR-0331: una foto por modelo).
   - Con un caso de «Hoy» elegido, la lista es la de TRABAJO del día y va por PRENDA (modelo + color, la percha de `clavePercha`):
     cada tarjeta muestra entera lo que cuenta, y la suma de sus pastillas es la cifra de «Para hoy» y del Inicio. Es la misma unidad
     del bloque del Inicio, de la tabla «Por colgar» (ordenada y paginada por percha) y del viaje al almacén: dos colores son dos
     perchas.
   Una sola función (`claveDeTarjeta`) decide qué es una tarjeta: la usan la lista y el conteo de cada opción de la barra, para que
   «Por colgar · 6» traiga 6 tarjetas.
   ==================================================================== */

import { clavePercha } from "./inventario-reglas";
import { TEXTO_HOY, type TipoHoy } from "./existencias-hoy";
import type { FilaPrenda, PrendaAgrupada } from "./existencias-prendas";

/** Lo que una tarjeta junta: con «Hoy», la prenda (modelo + color); sin él, el modelo entero. */
export function claveDeTarjeta(f: { productoId: string; color: string | null }, hoy: TipoHoy | null): string {
  return hoy ? clavePercha(f) : f.productoId;
}

/** Una tarjeta de la lista: un modelo con los colores que muestra (uno solo cuando la lista es de trabajo). */
export type ModeloPrendas<F extends FilaPrenda = FilaPrenda> = {
  /** Única en la lista: la de `claveDeTarjeta` (el modelo, o el modelo + color). */
  clave: string;
  productoId: string;
  colores: PrendaAgrupada<F>[];
};

/** Junta las prendas en tarjetas respetando el orden en que llegan: la primera prenda que aparece decide dónde va su tarjeta. */
export function tarjetasDeExistencias<F extends FilaPrenda>(prendas: readonly PrendaAgrupada<F>[], hoy: TipoHoy | null): ModeloPrendas<F>[] {
  const grupos = new Map<string, PrendaAgrupada<F>[]>();
  for (const p of prendas) {
    const clave = claveDeTarjeta({ productoId: p.productoId, color: p.color }, hoy);
    const g = grupos.get(clave);
    if (g) g.push(p);
    else grupos.set(clave, [p]);
  }
  return [...grupos.entries()].map(([clave, colores]) => ({ clave, productoId: colores[0].productoId, colores }));
}

export type OrdenPrendas = "relevancia" | "nombre" | "mas-piso" | "menos-piso" | "mas-almacen" | "mas-disponible" | "menos-disponible";

/** Las opciones de «Ordenar por»: donde no se separa piso y almacén (Taller) no hay «más en el piso», solo lo disponible. */
export function opcionesOrden(separa: boolean): { valor: OrdenPrendas; texto: string }[] {
  return separa
    ? [
        // «Prioridad»: lo que falta en el piso y más se vende, primero (la lista del día del motor). Es el nombre que la persona ya vio.
        { valor: "relevancia", texto: "Prioridad" },
        { valor: "nombre", texto: "Nombre (A–Z)" },
        { valor: "mas-piso", texto: "Más en el piso" },
        { valor: "menos-piso", texto: "Menos en el piso" },
        { valor: "mas-almacen", texto: "Más en el almacén" },
      ]
    : [
        { valor: "relevancia", texto: "Más relevantes" },
        { valor: "nombre", texto: "Nombre (A–Z)" },
        { valor: "mas-disponible", texto: "Más disponibles" },
        { valor: "menos-disponible", texto: "Menos disponibles" },
      ];
}

/** «Más relevantes» es el orden que ya traía la lista (lo que falta en el piso primero, o la relevancia de lo escrito): no se toca.
 *  Los demás suman los colores de la tarjeta. Es estable: a igual cifra, se respeta el orden de llegada. */
export function ordenarModelos<F extends FilaPrenda>(modelos: readonly ModeloPrendas<F>[], orden: OrdenPrendas): ModeloPrendas<F>[] {
  const copia = [...modelos];
  const suma = (m: ModeloPrendas<F>, cifra: (p: PrendaAgrupada<F>) => number) => m.colores.reduce((n, p) => n + cifra(p), 0);
  const piso = (m: ModeloPrendas<F>) => suma(m, (p) => p.piso ?? 0);
  const almacen = (m: ModeloPrendas<F>) => suma(m, (p) => p.almacen ?? 0);
  const disponible = (m: ModeloPrendas<F>) => suma(m, (p) => p.disponible);
  switch (orden) {
    case "nombre":
      return copia.sort((a, b) => a.colores[0].referencia.localeCompare(b.colores[0].referencia, "es"));
    case "mas-piso":
      return copia.sort((a, b) => piso(b) - piso(a));
    case "menos-piso":
      return copia.sort((a, b) => piso(a) - piso(b));
    case "mas-almacen":
      return copia.sort((a, b) => almacen(b) - almacen(a));
    case "mas-disponible":
      return copia.sort((a, b) => disponible(b) - disponible(a));
    case "menos-disponible":
      return copia.sort((a, b) => disponible(a) - disponible(b));
    default:
      return copia;
  }
}

/** Lo que dice la línea de resultado: cuántas tarjetas, en qué unidad, y —con «Hoy»— las tallas que suman sus pastillas. */
export type ConteoDeLista = {
  total: number;
  unidad: { uno: string; varios: string };
  /** Con «Hoy»: «15» + «tallas por colgar», la cifra que trae a la persona desde «Para hoy» o el Inicio. Sin «Hoy», `null`. */
  tallas: { cifra: number; texto: string } | null;
  /** Lo que explica una diferencia con «Para hoy» («1 ya viene en camino»), o `null`. */
  aclaracion: string | null;
};

/** El conteo de la lista ya filtrada. `filas` son las tallas filtradas (todas las páginas). */
export function conteoDeLista(tarjetas: number, filas: readonly Pick<FilaPrenda, "enTransito">[], hoy: TipoHoy | null): ConteoDeLista {
  if (!hoy) return { total: tarjetas, unidad: { uno: "producto", varios: "productos" }, tallas: null, aclaracion: null };
  const n = filas.length;
  const palabra = n === 1 ? "talla" : "tallas";
  // Las mismas palabras de la pastilla (`textoHoyDePrenda`: «3 tallas por colgar»). «Mantener» no lleva cifra en la pastilla: se
  // dice como el caso del filtro, no como una tarea.
  const texto = hoy === "mantener" ? `${palabra} en «${TEXTO_HOY.mantener}»` : `${palabra} ${TEXTO_HOY[hoy].toLocaleLowerCase("es")}`;
  // «Sin stock atrás» en «Para hoy» descuenta lo que ya viene en camino (eso no se pide de nuevo); la lista sí lo muestra, marcado.
  // Sin la aclaración, «3» arriba y «4» aquí volvían a ser dos números para lo mismo.
  const enCamino = hoy === "sin_stock_atras" ? filas.filter((f) => f.enTransito > 0).length : 0;
  return {
    total: tarjetas,
    unidad: { uno: "prenda", varios: "prendas" },
    tallas: { cifra: n, texto },
    aclaracion: enCamino > 0 ? `${enCamino} ya ${enCamino === 1 ? "viene" : "vienen"} en camino` : null,
  };
}
