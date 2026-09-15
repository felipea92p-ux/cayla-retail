// Reglas puras de Producción: sin Supabase, sin `next/headers`, para que las
// importen tanto la página (servidor) como los formularios (cliente) — mismo
// patrón que `vender-reglas.ts` y `compras-reglas.ts`. Lo que toca la base
// vive en `produccion.ts`.

/** Etapas por las que pasa una orden. Muestra = desarrollar el modelo, una
 *  sola vez; Producción = fabricar el lote, cada vez (decisión con Felipe,
 *  jul-2026, heredada de V1). Las claves son las que `set_etapa_produccion`
 *  acepta — cambiar una acá sin tocar la RPC rompe el botón. */
export const ETAPAS_MUESTRA = [
  { clave: "patronaje", etiqueta: "Patronaje", detalle: "Crear el molde base del modelo." },
  { clave: "muestra", etiqueta: "Muestra y aprobación", detalle: "Coser un prototipo y revisarlo antes de producir." },
  { clave: "escalado", etiqueta: "Escalado y ploteo", detalle: "Molde a todas las tallas + tizado sobre la tela." },
] as const;

export const ETAPAS_PRODUCCION = [
  { clave: "corte", etiqueta: "Corte", detalle: "Tender la tela y cortar las piezas." },
  { clave: "confeccion", etiqueta: "Confección", detalle: "Costura, ojal y botón — armar la prenda." },
  { clave: "acabado", etiqueta: "Acabados", detalle: "Planchado, limpiar hilos, control de calidad, etiqueta y empaque." },
] as const;

export type EtapaClave = (typeof ETAPAS_MUESTRA)[number]["clave"] | (typeof ETAPAS_PRODUCCION)[number]["clave"];
export type EstadoEtapa = "pendiente" | "hecho" | "tercerizado";
export type EstadoOrden = "en_proceso" | "terminada" | "anulada";

// Umbrales del semáforo — margen = precio de venta − costo directo, como % del
// precio. Alto a propósito: de ese margen salen costura, taller y utilidad
// (mano de obra fija que el costo directo no incluye). Heredado de V1.
export const UMBRAL_GANA = 0.6;
export const UMBRAL_FILO = 0.4;

export type Semaforo = { tono: "gana" | "filo" | "pierde"; margen: number };

/** null cuando no hay con qué comparar (modelo sin precio o costo en cero). */
export function semaforoMargen(precioVenta: number, costoUnitario: number): Semaforo | null {
  if (precioVenta <= 0 || costoUnitario <= 0) return null;
  const margen = (precioVenta - costoUnitario) / precioVenta;
  if (margen >= UMBRAL_GANA) return { tono: "gana", margen };
  if (margen >= UMBRAL_FILO) return { tono: "filo", margen };
  return { tono: "pierde", margen };
}

/** Costo por prenda como lo calcula la base (`producciones.costo_unitario`):
 *  costos ÷ buenas, o ÷ plan mientras no cierre. 0 sin prendas. */
export function costoUnitario(costoTela: number, costoAvios: number, costoMaquila: number, prendas: number): number {
  if (prendas <= 0) return 0;
  return Math.round(((costoTela + costoAvios + costoMaquila) / prendas) * 100) / 100;
}
