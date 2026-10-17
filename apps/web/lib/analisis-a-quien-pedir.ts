// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A8): a quién se le pide cada modelo que se acaba y
// cómo se agrupan por proveedor. Lógica pura, sin base ni React; la prueba es `analisis-a-quien-pedir.test.ts`.
//
// EL PROBLEMA. «Comprar» sacaba el proveedor de la última compra o producción (`fn_origen_producto`), y en producción ningún modelo tiene
// ninguna: la fila no decía a quién pedir y «Comprar todas» mezclaba a todos. El catálogo SÍ trae el proveedor de casi todos los modelos
// (`productos.proveedor_id`, ~260 de ~357).
//
// LA REGLA (de más fuerte a más débil):
//   1. El origen REAL manda: si el modelo viene del Taller (producción terminada), es del Taller; si tiene una compra, es el proveedor de
//      esa compra (`proveedorId`).
//   2. Sin origen, el proveedor del CATÁLOGO, y se dice que lo es («Proveedor del catálogo»): es el proveedor con el que se compra
//      «habitualmente» ese modelo, no el de una compra que ya pasó.
//   3. Sin nada, «Sin proveedor». Nunca se inventa uno.
//
// LO QUE NO HACE. El proveedor del catálogo NUNCA decide si un modelo se hace en el Taller o se compra a terceros: producción no tiene hoy
// ni una orden terminada ni un movimiento en el Taller, y 26 modelos apuntan a «CAYLA SAC» (la marca propia, que puede ser el Taller o
// una maquila). Esa decisión es de Felipe (D9). Tampoco cambia a dónde lleva «Comprar» (`analisis-acciones.ts`, A9): eso es texto.

