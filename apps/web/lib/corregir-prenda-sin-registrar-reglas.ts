// «Corregir lo anotado» de una venta sin registrar (ADR-0369). Sin React ni red.
//
// CONTRATO
//   PROMETE: con lo que anotó caja y las listas de la hoja, con qué arranca la hoja al corregir; si lo elegido es distinto de lo
//            anotado (sin cambios, «Guardar cambios» no se enciende: la base también lo rechaza, `prenda_sin_cambios`); y qué decir
//            cuando la base rechaza.
//   NO HACE: no decide qué se puede corregir (pendiente o cerrada sin prenda): lo decide `corregir_prenda_sin_registrar`.
import { sugerirDescripcion, tallasDeCategoria, type DatosPrendaSinRegistrar, type ListasPrendaLibre } from "./prenda-sin-registrar-reglas";

/** Lo que anotó caja de una prenda vendida sin registrar, como lo guarda `prendas_por_regularizar`. */
export type AnotadoPorCaja = { categoriaId: string; tallaId: string; colorCodigo: string; descripcion: string; precio: number };

/**
 * Con qué arranca la hoja. Un dato que la caja ya no ofrece (una categoría desactivada, una talla que no es de la categoría) arranca
 * vacío: la guía lo pide, en vez de mostrar un combo con un valor que no está en su lista. La descripción sigue a la sugerencia
 * (`descripcionEscrita = null`) solo si lo anotado ERA la sugerencia; si caja la escribió a mano, se respeta y se ofrece volver a la
 * sugerencia con el enlace de siempre.
 */
export function arranqueDeCorreccion(
  inicial: AnotadoPorCaja,
  listas: Pick<ListasPrendaLibre, "categorias" | "tallas" | "tallasPorCategoria" | "colores">,
): { categoriaId: string; tallaId: string; colorCodigo: string; descripcionEscrita: string | null } {
  const categoria = listas.categorias.find((c) => c.id === inicial.categoriaId) ?? null;
  const tallas = categoria ? tallasDeCategoria(listas.tallasPorCategoria?.[categoria.id], listas.tallas, listas.tallasPorCategoria !== null) : [];
  const talla = tallas.find((t) => t.id === inicial.tallaId) ?? null;
  const color = listas.colores.find((c) => c.codigo === inicial.colorCodigo) ?? null;
  const sugerencia = sugerirDescripcion(categoria?.nombre ?? null, color?.nombre ?? null, talla?.valor ?? null);
  return {
    categoriaId: categoria?.id ?? "",
    tallaId: talla?.id ?? "",
    colorCodigo: color?.codigo ?? "",
    descripcionEscrita: sugerencia !== null && inicial.descripcion.trim() === sugerencia ? null : inicial.descripcion,
  };
}

/** ¿Cambió algo de lo anotado? La descripción se compara sin los espacios de los bordes (la base la guarda recortada). */
export function cambioEnCorreccion(inicial: AnotadoPorCaja, d: Pick<DatosPrendaSinRegistrar, "categoriaId" | "tallaId" | "colorCodigo" | "descripcion">): boolean {
  return (
    d.categoriaId !== inicial.categoriaId ||
    d.tallaId !== inicial.tallaId ||
    d.colorCodigo !== inicial.colorCodigo ||
    d.descripcion.trim() !== inicial.descripcion.trim()
  );
}

/** El rechazo de la base, en palabras de tienda. `null` = no es uno de los nuestros (lo traduce `traducirError`). */
export function errorDeCorreccion(mensaje: string): { titulo: string; detalle?: string; releer: boolean } | null {
  if (mensaje.includes("prenda_no_corregible"))
    return { titulo: "Esta venta ya no se puede corregir.", detalle: "Almacén ya la identificó con su prenda real, o la venta se anuló. Actualizamos la lista.", releer: true };
  if (mensaje.includes("prenda_no_existe")) return { titulo: "Esta venta ya no está.", detalle: "Actualizamos la lista.", releer: true };
  if (mensaje.includes("prenda_datos_invalidos"))
    return { titulo: "Revisa lo elegido.", detalle: "La categoría, la talla o el color ya no están en la lista, o falta la descripción.", releer: false };
  return null;
}

/** La línea bajo lo anotado cuando ya se corrigió: quién, cuándo y lo que había anotado caja al vender. */
export function lineaDeCorreccion(c: { veces: number; ultimaPor: string; original: string }, dia: string): string {
  const veces = c.veces > 1 ? ` (${c.veces} veces)` : "";
  const original = c.original.trim() ? ` · caja anotó «${c.original.trim()}»` : "";
  return `Corregido por ${c.ultimaPor} el ${dia}${veces}${original}`;
}
