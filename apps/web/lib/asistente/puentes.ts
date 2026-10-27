// Cómo se abre una pantalla con id desde su pantalla madre (ADR-0536, «Acompañar una tarea», Felipe 2026-10-27: «en cualquier cosa que
// pida el usuario el sistema debe guiar paso a paso»). «Agrega un color a la blusa Catalina 7» pasa por Productos → la prenda → «Editar»
// → Editar producto, pero la IA suele saltar del buscador directo a la ficha: sin el puente, la persona queda en la lista sin saber qué
// tocar. Aquí, el camino de cada una, con los pasos de la guía madre que la abren. `puentes.test.ts` comprueba que cada guía y cada paso
// existen, así el mapa no queda viejo cuando una guía cambia.

/**
 * El paso que guarda de verdad, cuando la guía explica el guardado con otra pieza: Editar producto lo cuenta sobre un texto («Guardar
 * sigue abajo, en la barra»), porque la barra solo aparece con cambios y la demo no cambia nada; acompañando, se enciende el botón.
 */
export const PASO_QUE_GUARDA: Readonly<Record<string, { en: string; usar: string }>> = {
  "productos.id.editar": { en: "guardar", usar: "barra-guardar" },
};

/** El camino a una pantalla con id: desde qué guía y con qué pasos (de esa guía) se abre. */
export type Puente = { desde: string; pasos: readonly { pasoId: string; orden: string }[] };

export const PUENTES: Readonly<Record<string, Puente>> = {
  "productos.id.editar": {
    desde: "productos",
    pasos: [
      { pasoId: "buscador", orden: "Busca la prenda" },
      { pasoId: "tarjeta", orden: "Toca la prenda" },
      { pasoId: "vr-botones", orden: "Toca Editar" },
    ],
  },
  "inventario.traslados.id": { desde: "inventario.traslados", pasos: [{ pasoId: "pase", orden: "Toca el traslado" }] },
  "compras.proveedores.id": { desde: "compras.proveedores", pasos: [{ pasoId: "lista", orden: "Toca el proveedor" }] },
  "inventario.conteo.id": { desde: "inventario.conteo", pasos: [{ pasoId: "fila", orden: "Toca el conteo" }] },
  "produccion.ordenes.numero": { desde: "produccion.ordenes", pasos: [{ pasoId: "fila", orden: "Toca la orden" }] },
  "tienda-web.campanas.editor": { desde: "tienda-web.campanas", pasos: [{ pasoId: "lista", orden: "Toca la campaña" }] },
};
