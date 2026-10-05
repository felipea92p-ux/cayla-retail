import { RUTA_NUEVO_TRASLADO } from "./traslados-reglas";

/* ====================================================================
   «Hacer…» de Existencias en el celular (rediseño 2026-10-05, aprobado por Felipe).

   En pantallas anchas, la cabecera de Existencias trae una fila de accesos: colgar lo guardado, recibir, contar, trasladar y
   apartados. En el celular esa fila se deslizaba de lado sin avisar (cuatro de los cinco quedaban fuera de la vista) y empujaba las
   prendas bajo el pliegue. Ahora el celular los junta en una hoja que abre el botón fijo «Hacer…».

   Esto NO decide permisos nuevos: cada acción aparece con las MISMAS condiciones que su botón de la fila de la cabecera
   (`inventario/page.tsx`). La página las calcula (ella tiene la persona y la sede) y las pasa aquí; una prueba vigila que ningún
   acceso de esta lista falte en esa fila, y al revés.

   «Hacer…» no es un módulo (ADR-0306: un módulo es una entrada del menú): es una función de Existencias. No vive en Roles y accesos.
   ==================================================================== */

export type ClaveAccionHacer = "colgar" | "recibir" | "contar" | "trasladar" | "apartados";

export type AccionHacer = {
  clave: ClaveAccionHacer;
  etiqueta: string;
  /** Una línea que dice para qué sirve, en palabras del negocio. */
  detalle: string;
  href: string;
};

export type EntradaHacer = {
  /** Su rol ve «Colgar en el piso», mira SU sede y la sede separa piso y almacén (lo decide la página). */
  puedeColgar: boolean;
  /** Mira su propia sede: Recibir, Contar y Apartados trabajan siempre sobre la sede de quien entra. */
  enSuSede: boolean;
  veRecibir: boolean;
  veConteos: boolean;
  veTraslados: boolean;
  /** La sede vende (una tienda): solo ahí hay apartados. */
  vende: boolean;
  veApartados: boolean;
};

/** Las acciones que esta persona puede hacer aquí, en el orden de la fila de la cabecera. Vacía = «Hacer…» no se dibuja. */
export function accionesHacer(e: EntradaHacer): AccionHacer[] {
  const acciones: AccionHacer[] = [];
  if (e.puedeColgar) acciones.push({ clave: "colgar", etiqueta: "Colgar en el piso", detalle: "Pasa prendas del almacén al piso de venta", href: "/inventario/bajar" });
  if (e.enSuSede && e.veRecibir) acciones.push({ clave: "recibir", etiqueta: "Recibir mercadería", detalle: "Registra lo que llegó a la tienda", href: "/recibir" });
  if (e.enSuSede && e.veConteos) acciones.push({ clave: "contar", etiqueta: "Contar", detalle: "Cuenta lo que hay y cuadra las diferencias", href: "/inventario/conteo" });
  if (e.veTraslados) acciones.push({ clave: "trasladar", etiqueta: "Trasladar", detalle: "Envía prendas a otra sede", href: `${RUTA_NUEVO_TRASLADO}?desde=existencias` });
  if (e.enSuSede && e.vende && e.veApartados) acciones.push({ clave: "apartados", etiqueta: "Apartados", detalle: "Prendas reservadas para clientes", href: "/vender/apartados" });
  return acciones;
}
