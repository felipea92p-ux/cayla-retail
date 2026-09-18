// Reglas puras de Cambios — sin `createClient`, cero dependencia de servidor, mismo
// patrón que `vender-reglas.ts`: `CambioFormV2` y `CambiosLista` son componentes
// cliente y necesitan esto como VALOR.

import { diaLima } from "./panel-serie";
//
// Por qué existe (2026-09-16): el formulario identificaba "la prenda que se vendió"
// buscando en el catálogo la primera variante con el mismo `sku`. Las prendas del censo
// (`crear_producto_con_variantes`) nacen SIN sku, y el sku nulo viajaba como "" — así
// que con dos prendas nuevas en el catálogo, "" calzaba con la PRIMERA de ellas: se
// escondía una prenda que no tenía nada que ver y la vendida aparecía como opción de
// cambio por sí misma. La identidad de una prenda es su `varianteId`; el código es solo
// lo que se lee (`codigoPrenda`, que vive en `prenda-reglas.ts` porque lo usan todos los
// flujos de venta, no solo Cambios).

/** Qué se le puede entregar a la clienta en lugar de la prenda vendida: cualquier
 *  variante que NO sea la vendida (cambiarla por sí misma no tiene sentido) y que tenga
 *  stock en esta sede — no se ofrece lo que `registrar_cambio()` va a rechazar por falta
 *  de stock, mismo criterio que el POS y "Mover mercadería" (2026-09-14). */
export function opcionesDeCambio<T extends { varianteId: string; stockAqui: number }>(
  catalogo: T[],
  varianteVendidaId: string
): T[] {
  return catalogo.filter((v) => v.varianteId !== varianteVendidaId && v.stockAqui > 0);
}

// ============================================================================
// Plazo de cambio (rediseño visual, 2026-09-18)
//
// `docs/datos/15-COMO-OPERA-CAYLA.md` R-38: "El plazo es de 15 días y lo aplica
// cualquiera en caja" — hoy es una regla escrita, no un dato: no hay columna ni
// tabla de política de cambio por sede (auditado antes de construir esto: ni
// `retail.ubicaciones` ni ninguna otra tabla la modela). Con el ok de Felipe
// (protocolo de pregunta, 2026-09-18): constantes documentadas acá, iguales para
// toda la empresa — no hay evidencia hoy de que el plazo varíe por sede, y una
// columna+migración+pantalla de configuración para un valor que nunca cambió
// sería construir para un volumen que no ha llegado (principio 5 del rol). Si
// algún día CAYLA necesita un plazo distinto por sede, este es el lugar a tocar.
// ============================================================================

/** R-38. */
export const DIAS_PLAZO_CAMBIO = 15;
/** A cuántos días de vencer el plazo el chip pasa de verde a ámbar. */
export const DIAS_UMBRAL_POR_VENCER = 3;

export type EstadoPlazoCambio = "vigente" | "por_vencer" | "fuera_de_plazo";

/** En qué punto del plazo de cambio está una venta, medido en días calendario
 *  completos desde que se vendió (no horas — una venta de ayer a las 11pm no debe
 *  leerse como "hoy mismo" solo por estar a pocas horas). */
export function estadoPlazoCambio(vendidoEn: string, ahora: Date): { estado: EstadoPlazoCambio; diasRestantes: number } {
  const diasTranscurridos = diaLima(ahora.getTime()) - diaLima(new Date(vendidoEn).getTime());
  const diasRestantes = DIAS_PLAZO_CAMBIO - diasTranscurridos;
  if (diasRestantes < 0) return { estado: "fuera_de_plazo", diasRestantes };
  if (diasRestantes <= DIAS_UMBRAL_POR_VENCER) return { estado: "por_vencer", diasRestantes };
  return { estado: "vigente", diasRestantes };
}

// ============================================================================
// Agrupado por día de la lista de Cambios (rediseño visual, 2026-09-18): "Hoy" /
// "Ayer" / fecha, en vez de una lista plana continua.
// ============================================================================

/** "Hoy" / "Ayer" / "16 de septiembre" — nunca el año: la lista solo muestra
 *  ventas recientes, un año de diferencia no es un caso real acá. */
export function etiquetaDia(vendidoEn: string, ahora: Date): string {
  const diasAtras = diaLima(ahora.getTime()) - diaLima(new Date(vendidoEn).getTime());
  if (diasAtras === 0) return "Hoy";
  if (diasAtras === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(new Date(vendidoEn));
}

/** Agrupa manteniendo el orden de llegada (ya viene de más nueva a más vieja) — un
 *  Map conserva el orden de inserción de sus claves, así que "Hoy" sale antes que
 *  "Ayer" sin ordenar nada aparte. */
export function agruparPorDia<T extends { creadoEn: string }>(lineas: readonly T[], ahora: Date): { etiqueta: string; lineas: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const l of lineas) {
    const etiqueta = etiquetaDia(l.creadoEn, ahora);
    (grupos.get(etiqueta) ?? grupos.set(etiqueta, []).get(etiqueta)!).push(l);
  }
  return Array.from(grupos, ([etiqueta, lineas]) => ({ etiqueta, lineas }));
}
