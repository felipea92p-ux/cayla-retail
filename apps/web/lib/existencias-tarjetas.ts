/* ====================================================================
   Las tarjetas de Existencias: qué junta cada tarjeta y en qué orden van. Lógica pura, fuera del componente para poder probarla
   (backlog de ADR-0331: `agruparPorModelo` y `ordenarModelos` vivían en `ExistenciasTarjetas.tsx`, sin prueba).
   ==================================================================== */

import type { FilaPrenda, PrendaAgrupada } from "./existencias-prendas";

/** Una tarjeta de la lista: un modelo con los colores que muestra. */
export type ModeloPrendas<F extends FilaPrenda = FilaPrenda> = {
  /** Única en la lista (la llave de React y la del color elegido en la tarjeta). */
  clave: string;
  productoId: string;
  colores: PrendaAgrupada<F>[];
};

/** Junta las prendas por modelo respetando el orden en que llegan: el primer color que aparece decide dónde va la tarjeta. */
export function agruparPorModelo<F extends FilaPrenda>(prendas: readonly PrendaAgrupada<F>[]): ModeloPrendas<F>[] {
  const grupos = new Map<string, PrendaAgrupada<F>[]>();
  for (const p of prendas) {
    const g = grupos.get(p.productoId);
    if (g) g.push(p);
    else grupos.set(p.productoId, [p]);
  }
  return [...grupos.entries()].map(([productoId, colores]) => ({ clave: productoId, productoId, colores }));
}

export type OrdenPrendas = "relevancia" | "nombre" | "mas-piso" | "menos-piso" | "mas-almacen" | "mas-disponible" | "menos-disponible";

/** Las opciones de «Ordenar por»: donde no se separa piso y almacén (Taller) no hay «más en el piso», solo lo disponible. */
export function opcionesOrden(separa: boolean): { valor: OrdenPrendas; texto: string }[] {
  return separa
    ? [
        { valor: "relevancia", texto: "Más relevantes" },
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
