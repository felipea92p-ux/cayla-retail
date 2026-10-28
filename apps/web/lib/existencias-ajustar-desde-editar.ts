// «Ajustar stock» desde Editar producto: el enlace que abre la planilla de Existencias en la talla tocada, y la vuelta a Editar.
//
// Editar producto ya no ajusta stock (ADR-0494, actividad 3): cada número va con su candado, y el candado lleva aquí. El enlace pide
// tres cosas, todas en la URL de Existencias:
//   · `variante=<id>`  la talla (ya existía desde ADR-0241): el modal de la prenda se abre en ella.
//   · `ajustar=1`      que el modal entre directo en la planilla, con esa talla enfocada.
//   · `de=<productoId>` el producto de Editar, para ofrecer «Volver a Editar producto» (y `desde=` conserva la vista de Productos).
// Lógica pura, sin React, para poder probarla. Nadie confía en la URL: `de` solo pasa si es un uuid, y `desde` pasa por `desdeSeguro`.

import { conDesde } from "./vuelta-productos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El enlace del candado: la planilla de Existencias, en esa talla, con la vuelta a Editar. */
export function hrefAjustarDesdeEditar(opciones: { varianteId: string; productoId: string; desde?: string | null }): string {
  const { varianteId, productoId, desde } = opciones;
  const base = `/inventario?variante=${encodeURIComponent(varianteId)}&ajustar=1&de=${encodeURIComponent(productoId)}`;
  return conDesde(base, desde);
}

/** `?ajustar=1` tal como llega de `searchParams`. Cualquier otro valor es «no». */
export function pideAjustar(ajustar: string | string[] | undefined): boolean {
  return (Array.isArray(ajustar) ? ajustar[0] : ajustar) === "1";
}

/** A dónde vuelve «Volver a Editar producto»: la ficha de ese producto, con la vista de Productos de donde se salió. `null` si `de` no es un
 *  producto (nadie escribe una URL a mano para mandar a otro lado). */
export function vueltaAEditar(de: string | string[] | undefined, desde: string | null | undefined): string | null {
  const id = Array.isArray(de) ? de[0] : de;
  if (!id || !UUID.test(id)) return null;
  return conDesde(`/productos/${id}/editar`, desde);
}