import type { PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";
import { diasQueQuedan, ordenSeAcaba, plural, porLlegar } from "./analisis-reglas";

/** De dónde sale el proveedor de un modelo. */
export type FuenteProveedor = "compra" | "catalogo" | "taller" | "ninguno";

/** A quién se le pide un modelo, y de dónde se sabe. */
export type ProveedorDelModelo = { fuente: "compra" | "catalogo"; id: string; nombre: string } | { fuente: "taller" } | { fuente: "ninguno" };

/** El nombre del grupo de lo que no tiene proveedor, y el del Taller. */
const TEXTO_SIN_PROVEEDOR = "Sin proveedor";
const TEXTO_TALLER = "Taller de CAYLA";

/** El nombre de un proveedor tal como se dice en pantalla; uno archivado lo dice (se le sigue pidiendo, pero conviene saberlo). null si no se conoce. */
function nombreDeProveedor(p: ProveedoresAnalisis, id: string): string | null {
  const x = p.nombres[id];
  if (!x) return null;
  return x.activo ? x.nombre : `${x.nombre} (archivado)`;
}

/**
 * A quién se le pide el modelo. El origen real manda; el catálogo solo entra cuando NO hay origen (nunca para decidir entre el Taller y
 * terceros). Un origen «terceros» cuyo proveedor no se puede nombrar (no debería pasar: toda compra tiene proveedor) queda en «ninguno»
 * en vez de adivinar con el catálogo.
 */
export function proveedorDelModelo(m: Pick<PrendaAnalisis, "origen" | "proveedorId" | "productoId">, p: ProveedoresAnalisis): ProveedorDelModelo {
  if (m.origen === "taller") return { fuente: "taller" };
  if (m.origen === "terceros") {
    const nombre = m.proveedorId ? nombreDeProveedor(p, m.proveedorId) : null;
    return m.proveedorId && nombre ? { fuente: "compra", id: m.proveedorId, nombre } : { fuente: "ninguno" };
  }
  const id = p.delCatalogo[m.productoId];
  const nombre = id ? nombreDeProveedor(p, id) : null;
  return id && nombre ? { fuente: "catalogo", id, nombre } : { fuente: "ninguno" };
}

/** «Pídelo a Textil Andino» / «Pídelo al Taller»; null si no hay a quién (la fila no dice nada: el grupo «Sin proveedor» lo dice). */
export function textoPidelo(q: ProveedorDelModelo): string | null {
  if (q.fuente === "taller") return "Pídelo al Taller";
  if (q.fuente === "ninguno") return null;
  return `Pídelo a ${q.nombre}`;
}

/**
 * Lo que todavía hay que pedir: lo que se acaba y NO viene en camino (una llegada atrasada no cuenta como que viene: `porLlegar`). Es la
 * regla única de «A quién pedir» y del pie de «Compra» en Hoy, y no depende del filtro del carril: así la tarjeta no aparece ni desaparece
 * al cambiar de filtro y no empuja los botones del filtro de debajo del mouse (ADR-0185).
 */
export function modelosPorPedir<T extends Pick<PrendaAnalisis, "llega">>(modelos: readonly T[], hoy: string): T[] {
  return modelos.filter((m) => porLlegar(m, hoy) === 0);
}

/** De dónde se sabe, corto, para ir bajo el nombre del proveedor o en la tarjetita de la ficha. */
export const FUENTE_CORTA: Record<FuenteProveedor, string> = {
  compra: "de tu última compra",
  catalogo: "proveedor del catálogo",
  taller: "lo hace el Taller de CAYLA",
  ninguno: "falta elegirlo en el catálogo",
};

/** De dónde se sabe, completo, para el tooltip de «Pídelo a …». */
export const FUENTE_LARGA: Record<FuenteProveedor, string> = {
  compra: "Es el proveedor de la última compra de este modelo.",
  catalogo: "Proveedor del catálogo: así quedó en la ficha del modelo. El sistema no tiene una compra con esta prenda ni una producción terminada de este modelo.",
  taller: "Este modelo lo hace el Taller de CAYLA.",
  ninguno: "Este modelo no tiene proveedor en el catálogo.",
};

/**
 * Lo que la fila de «Comprar» dice A LA VISTA bajo «Pídelo a …»: solo cuando el nombre sale del catálogo («proveedor del catálogo»), para que
 * nadie lo tome por el de su última compra. El tooltip lo explica más, pero un tooltip no se alcanza con el dedo ni con el teclado.
 * Con una compra real o el Taller no dice nada: el nombre ya es el de verdad.
 */
export const textoFuenteDeLaFila = (q: ProveedorDelModelo): string | null => (q.fuente === "catalogo" ? FUENTE_CORTA.catalogo : null);

/** Un proveedor (o el Taller, o «Sin proveedor») con los modelos que se le piden, del más urgente al menos. */
export type GrupoProveedor<T extends PrendaAnalisis = PrendaAnalisis> = {
  /** `p:<id>` · `taller` · `ninguno`. */
  clave: string;
  nombre: string;
  /** De dónde se sabe, sin repetir y en este orden: compra, catálogo, Taller, ninguno. Un mismo proveedor puede salir de las dos primeras. */
  fuentes: FuenteProveedor[];
  modelos: T[];
  /** Cuántos ya se agotaron. */
  agotados: number;
  /** Los días que le quedan al más urgente (0 = ya se agotó); null si ninguno tiene ritmo. */
  masUrgente: number | null;
};

const ORDEN_FUENTES: readonly FuenteProveedor[] = ["compra", "catalogo", "taller", "ninguno"];

/**
 * Los modelos que hay que pedir, agrupados por a quién. Dentro de cada grupo, del más urgente al menos (`ordenSeAcaba`); entre grupos,
 * primero el de quien tiene lo más urgente (lo agotado antes que lo que queda), a igual plazo el que tiene más modelos, después por nombre.
 * «Sin proveedor» va siempre al final: no es alguien a quien se le pueda pedir.
 */
export function agruparPorProveedor<T extends PrendaAnalisis>(modelos: readonly T[], p: ProveedoresAnalisis): GrupoProveedor<T>[] {
  const grupos = new Map<string, { nombre: string; fuentes: Set<FuenteProveedor>; modelos: T[] }>();
  for (const m of modelos) {
    const q = proveedorDelModelo(m, p);
    const clave = q.fuente === "taller" ? "taller" : q.fuente === "ninguno" ? "ninguno" : `p:${q.id}`;
    const nombre = q.fuente === "taller" ? TEXTO_TALLER : q.fuente === "ninguno" ? TEXTO_SIN_PROVEEDOR : q.nombre;
    const g = grupos.get(clave) ?? { nombre, fuentes: new Set<FuenteProveedor>(), modelos: [] };
    g.fuentes.add(q.fuente);
    g.modelos.push(m);
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]): GrupoProveedor<T> => {
      const ordenados = [...g.modelos].sort(ordenSeAcaba);
      const dias = ordenados.map((m) => diasQueQuedan(m)).filter((d): d is number => d !== null);
      return {
        clave,
        nombre: g.nombre,
        fuentes: ORDEN_FUENTES.filter((f) => g.fuentes.has(f)),
        modelos: ordenados,
        agotados: ordenados.filter((m) => diasQueQuedan(m) === 0).length,
        masUrgente: dias.length > 0 ? Math.min(...dias) : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.clave === "ninguno") - Number(b.clave === "ninguno") ||
        (a.masUrgente ?? Infinity) - (b.masUrgente ?? Infinity) ||
        b.modelos.length - a.modelos.length ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
}

/** Cuántos proveedores (el Taller cuenta como uno a quien pedirle) y cuántos modelos sin proveedor tienen estos grupos. */
export function resumenDeGrupos(grupos: readonly Pick<GrupoProveedor, "clave" | "modelos">[]): { proveedores: number; sinProveedor: number; modelos: number } {
  const conQuien = grupos.filter((g) => g.clave !== "ninguno");
  return {
    proveedores: conQuien.length,
    sinProveedor: grupos.filter((g) => g.clave === "ninguno").reduce((n, g) => n + g.modelos.length, 0),
    modelos: grupos.reduce((n, g) => n + g.modelos.length, 0),
  };
}

/**
 * «Pídelas a 12 proveedores · 3 sin proveedor»; si ninguno tiene proveedor, «Falta elegir el proveedor en el catálogo». null si no hay nada
 * que pedir. `yaVienen`: el tooltip lista también lo que ya viene en camino y esto solo habla de lo que no, así que lo dice («Las que aún
 * no vienen: pídelas a …») para que nadie crea que hay que pedir toda la lista.
 */
export function textoPidelasA(r: { proveedores: number; sinProveedor: number }, yaVienen = false): string | null {
  if (r.proveedores === 0 && r.sinProveedor === 0) return null;
  if (r.proveedores === 0) return "Falta elegir el proveedor en el catálogo";
  const quienes = `${yaVienen ? "Las que aún no vienen: pídelas" : "Pídelas"} a ${r.proveedores} ${plural(r.proveedores, "proveedor", "proveedores")}`;
  return r.sinProveedor > 0 ? `${quienes} · ${r.sinProveedor} sin proveedor` : quienes;
}

/** Lo que dice la cabecera de «A quién pedir»: «17 proveedores · 40 modelos». */
export function resumenCabecera(r: { proveedores: number; sinProveedor: number; modelos: number }): string {
  const modelos = `${r.modelos} ${plural(r.modelos, "modelo", "modelos")}`;
  if (r.proveedores === 0) return modelos;
  return `${r.proveedores} ${plural(r.proveedores, "proveedor", "proveedores")} · ${modelos}`;
}

/** Lo que dice cada proveedor de sus modelos: «3 modelos · 1 agotado». */
export function textoModelosDelGrupo(g: Pick<GrupoProveedor, "modelos" | "agotados">): string {
  const n = g.modelos.length;
  const modelos = `${n} ${plural(n, "modelo", "modelos")}`;
  return g.agotados > 0 ? `${modelos} · ${g.agotados} ${plural(g.agotados, "agotado", "agotados")}` : modelos;
}

/** De dónde se sabe el proveedor de un grupo, en una frase corta: si mezcla compra y catálogo, lo dice. */
export function textoFuentesDelGrupo(fuentes: readonly FuenteProveedor[]): string {
  if (fuentes.length === 0) return "";
  if (fuentes.length === 1) return FUENTE_CORTA[fuentes[0]!];
  if (fuentes.length === 2 && fuentes.includes("compra") && fuentes.includes("catalogo")) return "de tu última compra y del catálogo";
  return fuentes.map((f) => FUENTE_CORTA[f]).join(" · ");
}
