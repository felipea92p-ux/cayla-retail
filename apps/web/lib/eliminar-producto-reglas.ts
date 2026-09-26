/**
 * Textos de la ventana «Eliminar producto» (Productos ▸ Eliminar, `20260926220000_eliminar_producto.sql`; ADR-0218).
 *
 * La REGLA de qué se puede eliminar no vive aquí: vive en la base (`fn_producto_se_puede_eliminar`), que es la única
 * definición de «historia» de un producto y la misma que aplica `eliminar_producto` al borrar. Este archivo solo
 * redacta lo que se le dice al líder con lo que la base contestó: si se puede, qué se borra; si no, por qué y qué hacer.
 */

/** Lo que contesta `fn_producto_se_puede_eliminar`: si se puede y, si no, la razón lista para mostrar
 *  («tiene líneas de venta (7), movimientos de stock (15)» o «es una pieza del sistema: …»). */
export type SePuedeEliminar = { puede: boolean; razon: string | null };

/** PostgREST entrega la fila única de una función que devuelve `table (…)` como arreglo; se acepta también un objeto suelto.
 *  Cualquier otra forma es `null`: la ventana lo trata como «no se pudo comprobar» y NO ofrece borrar a ciegas. */
export function leerSePuedeEliminar(datos: unknown): SePuedeEliminar | null {
  const fila = Array.isArray(datos) ? datos[0] : datos;
  if (!fila || typeof fila !== "object") return null;
  const { puede, razon } = fila as { puede?: unknown; razon?: unknown };
  if (typeof puede !== "boolean") return null;
  return { puede, razon: typeof razon === "string" && razon.trim() !== "" ? razon : null };
}

/** El número en palabras del negocio: «su única variante» / «sus 3 variantes». */
function variantesEn(n: number): string {
  return n === 1 ? "su única variante" : `sus ${n} variantes`;
}

/** Qué se borra si se confirma. Solo se muestra cuando la base ya dijo que el producto nunca se movió. */
export function textoSeBorra(numVariantes: number): string {
  return `Nunca se vendió ni se movió, así que se borra por completo: su ficha, ${variantesEn(numVariantes)}, sus códigos de barras y sus fotos. No se puede deshacer.`;
}

/** Por qué NO se puede. La razón de la base empieza con «tiene …» (historia) o «es una pieza del sistema: …». */
export function textoNoSePuede(referencia: string, razon: string | null): string {
  const cuerpo = razon ?? "ya se usó";
  const conHistoria = razon === null || razon.startsWith("tiene");
  return `«${referencia}» ${cuerpo}.${conHistoria ? " Eliminarlo borraría esa historia." : ""}`;
}

/**
 * La salida que se le ofrece al líder cuando no se puede eliminar. Solo hay salida si el motivo es historia: una pieza del
 * sistema no se retira de ninguna manera. Con el producto todavía activo, la salida es descontinuarlo desde Editar (el
 * mismo interruptor Activo/Descontinuado que ya existe); si ya está descontinuado, no hay nada más que hacer.
 */
export function salidaSinEliminar(estado: string, razon: string | null): { texto: string; irAEditar: boolean } | null {
  if (razon !== null && !razon.startsWith("tiene")) return null;
  if (estado === "activo") {
    return { texto: "Si ya no lo quieres a la venta, márcalo como descontinuado: su historia se conserva.", irAEditar: true };
  }
  return { texto: "Ya está descontinuado: su historia se conserva.", irAEditar: false };
}
